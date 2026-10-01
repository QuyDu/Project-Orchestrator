import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { copyFile, cp, mkdir, mkdtemp, readFile, readdir, realpath, rm, symlink, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { pathToFileURL } from "node:url";
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
  const root = await realpath(await mkdtemp(path.join(os.tmpdir(), "pso-platform-fixture-")));
  assert.ok(!root.startsWith(`${repo}${path.sep}`), "platform fixtures must not enter repository evidence scans");
  await mkdir(path.join(root, "source"), { recursive: true });
  await mkdir(path.join(root, "run"), { recursive: true });
  t.after(async () => {
    await rm(root, { recursive: true, force: true, maxRetries: 5, retryDelay: 100 });
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

test("PAC import uses a reviewed non-agent ZIP and settings without requesting publication", async (t) => {
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

function studioSolution({ configuration = '{"publishOnImport":false}', component = "rev_topic", bot = "rev_agent" } = {}) {
  return zip({
    "solution.xml": '<?xml version="1.0"?><ImportExportXml><SolutionManifest><UniqueName>ReviewedAgent</UniqueName><Version>1.0.0.0</Version><Managed>1</Managed><Publisher><CustomizationPrefix>rev</CustomizationPrefix></Publisher></SolutionManifest></ImportExportXml>',
    "customizations.xml": `<ImportExportXml><bots><bot schemaname="${bot}" botid="${botId}"><configuration>${configuration.replaceAll("&", "&amp;").replaceAll("<", "&lt;")}</configuration></bot></bots><botcomponents><botcomponent schemaname="${component}"/></botcomponents></ImportExportXml>`,
    "[Content_Types].xml": "<Types />"
  });
}

for (const configuration of [
  '{"publishOnImport":true}', '{"publishOnImport":"false"}',
  '{"publishOnImport":true,"publishOnImport":false}', '{}',
  '{"configuration":{"publishOnImport":true}}'
]) {
  test(`PAC rejects unsupported or ambiguous import publication configuration ${configuration}`, async (t) => {
    const f = await pacFixture(t);
    f.request.copilotStudio.solution = await f.put("input/solution.zip", studioSolution({ configuration }));
    const provider = await createPacProvider(f.context, f.deps);
    await assert.rejects(provider.execute("import"), /publication|publishOnImport|configuration/i);
    assert.equal(f.calls.length, 0, "hidden publication must block even version/auth calls");
  });
}

test("PAC connected authoring content is preserved and routed to solution ALM before pack", async (t) => {
  const f = await pacFixture(t, "pack");
  const content = "kind: TaskDialog\ntriggerCondition: =false\n";
  await f.put("source/actions/reader.mcs.yml", content, true);
  const provider = await createPacProvider(f.context, f.deps);
  await assert.rejects(provider.execute("pack"), /connected|workspace|solution ALM/i);
  assert.equal(f.calls.length, 0);
  assert.equal(await readFile(path.join(f.root, "source/actions/reader.mcs.yml"), "utf8"), content);
});

test("Studio solution evidence rejects incomplete membership and ambiguous configuration", async () => {
  const { inspectStudioSolution } = await import("../.github/skills/agent-deployment/scripts/providers/studio-evidence.mjs");
  const files = inspectZip(studioSolution()).files;
  assert.equal(inspectStudioSolution(files, { requiredComponents: ["rev_agent", "rev_topic"], nativeMode: true }).publishOnImport, false);
  assert.throws(() => inspectStudioSolution(files, { requiredComponents: ["rev_agent", "missing_topic"], nativeMode: true }), /membership|component/i);
  assert.throws(() => inspectStudioSolution(files, { requiredComponents: [], nativeMode: true }), /membership|component/i);
});

test("native import rejects hidden security changes extra component types and a different bot identity", async () => {
  const { inspectStudioSolution } = await import("../.github/skills/agent-deployment/scripts/providers/studio-evidence.mjs");
  const options = { requiredComponents: ["rev_agent", "rev_topic"], nativeMode: true, expectedBotId: botId };
  for (const configuration of [
    '{"publishOnImport":false,"authenticationMode":"none"}',
    '{"publishOnImport":false,"audience":"external"}',
    '{"publishOnImport":false,"connectionProperties":{"mode":"Maker"}}',
    '{"publishOnImport":false,"dlpBypass":true}'
  ]) {
    assert.throws(() => inspectStudioSolution(inspectZip(studioSolution({ configuration })).files, options), /security|ownership|scope/i);
  }
  const files = inspectZip(studioSolution()).files;
  const original = files.get("customizations.xml").toString("utf8");
  files.set("customizations.xml", Buffer.from(original.replace("</ImportExportXml>", "<Roles><Role id=\"unreviewed\"/></Roles></ImportExportXml>")));
  assert.throws(() => inspectStudioSolution(files, options), /roles|component/i);
  files.set("customizations.xml", Buffer.from(original.replace(botId, tenantId)));
  assert.throws(() => inspectStudioSolution(files, options), /identity|target/i);
  files.set("customizations.xml", Buffer.from(original.replace(botId, `{${botId}}`)));
  assert.equal(inspectStudioSolution(files, options).publishOnImport, false);
});

const studioTarget = {
  cloud: "AzureCloud", tenantId, environmentId: "66666666-6666-4666-8666-666666666666", dataverseUrl: environment, botId
};
function evaluationSpec() {
  const toolsConnections = [{
    botId, botSchemaName: "rev_agent", connections: [
      { connectionId: "reviewed-user-connection", connectionReferenceName: "rev_records", connectorId: "shared_records" }
    ]
  }];
  return {
    target: studioTarget, testSetId: "77777777-7777-4777-8777-777777777777", testSetSha256: "a".repeat(64),
    definitionSha256: "b".repeat(64), version: { kind: "draft", id: "reviewed-draft" },
    requiredToolBindings: toolsConnections,
    body: { evaluationRunName: "reviewed-run-1", mcsConnectionId: "reviewed-profile", runOnPublishedBot: false, toolsConnections },
    cases: [{ id: "question-1", expectedSubstring: "The total is 42", requiresSideEffect: false }]
  };
}

function completedEvaluation(spec = evaluationSpec()) {
  return {
    target: spec.target, runId: "88888888-8888-4888-8888-888888888888", evaluationRunName: spec.body.evaluationRunName,
    testSetId: spec.testSetId, testSetSha256: spec.testSetSha256, definitionSha256: spec.definitionSha256,
    version: spec.version, mcsConnectionId: spec.body.mcsConnectionId, toolsConnections: spec.body.toolsConnections,
    state: "Completed", executionState: "Completed",
    cases: [{ id: "question-1", responseText: "The total is 42 units.", graderResult: "Pass", quality: "relevant" }]
  };
}

test("Studio target resolution requires one vetted environment and never a hosting subscription", async () => {
  const { resolveStudioEnvironment } = await import("../.github/skills/agent-deployment/scripts/providers/studio-evidence.mjs");
  const candidate = { ...studioTarget, displayName: "Reviewed Environment", evidenceSha256: "a".repeat(64) };
  delete candidate.botId;
  const scope = { tenantId, cloud: "AzureCloud" };
  assert.deepEqual(resolveStudioEnvironment("Reviewed Environment", [candidate], scope), candidate);
  assert.equal(Object.hasOwn(candidate, "subscriptionId"), false);
  assert.throws(() => resolveStudioEnvironment("Reviewed Environment", [
    candidate, { ...candidate, environmentId: botId }
  ], scope), /ambiguous/i);
  assert.throws(() => resolveStudioEnvironment("Unknown", [candidate], scope), /missing/i);
  assert.throws(() => resolveStudioEnvironment(candidate.environmentId, [candidate], { ...scope, cloud: "AzureUSGovernment" }), /cloud/i);
});

test("Studio approvals reuse only the same operation target identity audience mutation and lifetime", async () => {
  const { validateStudioApproval } = await import("../.github/skills/agent-deployment/scripts/providers/studio-evidence.mjs");
  const scope = { operation: "import", targetSha256: "a".repeat(64), identitySha256: "b".repeat(64), audienceSha256: "c".repeat(64), mutationSha256: "d".repeat(64) };
  const approval = { scope, approved: true, grantedAt: "2026-09-30T08:00:00Z", expiresAt: "2026-09-30T09:00:00Z" };
  const options = { now: "2026-09-30T08:30:00Z" };
  assert.equal(validateStudioApproval(approval, scope, options), approval);
  for (const key of Object.keys(scope)) {
    const changed = { ...scope, [key]: key === "operation" ? "publish" : "f".repeat(64) };
    assert.throws(() => validateStudioApproval(approval, changed, options), /scope|differs/i);
  }
  assert.throws(() => validateStudioApproval(approval, scope, { now: approval.expiresAt }), /expired/i);
});

test("Studio evaluation rejects null profiles missing tool bindings and invented API version fields", async () => {
  const { validateEvaluationRequest } = await import("../.github/skills/agent-deployment/scripts/providers/studio-evidence.mjs");
  const original = evaluationSpec();
  assert.equal(validateEvaluationRequest(original), original);
  for (const mutate of [
    (spec) => { spec.body.mcsConnectionId = null; },
    (spec) => { spec.body.toolsConnections = []; },
    (spec) => { spec.body.version = "invented-version-property"; },
    (spec) => { spec.body.runOnPublishedBot = true; }
  ]) {
    const spec = structuredClone(original);
    mutate(spec);
    assert.throws(() => validateEvaluationRequest(spec), /contract|binding|version/i);
  }
});

test("Studio HTTP 200 and 202 admit but never complete evaluations or repeat an ambiguous POST", async () => {
  const { recordEvaluationAdmission, reconcileEvaluationRun } = await import("../.github/skills/agent-deployment/scripts/providers/studio-evidence.mjs");
  const spec = evaluationSpec();
  const run = completedEvaluation(spec);
  const callbackUri = `https://api.powerplatform.com/copilotstudio/environments/${studioTarget.environmentId}/bots/${botId}/api/makerevaluation/testruns/${run.runId}?api-version=2024-10-01`;
  for (const status of [200, 202]) {
    const attempt = recordEvaluationAdmission(null, { status, body: { runId: run.runId, state: "Completed", callbackUri } }, spec);
    assert.equal(attempt.status, "pending");
    assert.equal(attempt.runId, run.runId);
    assert.equal(attempt.retryAllowed, false);
    assert.throws(() => recordEvaluationAdmission(attempt, { status, body: run }, spec), /reconcile/i);
  }
  const ambiguous = recordEvaluationAdmission(null, { status: 500 }, spec);
  assert.equal(ambiguous.status, "unknown");
  assert.equal(reconcileEvaluationRun(ambiguous, [], spec).retryAllowed, false);
  const reconciled = reconcileEvaluationRun(ambiguous, [run], spec);
  assert.equal(reconciled.runId, run.runId);
  assert.equal(reconciled.status, "pending");
  assert.equal(reconcileEvaluationRun(ambiguous, [run, { ...run, runId: botId }], spec).status, "unknown");
});

test("Studio callback rejects other hosts targets query tokens and redirects while retaining admitted run IDs", async () => {
  const { recordEvaluationAdmission, validateEvaluationCallback } = await import("../.github/skills/agent-deployment/scripts/providers/studio-evidence.mjs");
  const spec = evaluationSpec();
  const run = completedEvaluation(spec);
  const route = `/copilotstudio/environments/${studioTarget.environmentId}/bots/${botId}/api/makerevaluation/testruns/${run.runId}?api-version=2024-10-01`;
  const valid = `https://api.powerplatform.com${route}`;
  assert.equal(validateEvaluationCallback(valid, studioTarget, run.runId), valid);
  for (const uri of [
    `http://api.powerplatform.com${route}`, `https://api.powerplatform.com.attacker.invalid${route}`,
    `https://attacker.invalid${route}`, valid.replace(studioTarget.environmentId, tenantId),
    `${valid}&code=private-oauth-code`, valid.replace("testruns/", "testruns/%2e%2e/")
  ]) {
    assert.throws(() => validateEvaluationCallback(uri, studioTarget, run.runId), /callback/i);
    const result = recordEvaluationAdmission(null, { status: 202, body: { runId: run.runId, callbackUri: uri } }, spec);
    assert.equal(result.runId, run.runId);
    assert.equal(result.status, "blocked");
    assert.equal(result.callbackUri, null);
    assert.doesNotMatch(JSON.stringify(result), /private-oauth-code|attacker/);
  }
});

test("Studio functional gate rejects connection boilerplate NA grades stale sets and draft mismatches", async () => {
  const { assessEvaluationRun } = await import("../.github/skills/agent-deployment/scripts/providers/studio-evidence.mjs");
  const spec = evaluationSpec();
  const run = completedEvaluation(spec);
  assert.equal(assessEvaluationRun(spec, run).status, "verified");
  for (const mutate of [
    (value) => { value.cases[0].responseText = "Let's get you connected first. The total is 42"; },
    (value) => { value.cases[0].quality = "NA"; },
    (value) => { value.cases = []; },
    (value) => { value.mcsConnectionId = null; },
    (value) => { value.version.kind = "published"; },
    (value) => { value.testSetSha256 = "f".repeat(64); }
  ]) {
    const changed = structuredClone(run);
    mutate(changed);
    assert.notEqual(assessEvaluationRun(spec, changed).status, "verified");
  }
});

test("Studio source no-op publication labels and off-channel errors never prove layered delivery", async () => {
  const { assessStudioEvidence, assessStudioDiagnostics, verifyStudioSetting, assertStudioSecurityInvariant } =
    await import("../.github/skills/agent-deployment/scripts/providers/studio-evidence.mjs");
  const supplied = { authoredSha256: "a".repeat(64), operation: "publish",
    publication: { componentstate: "Published", status: "Provisioned", exitCode: 0 } };
  const evidence = assessStudioEvidence(supplied);
  assert.equal(evidence.authored.status, "verified");
  for (const key of ["synchronized", "imported", "provisioned", "evaluated", "published", "channelVerified"]) {
    assert.notEqual(evidence[key].status, "verified");
  }
  const expected = { target: studioTarget, property: "description", value: "Reviewed description" };
  assert.equal(verifyStudioSetting(expected, { exitCode: 0, noChanges: true }).status, "pending");
  assert.equal(verifyStudioSetting(expected, { ...expected, value: "Old description", source: "provider-readback", observedAt: "2026-09-30T08:30:00Z" }).status, "failed");
  const unsafe = { ...expected, property: "authenticationmode", value: "none" };
  assert.equal(verifyStudioSetting(unsafe, { ...unsafe, source: "provider-readback", observedAt: "2026-09-30T08:30:00Z" }).status, "blocked");
  const diagnostics = assessStudioDiagnostics({ accessPath: "teams", issues: [
    { accessPath: "direct-engine", severity: "Blocking", code: "DLP_VIOLATION" },
    { accessPath: "teams", severity: "Warning", code: "FIRST_CHANNEL_NOT_CONNECTED" }
  ] });
  assert.equal(diagnostics.status, "pending");
  assert.deepEqual(diagnostics.blocking, []);
  const before = { authenticationMode: "microsoft-single-tenant", authenticationTrigger: "always", audience: "tenant",
    channels: ["teams"], toolIdentity: "Invoker", audienceSha256: "c".repeat(64), dlpPolicySha256: "a".repeat(64) };
  assert.equal(assertStudioSecurityInvariant(before, structuredClone(before)), true);
  for (const field of ["authenticationMode", "audience", "toolIdentity", "audienceSha256", "dlpPolicySha256"]) {
    assert.throws(() => assertStudioSecurityInvariant(before, { ...before, [field]: "unsafe-workaround" }), /scope|unsupported|plan-bound/i);
  }
});

test("PAC known bad status query blocks explicitly and never alters schema or prints provider credentials", async (t) => {
  const f = await pacFixture(t, "publish");
  const normal = f.deps.runCli;
  f.deps.runCli = async (tool, args, options) => args[1] === "status"
    ? { exitCode: 1, stdout: "", stderr: "Invalid componentstate_Property; Bearer this-private-token-must-never-escape" }
    : normal(tool, args, options);
  const provider = await createPacProvider(f.context, f.deps);
  await assert.rejects(provider.probe(), (error) => {
    assert.equal(error.code, "PAC_STATUS_QUERY_UNSUPPORTED");
    assert.doesNotMatch(error.message, /this-private-token|Bearer/);
    return true;
  });

  test("PAC accepts an exact reviewed Power Platform target without an Azure hosting profile", async (t) => {
    const f = await pacFixture(t);
    f.context.profile = null;
    f.context.studioTarget = studioTarget;
    const provider = await createPacProvider(f.context, f.deps);
    const receipt = await provider.execute("import");
    assert.equal(receipt.status, "imported");
    assert.equal(receipt.publicationVerified, false);
    assert.equal(f.calls.some(({ args }) => args.includes("subscription") || args.includes("login")), false);
    f.context.profile = { cloud: "AzureUSGovernment" };
    await assert.rejects(createPacProvider(f.context, f.deps), /conflicts|cloud/i);
  });
  assert.equal(f.calls.some(({ args }) => ["publish", "update", "import"].includes(args[1])), false);
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

async function nativeStudioFixture(t, { prepared = false } = {}) {
  const f = await pacFixture(t);
  const core = await centralFixture(f);
  await rm(path.join(f.root, ".azure"), { recursive: true, force: true });
  f.request.schemaVersion = "1.1.0";
  f.request.runtime.kind = "native-copilot-studio";
  f.request.mode = "update";
  const observation = (state = "unknown", evidence = []) => ({ state, evidence, detail: "Synthetic offline review evidence; no live operation." });
  const directory = "copilot-studio/reviewed-agent";
  const guide = await f.put(".github/instructions/copilot-studio.instructions.md", '---\nname: "Studio"\ndescription: "Native Studio operator guide"\napplyTo: "copilot-studio/**,**/*.mcs.yml,**/*.mcs.yaml,scripts/*studio*.ts,tests/studio-*.test.ts"\n---\n# Native Studio\nKeep authentication and scope unchanged.\n');
  const metadata = await f.put(`${directory}/agent.mcs.yml`, 'kind: GptComponentMetadata\nmcs.metadata:\n  componentName: Reviewed Agent\n  description: A static reviewed agent.\ninstructions: Reply only using the reviewed static topic.\n');
  const topic = await f.put(`${directory}/topics/topic.mcs.yml`, 'kind: AdaptiveDialog\nmodelDescription: Explain the reviewed total.\nbeginDialog:\n  kind: OnRecognizedIntent\n  id: main\n  intent:\n    triggerQueries:\n      - What is the total\n  actions:\n    - kind: SendActivity\n      id: reply\n      activity: The total is 42 units.\n');
  const agent = { id: "reviewed-agent", name: "Reviewed Agent", schemaName: "rev_agent", publisherPrefix: "rev" };
  const origin = prepared ? { agent: "new", operation: "prepare" } : { agent: "existing", operation: "import" };
  const security = { authentication: "microsoft-single-tenant", audience: "tenant", channels: ["teams"], toolIdentity: "invoker", requirements: ["Preserve Microsoft authentication and approved audience."] };
  const specification = {
    schemaVersion: "1.0.0", runtime: "native-copilot-studio",
    intent: { ...origin }, agent, target: { cloud: "Public", solutionUniqueName: "ReviewedAgent" },
    security, tooling: { pacVersion: cliVersion },
    source: { directory, files: [{ path: "authored/topic.mcs.yml", target: "topics/topic.mcs.yml" }] },
    capabilities: [{ id: "static-response", scope: "required", description: "Return the reviewed static answer.",
      sourcePaths: ["topics/topic.mcs.yml"], acceptanceCriteria: ["The answer contains The total is 42."], persistence: { mode: "none", operations: [] } }]
  };
  const spec = await f.put("native-spec.json", JSON.stringify(specification));
  const targetReview = {
    schemaVersion: "1.0.0", kind: "studio-target-review", source: "operator-reviewed",
    observedAt: "2026-09-22T13:55:00Z", expiresAt: "2026-09-22T14:55:00Z", cloud: "AzureCloud", tenantId,
    environmentSelector: "Reviewed Environment",
    environments: [{ displayName: "Reviewed Environment", environmentId: studioTarget.environmentId, dataverseUrl: environment,
      tenantId, cloud: "AzureCloud", evidenceSha256: "a".repeat(64) }],
    botId, agentSchemaName: "rev_agent", solutionName: "ReviewedAgent",
    identitySha256: f.request.copilotStudio.identityEvidence.sha256,
    security: { authenticationMode: "microsoft-single-tenant", authenticationTrigger: "always", audience: "tenant",
      channels: ["teams"], toolIdentity: "Invoker", audienceSha256: "c".repeat(64), dlpPolicySha256: "b".repeat(64) }
  };
  const targetRef = await f.put("reviews/target.json", JSON.stringify(targetReview));
  const archive = studioSolution();
  f.request.copilotStudio.solution = await f.put("input/solution.zip", archive);
  const recovery = await f.put("recovery/prior.zip", archive);
  const membership = {
    schemaVersion: "1.0.0", kind: "studio-solution-membership", solutionName: "ReviewedAgent",
    solutionSha256: f.request.copilotStudio.solution.sha256,
    components: [{ path: metadata.path, schemaName: "rev_agent" }, { path: topic.path, schemaName: "rev_topic" }],
    recoverySha256: recovery.sha256
  };
  const membershipRef = await f.put("reviews/membership.json", JSON.stringify(membership));
  const handoff = {
    schemaVersion: "1.0.0", runtime: "native-copilot-studio",
    intent: { ...origin, owner: "agent-deployment" }, agent,
    target: {
      cloud: "Public", ...Object.fromEntries(["tenant", "environment", "dataverse", "bot"].map((name) => [name, observation("verified", [targetRef])])),
      solution: { uniqueName: "ReviewedAgent", readiness: observation("verified", [targetRef]) }
    },
    security: { ...security, policy: observation("verified", [targetRef]) },
    capabilities: [{
      id: "static-response", scope: "required", description: specification.capabilities[0].description,
      sourcePaths: [topic.path], implementation: observation("verified", [topic]),
      acceptance: { ...observation(), criteria: specification.capabilities[0].acceptanceCriteria },
      persistence: { ...observation("not-requested"), mode: "none", operations: [] }, gaps: ["Runtime acceptance is pending."]
    }],
    artifacts: {
      guide, spec, authored: [metadata, topic], connectedDirectory: null,
      solutionMembership: { ...observation("verified", [membershipRef]), components: [metadata.path, topic.path], missing: [] },
      recovery: { ...observation("verified", [recovery]), artifacts: [recovery], procedure: ["Review compatible restoration separately; no destructive automatic rollback."] }
    },
    approvals: Object.fromEntries(["localMutation", "draft", "publication", "sharing", "cost", "security", "destructive"].map((key) => [key, observation("not-requested")])),
    evidence: Object.fromEntries(["authored", "localValidation", "synchronized", "imported", "provisioned", "evaluated", "publicationSubmitted", "serverPublished", "channelVerified"]
      .map((key) => [key, observation(["authored", "localValidation"].includes(key) ? "verified" : "not-requested", ["authored", "localValidation"].includes(key) ? [metadata, topic] : [])])),
    complete: false, gaps: ["Cloud, evaluation, publication and channel behavior remain unverified."]
  };
  f.request.blueprint = await f.put("native-blueprint.json", JSON.stringify({
    schemaVersion: "3.0.0", agentType: "copilot-studio", id: agent.id, name: agent.name, nativeSpec: spec, guide
  }));
  const save = async () => {
    f.request.nativeStudioHandoff = await f.put("native-handoff.json", JSON.stringify(handoff));
    await f.put("native-request.json", JSON.stringify(f.request));
  };
  await save();
  return { f, core, handoff, targetReview, membership, observation, specification, save };
}

test("native 1.1 handoff is consumed through package plan apply verify without an Azure subscription", async (t) => {
  const { f, core, save } = await nativeStudioFixture(t);
  const packaged = await runDeployment("package", core.options, core.dependencies);
  assert.equal(packaged.schemaVersion, "1.1.0");
  assert.equal(packaged.studioEvidence.authored.status, "verified");
  const names = await readdir(path.join(f.root, packaged.packagePath));
  assert(names.includes("native-studio-handoff.json"));
  assert(!names.includes("instructions.txt") && !names.includes("agent.md"), "the native guide is not a remote business-agent prompt");
  const plan = await runDeployment("plan", core.options, core.dependencies);
  assert.equal(plan.status, "review-required", plan.reason);
  assert.equal(plan.schemaVersion, "1.1.0");
  assert.deepEqual(plan.requiredApprovals, ["solution-import"]);
  assert.equal(plan.nativeStudioHandoffSha256, f.request.nativeStudioHandoff.sha256);
  f.calls.length = 0;
  await assert.rejects(runDeployment("apply", { ...core.approved(plan), approve: [] }, core.dependencies), /approval/i);
  assert.equal(f.calls.length, 0, "rejected consent must not even run PAC version/auth");
  const result = await runDeployment("apply", core.approved(plan), core.dependencies);
  assert.equal(result.status, "imported", result.message);
  assert.equal(result.studioEvidence.imported.status, "pending");
  assert.equal(result.studioEvidence.published.status, "unknown");
  assert.equal(result.studioEvidence.channelVerified.status, "unknown");
  assert.equal(result.platformOutcome.publicationVerified, false);
  const verified = await runDeployment("verify", { project: f.root, plan: "reports/agent-deployment-plan.json" }, core.dependencies);
  assert.equal(verified.status, "verification-required");
  assert.equal(verified.verifiedAt, null);
  await runDeployment("apply", core.approved(plan), core.dependencies);
  assert.equal(f.calls.filter(({ args }) => args[0] === "solution" && args[1] === "import").length, 1);
  const statePath = path.join(f.root, result.statePath);
  const state = JSON.parse(await readFile(statePath, "utf8"));
  state.studioEvidence.published = { status: "verified", code: "LOCAL_ATTESTATION", evidenceSha256: "a".repeat(64) };
  await writeFile(statePath, JSON.stringify(state));
  await assert.rejects(runDeployment("verify", { project: f.root, plan: "reports/agent-deployment-plan.json" }, core.dependencies), /contract|attestation|evidence/i);
  await save();
});

test("native pending target unsupported operations and source drift stop before provider calls", async (t) => {
  const { f, core, handoff, observation, save } = await nativeStudioFixture(t);
  handoff.target.environment = observation("unknown");
  await save();
  const blocked = await runDeployment("plan", core.options, core.dependencies);
  assert.equal(blocked.status, "unavailable");
  assert.equal(f.calls.length, 0);
  handoff.intent.operation = "evaluate";
  delete f.request.copilotStudio;
  await save();
  const manual = await runDeployment("plan", core.options, core.dependencies);
  assert.equal(manual.status, "unavailable");
  assert.match(manual.reason, /manual|adapter/i);
  assert.equal(f.calls.length, 0);
  await writeFile(path.join(f.root, handoff.artifacts.authored[0].path), "changed source");
  await assert.rejects(runDeployment("package", core.options, core.dependencies), /digest|changed/i);
});

test("native reused approval is exact scoped and expired approval produces no CLI calls", async (t) => {
  const { nativeStudioApprovalScope } = await import("../.github/skills/agent-deployment/scripts/providers/studio-evidence.mjs");
  const { f, core, handoff, observation, save } = await nativeStudioFixture(t);
  const approval = {
    scope: nativeStudioApprovalScope(f.request, handoff, studioTarget), approved: true,
    grantedAt: "2026-09-22T13:50:00Z", expiresAt: "2026-09-22T14:50:00Z"
  };
  const ref = await f.put("reviews/approval.json", JSON.stringify({ schemaVersion: "1.0.0", kind: "studio-operation-approval", approval }));
  handoff.approvals.draft = observation("verified", [ref]);
  await save();
  const plan = await runDeployment("plan", core.options, core.dependencies);
  assert.equal(plan.status, "review-required", plan.reason);
  f.calls.length = 0;
  await assert.rejects(runDeployment("apply", { ...core.approved(plan), planDigest: "f".repeat(64) }, core.dependencies), /digest/i);
  assert.equal(f.calls.length, 0);
  core.dependencies.now = () => new Date("2026-09-22T14:51:00Z");
  await assert.rejects(runDeployment("apply", core.approved(plan), core.dependencies), /expired|approval/i);
  assert.equal(f.calls.length, 0);
});

test("native solution membership omitted components and automatic publication block the real PAC adapter", async (t) => {
  const { f, core, handoff, membership, observation, save } = await nativeStudioFixture(t);
  const archive = studioSolution({ configuration: '{"publishOnImport":true}' });
  f.request.copilotStudio.solution = await f.put("input/solution.zip", archive);
  membership.solutionSha256 = f.request.copilotStudio.solution.sha256;
  handoff.artifacts.solutionMembership.evidence = [await f.put("reviews/membership.json", JSON.stringify(membership))];
  await save();
  const plan = await runDeployment("plan", core.options, core.dependencies);
  assert.equal(plan.status, "unavailable");
  assert.match(plan.reason, /publishOnImport|publication/i);
  assert.equal(f.calls.length, 0);
  handoff.artifacts.solutionMembership = { ...observation("unknown"), components: [], missing: [handoff.artifacts.authored[1].path] };
  await save();
  const missing = await runDeployment("plan", core.options, core.dependencies);
  assert.equal(missing.status, "unavailable");
  assert.match(missing.reason, /membership/i);
  assert.equal(f.calls.length, 0);
});

test("native publication consumes profile functional and source read-back gates without circular channel warnings", async (t) => {
  const { f, core, handoff, observation, save } = await nativeStudioFixture(t);
  const common = f.request.copilotStudio;
  f.request.copilotStudio = { operation: "publish", expectedCliVersion: common.expectedCliVersion,
    environment: common.environment, identityEvidence: common.identityEvidence, botId };
  handoff.intent.operation = "publish";
  const spec = evaluationSpec();
  spec.definitionSha256 = digest(handoff.artifacts.authored);
  const run = completedEvaluation(spec);
  run.cases[0].responseText = "Let's get you connected first. The total is 42";
  const evaluationReview = { schemaVersion: "1.0.0", kind: "studio-evaluation-review", spec, run };
  const evaluationRef = await f.put("reviews/evaluation.json", JSON.stringify(evaluationReview));
  handoff.evidence.evaluated = observation("verified", [evaluationRef]);
  handoff.capabilities[0].acceptance = { ...observation("verified", [evaluationRef]), criteria: handoff.capabilities[0].acceptance.criteria };
  handoff.capabilities[0].gaps = [];
  const expected = { target: studioTarget, property: "description", value: "A static reviewed agent." };
  const settingReview = {
    schemaVersion: "1.0.0", kind: "studio-setting-review", definitionSha256: spec.definitionSha256, expected,
    readBack: { source: "provider-readback", observedAt: "2026-09-22T13:59:00Z", ...expected }
  };
  handoff.evidence.synchronized = observation("verified", [await f.put("reviews/setting.json", JSON.stringify(settingReview))]);
  const diagnostics = { schemaVersion: "1.0.0", kind: "studio-diagnostics-review", target: studioTarget, issues: [
    { severity: "Blocking", accessPath: "direct-engine", code: "DLP_VIOLATION" },
    { severity: "Warning", accessPath: "teams", code: "FIRST_CHANNEL_NOT_CONNECTED" }
  ] };
  handoff.security.policy.evidence.push(await f.put("reviews/diagnostics.json", JSON.stringify(diagnostics)));
  await save();
  const blocked = await runDeployment("plan", core.options, core.dependencies);
  assert.equal(blocked.status, "unavailable");
  assert.equal(blocked.studioEvidence.evaluated.status, "failed");
  assert.equal(f.calls.length, 0, "functional failure must not call the provider, even when graders Pass");
  evaluationReview.run = completedEvaluation(spec);
  const passingRef = await f.put("reviews/evaluation.json", JSON.stringify(evaluationReview));
  handoff.evidence.evaluated.evidence = [passingRef];
  handoff.capabilities[0].acceptance.evidence = [passingRef];
  settingReview.readBack.value = "Old description";
  handoff.evidence.synchronized.evidence = [await f.put("reviews/setting.json", JSON.stringify(settingReview))];
  await save();
  const sourceNoOp = await runDeployment("plan", core.options, core.dependencies);
  assert.equal(sourceNoOp.status, "unavailable");
  assert.equal(sourceNoOp.studioEvidence.synchronized.status, "failed");
  assert.equal(f.calls.length, 0);
  settingReview.readBack.value = expected.value;
  handoff.evidence.synchronized.evidence = [await f.put("reviews/setting.json", JSON.stringify(settingReview))];
  await save();
  const ready = await runDeployment("plan", core.options, core.dependencies);
  assert.equal(ready.status, "review-required", ready.reason);
  assert.equal(ready.studioEvidence.evaluated.status, "pending", "reviewed local evidence is not live validation");
  assert.deepEqual(ready.requiredApprovals, ["agent-publication"]);
  const result = await runDeployment("apply", core.approved(ready), core.dependencies);
  assert.equal(result.status, "publication-submitted", result.message);
  assert.equal(result.platformOutcome.publicationVerified, false);
  assert.equal(result.studioEvidence.published.status, "pending");
  assert.equal(result.studioEvidence.channelVerified.status, "unknown");
  assert.equal(result.verifiedAt, null);
});

test("native independent publication evidence must advance and a channel needs actual fresh responses", async () => {
  const { assessStudioEvidence } = await import("../.github/skills/agent-deployment/scripts/providers/studio-evidence.mjs");
  const binding = { target: studioTarget, definitionSha256: "a".repeat(64), securitySha256: "b".repeat(64) };
  const publication = {
    source: "provider-readback",
    expected: { ...binding, previousPublishedOn: "2026-09-22T13:00:00Z", operationStartedAt: "2026-09-22T14:00:00Z" },
    actual: { ...binding, publishedOn: "2026-09-22T14:01:00Z", observedAt: "2026-09-22T14:02:00Z" }
  };
  const observations = { publication, audienceSha256: "c".repeat(64), intendedChannels: ["teams"] };
  const published = assessStudioEvidence(observations);
  assert.equal(published.published.status, "verified", "pure supplied-readback checks are separate from the live PAC provider contract");
  assert.equal(published.channelVerified.status, "unknown");
  const channel = {
    source: "channel-observation", target: studioTarget, name: "teams", freshConversation: true,
    audienceSha256: observations.audienceSha256, publishedEvidenceSha256: published.published.evidenceSha256,
    cases: [{ passed: true, responseText: "The total is 42 units.", expectedSubstring: "The total is 42", requiresSideEffect: false }]
  };
  assert.equal(assessStudioEvidence({ ...observations, channel }).channelVerified.status, "verified");
  channel.cases[0].responseText = "Let's get you connected first. The total is 42";
  assert.equal(assessStudioEvidence({ ...observations, channel }).channelVerified.status, "unknown");
  for (const publishedOn of [null, publication.expected.previousPublishedOn, "2026-09-22T13:30:00Z"]) {
    assert.notEqual(assessStudioEvidence({ ...observations,
      publication: { ...publication, actual: { ...publication.actual, publishedOn } } }).published.status, "verified");
  }
});

test("installed native consumer has no source-repository dependency and new helper or guide drift invalidates approval", async (t) => {
  const { f, core, handoff } = await nativeStudioFixture(t);
  const scripts = path.join(f.root, ".github", "skills", "agent-deployment", "scripts");
  await cp(path.join(repo, ".github", "skills", "agent-deployment", "scripts"), scripts, { recursive: true });
  const builder = path.join(f.root, ".github", "skills", "agent-builder", "scripts");
  await mkdir(builder, { recursive: true });
  for (const name of ["agent-builder.mjs", "native-studio.mjs"]) {
    await copyFile(path.join(repo, ".github", "skills", "agent-builder", "scripts", name), path.join(builder, name));
  }
  await mkdir(path.join(f.root, "schemas"));
  for (const name of ["agent-deployment-request", "agent-deployment-plan", "agent-deployment-state", "agent-deployment-result",
    "agent-provider-capabilities", "agent-blueprint", "copilot-studio-handoff"]) {
    await copyFile(path.join(repo, "schemas", `${name}.schema.json`), path.join(f.root, "schemas", `${name}.schema.json`));
  }
  const installed = await import(pathToFileURL(path.join(scripts, "agent-deployment.mjs")));
  const deps = { now: core.dependencies.now, runCli: f.deps.runCli };
  const plan = await installed.runDeployment("plan", core.options, deps);
  assert.equal(plan.status, "review-required", plan.reason);
  f.calls.length = 0;
  const guide = path.join(f.root, handoff.artifacts.guide.path);
  const priorGuide = await readFile(guide);
  await writeFile(guide, Buffer.concat([priorGuide, Buffer.from("\nchanged guidance\n")]));
  await assert.rejects(installed.runDeployment("apply", core.approved(plan), deps), /digest|changed/i);
  assert.equal(f.calls.length, 0);
  await writeFile(guide, priorGuide);
  const helper = path.join(scripts, "providers", "studio-evidence.mjs");
  await writeFile(helper, `${await readFile(helper, "utf8")}\n`);
  await assert.rejects(installed.runDeployment("apply", core.approved(plan), deps), /implementation|changed/i);
  assert.equal(f.calls.length, 0);
});

test("native export cannot claim complete retained recovery when the output omits a reviewed component", async (t) => {
  const { f, core, handoff, save } = await nativeStudioFixture(t);
  const prior = f.request.copilotStudio;
  f.request.copilotStudio = {
    operation: "export", expectedCliVersion: prior.expectedCliVersion, environment: prior.environment,
    identityEvidence: prior.identityEvidence, solutionName: prior.solutionName, solutionVersion: prior.solutionVersion,
    outputFile: "output/recovery.zip"
  };
  handoff.intent.operation = "troubleshoot";
  await save();
  const archive = studioSolution({ component: "omitted_topic" });
  let retained;
  f.effect(async (_tool, args) => {
    retained = args[args.indexOf("--path") + 1];
    await writeFile(retained, archive);
    return success("Export accepted.");
  });
  const plan = await runDeployment("plan", core.options, core.dependencies);
  assert.equal(plan.status, "review-required", plan.reason);
  const result = await runDeployment("apply", core.approved(plan), core.dependencies);
  assert.equal(result.status, "partial");
  assert.equal(result.code, "STUDIO_COMPONENT_MEMBERSHIP");
  assert.deepEqual(await readFile(retained), archive, "unsupported/incomplete output stays available for operator recovery review");
  await assert.rejects(runDeployment("apply", core.approved(plan), core.dependencies), /partial|reconcile/i);
});

function prepareOperationConfig(prior, handoff, operation) {
  const common = { operation, expectedCliVersion: prior.expectedCliVersion };
  if (operation === "pack") return {
    ...common, projectDirectory: `copilot-studio/${handoff.agent.id}`, sourceFiles: handoff.artifacts.authored,
    publisherPrefix: handoff.agent.publisherPrefix, solutionName: handoff.target.solution.uniqueName,
    solutionVersion: "1.0.0.0", outputDirectory: "output", outputFileName: "ReviewedAgent.zip"
  };
  const remote = { ...common, environment: prior.environment, identityEvidence: prior.identityEvidence };
  if (operation === "publish") return { ...remote, botId };
  if (operation === "export") return {
    ...remote, solutionName: handoff.target.solution.uniqueName, solutionVersion: "1.0.0.0", outputFile: "output/ReviewedAgent.zip"
  };
  return { ...prior, operation };
}

for (const operation of ["pack", "import", "publish", "export"]) {
  test(`immutable prepare provenance supports independently approved ${operation} request and update mode`, async (t) => {
    const { f, core, handoff, observation, save } = await nativeStudioFixture(t, { prepared: true });
    f.request.copilotStudio = prepareOperationConfig(f.request.copilotStudio, handoff, operation);
    if (operation === "publish") {
      const spec = evaluationSpec();
      spec.definitionSha256 = digest(handoff.artifacts.authored);
      const ref = await f.put("reviews/evaluation.json", JSON.stringify({
        schemaVersion: "1.0.0", kind: "studio-evaluation-review", spec, run: completedEvaluation(spec)
      }));
      handoff.evidence.evaluated = observation("verified", [ref]);
      handoff.capabilities[0].acceptance = { ...observation("verified", [ref]), criteria: handoff.capabilities[0].acceptance.criteria };
      handoff.capabilities[0].gaps = [];
      const expected = { target: studioTarget, property: "description", value: "A static reviewed agent." };
      handoff.evidence.synchronized = observation("verified", [await f.put("reviews/setting.json", JSON.stringify({
        schemaVersion: "1.0.0", kind: "studio-setting-review", definitionSha256: spec.definitionSha256, expected,
        readBack: { ...expected, source: "provider-readback", observedAt: "2026-09-22T13:59:00Z" }
      }))]);
    }
    await save();
    const frozen = await readFile(path.join(f.root, f.request.nativeStudioHandoff.path));
    const frozenSpec = await readFile(path.join(f.root, handoff.artifacts.spec.path));
    assert.equal(handoff.intent.operation, "prepare");
    assert.equal(handoff.intent.agent, "new");
    assert.equal(f.request.mode, "update");
    f.effect(async (_tool, args) => {
      if (operation === "pack") {
        await writeFile(path.join(args[args.indexOf("--output-path") + 1], "ReviewedAgent.zip"), solutionZip({ managed: false }));
      } else if (operation === "export") {
        await writeFile(args[args.indexOf("--path") + 1], studioSolution());
      }
      return success("Synthetic approved operation accepted.");
    });
    const packaged = await runDeployment("package", core.options, core.dependencies);
    assert.equal(packaged.schemaVersion, "1.1.0");
    const plan = await runDeployment("plan", core.options, core.dependencies);
    assert.equal(plan.status, "review-required", plan.reason);
    const required = { pack: "local-package-execution", import: "solution-import", publish: "agent-publication", export: "solution-export" }[operation];
    assert.deepEqual(plan.requiredApprovals, [required]);
    f.calls.length = 0;
    await assert.rejects(runDeployment("apply", { ...core.approved(plan), approve: [] }, core.dependencies), /approval/i);
    assert.equal(f.calls.length, 0, "preparation provenance cannot grant downstream consent");
    await assert.rejects(runDeployment("apply", { ...core.approved(plan), planDigest: "f".repeat(64) }, core.dependencies), /digest/i);
    assert.equal(f.calls.length, 0);
    const result = await runDeployment("apply", core.approved(plan), core.dependencies);
    assert.equal(result.status, operation === "import" ? "imported" : operation === "publish" ? "publication-submitted" : "packaged", result.message);
    const verified = await runDeployment("verify", { project: f.root, plan: "reports/agent-deployment-plan.json" }, core.dependencies);
    assert.notEqual(verified.status, "published");
    assert.equal(verified.verifiedAt, null);
    assert.equal(verified.platformOutcome.publicationVerified, false);
    assert.deepEqual(await readFile(path.join(f.root, f.request.nativeStudioHandoff.path)), frozen);
    assert.deepEqual(await readFile(path.join(f.root, handoff.artifacts.spec.path)), frozenSpec);
    assert.equal(f.request.nativeStudioHandoff.sha256, digest(frozen));
    f.calls.length = 0;
    await f.put("native-request.json", JSON.stringify({ ...f.request, release: "unreviewed-release" }));
    await assert.rejects(runDeployment("apply", core.approved(plan), core.dependencies), /changed|drift/i);
    assert.equal(f.calls.length, 0, "provenance compatibility must not reuse approval for a changed current request");
  });
}

test("real builder prepare handoff is consumed unchanged with readiness and downstream approval boundaries intact", async (t) => {
  const { f, core, handoff: seed, specification } = await nativeStudioFixture(t, { prepared: true });
  const directory = specification.source.directory;
  const metadata = await readFile(path.join(f.root, seed.artifacts.authored[0].path), "utf8");
  const topic = await readFile(path.join(f.root, seed.artifacts.authored[1].path));
  await f.put(specification.source.files[0].path, topic);
  await rm(path.join(f.root, directory), { recursive: true });
  specification.tooling.pacVersion = "2.12.2";
  await f.put("native-spec.json", JSON.stringify(specification));
  const log = path.join(f.root, "preparation-commands.jsonl");
  const fake = path.join(f.root, "local-pac.cjs");
  await writeFile(fake, `const fs=require("node:fs"),path=require("node:path");
const args=process.argv.slice(2);fs.appendFileSync(${JSON.stringify(log)},JSON.stringify(args)+"\\n");
if(args.includes("--environment")||["auth","env","solution"].includes(args[0]))process.exit(90);
if(args.join(" ")==="--version"){console.log("Microsoft PowerPlatform CLI Version: 2.12.2");process.exit(0);}
if(args.join(" ")==="copilot init help"){console.log("--name --publisher-prefix --schema-name --project-dir");process.exit(0);}
if(args[0]!=="copilot"||args[1]!=="init")process.exit(91);
const out=args[args.indexOf("--project-dir")+1];fs.mkdirSync(out,{recursive:true});
fs.writeFileSync(path.join(out,"agent.mcs.yml"),${JSON.stringify(metadata)});
`);
  const builder = path.join(repo, ".github", "skills", "agent-builder", "scripts", "agent-builder.mjs");
  const run = (command, args) => {
    const result = spawnSync(process.execPath, [builder, command, "--project", f.root, ...args, "--accept-risk", "--json"], {
      cwd: f.root, encoding: "utf8", env: { ...process.env, PSO_PAC_PATH: fake }, timeout: 30_000
    });
    assert.equal(result.status, 0, result.stderr || result.stdout);
    return JSON.parse(result.stdout);
  };
  const built = run("build", ["--type", "copilot-studio", "--native-spec", "native-spec.json"]);
  const installed = run("apply", ["--blueprint", built.blueprintPath, "--plan", "reports/agent-builder-plan.json"]);
  const bytes = await readFile(path.join(f.root, installed.handoff.path));
  const prepared = JSON.parse(bytes);
  assert.deepEqual(prepared.intent, { agent: "new", operation: "prepare", owner: "agent-deployment" });
  f.request.blueprint = { path: built.blueprintPath, sha256: digest(await readFile(path.join(f.root, built.blueprintPath))) };
  f.request.nativeStudioHandoff = installed.handoff;
  const importConfig = f.request.copilotStudio;
  for (const operation of ["pack", "import", "publish", "export"]) {
    f.request.copilotStudio = prepareOperationConfig(importConfig, prepared, operation);
    await f.put("native-request.json", JSON.stringify(f.request));
    const packaged = await runDeployment("package", core.options, core.dependencies);
    assert.equal(packaged.status, "packaged");
    assert.deepEqual(await readFile(path.join(f.root, packaged.packagePath, "native-studio-handoff.json")), bytes);
    const plan = await runDeployment("plan", core.options, core.dependencies);
    assert.equal(plan.status, "unavailable", "unknown targets or unsupported canonical pack shape must not become executable");
    assert.doesNotMatch(plan.reason, /handoff operation|new\/existing intent/i);
    assert.equal(f.calls.length, 0, "no deployment CLI calls are authorized by the local builder receipt");
    await assert.rejects(runDeployment("apply", core.approved(plan), core.dependencies), /cannot execute|unavailable|Manual/i);
    assert.deepEqual(await readFile(path.join(f.root, installed.handoff.path)), bytes);
  }
  const commands = (await readFile(log, "utf8")).trim().split("\n").map(JSON.parse);
  assert(commands.every((args) => args[0] === "--version" || (args[0] === "copilot" && args[1] === "init")));
});

test("prepare provenance cannot bypass current scoped approval expiry or source identity", async (t) => {
  const { bindNativeStudioHandoff, nativeStudioApprovalScope } =
    await import("../.github/skills/agent-deployment/scripts/providers/studio-evidence.mjs");
  const { f, core, handoff, observation, save } = await nativeStudioFixture(t, { prepared: true });
  f.request.copilotStudio = prepareOperationConfig(f.request.copilotStudio, handoff, "pack");
  const approval = {
    scope: nativeStudioApprovalScope(f.request, handoff, null), approved: true,
    grantedAt: "2026-09-22T13:00:00Z", expiresAt: "2026-09-22T14:00:00Z"
  };
  handoff.approvals.localMutation = observation("verified", [await f.put("reviews/pack-approval.json", JSON.stringify({
    schemaVersion: "1.0.0", kind: "studio-operation-approval", approval
  }))]);
  await save();
  const plan = await runDeployment("plan", core.options, core.dependencies);
  assert.equal(plan.status, "unavailable");
  assert.match(plan.reason, /expired/i);
  assert.equal(f.calls.length, 0);
  assert.throws(() => bindNativeStudioHandoff(f.request, { id: "different-source" }, handoff, new Map()), /source identity/i);
});
