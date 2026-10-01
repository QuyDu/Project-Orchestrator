import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import * as fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import {
  MAX_DISCOVERY_AGE_DAYS, bindDiscovery, contextFingerprint, ensureDiscovery,
  inspectCachedDiscovery, inspectDiscovery, publishDiscovery, validateDiscovery
} from "../.github/skills/azure-discovery/scripts/discovery-cache.mjs";
import { azureProfile, discoveryReport, installDiscoveryPackage as installPackage, installFakeAzureCli } from "./helpers/azure-discovery-fixture.mjs";

const now = Date.parse("2026-09-25T15:00:00.000Z");
const day = 86_400_000;
const profile = azureProfile({ updatedAt: new Date(now).toISOString() });

function report(at = now) {
  return discoveryReport(profile, { discoveredAt: new Date(at).toISOString() });
}

async function fixture() {
  const project = await fs.mkdtemp(path.join(os.tmpdir(), "pso-discovery-cache-"));
  await fs.mkdir(path.join(project, ".azure"));
  await fs.writeFile(path.join(project, ".azure", "environment.json"), JSON.stringify(profile));
  return project;
}

function runPowerShell(project, script) {
  return spawnSync(process.platform === "win32" ? "powershell.exe" : "pwsh", [
    "-NoProfile", "-NonInteractive", "-EncodedCommand", Buffer.from(script, "utf16le").toString("base64")
  ], { encoding: "utf8", env: { ...process.env, PSO_DISCOVERY_FIXTURE: project } });
}

test("image quota requires exact model and SKU identity instead of another capacity bucket", () => {
  const root = path.resolve(import.meta.dirname, "..");
  const module = path.join(root, ".github", "skills", "azure-discovery", "scripts", "azure-discovery.ps1").replaceAll("'", "''");
  const result = runPowerShell(root, `
$ErrorActionPreference = 'Stop'
. '${module}'
function az { $global:LASTEXITCODE = 0; $script:usage | ConvertTo-Json -Compress }
$script:usage = @([pscustomobject]@{ name = 'OpenAI.Standard.gpt-image-1'; localizedName = 'Standard gpt-image-1 tokens'; currentValue = 0; limit = 10; unit = 'Count' })
$missingSku = Get-AzureImageQuotaSummary -Location 'fixture' -ModelName 'gpt-image-1' -SkuName 'GlobalStandard'
$script:usage = @([pscustomobject]@{ name = 'OpenAI.GlobalStandard.gpt-image-1-mini'; localizedName = 'Global Standard gpt-image-1-mini'; currentValue = 0; limit = 10; unit = 'Count' })
$wrongModel = Get-AzureImageQuotaSummary -Location 'fixture' -ModelName 'gpt-image-1' -SkuName 'GlobalStandard'
$script:usage = @([pscustomobject]@{ name = 'OpenAI.GlobalStandard.gpt-image-1'; localizedName = 'Global Standard gpt-image-1'; currentValue = 2; limit = 10; unit = 'Count' })
$exact = Get-AzureImageQuotaSummary -Location 'fixture' -ModelName 'GPT-IMAGE-1' -SkuName 'GlobalStandard'
$wrongSku = Get-AzureImageQuotaSummary -Location 'fixture' -ModelName 'gpt-image-1' -SkuName 'Standard'
@{ missingSku = $missingSku; wrongModel = $wrongModel; exact = $exact; wrongSku = $wrongSku } | ConvertTo-Json -Depth 8 -Compress
`);
  assert.equal(result.status, 0, result.stderr);
  const values = JSON.parse(result.stdout);
  for (const name of ["missingSku", "wrongModel", "wrongSku"]) {
    assert.equal(values[name].status, "unknown", name);
    assert.equal(values[name].querySucceeded, true);
    assert.equal(values[name].matchFound, false);
  }
  assert.equal(values.exact.status, "available");
  assert.equal(values.exact.matchFound, true);
  assert.equal(values.exact.currentValue, 2);
});

test("default opt-in MCP services satisfy the actual Azure profile schema", async () => {
  const root = path.resolve(import.meta.dirname, "..");
  const project = await fixture();
  try {
    const module = path.join(root, ".github", "skills", "azure-discovery", "scripts", "azure-environment.ps1").replaceAll("'", "''");
    const defaults = runPowerShell(project, `$ErrorActionPreference = 'Stop'; . '${module}'; @($script:DefaultAzureMcpServices) | ConvertTo-Json -Compress`);
    assert.equal(defaults.status, 0, defaults.stderr);
    const services = JSON.parse(defaults.stdout);
    assert.ok(services.includes("get_azure_bestpractices"));
    const candidate = azureProfile();
    candidate.cloudEndpoints = Object.fromEntries(["resourceManager", "activeDirectory", "portal", "storage", "keyVault", "cosmos", "openAI", "cognitiveServices", "speech"].map((name) => [name, "https://fixture.invalid/"]));
    candidate.mcp.enabled = true;
    candidate.mcp.services = services;
    const file = path.join(project, "candidate.json");
    const schema = path.join(root, "schemas", "azure-environment.schema.json");
    await fs.writeFile(file, JSON.stringify(candidate));
    const command = "$ErrorActionPreference='Stop'; if (-not (Test-Json -Json ([IO.File]::ReadAllText($env:PSO_MCP_CANDIDATE)) -SchemaFile $env:PSO_MCP_SCHEMA -ErrorAction Stop)) { exit 1 }; Write-Output 'schema-valid'";
    const checked = spawnSync("pwsh", ["-NoProfile", "-NonInteractive", "-EncodedCommand", Buffer.from(command, "utf16le").toString("base64")], {
      encoding: "utf8", timeout: 30000, env: { ...process.env, PSO_MCP_CANDIDATE: file, PSO_MCP_SCHEMA: schema }
    });
    assert.equal(checked.status, 0, "The emitted default service IDs must validate against the actual schema");
    const definition = JSON.parse(await fs.readFile(schema, "utf8"));
    const pattern = new RegExp(definition.properties.mcp.properties.services.items.pattern);
    for (const invalid of ["bad service", "bad;command", "../service", "--service", "service\ncommand"]) assert.equal(pattern.test(invalid), false);
  } finally {
    await fs.rm(project, { recursive: true, force: true });
  }
});

test("discovery evidence is reusable through exactly 30 days, not one millisecond longer", () => {
  assert.equal(MAX_DISCOVERY_AGE_DAYS, 30);
  const value = bindDiscovery(report(), profile, { now });
  assert.equal(value.discoveredAt, report().discoveredAt);
  assert.equal(value.expiresAt, new Date(now + 30 * day).toISOString());
  for (const age of [0, 14 * day, 29 * day, 30 * day]) {
    assert.equal(inspectDiscovery(value, profile, { now: now + age }).status, "fresh");
  }
  assert.equal(inspectDiscovery(value, profile, { now: now + 30 * day + 1 }).reason, "expired");
  assert.equal(inspectDiscovery(value, profile, { now: now - 1 }).reason, "future-dated");
});

test("discovery uses one schema for producer output, legacy reports and image summaries", () => {
  const legacy = report();
  delete legacy.imageGeneration;
  assert.deepEqual(validateDiscovery(legacy), []);
  assert.equal(inspectDiscovery(legacy, profile, { now }).reason, "unbound");
  assert.deepEqual(validateDiscovery(bindDiscovery(report(), profile, { now })), []);
  for (const value of [
    { ...report(), resourceName: "must-not-be-persisted" },
    { ...report(), discoveredAt: "2026-02-30T00:00:00.000Z" },
    { ...report(), discoveredAt: "not-a-date" },
    { ...report(), constructor: "not-a-schema-field" },
    { ...report(), speech: { ...report().speech, existingResourceCount: 1 } },
    { ...report(), imageGeneration: { ...report().imageGeneration, available: true } }
  ]) assert.ok(validateDiscovery(value).length, "invalid discovery must fail its owned schema");
  const bound = bindDiscovery(report(), profile, { now });
  assert.equal(inspectDiscovery({ ...bound, expiresAt: new Date(now + 31 * day).toISOString() }, profile, { now }).reason, "invalid-expiry");
  assert.throws(() => bindDiscovery(legacy, profile, { now }), /imageGeneration/);
});

test("cache identity binds cloud, tenant, subscription, region and preferences without exposing them", () => {
  const fingerprint = contextFingerprint(profile);
  assert.match(fingerprint, /^[a-f0-9]{64}$/);
  const value = bindDiscovery(report(), profile, { now });
  for (const changed of [
    { ...profile, cloud: "AzureUSGovernment" },
    { ...profile, location: "westus" },
    { ...profile, subscription: { ...profile.subscription, tenantId: "different-tenant" } },
    { ...profile, subscription: { ...profile.subscription, subscriptionId: "different-subscription" } }
  ]) assert.equal(inspectDiscovery(value, changed, { now }).reason, "context-mismatch");
  assert.equal(inspectDiscovery(value, profile, { now, preferModel: "gpt-4.1" }).reason, "context-mismatch");
  assert.equal(contextFingerprint(profile, { preferModel: "GPT-4.1" }), contextFingerprint(profile, { preferModel: "gpt-4.1" }));
  assert.throws(() => contextFingerprint({ ...profile, subscription: {} }), /subscription|tenant/i);
  assert.throws(() => contextFingerprint(profile, { preferModel: "gpt' || true" }), /model/i);
  const serialized = JSON.stringify(value);
  for (const identifier of Object.values(profile.subscription)) assert.ok(!serialized.includes(identifier));
});

test("fresh cache is read-only; missing, malformed and expired caches refresh once", async () => {
  const project = await fixture();
  try {
    let calls = 0;
    const refresh = async () => {
      calls += 1;
      await publishDiscovery(project, report(), { now });
    };
    assert.equal((await inspectCachedDiscovery(project, { now })).reason, "missing");
    const first = await ensureDiscovery(project, { now }, refresh);
    assert.equal(calls, 1);
    assert.equal(first.contextSha256, contextFingerprint(profile));
    const json = path.join(project, "reports", "azure-discovery.json");
    const markdown = path.join(project, "reports", "azure-discovery.md");
    const before = await Promise.all([fs.readFile(json), fs.readFile(markdown), fs.stat(json)]);
    await ensureDiscovery(project, { now: now + 30 * day }, refresh);
    assert.equal(calls, 1);
    assert.deepEqual(await fs.readFile(json), before[0]);
    assert.deepEqual(await fs.readFile(markdown), before[1]);
    assert.equal((await fs.stat(json)).mtimeMs, before[2].mtimeMs);
    await publishDiscovery(project, report(now - 31 * day), { now: now - 31 * day });
    await Promise.all([ensureDiscovery(project, { now }, refresh), ensureDiscovery(project, { now }, refresh)]);
    assert.equal(calls, 2, "concurrent callers must share one refresh");
    await fs.writeFile(json, "{broken");
    assert.equal((await inspectCachedDiscovery(project, { now })).reason, "malformed");
    await ensureDiscovery(project, { now }, refresh);
    assert.equal(calls, 3);
    await fs.rm(markdown);
    assert.equal((await inspectCachedDiscovery(project, { now })).reason, "incomplete");
    await ensureDiscovery(project, { now }, refresh);
    assert.equal(calls, 4);
    assert.match(await fs.readFile(markdown, "utf8"), new RegExp(first.discoveredAt.replaceAll(".", "\\.")));
  } finally {
    await fs.rm(project, { recursive: true, force: true });
  }
});

test("refresh errors and invalid replacements preserve the previous report and never return stale success", async () => {
  const project = await fixture();
  try {
    await publishDiscovery(project, report(now - 31 * day), { now: now - 31 * day });
    const file = path.join(project, "reports", "azure-discovery.json");
    const before = await fs.readFile(file);
    await assert.rejects(ensureDiscovery(project, { now }, async () => { throw new Error("Offline discovery failed"); }), /Offline discovery failed/);
    await assert.rejects(ensureDiscovery(project, { now }, async () => {}), /refresh.*expired/i);
    await assert.rejects(publishDiscovery(project, { ...report(), secret: "unapproved" }, { now }), /invalid/i);
    await assert.rejects(publishDiscovery(project, report(now + 1), { now }), /future/i);
    await assert.rejects(publishDiscovery(project, report(now - 31 * day), { now }), /expired/i);
    assert.deepEqual(await fs.readFile(file), before);
  } finally {
    await fs.rm(project, { recursive: true, force: true });
  }
});

test("pair publication rolls back a failed replacement and rejects unsafe output paths", async () => {
  const project = await fixture();
  try {
    await publishDiscovery(project, report(now - day), { now });
    const directory = path.join(project, "reports");
    const json = path.join(directory, "azure-discovery.json");
    const md = path.join(directory, "azure-discovery.md");
    const before = await Promise.all([fs.readFile(json), fs.readFile(md)]);
    let failed = false;
    const operations = {
      ...fs,
      async rename(from, to) {
        if (!failed && to === json && from.endsWith(".partial")) {
          failed = true;
          throw new Error("Injected publication failure");
        }
        return fs.rename(from, to);
      }
    };
    await assert.rejects(publishDiscovery(project, report(), { now }, operations), /Injected publication failure/);
    assert.equal(failed, true);
    assert.deepEqual(await Promise.all([fs.readFile(json), fs.readFile(md)]), before);
    assert.deepEqual((await fs.readdir(directory)).sort(), ["azure-discovery.json", "azure-discovery.md"]);
    await assert.rejects(publishDiscovery(project, report(), { now, outputPath: "..\\outside.json" }), /inside|escape/i);
    await assert.rejects(publishDiscovery(project, report(), { now, outputPath: "reports\\wrong.md" }), /\.json/);
    const profileBefore = await fs.readFile(path.join(project, ".azure", "environment.json"));
    await assert.rejects(publishDiscovery(project, report(), { now, outputPath: path.join(".azure", "environment.json") }), /reports directory/);
    assert.deepEqual(await fs.readFile(path.join(project, ".azure", "environment.json")), profileBefore);
    await publishDiscovery(project, report(), { now, outputPath: path.join("reports", "custom", "discovery.json") });
    assert.equal((await inspectCachedDiscovery(project, { now, outputPath: path.join("reports", "custom", "discovery.json") })).status, "fresh");
  } finally {
    await fs.rm(project, { recursive: true, force: true });
  }
});

test("the infrastructure wrappers load the canonical package and retain offline cached behavior", async () => {
  const project = await fixture();
  try {
    await installPackage(project);
    const liveNow = Date.now();
    await publishDiscovery(project, report(liveNow), { now: liveNow });
    const script = `
$ErrorActionPreference = 'Stop'
. (Join-Path $env:PSO_DISCOVERY_FIXTURE 'infra\\azure-environment.ps1')
. (Join-Path $env:PSO_DISCOVERY_FIXTURE 'infra\\discover.ps1')
function global:az { throw 'Unexpected Azure call in a cache hit' }
$value = Invoke-AzureDiscovery
Write-Output ('RESULT:' + ($value | ConvertTo-Json -Depth 10 -Compress))
`;
    const result = runPowerShell(project, script);
    assert.equal(result.status, 0, `${result.error?.message ?? ""}\n${result.stderr}\n${result.stdout}`);
    const value = JSON.parse(result.stdout.match(/^RESULT:(.+)\r?$/m)?.[1] ?? "{}");
    assert.equal(value.contextSha256, contextFingerprint(profile));
    assert.equal(Date.parse(value.discoveredAt), liveNow);
  } finally {
    await fs.rm(project, { recursive: true, force: true });
  }
});

test("the real PowerShell producer persists by default, reuses its cache and preserves it on query failure", async () => {
  const project = await fixture();
  try {
    await installPackage(project);
    const script = `
$ErrorActionPreference = 'Continue'
. (Join-Path $env:PSO_DISCOVERY_FIXTURE 'infra\\discover.ps1')
function Initialize-AzureEnvironmentProfile { return (Read-AzureEnvironmentProfile) }
function Connect-AzureEnvironment { return [pscustomobject]@{ id = 'offline'; tenantId = 'offline' } }
$global:queryCount = 0
function global:az {
    $global:queryCount += 1
    $global:LASTEXITCODE = 0
    return '[]'
}
$value = Invoke-AzureDiscovery
$initialQueries = $global:queryCount
$cached = Invoke-AzureDiscovery
$file = Join-Path $env:PSO_DISCOVERY_FIXTURE 'reports\\azure-discovery.json'
$before = [IO.File]::ReadAllText($file)
function global:az { $global:LASTEXITCODE = 7; return '[]' }
$failed = $false
try { Invoke-AzureDiscovery -Refresh | Out-Null } catch { $failed = $true }
function global:az { $global:LASTEXITCODE = 0; return 'not-json' }
$malformedFailed = $false
try { Invoke-AzureDiscovery -Refresh | Out-Null } catch { $malformedFailed = $true }
Write-Output ('RESULT:' + (@{
    report = $value
    initialQueries = $initialQueries
    queriesAfterReuse = $global:queryCount
    failed = $failed
    malformedFailed = $malformedFailed
    retained = ($before -ceq [IO.File]::ReadAllText($file))
} | ConvertTo-Json -Depth 10 -Compress))
`;
    const result = runPowerShell(project, script);
    assert.equal(result.status, 0, `${result.error?.message ?? ""}\n${result.stderr}\n${result.stdout}`);
    const outcome = JSON.parse(result.stdout.match(/^RESULT:(.+)\r?$/m)?.[1] ?? "{}");
    assert.ok(outcome.initialQueries > 0);
    assert.equal(outcome.queriesAfterReuse, outcome.initialQueries);
    assert.equal(outcome.failed, true);
    assert.equal(outcome.malformedFailed, true);
    assert.equal(outcome.retained, true);
    assert.equal(outcome.report.cognitiveAvailable, false);
    assert.equal(outcome.report.openAIAvailable, false);
    assert.equal(outcome.report.speech.existingResourceCount, 0);
    assert.equal(outcome.report.contextSha256, contextFingerprint(profile));
    assert.equal((await inspectCachedDiscovery(project)).status, "fresh");
    const serialized = await fs.readFile(path.join(project, "reports", "azure-discovery.json"), "utf8");
    for (const identifier of Object.values(profile.subscription)) assert.ok(!serialized.includes(identifier));
  } finally {
    await fs.rm(project, { recursive: true, force: true });
  }
});

test("in-flight publication and linked output directories fail closed without modifying other files", async () => {
  const project = await fixture();
  const outside = await fs.mkdtemp(path.join(os.tmpdir(), "pso-discovery-outside-"));
  try {
    await publishDiscovery(project, report(), { now });
    const lock = path.join(project, "reports", "azure-discovery.json.lock");
    await fs.writeFile(lock, "another writer", { flag: "wx" });
    await assert.rejects(inspectCachedDiscovery(project, { now }), /in progress/);
    await assert.rejects(publishDiscovery(project, report(), { now }), /in progress/);
    assert.equal(await fs.readFile(lock, "utf8"), "another writer");
    await fs.rm(lock);
    await fs.symlink(outside, path.join(project, "linked-output"), process.platform === "win32" ? "junction" : "dir");
    await assert.rejects(publishDiscovery(project, report(), { now, outputPath: path.join("linked-output", "azure-discovery.json") }), /symbolic links/);
    assert.deepEqual(await fs.readdir(outside), []);
  } finally {
    await fs.rm(project, { recursive: true, force: true });
    await fs.rm(outside, { recursive: true, force: true });
  }
});

test("first-time discovery binds the context selected by initialization, not an earlier default", async () => {
  const project = await fixture();
  const selected = { ...profile, cloud: "AzureUSGovernment", location: "usgovvirginia" };
  try {
    await installPackage(project);
    await fs.rename(path.join(project, ".azure", "environment.json"), path.join(project, ".azure", "fixture-seed.json"));
    await fs.writeFile(path.join(project, ".azure", "fixture-seed.json"), JSON.stringify(selected));
    const result = runPowerShell(project, `
$ErrorActionPreference = 'Stop'
. (Join-Path $env:PSO_DISCOVERY_FIXTURE 'infra\\discover.ps1')
function Initialize-AzureEnvironmentProfile {
    $seed = Join-Path $env:PSO_DISCOVERY_FIXTURE '.azure\\fixture-seed.json'
    Copy-Item $seed (Get-AzureEnvironmentProfilePath)
    return (Read-AzureEnvironmentProfile)
}
function Connect-AzureEnvironment { return [pscustomobject]@{ id = 'offline'; tenantId = 'offline' } }
function global:az { $global:LASTEXITCODE = 0; return '[]' }
$value = Invoke-AzureDiscovery -InteractiveSetup
Write-Output ('RESULT:' + ($value | ConvertTo-Json -Depth 10 -Compress))
`);
    assert.equal(result.status, 0, `${result.error?.message ?? ""}\n${result.stderr}\n${result.stdout}`);
    const outcome = JSON.parse(result.stdout.match(/^RESULT:(.+)\r?$/m)?.[1] ?? "{}");
    assert.equal(outcome.cloud, selected.cloud);
    assert.equal(outcome.location, selected.location);
    assert.equal(outcome.contextSha256, contextFingerprint(selected));
    assert.equal((await inspectCachedDiscovery(project)).status, "fresh");
  } finally {
    await fs.rm(project, { recursive: true, force: true });
  }
});

test("future unsupported schema vocabulary fails closed instead of silently weakening validation", async () => {
  const project = await fixture();
  try {
    await installPackage(project);
    const schemaFile = path.join(project, "schemas", "azure-discovery.schema.json");
    const changed = JSON.parse(await fs.readFile(schemaFile, "utf8"));
    changed.oneOf = [{ not: {} }];
    await fs.writeFile(schemaFile, JSON.stringify(changed));
    const helper = path.join(project, ".github", "skills", "azure-discovery", "scripts", "discovery-cache.mjs");
    const result = spawnSync(process.execPath, [helper, "inspect", "--root", project], { encoding: "utf8" });
    assert.notEqual(result.status, 0);
    assert.match(result.stderr, /Unsupported discovery schema keyword: oneOf/);
  } finally {
    await fs.rm(project, { recursive: true, force: true });
  }
});

test("ensure dispatches the packaged PowerShell owner on a miss and makes no Azure calls on reuse", async () => {
  const project = await fixture();
  try {
    await installPackage(project);
    const { env: environment, log } = await installFakeAzureCli(project, { profile, report: report() });
    const helper = path.join(project, ".github", "skills", "azure-discovery", "scripts", "discovery-cache.mjs");
    const run = () => spawnSync(process.execPath, [helper, "ensure", "--root", project], { encoding: "utf8", env: environment });
    const first = run();
    assert.equal(first.status, 0, `${first.error?.message ?? ""}\n${first.stderr}\n${first.stdout}`);
    const bound = JSON.parse(first.stdout);
    assert.equal(bound.contextSha256, contextFingerprint(profile));
    assert.equal(inspectDiscovery(bound, profile).status, "fresh");
    const calls = await fs.readFile(log, "utf8");
    assert.match(calls, /cognitiveservices model list/);
    const second = run();
    assert.equal(second.status, 0, second.stderr);
    assert.deepEqual(JSON.parse(second.stdout), bound);
    assert.equal(await fs.readFile(log, "utf8"), calls);
    const updatedProfile = JSON.parse((await fs.readFile(path.join(project, ".azure", "environment.json"), "utf8")).replace(/^\uFEFF/, ""));
    assert.equal(updatedProfile.mcp.enabled, false);
    assert.equal(updatedProfile.mcp.foundryExtensions.enabled, false);
  } finally {
    await fs.rm(project, { recursive: true, force: true });
  }
});
