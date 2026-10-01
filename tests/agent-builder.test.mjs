import assert from "node:assert/strict";
import { createHash, randomBytes } from "node:crypto";
import { chmod, copyFile, link, mkdir, mkdtemp, readFile, readdir, rm, symlink, writeFile } from "node:fs/promises";
import { existsSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import { spawnSync } from "node:child_process";
import { pathToFileURL } from "node:url";
import test from "node:test";

const root = path.resolve(import.meta.dirname, "..");
const builder = path.join(root, ".github", "skills", "agent-builder", "scripts", "agent-builder.mjs");
const runtime = path.join(root, "pso.mjs");
const deploymentGuide = ".github/skills/agent-builder/references/deployment-handoff.md";
const nativeModule = path.join(path.dirname(builder), "native-studio.mjs");
const nativeGuidePath = ".github/instructions/copilot-studio.instructions.md";
const nativeScope = "copilot-studio/**,**/*.mcs.yml,**/*.mcs.yaml,scripts/*studio*.ts,tests/studio-*.test.ts";
const nativeGuide = `---\nname: "Copilot Studio Agent Delivery"\ndescription: "Use when authoring native Copilot Studio agents."\napplyTo: "${nativeScope}"\n---\n\n# Native Studio\n\nLocal preparation never authorizes deployment.\n`;
const approvalGates = [
  "purchase-or-payment",
  "booking-or-external-commitment",
  "provider-contact-or-message",
  "account-identity-or-security-change",
  "sensitive-data-disclosure",
  "destructive-or-irreversible-action"
];

function run(project, command, blueprint, extra = []) {
  return spawnSync(process.execPath, [builder, command, "--project", project, "--blueprint", blueprint, ...extra], {
    cwd: root,
    encoding: "utf8"
  });
}

function runRuntime(project, command, blueprint, extra = []) {
  return spawnSync(process.execPath, [runtime, "agent", command, "--project", project, "--blueprint", blueprint, ...extra], {
    cwd: root,
    encoding: "utf8"
  });
}

function runRuntimeBuild(project, extra = [], environment = {}) {
  return spawnSync(process.execPath, [runtime, "agent", "build", "--project", project, ...extra], {
    cwd: root,
    encoding: "utf8",
    env: { ...process.env, ...environment }
  });
}

function buildParameters(overrides = []) {
  return [
    "--type", "copilot",
    "--id", "accessibility-reviewer",
    "--name", "Accessibility Reviewer",
    "--description", "Use when reviewing interfaces for accessibility defects and actionable WCAG improvements.",
    "--purpose", "Review repository evidence and report accessibility defects without changing project files.",
    "--risk", "read-only",
    "--capabilities", "read,search",
    "--user-invocable", "true",
    "--model-invocable", "true",
    "--constraints", "Do not modify files or execute commands during accessibility review.",
    "--approach", "Inspect interface source and existing accessibility test evidence.|Report concrete findings with locations, impact, and suggested remediation.",
    "--output-format", "Return severity-ordered findings followed by unassessed scope and validation gaps.",
    "--subagents", "none",
    "--handoffs-file", "none",
    ...overrides
  ];
}

function blueprint(overrides = {}) {
  return {
    schemaVersion: "1.0.0",
    id: "accessibility-reviewer",
    name: "Accessibility Reviewer",
    description: "Use when reviewing interfaces for accessibility defects and actionable WCAG improvements.",
    purpose: "Review repository evidence and report accessibility defects without changing project files.",
    risk: "read-only",
    capabilities: ["search", "read"],
    invocation: { userInvocable: true, modelInvocable: true },
    instructions: {
      constraints: ["Do not modify files or execute commands during accessibility review."],
      approach: [
        "Inspect interface source and existing accessibility test evidence.",
        "Report concrete findings with locations, impact, and suggested remediation."
      ],
      outputFormat: "Return severity-ordered findings followed by unassessed scope and validation gaps."
    },
    subagents: [],
    handoffs: [],
    ...overrides
  };
}

async function fixture() {
  const project = await mkdtemp(path.join(os.tmpdir(), "pso-agent-builder-fixture-"));
  await mkdir(path.join(project, ".github", "agents"), { recursive: true });
  await mkdir(path.join(project, "reports"));
  const blueprintPath = path.join(project, "accessibility-reviewer.blueprint.json");
  await writeFile(blueprintPath, `${JSON.stringify(blueprint(), null, 2)}\n`, "utf8");
  return { project, blueprintPath };
}

test("Agent Builder copy-only installation imports, renders, normalizes and validates legacy blueprints without native files", async () => {
  const { project, blueprintPath } = await fixture();
  try {
    const installed = path.join(project, "agent-builder.mjs");
    await copyFile(builder, installed);
    const originals = await import(pathToFileURL(builder).href);
    const candidates = ["1.0.0", "2.0.0", "2.1.0", "2.2.0", "2.3.0"].map((schemaVersion) => blueprint({
      schemaVersion,
      ...(schemaVersion === "1.0.0" ? {} : { agentType: "copilot" }),
      ...(["2.1.0", "2.2.0", "2.3.0"].includes(schemaVersion)
        ? { autonomy: { mode: "guided", approvalRequiredFor: approvalGates, webSafety: "standard" } } : {}),
      ...(schemaVersion === "2.2.0" ? {
        agentType: "foundry-prompt",
        azure: { required: true, cloud: "AzureCloud", location: "eastus", environmentName: "development", authenticationMethod: "interactive", subscriptionConfigured: false },
        publication: { targets: ["foundry-endpoint"], versionPolicy: "pinned" }
      } : {}),
      ...(schemaVersion === "2.3.0" ? {
        agentType: "portable",
        distribution: { targets: ["copilot-studio", "openai-api-application"], versionPolicy: "pinned", environment: "development", dataBoundary: "organization" }
      } : {})
    }));
    const expected = candidates.map((candidate) => ({
      rendered: originals.renderAgent(candidate),
      distribution: originals.normalizeDistribution(candidate)
    }));
    const code = `
      import assert from "node:assert/strict";
      import fs from "node:fs";
      import fsp from "node:fs/promises";
      import cp from "node:child_process";
      import { syncBuiltinESMExports } from "node:module";
      const denied = () => { throw new Error("Unexpected IO from a pure builder import or API"); };
      for (const name of ["readFileSync", "readFile", "statSync", "lstatSync", "readdirSync"]) fs[name] = denied;
      for (const name of ["readFile", "open", "stat", "lstat", "readdir"]) fsp[name] = denied;
      cp.spawnSync = denied;
      syncBuiltinESMExports();
      const { validateBlueprint, renderAgent, normalizeDistribution } = await import(${JSON.stringify(pathToFileURL(installed).href)});
      const candidates = ${JSON.stringify(candidates)};
      const expected = ${JSON.stringify(expected)};
      for (const [index, candidate] of candidates.entries()) {
        const before = JSON.stringify(candidate);
        assert.equal(validateBlueprint(candidate), candidate, "validation must remain synchronous and preserve object identity");
        const rendered = renderAgent(candidate);
        assert.equal(typeof rendered, "string", "rendering must not return a Promise");
        assert.equal(rendered, expected[index].rendered);
        assert.deepEqual(normalizeDistribution(candidate), expected[index].distribution);
        assert.equal(JSON.stringify(candidate), before, "pure legacy APIs must not rewrite source");
      }
      const native = { schemaVersion: "3.0.0", agentType: "copilot-studio", id: "native-reviewer", name: "Native Reviewer",
        nativeSpec: { path: "native-spec.json", sha256: "a".repeat(64) },
        guide: { path: ${JSON.stringify(nativeGuidePath)}, sha256: "b".repeat(64) } };
      assert.equal(validateBlueprint(native), native);
      assert.equal(normalizeDistribution(native), null);
      assert.throws(() => renderAgent(native), /Native|native/);
      console.log("copy-only legacy APIs are synchronous and pure");
    `;
    const imported = spawnSync(process.execPath, ["--input-type=module", "-e", code], { cwd: project, encoding: "utf8" });
    assert.equal(imported.status, 0, imported.stderr);
    assert.equal(imported.stdout.trim(), "copy-only legacy APIs are synchronous and pure");
    assert.equal(imported.stderr, "");
    assert.equal(existsSync(path.join(project, "native-studio.mjs")), false);
    assert.equal(existsSync(path.join(project, "schemas")), false);
    for (const candidate of candidates) {
      await writeFile(blueprintPath, JSON.stringify(candidate));
      const validated = spawnSync(process.execPath, [installed, "validate", "--project", project, "--blueprint", blueprintPath, "--json"], { cwd: project, encoding: "utf8" });
      assert.equal(validated.status, 0, `${candidate.schemaVersion}: ${validated.stderr}`);
      assert.deepEqual(JSON.parse(validated.stdout), { status: "valid", id: candidate.id });
    }
    await writeFile(path.join(project, "native-studio.mjs"), 'throw new Error("Native module must not load for classic work");\n');
    const nativeNotLoaded = spawnSync(process.execPath, ["--input-type=module", "-e", code], { cwd: project, encoding: "utf8" });
    assert.equal(nativeNotLoaded.status, 0, nativeNotLoaded.stderr);
    const classicCommand = spawnSync(process.execPath, [installed, "validate", "--project", project, "--blueprint", blueprintPath, "--json"], { cwd: project, encoding: "utf8" });
    assert.equal(classicCommand.status, 0, classicCommand.stderr);
  } finally { await rm(project, { recursive: true, force: true }); }
});

function observation(state = "unknown", evidence = []) {
  return { state, evidence, detail: "Not verified against the intended native runtime." };
}

function nativeHandoff() {
  const ref = { path: "copilot-studio/native-reviewer/topics/greeting.mcs.yml", sha256: "a".repeat(64) };
  return {
    schemaVersion: "1.0.0",
    runtime: "native-copilot-studio",
    intent: { agent: "new", operation: "prepare", owner: "agent-deployment" },
    agent: { id: "native-reviewer", name: "Native Reviewer", schemaName: "pso_nativeReviewer", publisherPrefix: "pso" },
    target: {
      cloud: "unknown", tenant: observation(), environment: observation(), dataverse: observation(), bot: observation(),
      solution: { uniqueName: null, readiness: observation() }
    },
    security: {
      authentication: "microsoft-single-tenant", audience: "private", channels: ["teams"],
      toolIdentity: "invoker", policy: observation(), requirements: ["Preserve required user authentication."]
    },
    capabilities: [{
      id: "greeting", scope: "required", description: "Respond with a static native greeting.",
      sourcePaths: ["copilot-studio/native-reviewer/topics/greeting.mcs.yml"],
      implementation: observation("pending"),
      acceptance: { ...observation(), criteria: ["Start a fresh conversation and receive the greeting."] },
      persistence: { mode: "none", operations: [], ...observation("not-requested") },
      gaps: ["Native acceptance has not run."]
    }],
    artifacts: {
      guide: { path: nativeGuidePath, sha256: "b".repeat(64) },
      spec: { path: "native-spec.json", sha256: "c".repeat(64) },
      authored: [ref], connectedDirectory: null,
      solutionMembership: { ...observation(), components: [], missing: [] },
      recovery: { ...observation("pending"), artifacts: [], procedure: ["Preserve the original source."] }
    },
    approvals: Object.fromEntries(["localMutation", "draft", "publication", "sharing", "cost", "security", "destructive"].map((key) => [key, observation("not-requested")])),
    evidence: Object.fromEntries(["authored", "localValidation", "synchronized", "imported", "provisioned", "evaluated", "publicationSubmitted", "serverPublished", "channelVerified"].map((key) => [key, observation()])),
    complete: false,
    gaps: ["No server, evaluation or channel evidence."]
  };
}

test("Native Studio handoff validator is pure, strict, and never treats absent evidence as completion", async () => {
  const { validateNativeStudioHandoff } = await import(pathToFileURL(nativeModule).href);
  const handoff = nativeHandoff();
  const before = JSON.stringify(handoff);
  assert.equal(validateNativeStudioHandoff(handoff), handoff);
  assert.equal(JSON.stringify(handoff), before);
  for (const mutate of [
    (value) => { value.runtime = "github-copilot"; },
    (value) => { value.target.environmentId = "made-up-id"; },
    (value) => { value.target.bot.state = "verified"; },
    (value) => { delete value.evidence.evaluated; },
    (value) => { value.complete = true; },
    (value) => { value.artifacts.guide.path = "../other-guide.md"; },
    (value) => { value.capabilities[0].implementation.state = "complete"; },
    (value) => { value.capabilities[0].persistence.mode = "Connected"; },
    (value) => { value.security.authentication = "none"; }
  ]) {
    const invalid = structuredClone(handoff);
    mutate(invalid);
    assert.throws(() => validateNativeStudioHandoff(invalid));
  }
  const imported = spawnSync(process.execPath, ["--input-type=module", "-e",
    `import * as fs from 'node:fs';import * as fsp from 'node:fs/promises';import cp from 'node:child_process';import {syncBuiltinESMExports} from 'node:module';fs.default.readFileSync=()=>{throw Error('Unexpected sync filesystem access')};fsp.default.readFile=()=>{throw Error('Unexpected async filesystem access')};cp.spawnSync=()=>{throw Error('Unexpected CLI execution')};syncBuiltinESMExports();await import(${JSON.stringify(pathToFileURL(nativeModule).href)});`
  ], { cwd: root, encoding: "utf8" });
  assert.equal(imported.status, 0, imported.stderr);
  assert.equal(imported.stdout, "");
});

test("Native Studio pure helpers load independently without a reverse builder import", async () => {
  const project = await mkdtemp(path.join(os.tmpdir(), "pso-native-schema-fixture-"));
  try {
    const copied = path.join(project, "native-studio.mjs");
    await copyFile(nativeModule, copied);
    const value = nativeHandoff();
    const imported = spawnSync(process.execPath, ["--input-type=module", "-e", `
      import assert from "node:assert/strict";
      import fs from "node:fs";
      import fsp from "node:fs/promises";
      import cp from "node:child_process";
      import { syncBuiltinESMExports } from "node:module";
      fs.readFileSync = fsp.readFile = cp.spawnSync = () => { throw new Error("Unexpected pure helper IO"); };
      syncBuiltinESMExports();
      const helper = await import(${JSON.stringify(pathToFileURL(copied).href)});
      const candidate = ${JSON.stringify(value)};
      assert.equal(helper.validateNativeStudioHandoff(candidate), candidate);
    `], { cwd: project, encoding: "utf8" });
    assert.equal(imported.status, 0, imported.stderr);
    assert.equal(imported.stdout, "");
    assert.equal(existsSync(path.join(project, "agent-builder.mjs")), false);
    assert.equal(existsSync(path.join(project, "schemas")), false);
  } finally { await rm(project, { recursive: true, force: true }); }
});

test("Native Studio complete cannot omit security, read-back, approval or recovery evidence", async () => {
  const { validateNativeStudioHandoff } = await import(pathToFileURL(nativeModule).href);
  const candidate = nativeHandoff();
  const proof = [{ path: "evidence/observations.json", sha256: "d".repeat(64) }];
  candidate.target.cloud = "Public";
  for (const key of ["tenant", "environment", "dataverse", "bot"]) candidate.target[key] = observation("verified", proof);
  candidate.security.policy = observation("verified", proof);
  for (const key of ["authored", "localValidation", "evaluated", "serverPublished", "channelVerified"]) candidate.evidence[key] = observation("verified", proof);
  candidate.capabilities[0].implementation = observation("verified", proof);
  candidate.capabilities[0].acceptance = { ...observation("verified", proof), criteria: ["Respond correctly in the intended channel."] };
  candidate.capabilities[0].gaps = [];
  candidate.gaps = [];
  candidate.complete = true;
  assert.throws(() => validateNativeStudioHandoff(candidate), /complete|completion|evidence|approval|recovery/i);
  for (const key of ["synchronized", "provisioned", "publicationSubmitted"]) candidate.evidence[key] = observation("verified", proof);
  for (const key of ["localMutation", "publication"]) candidate.approvals[key] = observation("verified", proof);
  candidate.artifacts.recovery = { ...observation("verified", proof), artifacts: candidate.artifacts.authored, procedure: ["Restore the independently verified source and server content under separate approval."] };
  assert.equal(validateNativeStudioHandoff(candidate), candidate);
  for (const mutate of [
    (value) => { value.security.authentication = "unknown"; },
    (value) => { value.security.channels = []; },
    (value) => { value.capabilities[0].persistence.mode = "unknown"; },
    (value) => { value.capabilities[0].persistence = { ...observation(), mode: "session", operations: [] }; },
    (value) => { value.target.solution.uniqueName = "unverified_solution"; },
    (value) => { value.approvals.publication = observation("not-requested"); }
  ]) {
    const incomplete = structuredClone(candidate);
    mutate(incomplete);
    assert.throws(() => validateNativeStudioHandoff(incomplete), /completion|evidence|approval|recovery/i);
  }
});

function assertSchemaShape(schema, location = "$", document = schema) {
  assert.ok(typeof schema === "boolean" || (schema && typeof schema === "object" && !Array.isArray(schema)),
    `${location} must be a schema object or boolean, never an array`);
  if (typeof schema === "boolean") return;
  const composites = ["allOf", "anyOf", "oneOf"];
  const singles = ["if", "then", "else", "not", "items", "contains", "additionalProperties", "unevaluatedProperties", "propertyNames"];
  const maps = ["properties", "$defs", "patternProperties", "dependentSchemas"];
  const strings = ["$schema", "$id", "$ref", "$comment", "title", "description", "format", "pattern"];
  const sizes = ["minLength", "maxLength", "minItems", "maxItems", "minProperties", "maxProperties", "minContains", "maxContains"];
  const known = new Set([...composites, ...singles, ...maps, ...strings, ...sizes, "type", "required", "const", "enum", "uniqueItems"]);
  for (const key of Object.keys(schema)) assert.ok(known.has(key), `${location}.${key} is an unexamined schema keyword`);
  for (const key of maps) {
    if (!Object.hasOwn(schema, key)) continue;
    assert.ok(schema[key] && typeof schema[key] === "object" && !Array.isArray(schema[key]), `${location}.${key} must be a schema map`);
    for (const [name, child] of Object.entries(schema[key])) {
      assertSchemaShape(child, `${location}.${key}.${name}`, document);
      if (key === "properties") assert.ok(![...composites, "if", "then", "else", "not", "$defs", "$ref"].includes(name),
        `${location}.${key}.${name} is a misplaced schema keyword, not a handoff field`);
    }
  }
  for (const key of composites) {
    if (!Object.hasOwn(schema, key)) continue;
    assert.ok(Array.isArray(schema[key]) && schema[key].length > 0, `${location}.${key} must contain schemas`);
    schema[key].forEach((child, index) => assertSchemaShape(child, `${location}.${key}[${index}]`, document));
  }
  for (const key of singles) if (Object.hasOwn(schema, key)) assertSchemaShape(schema[key], `${location}.${key}`, document);
  for (const key of strings) if (Object.hasOwn(schema, key)) assert.equal(typeof schema[key], "string", `${location}.${key}`);
  for (const key of sizes) if (Object.hasOwn(schema, key)) assert.ok(Number.isInteger(schema[key]) && schema[key] >= 0, `${location}.${key}`);
  if (Object.hasOwn(schema, "type")) {
    const types = Array.isArray(schema.type) ? schema.type : [schema.type];
    assert.ok(types.length > 0 && new Set(types).size === types.length, `${location}.type`);
    for (const type of types) assert.ok(["object", "array", "string", "boolean", "null", "number", "integer"].includes(type), `${location}.type`);
  }
  if (Object.hasOwn(schema, "required")) {
    assert.ok(Array.isArray(schema.required), `${location}.required`);
    assert.equal(new Set(schema.required).size, schema.required.length, `${location}.required must be unique`);
    schema.required.forEach((key) => assert.equal(typeof key, "string", `${location}.required`));
  }
  if (Object.hasOwn(schema, "enum")) assert.ok(Array.isArray(schema.enum) && schema.enum.length > 0, `${location}.enum`);
  if (Object.hasOwn(schema, "uniqueItems")) assert.equal(typeof schema.uniqueItems, "boolean", `${location}.uniqueItems`);
  if (schema.pattern) assert.doesNotThrow(() => new RegExp(schema.pattern), `${location}.pattern`);
  if (schema.$ref?.startsWith("#/")) {
    const target = schema.$ref.slice(2).split("/").reduce((node, key) => node?.[key.replaceAll("~1", "/").replaceAll("~0", "~")], document);
    assert.ok(typeof target === "boolean" || (target && typeof target === "object" && !Array.isArray(target)), `${location} has an unresolved local reference`);
  }
}

async function assertActualBuilderSchemas(cases) {
  const names = ["agent-blueprint.schema.json", "agent-builder-plan.schema.json", "agent-builder-result.schema.json", "copilot-studio-handoff.schema.json"];
  const documents = Object.fromEntries(await Promise.all(names.map(async (name) =>
    [name, JSON.parse(await readFile(path.join(root, "schemas", name), "utf8"))])));
  const rewrite = (value, source) => {
    if (Array.isArray(value)) return value.map((item) => rewrite(item, source));
    if (!value || typeof value !== "object") return value;
    const output = {};
    for (const [key, child] of Object.entries(value)) {
      if (key === "$id" && typeof child === "string") continue;
      if (key === "$ref" && typeof child === "string") {
        const [file, fragment = ""] = child.split("#");
        const target = file || source;
        assert.ok(Object.hasOwn(documents, target), `Schema reference must resolve offline: ${child}`);
        assert.ok(!fragment || fragment.startsWith("/"), `Unsupported schema anchor: ${child}`);
        output[key] = `#/$defs/${target}${fragment}`;
      } else output[key] = ["const", "enum", "default", "examples"].includes(key) ? child : rewrite(child, source);
    }
    return output;
  };
  // Relocate resource identifiers/references only; keep every validation keyword
  // from the actual files. All references stay in-memory and cannot fetch URLs.
  const definitions = Object.fromEntries(names.map((name) => [name, rewrite(documents[name], name)]));
  let shell;
  for (const executable of ["pwsh", "powershell"]) {
    const probe = spawnSync(executable, ["-NoProfile", "-NonInteractive", "-Command", "if (Get-Command Test-Json -ErrorAction SilentlyContinue) { exit 0 }; exit 1"],
      { cwd: root, encoding: "utf8", windowsHide: true, timeout: 30000 });
    if (probe.status === 0) { shell = executable; break; }
  }
  assert.ok(shell, "The existing PowerShell/Test-Json test prerequisite is required for actual JSON Schema validation; no package installation is attempted");
  const script = `
    $ErrorActionPreference = 'Stop'
    $ProgressPreference = 'SilentlyContinue'
    $payload = [Console]::In.ReadToEnd() | ConvertFrom-Json
    $cache = @{}
    $results = @(foreach ($case in $payload.cases) {
      if (-not $cache.ContainsKey($case.schema)) {
        $bundle = @{ '$schema' = 'https://json-schema.org/draft/2020-12/schema'; '$ref' = ('#/$defs/' + $case.schema); '$defs' = $payload.definitions }
        $cache[$case.schema] = $bundle | ConvertTo-Json -Depth 100 -Compress
      }
      $data = ConvertTo-Json -InputObject $case.value -Depth 100 -Compress
      $valid = Test-Json -Json $data -Schema $cache[$case.schema] -ErrorAction SilentlyContinue
      [pscustomobject]@{ name = $case.name; valid = [bool]$valid }
    })
    [Console]::Out.WriteLine((ConvertTo-Json -InputObject $results -Depth 10 -Compress))
  `;
  const result = spawnSync(shell, ["-NoProfile", "-NonInteractive", "-Command", script], {
    cwd: root, encoding: "utf8", windowsHide: true, timeout: 120000, maxBuffer: 2 * 1024 * 1024,
    input: JSON.stringify({ definitions, cases })
  });
  assert.equal(result.status, 0, result.stderr || result.error?.message);
  const results = JSON.parse(result.stdout.replace(/^\uFEFF/, ""));
  assert.equal(results.length, cases.length);
  const failures = cases.filter((item, index) => results[index].name !== item.name || results[index].valid !== item.expected).map((item) => item.name);
  assert.equal(failures.length, 0, `Actual JSON Schema mismatches (${failures.length}): ${failures.slice(0, 12).join("; ")}`);
}

// Only the completion assertion vocabulary is evaluated here, not a replacement
// for a JSON Schema validator. Unknown assertion keywords fail the test.
function matchesCompletionAssertions(schema, value, document) {
  if (typeof schema === "boolean") return schema;
  assert.ok(schema && typeof schema === "object" && !Array.isArray(schema), "Completion assertion must be a schema object");
  const supported = new Set(["$ref", "type", "const", "enum", "required", "properties", "allOf", "anyOf", "oneOf", "not", "if", "then", "else", "items", "contains", "minItems", "maxItems"]);
  for (const key of Object.keys(schema)) assert.ok(supported.has(key), `Unexamined completion assertion: ${key}`);
  const match = (child, candidate = value) => matchesCompletionAssertions(child, candidate, document);
  if (schema.$ref) {
    assert.ok(schema.$ref.startsWith("#/"), "Completion references must resolve offline");
    const target = schema.$ref.slice(2).split("/").reduce((node, key) => node[key.replaceAll("~1", "/").replaceAll("~0", "~")], document);
    if (!match(target)) return false;
  }
  if (Object.hasOwn(schema, "const") && !Object.is(value, schema.const)) return false;
  if (schema.enum && !schema.enum.includes(value)) return false;
  if (schema.type) {
    const type = value === null ? "null" : Array.isArray(value) ? "array" : typeof value;
    if (!(Array.isArray(schema.type) ? schema.type : [schema.type]).includes(type)) return false;
  }
  if (schema.allOf && !schema.allOf.every((child) => match(child))) return false;
  if (schema.anyOf && !schema.anyOf.some((child) => match(child))) return false;
  if (schema.oneOf && schema.oneOf.filter((child) => match(child)).length !== 1) return false;
  if (Object.hasOwn(schema, "not") && match(schema.not)) return false;
  if (Object.hasOwn(schema, "if")) {
    const branch = match(schema.if) ? "then" : "else";
    if (Object.hasOwn(schema, branch) && !match(schema[branch])) return false;
  }
  if (Array.isArray(value)) {
    if (schema.minItems !== undefined && value.length < schema.minItems) return false;
    if (schema.maxItems !== undefined && value.length > schema.maxItems) return false;
    if (Object.hasOwn(schema, "items") && !value.every((item) => match(schema.items, item))) return false;
    if (Object.hasOwn(schema, "contains") && !value.some((item) => match(schema.contains, item))) return false;
  } else if (value && typeof value === "object") {
    if ((schema.required ?? []).some((key) => !Object.hasOwn(value, key))) return false;
    for (const [key, child] of Object.entries(schema.properties ?? {})) {
      if (Object.hasOwn(value, key) && !match(child, value[key])) return false;
    }
  }
  return true;
}

function completeNativeHandoff() {
  const candidate = nativeHandoff();
  const proof = [{ path: "evidence/observations.json", sha256: "d".repeat(64) }];
  const verified = () => ({ ...observation("verified", proof), detail: "Synthetic contract-test evidence, not a live runtime claim." });
  candidate.target.cloud = "Public";
  for (const key of ["tenant", "environment", "dataverse", "bot"]) candidate.target[key] = verified();
  candidate.security.policy = verified();
  for (const key of Object.keys(candidate.evidence)) candidate.evidence[key] = verified();
  for (const key of ["localMutation", "publication"]) candidate.approvals[key] = verified();
  candidate.capabilities[0].implementation = verified();
  candidate.capabilities[0].acceptance = { ...verified(), criteria: ["Respond correctly in a fresh intended-channel conversation."] };
  candidate.capabilities[0].gaps = [];
  candidate.artifacts.recovery = { ...verified(), artifacts: candidate.artifacts.authored, procedure: ["Restore under a separately approved recovery plan."] };
  candidate.gaps = [];
  candidate.complete = true;
  return candidate;
}

test("Native Studio schema branches use valid schema nodes and root-level completion keywords", async () => {
  for (const name of ["copilot-studio-handoff", "agent-blueprint", "agent-builder-plan", "agent-builder-result"]) {
    const schema = JSON.parse(await readFile(path.join(root, "schemas", `${name}.schema.json`), "utf8"));
    assertSchemaShape(schema, name);
  }
  const schema = JSON.parse(await readFile(path.join(root, "schemas", "copilot-studio-handoff.schema.json"), "utf8"));
  const completion = schema.allOf.find((item) => item.if?.properties?.complete?.const === true);
  assert.ok(completion, "The completion rule must be a root-level conditional");
  assert.equal(completion.then.allOf.length, 5, "Draft approval, new intent, external sharing, security changes and solution membership must be root-level rules");
  assert.equal(Object.hasOwn(completion.then.properties.capabilities.items.then.properties, "allOf"), false);
});

test("Agent Builder schema dispatch stays at the root and autonomy retains exactly six gates", async () => {
  const bp = JSON.parse(await readFile(path.join(root, "schemas", "agent-blueprint.schema.json"), "utf8"));
  assert.equal(bp.properties.autonomy.allOf.length, 6);
  assert.deepEqual(bp.properties.autonomy.allOf.map((rule) => rule.properties.approvalRequiredFor.contains.const), approvalGates);
  assert.ok(bp.allOf.some((rule) => rule.if?.properties?.schemaVersion?.const === "3.0.0"));
  const plan = JSON.parse(await readFile(path.join(root, "schemas", "agent-builder-plan.schema.json"), "utf8"));
  assert.equal(plan.properties.distribution.anyOf[1].allOf.length, 2, "Distribution constraints must not contain plan-instance dispatch");
  assert.ok(plan.allOf.some((rule) => rule.if?.properties?.schemaVersion?.const === "2.0.0"));
  const result = JSON.parse(await readFile(path.join(root, "schemas", "agent-builder-result.schema.json"), "utf8"));
  assert.ok(result.allOf.some((rule) => rule.if?.properties?.schemaVersion?.const === "2.0.0"));
});

test("Agent Builder actual schemas preserve legacy requirements and constrain native blueprint plan and result records", async (context) => {
  const classic = await fixture();
  const native = await nativeFixture();
  const cases = [];
  const add = (schema, name, value, expected = true) => cases.push({ schema: `${schema}.schema.json`, name, value: structuredClone(value), expected });
  const requiredClassic = ["description", "purpose", "risk", "capabilities", "invocation", "instructions", "subagents", "handoffs"];
  try {
    for (const version of ["1.0.0", "2.0.0", "2.1.0", "2.2.0", "2.3.0"]) {
      const types = version === "1.0.0" ? [undefined] : version === "2.3.0"
        ? ["copilot", "foundry-prompt", "foundry-hosted", "portable"] : ["copilot", "foundry-prompt", "foundry-hosted"];
      for (const agentType of types) {
        const value = blueprint({
          schemaVersion: version, ...(agentType ? { agentType } : {}),
          ...(["2.1.0", "2.2.0", "2.3.0"].includes(version) ? { autonomy: { mode: "guided", approvalRequiredFor: approvalGates, webSafety: "standard" } } : {}),
          ...(agentType?.startsWith("foundry-") ? { azure: {
            required: true, cloud: "AzureCloud", location: "eastus", environmentName: "development", authenticationMethod: "interactive", subscriptionConfigured: false
          } } : {}),
          ...(version === "2.2.0" && agentType?.startsWith("foundry-") ? { publication: { targets: ["foundry-endpoint"], versionPolicy: "pinned" } } : {}),
          ...(version === "2.3.0" ? { distribution: { targets: ["copilot-studio", "openai-api-application"], versionPolicy: "pinned", environment: "development", dataBoundary: "organization" } } : {})
        });
        const label = `${version}/${agentType ?? "legacy"}`;
        add("agent-blueprint", `${label} valid blueprint`, value);
        if (agentType) {
          const missing = structuredClone(value);
          delete missing.agentType;
          add("agent-blueprint", `${label} missing agentType`, missing, false);
        }
        if (value.azure) {
          const missing = structuredClone(value);
          delete missing.azure;
          add("agent-blueprint", `${label} missing Foundry binding`, missing, false);
          add("agent-blueprint", `${label} disabled Foundry binding`, { ...value, azure: { ...value.azure, required: false } }, false);
        }
        for (const field of requiredClassic) {
          const incomplete = structuredClone(value);
          delete incomplete[field];
          add("agent-blueprint", `${label} missing ${field}`, incomplete, false);
        }
        if (value.autonomy) {
          const missing = structuredClone(value);
          delete missing.autonomy;
          add("agent-blueprint", `${label} missing autonomy`, missing, false);
          for (const gate of approvalGates) {
            const invalid = structuredClone(value);
            invalid.autonomy.approvalRequiredFor = approvalGates.filter((item) => item !== gate);
            add("agent-blueprint", `${label} missing approval ${gate}`, invalid, false);
          }
          const research = { ...value, capabilities: ["read", "search", "web"], autonomy: { ...value.autonomy, mode: "autonomous-research", webSafety: "threat-informed" } };
          add("agent-blueprint", `${label} autonomous research`, research);
          add("agent-blueprint", `${label} research cannot mutate`, { ...research, risk: "mutating" }, false);
          add("agent-blueprint", `${label} research cannot execute`, { ...research, capabilities: ["read", "execute", "web"] }, false);
          add("agent-blueprint", `${label} threat-informed requires web`, { ...research, capabilities: ["read", "search"] }, false);
        } else {
          add("agent-blueprint", `${label} cannot carry newer autonomy fields`, {
            ...value, autonomy: { mode: "guided", approvalRequiredFor: approvalGates, webSafety: "standard" }
          }, false);
        }
        const nativeField = structuredClone(value);
        nativeField.nativeSpec = { path: "native-spec.json", sha256: "a".repeat(64) };
        add("agent-blueprint", `${label} rejects native fields`, nativeField, false);
        await writeFile(classic.blueprintPath, JSON.stringify(value));
        const planned = run(classic.project, "plan", classic.blueprintPath);
        assert.equal(planned.status, 0, planned.stderr);
        const plan = JSON.parse(await readFile(path.join(classic.project, "reports", "agent-builder-plan.json"), "utf8"));
        add("agent-builder-plan", `${label} actual rendered plan`, plan);
        for (const field of ["renderedAgent", "renderedSha256"]) {
          const invalid = structuredClone(plan);
          delete invalid[field];
          add("agent-builder-plan", `${label} plan missing ${field}`, invalid, false);
        }
        add("agent-builder-plan", `${label} rejects native destination`, { ...plan, targetPath: "copilot-studio/native-reviewer" }, false);
        add("agent-builder-plan", `${label} rejects native runtime`, { ...plan, runtime: "native-copilot-studio" }, false);
        if (version === "1.0.0") {
          const old = structuredClone(plan);
          old.schemaVersion = "1.0.0";
          delete old.publication;
          add("agent-builder-plan", "1.0.0 pre-publication plan", old);
          add("agent-builder-plan", "1.0.0 cannot contain publication", { ...old, publication: null }, false);
        }
        if (version === "2.3.0") {
          add("agent-builder-plan", `${label} null distribution`, { ...plan, distribution: null });
          const missing = structuredClone(plan);
          delete missing.deploymentInputSha256;
          add("agent-builder-plan", `${label} distribution requires deployment digest`, missing, false);
          const incomplete = structuredClone(plan);
          delete incomplete.distribution.environment;
          add("agent-builder-plan", `${label} normalized distribution requires environment`, incomplete, false);
        }
      }
    }
    const appliedClassic = run(classic.project, "apply", classic.blueprintPath, ["--plan", path.join(classic.project, "reports", "agent-builder-plan.json"), "--accept-risk"]);
    assert.equal(appliedClassic.status, 0, appliedClassic.stderr);
    const classicResult = JSON.parse(await readFile(path.join(classic.project, "reports", "agent-builder-result.json"), "utf8"));
    add("agent-builder-result", "classic applied result", classicResult);
    for (const field of ["renderedSha256", "blueprintSha256"]) {
      const invalid = structuredClone(classicResult);
      delete invalid[field];
      add("agent-builder-result", `classic result missing ${field}`, invalid, false);
    }
    add("agent-builder-result", "classic result rejects native fields", { ...classicResult, runtime: "native-copilot-studio", complete: false }, false);
    add("agent-builder-result", "classic result cannot report native preparation", { ...classicResult, status: "prepared" }, false);
    const built = runNative(native, "build", ["--accept-risk"]);
    assert.equal(built.status, 0, built.stderr);
    const bp = JSON.parse(await readFile(native.blueprintPath, "utf8"));
    const plan = JSON.parse(await readFile(native.planPath, "utf8"));
    add("agent-blueprint", "native actual blueprint", bp);
    for (const field of ["agentType", "nativeSpec", "guide"]) {
      const invalid = structuredClone(bp);
      delete invalid[field];
      add("agent-blueprint", `native blueprint missing ${field}`, invalid, false);
    }
    add("agent-blueprint", "native blueprint rejects copilot type", { ...bp, agentType: "copilot" }, false);
    add("agent-blueprint", "native blueprint requires exact guide path", { ...bp, guide: { ...bp.guide, path: "README.md" } }, false);
    add("agent-blueprint", "native blueprint rejects spec path traversal", { ...bp, nativeSpec: { ...bp.nativeSpec, path: "../native-spec.json" } }, false);
    add("agent-blueprint", "native blueprint rejects portable capabilities", { ...bp, capabilities: ["read"] }, false);
    add("agent-blueprint", "native blueprint rejects Azure binding", { ...bp, azure: { required: true, cloud: "AzureCloud", location: "eastus", environmentName: "development", authenticationMethod: "interactive", subscriptionConfigured: false } }, false);
    add("agent-builder-plan", "native actual reviewed plan", plan);
    for (const field of ["runtime", "guide", "nativeSpec", "previewDirectory", "inputs", "files", "tooling", "preparation", "handoff", "handoffSha256", "contractSha256", "planSha256"]) {
      const invalid = structuredClone(plan);
      delete invalid[field];
      add("agent-builder-plan", `native plan missing ${field}`, invalid, false);
    }
    add("agent-builder-plan", "native plan rejects classic rendering", { ...plan, renderedAgent: "Not native source", renderedSha256: "a".repeat(64) }, false);
    add("agent-builder-plan", "native plan requires a missing destination", { ...plan, targetState: `file:sha256:${"a".repeat(64)}` }, false);
    add("agent-builder-plan", "native plan cannot update existing source", { ...plan, action: "update" }, false);
    add("agent-builder-plan", "native plan rejects classic destination", { ...plan, targetPath: ".github/agents/native-reviewer.agent.md" }, false);
    add("copilot-studio-handoff", "native actual handoff", plan.handoff);
    const applied = runNative(native, "apply", ["--accept-risk"]);
    assert.equal(applied.status, 0, applied.stderr);
    const nativeResult = JSON.parse(applied.stdout);
    add("agent-builder-result", "native actual prepared result", nativeResult);
    for (const field of ["runtime", "complete", "planSha256", "handoff", "diagnostics"]) {
      const invalid = structuredClone(nativeResult);
      delete invalid[field];
      add("agent-builder-result", `native result missing ${field}`, invalid, false);
    }
    for (const field of ["blueprintSha256", "planSha256", "handoff", "transactionId"]) {
      add("agent-builder-result", `prepared native result requires nonnull ${field}`, { ...nativeResult, [field]: null }, false);
    }
    add("agent-builder-result", "native result cannot claim completion", { ...nativeResult, complete: true }, false);
    add("agent-builder-result", "native result cannot claim classic apply", { ...nativeResult, status: "applied" }, false);
    add("agent-builder-result", "native result rejects rendered hash", { ...nativeResult, renderedSha256: "a".repeat(64) }, false);
    const blocked = { ...nativeResult, status: "blocked", planSha256: null, handoff: null, transactionId: null, diagnostics: [{ code: "NATIVE_SCOPE_BLOCKED", message: "Synthetic local blocker." }] };
    add("agent-builder-result", "native blocked result", blocked);
    add("agent-builder-result", "native blocked result needs diagnostics", { ...blocked, diagnostics: [] }, false);
    await assertActualBuilderSchemas(cases);
    context.diagnostic(`${cases.length} actual-schema cases covering all blueprint versions/types, legacy plan/result variants and native producer outputs.`);
  } finally {
    await rm(classic.project, { recursive: true, force: true });
    await rm(native.project, { recursive: true, force: true });
  }
});

test("Native Studio complete:true schema assertions agree with every runtime completion gate", async (context) => {
  const schema = JSON.parse(await readFile(path.join(root, "schemas", "copilot-studio-handoff.schema.json"), "utf8"));
  const completion = schema.allOf.find((item) => item.if?.properties?.complete?.const === true);
  const { validateNativeStudioHandoff } = await import(pathToFileURL(nativeModule).href);
  const proof = [{ path: "evidence/observations.json", sha256: "d".repeat(64) }];
  const verified = () => observation("verified", proof);
  const external = (value) => { value.security.audience = "external"; value.approvals.sharing = verified(); };
  const cases = [
    ["fully verified new agent", () => {}, true],
    ["new agent missing provisioning", (value) => { value.evidence.provisioned = observation(); }, false],
    ["existing agent needs no new provisioning", (value) => { value.intent.agent = "existing"; value.evidence.provisioned = observation(); }, true],
    ["external audience without sharing approval", (value) => { value.security.audience = "external"; }, false],
    ["external audience with sharing approval", external, true],
    ["anonymous audience without security approval", (value) => { external(value); value.security.authentication = "none"; }, false],
    ["approved anonymous audience", (value) => { external(value); value.security.authentication = "none"; value.approvals.security = verified(); }, true],
    ["multitenant without security approval", (value) => { external(value); value.security.authentication = "multitenant"; }, false],
    ["approved multitenant audience", (value) => { external(value); value.security.authentication = "multitenant"; value.approvals.security = verified(); }, true],
    ["maker connection without security approval", (value) => { value.security.toolIdentity = "maker"; }, false],
    ["approved maker connection", (value) => { value.security.toolIdentity = "maker"; value.approvals.security = verified(); }, true],
    ["selected solution without readiness", (value) => { value.target.solution.uniqueName = "native_solution"; value.artifacts.solutionMembership = { ...verified(), components: [], missing: [] }; }, false],
    ["selected solution without membership", (value) => { value.target.solution = { uniqueName: "native_solution", readiness: verified() }; }, false],
    ["verified selected solution", (value) => { value.target.solution = { uniqueName: "native_solution", readiness: verified() }; value.artifacts.solutionMembership = { ...verified(), components: value.artifacts.authored.map((item) => item.path), missing: [] }; }, true],
    ["null solution needs no ALM membership", () => {}, true],
    ["no read-back evidence", (value) => { value.evidence.synchronized = observation(); value.evidence.imported = observation(); }, false],
    ["import read-back only", (value) => { value.evidence.synchronized = observation(); }, true],
    ["synchronization read-back only", (value) => { value.evidence.imported = observation(); }, true],
    ["unknown cloud", (value) => { value.target.cloud = "unknown"; }, false],
    ["no intended channel", (value) => { value.security.channels = []; }, false],
    ["unverified policy", (value) => { value.security.policy = observation(); }, false],
    ["unverified recovery", (value) => { value.artifacts.recovery = { ...observation(), artifacts: value.artifacts.authored, procedure: ["Recovery unverified."] }; }, false],
    ["no recovery artifacts", (value) => { value.artifacts.recovery.artifacts = []; }, false],
    ["remaining scope gaps", (value) => { value.gaps = ["Still incomplete."]; }, false],
    ["no required capability", (value) => { value.capabilities[0].scope = "excluded"; }, false],
    ["capability gaps", (value) => { value.capabilities[0].gaps = ["Still incomplete."]; }, false],
    ["capability implementation unverified", (value) => { value.capabilities[0].implementation = observation(); }, false],
    ["capability acceptance unverified", (value) => { value.capabilities[0].acceptance.state = "unknown"; }, false],
    ["unknown persistence promise", (value) => { value.capabilities[0].persistence.mode = "unknown"; }, false],
    ["session persistence unverified", (value) => { value.capabilities[0].persistence.mode = "session"; }, false],
    ["verified session persistence", (value) => { value.capabilities[0].persistence = { ...verified(), mode: "session", operations: [] }; }, true],
    ["durable persistence unverified", (value) => { value.capabilities[0].persistence = { ...observation(), mode: "durable", operations: ["save", "load"] }; }, false],
    ["verified durable persistence", (value) => { value.capabilities[0].persistence = { ...verified(), mode: "durable", operations: ["save", "load"] }; }, true],
    ["excluded gaps do not reduce required scope", (value) => { value.capabilities.push({ ...nativeHandoff().capabilities[0], id: "deferred", scope: "excluded" }); }, true]
  ];
  for (const field of ["tenant", "environment", "dataverse", "bot"]) cases.push([`unverified target ${field}`, (value) => { value.target[field] = observation(); }, false]);
  for (const field of ["authentication", "audience", "toolIdentity"]) cases.push([`unknown security ${field}`, (value) => { value.security[field] = "unknown"; }, false]);
  for (const field of ["localMutation", "publication"]) cases.push([`missing ${field} approval`, (value) => { value.approvals[field] = observation(); }, false]);
  for (const field of ["authored", "localValidation", "evaluated", "publicationSubmitted", "serverPublished", "channelVerified"]) {
    cases.push([`missing ${field} evidence`, (value) => { value.evidence[field] = observation(); }, false]);
    cases.push([`verified ${field} without proof`, (value) => { value.evidence[field].evidence = []; }, false]);
  }
  const actualCases = [];
  for (const [name, mutate, expected] of cases) {
    const candidate = completeNativeHandoff();
    mutate(candidate);
    let runtimeAccepts = true;
    try { validateNativeStudioHandoff(candidate); } catch { runtimeAccepts = false; }
    assert.equal(runtimeAccepts, expected, `${name}: runtime result`);
    assert.equal(matchesCompletionAssertions(completion, candidate, schema), expected, `${name}: JSON Schema completion assertions`);
    actualCases.push({ name, schema: "copilot-studio-handoff.schema.json", value: candidate, expected });
  }
  const partial = nativeHandoff();
  assert.equal(validateNativeStudioHandoff(partial), partial);
  assert.equal(matchesCompletionAssertions(completion, partial, schema), true, "complete:false keeps explicit incomplete records representable");
  actualCases.push({ name: "partial handoff", schema: "copilot-studio-handoff.schema.json", value: partial, expected: true });
  await assertActualBuilderSchemas(actualCases);
  context.diagnostic(`${cases.length} completion cases plus a partial handoff checked for schema/runtime parity.`);
});

test("Native Studio push completion requires draft approval in runtime and actual schema", async (context) => {
  const { validateNativeStudioHandoff } = await import(pathToFileURL(nativeModule).href);
  const cases = ["not-requested", "pending", "blocked", "failed", "unknown", "verified"].map((state) => {
    const value = completeNativeHandoff();
    value.intent.operation = "push";
    value.evidence.imported = observation("not-requested");
    value.approvals.draft = observation(state, state === "verified" ? value.approvals.publication.evidence : []);
    return { name: `push with ${state} draft approval`, value, expected: state === "verified" };
  });
  const missingProof = structuredClone(cases.at(-1).value);
  missingProof.approvals.draft.evidence = [];
  cases.push({ name: "verified draft without evidence", value: missingProof, expected: false });
  const partial = structuredClone(cases[0].value);
  partial.complete = false;
  cases.push({ name: "partial push remains representable", value: partial, expected: true });
  cases.push({ name: "non-push retains existing approval scope", value: completeNativeHandoff(), expected: true });
  for (const item of cases) {
    await context.test(`runtime: ${item.name}`, () => {
      let accepted = true;
      try { validateNativeStudioHandoff(item.value); } catch { accepted = false; }
      assert.equal(accepted, item.expected);
      assert.equal(item.value.approvals.cost.state, "not-requested", "no unproven cost gate is added");
    });
  }
  await context.test("actual schema", () => assertActualBuilderSchemas(cases.map((item) => ({
    ...item, schema: "copilot-studio-handoff.schema.json"
  }))));
});

test("Native Studio solution names retain runtime CLI and actual schema parity without coercion", async (context) => {
  const { validateNativeStudioSpec, validateNativeStudioHandoff } = await import(pathToFileURL(nativeModule).href);
  const cases = [
    ["true", true, false], ["false", false, false], ["array", ["native_solution"], false],
    ["object", {}, false], ["number", 42, false], ["string", "native_solution", true], ["null", null, true]
  ];
  const schemaCases = [];
  for (const [name, value, expected] of cases) {
    const candidate = nativeHandoff();
    candidate.target.solution.uniqueName = value;
    schemaCases.push({ name, schema: "copilot-studio-handoff.schema.json", value: candidate, expected });
    await context.test(`pure APIs: ${name}`, () => {
      const specification = nativeSpec();
      specification.target.solutionUniqueName = value;
      let specAccepted = true;
      let handoffAccepted = true;
      try { validateNativeStudioSpec(specification); } catch { specAccepted = false; }
      try { validateNativeStudioHandoff(candidate); } catch { handoffAccepted = false; }
      assert.equal(specAccepted, expected);
      assert.equal(handoffAccepted, expected);
    });
    await context.test(`CLI: ${name}`, async () => {
      const fixture = await nativeFixture();
      try {
        const specification = nativeSpec();
        specification.target.solutionUniqueName = value;
        await writeFile(fixture.specPath, JSON.stringify(specification));
        const before = await snapshotNativeFixture(fixture.project);
        const built = runNative(fixture, "build", ["--accept-risk"]);
        assert.equal(built.status, expected ? 0 : 1);
        if (!expected) {
          assert.equal(existsSync(fixture.pacLog), false);
          assert.deepEqual(await snapshotNativeFixture(fixture.project), before);
        } else {
          const applied = runNative(fixture, "apply", ["--accept-risk"]);
          assert.equal(applied.status, 0);
          assert.equal(runNative(fixture, "validate").status, 0);
          const result = JSON.parse(applied.stdout);
          const produced = [
            ["agent-blueprint", JSON.parse(await readFile(fixture.blueprintPath, "utf8"))],
            ["agent-builder-plan", JSON.parse(await readFile(fixture.planPath, "utf8"))],
            ["agent-builder-result", result],
            ["copilot-studio-handoff", JSON.parse(await readFile(path.join(fixture.target, "native-handoff.json"), "utf8"))]
          ];
          for (const [schema, artifact] of produced) schemaCases.push({
            name: `${name} actual ${schema}`, schema: `${schema}.schema.json`, value: artifact, expected: true
          });
        }
      } finally { await rm(fixture.project, { recursive: true, force: true }); }
    });
  }
  await context.test("reject before calling object coercion", () => {
    let coercions = 0;
    const value = { toString() { coercions += 1; return "native_solution"; } };
    const specification = nativeSpec();
    specification.target.solutionUniqueName = value;
    const handoff = nativeHandoff();
    handoff.target.solution.uniqueName = value;
    let specRejected = false;
    let handoffRejected = false;
    try { validateNativeStudioSpec(specification); } catch { specRejected = true; }
    try { validateNativeStudioHandoff(handoff); } catch { handoffRejected = true; }
    assert.equal(coercions, 0);
    assert.equal(specRejected && handoffRejected, true);
  });
  await context.test("actual input and producer schemas", () => assertActualBuilderSchemas(schemaCases));
});

const greetingSource = `kind: AdaptiveDialog
modelDescription: Respond to a greeting without tools or persistent state.
beginDialog:
  kind: OnRecognizedIntent
  id: greeting
  intent:
    triggerQueries:
      - hello reviewer
  actions:
    - kind: SendActivity
      id: sendGreeting
      activity: Hello from the native reviewer.
inputType: {}
outputType: {}
`;
const metadataSource = `mcs.metadata:
  componentName: Native Reviewer
  description: A bounded static native greeting with no verified remote capabilities.
kind: GptComponentMetadata
instructions: |-
  Use the configured native greeting topic.
  Do not claim tools, persistence or channel readiness.
`;

function nativeSpec() {
  return {
    schemaVersion: "1.0.0", runtime: "native-copilot-studio",
    intent: { agent: "new", operation: "prepare" },
    agent: nativeHandoff().agent,
    target: { cloud: "unknown", solutionUniqueName: null },
    security: { authentication: "microsoft-single-tenant", audience: "private", channels: ["teams"], toolIdentity: "invoker", requirements: ["Preserve required user authentication."] },
    tooling: { pacVersion: "2.12.2" },
    source: {
      directory: "copilot-studio/native-reviewer",
      files: [{ path: "authoring/greeting.mcs.yml", target: "topics/greeting.mcs.yml" }]
    },
    capabilities: [{
      id: "greeting", scope: "required", description: "Respond to a native greeting.",
      sourcePaths: ["topics/greeting.mcs.yml"],
      acceptanceCriteria: ["A fresh intended-channel conversation receives the native greeting."],
      persistence: { mode: "none", operations: [] }
    }, {
      id: "save-record", scope: "required", description: "Save a user-owned record and load it in a new conversation.",
      sourcePaths: [], acceptanceCriteria: ["Save and read back exact Unicode data in a new conversation."],
      persistence: { mode: "durable", operations: ["save", "load"] }
    }]
  };
}

async function nativeFixture() {
  const project = await mkdtemp(path.join(os.tmpdir(), "pso-native-studio-fixture-"));
  assert.ok(!project.startsWith(`${root}${path.sep}`), "native fixtures must not enter concurrent repository evidence scans");
  await mkdir(path.join(project, ".github", "instructions"), { recursive: true });
  await mkdir(path.join(project, "authoring"));
  await writeFile(path.join(project, ...nativeGuidePath.split("/")), nativeGuide);
  await writeFile(path.join(project, "authoring", "greeting.mcs.yml"), greetingSource);
  const specPath = path.join(project, "native-spec.json");
  await writeFile(specPath, JSON.stringify(nativeSpec(), null, 2));
  const fakePac = path.join(project, "fake-pac.cjs");
  const pacLog = path.join(project, "pac-operations.jsonl");
  const code = `const fs=require("node:fs"),path=require("node:path");
const args=process.argv.slice(2);
fs.appendFileSync(process.env.PSO_FAKE_PAC_LOG,JSON.stringify(args)+"\\n");
if(args.includes("--environment")||["auth","env","solution"].includes(args[0])) process.exit(98);
if(args[0]==="--version") { console.log("Microsoft PowerPlatform CLI Version: "+(process.env.PSO_FAKE_PAC_VERSION||"2.12.2")); process.exit(0); }
if(args.join(" ")==="copilot init help") { console.log("--name --publisher-prefix --schema-name --project-dir [--environment]"); process.exit(0); }
if(args[0]!=="copilot"||args[1]!=="init") process.exit(97);
const dest=args[args.indexOf("--project-dir")+1];
fs.mkdirSync(dest,{recursive:true});
fs.writeFileSync(path.join(dest,"agent.mcs.yml"),${JSON.stringify(metadataSource)});
if(process.env.PSO_FAKE_PAC_BAD_SHAPE==="1") fs.writeFileSync(path.join(dest,"unrecognized.bin"),"unsupported");
if(process.env.PSO_FAKE_PAC_FAIL==="1") { console.error("Bearer PRIVATE_TOKEN_MUST_NOT_APPEAR"); process.exit(7); }
`;
  await writeFile(fakePac, code);
  return {
    project, specPath, pacLog, fakePac,
    blueprintPath: path.join(project, "reports", "agent-blueprints", "native-reviewer.json"),
    planPath: path.join(project, "reports", "agent-builder-plan.json"),
    target: path.join(project, "copilot-studio", "native-reviewer"),
    environment: { PSO_PAC_PATH: fakePac, PSO_FAKE_PAC_LOG: pacLog }
  };
}

function runNative(fixture, command = "build", extra = [], environment = {}) {
  const parameters = command === "build"
    ? ["--type", "copilot-studio", "--native-spec", fixture.specPath]
    : ["--blueprint", fixture.blueprintPath, ...(command === "apply" ? ["--plan", fixture.planPath] : [])];
  return spawnSync(process.execPath, [builder, command, "--project", fixture.project, ...parameters, "--json", ...extra], {
    cwd: root, encoding: "utf8", env: { ...process.env, ...fixture.environment, ...environment }
  });
}

test("Native Studio requires the exact scoped guide before native requirements, outputs or PAC calls", async () => {
  const fixture = await nativeFixture();
  try {
    const guide = path.join(fixture.project, ...nativeGuidePath.split("/"));
    for (const invalid of [null, nativeGuide.replace(nativeScope, "**"), nativeGuide.replace("description:", "unexpected:")]) {
      if (invalid === null) await rm(guide);
      else await writeFile(guide, invalid);
      const result = runNative(fixture, "build", ["--accept-risk"]);
      assert.notEqual(result.status, 0);
      assert.match(result.stderr, /Native Studio guide|native.*guide/i);
      assert.equal(existsSync(fixture.pacLog), false);
      assert.equal(existsSync(path.join(fixture.project, "reports")), false);
      assert.equal(existsSync(fixture.target), false);
    }
  } finally { await rm(fixture.project, { recursive: true, force: true }); }
});

async function snapshotNativeFixture(project, directory = "") {
  const entries = await readdir(path.join(project, directory), { withFileTypes: true });
  const snapshot = [];
  for (const entry of entries.sort((left, right) => left.name.localeCompare(right.name, "en"))) {
    const name = directory ? `${directory}/${entry.name}` : entry.name;
    if (entry.isSymbolicLink()) snapshot.push([name, "link"]);
    else if (entry.isDirectory()) {
      snapshot.push([name, "directory"]);
      snapshot.push(...await snapshotNativeFixture(project, name));
    } else snapshot.push([name, createHash("sha256").update(await readFile(path.join(project, name))).digest("hex")]);
  }
  return snapshot;
}

test("Native Studio rejects input output aliases before PAC or any preparation write", async (context) => {
  const outputs = [
    "reports/agent-blueprints/native-reviewer.json",
    "reports/agent-builder-plan.json",
    "reports/agent-builder-plan.md",
    "reports/agent-builder-result.json",
    "Reports/AGENT-BUILDER-PLAN.JSON",
    ".Skills-Orchestrator/Agent-Builder/authored.json",
    "copilot-studio/native-reviewer/authored.json"
  ];
  for (const inputKind of ["spec", "authored"]) {
    for (const relative of outputs) {
      await context.test(`${inputKind}: ${relative}`, async () => {
        const fixture = await nativeFixture();
        try {
          const inputPath = path.join(fixture.project, ...relative.split("/"));
          await mkdir(path.dirname(inputPath), { recursive: true });
          const spec = nativeSpec();
          if (inputKind === "spec") {
            fixture.specPath = inputPath;
          } else {
            spec.source.files[0].path = relative;
            await writeFile(inputPath, greetingSource);
          }
          await writeFile(fixture.specPath, JSON.stringify(spec, null, 2));
          const before = await snapshotNativeFixture(fixture.project);
          const rejected = runNative(fixture, "build", ["--accept-risk"]);
          assert.notEqual(rejected.status, 0, "colliding inputs must not be accepted");
          assert.equal(existsSync(fixture.pacLog), false, "collision checks must precede even PAC version/help probes");
          assert.deepEqual(await snapshotNativeFixture(fixture.project), before, "rejection must preserve every input and existing output");
          assert.match(rejected.stderr, /alias|overlap|managed destination|independently authored/i);
        } finally { await rm(fixture.project, { recursive: true, force: true }); }
      });
    }
  }
  for (const inputKind of ["spec", "authored"]) {
    await context.test(`hard-linked ${inputKind} and output`, async (subtest) => {
      const fixture = await nativeFixture();
      try {
        await mkdir(path.dirname(fixture.blueprintPath), { recursive: true });
        const input = inputKind === "spec" ? fixture.specPath : path.join(fixture.project, "authoring", "greeting.mcs.yml");
        try { await link(input, fixture.blueprintPath); }
        catch (error) {
          if (["EPERM", "EACCES", "ENOTSUP"].includes(error.code)) return subtest.skip(`Hard links unavailable: ${error.code}`);
          throw error;
        }
        const before = await snapshotNativeFixture(fixture.project);
        const rejected = runNative(fixture, "build", ["--accept-risk"]);
        assert.notEqual(rejected.status, 0);
        assert.equal(existsSync(fixture.pacLog), false);
        assert.deepEqual(await snapshotNativeFixture(fixture.project), before);
        assert.match(rejected.stderr, /alias|overlap/i);
      } finally { await rm(fixture.project, { recursive: true, force: true }); }
    });
  }
  await context.test("an existing blueprint cannot be overwritten by replan", async () => {
    const fixture = await nativeFixture();
    try {
      const built = runNative(fixture, "build", ["--accept-risk"]);
      assert.equal(built.status, 0, built.stderr);
      await copyFile(fixture.blueprintPath, fixture.planPath);
      await rm(fixture.pacLog);
      fixture.blueprintPath = fixture.planPath;
      const before = await snapshotNativeFixture(fixture.project);
      const rejected = runNative(fixture, "plan", ["--accept-risk"]);
      assert.notEqual(rejected.status, 0);
      assert.equal(existsSync(fixture.pacLog), false);
      assert.deepEqual(await snapshotNativeFixture(fixture.project), before);
      assert.match(rejected.stderr, /alias|overlap/i);
    } finally { await rm(fixture.project, { recursive: true, force: true }); }
  });
  await context.test("apply can read the immutable archived plan without overwriting it", async () => {
    const fixture = await nativeFixture();
    try {
      const built = runNative(fixture, "build", ["--accept-risk"]);
      assert.equal(built.status, 0, built.stderr);
      const plan = JSON.parse(await readFile(fixture.planPath, "utf8"));
      fixture.planPath = path.join(fixture.project, ...plan.previewDirectory.split("/"), "..", "plan.json");
      const original = await readFile(fixture.planPath);
      const applied = runNative(fixture, "apply", ["--accept-risk"]);
      assert.equal(applied.status, 0, applied.stderr);
      assert.deepEqual(await readFile(fixture.planPath), original);
      const validated = runNative(fixture, "validate");
      assert.equal(validated.status, 0, validated.stderr);
    } finally { await rm(fixture.project, { recursive: true, force: true }); }
  });
});

test("Native Studio rejects linked inputs and output parents before PAC or writes", async (context) => {
  for (const relative of ["reports", ".skills-orchestrator/agent-builder", ".skills-orchestrator/agent-builder/native-preview", "copilot-studio", "authoring"]) {
    await context.test(relative, async (subtest) => {
      const fixture = await nativeFixture();
      try {
        const link = path.join(fixture.project, ...relative.split("/"));
        const backing = path.join(fixture.project, "link-backing");
        await mkdir(backing);
        if (relative === "authoring") {
          await copyFile(path.join(link, "greeting.mcs.yml"), path.join(backing, "greeting.mcs.yml"));
          await rm(link, { recursive: true });
        }
        await mkdir(path.dirname(link), { recursive: true });
        try { await symlink(backing, link, process.platform === "win32" ? "junction" : "dir"); }
        catch (error) {
          if (["EPERM", "EACCES", "ENOTSUP"].includes(error.code)) return subtest.skip(`Directory links unavailable: ${error.code}`);
          throw error;
        }
        const before = await snapshotNativeFixture(fixture.project);
        const rejected = runNative(fixture, "build", ["--accept-risk"]);
        assert.notEqual(rejected.status, 0);
        assert.equal(existsSync(fixture.pacLog), false, "linked output paths must be rejected before PAC probes");
        assert.deepEqual(await snapshotNativeFixture(fixture.project), before);
        assert.match(rejected.stderr, /symbolic link/i);
      } finally { await rm(fixture.project, { recursive: true, force: true }); }
    });
  }
});

test("Native Studio screens raw authored credential material before copying", async (context) => {
  const { runNativeStudioBuilder } = await import(pathToFileURL(nativeModule).href);
  const { validateBlueprint } = await import(pathToFileURL(builder).href);
  for (const entrypoint of ["cli", "exported"]) {
    for (const placement of ["comment", "scalar", "inline-comment"]) {
      await context.test(`${entrypoint}: ${placement}`, async () => {
        const fixture = await nativeFixture();
        const canary = randomBytes(24).toString("hex");
        const source = placement === "comment" ? `${greetingSource}# api_key=${canary}\n`
          : greetingSource.replace("activity: Hello from the native reviewer.",
            placement === "scalar" ? `activity: api_key=${canary}` : `activity: Hello. # api_key=${canary}`);
        const input = path.join(fixture.project, "authoring", "greeting.mcs.yml");
        const oldEnvironment = Object.fromEntries(Object.keys(fixture.environment).map((key) => [key, process.env[key]]));
        try {
          await writeFile(input, source);
          let rejected = false;
          let diagnostic = "";
          if (entrypoint === "cli") {
            const result = runNative(fixture, "build", ["--accept-risk"]);
            rejected = result.status !== 0;
            diagnostic = result.stdout + result.stderr;
          } else {
            Object.assign(process.env, fixture.environment);
            try {
              const result = await runNativeStudioBuilder("build", fixture.project, {
                _: ["build"], type: "copilot-studio", project: fixture.project,
                "native-spec": fixture.specPath, "accept-risk": true, json: true
              }, validateBlueprint);
              rejected = result.status === "blocked";
              diagnostic = JSON.stringify(result);
            } catch (error) {
              rejected = true;
              diagnostic = error.message;
            }
          }
          const files = await snapshotNativeFixture(fixture.project);
          let propagated = false;
          for (const [name, kind] of files) {
            if (["directory", "link"].includes(kind) || !/^(?:reports|copilot-studio|\.skills-orchestrator)\//.test(name)) continue;
            propagated ||= (await readFile(path.join(fixture.project, name))).includes(canary);
          }
          assert.equal(diagnostic.includes(canary), false, "diagnostics must not echo the runtime canary");
          assert.equal(propagated, false, "generated artifacts must not contain the runtime canary");
          assert.equal((await readFile(input, "utf8")) === source, true, "the original input must remain unchanged");
          assert.equal(rejected, true, "suspected credential material must block preparation");
          assert.equal(/credential material|secret material/i.test(diagnostic), true, "rejection must identify the safe reason");
          assert.equal(existsSync(fixture.pacLog), false, "raw input screening must precede local PAC probes");
          assert.equal(existsSync(path.join(fixture.project, ".skills-orchestrator")), false);
        } finally {
          for (const [key, value] of Object.entries(oldEnvironment)) {
            if (value === undefined) delete process.env[key];
            else process.env[key] = value;
          }
          await rm(fixture.project, { recursive: true, force: true });
        }
      });
    }
  }
});

test("Native Studio preserves ordinary authored comments byte for byte", async () => {
  const fixture = await nativeFixture();
  const source = `${greetingSource}\n# Preserve this authored comment and its spacing.\n`.replaceAll("\n", "\r\n");
  try {
    const input = path.join(fixture.project, "authoring", "greeting.mcs.yml");
    await writeFile(input, source);
    assert.equal(runNative(fixture, "build", ["--accept-risk"]).status, 0);
    assert.equal(runNative(fixture, "apply", ["--accept-risk"]).status, 0);
    assert.equal(runNative(fixture, "validate").status, 0);
    assert.equal((await readFile(input, "utf8")) === source, true);
    assert.equal((await readFile(path.join(fixture.target, "topics", "greeting.mcs.yml"), "utf8")) === source, true);
  } finally { await rm(fixture.project, { recursive: true, force: true }); }
});

test("Native Studio prepares pinned local PAC source, requires reviewed apply, and preserves capability gaps", async () => {
  const fixture = await nativeFixture();
  try {
    const unapproved = runNative(fixture);
    assert.notEqual(unapproved.status, 0);
    assert.match(unapproved.stderr, /accept-risk/);
    assert.equal(existsSync(fixture.pacLog), false);
    const built = runNative(fixture, "build", ["--accept-risk"]);
    assert.equal(built.status, 0, built.stderr);
    const result = JSON.parse(built.stdout);
    const plan = JSON.parse(await readFile(fixture.planPath, "utf8"));
    assert.equal(plan.runtime, "native-copilot-studio");
    assert.equal(plan.schemaVersion, "2.0.0");
    assert.equal(plan.status, "review-required");
    assert.equal(plan.targetState, "missing");
    assert.equal(result.plan.handoff.complete, false);
    assert.equal(plan.guide.sha256, createHash("sha256").update(nativeGuide).digest("hex"));
    assert.equal(plan.handoff.target.environment.state, "unknown");
    assert.equal(plan.handoff.target.bot.state, "unknown");
    assert.equal(plan.handoff.artifacts.connectedDirectory, null);
    assert.equal(plan.handoff.capabilities.find((item) => item.id === "save-record").implementation.state, "blocked");
    assert.equal(plan.handoff.capabilities[0].acceptance.state, "unknown");
    assert.equal(plan.handoff.evidence.serverPublished.state, "not-requested");
    assert.ok(plan.handoff.gaps.length);
    assert.equal(existsSync(fixture.target), false);
    assert.equal(existsSync(path.join(fixture.project, ".github", "agents")), false);
    assert.equal(existsSync(path.join(fixture.project, ".azure")), false);
    const relativeValidation = runNative(fixture, "validate", ["--blueprint", "reports/agent-blueprints/native-reviewer.json"]);
    assert.equal(relativeValidation.status, 0, relativeValidation.stderr);
    const calls = (await readFile(fixture.pacLog, "utf8")).trim().split("\n").map(JSON.parse);
    assert.deepEqual(calls.slice(0, 2), [["--version"], ["copilot", "init", "help"]]);
    assert.deepEqual(calls[2].slice(0, 2), ["copilot", "init"]);
    assert.equal(calls.flat().includes("--environment"), false);
    assert.equal(calls.some((args) => args.some((value) => ["auth", "pull", "push", "clone", "publish", "import"].includes(value))), false);

    const rejected = runNative(fixture, "apply");
    assert.notEqual(rejected.status, 0);
    assert.equal(existsSync(fixture.target), false);
    const applied = runNative(fixture, "apply", ["--accept-risk"]);
    assert.equal(applied.status, 0, applied.stderr);
    const appliedResult = JSON.parse(applied.stdout);
    assert.equal(appliedResult.status, "prepared");
    assert.equal(appliedResult.complete, false);
    assert.equal(await readFile(path.join(fixture.target, "topics", "greeting.mcs.yml"), "utf8"), greetingSource);
    assert.equal(await readFile(path.join(fixture.project, "authoring", "greeting.mcs.yml"), "utf8"), greetingSource);
    assert.equal(await readFile(path.join(fixture.target, "agent.mcs.yml"), "utf8"), metadataSource);
    assert.doesNotMatch(await readFile(path.join(fixture.target, "agent.mcs.yml"), "utf8"), /Deployment Guidance|copilot-studio\.instructions/);
    const handoff = JSON.parse(await readFile(path.join(fixture.target, "native-handoff.json"), "utf8"));
    const { validateNativeStudioHandoff } = await import(pathToFileURL(nativeModule).href);
    assert.equal(validateNativeStudioHandoff(handoff), handoff);
    assert.equal(handoff.complete, false);
    for (const item of handoff.artifacts.authored) {
      assert.equal(createHash("sha256").update(await readFile(path.join(fixture.project, ...item.path.split("/")))).digest("hex"), item.sha256);
    }
    const validated = runNative(fixture, "validate");
    assert.equal(validated.status, 0, validated.stderr);
    const repeated = runNative(fixture, "apply", ["--accept-risk"]);
    assert.notEqual(repeated.status, 0);
    assert.match(repeated.stderr, /destination|already exists/i);
    assert.equal((await readFile(fixture.pacLog, "utf8")).trim().split("\n").length, 3, "apply and validate cannot call PAC");
  } finally { await rm(fixture.project, { recursive: true, force: true }); }
});

test("Native Studio stale guide, spec, source, staged files and plan fail closed", async () => {
  for (const kind of ["guide", "spec", "source", "staged", "plan"]) {
    const fixture = await nativeFixture();
    try {
      const built = runNative(fixture, "build", ["--accept-risk"]);
      assert.equal(built.status, 0, built.stderr);
      const plan = JSON.parse(await readFile(fixture.planPath, "utf8"));
      if (kind === "guide") await writeFile(path.join(fixture.project, ...nativeGuidePath.split("/")), `${nativeGuide}\nChanged approved guidance.\n`);
      if (kind === "spec") await writeFile(fixture.specPath, `${await readFile(fixture.specPath, "utf8")}\n`);
      if (kind === "source") await writeFile(path.join(fixture.project, "authoring", "greeting.mcs.yml"), greetingSource.replace("Hello from", "Changed from"));
      if (kind === "staged") await writeFile(path.join(fixture.project, ...plan.previewDirectory.split("/"), "agent.mcs.yml"), `${metadataSource}\n# drift\n`);
      if (kind === "plan") {
        plan.handoff.evidence.serverPublished.state = "verified";
        await writeFile(fixture.planPath, JSON.stringify(plan));
      }
      const rejected = runNative(fixture, "apply", ["--accept-risk"]);
      assert.notEqual(rejected.status, 0, `${kind}: ${rejected.stdout}`);
      assert.match(rejected.stderr, /changed|stale|digest|evidence|review/i);
      assert.equal(existsSync(fixture.target), false);
    } finally { await rm(fixture.project, { recursive: true, force: true }); }
  }
});

test("Native Studio missing tooling, unsupported shapes and existing remote operations return blocked", async () => {
  for (const kind of ["missing", "version", "shape", "existing", "failure"]) {
    const fixture = await nativeFixture();
    try {
      const environment = kind === "missing" ? { PSO_PAC_PATH: path.join(fixture.project, "missing-pac.exe") }
        : kind === "version" ? { PSO_FAKE_PAC_VERSION: "99.0.0" }
          : kind === "shape" ? { PSO_FAKE_PAC_BAD_SHAPE: "1" }
            : kind === "failure" ? { PSO_FAKE_PAC_FAIL: "1" } : {};
      if (kind === "existing") {
        const spec = nativeSpec();
        spec.intent = { agent: "existing", operation: "pull" };
        await writeFile(fixture.specPath, JSON.stringify(spec));
      }
      const blocked = runNative(fixture, "build", ["--accept-risk"], environment);
      assert.notEqual(blocked.status, 0);
      const result = JSON.parse(await readFile(path.join(fixture.project, "reports", "agent-builder-result.json"), "utf8"));
      assert.equal(result.runtime, "native-copilot-studio");
      assert.equal(result.status, "blocked");
      assert.equal(result.complete, false);
      assert.ok(result.diagnostics.length);
      assert.equal(existsSync(fixture.target), false);
      assert.doesNotMatch(JSON.stringify(result) + blocked.stderr + blocked.stdout, /PRIVATE_TOKEN_MUST_NOT_APPEAR/);
      if (kind === "existing") assert.equal(existsSync(fixture.pacLog), false, "existing operations cannot silently clone, pull or push");
    } finally { await rm(fixture.project, { recursive: true, force: true }); }
  }
});

test("Native Studio rejects CLI option-like identities before any native tooling call", async () => {
  const fixture = await nativeFixture();
  try {
    for (const name of ["--environment=https://unapproved.example", "@unapproved-response-file", "Display\n--environment"]) {
      const spec = nativeSpec();
      spec.agent.name = name;
      await writeFile(fixture.specPath, JSON.stringify(spec));
      const result = runNative(fixture, "build", ["--accept-risk"]);
      assert.notEqual(result.status, 0);
      assert.match(result.stderr, /name|identity/i);
      assert.equal(existsSync(fixture.pacLog), false);
      assert.equal(existsSync(fixture.target), false);
    }
  } finally { await rm(fixture.project, { recursive: true, force: true }); }
});

test("Native Studio rejects duplicate spec keys and redacts malformed native input diagnostics", async () => {
  const fixture = await nativeFixture();
  try {
    for (const content of [
      JSON.stringify(nativeSpec()).replace('"cloud":"unknown"', '"cloud":"Public","cloud":"unknown"'),
      "Bearer PRIVATE_TOKEN_MUST_NOT_APPEAR"
    ]) {
      await writeFile(fixture.specPath, content);
      const invalid = runNative(fixture, "build", ["--accept-risk"]);
      assert.notEqual(invalid.status, 0);
      assert.match(invalid.stderr, /invalid|duplicate/i);
      assert.doesNotMatch(invalid.stderr + invalid.stdout, /PRIVATE_TOKEN_MUST_NOT_APPEAR/);
      assert.equal(existsSync(fixture.pacLog), false);
      assert.equal(existsSync(path.join(fixture.project, "reports")), false);
    }
  } finally { await rm(fixture.project, { recursive: true, force: true }); }
});

test("Native Studio exact PAC pin rejects prerelease and extra version segments before initialization", async () => {
  for (const version of ["2.12.2-preview", "2.12.2.99"]) {
    const fixture = await nativeFixture();
    try {
      const blocked = runNative(fixture, "build", ["--accept-risk"], { PSO_FAKE_PAC_VERSION: version });
      assert.notEqual(blocked.status, 0);
      const result = JSON.parse(await readFile(path.join(fixture.project, "reports", "agent-builder-result.json"), "utf8"));
      assert.equal(result.status, "blocked");
      assert.equal(result.diagnostics[0].code, "PAC_VERSION_MISMATCH");
      assert.deepEqual((await readFile(fixture.pacLog, "utf8")).trim().split("\n").map(JSON.parse), [["--version"]]);
      assert.equal(existsSync(fixture.target), false);
    } finally { await rm(fixture.project, { recursive: true, force: true }); }
  }
});

test("Native Studio never overwrites an existing destination and rolls back if its result cannot persist", async () => {
  const fixture = await nativeFixture();
  try {
    const built = runNative(fixture, "build", ["--accept-risk"]);
    assert.equal(built.status, 0, built.stderr);
    await mkdir(fixture.target, { recursive: true });
    await writeFile(path.join(fixture.target, "user.txt"), "User changes");
    const occupied = runNative(fixture, "apply", ["--accept-risk"]);
    assert.notEqual(occupied.status, 0);
    assert.equal(await readFile(path.join(fixture.target, "user.txt"), "utf8"), "User changes");
    await rm(fixture.target, { recursive: true });
    await mkdir(path.join(fixture.project, "reports", "agent-builder-result.json"));
    const failure = runNative(fixture, "apply", ["--accept-risk"]);
    assert.notEqual(failure.status, 0);
    assert.equal(existsSync(fixture.target), false, "new canonical destination must be rolled back on result-write failure");
    assert.equal(existsSync(path.join(fixture.project, ".skills-orchestrator", "agent-builder.lock")), false);
    assert.equal(await readFile(path.join(fixture.project, "authoring", "greeting.mcs.yml"), "utf8"), greetingSource);
  } finally { await rm(fixture.project, { recursive: true, force: true }); }
});

test("Native Studio source diagnostics enforce bounded syntax, prompting and truthful state", async () => {
  const { parseNativeStudioSource, diagnoseNativeStudioSource } = await import(pathToFileURL(nativeModule).href);
  assert.equal(parseNativeStudioSource(greetingSource).kind, "AdaptiveDialog");
  for (const invalid of [
    "kind: AdaptiveDialog\nkind: TaskDialog\n",
    "kind: &alias AdaptiveDialog\n",
    "kind: !Custom AdaptiveDialog\n",
    "kind: AdaptiveDialog\nbeginDialog: {id: greeting}\n",
    "kind: AdaptiveDialog\n\tmodelDescription: Tabs are unsupported.\n"
  ]) assert.throws(() => parseNativeStudioSource(invalid), /duplicate|unsupported|indent|syntax/i);
  const callerOnly = {
    kind: "TaskDialog", modelDisplayName: "Caller-only read", modelDescription: "Read the specified record.",
    triggerCondition: "=false",
    inputs: [{ kind: "AutomaticTaskInput", propertyName: "id", shouldPromptUser: false }],
    action: { kind: "InvokeConnectorTaskAction", connectionReference: "reviewed-reference", connectionProperties: { mode: "Invoker" }, operationId: "ReadRecord" },
    outputMode: "All"
  };
  const diagnostic = diagnoseNativeStudioSource(callerOnly, { operationSchema: { type: "object", properties: { id: { type: "string" } }, required: ["id"] } });
  assert.ok(diagnostic.diagnostics.some((item) => item.code === "REQUIRED_INPUT_PROMPTING"));
  assert.equal(diagnostic.invocation, "caller-only");
  assert.equal(diagnostic.componentState, "unknown");
  assert.equal(diagnostic.persistenceState, "unknown");
  assert.equal(diagnostic.serverSettingsState, "unknown");
  callerOnly.inputs[0].shouldPromptUser = true;
  const supportedPrompting = diagnoseNativeStudioSource(callerOnly, { operationSchema: { type: "object", properties: { id: { type: "string" } }, required: ["id"] } });
  assert.equal(supportedPrompting.diagnostics.some((item) => item.code === "REQUIRED_INPUT_PROMPTING"), false);
  for (const invalid of [
    { kind: "GptComponentMetadata", description: "Wrong metadata location", instructions: "Stay within the source." },
    { kind: "GptComponentMetadata", "mcs.metadata": { componentName: "Name", componentDescription: "Invented property" }, instructions: "Stay within the source." },
    { kind: "TaskDialog", ...callerOnly, CdsBotId: "made-up", disabled: true }
  ]) assert.ok(diagnoseNativeStudioSource(invalid).diagnostics.some((item) => item.code === "UNSUPPORTED_NATIVE_PROPERTY"));
});

test("Native Studio implicit scalar subset rejects ambiguity and preserves quoted text", async (context) => {
  const { parseNativeStudioSource, diagnoseNativeStudioSource } = await import(pathToFileURL(nativeModule).href);
  const ambiguous = ["True", "FALSE", "NULL", "~", "yes", "OFF", "1e3", "1.2e-3", "0x10", "0o12", "0b10",
    "012", "1_000", "+12", ".5", "1.", ".NaN", "-.inf", "- message", "? name", "# comment", ",value", "2026-10-01"];
  for (const value of ambiguous) {
    await context.test(value, () => {
      assert.throws(() => parseNativeStudioSource(`value: ${value}\n`), /quote|unsupported/i);
      const source = greetingSource.replace("activity: Hello from the native reviewer.", `activity: ${JSON.stringify(value)}`);
      const parsed = parseNativeStudioSource(source);
      assert.equal(parsed.beginDialog.actions[0].activity, value);
      assert.equal(diagnoseNativeStudioSource(parsed).diagnostics.length, 0);
    });
  }
  await context.test("supported primitive types and whitespace", () => {
    assert.deepEqual(parseNativeStudioSource("enabled: true\nother: false\nmissing: null\ncount: -2\nratio: 1.5\nemptyMap: {}\nemptyList: []\n"),
      { enabled: true, other: false, missing: null, count: -2, ratio: 1.5, emptyMap: {}, emptyList: [] });
    assert.equal(parseNativeStudioSource('value: " True "\n').value, " True ");
    assert.throws(() => parseNativeStudioSource("value:   True   \n"), /quote|unsupported/i);
    assert.throws(() => parseNativeStudioSource("value: 9007199254740993\n"), /quote|unsupported/i);
    assert.throws(() => parseNativeStudioSource(`value: ${"9".repeat(309)}\n`), /quote|unsupported/i);
  });
});

test("Native Studio CLI cannot verify ambiguous unquoted activity scalars", async (context) => {
  for (const value of ["True", "~", "1e3", "# comment"]) {
    await context.test(value, async () => {
      const fixture = await nativeFixture();
      try {
        const input = path.join(fixture.project, "authoring", "greeting.mcs.yml");
        const source = greetingSource.replace("activity: Hello from the native reviewer.", `activity: ${value}`);
        await writeFile(input, source);
        const rejected = runNative(fixture, "build", ["--accept-risk"]);
        assert.equal(rejected.status, 1);
        const result = JSON.parse(rejected.stdout);
        assert.equal(result.status, "blocked");
        assert.equal(result.complete, false);
        assert.equal(existsSync(fixture.target), false);
        assert.equal(await readFile(input, "utf8"), source);
        await writeFile(input, greetingSource.replace("activity: Hello from the native reviewer.", `activity: ${JSON.stringify(value)}`));
        assert.equal(runNative(fixture, "build", ["--accept-risk"]).status, 0);
        assert.equal(runNative(fixture, "apply", ["--accept-risk"]).status, 0);
        assert.equal(runNative(fixture, "validate").status, 0);
      } finally { await rm(fixture.project, { recursive: true, force: true }); }
    });
  }
});

test("Native Studio blueprints cannot enter the classic renderer or legacy reviewed apply path", async () => {
  const fixture = await nativeFixture();
  try {
    const built = runNative(fixture, "build", ["--accept-risk"]);
    assert.equal(built.status, 0, built.stderr);
    const native = JSON.parse(await readFile(fixture.blueprintPath, "utf8"));
    const { validateBlueprint, renderAgent, normalizeDistribution } = await import(pathToFileURL(builder).href);
    assert.equal(validateBlueprint(native), native);
    assert.equal(normalizeDistribution(native), null);
    assert.throws(() => renderAgent(native), /native|Studio|render/i);
    const plan = JSON.parse(await readFile(fixture.planPath, "utf8"));
    plan.schemaVersion = "1.2.0";
    await writeFile(fixture.planPath, JSON.stringify(plan));
    const rejected = runNative(fixture, "apply", ["--accept-risk"]);
    assert.notEqual(rejected.status, 0);
    assert.equal(existsSync(fixture.target), false);
  } finally { await rm(fixture.project, { recursive: true, force: true }); }
});

test("Native Studio driver reuses an injected synchronous blueprint validator without importing the builder", async () => {
  const fixture = await nativeFixture();
  try {
    const built = runNative(fixture, "build", ["--accept-risk"]);
    assert.equal(built.status, 0, built.stderr);
    const { runNativeStudioBuilder } = await import(pathToFileURL(nativeModule).href);
    const { validateBlueprint } = await import(pathToFileURL(builder).href);
    let calls = 0;
    const validate = (value) => { calls += 1; return validateBlueprint(value); };
    const result = await runNativeStudioBuilder("validate", fixture.project, {
      _: ["validate"], blueprint: fixture.blueprintPath, project: fixture.project
    }, validate);
    assert.equal(result.status, "valid");
    assert.equal(calls, 1);
    await assert.rejects(runNativeStudioBuilder("validate", fixture.project, {
      _: ["validate"], blueprint: fixture.blueprintPath, project: fixture.project
    }, () => { throw new Error("Injected blueprint validation rejected this value"); }), /Injected blueprint validation rejected/);
  } finally { await rm(fixture.project, { recursive: true, force: true }); }
});

test("Native Studio installed validation binds the reviewed source and handoff rather than mutable self-claims", async () => {
  for (const change of ["handoff", "source"]) {
    const fixture = await nativeFixture();
    try {
      assert.equal(runNative(fixture, "build", ["--accept-risk"]).status, 0);
      assert.equal(runNative(fixture, "apply", ["--accept-risk"]).status, 0);
      if (change === "handoff") {
        const handoffPath = path.join(fixture.target, "native-handoff.json");
        const handoff = JSON.parse(await readFile(handoffPath, "utf8"));
        handoff.gaps = ["Different unreviewed capability claims."];
        await writeFile(handoffPath, JSON.stringify(handoff));
      } else await writeFile(path.join(fixture.project, "authoring", "greeting.mcs.yml"), greetingSource.replace("Hello from", "Changed after review from"));
      const invalid = runNative(fixture, "validate");
      assert.notEqual(invalid.status, 0, `${change}: ${invalid.stdout}`);
      assert.match(invalid.stderr, /review|changed|digest|stale/i);
    } finally { await rm(fixture.project, { recursive: true, force: true }); }
  }
});

test("Agent Builder includes deployment guidance for every supported blueprint without changing capabilities", async () => {
  const { renderAgent, validateBlueprint } = await import(pathToFileURL(builder).href);
  for (const schemaVersion of ["1.0.0", "2.0.0", "2.1.0", "2.2.0", "2.3.0"]) {
    const agentTypes = schemaVersion === "1.0.0" ? [undefined]
      : schemaVersion === "2.3.0" ? ["copilot", "foundry-prompt", "foundry-hosted", "portable"]
        : ["copilot", "foundry-prompt", "foundry-hosted"];
    for (const agentType of agentTypes) {
      const candidate = blueprint({
        schemaVersion,
        ...(agentType ? { agentType } : {}),
        ...(["2.1.0", "2.2.0", "2.3.0"].includes(schemaVersion)
          ? { autonomy: { mode: "guided", approvalRequiredFor: approvalGates, webSafety: "standard" } } : {}),
        ...(agentType?.startsWith("foundry-") ? {
          azure: {
            required: true, cloud: "AzureCloud", location: "eastus", environmentName: "development",
            authenticationMethod: "interactive", subscriptionConfigured: false
          }
        } : {})
      });
      const before = JSON.stringify(candidate);
      const rendered = renderAgent(validateBlueprint(candidate));
      assert.match(rendered, /^## Deployment Guidance$/m, `${schemaVersion}/${agentType ?? "legacy"}`);
      assert.ok(rendered.includes(deploymentGuide));
      assert.match(rendered, /\.github\/skills\/agent-deployment\/SKILL\.md/);
      assert.match(rendered, /does not deploy or publish/);
      assert.match(rendered, /does not grant tools, credentials, or permission/);
      assert.match(rendered, /missing, report the handoff as blocked/);
      assert.deepEqual(JSON.parse(rendered.match(/^tools: (.+)$/m)[1]), ["read", "search"]);
      assert.doesNotMatch(rendered, /^agents:|^handoffs:|^ {2}- label:/m);
      assert.equal(JSON.stringify(candidate), before, "rendering must not rewrite a source blueprint");
      assert.equal(renderAgent(candidate), rendered, "guidance must be deterministic without environment reads");
    }
  }
});

test("Agent Builder rejects pre-guidance review hashes and never silently rewrites an existing agent", async () => {
  const { project, blueprintPath } = await fixture();
  try {
    const planned = runRuntime(project, "plan", blueprintPath);
    assert.equal(planned.status, 0, planned.stderr);
    const planPath = path.join(project, "reports", "agent-builder-plan.json");
    const plan = JSON.parse(await readFile(planPath, "utf8"));
    const legacySource = `${plan.renderedAgent.split("\n## Deployment Guidance\n")[0].trimEnd()}\n`;
    assert.notEqual(legacySource, plan.renderedAgent, "new plans must contain the deployment guidance");
    const legacyHash = createHash("sha256").update(legacySource).digest("hex");
    await writeFile(planPath, JSON.stringify({ ...plan, renderedAgent: legacySource, renderedSha256: legacyHash }));
    const target = path.join(project, ".github", "agents", "accessibility-reviewer.agent.md");
    const rejected = runRuntime(project, "apply", blueprintPath, ["--plan", planPath, "--accept-risk"]);
    assert.notEqual(rejected.status, 0);
    assert.match(rejected.stderr, /rendered content is invalid or stale/);
    assert.equal(existsSync(target), false);

    await writeFile(target, legacySource);
    const updatedPlan = runRuntime(project, "plan", blueprintPath);
    assert.equal(updatedPlan.status, 0, updatedPlan.stderr);
    assert.equal(await readFile(target, "utf8"), legacySource, "planning cannot replace an existing definition");
    const current = JSON.parse(await readFile(planPath, "utf8"));
    assert.equal(current.action, "update");
    const notApproved = runRuntime(project, "apply", blueprintPath, ["--plan", planPath]);
    assert.notEqual(notApproved.status, 0);
    assert.equal(await readFile(target, "utf8"), legacySource);
    const applied = runRuntime(project, "apply", blueprintPath, ["--plan", planPath, "--accept-risk"]);
    assert.equal(applied.status, 0, applied.stderr);
    assert.equal(await readFile(target, "utf8"), current.renderedAgent);
    assert.equal(existsSync(path.join(project, ".azure")), false);
  } finally {
    await rm(project, { recursive: true, force: true });
  }
});

test("Agent Builder plans, applies, and validates a least-privilege agent", async () => {
  const { project, blueprintPath } = await fixture();
  try {
    const validate = run(project, "validate", blueprintPath);
    assert.equal(validate.status, 0, validate.stderr);
    const plan = run(project, "plan", blueprintPath);
    assert.equal(plan.status, 0, plan.stderr);
    const target = path.join(project, ".github", "agents", "accessibility-reviewer.agent.md");
    assert.equal(existsSync(target), false, "planning must not create the agent");

    const planPath = path.join(project, "reports", "agent-builder-plan.json");
    const planArtifact = JSON.parse(await readFile(planPath, "utf8"));
    assert.equal(planArtifact.action, "create");
    assert.equal(planArtifact.targetPath, ".github/agents/accessibility-reviewer.agent.md");
    assert.deepEqual(JSON.parse(planArtifact.renderedAgent.match(/^tools: (.+)$/m)[1]), ["read", "search"]);
    assert.ok(planArtifact.renderedAgent.includes(deploymentGuide));
    assert.ok((await readFile(path.join(project, "reports", "agent-builder-plan.md"), "utf8")).includes(deploymentGuide));

    const apply = run(project, "apply", blueprintPath, ["--plan", planPath, "--accept-risk"]);
    assert.equal(apply.status, 0, apply.stderr);
    const installed = await readFile(target, "utf8");
    assert.equal(installed, planArtifact.renderedAgent);
    const installedValidation = run(project, "validate", blueprintPath, ["--agent", target]);
    assert.equal(installedValidation.status, 0, installedValidation.stderr);
    const result = JSON.parse(await readFile(path.join(project, "reports", "agent-builder-result.json"), "utf8"));
    assert.equal(result.status, "applied");
    assert.equal(result.action, "create");
    assert.match(result.transactionId, /^AGT-[a-f0-9-]{36}$/);
  } finally {
    await rm(project, { recursive: true, force: true });
  }
});

test("Agent Builder validates an agent through a canonical project-root alias", async (context) => {
  const { project, blueprintPath } = await fixture();
  const alias = path.join(path.dirname(project), `${path.basename(project)}-alias`);
  try {
    try {
      await symlink(project, alias, process.platform === "win32" ? "junction" : "dir");
    } catch (error) {
      if (["EPERM", "EACCES", "ENOTSUP"].includes(error.code)) return context.skip(`Filesystem aliases are unavailable: ${error.code}`);
      throw error;
    }
    const aliasedBlueprint = path.join(alias, path.basename(blueprintPath));
    const plan = run(alias, "plan", aliasedBlueprint);
    assert.equal(plan.status, 0, plan.stderr);
    const planPath = path.join(alias, "reports", "agent-builder-plan.json");
    const apply = run(alias, "apply", aliasedBlueprint, ["--plan", planPath, "--accept-risk"]);
    assert.equal(apply.status, 0, apply.stderr);
    const aliasedTarget = path.join(alias, ".github", "agents", "accessibility-reviewer.agent.md");
    const validate = run(alias, "validate", aliasedBlueprint, ["--agent", aliasedTarget]);
    assert.equal(validate.status, 0, validate.stderr);
  } finally {
    await rm(alias, { recursive: true, force: true });
    await rm(project, { recursive: true, force: true });
  }
});

test("Agent Builder preserves schema 2.0 compatibility and requires schema 2.1 autonomy", async () => {
  const { project, blueprintPath } = await fixture();
  try {
    const legacy = blueprint({ schemaVersion: "2.0.0", agentType: "copilot" });
    await writeFile(blueprintPath, `${JSON.stringify(legacy, null, 2)}\n`, "utf8");
    const planned = run(project, "plan", blueprintPath);
    assert.equal(planned.status, 0, planned.stderr);
    const plan = JSON.parse(await readFile(path.join(project, "reports", "agent-builder-plan.json"), "utf8"));
    assert.doesNotMatch(plan.renderedAgent, /## Autonomy and Approval/);

    const incomplete = blueprint({ schemaVersion: "2.1.0", agentType: "copilot" });
    await writeFile(blueprintPath, `${JSON.stringify(incomplete, null, 2)}\n`, "utf8");
    const rejected = run(project, "validate", blueprintPath);
    assert.notEqual(rejected.status, 0);
    assert.match(rejected.stderr, /schemaVersion 2\.1\.0 requires an autonomy policy/);
  } finally {
    await rm(project, { recursive: true, force: true });
  }
});

test("Agent Builder renders autonomous research with mandatory safety gates", async () => {
  const { project, blueprintPath } = await fixture();
  try {
    const autonomous = blueprint({
      schemaVersion: "2.1.0",
      agentType: "copilot",
      capabilities: ["read", "search", "web"],
      autonomy: {
        mode: "autonomous-research",
        approvalRequiredFor: approvalGates,
        webSafety: "threat-informed"
      }
    });
    await writeFile(blueprintPath, `${JSON.stringify(autonomous, null, 2)}\n`, "utf8");
    const planned = run(project, "plan", blueprintPath);
    assert.equal(planned.status, 0, planned.stderr);
    const plan = JSON.parse(await readFile(path.join(project, "reports", "agent-builder-plan.json"), "utf8"));
    assert.match(plan.renderedAgent, /Proceed autonomously through read-only research/);
    assert.match(plan.renderedAgent, /purchase or payment/);
    assert.match(plan.renderedAgent, /deleting files, data, resources, or accounts/);
    assert.match(plan.renderedAgent, /credibly attributed to malicious or state-sponsored threat actors/);
    assert.match(plan.renderedAgent, /country, language, hosting region/);
    assert.match(plan.warnings.join("\n"), /does not override VS Code permission settings/);

    const unsafe = { ...autonomous, risk: "mutating", capabilities: ["read", "search", "web", "edit"] };
    await writeFile(blueprintPath, `${JSON.stringify(unsafe, null, 2)}\n`, "utf8");
    const rejected = run(project, "validate", blueprintPath);
    assert.notEqual(rejected.status, 0);
    assert.match(rejected.stderr, /autonomous-research requires a read-only agent/);
  } finally {
    await rm(project, { recursive: true, force: true });
  }
});

test("Agent Builder rejects schema 2.1 through 2.3 autonomy policies missing any consequential-action approval gate", async () => {
  const { project, blueprintPath } = await fixture();
  try {
    for (const schemaVersion of ["2.1.0", "2.2.0", "2.3.0"]) {
      for (const omittedGate of approvalGates) {
        const candidate = blueprint({
          schemaVersion,
          agentType: "copilot",
          capabilities: ["read", "search", "web"],
          autonomy: {
            mode: "autonomous-research",
            approvalRequiredFor: approvalGates.filter((gate) => gate !== omittedGate),
            webSafety: "threat-informed"
          }
        });
        await writeFile(blueprintPath, `${JSON.stringify(candidate, null, 2)}\n`, "utf8");
        const rejected = run(project, "validate", blueprintPath);
        assert.notEqual(rejected.status, 0, `${schemaVersion} ${omittedGate} omission must be rejected`);
        assert.match(rejected.stderr, /autonomy\.approvalRequiredFor must contain 6-6 items/);
      }
    }
  } finally {
    await rm(project, { recursive: true, force: true });
  }
});

test("Agent Builder plans governed Foundry publication handoffs without deploying", async () => {
  const { project, blueprintPath } = await fixture();
  try {
    const candidate = blueprint({
      schemaVersion: "2.2.0",
      agentType: "foundry-prompt",
      autonomy: {
        mode: "guided",
        approvalRequiredFor: approvalGates,
        webSafety: "standard"
      },
      azure: {
        required: true,
        cloud: "AzureUSGovernment",
        location: "usgovarizona",
        environmentName: "development",
        authenticationMethod: "interactive",
        subscriptionConfigured: true
      },
      publication: {
        targets: ["foundry-endpoint", "microsoft-365-copilot-and-teams", "chatgpt-action"],
        versionPolicy: "pinned",
        microsoft365Audience: "tenant",
        chatgptVisibility: "workspace"
      }
    });
    await writeFile(blueprintPath, `${JSON.stringify(candidate, null, 2)}\n`, "utf8");
    const planned = run(project, "plan", blueprintPath);
    assert.equal(planned.status, 0, planned.stderr);
    const plan = JSON.parse(await readFile(path.join(project, "reports", "agent-builder-plan.json"), "utf8"));
    assert.equal(plan.schemaVersion, "1.1.0");
    assert.deepEqual(plan.publication, candidate.publication);
    assert.match(plan.warnings.join("\n"), /endpoint is live when the Foundry agent is created/i);
    assert.match(plan.warnings.join("\n"), /Azure Bot Service/i);
    assert.match(plan.warnings.join("\n"), /not a direct Foundry publication target/i);
    assert.match(plan.warnings.join("\n"), /AzureUSGovernment.*availability.*data boundary/i);
    assert.doesNotMatch(plan.renderedAgent, /Publication Handoff/);
  } finally {
    await rm(project, { recursive: true, force: true });
  }
});

test("Agent Builder rejects invalid publication intent", async () => {
  const { project, blueprintPath } = await fixture();
  const governed = blueprint({
    schemaVersion: "2.2.0",
    agentType: "foundry-prompt",
    autonomy: {
      mode: "guided",
      approvalRequiredFor: approvalGates,
      webSafety: "standard"
    },
    azure: {
      required: true,
      cloud: "AzureCloud",
      location: "eastus2",
      environmentName: "development",
      authenticationMethod: "interactive",
      subscriptionConfigured: true
    }
  });
  try {
    const cases = [
      [
        { ...governed, schemaVersion: "2.1.0", publication: { targets: ["foundry-endpoint"], versionPolicy: "pinned" } },
        /publication requires schemaVersion 2\.2\.0/
      ],
      [
        { ...governed, agentType: "copilot", publication: { targets: ["foundry-endpoint"], versionPolicy: "pinned" } },
        /publication is supported only for Foundry agents/
      ],
      [
        { ...governed, publication: { targets: ["microsoft-365-copilot-and-teams"], versionPolicy: "pinned" } },
        /microsoft365Audience is required/
      ],
      [
        { ...governed, publication: { targets: ["chatgpt-action"], versionPolicy: "pinned" } },
        /chatgptVisibility is required/
      ]
    ];
    for (const [candidate, expected] of cases) {
      await writeFile(blueprintPath, `${JSON.stringify(candidate, null, 2)}\n`, "utf8");
      const rejected = run(project, "validate", blueprintPath);
      assert.notEqual(rejected.status, 0);
      assert.match(rejected.stderr, expected);
    }
  } finally {
    await rm(project, { recursive: true, force: true });
  }
});

test("Agent Builder builds portable distribution intent without Azure login or publication", async () => {
  const { project } = await fixture();
  try {
    const built = runRuntimeBuild(project, buildParameters([
      "--type", "portable",
      "--distribution-targets", "copilot-studio,openai-api-application,chatgpt-action-handoff",
      "--version-policy", "pinned",
      "--chatgpt-visibility", "workspace",
      "--distribution-environment", "development",
      "--data-boundary", "organization"
    ]));
    assert.equal(built.status, 0, built.stderr);
    const candidate = JSON.parse(await readFile(path.join(project, "reports", "agent-blueprints", "accessibility-reviewer.json"), "utf8"));
    assert.equal(candidate.schemaVersion, "2.3.0");
    assert.equal(candidate.agentType, "portable");
    assert.deepEqual(candidate.distribution, {
      targets: ["copilot-studio", "openai-api-application", "chatgpt-action-handoff"],
      versionPolicy: "pinned",
      environment: "development",
      dataBoundary: "organization",
      chatgptVisibility: "workspace"
    });
    assert.equal(candidate.azure, undefined);
    assert.equal(candidate.publication, undefined);
    assert.equal(existsSync(path.join(project, ".azure", "environment.json")), false);
    assert.equal(existsSync(path.join(project, ".github", "agents", `${candidate.id}.agent.md`)), false);
    const plan = JSON.parse(await readFile(path.join(project, "reports", "agent-builder-plan.json"), "utf8"));
    assert.equal(plan.schemaVersion, "1.2.0");
    assert.match(plan.deploymentInputSha256, /^[a-f0-9]{64}$/);
    assert.deepEqual(plan.distribution.targets, [...candidate.distribution.targets].sort());
    assert.doesNotMatch(plan.renderedAgent, /copilot-studio|openai-api-application|Distribution Handoff/);
    assert.match(plan.warnings.join("\n"), /does not deploy|does not publish/i);
    assert.match(plan.warnings.join("\n"), /manual.handoff/i);
  } finally {
    await rm(project, { recursive: true, force: true });
  }
});

test("Agent Builder exposes pure validated handoff normalization without running its CLI on import", async () => {
  const imported = spawnSync(process.execPath, ["--input-type=module", "-e",
    `const builder = await import(${JSON.stringify(pathToFileURL(builder).href)}); console.log(JSON.stringify(Object.keys(builder).sort()));`
  ], { cwd: root, encoding: "utf8" });
  assert.equal(imported.status, 0, imported.stderr);
  assert.deepEqual(JSON.parse(imported.stdout), ["normalizeDistribution", "renderAgent", "validateBlueprint"]);
  const { normalizeDistribution, validateBlueprint } = await import(pathToFileURL(builder).href);
  const legacy = blueprint({
    schemaVersion: "2.2.0",
    agentType: "foundry-prompt",
    autonomy: { mode: "guided", approvalRequiredFor: approvalGates, webSafety: "standard" },
    azure: {
      required: true, cloud: "AzureCloud", location: "eastus", environmentName: "development",
      authenticationMethod: "interactive", subscriptionConfigured: false
    },
    publication: { targets: ["chatgpt-action", "foundry-endpoint"], versionPolicy: "pinned", chatgptVisibility: "workspace" }
  });
  const original = structuredClone(legacy);
  assert.deepEqual(normalizeDistribution(legacy), {
    targets: ["chatgpt-action-handoff", "foundry-endpoint"],
    versionPolicy: "pinned",
    environment: "development",
    dataBoundary: "organization",
    chatgptVisibility: "workspace"
  });
  assert.deepEqual(legacy, original, "legacy source evidence must not be rewritten during normalization");
  assert.equal(normalizeDistribution(blueprint()), null);
  assert.throws(() => normalizeDistribution({ ...legacy, schemaVersion: "9.0.0" }), /schemaVersion/);
  const portable = {
    ...legacy, schemaVersion: "2.3.0", agentType: "portable",
    distribution: normalizeDistribution(legacy)
  };
  delete portable.publication;
  delete portable.azure;
  assert.equal(validateBlueprint(portable), portable);
  assert.deepEqual(normalizeDistribution(portable), normalizeDistribution(legacy));
});

test("Agent Builder rejects invalid or ambiguous distribution intent", async () => {
  const { project, blueprintPath } = await fixture();
  const candidate = blueprint({
    schemaVersion: "2.3.0",
    agentType: "portable",
    autonomy: { mode: "guided", approvalRequiredFor: approvalGates, webSafety: "standard" },
    distribution: {
      targets: ["copilot-studio"], versionPolicy: "pinned", environment: "development", dataBoundary: "organization"
    }
  });
  try {
    const cases = [
      [{ ...candidate, schemaVersion: "2.2.0", agentType: "copilot" }, /distribution requires schemaVersion 2\.3\.0/],
      [{ ...candidate, schemaVersion: "2.2.0", distribution: undefined }, /portable requires schemaVersion 2\.3\.0/],
      [{ ...candidate, publication: { targets: ["foundry-endpoint"], versionPolicy: "pinned" } }, /publication.*distribution|distribution.*publication/],
      [{ ...candidate, distribution: { ...candidate.distribution, targets: ["chatgpt-store"] } }, /Unsupported distribution target/],
      [{ ...candidate, distribution: { ...candidate.distribution, targets: ["copilot-studio", "copilot-studio"] } }, /duplicates/],
      [{ ...candidate, distribution: { ...candidate.distribution, versionPolicy: "implicit" } }, /versionPolicy/],
      [{ ...candidate, distribution: { ...candidate.distribution, environment: "unknown" } }, /environment/],
      [{ ...candidate, distribution: { ...candidate.distribution, dataBoundary: "anywhere" } }, /dataBoundary/],
      [{ ...candidate, distribution: { ...candidate.distribution, targets: ["microsoft-365-agents-toolkit"] } }, /microsoft365Audience/],
      [{ ...candidate, distribution: { ...candidate.distribution, targets: ["chatgpt-action-handoff"] } }, /chatgptVisibility/],
      [{ ...candidate, distribution: { ...candidate.distribution, chatgptVisibility: "workspace" } }, /chatgptVisibility/],
      [{ ...candidate, distribution: { ...candidate.distribution, approved: true } }, /Unknown distribution field/]
    ];
    for (const [invalid, expected] of cases) {
      await writeFile(blueprintPath, `${JSON.stringify(invalid, null, 2)}\n`, "utf8");
      const rejected = run(project, "plan", blueprintPath);
      assert.notEqual(rejected.status, 0);
      assert.match(rejected.stderr, expected);
    }
    assert.equal(existsSync(path.join(project, "reports", "agent-builder-plan.json")), false);
  } finally {
    await rm(project, { recursive: true, force: true });
  }
});

test("Agent Builder binds distribution and deployment digests to the reviewed plan", async () => {
  const { project, blueprintPath } = await fixture();
  const candidate = blueprint({
    schemaVersion: "2.3.0",
    agentType: "portable",
    autonomy: { mode: "guided", approvalRequiredFor: approvalGates, webSafety: "standard" },
    distribution: { targets: ["copilot-studio"], versionPolicy: "pinned" }
  });
  try {
    await writeFile(blueprintPath, `${JSON.stringify(candidate, null, 2)}\n`, "utf8");
    const planned = run(project, "plan", blueprintPath);
    assert.equal(planned.status, 0, planned.stderr);
    const planPath = path.join(project, "reports", "agent-builder-plan.json");
    const original = JSON.parse(await readFile(planPath, "utf8"));
    assert.equal(original.schemaVersion, "1.2.0");
    assert.equal(original.distribution.environment, "development");
    assert.equal(original.distribution.dataBoundary, "organization");
    const downgraded = { ...original, schemaVersion: "1.1.0" };
    delete downgraded.distribution;
    delete downgraded.deploymentInputSha256;
    const cases = [
      [{ ...original, distribution: { ...original.distribution, versionPolicy: "latest" } }, /distribution.*invalid or stale/i],
      [{ ...original, deploymentInputSha256: "0".repeat(64) }, /deployment.*invalid or stale/i],
      [downgraded, /cannot review distribution|requires.*1\.2\.0/i]
    ];
    for (const [invalid, expected] of cases) {
      await writeFile(planPath, `${JSON.stringify(invalid, null, 2)}\n`, "utf8");
      const rejected = run(project, "apply", blueprintPath, ["--plan", planPath, "--accept-risk"]);
      assert.notEqual(rejected.status, 0);
      assert.match(rejected.stderr, expected);
    }
    const target = path.join(project, ".github", "agents", `${candidate.id}.agent.md`);
    assert.equal(existsSync(target), false);
    await writeFile(planPath, `${JSON.stringify(original, null, 2)}\n`, "utf8");
    const applied = run(project, "apply", blueprintPath, ["--plan", planPath, "--accept-risk"]);
    assert.equal(applied.status, 0, applied.stderr);
    assert.equal(await readFile(target, "utf8"), original.renderedAgent);
    assert.equal(existsSync(path.join(project, "reports", "agent-deployment-result.json")), false);
  } finally {
    await rm(project, { recursive: true, force: true });
  }
});

test("Agent Builder requires approval and rejects stale plans", async () => {
  const { project, blueprintPath } = await fixture();
  try {
    assert.equal(run(project, "plan", blueprintPath).status, 0);
    const planPath = path.join(project, "reports", "agent-builder-plan.json");
    const withoutApproval = run(project, "apply", blueprintPath, ["--plan", planPath]);
    assert.notEqual(withoutApproval.status, 0);
    assert.match(withoutApproval.stderr, /--accept-risk/);

    const target = path.join(project, ".github", "agents", "accessibility-reviewer.agent.md");
    await writeFile(target, "project-owned agent\n", "utf8");
    const staleDestination = run(project, "apply", blueprintPath, ["--plan", planPath, "--accept-risk"]);
    assert.notEqual(staleDestination.status, 0);
    assert.match(staleDestination.stderr, /destination changed/);
    assert.equal(await readFile(target, "utf8"), "project-owned agent\n");

    await rm(target);
    const changed = blueprint({ purpose: "Review current accessibility evidence and report defects without changing any project files." });
    await writeFile(blueprintPath, `${JSON.stringify(changed, null, 2)}\n`, "utf8");
    const staleBlueprint = run(project, "apply", blueprintPath, ["--plan", planPath, "--accept-risk"]);
    assert.notEqual(staleBlueprint.status, 0);
    assert.match(staleBlueprint.stderr, /Blueprint changed/);
  } finally {
    await rm(project, { recursive: true, force: true });
  }
});

test("Agent Builder rejects boolean flag values and extra positionals before writes", async (context) => {
  const cases = [
    ["negative false", ["--accept-risk", "false"]],
    ["negative no", ["--accept-risk", "no"]],
    ["valued true", ["--accept-risk", "true"]],
    ["JSON flag value", ["--accept-risk", "--json", "false"]],
    ["extra command", ["--accept-risk", "validate"]],
    ["extra positional", ["unused-input", "--accept-risk"]],
    ["equals form", ["--accept-risk=false"]],
    ["bare approval", ["--accept-risk"]]
  ];
  for (const [name, extra] of cases) {
    await context.test(name, async () => {
      const { project, blueprintPath } = await fixture();
      try {
        const target = path.join(project, ".github", "agents", "accessibility-reviewer.agent.md");
        await writeFile(target, "Preserve the original agent until valid approval.\n");
        assert.equal(run(project, "plan", blueprintPath).status, 0);
        const planPath = path.join(project, "reports", "agent-builder-plan.json");
        const plan = JSON.parse(await readFile(planPath, "utf8"));
        const before = await snapshotNativeFixture(project);
        const result = run(project, "apply", blueprintPath, ["--plan", planPath, ...extra]);
        if (name === "bare approval") {
          assert.equal(result.status, 0);
          assert.equal(await readFile(target, "utf8"), plan.renderedAgent);
        } else {
          assert.equal(result.status, 1, "valued flags and extra positionals must fail closed");
          assert.deepEqual(await snapshotNativeFixture(project), before);
          assert.equal(/command|flag|parameter/i.test(result.stderr), true);
        }
      } finally { await rm(project, { recursive: true, force: true }); }
    });
  }
});

test("Agent Builder rechecks destination state while holding its apply lock", async () => {
  const { project, blueprintPath } = await fixture();
  try {
    assert.equal(run(project, "plan", blueprintPath).status, 0);
    const planPath = path.join(project, "reports", "agent-builder-plan.json");
    const target = path.join(project, ".github", "agents", "accessibility-reviewer.agent.md");
    await writeFile(target, "changed before lock\n", "utf8");
    const result = run(project, "apply", blueprintPath, ["--plan", planPath, "--accept-risk"]);
    assert.notEqual(result.status, 0);
    assert.match(result.stderr, /destination changed/);
    assert.equal(await readFile(target, "utf8"), "changed before lock\n");
  } finally {
    await rm(project, { recursive: true, force: true });
  }
});

test("Agent Builder preserves destination ownership across apply failures", async (context) => {
  const original = "Original project-owned agent.\n";
  const concurrent = "Concurrent user edit.\n";
  const cases = [
    ["none", 0, null],
    ["after-lock", 1, "changed while acquiring"],
    ["transaction-directory", 1, "fixture-EACCES"],
    ["backup-copy", 1, "fixture-EIO"],
    ["partial-backup-copy", 1, "fixture-EIO"],
    ["before-replacement", 1, "fixture-rename"],
    ["after-replacement", 1, "fixture-journal"],
    ["concurrent-after-replacement", 1, "Installed agent hash"]
  ];
  for (const [fault, expectedStatus, message] of cases) {
    await context.test(fault, async () => {
      const { project, blueprintPath } = await fixture();
      try {
        const target = path.join(project, ".github", "agents", "accessibility-reviewer.agent.md");
        const planPath = path.join(project, "reports", "agent-builder-plan.json");
        await writeFile(target, original);
        const planned = run(project, "plan", blueprintPath);
        assert.equal(planned.status, 0, planned.stderr);
        const plan = JSON.parse(await readFile(planPath, "utf8"));
        const script = `
          import fsp from "node:fs/promises";
          import path from "node:path";
          import { syncBuiltinESMExports } from "node:module";
          const original = { ...fsp };
          const target = ${JSON.stringify(target)};
          const fault = ${JSON.stringify(fault)};
          let injections = 0, replacements = 0, removals = 0;
          const fail = (message, code) => { injections += 1; throw Object.assign(new Error(message), { code }); };
          fsp.writeFile = async (file, ...args) => {
            const result = await original.writeFile(file, ...args);
            if (fault === "after-lock" && String(file).endsWith("agent-builder.lock")) {
              injections += 1;
              await original.writeFile(target, ${JSON.stringify(concurrent)});
            }
            return result;
          };
          fsp.open = async (file, ...args) => {
            const handle = await original.open(file, ...args);
            if (fault === "after-lock" && String(file).endsWith("agent-builder.lock")) {
              const write = handle.writeFile.bind(handle);
              handle.writeFile = async (...values) => {
                const result = await write(...values);
                injections += 1;
                await original.writeFile(target, ${JSON.stringify(concurrent)});
                return result;
              };
            }
            return handle;
          };
          fsp.mkdir = async (directory, ...args) => {
            if (fault === "transaction-directory" && /^AGT-/.test(path.basename(directory))) fail("fixture-EACCES", "EACCES");
            return original.mkdir(directory, ...args);
          };
          fsp.copyFile = async (from, to, ...args) => {
            if (String(to).endsWith("agent.backup.md") && ["backup-copy", "partial-backup-copy"].includes(fault)) {
              if (fault === "partial-backup-copy") await original.writeFile(to, "Partial backup");
              fail("fixture-EIO", "EIO");
            }
            return original.copyFile(from, to, ...args);
          };
          fsp.rename = async (from, to) => {
            if (to === target && fault === "before-replacement") fail("fixture-rename", "EACCES");
            if (String(to).endsWith("transaction.json") && replacements && fault === "after-replacement" && !injections) fail("fixture-journal", "EIO");
            const result = await original.rename(from, to);
            if (to === target) {
              replacements += 1;
              if (fault === "concurrent-after-replacement") {
                injections += 1;
                await original.writeFile(target, ${JSON.stringify(concurrent)});
              }
            }
            return result;
          };
          fsp.rm = async (file, ...args) => {
            if (file === target) removals += 1;
            return original.rm(file, ...args);
          };
          syncBuiltinESMExports();
          process.on("exit", () => console.log("apply-trace:" + JSON.stringify({ injections, replacements, removals })));
          process.argv = [process.execPath, ${JSON.stringify(builder)}, "apply", "--project", ${JSON.stringify(project)},
            "--blueprint", ${JSON.stringify(blueprintPath)}, "--plan", ${JSON.stringify(planPath)}, "--accept-risk"];
          await import(${JSON.stringify(pathToFileURL(builder).href)});
        `;
        const applied = spawnSync(process.execPath, ["--input-type=module", "-e", script], { cwd: project, encoding: "utf8", timeout: 30000 });
        assert.equal(applied.status, expectedStatus, applied.stderr);
        const trace = JSON.parse(applied.stdout.match(/^apply-trace:(.+)$/m)?.[1] ?? "null");
        assert.ok(trace, "the real CLI must reach the subprocess exit trace");
        assert.equal(trace.injections, fault === "none" ? 0 : 1);
        if (message) assert.ok(applied.stderr.includes(message), "the original failure diagnostic must survive rollback");
        const expected = fault === "none" ? plan.renderedAgent
          : ["after-lock", "concurrent-after-replacement"].includes(fault) ? concurrent : original;
        assert.equal(await readFile(target, "utf8"), expected);
        assert.equal(existsSync(path.join(project, ".skills-orchestrator", "agent-builder.lock")), false);
        if (!["none", "after-replacement", "concurrent-after-replacement"].includes(fault)) {
          assert.equal(trace.replacements, 0);
          assert.equal(trace.removals, 0, "pre-write failures must never remove the destination");
        }
        if (fault === "concurrent-after-replacement") assert.equal(trace.removals, 0, "rollback must not remove a concurrent user's replacement");
        if (fault !== "none") assert.equal(existsSync(path.join(project, "reports", "agent-builder-result.json")), false);
      } finally { await rm(project, { recursive: true, force: true }); }
    });
  }
});

test("Agent Builder initial lock write failures clean only owned locks", async (context) => {
  for (const fault of ["empty-write-failure", "partial-write-failure", "preexisting-lock", "none"]) {
    await context.test(fault, async () => {
      const { project, blueprintPath } = await fixture();
      try {
        const target = path.join(project, ".github", "agents", "accessibility-reviewer.agent.md");
        const lockPath = path.join(project, ".skills-orchestrator", "agent-builder.lock");
        const planPath = path.join(project, "reports", "agent-builder-plan.json");
        const originalAgent = "Original agent before any lock write.\n";
        const preexisting = "Another operation owns this lock.\n";
        await writeFile(target, originalAgent);
        assert.equal(run(project, "plan", blueprintPath).status, 0);
        if (fault === "preexisting-lock") {
          await mkdir(path.dirname(lockPath), { recursive: true });
          await writeFile(lockPath, preexisting);
        }
        const script = `
          import fsp from "node:fs/promises";
          import { syncBuiltinESMExports } from "node:module";
          const original = { ...fsp };
          const lock = ${JSON.stringify(lockPath)}, fault = ${JSON.stringify(fault)};
          const failWrite = fault.endsWith("write-failure");
          let injections = 0, opened = 0, closed = 0, removed = 0;
          const failure = () => { injections += 1; throw Object.assign(new Error("fixture-lock-write"), { code: "ENOSPC" }); };
          fsp.writeFile = async (file, data, options) => {
            if (file === lock && failWrite) {
              await original.writeFile(file, fault === "partial-write-failure" ? "partial lock" : "", options);
              failure();
            }
            return original.writeFile(file, data, options);
          };
          fsp.open = async (file, ...args) => {
            const handle = await original.open(file, ...args);
            if (file === lock) {
              opened += 1;
              const write = handle.writeFile.bind(handle), close = handle.close.bind(handle);
              handle.writeFile = async (...values) => {
                if (failWrite) {
                  if (fault === "partial-write-failure") await write("partial lock", "utf8");
                  failure();
                }
                return write(...values);
              };
              handle.close = async () => { await close(); closed += 1; };
            }
            return handle;
          };
          fsp.rm = async (file, ...args) => {
            if (file === lock) removed += 1;
            return original.rm(file, ...args);
          };
          syncBuiltinESMExports();
          process.on("exit", () => console.log("lock-trace:" + JSON.stringify({ injections, opened, closed, removed })));
          process.argv = [process.execPath, ${JSON.stringify(builder)}, "apply", "--project", ${JSON.stringify(project)},
            "--blueprint", ${JSON.stringify(blueprintPath)}, "--plan", ${JSON.stringify(planPath)}, "--accept-risk"];
          await import(${JSON.stringify(pathToFileURL(builder).href)});
        `;
        const applied = spawnSync(process.execPath, ["--input-type=module", "-e", script], { cwd: project, encoding: "utf8", timeout: 30000 });
        assert.equal(applied.status, fault === "none" ? 0 : 1);
        const trace = JSON.parse(applied.stdout.match(/^lock-trace:(.+)$/m)?.[1] ?? "null");
        assert.ok(trace);
        assert.equal(trace.opened, trace.closed, "owned lock handles must close");
        if (fault === "preexisting-lock") {
          assert.equal(trace.injections, 0);
          assert.equal(trace.opened, 0);
          assert.equal(trace.removed, 0);
          assert.equal(await readFile(lockPath, "utf8"), preexisting);
          assert.equal(await readFile(target, "utf8"), originalAgent);
          assert.equal(existsSync(path.join(project, "reports", "agent-builder-result.json")), false);
        } else {
          assert.equal(existsSync(lockPath), false, "failed initial writes must not strand an owned lock");
          assert.equal(trace.removed, 1);
          if (fault !== "none") {
            assert.equal(trace.injections, 1);
            assert.match(applied.stderr, /fixture-lock-write/);
            assert.equal(await readFile(target, "utf8"), originalAgent);
            assert.equal(existsSync(path.join(project, "reports", "agent-builder-result.json")), false);
            assert.equal(run(project, "apply", blueprintPath, ["--plan", planPath, "--accept-risk"]).status, 0, "a clean retry must not find an orphan lock");
          }
        }
      } finally { await rm(project, { recursive: true, force: true }); }
    });
  }
});

async function resultTransactionFixture(action, priorResult = true) {
  const created = await fixture();
  const { renderAgent } = await import(pathToFileURL(builder).href);
  const target = path.join(created.project, ".github", "agents", "accessibility-reviewer.agent.md");
  const resultPath = path.join(created.project, "reports", "agent-builder-result.json");
  const planPath = path.join(created.project, "reports", "agent-builder-plan.json");
  const originalAgent = action === "create" ? null : action === "unchanged" ? renderAgent(blueprint()) : "Original agent before result commit.\n";
  const originalResult = priorResult ? `${JSON.stringify({
    schemaVersion: "1.0.0", completedAt: "2000-01-01T00:00:00.000Z", status: "applied", action: "update",
    targetPath: ".github/agents/accessibility-reviewer.agent.md", blueprintSha256: "0".repeat(64),
    renderedSha256: "1".repeat(64), transactionId: null
  }, null, 2)}\n` : null;
  if (originalAgent !== null) await writeFile(target, originalAgent);
  if (originalResult !== null) await writeFile(resultPath, originalResult);
  assert.equal(run(created.project, "plan", created.blueprintPath).status, 0);
  const plan = JSON.parse(await readFile(planPath, "utf8"));
  assert.equal(plan.action, action);
  return { ...created, target, resultPath, planPath, plan, originalAgent, originalResult };
}

function runResultTransactionFault(fixture, fault) {
  const script = `
    import fsp from "node:fs/promises";
    import { existsSync } from "node:fs";
    import path from "node:path";
    import { syncBuiltinESMExports } from "node:module";
    const original = { ...fsp }, fault = ${JSON.stringify(fault)};
    const target = ${JSON.stringify(fixture.target)}, resultPath = ${JSON.stringify(fixture.resultPath)};
    const lock = ${JSON.stringify(path.join(fixture.project, ".skills-orchestrator", "agent-builder.lock"))};
    const plan = ${JSON.stringify(fixture.plan)};
    const agentEdit = "Concurrent user agent edit.\\n", resultEdit = "Concurrent user result edit.\\n";
    let primary = 0, secondary = 0, resultAttempts = 0, targetRenames = 0, resultRenames = 0;
    let allResultOpsLocked = true, allRecoveryOpsLocked = true, earlyApplied = false, edited = false;
    const pending = (file, final) => typeof file === "string" && file.startsWith(final + ".") && file.endsWith(".tmp");
    const fail = (kind) => {
      if (kind === "primary") primary += 1; else secondary += 1;
      throw Object.assign(new Error(kind === "primary" ? "fixture-result-commit" : "fixture-recovery"), { code: "EIO" });
    };
    const resultOperation = () => { resultAttempts += 1; allResultOpsLocked &&= existsSync(lock); };
    const recoveryOperation = () => { if (primary) allRecoveryOpsLocked &&= existsSync(lock); };
    const outcomeValid = async () => {
      if (!existsSync(target) || !existsSync(resultPath)) return false;
      try {
        const value = JSON.parse(await original.readFile(resultPath, "utf8"));
        return await original.readFile(target, "utf8") === plan.renderedAgent &&
          value.status === "applied" && value.blueprintSha256 === plan.blueprintSha256 &&
          value.renderedSha256 === plan.renderedSha256 && value.action === plan.action;
      } catch { return false; }
    };
    const beforeWrite = async (file, writePartial) => {
      recoveryOperation();
      if (pending(file, resultPath)) {
        resultOperation();
        if (["result-temp-write", "pending-cleanup"].includes(fault) && !primary) { await writePartial("partial result"); fail("primary"); }
        if (fault === "result-restore-write" && primary && resultRenames) fail("secondary");
        if (fault === "concurrent-result" && !edited) {
          edited = true;
          await original.writeFile(resultPath, resultEdit);
        }
      }
      if (pending(file, target) && fault === "agent-restore-write" && primary) fail("secondary");
    };
    fsp.writeFile = async (file, data, options) => {
      await beforeWrite(file, (partial) => original.writeFile(file, partial, options));
      return original.writeFile(file, data, options);
    };
    fsp.open = async (file, ...args) => {
      const handle = await original.open(file, ...args);
      if (file === lock && fault === "lock-close-after-commit") {
        const close = handle.close.bind(handle);
        handle.close = async () => { await close(); fail("secondary"); };
      }
      if (pending(file, target) || pending(file, resultPath)) {
        const write = handle.writeFile.bind(handle);
        handle.writeFile = async (...values) => {
          await beforeWrite(file, (partial) => write(partial, "utf8"));
          return write(...values);
        };
      }
      return handle;
    };
    fsp.readFile = async (file, ...args) => {
      recoveryOperation();
      if (fault === "agent-restore-read" && primary && String(file).endsWith("agent.backup.md")) fail("secondary");
      return original.readFile(file, ...args);
    };
    fsp.rename = async (from, to) => {
      recoveryOperation();
      if (to === resultPath) {
        resultOperation();
        if (fault === "concurrent-agent" && !edited) {
          edited = true;
          await original.writeFile(target, agentEdit);
        }
        if (!primary && ["result-rename", "concurrent-agent", "agent-restore-read", "agent-restore-write",
          "agent-restore-rename", "create-rollback-remove", "recovery-record"].includes(fault)) fail("primary");
        if (fault === "result-restore-rename" && primary && resultRenames) fail("secondary");
      }
      if (to === target && fault === "agent-restore-rename" && primary) fail("secondary");
      if (String(to).endsWith("transaction.json")) {
        const record = JSON.parse(await original.readFile(from, "utf8"));
        if (record.status === "applied") {
          earlyApplied ||= !(await outcomeValid());
          if (!primary && ["commit-record", "result-restore-write", "result-restore-rename"].includes(fault)) fail("primary");
        } else if (fault === "recovery-record" && primary && record.status !== "prepared") fail("secondary");
      }
      const result = await original.rename(from, to);
      if (to === target) targetRenames += 1;
      if (to === resultPath) {
        resultRenames += 1;
        if (!edited && fault === "concurrent-result-after-publish") {
          edited = true;
          await original.writeFile(resultPath, resultEdit);
        }
        if (!edited && fault === "concurrent-agent-after-result") {
          edited = true;
          await original.writeFile(target, agentEdit);
        }
      }
      return result;
    };
    fsp.rm = async (file, ...args) => {
      if (file !== lock) recoveryOperation();
      if (file === target && fault === "create-rollback-remove" && primary) fail("secondary");
      if (pending(file, resultPath) && fault === "pending-cleanup" && primary) fail("secondary");
      if (file === lock && fault === "lock-remove-after-commit") fail("secondary");
      return original.rm(file, ...args);
    };
    syncBuiltinESMExports();
    process.on("exit", () => console.log("result-trace:" + JSON.stringify({
      primary, secondary, resultAttempts, targetRenames, resultRenames,
      allResultOpsLocked, allRecoveryOpsLocked, earlyApplied
    })));
    process.argv = [process.execPath, ${JSON.stringify(builder)}, "apply", "--project", ${JSON.stringify(fixture.project)},
      "--blueprint", ${JSON.stringify(fixture.blueprintPath)}, "--plan", ${JSON.stringify(fixture.planPath)}, "--accept-risk"];
    await import(${JSON.stringify(pathToFileURL(builder).href)});
  `;
  const result = spawnSync(process.execPath, ["--input-type=module", "-e", script], {
    cwd: fixture.project, encoding: "utf8", timeout: 30000
  });
  const trace = JSON.parse(result.stdout.match(/^result-trace:(.+)$/m)?.[1] ?? "null");
  assert.ok(trace, "the actual CLI must reach its outcome trace");
  return { result, trace };
}

async function readClassicTransaction(project) {
  const directory = path.join(project, ".skills-orchestrator", "agent-builder");
  const entries = existsSync(directory) ? await readdir(directory) : [];
  const ids = entries.filter((name) => /^AGT-/.test(name));
  assert.equal(ids.length, 1, "each attempt needs a recoverable internal outcome journal");
  const root = path.join(directory, ids[0]);
  return { root, record: JSON.parse(await readFile(path.join(root, "transaction.json"), "utf8")) };
}

test("Agent Builder commits agent and result under one owned transaction lock", async (context) => {
  const schemaCases = [];
  for (const action of ["create", "update", "unchanged"]) {
    for (const priorResult of [false, true]) {
      for (const fault of ["result-temp-write", "result-rename", "commit-record", "none"]) {
        await context.test(`${action}, prior result ${priorResult}, ${fault}`, async () => {
          const fixture = await resultTransactionFixture(action, priorResult);
          try {
            const { result, trace } = runResultTransactionFault(fixture, fault);
            assert.equal(result.status, fault === "none" ? 0 : 1);
            assert.equal(trace.allResultOpsLocked, true, "result persistence must remain inside the lock lifetime");
            assert.equal(trace.allRecoveryOpsLocked, true, "recovery must finish before releasing the lock");
            assert.equal(trace.earlyApplied, false, "applied cannot precede a valid agent/result pair");
            assert.equal(existsSync(path.join(fixture.project, ".skills-orchestrator", "agent-builder.lock")), false);
            const { record, root } = await readClassicTransaction(fixture.project);
            if (fault === "none") {
              assert.equal(await readFile(fixture.target, "utf8"), fixture.plan.renderedAgent);
              const bytes = await readFile(fixture.resultPath);
              const outcome = JSON.parse(bytes);
              assert.equal(outcome.action, action);
              if (action === "unchanged") assert.equal(outcome.transactionId, null, "public no-op result compatibility is preserved");
              assert.equal(record.status, "applied");
              assert.equal(record.resultSha256, createHash("sha256").update(bytes).digest("hex"));
              schemaCases.push({ name: `${action}/${priorResult}`, schema: "agent-builder-result.schema.json", value: outcome, expected: true });
            } else {
              assert.equal(trace.primary, 1);
              assert.equal(trace.secondary, 0);
              assert.equal(record.status, "rolled-back");
              assert.equal(existsSync(fixture.target), fixture.originalAgent !== null);
              if (fixture.originalAgent !== null) assert.equal(await readFile(fixture.target, "utf8"), fixture.originalAgent);
              assert.equal(existsSync(fixture.resultPath), fixture.originalResult !== null);
              if (fixture.originalResult !== null) assert.equal(await readFile(fixture.resultPath, "utf8"), fixture.originalResult);
            }
            if (action === "update") assert.equal(await readFile(path.join(root, "agent.backup.md"), "utf8"), fixture.originalAgent);
            if (priorResult) assert.equal(await readFile(path.join(root, "result.backup.json"), "utf8"), fixture.originalResult);
            const files = await snapshotNativeFixture(fixture.project);
            assert.equal(files.some(([name]) => name.endsWith(".tmp")), false, "owned partial temporary files must be cleaned");
          } finally { await rm(fixture.project, { recursive: true, force: true }); }
        });
      }
    }
  }
  await context.test("actual successful result schemas", async () => {
    assert.equal(schemaCases.length, 6);
    await assertActualBuilderSchemas(schemaCases);
  });
});

test("Agent Builder reports incomplete rollback while retaining transaction backups", async (context) => {
  const cases = [
    ["update", "agent-restore-read"], ["update", "agent-restore-write"], ["update", "agent-restore-rename"],
    ["create", "create-rollback-remove"], ["update", "result-restore-write"], ["update", "result-restore-rename"],
    ["update", "recovery-record"]
  ];
  for (const [action, fault] of cases) {
    await context.test(fault, async () => {
      const fixture = await resultTransactionFixture(action);
      try {
        const { result, trace } = runResultTransactionFault(fixture, fault);
        assert.equal(result.status, 1);
        assert.equal(trace.primary, 1);
        assert.equal(trace.secondary, 1, "the deliberate restoration/evidence failure must actually be reached");
        assert.equal(trace.allResultOpsLocked && trace.allRecoveryOpsLocked, true);
        assert.equal(trace.earlyApplied, false);
        assert.equal(/recovery|rollback/i.test(result.stderr), true);
        assert.equal(existsSync(path.join(fixture.project, ".skills-orchestrator", "agent-builder.lock")), false);
        const { root, record } = await readClassicTransaction(fixture.project);
        assert.equal(record.status, fault === "recovery-record" ? "prepared" : "recovery-required");
        if (action === "update") assert.equal(await readFile(path.join(root, "agent.backup.md"), "utf8"), fixture.originalAgent);
        assert.equal(await readFile(path.join(root, "result.backup.json"), "utf8"), fixture.originalResult);
        if (fault.startsWith("agent-") || fault === "create-rollback-remove") {
          assert.equal(await readFile(fixture.target, "utf8"), fixture.plan.renderedAgent);
          assert.equal(await readFile(fixture.resultPath, "utf8"), fixture.originalResult);
        } else {
          assert.equal(await readFile(fixture.target, "utf8"), fixture.originalAgent);
          if (fault === "recovery-record") assert.equal(await readFile(fixture.resultPath, "utf8"), fixture.originalResult);
          else assert.equal(JSON.parse(await readFile(fixture.resultPath, "utf8")).blueprintSha256, fixture.plan.blueprintSha256);
        }
      } finally { await rm(fixture.project, { recursive: true, force: true }); }
    });
  }
});

test("Agent Builder preserves concurrent agent and result edits during outcome failure", async (context) => {
  for (const fault of ["concurrent-agent", "concurrent-result", "concurrent-result-after-publish", "concurrent-agent-after-result"]) {
    await context.test(fault, async () => {
      const fixture = await resultTransactionFixture("update");
      try {
        const { result, trace } = runResultTransactionFault(fixture, fault);
        assert.equal(result.status, 1);
        assert.equal(trace.allResultOpsLocked && trace.allRecoveryOpsLocked, true);
        assert.equal(trace.earlyApplied, false);
        const agentChanged = fault.startsWith("concurrent-agent");
        assert.equal(await readFile(fixture.target, "utf8"), agentChanged ? "Concurrent user agent edit.\n" : fixture.originalAgent);
        assert.equal(await readFile(fixture.resultPath, "utf8"), agentChanged ? fixture.originalResult : "Concurrent user result edit.\n");
        const { root, record } = await readClassicTransaction(fixture.project);
        assert.equal(record.status, "recovery-required");
        assert.equal(await readFile(path.join(root, "agent.backup.md"), "utf8"), fixture.originalAgent);
        assert.equal(await readFile(path.join(root, "result.backup.json"), "utf8"), fixture.originalResult);
        assert.equal(existsSync(path.join(fixture.project, ".skills-orchestrator", "agent-builder.lock")), false);
      } finally { await rm(fixture.project, { recursive: true, force: true }); }
    });
  }
});

test("Agent Builder distinguishes pending cleanup from failures after a valid commit", async (context) => {
  for (const fault of ["pending-cleanup", "lock-close-after-commit", "lock-remove-after-commit"]) {
    await context.test(fault, async () => {
      const fixture = await resultTransactionFixture("update");
      try {
        const { result, trace } = runResultTransactionFault(fixture, fault);
        assert.equal(result.status, 1);
        assert.equal(trace.secondary, 1);
        assert.equal(trace.earlyApplied, false);
        const { root, record } = await readClassicTransaction(fixture.project);
        assert.equal(await readFile(path.join(root, "agent.backup.md"), "utf8"), fixture.originalAgent);
        assert.equal(await readFile(path.join(root, "result.backup.json"), "utf8"), fixture.originalResult);
        if (fault === "pending-cleanup") {
          assert.equal(trace.primary, 1);
          assert.equal(record.status, "recovery-required");
          assert.equal(record.recovery.pending, "cleanup-failed");
          assert.equal(await readFile(fixture.target, "utf8"), fixture.originalAgent);
          assert.equal(await readFile(fixture.resultPath, "utf8"), fixture.originalResult);
          assert.equal(/pending file.*recovery/i.test(result.stderr), true);
        } else {
          assert.equal(trace.primary, 0);
          assert.equal(record.status, "applied", "committed data must not be rolled back for lock cleanup failure");
          assert.equal(await readFile(fixture.target, "utf8"), fixture.plan.renderedAgent);
          const bytes = await readFile(fixture.resultPath);
          assert.equal(record.resultSha256, createHash("sha256").update(bytes).digest("hex"));
          assert.equal(/committed, but lock cleanup failed/i.test(result.stderr), true);
        }
        assert.equal(existsSync(path.join(fixture.project, ".skills-orchestrator", "agent-builder.lock")), fault === "lock-remove-after-commit");
      } finally { await rm(fixture.project, { recursive: true, force: true }); }
    });
  }
});

test("pso agent updates an existing agent with a transaction backup", async () => {
  const { project, blueprintPath } = await fixture();
  try {
    const target = path.join(project, ".github", "agents", "accessibility-reviewer.agent.md");
    const original = "---\nname: Accessibility Reviewer\ndescription: Existing project agent that requires a governed update.\n---\n";
    await writeFile(target, original, "utf8");

    const plan = runRuntime(project, "plan", blueprintPath);
    assert.equal(plan.status, 0, plan.stderr);
    const planPath = path.join(project, "reports", "agent-builder-plan.json");
    const artifact = JSON.parse(await readFile(planPath, "utf8"));
    assert.equal(artifact.action, "update");

    const apply = runRuntime(project, "apply", blueprintPath, ["--plan", planPath, "--accept-risk"]);
    assert.equal(apply.status, 0, apply.stderr);
    const result = JSON.parse(await readFile(path.join(project, "reports", "agent-builder-result.json"), "utf8"));
    assert.equal(result.action, "update");
    const backup = path.join(project, ".skills-orchestrator", "agent-builder", result.transactionId, "agent.backup.md");
    assert.equal(await readFile(backup, "utf8"), original);
    assert.equal(runRuntime(project, "validate", blueprintPath, ["--agent", target]).status, 0);
  } finally {
    await rm(project, { recursive: true, force: true });
  }
});

test("Agent Builder fails closed on unsafe or unresolved capabilities", async () => {
  const { project, blueprintPath } = await fixture();
  try {
    const syntheticConnectionString = [
      "DefaultEndpointsProtocol=https",
      `${"Account"}${"Key"}=${["synthetic", "fixture", "value"].join("-")}`,
      "EndpointSuffix=core.windows.net"
    ].join(";");
    const cases = [
      [blueprint({ capabilities: ["read", "execute"] }), /read-only agents cannot use/],
      [blueprint({ capabilities: ["read", "githubRepo"] }), /Unsupported portable capability/],
      [blueprint({ capabilities: ["read", "agent"], subagents: ["missing-reviewer"] }), /Referenced agents do not exist/],
      [blueprint({ handoffs: [{ label: "Review next", agent: "missing-reviewer", prompt: "Review these findings independently.", send: false }] }), /Referenced agents do not exist/],
      [blueprint({ instructions: { ...blueprint().instructions, constraints: ["Do not expose api_key=abcdefghijklmnop in any output."] } }), /suspected secret material/],
      [blueprint({ instructions: { ...blueprint().instructions, constraints: ["Too short"] } }), /must contain 10-500 characters/],
      [blueprint({ schemaVersion: "1.0.0", agentType: "foundry-hosted" }), /requires an Azure environment binding/],
      [blueprint({
        instructions: {
          ...blueprint().instructions,
          outputFormat: `Use ${syntheticConnectionString}`
        }
      }), /suspected secret material/]
    ];
    for (const [candidate, expected] of cases) {
      await writeFile(blueprintPath, `${JSON.stringify(candidate, null, 2)}\n`, "utf8");
      const result = run(project, "plan", blueprintPath);
      assert.notEqual(result.status, 0);
      assert.match(result.stderr, expected);
    }
    assert.equal(existsSync(path.join(project, "reports", "agent-builder-plan.json")), false);
    await writeFile(blueprintPath, `${JSON.stringify(blueprint(), null, 2)}\n`, "utf8");
    const outside = path.join(project, "outside.agent.md");
    await writeFile(outside, "outside\n", "utf8");
    const outsideValidation = run(project, "validate", blueprintPath, ["--agent", outside]);
    assert.notEqual(outsideValidation.status, 0);
    assert.match(outsideValidation.stderr, /must match the blueprint target/);
  } finally {
    await rm(project, { recursive: true, force: true });
  }
});

test("Agent Builder exported and CLI validation diagnostics omit rejected input values", async (context) => {
  const { validateBlueprint, normalizeDistribution } = await import(pathToFileURL(builder).href);
  for (const shape of ["credential-shaped", "opaque"]) {
    const canary = randomBytes(16).toString("hex");
    const value = shape === "credential-shaped" ? `api_key=${canary}` : `private_${canary}`;
    const cases = [
      ["capability", blueprint({ capabilities: ["read", value] })],
      ["subagent", blueprint({ capabilities: ["read", "agent"], subagents: [value] })],
      ["unknown-field", blueprint({ [value]: true })],
      ["unknown-nested-field", blueprint({ invocation: { ...blueprint().invocation, [value]: true } })],
      ["approval-gate", blueprint({
        schemaVersion: "2.1.0", agentType: "copilot",
        autonomy: { mode: "guided", approvalRequiredFor: [value, ...approvalGates.slice(1)], webSafety: "standard" }
      })]
    ];
    if (shape === "opaque") cases.push(["duplicate-handoff", blueprint({
      handoffs: ["First review", "Second review"].map((label) => ({
        label, agent: `private-${canary}`, prompt: "Review these findings independently.", send: false
      }))
    })]);
    for (const [name, candidate] of cases) {
      await context.test(`${shape}: ${name}`, async () => {
        const original = JSON.stringify(candidate);
        const apiResults = [];
        for (const validate of [validateBlueprint, normalizeDistribution]) {
          let rejected = false;
          let echoed = false;
          try { validate(candidate); }
          catch (error) { rejected = true; echoed = error.message.includes(canary); }
          apiResults.push({ rejected, echoed, unchanged: JSON.stringify(candidate) === original });
        }
        const { project, blueprintPath } = await fixture();
        try {
          await writeFile(blueprintPath, original);
          const result = run(project, "validate", blueprintPath);
          assert.equal((result.stdout + result.stderr).includes(canary), false, "CLI validation must not echo the runtime canary");
          assert.equal(result.status, 1);
          assert.equal(apiResults.some((item) => item.echoed), false, "exported validation must not echo rejected values or unknown field names");
          assert.equal(apiResults.every((item) => item.rejected && item.unchanged), true);
          assert.equal((await readFile(blueprintPath, "utf8")) === original, true);
        } finally { await rm(project, { recursive: true, force: true }); }
      });
    }
  }
});

test("Agent Builder CLI argument, JSON and reference diagnostics suppress supplied values", async (context) => {
  for (const name of ["unknown-option", "missing-option-value", "unknown-command", "unknown-plan-field", "malformed-plan", "unresolved-reference", "cycle-diagnostic", "missing-project", "missing-agent"]) {
    await context.test(name, async () => {
      const { project, blueprintPath } = await fixture();
      const canary = `c${randomBytes(16).toString("hex")}`;
      const value = `private_${canary}`;
      try {
        let result;
        const common = ["--project", project, "--blueprint", blueprintPath];
        if (name === "unknown-option") {
          result = spawnSync(process.execPath, [builder, "validate", ...common, `--${value}`, "unused"], { encoding: "utf8" });
        } else if (name === "missing-option-value") {
          result = spawnSync(process.execPath, [builder, "validate", ...common, `--${value}`], { encoding: "utf8" });
        } else if (name === "unknown-command") {
          result = spawnSync(process.execPath, [builder, value, ...common], { encoding: "utf8" });
        } else if (name === "missing-project") {
          result = spawnSync(process.execPath, [builder, "validate", "--project", path.join(project, value), "--blueprint", blueprintPath], { encoding: "utf8" });
        } else if (name === "missing-agent") {
          assert.equal(run(project, "plan", blueprintPath).status, 0);
          assert.equal(run(project, "apply", blueprintPath, ["--plan", path.join(project, "reports", "agent-builder-plan.json"), "--accept-risk"]).status, 0);
          result = run(project, "validate", blueprintPath, ["--agent", path.join(project, `${value}.agent.md`)]);
        } else if (["unknown-plan-field", "malformed-plan"].includes(name)) {
          assert.equal(run(project, "plan", blueprintPath).status, 0);
          const planPath = path.join(project, "reports", "agent-builder-plan.json");
          if (name === "unknown-plan-field") {
            const plan = JSON.parse(await readFile(planPath, "utf8"));
            plan[value] = true;
            await writeFile(planPath, JSON.stringify(plan));
          } else await writeFile(planPath, `${canary} malformed JSON`);
          result = run(project, "apply", blueprintPath, ["--plan", planPath, "--accept-risk"]);
        } else {
          const referenced = `private-${canary}`;
          await writeFile(blueprintPath, JSON.stringify(blueprint({ capabilities: ["read", "agent"], subagents: [referenced] })));
          if (name === "cycle-diagnostic") {
            await writeFile(path.join(project, ".github", "agents", `${referenced}.agent.md`),
              `---\nname: Existing reviewer\nagents: ["accessibility-reviewer"]\n---\n`);
          }
          result = run(project, "validate", blueprintPath);
        }
        const output = result.stdout + result.stderr;
        assert.equal(output.includes(canary.slice(0, 8)), false, "CLI diagnostics must suppress supplied values, including JSON excerpts");
        assert.equal(result.status, 1);
        assert.equal(existsSync(path.join(project, ".github", "agents", "accessibility-reviewer.agent.md")), name === "missing-agent");
      } finally { await rm(project, { recursive: true, force: true }); }
    });
  }
});

test("Agent Builder rejects linked report and agent directories", async (context) => {
  const { project, blueprintPath } = await fixture();
  const outside = await mkdtemp(path.join(os.tmpdir(), "pso-agent-builder-outside-"));
  try {
    await rm(path.join(project, "reports"), { recursive: true, force: true });
    try {
      await symlink(outside, path.join(project, "reports"), process.platform === "win32" ? "junction" : "dir");
    } catch (error) {
      if (["EPERM", "EACCES", "UNKNOWN"].includes(error.code)) return context.skip("Creating links requires additional permission");
      throw error;
    }
    const linkedReports = run(project, "plan", blueprintPath);
    assert.notEqual(linkedReports.status, 0);
    assert.match(linkedReports.stderr, /Symbolic links are not allowed/);
  } finally {
    await rm(project, { recursive: true, force: true });
    await rm(outside, { recursive: true, force: true });
  }
});

test("Agent Builder rejects invocation cycles across workspace agents", async () => {
  const { project, blueprintPath } = await fixture();
  try {
    await writeFile(path.join(project, ".github", "agents", "second-reviewer.agent.md"), `---
name: Second Reviewer
description: Existing reviewer that hands work back to the accessibility reviewer.
tools: ["read", "agent"]
handoffs:
  - label: Return review
    agent: accessibility-reviewer
    prompt: Return the independent findings for reconciliation.
    send: false
---
`, "utf8");
    const candidate = blueprint({
      capabilities: ["read", "agent"],
      handoffs: [{ label: "Independent review", agent: "second-reviewer", prompt: "Review the findings independently before completion.", send: false }]
    });
    await writeFile(blueprintPath, `${JSON.stringify(candidate, null, 2)}\n`, "utf8");
    const result = run(project, "validate", blueprintPath);
    assert.notEqual(result.status, 0);
    assert.match(result.stderr, /Agent invocation cycle/);
  } finally {
    await rm(project, { recursive: true, force: true });
  }
});

test("Agent Builder cycle detection is equivalent across supported reference forms", async (context) => {
  const forms = [
    ["quoted flow", 'agents: ["accessibility-reviewer"]'],
    ["single-quoted flow", "agents: ['accessibility-reviewer']"],
    ["plain flow", "agents: [accessibility-reviewer]"],
    ["block list", "agents:\n  - accessibility-reviewer"],
    ["quoted block list", 'agents:\n  - "accessibility-reviewer"'],
    ["indentless block list", "agents:\n- accessibility-reviewer"],
    ["flow comment", "agents: [accessibility-reviewer] # explicit target"],
    ["block comment", "agents: # explicit targets\n  # first target\n  - accessibility-reviewer # reviewed"],
    ["quoted key", '"agents": [accessibility-reviewer]'],
    ["spaced key", "agents : [accessibility-reviewer]"],
    ["block handoff", 'handoffs:\n  - label: Review\n    agent: "accessibility-reviewer"\n    prompt: Review the findings.\n    send: false'],
    ["agent-first handoff", "handoffs:\n  - agent: accessibility-reviewer\n    label: Review\n    prompt: Review the findings.\n    send: false"]
  ];
  for (const [name, declaration] of forms) {
    await context.test(name, async () => {
      const { project, blueprintPath } = await fixture();
      try {
        const second = path.join(project, ".github", "agents", "second-reviewer.agent.md");
        const render = (value) => `---\nname: Second Reviewer\n${value}\n---\nReview only.\n`;
        await writeFile(blueprintPath, JSON.stringify(blueprint({ capabilities: ["read", "agent"], subagents: ["second-reviewer"] })));
        await writeFile(second, render(declaration));
        const cycle = run(project, "plan", blueprintPath);
        assert.equal(cycle.status, 1);
        assert.match(cycle.stderr, /Agent invocation cycle/);
        assert.equal(existsSync(path.join(project, "reports", "agent-builder-plan.json")), false);
        await writeFile(path.join(project, ".github", "agents", "third-reviewer.agent.md"), "A reviewer without outgoing references.\n");
        await writeFile(second, render(declaration.replaceAll("accessibility-reviewer", "third-reviewer")));
        assert.equal(run(project, "plan", blueprintPath).status, 0, "the equivalent acyclic form must remain supported");
      } finally { await rm(project, { recursive: true, force: true }); }
    });
  }
});

test("Agent Builder fails closed on unsupported reference forms without treating prompt text as edges", async (context) => {
  const forms = [
    "agents: &selected [accessibility-reviewer]",
    "agents: *selected",
    'agents: ["*"]',
    "agents: null",
    'agents: []\nagents: ["accessibility-reviewer"]',
    'agents: [\n  "accessibility-reviewer"\n]',
    "handoffs: [{agent: accessibility-reviewer}]",
    "handoffs:\n  - agent: *selected\n    prompt: Review.",
    'handoffs:\n  - label: Review\n    agent: second-reviewer\n    agent: "accessibility-reviewer"'
  ];
  for (const [index, declaration] of forms.entries()) {
    await context.test(`unsupported form ${index + 1}`, async () => {
      const { project, blueprintPath } = await fixture();
      try {
        await writeFile(path.join(project, ".github", "agents", "second-reviewer.agent.md"), `---\nname: Second\n${declaration}\n---\n`);
        const rejected = run(project, "validate", blueprintPath);
        assert.equal(rejected.status, 1);
        assert.match(rejected.stderr, /Unsupported agent reference syntax/);
      } finally { await rm(project, { recursive: true, force: true }); }
    });
  }
  await context.test("literal description and prompt are not declarations", async () => {
    const { project, blueprintPath } = await fixture();
    try {
      await writeFile(path.join(project, ".github", "agents", "second-reviewer.agent.md"), `---
name: Second Reviewer
description: |
  agents: [accessibility-reviewer]
agents: []
handoffs:
  - label: Review
    agent: third-reviewer
    prompt: |
      agent: accessibility-reviewer
    send: false
---
`);
      await writeFile(path.join(project, ".github", "agents", "third-reviewer.agent.md"), "No outgoing references.\n");
      await writeFile(blueprintPath, JSON.stringify(blueprint({ capabilities: ["read", "agent"], subagents: ["second-reviewer"] })));
      assert.equal(run(project, "validate", blueprintPath).status, 0);
    } finally { await rm(project, { recursive: true, force: true }); }
  });
});

test("pso agent build accepts complete parameters and asks only for missing values", async () => {
  const { project } = await fixture();
  try {
    const built = runRuntimeBuild(project, buildParameters());
    assert.equal(built.status, 0, built.stderr);
    const blueprintPath = path.join(project, "reports", "agent-blueprints", "accessibility-reviewer.json");
    const generated = JSON.parse(await readFile(blueprintPath, "utf8"));
    assert.equal(generated.schemaVersion, "2.1.0");
    assert.equal(generated.agentType, "copilot");
    assert.deepEqual(generated.autonomy, {
      mode: "guided",
      approvalRequiredFor: approvalGates,
      webSafety: "standard"
    });
    assert.equal(generated.instructions.approach.length, 2);
    assert.match(generated.instructions.approach[1], /locations, impact, and suggested remediation/);
    assert.equal(Object.hasOwn(generated, "azure"), false);
    assert.equal(existsSync(path.join(project, ".azure", "environment.json")), false);
    assert.equal(existsSync(path.join(project, "reports", "agent-builder-plan.json")), true);
    const builtPlan = JSON.parse(await readFile(path.join(project, "reports", "agent-builder-plan.json"), "utf8"));
    assert.ok(builtPlan.renderedAgent.includes(deploymentGuide), "default agent build must include the delivery handoff");
    assert.equal(existsSync(path.join(project, ".github", "agents", `${generated.id}.agent.md`)), false, "build only prepares the review");

    const autonomous = runRuntimeBuild(project, buildParameters([
      "--capabilities", "web",
      "--autonomy", "autonomous-research",
      "--web-safety", "threat-informed"
    ]));
    assert.equal(autonomous.status, 0, autonomous.stderr);
    const autonomousBlueprint = JSON.parse(await readFile(blueprintPath, "utf8"));
    assert.deepEqual(autonomousBlueprint.capabilities, ["web"]);
    assert.equal(autonomousBlueprint.autonomy.mode, "autonomous-research");
    assert.equal(autonomousBlueprint.autonomy.webSafety, "threat-informed");
    const autonomousPlan = JSON.parse(await readFile(path.join(project, "reports", "agent-builder-plan.json"), "utf8"));
    assert.match(autonomousPlan.renderedAgent, /tools: \["web"\]/);
    assert.match(autonomousPlan.renderedAgent, /Proceed autonomously through read-only research/);
    assert.ok(autonomousPlan.renderedAgent.includes(deploymentGuide));

    const missing = runRuntimeBuild(project, buildParameters().filter((value, index, values) => value !== "--purpose" && values[index - 1] !== "--purpose"));
    assert.notEqual(missing.status, 0);
    assert.match(missing.stderr, /Missing Agent purpose/);
  } finally {
    await rm(project, { recursive: true, force: true });
  }
});

async function installFakeAzureCli(project) {
  const bin = path.join(project, "fake-az-bin");
  await mkdir(bin);
  const script = `#!/usr/bin/env node
const fs = require("node:fs");
const args = process.argv.slice(2);
fs.appendFileSync(process.env.PSO_FAKE_AZ_LOG, args.join(" ") + "\\n");
if (process.env.PSO_FAKE_AZ_FAIL === "1" && args[0] === "account" && args[1] === "show") process.exit(9);
if (args[0] === "cloud" && args[1] === "show" && args.includes("--query")) process.stdout.write("AzureUSGovernment\\n");
else if (args[0] === "cloud" && args[1] === "show") process.stdout.write(JSON.stringify({ name: "AzureUSGovernment", endpoints: { resourceManager: "https://management.usgovcloudapi.net/", activeDirectory: "https://login.microsoftonline.us/", portal: "https://portal.azure.us/" }, suffixes: { storageEndpoint: "core.usgovcloudapi.net", keyvaultDns: ".vault.usgovcloudapi.net" } }));
else if (args[0] === "account" && args[1] === "show") process.stdout.write(JSON.stringify({ tenantId: "00000000-0000-0000-0000-000000000001", id: "00000000-0000-0000-0000-000000000002", name: "Fixture Subscription" }));
`;
  if (process.platform === "win32") {
    const nodeScript = path.join(bin, "fake-az.cjs");
    await writeFile(nodeScript, script.replace("#!/usr/bin/env node\n", ""), "utf8");
    await writeFile(path.join(bin, "az.cmd"), `@echo off\r\n"${process.execPath}" "${nodeScript}" %*\r\n`, "utf8");
  } else {
    const executable = path.join(bin, "az");
    await writeFile(executable, script, "utf8");
    await chmod(executable, 0o755);
  }
  return bin;
}

test("Foundry-aware build selects Azure Government and persists only sanitized blueprint context", async () => {
  const { project } = await fixture();
  try {
    const moduleDirectory = path.join(project, ".github", "skills", "azure-discovery", "scripts");
    await mkdir(moduleDirectory, { recursive: true });
    await copyFile(path.join(root, ".github", "skills", "azure-discovery", "scripts", "azure-environment.ps1"), path.join(moduleDirectory, "azure-environment.ps1"));
    const fakeBin = await installFakeAzureCli(project);
    const log = path.join(project, "fake-az.log");
    const parameters = buildParameters([
      "--type", "foundry-prompt",
      "--cloud", "AzureUSGovernment",
      "--location", "usgovarizona",
      "--environment-name", "demo",
      "--authentication-method", "interactive",
      "--subscription-id", "00000000-0000-0000-0000-000000000002",
      "--publication-targets", "foundry-endpoint,microsoft-365-copilot-and-teams,chatgpt-action",
      "--version-policy", "pinned",
      "--microsoft365-audience", "individual",
      "--chatgpt-visibility", "workspace"
    ]);
    const built = runRuntimeBuild(project, parameters, {
      PATH: `${fakeBin}${path.delimiter}${process.env.PATH}`,
      PSO_FAKE_AZ_LOG: log
    });
    assert.equal(built.status, 0, built.stderr);
    const generated = JSON.parse(await readFile(path.join(project, "reports", "agent-blueprints", "accessibility-reviewer.json"), "utf8"));
    assert.equal(generated.agentType, "foundry-prompt");
    assert.deepEqual(generated.azure, {
      required: true,
      cloud: "AzureUSGovernment",
      location: "usgovarizona",
      environmentName: "demo",
      authenticationMethod: "interactive",
      subscriptionConfigured: true
    });
    assert.equal(generated.schemaVersion, "2.2.0");
    assert.deepEqual(generated.publication, {
      targets: ["foundry-endpoint", "microsoft-365-copilot-and-teams", "chatgpt-action"],
      versionPolicy: "pinned",
      microsoft365Audience: "individual",
      chatgptVisibility: "workspace"
    });
    const serialized = JSON.stringify(generated);
    assert.doesNotMatch(serialized, /00000000-0000-0000-0000-00000000000[12]/);
    assert.doesNotMatch(serialized, /token|password|clientSecret|client-secret/i);
    const calls = await readFile(log, "utf8");
    assert.match(calls, /cloud set --name AzureUSGovernment/);
    assert.match(calls, /account set --subscription/);
  } finally {
    await rm(project, { recursive: true, force: true });
  }
});

test("Azure-aware build preserves MCP preferences and resets cloud-specific defaults on override", async () => {
  const { project } = await fixture();
  try {
    const moduleDirectory = path.join(project, ".github", "skills", "azure-discovery", "scripts");
    await mkdir(moduleDirectory, { recursive: true });
    await copyFile(path.join(root, ".github", "skills", "azure-discovery", "scripts", "azure-environment.ps1"), path.join(moduleDirectory, "azure-environment.ps1"));
    const fakeBin = await installFakeAzureCli(project);
    const log = path.join(project, "fake-az.log");
    await mkdir(path.join(project, ".azure"));
    await writeFile(path.join(project, ".azure", "environment.json"), `${JSON.stringify({
      schemaVersion: "1.0.0",
      updatedAt: "2026-01-01T00:00:00.000Z",
      cloud: "AzureCloud",
      location: "eastus2",
      environmentName: "development",
      deploymentTool: "azure-cli",
      authentication: { method: "interactive" },
      subscription: { tenantId: "", subscriptionId: "commercial-subscription", subscriptionName: "Commercial" },
      cloudEndpoints: null,
      mcp: { enabled: true, services: ["documentation", "foundry"], foundryExtensions: { requested: false, enabled: false, clientId: "" } },
      mutationPolicy: "approval-required"
    }, null, 2)}\n`, "utf8");
    const parameters = buildParameters([
      "--type", "foundry-prompt",
      "--cloud", "AzureUSGovernment",
      "--authentication-method", "interactive"
    ]);
    const built = runRuntimeBuild(project, parameters, {
      PATH: `${fakeBin}${path.delimiter}${process.env.PATH}`,
      PSO_FAKE_AZ_LOG: log
    });
    assert.equal(built.status, 0, built.stderr);
    const profile = JSON.parse(await readFile(path.join(project, ".azure", "environment.json"), "utf8"));
    assert.equal(profile.cloud, "AzureUSGovernment");
    assert.equal(profile.location, "usgovvirginia");
    assert.notEqual(profile.subscription.subscriptionId, "commercial-subscription");
    assert.equal(profile.mcp.enabled, true);
    assert.deepEqual(profile.mcp.services.sort(), ["documentation", "foundry"]);
  } finally {
    await rm(project, { recursive: true, force: true });
  }
});

test("failed Azure authentication preserves the existing profile and workspace settings", async () => {
  const { project } = await fixture();
  try {
    const moduleDirectory = path.join(project, ".github", "skills", "azure-discovery", "scripts");
    await mkdir(moduleDirectory, { recursive: true });
    await copyFile(path.join(root, ".github", "skills", "azure-discovery", "scripts", "azure-environment.ps1"), path.join(moduleDirectory, "azure-environment.ps1"));
    const fakeBin = await installFakeAzureCli(project);
    const log = path.join(project, "fake-az.log");
    const profilePath = path.join(project, ".azure", "environment.json");
    const settingsPath = path.join(project, ".vscode", "settings.json");
    await mkdir(path.dirname(profilePath));
    await mkdir(path.dirname(settingsPath));
    const originalProfile = `${JSON.stringify({
      schemaVersion: "1.0.0", updatedAt: "2026-01-01T00:00:00.000Z", cloud: "AzureCloud", location: "eastus",
      environmentName: "development", deploymentTool: "azure-cli", authentication: { method: "interactive" },
      subscription: { tenantId: "", subscriptionId: "", subscriptionName: "" }, cloudEndpoints: null,
      mcp: { enabled: false, services: [], foundryExtensions: { requested: false, enabled: false, clientId: "" } },
      mutationPolicy: "approval-required"
    }, null, 2)}\n`;
    const originalSettings = "{\n  \"editor.formatOnSave\": true\n}\n";
    await writeFile(profilePath, originalProfile, "utf8");
    await writeFile(settingsPath, originalSettings, "utf8");
    const result = runRuntimeBuild(project, buildParameters([
      "--type", "foundry-prompt", "--cloud", "AzureUSGovernment", "--location", "usgovarizona"
    ]), {
      PATH: `${fakeBin}${path.delimiter}${process.env.PATH}`,
      PSO_FAKE_AZ_LOG: log,
      PSO_FAKE_AZ_FAIL: "1"
    });
    assert.notEqual(result.status, 0);
    assert.equal(await readFile(profilePath, "utf8"), originalProfile);
    assert.equal(await readFile(settingsPath, "utf8"), originalSettings);
    assert.equal(existsSync(path.join(project, "reports", "agent-blueprints", "accessibility-reviewer.json")), false);
  } finally {
    await rm(project, { recursive: true, force: true });
  }
});

test("Agent Builder rejects credential parameters", async () => {
  const { project } = await fixture();
  try {
    const result = runRuntimeBuild(project, [...buildParameters(), "--client-secret", "must-not-be-accepted"]);
    assert.notEqual(result.status, 0);
    assert.match(result.stderr, /Credential parameter --client-secret is prohibited/);
  } finally {
    await rm(project, { recursive: true, force: true });
  }
});