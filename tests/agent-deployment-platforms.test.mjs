import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { mkdir, mkdtemp, readFile, readdir, realpath, rm, symlink, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { deflateRawSync } from "node:zlib";
import test from "node:test";
import { digest, DeploymentError } from "../.github/skills/agent-deployment/scripts/contracts.mjs";
import { runDeployment } from "../.github/skills/agent-deployment/scripts/agent-deployment.mjs";
import { createPacProvider, requestSchema as pacSchema, validateConfig as validatePac } from "../.github/skills/agent-deployment/scripts/providers/pac.mjs";
import { createAtkProvider, requestSchema as atkSchema, validateConfig as validateAtk } from "../.github/skills/agent-deployment/scripts/providers/atk.mjs";
import {
  buildEnterpriseCliInvocation, runEnterpriseCli, identityEvidenceDigest, inspectZip
} from "../.github/skills/agent-deployment/scripts/providers/enterprise-cli.mjs";
import { validatePlatformOutcome, validatePlatformSnapshot } from "../.github/skills/agent-deployment/scripts/providers/platform-contract.mjs";

const repo = path.resolve(import.meta.dirname, "..");
// A regression must never fall back to a real installed provider, even for authentication.
const inheritedPath = Object.keys(process.env).find((key) => key.toUpperCase() === "PATH");
if (inheritedPath) process.env[inheritedPath] = path.join(repo, "tests", ".no-real-platform-cli");
const tenantId = "33333333-3333-4333-8333-333333333333";
const subscriptionId = "22222222-2222-4222-8222-222222222222";
const botId = "44444444-4444-4444-8444-444444444444";
const appId = "55555555-5555-4555-8555-555555555555";
const environment = "https://approved.crm.dynamics.com";
const cliVersion = "1.2.3";
const identityOutput = { stdout: "Reviewed authenticated profile\n", stderr: "" };
const success = (stdout = "") => ({ exitCode: 0, stdout, stderr: "" });
const throwsCode = (code) => (error) => error instanceof DeploymentError && error.code === code;

function crc32(bytes) {
  let crc = 0xffffffff;
  for (const byte of bytes) {
    crc ^= byte;
    for (let bit = 0; bit < 8; bit++) crc = (crc >>> 1) ^ ((crc & 1) ? 0xedb88320 : 0);
  }
  return (crc ^ 0xffffffff) >>> 0;
}

function zip(entries, { deflate = false, descriptor = false } = {}) {
  const locals = [];
  const central = [];
  let offset = 0;
  for (const [name, value] of Object.entries(entries)) {
    const filename = Buffer.from(name);
    const bytes = Buffer.from(value);
    const compressed = deflate ? deflateRawSync(bytes) : bytes;
    const local = Buffer.alloc(30);
    local.writeUInt32LE(0x04034b50);
    local.writeUInt16LE(20, 4);
    local.writeUInt16LE(descriptor ? 8 : 0, 6);
    local.writeUInt16LE(deflate ? 8 : 0, 8);
    if (!descriptor) {
      local.writeUInt32LE(crc32(bytes), 14);
      local.writeUInt32LE(compressed.length, 18);
      local.writeUInt32LE(bytes.length, 22);
    }
    local.writeUInt16LE(filename.length, 26);
    const directory = Buffer.alloc(46);
    directory.writeUInt32LE(0x02014b50);
    directory.writeUInt16LE(20, 4);
    directory.writeUInt16LE(20, 6);
    directory.writeUInt16LE(descriptor ? 8 : 0, 8);
    directory.writeUInt16LE(deflate ? 8 : 0, 10);
    directory.writeUInt32LE(crc32(bytes), 16);
    directory.writeUInt32LE(compressed.length, 20);
    directory.writeUInt32LE(bytes.length, 24);
    directory.writeUInt16LE(filename.length, 28);
    directory.writeUInt32LE(offset, 42);
    const suffix = Buffer.alloc(descriptor ? 16 : 0);
    if (descriptor) {
      suffix.writeUInt32LE(0x08074b50);
      suffix.writeUInt32LE(crc32(bytes), 4);
      suffix.writeUInt32LE(compressed.length, 8);
      suffix.writeUInt32LE(bytes.length, 12);
    }
    locals.push(local, filename, compressed, suffix);
    central.push(directory, filename);
    offset += local.length + filename.length + compressed.length + suffix.length;
  }
  const directoryBytes = Buffer.concat(central);
  const end = Buffer.alloc(22);
  end.writeUInt32LE(0x06054b50);
  end.writeUInt16LE(central.length / 2, 8);
  end.writeUInt16LE(central.length / 2, 10);
  end.writeUInt32LE(directoryBytes.length, 12);
  end.writeUInt32LE(offset, 16);
  return Buffer.concat([...locals, directoryBytes, end]);
}

function solutionZip({ managed = true, name = "ReviewedAgent", version = "1.0.0.0", paddingBytes = 0 } = {}) {
  return zip({
    "solution.xml": `<?xml version="1.0"?><ImportExportXml><SolutionManifest><UniqueName>${name}</UniqueName><Version>${version}</Version><Managed>${managed ? 1 : 0}</Managed><Publisher><UniqueName>ReviewedPublisher</UniqueName><CustomizationPrefix>rev</CustomizationPrefix></Publisher></SolutionManifest></ImportExportXml>`,
    "customizations.xml": `<ImportExportXml><Entities />${" ".repeat(paddingBytes)}</ImportExportXml>`,
    "[Content_Types].xml": "<Types />"
  });
}

async function fixture(t, target = "copilot-studio") {
  const root = await realpath(await mkdtemp(path.join(os.tmpdir(), "pso-platform-")));
  await mkdir(path.join(root, "source"), { recursive: true });
  await mkdir(path.join(root, "run"), { recursive: true });
  t.after(async () => {
    await rm(root, { recursive: true, force: true });
  });
  const sourceFiles = [];
  const put = async (relative, bytes, source = false) => {
    await mkdir(path.dirname(path.join(root, relative)), { recursive: true });
    await writeFile(path.join(root, relative), bytes);
    const reference = { path: relative, sha256: digest(Buffer.from(bytes)) };
    if (source) sourceFiles.push(reference);
    return reference;
  };
  const request = { target, audience: "tenant", cloud: "AzureCloud", environment: "development" };
  const context = {
    root, request, workDirectory: "run", packagePath: "package", packageSha256: "a".repeat(64),
    profile: { cloud: "AzureCloud", subscription: { tenantId, subscriptionId } },
    blueprint: { id: "reviewed-agent" }
  };
  const calls = [];
  let effect = async () => success("Accepted\n");
  const deps = {
    frameworkRoot: path.join(root, "not-the-framework"),
    runCli: async (tool, args, options) => {
      calls.push({ tool, args: [...args], options });
      if (args[0] === "--version") return success(`${cliVersion}\n`);
      if (args[0] === "auth") return success(identityOutput.stdout);
      if (args[0] === "launchinfo" || args[1] === "status") return success("Status response\n");
      return effect(tool, args, options);
    }
  };
  const identity = (tool, selectedEnvironment) => ({
    sha256: identityEvidenceDigest(tool, {
      tenantId, environment: selectedEnvironment, audience: request.audience, cloud: request.cloud
    }, tool === "pac" ? { who: identityOutput, list: identityOutput } : { list: identityOutput })
  });
  return { root, context, request, put, sourceFiles, calls, deps, identity, effect: (fn) => { effect = fn; } };
}

async function pacFixture(t, operation = "import") {
  const f = await fixture(t);
  const common = { operation, expectedCliVersion: cliVersion };
  if (operation === "pack") {
    await f.put("source/agent.yaml", "kind: Bot\nname: reviewed\n", true);
    f.request.cloud = "none";
    f.request.copilotStudio = {
      ...common, projectDirectory: "source", sourceFiles: f.sourceFiles,
      publisherPrefix: "rev", solutionName: "ReviewedAgent", solutionVersion: "1.0.0.0",
      outputDirectory: "run/output", outputFileName: "ReviewedAgent.zip"
    };
  } else {
    f.request.copilotStudio = {
      ...common, environment, identityEvidence: f.identity("pac", environment),
      ...(operation === "publish" ? { botId } : { solutionName: "ReviewedAgent", solutionVersion: "1.0.0.0" })
    };
    if (operation === "import") f.request.copilotStudio.solution = await f.put("input/solution.zip", solutionZip());
    if (operation === "export") f.request.copilotStudio.outputFile = "run/output/ReviewedAgent.zip";
  }
  return f;
}

async function atkFixture(t, operation = "package") {
  const f = await fixture(t, "microsoft-365-agents-toolkit");
  const config = {
    operation, expectedCliVersion: cliVersion, environment: "dev",
    projectDirectory: "source", sourceFiles: f.sourceFiles
  };
  if (operation === "provision" || operation === "deploy") {
    const content = operation === "provision"
      ? "version: v1.9\nprovision:\n  - uses: teamsApp/create\n    with:\n      name: Reviewed App\n    writeToEnvironmentFile:\n      teamsAppId: TEAMS_APP_ID\n"
      : `version: v1.9\ndeploy:\n  - uses: azureAppService/zipDeploy\n    with:\n      artifactFolder: app\n      resourceId: /subscriptions/${subscriptionId}/resourceGroups/reviewed/providers/Microsoft.Web/sites/reviewed\n`;
    config.lifecycle = await f.put("source/m365agents.yml", content, true);
    if (operation === "deploy") await f.put("source/app/index.js", "export const greeting = 'reviewed';\n", true);
  } else {
    const manifest = { manifestVersion: "1.23", version: "1.0.0", id: appId, name: { short: "Reviewed" }, icons: { color: "color.png", outline: "outline.png" } };
    f.manifestBytes = Buffer.from(JSON.stringify(manifest));
    config.manifest = await f.put("source/appPackage/manifest.json", f.manifestBytes, true);
    f.iconBytes = Buffer.from("89504e470d0a1a0a0000000d49484452000000c0000000c00806000000", "hex");
    await f.put("source/appPackage/color.png", f.iconBytes, true);
    await f.put("source/appPackage/outline.png", f.iconBytes, true);
    Object.assign(config, { appId, appVersion: "1.0.0" });
    f.appZip = zip({ "manifest.json": f.manifestBytes, "color.png": f.iconBytes, "outline.png": f.iconBytes });
    if (operation === "package") Object.assign(config, { outputDirectory: "run/output", outputFileName: "app.zip" });
    else config.package = await f.put("input/app.zip", f.appZip);
  }
  if (operation !== "package") config.identityEvidence = f.identity("atk", "dev");
  else f.request.cloud = "none";
  f.request.agentsToolkit = config;
  return f;
}

async function centralFixture(f) {
  const definition = {
    schemaVersion: "2.3.0", agentType: "portable", id: "reviewed-agent", name: "Reviewed Agent",
    description: "Use when inspecting an explicitly reviewed application package and its bounded deployment.",
    purpose: "Inspect approved project information without granting portable tools to a remote application.",
    risk: "read-only", capabilities: ["read"],
    autonomy: {
      mode: "guided", webSafety: "standard",
      approvalRequiredFor: [
        "purchase-or-payment", "booking-or-external-commitment", "provider-contact-or-message",
        "account-identity-or-security-change", "sensitive-data-disclosure", "destructive-or-irreversible-action"
      ]
    },
    invocation: { userInvocable: true, modelInvocable: true },
    instructions: {
      constraints: ["Only use explicitly authorized project information."],
      approach: ["Inspect the supplied application evidence.", "Report the observed result and verification limitations."],
      outputFormat: "Return an evidence-backed status with explicit limitations."
    },
    subagents: [], handoffs: [],
    distribution: {
      targets: [f.request.target], versionPolicy: "pinned", environment: "development", dataBoundary: "organization",
      ...(f.request.target === "microsoft-365-agents-toolkit" ? { microsoft365Audience: f.request.audience } : {})
    }
  };
  const blueprint = await f.put("blueprint.json", `${JSON.stringify(definition)}\n`);
  Object.assign(f.request, {
    schemaVersion: "1.0.0", blueprint, release: "native-release", mode: "create",
    data: { classification: "internal", boundary: "organization", residency: ["global"] },
    runtime: { kind: "application", tools: [], acknowledgeLocalCapabilitiesOmitted: true },
    verification: { prompt: "Return READY.", expectedSubstring: "READY", maxOutputTokens: 16 },
    rollback: { strategy: "manual", version: null }, acceptPreview: false
  });
  await f.put(".azure/environment.json", JSON.stringify({
    ...f.context.profile, schemaVersion: "1.0.0", location: "eastus", environmentName: "development",
    authentication: { method: "interactive" }, mutationPolicy: "approval-required"
  }));
  await f.put("native-request.json", `${JSON.stringify(f.request)}\n`);
  const workspaces = [];
  const dependencies = {
    frameworkRoot: f.deps.frameworkRoot,
    now: () => new Date("2026-09-22T14:00:00.000Z"),
    providerFactory: async (context) => {
      workspaces.push(context.workDirectory);
      return (f.request.target === "copilot-studio" ? createPacProvider : createAtkProvider)(context, f.deps);
    }
  };
  const options = { project: f.root, request: "native-request.json" };
  return {
    workspaces, dependencies, options,
    approved: (plan) => ({
      project: f.root, plan: "reports/agent-deployment-plan.json",
      planDigest: plan.planSha256, acceptRisk: true, approve: plan.requiredApprovals
    })
  };
}

for (const [tool, operation] of [["pac", "pack"], ["pac", "export"], ["atk", "package"]]) {
  test(`central ${tool} ${operation} uses one plan-bound workspace through actual provider verification and replay`, async (t) => {
    const f = tool === "pac" ? await pacFixture(t, operation) : await atkFixture(t, operation);
    const config = f.request.copilotStudio ?? f.request.agentsToolkit;
    if (config.outputDirectory) config.outputDirectory = "output";
    if (config.outputFile) config.outputFile = "output/ReviewedAgent.zip";
    const archive = tool === "pac" ? solutionZip({ managed: operation === "export" }) : f.appZip;
    let operations = 0;
    f.effect(async (_tool, args) => {
      operations++;
      const output = tool === "atk" ? args[args.indexOf("--output-package-file") + 1]
        : operation === "export" ? args[args.indexOf("--path") + 1]
          : path.join(args[args.indexOf("--output-path") + 1], "ReviewedAgent.zip");
      await writeFile(output, archive);
      return success("Artifact created\n");
    });
    const core = await centralFixture(f);
    const plan = await runDeployment("plan", core.options, core.dependencies);
    assert.equal(plan.status, "review-required", plan.reason);
    const applied = await runDeployment("apply", core.approved(plan), core.dependencies);
    assert.equal(applied.status, "packaged");
    assert.equal(applied.platformOutcome.evidenceSha256, digest(archive));
    const verified = await runDeployment("verify", {
      project: f.root, plan: "reports/agent-deployment-plan.json"
    }, core.dependencies);
    assert.equal(verified.status, "packaged");
    const replayed = await runDeployment("apply", core.approved(plan), core.dependencies);
    assert.equal(replayed.status, "packaged");
    assert.equal(operations, 1, "verification and replay must not repeat the native command");
    assert.equal(new Set(core.workspaces).size, 1, "planning and execution must resolve the identical workspace");
    assert.ok(core.workspaces[0].endsWith(plan.packageSha256));
  });
}

test("central packaging verifies and reuses a valid solution ZIP larger than 1 MiB", async (t) => {
  const f = await pacFixture(t);
  const archive = solutionZip({ paddingBytes: 1_048_576 });
  assert.ok(archive.length > 1_048_576 && archive.length < 2_097_152);
  assert.equal(inspectZip(archive).sha256, digest(archive));
  f.request.copilotStudio.solution = await f.put("input/solution.zip", archive);
  const core = await centralFixture(f);
  const first = await runDeployment("package", core.options, core.dependencies);
  const second = await runDeployment("package", core.options, core.dependencies);
  assert.equal(first.packageSha256, second.packageSha256);
  const manifest = JSON.parse(await readFile(path.join(f.root, first.packagePath, "manifest.json"), "utf8"));
  const entry = manifest.files.find((item) => item.path.endsWith(".zip"));
  assert.equal(entry.bytes, archive.length);
  const saved = path.join(f.root, first.packagePath, entry.path);
  assert.deepEqual(await readFile(saved), archive);
  await writeFile(saved, Buffer.concat([archive, Buffer.from("changed")]));
  await assert.rejects(runDeployment("package", core.options, core.dependencies), /boundary|size|changed|drift/i);
  assert.equal(f.calls.length, 0, "local packaging must not invoke a vendor CLI");
});

test("platform configurations are strict self-contained and reject irrelevant operation fields", async (t) => {
  const pac = await pacFixture(t);
  const atk = await atkFixture(t);
  assert.equal(validatePac(pac.request.copilotStudio).operation, "import");
  assert.equal(validateAtk(atk.request.agentsToolkit).operation, "package");
  assert(!JSON.stringify([pacSchema, atkSchema]).includes('"$ref"'));
  for (const key of ["args", "command", "executable", "force", "publishChanges", "token"]) {
    assert.throws(() => validatePac({ ...pac.request.copilotStudio, [key]: "forbidden" }), DeploymentError);
  }
  assert.throws(() => validatePac({ ...pac.request.copilotStudio, operation: "delete" }), DeploymentError);
  assert.throws(() => validateAtk({ ...atk.request.agentsToolkit, operation: "uninstall" }), DeploymentError);
  assert.throws(() => validateAtk({ ...atk.request.agentsToolkit, identityEvidence: atk.identity("atk", "dev") }), DeploymentError);
});

test("PAC import uses reviewed managed ZIP and settings, never publishes implicitly", async (t) => {
  const f = await pacFixture(t);
  f.request.copilotStudio.settings = await f.put("input/settings.json", JSON.stringify({ EnvironmentVariables: [{ SchemaName: "rev_greeting", Value: "Hello" }], ConnectionReferences: [] }));
  const provider = await createPacProvider(f.context, f.deps);
  assert.equal(f.calls.length, 0, "factory must not invoke tools");
  validatePlatformSnapshot(await provider.probe());
  const receipt = validatePlatformOutcome(await provider.execute("import"));
  assert.equal(receipt.status, "imported");
  assert.equal(receipt.publicationVerified, false);
  const mutation = f.calls.find(({ args }) => args[0] === "solution" && args[1] === "import");
  assert.deepEqual(mutation.args.slice(0, 2), ["solution", "import"]);
  assert.equal(mutation.args[2], "--path");
  assert.equal(digest(await readFile(mutation.args[3])), f.request.copilotStudio.solution.sha256);
  assert.deepEqual(mutation.args.slice(4, 7), ["--environment", environment, "--settings-file"]);
  assert.equal(digest(await readFile(mutation.args[7])), f.request.copilotStudio.settings.sha256);
  assert(f.calls.every(({ args }) => !args.some((arg) => /publish|force|skip|stage-and|--json/.test(arg))));
  assert.equal((await provider.verify(receipt)).status, "verification-required");
  await assert.rejects(provider.rollback(receipt), throwsCode("RECOVERY_REQUIRED"));
});

test("PAC development pack output can be imported explicitly as unmanaged without publication", async (t) => {
  const f = await pacFixture(t, "pack");
  f.effect(async (_tool, args) => {
    await writeFile(path.join(args[args.indexOf("--output-path") + 1], "ReviewedAgent.zip"), solutionZip({ managed: false }));
    return success("Package created\n");
  });
  const pack = await createPacProvider(f.context, f.deps);
  const packaged = await pack.execute("pack");
  assert.equal(packaged.status, "packaged");
  f.request.cloud = "AzureCloud";
  f.request.copilotStudio = {
    operation: "import", expectedCliVersion: cliVersion,
    environment, identityEvidence: f.identity("pac", environment),
    solutionName: "ReviewedAgent", solutionVersion: "1.0.0.0", solutionType: "unmanaged",
    solution: { path: "run/output/ReviewedAgent.zip", sha256: packaged.evidenceSha256 }
  };
  f.context.workDirectory = "import-run";
  f.effect(async () => success("Import accepted\n"));
  const importing = await createPacProvider(f.context, f.deps);
  const accepted = await importing.execute("import");
  assert.equal(accepted.status, "imported");
  assert.equal(accepted.publicationVerified, false);
  const imports = f.calls.filter(({ args }) => args[0] === "solution" && args[1] === "import");
  assert.equal(imports.length, 1);
  for (const flag of ["--publish-changes", "--force-overwrite", "--stage-and-upgrade"]) {
    assert.equal(imports[0].args.includes(flag), false);
  }
});

for (const stage of ["staging", "production", undefined]) {
  test(`PAC unmanaged import is blocked before CLI calls for ${stage ?? "unspecified"} environments`, async (t) => {
    const f = await pacFixture(t);
    if (stage === undefined) delete f.request.environment;
    else f.request.environment = stage;
    f.request.copilotStudio.solutionType = "unmanaged";
    f.request.copilotStudio.solution = await f.put("input/solution.zip", solutionZip({ managed: false }));
    await assert.rejects(createPacProvider(f.context, f.deps), throwsCode("UNMANAGED_IMPORT_NOT_ALLOWED"));
    assert.equal(f.calls.length, 0);
  });
}

test("PAC managed import remains the default and rejects an unmanaged ZIP without explicit selection", async (t) => {
  const f = await pacFixture(t);
  f.request.copilotStudio.solution = await f.put("input/solution.zip", solutionZip({ managed: false }));
  const provider = await createPacProvider(f.context, f.deps);
  await assert.rejects(provider.probe(), throwsCode("SOLUTION_IDENTITY_MISMATCH"));
  assert.equal(f.calls.length, 0);
});

test("PAC pack is offline and validates the exact generated ZIP identity", async (t) => {
  const f = await pacFixture(t, "pack");
  f.effect(async (_, args) => {
    assert.deepEqual(args.slice(0, 4), ["copilot", "pack", "--publisher-prefix", "rev"]);
    assert.equal(args[4], "--project-dir");
    assert.equal(args[6], "--output-path");
    assert.deepEqual(args.slice(8), ["--solution-name", "ReviewedAgent"]);
    await writeFile(path.join(args[7], "ReviewedAgent.zip"), solutionZip({ managed: false }));
    return success("Package generated\n");
  });
  const provider = await createPacProvider(f.context, f.deps);
  const before = await provider.probe();
  const receipt = await provider.execute("pack");
  assert.equal(before.phase, "ready");
  assert.equal(receipt.status, "packaged");
  assert.equal(receipt.mutationAccepted, false);
  assert(f.calls.every(({ args }) => args[0] !== "auth" && !args.includes("--environment")));
  const verified = await provider.verify(receipt);
  assert.equal(verified.status, "packaged");
  await writeFile(path.join(f.root, "run/output/ReviewedAgent.zip"), solutionZip({ managed: false, version: "2.0.0.0" }));
  await assert.rejects(provider.verify(receipt), DeploymentError);
});

test("PAC publication is a distinct accepted operation and status is not catalog evidence", async (t) => {
  const f = await pacFixture(t, "publish");
  const provider = await createPacProvider(f.context, f.deps);
  await assert.rejects(provider.execute("import"), throwsCode("CLI_OPERATION_REJECTED"));
  const receipt = await provider.execute("publish");
  assert.deepEqual(f.calls.find(({ args }) => args[1] === "publish").args, ["copilot", "publish", "--bot", botId, "--environment", environment]);
  assert.equal(receipt.status, "publication-submitted");
  assert.equal((await provider.verify(receipt)).publicationVerified, false);
  assert(f.calls.some(({ args }) => JSON.stringify(args) === JSON.stringify(["copilot", "status", "--bot-id", botId, "--environment", environment])));
  await assert.rejects(provider.rollback(receipt), throwsCode("RECOVERY_REQUIRED"));
  assert(!f.calls.some(({ args }) => args.includes("delete") || args.includes("uninstall")));
});

test("PAC export is managed, validates artifacts, and refuses an existing output", async (t) => {
  const f = await pacFixture(t, "export");
  f.effect(async (_, args) => {
    assert.deepEqual(args.slice(0, 7), ["solution", "export", "--name", "ReviewedAgent", "--environment", environment, "--managed"]);
    assert.equal(args[7], "--path");
    await writeFile(args[8], solutionZip());
    return success();
  });
  const provider = await createPacProvider(f.context, f.deps);
  assert.equal((await provider.execute("export")).status, "packaged");
  const next = await createPacProvider(f.context, f.deps);
  await assert.rejects(next.execute("export"), throwsCode("OUTPUT_EXISTS"));
  assert.equal(f.calls.filter(({ args }) => args[1] === "export").length, 1);
});

for (const which of ["version", "identity", "tenant", "cloud"]) {
  test(`preflight rejects ${which} mismatch without mutation or account switching`, async (t) => {
    for (const factory of [createPacProvider, createAtkProvider]) {
      const f = factory === createPacProvider ? await pacFixture(t) : await atkFixture(t, "deploy");
      const config = f.request.copilotStudio ?? f.request.agentsToolkit;
      if (which === "version") config.expectedCliVersion = "9.9.9";
      if (which === "identity") config.identityEvidence.sha256 = "b".repeat(64);
      if (which === "tenant") f.context.profile.subscription.tenantId = botId;
      if (which === "cloud") f.request.cloud = "AzureUSGovernment";
      await assert.rejects(async () => {
        const provider = await factory(f.context, f.deps);
        await provider.execute(config.operation);
      }, DeploymentError);
      assert(f.calls.every(({ args }) => args[0] === "--version" || args[0] === "auth"));
    }
  });
}

for (const kind of ["solution", "settings", "source", "manifest"]) {
  test(`reviewed ${kind} byte drift blocks execution`, async (t) => {
    let f;
    let factory;
    let ref;
    if (kind === "manifest") {
      f = await atkFixture(t);
      factory = createAtkProvider;
      ref = f.request.agentsToolkit.manifest;
    } else {
      f = await pacFixture(t, kind === "source" ? "pack" : "import");
      factory = createPacProvider;
      if (kind === "settings") f.request.copilotStudio.settings = await f.put("input/settings.json", '{"EnvironmentVariables":[],"ConnectionReferences":[]}');
      ref = kind === "source" ? f.sourceFiles[0] : f.request.copilotStudio[kind];
    }
    const provider = await factory(f.context, f.deps);
    await provider.probe();
    await writeFile(path.join(f.root, ref.path), "changed after review");
    await assert.rejects(provider.execute((f.request.copilotStudio ?? f.request.agentsToolkit).operation), DeploymentError);
    assert(f.calls.every(({ args }) => args[0] === "--version" || args[0] === "auth"));
  });
}

test("ATK package uses exact noninteractive flags and binds manifest and icons", async (t) => {
  const f = await atkFixture(t);
  f.effect(async (_, args) => {
    assert.equal(args[0], "package");
    assert.deepEqual(args.slice(1, 4), ["--env", "dev", "--manifest-file"]);
    assert.equal(args[5], "--output-folder");
    assert.equal(args[7], "--output-package-file");
    assert.equal(args[9], "--folder");
    assert.deepEqual(args.slice(11), ["-i", "false"]);
    await writeFile(args[8], f.appZip);
    return success();
  });
  const provider = await createAtkProvider(f.context, f.deps);
  const receipt = validatePlatformOutcome(await provider.execute("package"));
  assert.equal(receipt.status, "packaged");
  assert.equal(receipt.version, "1.0.0");
  assert.equal((await provider.verify(receipt)).status, "packaged");
  assert(!f.calls.some(({ args }) => args[0] === "auth"));
});

for (const operation of ["provision", "deploy", "publish", "update"]) {
  test(`ATK ${operation} is separate, noninteractive, and honest about verification`, async (t) => {
    const f = await atkFixture(t, operation);
    const provider = await createAtkProvider(f.context, f.deps);
    validatePlatformSnapshot(await provider.probe());
    await assert.rejects(provider.execute("package"), throwsCode("CLI_OPERATION_REJECTED"));
    const receipt = validatePlatformOutcome(await provider.execute(operation));
    const command = f.calls.find(({ args }) => args[0] === operation).args;
    const staged = path.join(f.root, "run", "atk-source");
    if (["provision", "deploy"].includes(operation)) {
      assert.deepEqual(command, [operation, "--env", "dev", "--folder", staged,
        ...(operation === "deploy" ? ["--config-file-path", path.join(staged, "m365agents.yml")] : []),
        "--ignore-env-file", "-i", "false"]);
    } else {
      const output = path.join(f.root, "run", `atk-output-${operation}`);
      assert.deepEqual(command, [operation, "--env", "dev", "--package-file", path.join(f.root, "run", "atk-input", "app.zip"),
        "--output-folder", output, "--output-package-file", path.join(output, "app.zip"),
        "--folder", staged, "-i", "false"]);
    }
    assert.equal(receipt.status, { provision: "provisioned", deploy: "deployed", publish: "publication-submitted", update: "publication-submitted" }[operation]);
    assert.equal(receipt.publicationVerified, false);
    assert.equal((await provider.verify(receipt)).publicationVerified, false);
    await assert.rejects(provider.rollback(receipt), throwsCode("RECOVERY_REQUIRED"));
    assert(!f.calls.some(({ args }) => args.includes("uninstall") || args.includes("login") || args.includes("--json")));
  });
}

for (const operation of ["publish", "update"]) {
  test(`ATK ${operation} supplies the reviewed package without the conflicting manifest option`, async (t) => {
    const f = await atkFixture(t, operation);
    f.effect(async (_tool, args) => args.includes("--manifest-file") && args.includes("--package-file")
      ? { exitCode: 1, stdout: "", stderr: "Argument conflict: manifest-file and package-file" }
      : success("Accepted\n"));
    const provider = await createAtkProvider(f.context, f.deps);
    const result = await provider.execute(operation);
    assert.equal(result.status, "publication-submitted");
    const invocation = f.calls.find(({ args }) => args[0] === operation).args;
    assert.equal(invocation.includes("--manifest-file"), false);
    assert.equal(invocation.includes("--package-file"), true);
    assert.equal(result.publicationVerified, false);
  });
}

test("ATK package blocks the vendor's raw TypeSpec auto-install marker even in YAML comments", async (t) => {
  const f = await atkFixture(t);
  await f.put("source/m365agents.yml", "# This comment mentions typeSpec/compile.\nversion: v1.9\ndeploy: []\n", true);
  const provider = await createAtkProvider(f.context, f.deps);
  await assert.rejects(provider.probe(), throwsCode("LIFECYCLE_UNSUPPORTED"));
  assert.equal(f.calls.length, 0, "a packaging request must never trigger the SDK's implicit npm install");
});

test("ATK rejects executable or credential-producing lifecycle actions and unreviewed files", async (t) => {
  for (const action of ["script", "cli/runNpmCommand", "aadApp/create", "botAadApp/create", "unknown/action"]) {
    const f = await atkFixture(t, "deploy");
    const bytes = `version: v1.9\ndeploy:\n  - uses: ${action}\n    with:\n      run: npm install\n`;
    const ref = await f.put("source/m365agents.yml", bytes);
    f.sourceFiles[0] = ref;
    f.request.agentsToolkit.lifecycle = ref;
    await assert.rejects(async () => (await createAtkProvider(f.context, f.deps)).execute("deploy"), DeploymentError);
    assert.equal(f.calls.length, 0);
  }
  const f = await atkFixture(t);
  await f.put("source/unreviewed.txt", "not in the reviewed tree");
  await assert.rejects(async () => (await createAtkProvider(f.context, f.deps)).execute("package"), DeploymentError);
});

test("empty, corrupt, wrong-identity and credential-bearing ZIPs are rejected", async (t) => {
  for (const bytes of [
    Buffer.alloc(0), Buffer.from("PK not a ZIP"), solutionZip({ name: "OtherAgent" }),
    solutionZip({ managed: false }),
    zip({ "solution.xml": "bad", ".env": "PRIVATE_VALUE=not-allowed" })
  ]) {
    const f = await pacFixture(t);
    f.request.copilotStudio.solution = await f.put("input/solution.zip", bytes);
    await assert.rejects(async () => (await createPacProvider(f.context, f.deps)).execute("import"), DeploymentError);
    assert.equal(f.calls.length, 0);
  }
  assert.throws(() => inspectZip(zip({ "../escape.txt": "unsafe" })), DeploymentError);
  const corrupt = solutionZip();
  corrupt[45] ^= 1;
  assert.throws(() => inspectZip(corrupt), DeploymentError);
});

test("successful command without valid generated artifacts is uncertain, never success or retry", async (t) => {
  for (const factory of [createPacProvider, createAtkProvider]) {
    const f = factory === createPacProvider ? await pacFixture(t, "pack") : await atkFixture(t);
    const provider = await factory(f.context, f.deps);
    const operation = factory === createPacProvider ? "pack" : "package";
    await assert.rejects(provider.execute(operation), DeploymentError);
    await assert.rejects(provider.execute(operation), DeploymentError);
    assert.equal(f.calls.filter(({ args }) => args[0] === "package" || args[1] === "pack").length, 1);
  }
});

test("provider failures redact logs and credentials; returned DTOs contain evidence hashes only", async (t) => {
  const f = await pacFixture(t, "publish");
  const sensitive = "person@example.invalid token-sensitive-output";
  f.effect(async () => ({ exitCode: 1, stdout: sensitive, stderr: sensitive }));
  const provider = await createPacProvider(f.context, f.deps);
  await assert.rejects(provider.execute("publish"), (error) => {
    assert(error instanceof DeploymentError);
    assert(!JSON.stringify(error).includes(sensitive));
    assert(!error.message.includes("person@"));
    return true;
  });
  const ok = await atkFixture(t, "publish");
  ok.effect(async () => success(sensitive));
  const receipt = await (await createAtkProvider(ok.context, ok.deps)).execute("publish");
  assert(!JSON.stringify(receipt).includes(sensitive));
  assert.match(receipt.evidenceSha256, /^[a-f0-9]{64}$/);
  assert.equal((await readdir(path.join(ok.root, "run"))).some((name) => /log|report/.test(name)), false);
});

test("unsafe paths, links, added files, environment files and launchpad workspaces fail closed", async (t) => {
  const f = await pacFixture(t, "pack");
  for (const unsafe of ["../outside", "source&whoami", "source;write", "source%PATH%", "source\\CON"]) {
    const context = structuredClone(f.context);
    context.request.copilotStudio.projectDirectory = unsafe;
    await assert.rejects(async () => (await createPacProvider(context, f.deps)).execute("pack"), DeploymentError);
  }
  const linked = await pacFixture(t, "pack");
  await mkdir(path.join(linked.root, "other"));
  await symlink(path.join(linked.root, "other"), path.join(linked.root, "source", "linked"), "junction");
  await assert.rejects(async () => (await createPacProvider(linked.context, linked.deps)).execute("pack"), DeploymentError);
  const env = await atkFixture(t);
  await env.put("source/.env.dev", "NONSECRET=value", true);
  await assert.rejects(async () => (await createAtkProvider(env.context, env.deps)).execute("package"), throwsCode("PRIVATE_INPUT_REJECTED"));
  assert.equal(env.calls.length, 0);
  await assert.rejects(async () => (await createPacProvider({ ...f.context, root: repo }, { ...f.deps, frameworkRoot: repo })).execute("pack"), throwsCode("LAUNCH_PAD_BOUNDARY"));
  assert.equal(f.calls.length, 0);
});

test("identity evidence is stable across line endings but bound to tenant, target and audience", () => {
  const binding = { tenantId, environment, audience: "tenant", cloud: "AzureCloud" };
  const one = identityEvidenceDigest("pac", binding, { who: identityOutput, list: identityOutput });
  const two = identityEvidenceDigest("pac", binding, {
    who: { stdout: "Reviewed authenticated profile\r\n", stderr: "" },
    list: { stdout: "Reviewed authenticated profile\r\n", stderr: "" }
  });
  assert.equal(one, two);
  assert.notEqual(one, identityEvidenceDigest("pac", { ...binding, audience: "individual" }, { who: identityOutput, list: identityOutput }));
  assert.notEqual(one, identityEvidenceDigest("pac", { ...binding, environment: botId }, { who: identityOutput, list: identityOutput }));
});

test("ZIP integrity accepts bounded DEFLATE and descriptors but rejects aliases, devices and links", () => {
  const bytes = Buffer.from("Reviewed compressed content");
  const parsed = inspectZip(zip({ "content.txt": bytes }, { deflate: true, descriptor: true }));
  assert.deepEqual(parsed.files.get("content.txt"), bytes);
  assert.equal(parsed.sha256, digest(zip({ "content.txt": bytes }, { deflate: true, descriptor: true })));
  for (const entries of [
    { "CON.txt": "device" }, { "one.txt": "first", "ONE.txt": "alias" },
    { "data/.env.dev": "nonsecret-but-private" }
  ]) assert.throws(() => inspectZip(zip(entries)), DeploymentError);
  const linked = zip({ "link.txt": "target" });
  const central = linked.readUInt32LE(linked.length - 6);
  linked.writeUInt32LE((0xa000 << 16) >>> 0, central + 38);
  assert.throws(() => inspectZip(linked), DeploymentError);
});

test("manifest closure and icon bytes cannot drift inside an otherwise valid reviewed package", async (t) => {
  const f = await atkFixture(t, "publish");
  const bytes = zip({ "manifest.json": f.manifestBytes, "color.png": Buffer.from("different"), "outline.png": f.iconBytes });
  f.request.agentsToolkit.package = await f.put("input/app.zip", bytes);
  await assert.rejects(async () => (await createAtkProvider(f.context, f.deps)).execute("publish"), throwsCode("PACKAGE_CONTENT_MISMATCH"));
  assert.equal(f.calls.length, 0);
  const missing = await atkFixture(t);
  const manifest = JSON.parse(missing.manifestBytes);
  manifest.declarativeAgents = [{ id: "agent", file: "unreviewed.json" }];
  const ref = await missing.put("source/appPackage/manifest.json", JSON.stringify(manifest));
  missing.sourceFiles[0] = ref;
  missing.request.agentsToolkit.manifest = ref;
  await assert.rejects(async () => (await createAtkProvider(missing.context, missing.deps)).execute("package"), throwsCode("MANIFEST_REFERENCE_MISSING"));
  assert.equal(missing.calls.length, 0);
});

test("nonsecret settings policy rejects secret-valued variables before invoking PAC", async (t) => {
  const f = await pacFixture(t);
  f.request.copilotStudio.settings = await f.put("input/settings.json", JSON.stringify({ EnvironmentVariables: [{ SchemaName: "rev_clientSecret", Value: "operator-value" }] }));
  await assert.rejects(async () => (await createPacProvider(f.context, f.deps)).execute("import"), throwsCode("CREDENTIAL_REJECTED"));
  assert.equal(f.calls.length, 0);
});

test("source drift during identity preflight is rechecked immediately before execution", async (t) => {
  const f = await atkFixture(t, "deploy");
  const original = f.deps.runCli;
  f.deps.runCli = async (...args) => {
    const result = await original(...args);
    if (args[1][0] === "auth") await writeFile(path.join(f.root, "source/app/index.js"), "changed during preflight");
    return result;
  };
  await assert.rejects(async () => (await createAtkProvider(f.context, f.deps)).execute("deploy"), throwsCode("INPUT_DRIFT"));
  assert(!f.calls.some(({ args }) => args[0] === "deploy"));
});

test("an unreviewed empty directory also changes the frozen source tree", async (t) => {
  const f = await pacFixture(t, "pack");
  await mkdir(path.join(f.root, "source", "unreviewed"));
  await assert.rejects(async () => (await createPacProvider(f.context, f.deps)).execute("pack"), throwsCode("SOURCE_TREE_DRIFT"));
  assert.equal(f.calls.length, 0);
});

test("real isolated Windows cmd launchers cross a trusted data-only PowerShell bridge", { skip: process.platform !== "win32" }, async (t) => {
  const f = await fixture(t);
  const bin = path.join(f.root, "fake tools");
  await mkdir(bin);
  const fake = path.join(bin, "fake.cjs");
  await writeFile(fake, "process.stdout.write(JSON.stringify({args:process.argv.slice(2),cwd:process.cwd()}));\n");
  for (const tool of ["pac", "atk"]) {
    await writeFile(path.join(bin, `${tool}.cmd`), `@echo off\r\n@"${process.execPath}" "${fake}" %*\r\n`);
    const env = { ...process.env, PATH: bin, Path: bin };
    const invocation = buildEnterpriseCliInvocation(tool, ["--version"], { cwd: f.root }, { env });
    assert.equal(path.basename(invocation.command).toLowerCase(), "powershell.exe");
    assert(invocation.args.includes("-File"));
    assert(!invocation.args.some((value) => /executionpolicy|encodedcommand|^-command$/i.test(value)));
    const bridgeResult = spawnSync(invocation.command, invocation.args, { cwd: invocation.cwd, env: invocation.env, shell: false, encoding: "utf8", timeout: 15_000 });
    assert.equal(bridgeResult.status, 0, `Isolated fake bridge failed: ${bridgeResult.stderr}`);
    const result = await runEnterpriseCli(tool, ["--version"], { cwd: f.root, timeoutMs: 15_000 }, { env });
    assert.deepEqual(JSON.parse(result.stdout), { args: ["--version"], cwd: f.root });
    await assert.rejects(runEnterpriseCli(tool, ["auth", "login"], { cwd: f.root }, { env }), DeploymentError);
    await assert.rejects(runEnterpriseCli(tool, ["--version", "&whoami"], { cwd: f.root }, { env }), DeploymentError);
    if (tool === "atk") {
      for (const operation of ["publish", "update"]) {
        const args = [operation, "--env", "dev", "--package-file", path.join(f.root, "app.zip"),
          "--output-folder", f.root, "--output-package-file", path.join(f.root, "output.zip"), "--folder", f.root, "-i", "false"];
        const result = await runEnterpriseCli(tool, args, { cwd: f.root, timeoutMs: 15_000 }, { env });
        assert.deepEqual(JSON.parse(result.stdout).args, args);
        const conflicting = [...args.slice(0, 3), "--manifest-file", path.join(f.root, "manifest.json"), ...args.slice(3)];
        await assert.rejects(runEnterpriseCli(tool, conflicting, { cwd: f.root }, { env }), throwsCode("CLI_OPERATION_REJECTED"));
        const invocation = buildEnterpriseCliInvocation(tool, args, { cwd: f.root }, { env });
        invocation.args[invocation.args.indexOf("-ArgumentsBase64") + 1] = Buffer.from(JSON.stringify(conflicting)).toString("base64");
        const rejected = spawnSync(invocation.command, invocation.args, {
          cwd: invocation.cwd, env: invocation.env, shell: false, encoding: "utf8", timeout: 15_000
        });
        assert.notEqual(rejected.status, 0, "the Windows bridge must independently reject conflicting package inputs");
        assert.equal(rejected.stdout, "");
      }
    }
  }
});

test("real bridge preserves spaced reviewed paths and rejects metacharacters before execution", { skip: process.platform !== "win32" }, async (t) => {
  const f = await fixture(t);
  const bin = path.join(f.root, "bin");
  await mkdir(bin);
  const fake = path.join(bin, "args.cjs");
  await writeFile(fake, "process.stdout.write(JSON.stringify(process.argv.slice(2)));\n");
  await writeFile(path.join(bin, "pac.cmd"), `@echo off\r\n@"${process.execPath}" "${fake}" %*\r\n`);
  const env = { ...process.env, PATH: bin, Path: bin };
  const args = ["solution", "import", "--path", path.join(f.root, "approved package.zip"), "--environment", environment];
  const result = await runEnterpriseCli("pac", args, { cwd: f.root, timeoutMs: 15_000 }, { env });
  assert.deepEqual(JSON.parse(result.stdout), args);
  args[3] = path.join(f.root, "bad%PATH%.zip");
  await assert.rejects(runEnterpriseCli("pac", args, { cwd: f.root }, { env }), throwsCode("CLI_ARGUMENT_REJECTED"));
});

test("real isolated cmd adapters generate and verify valid PAC and Toolkit ZIPs", { skip: process.platform !== "win32" }, async (t) => {
  for (const tool of ["pac", "atk"]) {
    const f = tool === "pac" ? await pacFixture(t, "pack") : await atkFixture(t);
    const bin = path.join(f.root, "fake-bin");
    await mkdir(bin);
    const fake = path.join(bin, "package.cjs");
    const archive = tool === "pac" ? solutionZip({ managed: false }) : f.appZip;
    await writeFile(fake, `
const fs = require('node:fs');
const path = require('node:path');
const args = process.argv.slice(2);
if (args[0] === '--version') process.stdout.write('${cliVersion}\\n');
else {
  const target = ${tool === "pac" ? "path.join(args[args.indexOf('--output-path') + 1], 'ReviewedAgent.zip')" : "args[args.indexOf('--output-package-file') + 1]"};
  fs.writeFileSync(target, Buffer.from('${archive.toString("base64")}', 'base64'));
  process.stdout.write('Accepted local fake packaging\\n');
}
`);
    await writeFile(path.join(bin, `${tool}.cmd`), `@echo off\r\n@"${process.execPath}" "${fake}" %*\r\n`);
    const deps = { frameworkRoot: f.deps.frameworkRoot, cli: { env: { ...process.env, PATH: bin, Path: bin } } };
    const provider = await (tool === "pac" ? createPacProvider : createAtkProvider)(f.context, deps);
    const receipt = await provider.execute(tool === "pac" ? "pack" : "package");
    assert.equal(receipt.status, "packaged");
    assert.equal(receipt.evidenceSha256, digest(archive));
    assert.equal((await provider.verify(receipt)).status, "packaged");
  }
});

test("real isolated CLI failures and output limits are redacted", { skip: process.platform !== "win32" }, async (t) => {
  const f = await fixture(t);
  const bin = path.join(f.root, "fake-bin");
  await mkdir(bin);
  const fake = path.join(bin, "failure.cjs");
  await writeFile(path.join(bin, "pac.cmd"), `@echo off\r\n@"${process.execPath}" "${fake}" %*\r\n`);
  const env = { ...process.env, PATH: bin, Path: bin };
  await writeFile(fake, "process.stderr.write('person@example.invalid sensitive-stdout'); process.exitCode = 2;\n");
  await assert.rejects(runEnterpriseCli("pac", ["--version"], { cwd: f.root, timeoutMs: 15_000 }, { env }), (error) => {
    assert(error instanceof DeploymentError);
    assert(!error.message.includes("person@example"));
    return true;
  });
  await writeFile(fake, "process.stdout.write('x'.repeat(1048577));\n");
  await assert.rejects(runEnterpriseCli("pac", ["--version"], { cwd: f.root, timeoutMs: 15_000 }, { env }), throwsCode("CLI_OUTPUT_LIMIT"));
});

test("real isolated CLI timeout is bounded and terminates its specific child tree", { skip: process.platform !== "win32" }, async (t) => {
  const f = await fixture(t);
  const bin = path.join(f.root, "fake-bin");
  await mkdir(bin);
  const fake = path.join(bin, "timeout.cjs");
  const pidFile = path.join(f.root, "child.pid");
  await writeFile(fake, `require('node:fs').writeFileSync(${JSON.stringify(pidFile)}, String(process.pid)); setTimeout(() => {}, 30000);\n`);
  await writeFile(path.join(bin, "pac.cmd"), `@echo off\r\n@"${process.execPath}" "${fake}" %*\r\n`);
  const env = { ...process.env, PATH: bin, Path: bin };
  const started = Date.now();
  await assert.rejects(runEnterpriseCli("pac", ["--version"], { cwd: f.root, timeoutMs: 3000 }, { env }), throwsCode("CLI_TIMEOUT"));
  assert(Date.now() - started < 10_000);
  const pidText = await readFile(pidFile, "utf8").catch((error) => {
    if (error.code === "ENOENT") return null;
    throw error;
  });
  if (pidText !== null) assert.throws(() => process.kill(Number(pidText), 0), /ESRCH/);
});

test("linked and metacharacter launcher paths are rejected before starting any process", async (t) => {
  const f = await fixture(t);
  const unsafe = path.join(f.root, "unsafe&bin");
  const safe = path.join(f.root, "safe-bin");
  await mkdir(unsafe);
  await mkdir(safe);
  const toolName = process.platform === "win32" ? "pac.cmd" : "pac";
  await writeFile(path.join(unsafe, toolName), "not executed");
  await writeFile(path.join(safe, toolName), "not executed");
  assert.throws(() => buildEnterpriseCliInvocation("pac", ["--version"], { cwd: f.root }, { env: { PATH: unsafe } }), throwsCode("CLI_LAUNCHER_PATH"));
  const linked = path.join(f.root, "linked-bin");
  await symlink(safe, linked, process.platform === "win32" ? "junction" : "dir");
  assert.throws(() => buildEnterpriseCliInvocation("pac", ["--version"], { cwd: f.root }, { env: { PATH: linked } }), throwsCode("CLI_LAUNCHER_PATH"));
});

test("published receipts cannot manufacture authoritative catalog or conversation verification", async (t) => {
  const f = await atkFixture(t, "publish");
  const provider = await createAtkProvider(f.context, f.deps);
  const receipt = await provider.execute("publish");
  const result = await provider.verify({ ...receipt, status: "published", publicationVerified: true });
  assert.equal(result.status, "publication-submitted");
  assert.equal(result.publicationVerified, false);
  assert.equal(result.responseId, null);
});

test("identity requests contain only reviewed hashes and derive the tenant from the profile in memory", async (t) => {
  for (const [factory, validate, f] of [
    [createPacProvider, validatePac, await pacFixture(t, "publish")],
    [createAtkProvider, validateAtk, await atkFixture(t, "publish")]
  ]) {
    const config = f.request.copilotStudio ?? f.request.agentsToolkit;
    delete config.identityEvidence.tenantId;
    assert.equal(validate(config), config);
    assert.throws(() => validate({ ...config, identityEvidence: { ...config.identityEvidence, tenantId } }), DeploymentError);
    const provider = await factory(f.context, f.deps);
    const snapshot = await provider.probe();
    assert.equal(snapshot.identitySha256, config.identityEvidence.sha256);
    const receipt = await provider.execute("publish");
    assert(!JSON.stringify({ request: f.request, snapshot, receipt }).includes(tenantId));
  }
});

test("optional workspace uses an owned package-bound run path without writing during probe", async (t) => {
  for (const [tool, factory, f] of [
    ["pac", createPacProvider, await pacFixture(t, "publish")],
    ["atk", createAtkProvider, await atkFixture(t, "provision")]
  ]) {
    delete f.context.workDirectory;
    const provider = await factory(f.context, f.deps);
    await provider.probe();
    assert(!(await readdir(f.root)).includes("reports"));
    const operation = tool === "pac" ? "publish" : "provision";
    await provider.execute(operation);
    const command = f.calls.find(({ args }) => tool === "pac" ? args[1] === operation : args[0] === operation);
    const expected = path.join(f.root, "reports", "agent-deployment", "platform-work", tool, f.context.packageSha256);
    assert.equal(command.options.cwd, tool === "pac" ? expected : path.join(expected, "atk-source"));
  }
});

test("purely local package probes permit an absent target authentication profile", async (t) => {
  for (const [factory, f] of [
    [createPacProvider, await pacFixture(t, "pack")],
    [createAtkProvider, await atkFixture(t, "package")]
  ]) {
    f.context.profile = null;
    const snapshot = await (await factory(f.context, f.deps)).probe();
    assert.equal(snapshot.phase, "ready");
    assert(!f.calls.some(({ args }) => args[0] === "auth"));
  }
});
