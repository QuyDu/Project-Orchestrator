import assert from "node:assert/strict";
import { copyFile, cp, mkdir, mkdtemp, readFile, readdir, rm, symlink, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { spawnSync } from "node:child_process";
import { pathToFileURL } from "node:url";
import test from "node:test";
import {
  digest, getCapabilities, runDeployment, stableJson, validateContract, validateRequest
} from "../.github/skills/agent-deployment/scripts/agent-deployment.mjs";
import { createFoundryProvider } from "../.github/skills/agent-deployment/scripts/providers/foundry.mjs";
import { buildAzureCliInvocation, runAzureCli } from "../.github/skills/agent-deployment/scripts/providers/azure-cli.mjs";
import { loadContext, validateOpenApi } from "../.github/skills/agent-deployment/scripts/package.mjs";
import { planPlatform } from "../.github/skills/agent-deployment/scripts/platform-engine.mjs";
import { validatePlatformOutcome, validatePlatformSnapshot } from "../.github/skills/agent-deployment/scripts/providers/platform-contract.mjs";
import { createMicrosoft365Provider } from "../.github/skills/agent-deployment/scripts/providers/microsoft365.mjs";

const root = path.resolve(import.meta.dirname, "..");
const skill = path.join(root, ".github", "skills", "agent-deployment");
const script = path.join(skill, "scripts", "agent-deployment.mjs");
const approvals = ["agent-version-create", "endpoint-configuration", "endpoint-routing", "endpoint-invocation"];
const gates = [
  "purchase-or-payment", "booking-or-external-commitment", "provider-contact-or-message",
  "account-identity-or-security-change", "sensitive-data-disclosure", "destructive-or-irreversible-action"
];
const now = new Date("2026-09-22T12:00:00Z");

function blueprint(target = "foundry-endpoint") {
  return {
    schemaVersion: "2.3.0", agentType: "portable", id: "review-helper", name: "Review Helper",
    description: "Use when explaining reviewed project documentation without external tools.",
    purpose: "Explain the supplied project documentation without taking any external actions.",
    risk: "read-only", capabilities: ["read"],
    autonomy: { mode: "guided", webSafety: "standard", approvalRequiredFor: gates },
    invocation: { userInvocable: true, modelInvocable: true },
    instructions: {
      constraints: ["Never execute tools or make external commitments."],
      approach: ["Read the context supplied by the caller carefully.", "State evidence and limitations without inventing facts."],
      outputFormat: "Return a concise explanation with explicit limitations."
    },
    subagents: [], handoffs: [],
    distribution: {
      targets: [target], versionPolicy: "pinned", environment: "development", dataBoundary: "organization",
      ...(target === "chatgpt-action-handoff" ? { chatgptVisibility: "workspace" } : {}),
      ...(target.startsWith("microsoft-365") ? { microsoft365Audience: "individual" } : {})
    }
  };
}

function providerDouble() {
  let remote = {
    exists: true, agentId: "agent-review-helper", identityId: "11111111-1111-4111-8111-111111111111",
    selector: "pinned", activeVersion: "1", protocols: ["responses"], authorization: ["Entra"],
    endpointSha256: "b".repeat(64), endpointPolicySha256: "d".repeat(64), agentPropertiesSha256: "e".repeat(64), hostedSource: null,
    versions: [{ id: "review-helper:1", version: "1", kind: "prompt", status: "active", draft: false, definitionSha256: "a".repeat(64), packageSha256: null, release: null }],
    apiVersion: "v1", cliVersion: "2.80.0"
  };
  const calls = [];
  const provider = {
    calls,
    remote: () => structuredClone(remote),
    setRemote: (value) => { remote = structuredClone(value); },
    async probe() { calls.push("probe"); return structuredClone(remote); },
    async createVersion(definition, metadata) {
      calls.push("create-version");
      const version = String(remote.versions.length + 1);
      const created = { id: `review-helper:${version}`, version };
      remote.exists = true;
      remote.agentId = "agent-review-helper";
      remote.identityId = "11111111-1111-4111-8111-111111111111";
      remote.agentPropertiesSha256 ??= "e".repeat(64);
      remote.endpointSha256 ??= "b".repeat(64);
      remote.endpointPolicySha256 ??= "d".repeat(64);
      remote.versions.push({ ...created, kind: "prompt", status: "active", draft: false, definitionSha256: digest(definition), packageSha256: metadata.pso_package, release: metadata.pso_release });
      return created;
    },
    async configureEndpoint() { calls.push("configure-endpoint"); remote.protocols = ["responses"]; remote.authorization = ["Entra"]; },
    async pinVersion(version) { calls.push(`pin:${version}`); remote.selector = "pinned"; remote.activeVersion = version; },
    async invoke() { calls.push("invoke"); return { id: "resp-test", status: "completed", outputText: "HEALTHY" }; }
  };
  return provider;
}

async function fixture(t, target = "foundry-endpoint") {
  const project = await mkdtemp(path.join(os.tmpdir(), "pso-deployment-core-"));
  await mkdir(path.join(project, ".azure"), { recursive: true });
  t.after(async () => {
    await rm(project, { recursive: true, force: true });
  });
  const source = `${JSON.stringify(blueprint(target), null, 2)}\n`;
  await writeFile(path.join(project, "agent.json"), source);
  const request = {
    schemaVersion: "1.0.0", blueprint: { path: "agent.json", sha256: digest(source) },
    target, release: "release-1", mode: "update", cloud: "AzureCloud", environment: "development",
    audience: target === "chatgpt-action-handoff" ? "workspace" : "individual",
    data: { classification: "internal", boundary: "organization", residency: ["eastus"] },
    runtime: { kind: "prompt", tools: [], acknowledgeLocalCapabilitiesOmitted: true },
    verification: { prompt: "Reply with HEALTHY only.", expectedSubstring: "HEALTHY", maxOutputTokens: 32 },
    rollback: { strategy: "repin", version: "1" }, acceptPreview: true
  };
  if (target === "foundry-endpoint") request.foundry = {
    projectEndpoint: "https://example.services.ai.azure.com/api/projects/test-project",
    apiVersion: "v1", modelDeployment: "review-model", location: "eastus", versionPolicy: "pinned",
    protocols: ["responses"], authorization: "Entra", quotaReviewed: true, costReviewed: true
  };
  const profile = {
    cloud: "AzureCloud", location: "eastus", environmentName: "development",
    authentication: { method: "interactive" }, mutationPolicy: "approval-required",
    subscription: { subscriptionId: "22222222-2222-4222-8222-222222222222", tenantId: "33333333-3333-4333-8333-333333333333" }
  };
  await writeFile(path.join(project, ".azure", "environment.json"), JSON.stringify(profile));
  await writeFile(path.join(project, ".azure", "agent-deployment-allowlist.json"), JSON.stringify({
    schemaVersion: "1.0.0", cloud: "AzureCloud",
    projectEndpoints: ["https://example.services.ai.azure.com/api/projects/test-project"]
  }));
  const provider = providerDouble();
  const deps = { now: () => now, frameworkRoot: path.join(project, "fixture-framework"), providerFactory: async () => provider };
  const save = async () => writeFile(path.join(project, "request.json"), `${JSON.stringify(request, null, 2)}\n`);
  await save();
  const plan = () => runDeployment("plan", { project, request: "request.json" }, deps);
  const read = async (name) => JSON.parse(await readFile(path.join(project, "reports", `agent-deployment-${name}.json`), "utf8"));
  const approved = (value) => ({
    project, plan: "reports/agent-deployment-plan.json", acceptRisk: true,
    approve: approvals, planDigest: value.planSha256
  });
  return { project, request, profile, provider, deps, save, plan, read, approved };
}

async function hostedFixture(t) {
  const f = await fixture(t);
  f.request.runtime.kind = "hosted";
  delete f.request.foundry.modelDeployment;
  const image = `approved.azurecr.io/review-agent@sha256:${"1".repeat(64)}`;
  const sbom = JSON.stringify({ bomFormat: "CycloneDX", specVersion: "1.6", components: [] });
  await writeFile(path.join(f.project, "sbom.json"), sbom);
  const evidence = JSON.stringify({
    schemaVersion: "1.0.0", agentName: "tested-helper", version: "1", image, blueprintSha256: f.request.blueprint.sha256,
    verifiedAt: "2026-09-22T11:00:00.000Z", expiresAt: "2026-09-23T11:00:00.000Z",
    passed: true, probeResponseSha256: "2".repeat(64)
  });
  await writeFile(path.join(f.project, "hosted-test.json"), evidence);
  f.request.hosted = {
    image, sbom: { path: "sbom.json", sha256: digest(sbom) }, testedAgentName: "tested-helper", testedVersion: "1",
    testEvidence: { path: "hosted-test.json", sha256: digest(evidence) }, cpu: "0.5", memory: "1Gi",
    protocolVersion: "2.0.0", idleTimeoutSeconds: 900, startupTimeoutSeconds: 300,
    codeReviewed: true, imageProvenanceReviewed: true
  };
  await writeFile(path.join(f.project, ".azure", "agent-deployment-allowlist.json"), JSON.stringify({
    schemaVersion: "1.0.0", cloud: "AzureCloud", projectEndpoints: [f.request.foundry.projectEndpoint],
    containerRegistries: ["approved.azurecr.io"]
  }));
  await f.save();
  const packaged = await runDeployment("package", { project: f.project, request: "request.json" }, f.deps);
  const definition = JSON.parse(await readFile(path.join(f.project, packaged.packagePath, "definition.json")));
  const remote = f.provider.remote();
  remote.versions[0].kind = "hosted";
  remote.hostedSource = {
    agentName: "tested-helper", version: "1", definitionSha256: digest(definition), identitySha256: "3".repeat(64),
    status: "active", draft: false, image
  };
  f.provider.setRemote(remote);
  const create = f.provider.createVersion;
  f.provider.createVersion = async (...args) => {
    const value = await create(...args);
    const updated = f.provider.remote();
    updated.versions.at(-1).kind = "hosted";
    updated.versions.at(-1).status = "creating";
    f.provider.setRemote(updated);
    return value;
  };
  f.provider.waitForVersion = async (version) => {
    f.provider.calls.push(`wait:${version}`);
    const updated = f.provider.remote();
    updated.versions.find((item) => item.version === version).status = "active";
    f.provider.setRemote(updated);
    return { id: `review-helper:${version}`, version };
  };
  return { ...f, definition };
}

async function publicationFixture(t, publishScope = "Shared") {
  const f = await fixture(t, "microsoft-365-copilot-and-teams");
  f.request.mode = "create";
  f.request.rollback = { strategy: "manual", version: null };
  f.request.data.residency = ["eastus", "global"];
  if (publishScope === "Tenant") {
    const value = blueprint("microsoft-365-copilot-and-teams");
    value.distribution.microsoft365Audience = "tenant";
    const bytes = JSON.stringify(value);
    await writeFile(path.join(f.project, "agent.json"), bytes);
    f.request.blueprint.sha256 = digest(bytes);
    f.request.audience = "tenant";
  }
  const endpoint = "https://example.services.ai.azure.com/api/projects/test-project";
  const proof = JSON.stringify({
    schemaVersion: "1.0.0", projectEndpoint: endpoint, agentName: "review-helper", version: "1",
    definitionSha256: "a".repeat(64), blueprintSha256: f.request.blueprint.sha256,
    verifiedAt: "2026-09-22T11:00:00.000Z", expiresAt: "2026-09-23T11:00:00.000Z",
    passed: true, probeResponseSha256: "b".repeat(64)
  });
  await writeFile(path.join(f.project, "publication-test.json"), proof);
  f.request.microsoft365 = {
    projectEndpoint: endpoint, apiVersion: "v1", location: "eastus", agentVersion: "1",
    definitionSha256: "a".repeat(64), testEvidence: { path: "publication-test.json", sha256: digest(proof) },
    bot: { resourceGroup: "rg-reviewed", name: "bot-review-helper", mode: "create-or-verify" },
    publishScope, appVersion: "1.0.0", agentDisplayName: "Review Helper",
    shortDescription: "Reviewed project helper.", fullDescription: "A reviewed agent for explaining project evidence with explicit limitations.",
    developerName: "Example", developerWebsiteUrl: "https://example.com",
    privacyUrl: "https://example.com/privacy", termsOfUseUrl: "https://example.com/terms",
    enableM365PublicEndpoint: true, dataFlowReviewed: true, workspacePolicyReviewed: true
  };
  await writeFile(path.join(f.project, ".azure", "agent-deployment-allowlist.json"), JSON.stringify({
    schemaVersion: "1.0.0", cloud: "AzureCloud", projectEndpoints: [endpoint],
    botResourceGroups: ["rg-reviewed"]
  }));
  await f.save();
  const calls = [];
  let remote = {
    target: f.request.target, cliVersion: "2.80.0", identitySha256: "c".repeat(64),
    configurationSha256: "d".repeat(64), resourceIds: [], version: "1", phase: "ready"
  };
  const platformProvider = {
    calls,
    remote: () => structuredClone(remote),
    setRemote: (value) => { remote = structuredClone(value); },
    async probe() { calls.push("probe"); return structuredClone(remote); },
    async execute(operation) {
      calls.push(operation);
      const publication = operation === "publish";
      const ids = publication ? ["title-test", "teams-test"] : [`${operation}-id`];
      remote = { ...remote, configurationSha256: digest(operation), resourceIds: [...new Set([...remote.resourceIds, ...ids])].sort() };
      return {
        status: publication ? publishScope === "Tenant" ? "pending-admin-approval" : "publication-submitted" : "provisioned",
        responseId: ids[0], resourceIds: ids, version: publication ? "1.0.0" : null,
        mutationAccepted: true, publicationVerified: false, evidenceSha256: digest(operation), messageCode: "OPERATION_ACCEPTED"
      };
    },
    async verify(receipt) { calls.push("verify"); return { ...receipt, mutationAccepted: false }; },
    async rollback() { throw new Error("Manual recovery required."); }
  };
  f.deps.providerFactory = async () => platformProvider;
  return { ...f, platformProvider };
}

test("request contract is strict, deterministic, and rejects unreviewed tool mappings", async (t) => {
  const f = await fixture(t);
  assert.deepEqual(validateRequest(f.request), f.request);
  assert.equal(stableJson({ b: 2, a: 1 }), stableJson({ a: 1, b: 2 }));
  for (const malformed of [
    { ...f.request, command: "arbitrary command" },
    { ...f.request, acceptPreview: "true" },
    { ...f.request, runtime: { ...f.request.runtime, tools: ["read"] } },
    { ...f.request, verification: { ...f.request.verification, maxOutputTokens: 99999 } }
  ]) assert.throws(() => validateRequest(malformed));
});

test("packages are deterministic and validate the whole blueprint", async (t) => {
  const f = await fixture(t);
  const a = await runDeployment("package", { project: f.project, request: "request.json" }, f.deps);
  const b = await runDeployment("package", { project: f.project, request: "request.json" }, f.deps);
  assert.equal(a.packageSha256, b.packageSha256);
  assert.equal(f.provider.calls.length, 0);
  const source = JSON.parse(await readFile(path.join(f.project, "agent.json")));
  source.risk = "read-only";
  source.capabilities = ["execute"];
  const bytes = JSON.stringify(source);
  await writeFile(path.join(f.project, "agent.json"), bytes);
  f.request.blueprint.sha256 = digest(bytes);
  await f.save();
  await assert.rejects(runDeployment("package", { project: f.project, request: "request.json" }, f.deps), /blueprint/i);
});

test("apply requires digest-bound approvals before any provider call", async (t) => {
  const f = await fixture(t);
  const plan = await f.plan();
  f.provider.calls.length = 0;
  await assert.rejects(runDeployment("apply", { project: f.project, plan: "reports/agent-deployment-plan.json" }, f.deps), /approval/i);
  await assert.rejects(runDeployment("apply", { ...f.approved(plan), approve: ["agent-version-create"] }, f.deps), /approval/i);
  await assert.rejects(runDeployment("apply", { ...f.approved(plan), planDigest: "0".repeat(64) }, f.deps), /digest/i);
  assert.deepEqual(f.provider.calls, []);
});

test("Foundry update pins, invokes once, journals and replays without mutation", async (t) => {
  const f = await fixture(t);
  const plan = await f.plan();
  assert.equal(plan.status, "review-required");
  const result = await runDeployment("apply", f.approved(plan), f.deps);
  assert.equal(result.status, "verified");
  assert.equal(result.activeVersion, "2");
  const state = await f.read("state");
  assert.equal(state.previousVersion, "1");
  assert.ok(state.journal.some((entry) => entry.operation === "create-version" && entry.status === "accepted"));
  const mutations = f.provider.calls.filter((call) => call !== "probe");
  const replay = await runDeployment("apply", f.approved(plan), f.deps);
  assert.equal(replay.status, "verified");
  assert.deepEqual(f.provider.calls.filter((call) => call !== "probe"), mutations);
  assert.equal(mutations.filter((call) => call === "invoke").length, 1);
  for (const name of ["plan", "state", "result"]) validateContract(name, await f.read(name));
});

test("rollback requires separate approval and repins the captured prior version", async (t) => {
  const f = await fixture(t);
  const plan = await f.plan();
  await runDeployment("apply", f.approved(plan), f.deps);
  await assert.rejects(runDeployment("rollback", f.approved(plan), f.deps), /approval/i);
  const rollback = await runDeployment("rollback", { ...f.approved(plan), approve: ["rollback-routing"] }, f.deps);
  assert.equal(rollback.status, "rolled-back");
  assert.equal(f.provider.remote().activeVersion, "1");
  assert.equal(f.provider.calls.filter((value) => value === "create-version").length, 1);
});

test("changed request bytes, package content, plans, and expired review fail closed", async (t) => {
  for (const kind of ["request", "package", "plan", "expiry"]) {
    const f = await fixture(t);
    const plan = await f.plan();
    if (kind === "request") await writeFile(path.join(f.project, "request.json"), `${JSON.stringify(f.request)} `);
    if (kind === "package") await writeFile(path.join(f.project, plan.packagePath, "instructions.txt"), "changed");
    if (kind === "plan") {
      plan.steps[0].operation = "invoke-arbitrary-url";
      await writeFile(path.join(f.project, "reports", "agent-deployment-plan.json"), JSON.stringify(plan));
    }
    if (kind === "expiry") f.deps.now = () => new Date(now.getTime() + 86_400_000);
    f.provider.calls.length = 0;
    await assert.rejects(runDeployment("apply", f.approved(plan), f.deps));
    assert.deepEqual(f.provider.calls, [], kind);
  }
});

test("remote drift blocks mutations and absent local evidence cannot verify", async (t) => {
  const f = await fixture(t);
  const initial = await runDeployment("status", { project: f.project }, f.deps);
  assert.equal(initial.status, "unverified");
  assert.equal(f.provider.calls.length, 0);
  const plan = await f.plan();
  await assert.rejects(runDeployment("verify", f.approved(plan), f.deps), /evidence/i);
  const remote = f.provider.remote();
  remote.activeVersion = "99";
  f.provider.setRemote(remote);
  await assert.rejects(runDeployment("apply", f.approved(plan), f.deps), /drift/i);
  assert.ok(f.provider.calls.every((call) => call === "probe"));
});

test("a provider failure persists partial state without leaking credentials or replaying creation", async (t) => {
  const f = await fixture(t);
  const plan = await f.plan();
  f.provider.pinVersion = async () => { throw new Error("Bearer secret-provider-credential-which-must-not-appear"); };
  const result = await runDeployment("apply", f.approved(plan), f.deps);
  assert.equal(result.status, "partial");
  assert.equal((await f.read("state")).createdVersion, "2");
  assert.doesNotMatch(JSON.stringify(result), /secret-provider|Bearer/);
  assert.doesNotMatch(await readFile(path.join(f.project, "reports", "agent-deployment-state.json"), "utf8"), /secret-provider|Bearer/);
  await assert.rejects(runDeployment("apply", f.approved(plan), f.deps), /partial|reconcile/i);
  assert.equal(f.provider.calls.filter((call) => call === "create-version").length, 1);
});

test("Government, unaccepted previews and external residency conflicts do not reach providers", async (t) => {
  for (const kind of ["gov", "preview", "residency", "local-data"]) {
    const f = await fixture(t);
    if (kind === "gov") f.request.cloud = "AzureUSGovernment";
    if (kind === "preview") f.request.acceptPreview = false;
    if (kind === "residency") f.request.data.residency = ["westus"];
    if (kind === "local-data") f.request.data.boundary = "project-local";
    await f.save();
    const plan = await f.plan();
    assert.equal(plan.status, "unavailable");
    await assert.rejects(runDeployment("apply", f.approved(plan), f.deps));
    assert.deepEqual(f.provider.calls, []);
  }
});

test("manual control planes cannot execute and import is not publication", async (t) => {
  const capabilities = getCapabilities();
  validateContract("capabilities", capabilities);
  for (const target of ["copilot-studio", "microsoft-365-agents-toolkit", "microsoft-365-copilot-and-teams"]) {
    const f = await fixture(t, target);
    const plan = await f.plan();
    assert.equal(plan.status, "manual-handoff");
    assert.equal(plan.steps.filter((step) => step.executable).length, 0);
    await assert.rejects(runDeployment("apply", f.approved(plan), f.deps), /manual/i);
    assert.deepEqual(f.provider.calls, []);
  }
  const studio = capabilities.providers.find((item) => item.target === "copilot-studio");
  assert.ok(studio.manualSteps.some((step) => /import/i.test(step)));
  assert.ok(studio.manualSteps.some((step) => /publish/i.test(step)));
  assert.match(studio.limitations.join(" "), /import.*(?:not|never).*publi/i);
});

test("relative-path escapes, symlinks, and launch-pad writes are rejected", async (t) => {
  const f = await fixture(t);
  for (const pathname of ["../outside.json", "C:\\outside.json", "agent.json:stream", "nested/../../agent.json", "CON", "nested/NUL.json", "nested//agent.json", "nested./agent.json"]) {
    f.request.blueprint.path = pathname;
    await f.save();
    await assert.rejects(runDeployment("package", { project: f.project, request: "request.json" }, f.deps));
  }
  await assert.rejects(runDeployment("status", { project: root }), /launch.pad/i);
  const alias = path.join(f.project, "alias");
  try {
    await symlink(path.join(f.project, ".azure"), alias, process.platform === "win32" ? "junction" : "dir");
    f.request.blueprint.path = "alias/environment.json";
    await f.save();
    await assert.rejects(runDeployment("package", { project: f.project, request: "request.json" }, f.deps), /symlink|symbolic/i);
  } catch (error) {
    if (!["EPERM", "EACCES", "ENOTSUP"].includes(error.code)) throw error;
    t.diagnostic("Platform does not permit creating the symlink fixture.");
  }
});

test("raw credentials are rejected without echoing them, including CLI errors", async (t) => {
  const f = await fixture(t);
  f.request.verification.prompt = "api_key=some-private-credential-value-123456";
  await f.save();
  await assert.rejects(runDeployment("package", { project: f.project, request: "request.json" }, f.deps), (error) => {
    assert.doesNotMatch(error.message, /some-private/);
    return /credential|secret/i.test(error.message);
  });
  const command = spawnSync(process.execPath, [script, "apply", "--token", "some-private-credential"], { encoding: "utf8" });
  assert.notEqual(command.status, 0);
  assert.doesNotMatch(command.stdout + command.stderr, /some-private/);
});

test("trusted Foundry HTTP transport uses reviewed routes, Entra, no redirects and no provider error body", async (t) => {
  const f = await fixture(t);
  const requests = [];
  const azCalls = [];
  const fakeAz = async (args) => {
    azCalls.push(args);
    if (args[0] === "version") return { "azure-cli": "2.80.0" };
    if (args[0] === "cloud") return { name: "AzureCloud" };
    if (args[1] === "show") return { id: f.profile.subscription.subscriptionId, tenantId: f.profile.subscription.tenantId, environmentName: "AzureCloud", state: "Enabled" };
    return { accessToken: "in-memory-test-credential", expires_on: "9999999999", subscription: f.profile.subscription.subscriptionId, tenant: f.profile.subscription.tenantId };
  };
  const remote = {
    object: "agent", id: "agent-review-helper", name: "review-helper", state: "enabled",
    instance_identity: { principal_id: "11111111-1111-4111-8111-111111111111", client_id: "44444444-4444-4444-8444-444444444444", status: "active" },
    agent_endpoint: { version_selector: { version_selection_rules: [{ type: "FixedRatio", agent_version: "1", traffic_percentage: 100 }] },
      protocol_configuration: { responses: {} }, authorization_schemes: [{ type: "Entra" }] }
  };
  const fetch = async (url, options) => {
    requests.push({ url: String(url), ...options });
    if (String(url).includes("/versions?")) return new Response(JSON.stringify({ object: "list", data: [{ id: "review-helper:1", name: "review-helper", version: "1", definition: { kind: "prompt", model: "review-model", instructions: "prior", tools: [] } }], has_more: false }));
    if (String(url).includes("/agents?")) return new Response(JSON.stringify({ object: "list", data: [] }));
    return new Response(JSON.stringify(remote));
  };
  const provider = await createFoundryProvider({ request: f.request, blueprint: blueprint(), profile: f.profile }, { runAzureCli: fakeAz, fetch });
  const snapshot = await provider.probe();
  assert.equal(snapshot.activeVersion, "1");
  assert.ok(azCalls.every((args) => !args.includes("login") && !args.includes("set")));
  assert.ok(requests.every((request) => request.redirect === "error" && request.headers.Authorization === "Bearer in-memory-test-credential"));
  const evil = { ...f.request, foundry: { ...f.request.foundry, projectEndpoint: "https://example.services.ai.azure.com.evil.invalid/api/projects/test" } };
  await assert.rejects(createFoundryProvider({ request: evil, blueprint: blueprint(), profile: f.profile }, { runAzureCli: fakeAz, fetch }), /endpoint/i);
  const broken = await createFoundryProvider({ request: f.request, blueprint: blueprint(), profile: f.profile }, { runAzureCli: fakeAz, fetch: async () => new Response("Bearer in-memory-test-credential", { status: 403 }) });
  await assert.rejects(broken.probe(), (error) => !error.message.includes("in-memory-test-credential") && /403|denied/i.test(error.message));
});

test("OpenAI packages export an own-client module, not a GPT or Store publisher", async (t) => {
  const f = await fixture(t, "openai-api-application");
  f.request.openai = { model: "review-model" };
  await f.save();
  const result = await runDeployment("package", { project: f.project, request: "request.json" }, f.deps);
  const files = await readdir(path.join(f.project, result.packagePath));
  assert.ok(files.includes("application.mjs"));
  const source = await readFile(path.join(f.project, result.packagePath, "application.mjs"), "utf8");
  assert.match(source, /api\.openai\.com\/v1\/responses/);
  assert.doesNotMatch(source, /chatgpt\.com|gpt-store/i);
  const plan = await f.plan();
  assert.equal(plan.status, "manual-handoff");
});

test("initial creation has separately approved configuration and no destructive rollback", async (t) => {
  const f = await fixture(t);
  f.request.mode = "create";
  f.request.rollback = { strategy: "manual", version: null };
  await f.save();
  f.provider.setRemote({
    exists: false, agentId: null, identityId: null, selector: "none", activeVersion: null,
    protocols: [], authorization: [], endpointSha256: null, endpointPolicySha256: null, agentPropertiesSha256: null, hostedSource: null,
    versions: [], apiVersion: "v1", cliVersion: "2.80.0"
  });
  const plan = await f.plan();
  assert.equal(plan.status, "review-required");
  assert.ok(plan.requiredApprovals.includes("endpoint-configuration"));
  assert.match(plan.steps.find((step) => step.operation === "create-version").description, /live/i);
  assert.equal(plan.rollback.strategy, "manual");
  const missing = f.approved(plan);
  missing.approve = missing.approve.filter((value) => value !== "endpoint-configuration");
  f.provider.calls.length = 0;
  await assert.rejects(runDeployment("apply", missing, f.deps), /approval/i);
  assert.deepEqual(f.provider.calls, []);
  const result = await runDeployment("apply", f.approved(plan), f.deps);
  assert.equal(result.status, "verified");
  assert.ok(f.provider.calls.includes("configure-endpoint"));
  assert.equal(result.previousVersion, null);
  await assert.rejects(runDeployment("rollback", { ...f.approved(plan), approve: ["rollback-routing"] }, f.deps), /rollback|evidence/i);
});

test("promotion reuses an exact immutable definition without creating another version", async (t) => {
  const f = await fixture(t);
  f.request.mode = "promote";
  f.request.foundry.promoteVersion = "2";
  await f.save();
  const packaged = await runDeployment("package", { project: f.project, request: "request.json" }, f.deps);
  const definition = JSON.parse(await readFile(path.join(f.project, packaged.packagePath, "definition.json")));
  const remote = f.provider.remote();
  remote.versions.push({ id: "review-helper:2", version: "2", kind: "prompt", status: "active", draft: false, definitionSha256: digest(definition), packageSha256: null, release: "older-release" });
  f.provider.setRemote(remote);
  const plan = await f.plan();
  assert.deepEqual(plan.requiredApprovals, ["endpoint-routing", "endpoint-invocation"]);
  const result = await runDeployment("apply", { ...f.approved(plan), approve: plan.requiredApprovals }, f.deps);
  assert.equal(result.status, "verified");
  assert.equal(result.activeVersion, "2");
  assert.equal(f.provider.calls.filter((call) => call === "create-version").length, 0);
  const rollback = await runDeployment("rollback", { ...f.approved(plan), approve: ["rollback-routing"] }, f.deps);
  assert.equal(rollback.status, "rolled-back");
});

test("capability probe failure or an absent update target never produces a ready plan", async (t) => {
  const f = await fixture(t);
  f.provider.probe = async () => { throw new Error("Provider body includes an untrusted private credential."); };
  const plan = await f.plan();
  assert.equal(plan.status, "unavailable");
  assert.doesNotMatch(plan.reason, /private credential/);
  f.provider.probe = async () => ({
    exists: false, agentId: null, identityId: null, selector: "none", activeVersion: null,
    protocols: [], authorization: [], endpointSha256: null, endpointPolicySha256: null, agentPropertiesSha256: null, hostedSource: null,
    versions: [], apiVersion: "v1", cliVersion: "2.80.0"
  });
  const absent = await f.plan();
  assert.equal(absent.status, "unavailable");
  assert.match(absent.reason, /does not exist/i);
});

test("missing allowlist membership and changed profile prevent provider access", async (t) => {
  const f = await fixture(t);
  const allowlist = path.join(f.project, ".azure", "agent-deployment-allowlist.json");
  const original = await readFile(allowlist);
  await writeFile(allowlist, JSON.stringify({ schemaVersion: "1.0.0", cloud: "AzureCloud", projectEndpoints: ["https://other.services.ai.azure.com/api/projects/test-project"] }));
  const denied = await f.plan();
  assert.equal(denied.status, "unavailable");
  assert.deepEqual(f.provider.calls, []);
  await writeFile(allowlist, original);
  const plan = await f.plan();
  f.provider.calls.length = 0;
  await writeFile(path.join(f.project, ".azure", "environment.json"), `${JSON.stringify(f.profile)} `);
  await assert.rejects(runDeployment("apply", f.approved(plan), f.deps), /profile|changed/i);
  assert.deepEqual(f.provider.calls, []);
});

test("raw endpoint configuration drift is checked, not just protocol names", async (t) => {
  const f = await fixture(t);
  const plan = await f.plan();
  const remote = f.provider.remote();
  remote.endpointSha256 = "c".repeat(64);
  f.provider.setRemote(remote);
  await assert.rejects(runDeployment("apply", f.approved(plan), f.deps), /drift/i);
  assert.ok(f.provider.calls.every((call) => call === "probe"));
});

test("a failed verification stays partial and requires explicit reinvocation approval", async (t) => {
  const f = await fixture(t);
  const plan = await f.plan();
  f.provider.invoke = async () => {
    f.provider.calls.push("invoke");
    return { id: "resp-incomplete", status: "incomplete", outputText: "HEALTHY" };
  };
  const failed = await runDeployment("apply", f.approved(plan), f.deps);
  assert.equal(failed.status, "partial");
  assert.equal((await f.read("state")).verification.status, "failed");
  await assert.rejects(runDeployment("verify", { ...f.approved(plan), approve: [] }, f.deps), /approval/i);
  f.provider.invoke = async () => ({ id: "resp-retry", status: "completed", outputText: "HEALTHY" });
  const verified = await runDeployment("verify", { ...f.approved(plan), approve: ["endpoint-invocation"] }, f.deps);
  assert.equal(verified.status, "verified");
  assert.equal(f.provider.calls.filter((call) => call === "create-version").length, 1);
});

test("journal divergence and altered prior-version state block all replay", async (t) => {
  const f = await fixture(t);
  const plan = await f.plan();
  await runDeployment("apply", f.approved(plan), f.deps);
  const state = await f.read("state");
  const run = path.join(f.project, "reports", "agent-deployment", plan.agentId, "runs", plan.planId);
  const journal = await readFile(path.join(run, "journal.jsonl"));
  await writeFile(path.join(run, "journal.jsonl"), `${journal}{}\n`);
  f.provider.calls.length = 0;
  await assert.rejects(runDeployment("apply", f.approved(plan), f.deps), /journal|diverged/i);
  assert.deepEqual(f.provider.calls, []);
  await writeFile(path.join(run, "journal.jsonl"), journal);
  state.previousVersion = "99";
  await writeFile(path.join(run, "state.json"), JSON.stringify(state));
  await assert.rejects(runDeployment("rollback", { ...f.approved(plan), approve: ["rollback-routing"] }, f.deps), /state|review/i);
  assert.deepEqual(f.provider.calls, []);
});

function actionDocument() {
  return {
    openapi: "3.1.0", info: { title: "Reviewed action", version: "1.0.0" },
    servers: [{ url: "https://api.example.com" }],
    paths: { "/info": { get: { operationId: "getInfo", responses: { "200": { description: "Reviewed information" } } } } }
  };
}

test("ChatGPT Action export validates policy and remains an unexecutable manual handoff", async (t) => {
  const f = await fixture(t, "chatgpt-action-handoff");
  const bytes = JSON.stringify(actionDocument());
  await writeFile(path.join(f.project, "openapi.json"), bytes);
  f.request.chatgpt = {
    openApi: { path: "openapi.json", sha256: digest(bytes) }, allowedHosts: ["api.example.com"],
    authentication: "none", workspacePolicyReviewed: true, dataFlowReviewed: true
  };
  await f.save();
  const plan = await f.plan();
  assert.equal(plan.status, "manual-handoff");
  assert.ok((await readdir(path.join(f.project, plan.packagePath))).includes("openapi.json"));
  await assert.rejects(runDeployment("apply", f.approved(plan), f.deps), /manual/i);
  assert.deepEqual(f.provider.calls, []);
  f.request.audience = "gpt-store";
  await f.save();
  await assert.rejects(runDeployment("package", { project: f.project, request: "request.json" }, f.deps), /contract/i);
});

test("unsafe action domains, external references, auth overrides and unconfirmed mutation are rejected", () => {
  const policy = { allowedHosts: ["api.example.com"], authentication: "none" };
  assert.equal(validateOpenApi(actionDocument(), policy).openapi, "3.1.0");
  for (const url of ["http://api.example.com", "https://api.example.com.evil.com", "https://user:pass@api.example.com", "https://127.0.0.1", "https://api.example.com:444", "https://api.example.com/path?token=secret"]) {
    const document = actionDocument();
    document.servers[0].url = url;
    assert.throws(() => validateOpenApi(document, policy));
  }
  const reference = actionDocument();
  reference.components = { schemas: { Remote: { $ref: "https://evil.example/schema.json" } } };
  assert.throws(() => validateOpenApi(reference, policy), /reference/i);
  const mutation = actionDocument();
  mutation.paths["/info"].post = { operationId: "createInfo", responses: { "200": { description: "Created" } } };
  assert.throws(() => validateOpenApi(mutation, policy), /consequential/i);
  mutation.paths["/info"].post["x-openai-isConsequential"] = true;
  validateOpenApi(mutation, policy);
  const overridden = actionDocument();
  overridden.paths["/info"].get.security = [{ undeclared: [] }];
  assert.throws(() => validateOpenApi(overridden, policy), /authentication/i);
});

test("action policy rejects referenced path items and operations without rejecting schema references", () => {
  const policy = { allowedHosts: ["api.example.com"], authentication: "none" };
  for (const operation of [
    { post: { operationId: "unsafeMutation", "x-openai-isConsequential": false, responses: { "200": { description: "Changed" } } } },
    { get: { operationId: "unsafeAuth", security: [{ hidden: [] }], responses: { "200": { description: "Read" } } } }
  ]) {
    const document = actionDocument();
    document.components = { pathItems: { hidden: operation } };
    document.paths["/hidden"] = { $ref: "#/components/pathItems/hidden" };
    assert.throws(() => validateOpenApi(document, policy), /reference/i);
  }
  const indirect = actionDocument();
  indirect.components = { schemas: { operation: {
    operationId: "indirect", security: [{ hidden: [] }], responses: { "200": { description: "Read" } }
  } } };
  indirect.paths["/info"].get.$ref = "#/components/schemas/operation";
  assert.throws(() => validateOpenApi(indirect, policy), /reference/i);

  const ordinary = actionDocument();
  ordinary.components = { schemas: { Info: { type: "object", properties: { title: { type: "string" } } } } };
  ordinary.paths["/info"].get.responses["200"].content = {
    "application/json": { schema: { $ref: "#/components/schemas/Info" } }
  };
  assert.equal(validateOpenApi(ordinary, policy), ordinary);
});

test("OAuth handoff schemes must be inline rather than reference-overridden", () => {
  const document = actionDocument();
  document.components = {
    schemas: { WeakAuth: { type: "apiKey", in: "header", name: "X-Unauthenticated" } },
    securitySchemes: {
      auth: {
        type: "oauth2", $ref: "#/components/schemas/WeakAuth",
        flows: { authorizationCode: {
          authorizationUrl: "https://api.example.com/authorize",
          tokenUrl: "https://api.example.com/token",
          scopes: { "info:read": "Read information" }
        } }
      }
    }
  };
  document.security = [{ auth: ["info:read"] }];
  const policy = { allowedHosts: ["api.example.com"], authentication: "oauth" };
  assert.throws(() => validateOpenApi(document, policy), /reference/i);
  delete document.components.securitySchemes.auth.$ref;
  assert.equal(validateOpenApi(document, policy), document);
});

test("Foundry transport never sends credentials after account mismatch or to a redirect", async (t) => {
  const f = await fixture(t);
  let networkCalls = 0;
  const fetch = async () => { networkCalls++; return new Response(null, { status: 302, headers: { location: "https://other.invalid" } }); };
  const cli = async (args) => {
    if (args[0] === "version") return { "azure-cli": "2.80.0" };
    if (args[0] === "cloud") return { name: "AzureCloud" };
    if (args[1] === "show") return { id: f.profile.subscription.subscriptionId, tenantId: "wrong", environmentName: "AzureCloud", state: "Enabled" };
    throw new Error("Token acquisition must not happen on mismatch.");
  };
  await assert.rejects(createFoundryProvider({ request: f.request, blueprint: blueprint(), profile: f.profile }, { runAzureCli: cli, fetch }), /match/i);
  assert.equal(networkCalls, 0);
  const correctCli = async (args) => {
    if (args[0] === "version") return { "azure-cli": "2.80.0" };
    if (args[0] === "cloud") return { name: "AzureCloud" };
    if (args[1] === "show") return { id: f.profile.subscription.subscriptionId, tenantId: f.profile.subscription.tenantId, environmentName: "AzureCloud", state: "Enabled" };
    return { accessToken: "transient-token", subscription: f.profile.subscription.subscriptionId, tenant: f.profile.subscription.tenantId, expires_on: "9999999999" };
  };
  const provider = await createFoundryProvider({ request: f.request, blueprint: blueprint(), profile: f.profile }, { runAzureCli: correctCli, fetch });
  await assert.rejects(provider.probe(), /302/);
  assert.equal(networkCalls, 1, "redirect destination must never receive a follow-up request");
});

test("Foundry mutation wire bodies are fixed v1 definitions, separate endpoint patches, and bounded invocation", async (t) => {
  const f = await fixture(t);
  const wire = [];
  const definition = { kind: "prompt", model: "review-model", instructions: "Reviewed prompt.", tools: [] };
  const cli = async (args) => {
    if (args[0] === "version") return { "azure-cli": "2.80.0" };
    if (args[0] === "cloud") return { name: "AzureCloud" };
    if (args[1] === "show") return { id: f.profile.subscription.subscriptionId, tenantId: f.profile.subscription.tenantId, environmentName: "AzureCloud", state: "Enabled" };
    return { accessToken: "transient-token", expires_on: "9999999999", subscription: f.profile.subscription.subscriptionId, tenant: f.profile.subscription.tenantId };
  };
  const fetch = async (url, options) => {
    wire.push({ url, method: options.method, headers: options.headers, body: JSON.parse(options.body) });
    if (String(url).includes("/versions?")) return Response.json({ id: "review-helper:2", name: "review-helper", version: "2", definition });
    if (String(url).includes("/endpoint/")) return Response.json({ id: "resp-wire", status: "completed", output: [{ type: "message", content: [{ type: "output_text", text: "HEALTHY" }] }] });
    return Response.json({ object: "agent", name: "review-helper" });
  };
  const provider = await createFoundryProvider({ request: f.request, blueprint: blueprint(), profile: f.profile }, { runAzureCli: cli, fetch });
  const created = await provider.createVersion(definition, { pso_package: "a".repeat(64), pso_release: "release-1" });
  assert.equal(created.version, "2");
  await provider.configureEndpoint();
  await provider.pinVersion("2");
  assert.equal((await provider.invoke(f.request.verification)).outputText, "HEALTHY");
  assert.match(wire[0].url, /\/agents\/review-helper\/versions\?api-version=v1$/);
  assert.deepEqual(wire[0].body.definition, definition);
  assert.deepEqual(wire[1].body.agent_endpoint.authorization_schemes, [{ type: "Entra" }]);
  assert.equal(wire[1].headers["Content-Type"], "application/merge-patch+json");
  assert.deepEqual(wire[2].body.agent_endpoint.version_selector.version_selection_rules, [{ type: "FixedRatio", agent_version: "2", traffic_percentage: 100 }]);
  assert.equal(wire[3].body.max_output_tokens, 32);
  assert.deepEqual(wire[3].body.input, [{ role: "user", content: f.request.verification.prompt }]);
  assert.equal(wire[3].body.store, false);
  assert.equal(wire[3].body.stream, false);
  assert.match(wire[3].url, /\/endpoint\/protocols\/openai\/responses\?api-version=v1$/);
});

test("registry and help run locally through the public CLI with no project mutation", () => {
  const capability = spawnSync(process.execPath, [script, "capabilities", "--json"], { encoding: "utf8" });
  assert.equal(capability.status, 0, capability.stderr);
  validateContract("capabilities", JSON.parse(capability.stdout));
  const help = spawnSync(process.execPath, [script, "--help"], { encoding: "utf8" });
  assert.equal(help.status, 0, help.stderr);
  assert.match(help.stdout, /plan-digest/);
  assert.match(help.stdout, /rollback-routing/);
  const unknown = spawnSync(process.execPath, [script, "apply", "--exec", "private-untrusted-command"], { encoding: "utf8" });
  assert.equal(unknown.status, 1);
  assert.doesNotMatch(unknown.stderr, /private-untrusted-command/);
});

test("an installed target-project skill can package without mistaking its own root for the launch pad", async (t) => {
  const f = await fixture(t);
  const installed = path.join(f.project, ".github", "skills", "agent-deployment", "scripts");
  await cp(path.join(skill, "scripts"), installed, { recursive: true });
  const builder = path.join(f.project, ".github", "skills", "agent-builder", "scripts");
  await mkdir(builder, { recursive: true });
  await copyFile(path.join(root, ".github", "skills", "agent-builder", "scripts", "agent-builder.mjs"), path.join(builder, "agent-builder.mjs"));
  await mkdir(path.join(f.project, "schemas"));
  for (const name of ["agent-deployment-request", "agent-deployment-plan", "agent-deployment-state", "agent-deployment-result", "agent-provider-capabilities"]) {
    await copyFile(path.join(root, "schemas", `${name}.schema.json`), path.join(f.project, "schemas", `${name}.schema.json`));
  }
  const invocation = spawnSync(process.execPath, [path.join(installed, "agent-deployment.mjs"), "package",
    "--project", f.project, "--request", "request.json", "--json"], { encoding: "utf8" });
  assert.equal(invocation.status, 0, invocation.stderr);
  assert.equal(JSON.parse(invocation.stdout).status, "packaged");
  const engine = await import(pathToFileURL(path.join(installed, "agent-deployment.mjs")));
  const plan = await engine.runDeployment("plan", { project: f.project, request: "request.json" }, f.deps);
  assert.equal(plan.status, "review-required");
  const adapter = path.join(installed, "providers", "foundry.mjs");
  await writeFile(adapter, `${await readFile(adapter, "utf8")}\n`);
  f.provider.calls.length = 0;
  await assert.rejects(engine.runDeployment("apply", f.approved(plan), f.deps), /runtime|schemas/i);
  assert.deepEqual(f.provider.calls, []);
});

test("concurrent identity or prior-version changes after creation halt before pinning", async (t) => {
  for (const change of ["identity", "prior-version", "endpoint-policy"]) {
    const f = await fixture(t);
    const plan = await f.plan();
    const create = f.provider.createVersion;
    f.provider.createVersion = async (...args) => {
      const response = await create(...args);
      const remote = f.provider.remote();
      if (change === "identity") remote.identityId = "99999999-9999-4999-8999-999999999999";
      if (change === "prior-version") remote.versions[0].definitionSha256 = "f".repeat(64);
      if (change === "endpoint-policy") remote.endpointSha256 = "c".repeat(64);
      f.provider.setRemote(remote);
      return response;
    };
    const result = await runDeployment("apply", f.approved(plan), f.deps);
    assert.equal(result.status, "partial", change);
    assert.equal(result.code, "REMOTE_DRIFT", change);
    assert.equal(f.provider.calls.some((value) => value.startsWith("pin:") || value === "invoke"), false, change);
    const state = await f.read("state");
    assert.ok(state.journal.some((entry) => entry.operation === "create-version" && entry.status === "accepted" && entry.responseId === "review-helper:2"));
  }
});

test("status probes remain read-only and distinguish verified evidence from drift", async (t) => {
  const f = await fixture(t);
  const plan = await f.plan();
  await runDeployment("apply", f.approved(plan), f.deps);
  f.provider.calls.length = 0;
  const status = await runDeployment("status", { project: f.project }, f.deps);
  assert.equal(status.status, "verified");
  assert.ok(f.provider.calls.every((value) => value === "probe"));
  const remote = f.provider.remote();
  remote.agentPropertiesSha256 = "9".repeat(64);
  f.provider.setRemote(remote);
  const drifted = await runDeployment("status", { project: f.project }, f.deps);
  assert.equal(drifted.status, "drifted");
  assert.equal(drifted.verifiedAt, null);
});

test("provider factory is not constructed without apply approval", async (t) => {
  const f = await fixture(t);
  await f.plan();
  let constructed = 0;
  f.deps.providerFactory = async () => { constructed++; return f.provider; };
  await assert.rejects(runDeployment("apply", { project: f.project, plan: "reports/agent-deployment-plan.json" }, f.deps), /approval/i);
  assert.equal(constructed, 0);
});

test("Windows Azure CLI bridge runs a resolved fake cmd launcher with only fixed argument vectors", async (t) => {
  if (process.platform !== "win32") return t.skip("Windows-specific .cmd launcher integration.");
  const f = await fixture(t);
  const directory = path.join(f.project, "Fake Azure CLI");
  await mkdir(directory);
  const program = path.join(directory, "fake-cli.mjs");
  await writeFile(program, "console.log(JSON.stringify({ arguments: process.argv.slice(2) }));\n");
  await writeFile(path.join(directory, "az.cmd"), `@echo off\r\n"${process.execPath}" "${program}" %*\r\n`);
  const env = Object.fromEntries(Object.entries(process.env).filter(([key]) => key.toUpperCase() !== "PATH"));
  env.PATH = directory;
  for (const args of [
    ["version", "--output", "json"],
    ["cloud", "show", "--output", "json"],
    ["account", "show", "--output", "json", "--only-show-errors"],
    ["account", "get-access-token", "--resource", "https://ai.azure.com", "--output", "json", "--only-show-errors"]
  ]) {
    const invocation = buildAzureCliInvocation(args, { env });
    assert.match(invocation.command, /powershell\.exe$/i);
    assert.ok(invocation.args.includes("-File"));
    assert.ok(!invocation.args.includes("-Command"));
    assert.ok(!invocation.args.includes("-EncodedCommand"));
    assert.deepEqual(runAzureCli(args, { env }).arguments, args);
  }
});

test("Windows Azure CLI launcher rejects injection and unsafe executable paths before spawn", async (t) => {
  const f = await fixture(t);
  let called = false;
  const dependencies = { spawn: () => { called = true; throw new Error("Must not spawn."); } };
  for (const args of [
    ["account", "set", "--subscription", "untrusted"],
    ["login"],
    ["account", "get-access-token", "--resource", "https://evil.example;whoami", "--output", "json", "--only-show-errors"],
    ["version", "--output", "json", "&", "untrusted"],
    ["version", "--output", { toString: () => "json" }]
  ]) assert.throws(() => runAzureCli(args, dependencies), /allowlisted|operation/i);
  assert.equal(called, false);
  if (process.platform !== "win32") return;
  const unsafe = path.join(f.project, "CLI & untrusted");
  await mkdir(unsafe);
  await writeFile(path.join(unsafe, "az.cmd"), "@echo off\r\necho should-not-run\r\n");
  const env = Object.fromEntries(Object.entries(process.env).filter(([key]) => key.toUpperCase() !== "PATH"));
  env.PATH = unsafe;
  assert.throws(() => runAzureCli(["version", "--output", "json"], { ...dependencies, env }), /launcher|path/i);
  assert.equal(called, false);
});

test("latest selectors are rejected before creation and never offered as pinned rollback evidence", async (t) => {
  const f = await fixture(t);
  const remote = f.provider.remote();
  remote.selector = "latest";
  f.provider.setRemote(remote);
  const plan = await f.plan();
  assert.equal(plan.status, "unavailable");
  assert.match(plan.reason, /pinned/i);
  assert.deepEqual(plan.steps, []);
  assert.equal(plan.rollback.previousVersion, null);
  assert.equal(plan.rollback.strategy, "manual");
  f.provider.calls.length = 0;
  await assert.rejects(runDeployment("apply", f.approved(plan), f.deps), /unavailable/i);
  assert.deepEqual(f.provider.calls, []);
});

test("ambiguous creation failure preserves started journal and blocks duplicate creation", async (t) => {
  const f = await fixture(t);
  const plan = await f.plan();
  const create = f.provider.createVersion;
  f.provider.createVersion = async (...args) => {
    await create(...args);
    throw new Error("Network response lost after the provider accepted creation.");
  };
  const result = await runDeployment("apply", f.approved(plan), f.deps);
  assert.equal(result.status, "partial");
  assert.equal(f.provider.remote().versions.length, 2);
  const state = await f.read("state");
  assert.equal(state.createdVersion, null, "a lost response cannot become an invented accepted version ID");
  assert.equal(state.observedRemoteSha256, null);
  const journal = await readFile(path.join(f.project, "reports", "agent-deployment", plan.agentId, "runs", plan.planId, "journal.jsonl"), "utf8");
  const entries = journal.trim().split("\n").map((line) => JSON.parse(line));
  assert.ok(entries.some((entry) => entry.operation === "create-version" && entry.status === "started"));
  assert.ok(entries.some((entry) => entry.operation === "create-version" && entry.status === "failed"));
  assert.equal(entries.some((entry) => entry.operation === "create-version" && entry.status === "accepted"), false);
  await assert.rejects(runDeployment("apply", f.approved(plan), f.deps), /partial|interrupted/i);
  assert.equal(f.provider.calls.filter((call) => call === "create-version").length, 1);
});

test("rollback refuses unrelated authorization drift instead of restoring a selector blindly", async (t) => {
  const f = await fixture(t);
  const plan = await f.plan();
  await runDeployment("apply", f.approved(plan), f.deps);
  const remote = f.provider.remote();
  remote.endpointPolicySha256 = "c".repeat(64);
  f.provider.setRemote(remote);
  f.provider.calls.length = 0;
  await assert.rejects(runDeployment("rollback", { ...f.approved(plan), approve: ["rollback-routing"] }, f.deps), /drift/i);
  assert.ok(f.provider.calls.every((call) => call === "probe"));
  assert.equal(f.provider.remote().activeVersion, "2");
});

test("only explicit agent 404 after a successful collection probe is a missing resource", async (t) => {
  const f = await fixture(t);
  const cli = async (args) => {
    if (args[0] === "version") return { "azure-cli": "2.80.0" };
    if (args[0] === "cloud") return { name: "AzureCloud" };
    if (args[1] === "show") return { id: f.profile.subscription.subscriptionId, tenantId: f.profile.subscription.tenantId, environmentName: "AzureCloud", state: "Enabled" };
    return { accessToken: "transient-token", expires_on: "9999999999", subscription: f.profile.subscription.subscriptionId, tenant: f.profile.subscription.tenantId };
  };
  for (const outcome of [401, 403, 429, 500, 503, "network", 404]) {
    const provider = await createFoundryProvider({ request: f.request, blueprint: blueprint(), profile: f.profile }, {
      runAzureCli: cli,
      fetch: async (url) => {
        if (String(url).includes("/agents?")) return Response.json({ data: [] });
        if (outcome === "network") throw new Error("Network unavailable.");
        return new Response("Redacted provider error body.", { status: outcome });
      }
    });
    if (outcome === 404) {
      const remote = await provider.probe();
      assert.equal(remote.exists, false);
      assert.equal(remote.activeVersion, null);
    } else await assert.rejects(provider.probe(), /rejected|denied|failed|timed out/i);
  }
  const collectionMissing = await createFoundryProvider({ request: f.request, blueprint: blueprint(), profile: f.profile }, {
    runAzureCli: cli, fetch: async () => new Response(null, { status: 404 })
  });
  await assert.rejects(collectionMissing.probe(), /404/);
  f.deps.providerFactory = (context) => createFoundryProvider(context, {
    runAzureCli: async () => { throw new Error("Private CLI failure details."); },
    fetch: async () => { assert.fail("CLI failure must prevent provider traffic."); }
  });
  const denied = await f.plan();
  assert.equal(denied.status, "unavailable");
  assert.equal(denied.remote, null);
  assert.doesNotMatch(denied.reason, /Private CLI failure/);
});

test("Foundry lifecycle probe preserves draft/status and uses the documented prompt-only status default", async (t) => {
  const f = await fixture(t);
  const cli = async (args) => {
    if (args[0] === "version") return { "azure-cli": "2.80.0" };
    if (args[0] === "cloud") return { name: "AzureCloud" };
    if (args[1] === "show") return { id: f.profile.subscription.subscriptionId, tenantId: f.profile.subscription.tenantId, environmentName: "AzureCloud", state: "Enabled" };
    return { accessToken: "transient-token", expires_on: "9999999999", subscription: f.profile.subscription.subscriptionId, tenant: f.profile.subscription.tenantId };
  };
  for (const lifecycle of [{ status: "creating", draft: false }, {}, { status: "active", draft: true }]) {
    const provider = await createFoundryProvider({ request: f.request, blueprint: blueprint(), profile: f.profile }, {
      runAzureCli: cli,
      fetch: async (url) => {
        if (String(url).includes("/agents?")) return Response.json({ data: [] });
        if (String(url).includes("/versions?")) return Response.json({
          has_more: false, data: [{
            id: "review-helper:1", name: "review-helper", version: "1", ...lifecycle,
            definition: { kind: "prompt", model: "review-model", instructions: "prior", tools: [] }
          }]
        });
        return Response.json({
          object: "agent", id: "agent-review-helper", name: "review-helper", state: "enabled",
          instance_identity: { principal_id: "11111111-1111-4111-8111-111111111111", status: "active" },
          agent_endpoint: {
            version_selector: { version_selection_rules: [{ type: "FixedRatio", agent_version: "1", traffic_percentage: 100 }] },
            protocol_configuration: { responses: {} }, authorization_schemes: [{ type: "Entra" }]
          }
        });
      }
    });
    const version = (await provider.probe()).versions[0];
    assert.equal(version.kind, "prompt");
    assert.equal(version.status, lifecycle.status ?? "active");
    assert.equal(version.draft, lifecycle.draft ?? false);
  }
});

test("rollback prerequisites reject inactive, draft and non-prompt prior versions", async (t) => {
  for (const change of [{ status: "failed" }, { draft: true }, { kind: "hosted" }]) {
    const f = await fixture(t);
    const remote = f.provider.remote();
    remote.versions[0] = { ...remote.versions[0], kind: "prompt", status: "active", draft: false, ...change };
    f.provider.setRemote(remote);
    const plan = await f.plan();
    assert.equal(plan.status, "unavailable");
    assert.match(plan.reason, /active, non-draft prompt/i);
    assert.ok(f.provider.calls.every((call) => call === "probe"));
  }
});

test("promotion rejects inactive or draft candidate versions before any pin", async (t) => {
  for (const lifecycle of [{ status: "creating" }, { status: "failed" }, { draft: true }]) {
    const f = await fixture(t);
    f.request.mode = "promote";
    f.request.foundry.promoteVersion = "2";
    await f.save();
    const packaged = await runDeployment("package", { project: f.project, request: "request.json" }, f.deps);
    const definition = JSON.parse(await readFile(path.join(f.project, packaged.packagePath, "definition.json")));
    const remote = f.provider.remote();
    remote.versions.push({
      id: "review-helper:2", version: "2", kind: "prompt", status: "active", draft: false,
      definitionSha256: digest(definition), packageSha256: null, release: "prior-release", ...lifecycle
    });
    f.provider.setRemote(remote);
    const plan = await f.plan();
    assert.equal(plan.status, "unavailable");
    assert.match(plan.reason, /Promotion target must be an active, non-draft prompt/i);
    f.provider.calls.length = 0;
    await assert.rejects(runDeployment("apply", f.approved(plan), f.deps), /unavailable/i);
    assert.deepEqual(f.provider.calls, []);
  }
});

test("an explicitly provisioning prompt version remains partial and is never pinned or invoked", async (t) => {
  const f = await fixture(t);
  const plan = await f.plan();
  const create = f.provider.createVersion;
  f.provider.createVersion = async (...args) => {
    const result = await create(...args);
    const remote = f.provider.remote();
    remote.versions.at(-1).status = "creating";
    f.provider.setRemote(remote);
    return result;
  };
  const result = await runDeployment("apply", f.approved(plan), f.deps);
  assert.equal(result.status, "partial");
  assert.equal(f.provider.calls.some((call) => call.startsWith("pin:") || call === "invoke"), false);
  assert.equal((await f.read("state")).createdVersion, "2");
});

test("platform adapter boundaries are strict and cannot equate import with publication", () => {
  const snapshot = {
    target: "copilot-studio", cliVersion: "1.49.0", identitySha256: "a".repeat(64), configurationSha256: "b".repeat(64),
    resourceIds: ["solution-id"], version: "1.0.0.0", phase: "imported"
  };
  assert.deepEqual(validatePlatformSnapshot(snapshot), snapshot);
  assert.throws(() => validatePlatformSnapshot({ ...snapshot, command: "untrusted" }));
  const outcome = {
    status: "imported", responseId: "solution-id", resourceIds: ["solution-id"], version: "1.0.0.0",
    mutationAccepted: true, publicationVerified: false, evidenceSha256: "c".repeat(64), messageCode: "SOLUTION_IMPORTED"
  };
  assert.deepEqual(validatePlatformOutcome(outcome), outcome);
  assert.throws(() => validatePlatformOutcome({ ...outcome, publicationVerified: true }));
  assert.throws(() => validatePlatformOutcome({ ...outcome, status: "published" }));
  validatePlatformOutcome({ ...outcome, status: "published", publicationVerified: true, messageCode: "PUBLICATION_VERIFIED" });
});

test("hosted immutable-image update waits for active readiness before pin and invocation", async (t) => {
  const f = await hostedFixture(t);
  const plan = await f.plan();
  assert.equal(plan.status, "review-required");
  assert.ok(plan.requiredApprovals.includes("hosted-code-execution"));
  assert.ok(plan.steps.some((step) => step.operation === "wait-version-active"));
  assert.equal(f.definition.kind, "hosted");
  assert.equal(f.definition.container_configuration.image, f.request.hosted.image);
  const result = await runDeployment("apply", { ...f.approved(plan), approve: plan.requiredApprovals }, f.deps);
  assert.equal(result.status, "verified");
  assert.ok(f.provider.calls.indexOf("wait:2") < f.provider.calls.indexOf("pin:2"));
  const rolledBack = await runDeployment("rollback", { ...f.approved(plan), approve: ["rollback-routing"] }, f.deps);
  assert.equal(rolledBack.status, "rolled-back");
  assert.equal(f.provider.remote().activeVersion, "1");
});

test("hosted source proof, registry approval and startup failure are fail-closed", async (t) => {
  const f = await hostedFixture(t);
  let remote = f.provider.remote();
  remote.hostedSource.definitionSha256 = "9".repeat(64);
  f.provider.setRemote(remote);
  const denied = await f.plan();
  assert.equal(denied.status, "unavailable");
  assert.match(denied.reason, /tested|source/i);
  remote.hostedSource.definitionSha256 = digest(f.definition);
  f.provider.setRemote(remote);
  const plan = await f.plan();
  f.provider.waitForVersion = async () => { throw new Error("Hosted startup failed."); };
  const result = await runDeployment("apply", { ...f.approved(plan), approve: plan.requiredApprovals }, f.deps);
  assert.equal(result.status, "partial");
  assert.equal(f.provider.calls.some((call) => call.startsWith("pin:") || call === "invoke"), false);
  assert.equal((await f.read("state")).createdVersion, "2");
});

test("hosted wire contract uses immutable container configuration and bounded exact-version GET polling", async (t) => {
  const f = await hostedFixture(t);
  const calls = [];
  let polls = 0;
  const cli = async (args) => {
    if (args[0] === "version") return { "azure-cli": "2.80.0" };
    if (args[0] === "cloud") return { name: "AzureCloud" };
    if (args[1] === "show") return { id: f.profile.subscription.subscriptionId, tenantId: f.profile.subscription.tenantId, environmentName: "AzureCloud", state: "Enabled" };
    return { accessToken: "transient-token", expires_on: "9999999999", subscription: f.profile.subscription.subscriptionId, tenant: f.profile.subscription.tenantId };
  };
  const provider = await createFoundryProvider({
    request: f.request, blueprint: blueprint(), profile: f.profile, definition: f.definition
  }, {
    runAzureCli: cli, sleep: async () => {},
    fetch: async (url, options) => {
      calls.push({ url: String(url), method: options.method, body: options.body ? JSON.parse(options.body) : null, headers: options.headers });
      if (options.method === "POST") {
        return Response.json({ id: "review-helper:2", name: "review-helper", version: "2", status: "creating", definition: f.definition });
      }
      assert.match(String(url), /\/agents\/review-helper\/versions\/2\?api-version=v1$/);
      polls++;
      return Response.json({ id: "review-helper:2", name: "review-helper", version: "2", status: polls === 1 ? "creating" : "active", definition: f.definition });
    }
  });
  await provider.createVersion(f.definition, { pso_package: "a".repeat(64), pso_release: "release-1" });
  const ready = await provider.waitForVersion("2");
  assert.equal(ready.version, "2");
  assert.equal(polls, 2);
  assert.deepEqual(calls[0].body.definition, {
    kind: "hosted", cpu: "0.5", memory: "1Gi",
    container_configuration: { image: f.request.hosted.image },
    protocol_versions: [{ protocol: "responses", version: "2.0.0" }],
    session_configuration: { idle_timeout_seconds: 900 }
  });
  assert.ok(calls.every((call) => !Object.hasOwn(call.headers, "If-Match") && !Object.hasOwn(call.headers, "Idempotency-Key")));
  assert.equal(calls.filter((call) => call.method === "POST").length, 1);
});

test("hosted receipts and registry allowlists are revalidated without cloud mutation", async (t) => {
  const f = await hostedFixture(t);
  await writeFile(path.join(f.project, ".azure", "agent-deployment-allowlist.json"), JSON.stringify({
    schemaVersion: "1.0.0", cloud: "AzureCloud", projectEndpoints: [f.request.foundry.projectEndpoint],
    containerRegistries: ["other.azurecr.io"]
  }));
  const denied = await f.plan();
  assert.equal(denied.status, "unavailable");
  assert.match(denied.reason, /registry/i);
  assert.equal(f.provider.calls.length, 0);
  f.deps.now = () => new Date("2026-09-24T12:00:00Z");
  const expired = await f.plan();
  assert.equal(expired.status, "unavailable");
  assert.match(expired.reason, /evidence.*expired/i);
  assert.equal(f.provider.calls.length, 0);
});

test("M365 central execution gates each class, journals accepted IDs and never equates submission with publication", async (t) => {
  for (const scope of ["Shared", "Tenant"]) {
    const f = await publicationFixture(t, scope);
    const plan = await f.plan();
    assert.equal(plan.status, "review-required");
    assert.ok(plan.requiredApprovals.includes("public-activity-exposure"));
    assert.ok(plan.requiredApprovals.includes(scope === "Tenant" ? "tenant-publication" : "publication-submission"));
    f.platformProvider.calls.length = 0;
    await assert.rejects(runDeployment("apply", { ...f.approved(plan), approve: [] }, f.deps), /approval/i);
    assert.deepEqual(f.platformProvider.calls, []);
    const options = { ...f.approved(plan), approve: plan.requiredApprovals };
    const result = await runDeployment("apply", options, f.deps);
    assert.equal(result.status, scope === "Tenant" ? "pending-admin-approval" : "publication-submitted");
    assert.equal(result.platformOutcome.publicationVerified, false);
    assert.deepEqual(f.platformProvider.calls.filter((call) => !["probe", "verify"].includes(call)), ["bot", "channel", "endpoint", "publish"]);
    const state = await f.read("state");
    assert.equal(state.platformReceipts.length, 4);
    const mutations = f.platformProvider.calls.filter((call) => !["probe", "verify"].includes(call));
    await runDeployment("apply", options, f.deps);
    assert.deepEqual(f.platformProvider.calls.filter((call) => !["probe", "verify"].includes(call)), mutations);
    const verified = await runDeployment("verify", { project: f.project, plan: "reports/agent-deployment-plan.json" }, f.deps);
    assert.equal(verified.status, result.status);
    assert.equal(f.platformProvider.calls.includes("invoke"), false);
  }
});

test("M365 lost publication response preserves earlier resource receipts and blocks replay", async (t) => {
  const f = await publicationFixture(t, "Tenant");
  const plan = await f.plan();
  const execute = f.platformProvider.execute;
  f.platformProvider.execute = async (operation) => {
    const outcome = await execute(operation);
    if (operation === "publish") throw new Error("Response lost after publication submission.");
    return outcome;
  };
  const options = { ...f.approved(plan), approve: plan.requiredApprovals };
  const result = await runDeployment("apply", options, f.deps);
  assert.equal(result.status, "partial");
  assert.equal((await f.read("state")).platformReceipts.length, 3);
  assert.ok((await f.read("state")).journal.some((entry) => entry.operation === "m365-publish" && entry.status === "started"));
  await assert.rejects(runDeployment("apply", options, f.deps), /partial|reconcile/i);
  assert.equal(f.platformProvider.calls.filter((call) => call === "publish").length, 1);
});

async function publicationWire(t, scope = "Tenant") {
  const f = await publicationFixture(t, scope);
  const definition = { kind: "prompt", model: "review-model", instructions: "Reviewed existing agent.", tools: [] };
  f.request.microsoft365.definitionSha256 = digest(definition);
  const proofPath = path.join(f.project, "publication-test.json");
  const proof = JSON.parse(await readFile(proofPath));
  proof.definitionSha256 = digest(definition);
  const proofBytes = JSON.stringify(proof);
  await writeFile(proofPath, proofBytes);
  f.request.microsoft365.testEvidence.sha256 = digest(proofBytes);
  await f.save();
  const groupId = `/subscriptions/${f.profile.subscription.subscriptionId}/resourceGroups/rg-reviewed`;
  const botId = `${groupId}/providers/Microsoft.BotService/botServices/bot-review-helper`;
  const channelId = `${botId}/channels/MsTeamsChannel`;
  const originalEndpoint = {
    version_selector: { version_selection_rules: [{ type: "FixedRatio", agent_version: "1", traffic_percentage: 100 }] },
    protocol_configuration: { responses: {}, invocations: {}, a2a: {}, activity: { retained_setting: true } },
    authorization_schemes: [{ type: "Entra", user_isolation_key_source: "Entra" }, { type: "BotServiceRbac" }]
  };
  const server = { endpoint: structuredClone(originalEndpoint), bot: null, channel: null, publicationStatus: 200 };
  const calls = [];
  const clientId = "44444444-4444-4444-8444-444444444444";
  delete f.deps.providerFactory;
  f.deps.runAzureCli = async (args) => {
    if (args[0] === "version") return { "azure-cli": "2.80.0" };
    if (args[0] === "cloud") return { name: "AzureCloud" };
    if (args[1] === "show") return { id: f.profile.subscription.subscriptionId, tenantId: f.profile.subscription.tenantId, environmentName: "AzureCloud", state: "Enabled" };
    return {
      accessToken: args.includes("https://management.azure.com/") ? "arm-test-token" : "foundry-test-token",
      expires_on: "9999999999", subscription: f.profile.subscription.subscriptionId, tenant: f.profile.subscription.tenantId
    };
  };
  f.deps.sleep = async () => {};
  f.deps.fetch = async (url, options) => {
    const parsed = new URL(url);
    const body = options.body ? JSON.parse(options.body) : null;
    calls.push({ url: String(url), method: options.method, body, headers: options.headers, redirect: options.redirect });
    if (parsed.origin === "https://management.azure.com") {
      assert.equal(options.headers.Authorization, "Bearer arm-test-token");
      if (parsed.pathname.endsWith("/providers/Microsoft.BotService")) return Response.json({ registrationState: "Registered" });
      if (parsed.pathname === groupId) return Response.json({ id: groupId, name: "rg-reviewed" });
      if (parsed.pathname === botId) {
        if (options.method === "PUT") {
          server.bot = { id: botId, name: "bot-review-helper", ...body, properties: { ...body.properties, provisioningState: "Succeeded" } };
          return Response.json(server.bot, { status: 201 });
        }
        return server.bot ? Response.json(server.bot) : new Response(null, { status: 404 });
      }
      if (parsed.pathname === channelId) {
        if (options.method === "PUT") {
          server.channel = { id: channelId, ...body };
          return Response.json(server.channel, { status: 201 });
        }
        return server.channel ? Response.json(server.channel) : new Response(null, { status: 404 });
      }
      assert.fail("Unexpected ARM route.");
    }
    assert.equal(options.headers.Authorization, "Bearer foundry-test-token");
    if (parsed.pathname.endsWith("/versions/1")) return Response.json({
      object: "agent.version", id: "review-helper:1", name: "review-helper", version: "1", status: "active", definition
    });
    if (parsed.pathname.endsWith("/microsoft365/publish")) {
      if (server.publicationStatus !== 200) return new Response("Private provider details.", { status: server.publicationStatus });
      return Response.json({ titleId: "title-test", teamsAppId: "55555555-5555-4555-8555-555555555555" });
    }
    assert.ok(parsed.pathname.endsWith("/agents/review-helper"));
    if (options.method === "PATCH") server.endpoint = { ...server.endpoint, ...body.agent_endpoint };
    return Response.json({
      object: "agent", id: "agent-review-helper", name: "review-helper", state: "enabled",
      instance_identity: { principal_id: "11111111-1111-4111-8111-111111111111", client_id: clientId, status: "active" },
      agent_endpoint: server.endpoint
    });
  };
  return { ...f, server, calls, originalEndpoint, groupId, botId, channelId, clientId };
}

test("M365 REST creates reviewed ARM bridges, preserves every protocol/auth entry and submits v1 camelCase metadata", async (t) => {
  const f = await publicationWire(t);
  const plan = await f.plan();
  assert.equal(plan.status, "review-required", plan.reason);
  assert.ok(f.calls.every((call) => call.method === "GET"), "planning must be read-only");
  const result = await runDeployment("apply", { ...f.approved(plan), approve: plan.requiredApprovals }, f.deps);
  assert.equal(result.status, "pending-admin-approval", result.message);
  const mutations = f.calls.filter((call) => call.method !== "GET");
  assert.deepEqual(mutations.map((call) => call.method), ["PUT", "PUT", "PATCH", "POST"]);
  assert.match(mutations[0].url, /Microsoft\.BotService\/botServices\/bot-review-helper\?api-version=2022-09-15$/);
  assert.equal(mutations[0].body.properties.msaAppId, f.clientId);
  assert.equal(mutations[0].body.properties.publicNetworkAccess, "Disabled");
  assert.match(mutations[0].body.properties.endpoint, /activityProtocol\?api-version=2025-05-15-preview$/);
  const endpoint = mutations[2].body.agent_endpoint;
  assert.deepEqual(endpoint.protocol_configuration.invocations, {});
  assert.deepEqual(endpoint.protocol_configuration.a2a, {});
  assert.equal(endpoint.protocol_configuration.activity.retained_setting, true);
  assert.equal(endpoint.protocol_configuration.activity.enable_m365_public_endpoint, true);
  assert.deepEqual(endpoint.authorization_schemes.slice(0, 2), f.originalEndpoint.authorization_schemes);
  assert.equal(endpoint.authorization_schemes.at(-1).type, "BotServiceTenant");
  assert.deepEqual(f.server.endpoint.version_selector, f.originalEndpoint.version_selector);
  assert.match(mutations[3].url, /\/agents\/review-helper\/microsoft365\/publish\?api-version=v1$/);
  assert.equal(mutations[3].body.botServiceArmId, f.botId);
  assert.equal(mutations[3].body.publishScope, "Tenant");
  assert.equal(mutations[3].body.publishAsAutopilot, false);
  assert.ok(!Object.hasOwn(mutations[3].body, "agent_display_name"));
  assert.ok(f.calls.every((call) => call.redirect === "error" && !Object.hasOwn(call.headers, "If-Match")));
  const state = await f.read("state");
  assert.ok(state.journal.some((entry) => entry.status === "accepted" && entry.responseId === f.botId));
  const beforeVerify = f.calls.filter((call) => call.method !== "GET").length;
  const verify = await runDeployment("verify", { project: f.project, plan: "reports/agent-deployment-plan.json" }, f.deps);
  assert.equal(verify.status, "pending-admin-approval");
  assert.equal(f.calls.filter((call) => call.method !== "GET").length, beforeVerify);
  assert.equal(f.calls.some((call) => call.url.includes("/openai/responses")), false);
});

test("M365 refuses cross-tenant existing bots and preserves IDs when publication is denied", async (t) => {
  const f = await publicationWire(t, "Shared");
  f.server.bot = {
    id: f.botId, kind: "azurebot", properties: {
      msaAppId: f.clientId, msaAppType: "SingleTenant",
      msaAppTenantId: "99999999-9999-4999-8999-999999999999",
      endpoint: `${f.request.microsoft365.projectEndpoint}/agents/review-helper/endpoint/protocols/activityProtocol?api-version=2025-05-15-preview`,
      publicNetworkAccess: "Disabled"
    }
  };
  const blocked = await f.plan();
  assert.equal(blocked.status, "unavailable");
  assert.match(blocked.reason, /overwrite|tenant/i);
  assert.ok(f.calls.every((call) => call.method === "GET"));
  f.server.bot = null;
  f.server.publicationStatus = 403;
  const plan = await f.plan();
  const result = await runDeployment("apply", { ...f.approved(plan), approve: plan.requiredApprovals }, f.deps);
  assert.equal(result.status, "partial");
  assert.equal((await f.read("state")).platformReceipts.length, 3);
  assert.doesNotMatch(result.message, /Private provider/);
  await assert.rejects(runDeployment("rollback", { ...f.approved(plan), approve: ["rollback-routing"] }, f.deps), /recovery|rollback/i);
});

test("published Activity/auth surface explicitly gates later Foundry version updates", async (t) => {
  const f = await fixture(t);
  const remote = f.provider.remote();
  remote.protocols = ["activity", "responses"];
  remote.authorization = ["BotServiceRbac", "Entra"];
  f.provider.setRemote(remote);
  const plan = await f.plan();
  assert.equal(plan.status, "unavailable");
  assert.match(plan.reason, /separate review|migration/i);
  assert.ok(f.provider.calls.every((call) => call === "probe"));
});

test("central native request fragments exactly match leaf exports", async () => {
  const schema = JSON.parse(await readFile(path.join(root, "schemas", "agent-deployment-request.schema.json")));
  const pac = await import("../.github/skills/agent-deployment/scripts/providers/pac.mjs");
  const atk = await import("../.github/skills/agent-deployment/scripts/providers/atk.mjs");
  assert.deepEqual(schema.$defs.copilotStudio, pac.requestSchema);
  assert.deepEqual(schema.$defs.agentsToolkit, atk.requestSchema);
});

async function nativeFixture(t, target = "copilot-studio") {
  const f = await fixture(t, target);
  f.request.runtime.kind = "application";
  f.request.rollback = { strategy: "manual", version: null };
  if (target === "copilot-studio") {
    const bytes = Buffer.from("opaque managed artifact used only by the injected platform provider");
    await writeFile(path.join(f.project, "managed.zip"), bytes);
    f.request.copilotStudio = {
      operation: "import", expectedCliVersion: "1.49.0", environment: "https://example.crm.dynamics.com",
      identityEvidence: { sha256: "a".repeat(64) }, solutionName: "ReviewSolution", solutionVersion: "1.0.0.0",
      solution: { path: "managed.zip", sha256: digest(bytes) }
    };
  } else {
    await mkdir(path.join(f.project, "toolkit"));
    const source = JSON.stringify({ version: "v1.9", provision: [{ uses: "teamsApp/create", with: { name: "ReviewedApp" } }] });
    await writeFile(path.join(f.project, "toolkit", "m365agents.yml"), source);
    const reference = { path: "toolkit/m365agents.yml", sha256: digest(source) };
    f.request.agentsToolkit = {
      operation: "provision", expectedCliVersion: "1.0.0", environment: "dev",
      projectDirectory: "toolkit", sourceFiles: [reference], lifecycle: reference,
      identityEvidence: { sha256: "a".repeat(64) }
    };
  }
  await f.save();
  const calls = [];
  const snapshot = {
    target, cliVersion: "1.49.0", identitySha256: "b".repeat(64), configurationSha256: "c".repeat(64),
    resourceIds: [], version: null, phase: "unknown"
  };
  const platform = {
    calls,
    async probe() { calls.push("probe"); return structuredClone(snapshot); },
    async execute(operation) {
      calls.push(operation);
      return {
        status: operation === "import" ? "imported" : "provisioned", responseId: "accepted-operation", resourceIds: ["reviewed-resource"],
        version: "1.0.0.0", mutationAccepted: true, publicationVerified: false, evidenceSha256: "d".repeat(64),
        messageCode: operation === "import" ? "IMPORTED_NOT_PUBLISHED" : "PROVISION_ACCEPTED_UNVERIFIED"
      };
    },
    async verify(receipt) { calls.push("verify"); return { ...receipt, status: "verification-required", mutationAccepted: true, messageCode: "OPERATOR_VERIFICATION_REQUIRED" }; },
    async rollback() { calls.push("rollback"); throw new Error("No atomic recovery."); }
  };
  f.deps.providerFactory = async () => platform;
  return { ...f, platform };
}

test("central native application imports preserve approvals, idempotence, read-only verification and manual recovery", async (t) => {
  const f = await nativeFixture(t);
  const plan = await f.plan();
  assert.equal(plan.status, "review-required", plan.reason);
  assert.deepEqual(plan.requiredApprovals, ["solution-import"]);
  f.platform.calls.length = 0;
  await assert.rejects(runDeployment("apply", { ...f.approved(plan), approve: [] }, f.deps), /approval/i);
  assert.deepEqual(f.platform.calls, []);
  const options = { ...f.approved(plan), approve: plan.requiredApprovals };
  const result = await runDeployment("apply", options, f.deps);
  assert.equal(result.status, "imported");
  assert.equal(result.platformOutcome.publicationVerified, false);
  await runDeployment("apply", options, f.deps);
  assert.equal(f.platform.calls.filter((call) => call === "import").length, 1);
  const verified = await runDeployment("verify", { project: f.project, plan: "reports/agent-deployment-plan.json" }, f.deps);
  assert.equal(verified.status, "verification-required");
  assert.equal(verified.platformOutcome.mutationAccepted, false, "read-only verify must not record a new mutation");
  await assert.rejects(runDeployment("rollback", { ...options, approve: ["rollback-routing"] }, f.deps), /recovery|rollback/i);
  assert.equal(f.platform.calls.includes("rollback"), false);
  for (const name of ["plan", "state", "result"]) validateContract(name, await f.read(name));
});

test("Toolkit lifecycle requires a distinct reviewed-code-execution approval", async (t) => {
  const f = await nativeFixture(t, "microsoft-365-agents-toolkit");
  const plan = await f.plan();
  assert.equal(plan.status, "review-required", plan.reason);
  assert.deepEqual(plan.requiredApprovals, ["toolkit-provision", "reviewed-code-execution"]);
  f.platform.calls.length = 0;
  await assert.rejects(runDeployment("apply", { ...f.approved(plan), approve: ["toolkit-provision"] }, f.deps), /approval/i);
  assert.deepEqual(f.platform.calls, []);
  const result = await runDeployment("apply", { ...f.approved(plan), approve: plan.requiredApprovals }, f.deps);
  assert.equal(result.status, "provisioned");
  assert.equal(result.platformOutcome.publicationVerified, false);
});

test("central native expiry, artifact drift and ambiguous outcomes never replay a CLI mutation", async (t) => {
  const f = await nativeFixture(t);
  const plan = await f.plan();
  const options = { ...f.approved(plan), approve: plan.requiredApprovals };
  await writeFile(path.join(f.project, "managed.zip"), "different reviewed bytes");
  f.platform.calls.length = 0;
  await assert.rejects(runDeployment("apply", options, f.deps), /digest|changed/i);
  assert.deepEqual(f.platform.calls, []);
  await writeFile(path.join(f.project, "managed.zip"), "opaque managed artifact used only by the injected platform provider");
  f.deps.now = () => new Date("2026-09-23T12:00:00Z");
  await assert.rejects(runDeployment("apply", options, f.deps), /expired/i);
  assert.deepEqual(f.platform.calls, []);
  f.deps.now = () => now;
  f.platform.execute = async () => { f.platform.calls.push("import"); throw new Error("Ambiguous CLI failure with private details."); };
  const partial = await runDeployment("apply", options, f.deps);
  assert.equal(partial.status, "partial");
  assert.doesNotMatch(partial.message, /private details/);
  await assert.rejects(runDeployment("apply", options, f.deps), /partial|reconcile/i);
  assert.equal(f.platform.calls.filter((call) => call === "import").length, 1);
});

test("native application configurations cannot masquerade as prompt runtimes", async (t) => {
  const f = await nativeFixture(t);
  f.request.runtime.kind = "prompt";
  assert.throws(() => validateRequest(f.request), /contract/i);
});

test("central dispatch invokes the actual PAC factory through injected fixed CLI calls only", async (t) => {
  const f = await fixture(t, "copilot-studio");
  const { identityEvidenceDigest } = await import("../.github/skills/agent-deployment/scripts/providers/enterprise-cli.mjs");
  const who = { stdout: "reviewed authentication context", stderr: "" };
  const listing = { stdout: "reviewed selected profile", stderr: "" };
  const environment = "https://example.crm.dynamics.com";
  f.request.runtime.kind = "application";
  f.request.rollback = { strategy: "manual", version: null };
  f.request.copilotStudio = {
    operation: "publish", expectedCliVersion: "1.49.0", environment,
    identityEvidence: { sha256: identityEvidenceDigest("pac", {
      tenantId: f.profile.subscription.tenantId, environment, cloud: "AzureCloud", audience: f.request.audience
    }, { who, list: listing }) },
    botId: "66666666-6666-4666-8666-666666666666"
  };
  await f.save();
  const commands = [];
  delete f.deps.providerFactory;
  f.deps.runCli = async (tool, args) => {
    assert.equal(tool, "pac");
    commands.push(args);
    const response = args[0] === "--version" ? "1.49.0"
      : args[0] === "auth" ? args[1] === "who" ? who.stdout : listing.stdout
      : args[1] === "status" ? "bounded provider status evidence" : "accepted publication operation";
    return { exitCode: 0, stdout: response, stderr: "" };
  };
  const plan = await f.plan();
  assert.equal(plan.status, "review-required", plan.reason);
  const result = await runDeployment("apply", { ...f.approved(plan), approve: plan.requiredApprovals }, f.deps);
  assert.equal(result.status, "publication-submitted", result.message);
  assert.equal(result.platformOutcome.publicationVerified, false);
  assert.equal(commands.filter((args) => args[0] === "copilot" && args[1] === "publish").length, 1);
  const priorMutations = commands.filter((args) => args[1] === "publish").length;
  await runDeployment("verify", { project: f.project, plan: "reports/agent-deployment-plan.json" }, f.deps);
  assert.equal(commands.filter((args) => args[1] === "publish").length, priorMutations);
  assert.ok(commands.every((args) => !args.includes("--json") && !args.includes("login") && !args.includes("select")));
});

test("central dispatch invokes the actual Toolkit staged lifecycle after separate code approval", async (t) => {
  const f = await nativeFixture(t, "microsoft-365-agents-toolkit");
  const { identityEvidenceDigest } = await import("../.github/skills/agent-deployment/scripts/providers/enterprise-cli.mjs");
  const observation = { stdout: "reviewed Toolkit account context", stderr: "" };
  f.request.agentsToolkit.identityEvidence.sha256 = identityEvidenceDigest("atk", {
    tenantId: f.profile.subscription.tenantId, environment: "dev", cloud: "AzureCloud", audience: f.request.audience
  }, { list: observation });
  await f.save();
  delete f.deps.providerFactory;
  const commands = [];
  f.deps.runCli = async (tool, args) => {
    assert.equal(tool, "atk");
    commands.push(args);
    return { exitCode: 0, stdout: args[0] === "--version" ? "1.0.0" : args[0] === "auth" ? observation.stdout : "accepted reviewed provision lifecycle", stderr: "" };
  };
  const plan = await f.plan();
  assert.equal(plan.status, "review-required", plan.reason);
  assert.ok(plan.requiredApprovals.includes("reviewed-code-execution"));
  const result = await runDeployment("apply", { ...f.approved(plan), approve: plan.requiredApprovals }, f.deps);
  assert.equal(result.status, "provisioned", result.message);
  const provision = commands.filter((args) => args[0] === "provision");
  assert.equal(provision.length, 1);
  assert.deepEqual(provision[0].slice(-2), ["-i", "false"]);
  assert.ok(provision[0].includes("--ignore-env-file"));
  assert.equal(result.platformOutcome.publicationVerified, false);
});

test("M365 exposure requires its own approval and unexpected publication changes retain accepted IDs", async (t) => {
  const f = await publicationWire(t, "Shared");
  const plan = await f.plan();
  const approved = { ...f.approved(plan), approve: plan.requiredApprovals };
  f.calls.length = 0;
  await assert.rejects(runDeployment("apply", { ...approved, approve: approved.approve.filter((item) => item !== "public-activity-exposure") }, f.deps), /approval/i);
  assert.deepEqual(f.calls, []);
  const fetch = f.deps.fetch;
  f.deps.fetch = async (url, options) => {
    const response = await fetch(url, options);
    if (String(url).includes("/microsoft365/publish")) f.server.endpoint.protocol_configuration.unreviewed = {};
    return response;
  };
  const result = await runDeployment("apply", approved, f.deps);
  assert.equal(result.status, "partial");
  const state = await f.read("state");
  assert.ok(state.journal.some((entry) => entry.operation === "m365-publish" && entry.status === "accepted" && entry.responseId === "title-test"));
  assert.ok(state.platformReceipts.at(-1).outcome.resourceIds.includes("55555555-5555-4555-8555-555555555555"));
  assert.equal(f.calls.filter((call) => call.method === "POST").length, 1);
});

async function setNativeEnvironment(f, environment) {
  const source = blueprint("copilot-studio");
  source.distribution.environment = environment ?? "development";
  const bytes = JSON.stringify(source);
  await writeFile(path.join(f.project, "agent.json"), bytes);
  f.request.blueprint.sha256 = digest(bytes);
  if (environment === undefined) delete f.request.environment;
  else f.request.environment = environment;
  await f.save();
}

test("unmanaged PAC imports fail request and plan validation outside explicit development", async (t) => {
  for (const environment of ["staging", "production", undefined]) {
    const f = await nativeFixture(t);
    f.request.copilotStudio.solutionType = "unmanaged";
    await setNativeEnvironment(f, environment);
    let constructed = 0;
    f.deps.providerFactory = async () => { constructed++; return f.platform; };
    assert.throws(() => validateRequest(f.request), /contract/i);
    await assert.rejects(f.plan(), /contract|development/i);
    assert.equal(constructed, 0);
    assert.deepEqual(f.platform.calls, []);
  }
});

test("platform readiness independently blocks a cached unmanaged request outside development", async (t) => {
  const f = await nativeFixture(t);
  f.request.copilotStudio.solutionType = "unmanaged";
  await f.save();
  const context = await loadContext(f.project, "request.json");
  context.request = { ...context.request, environment: "staging" };
  context.distribution = { ...context.distribution, environment: "staging" };
  let constructed = 0;
  f.deps.providerFactory = async () => { constructed++; return f.platform; };
  const plan = await planPlatform(context, {}, f.deps);
  assert.equal(plan.status, "unavailable");
  assert.match(plan.reason, /unmanaged.*development/i);
  assert.equal(constructed, 0);
  assert.deepEqual(f.platform.calls, []);
});

test("development unmanaged import keeps explicit import approval and never publishes", async (t) => {
  const f = await nativeFixture(t);
  f.request.copilotStudio.solutionType = "unmanaged";
  await f.save();
  const plan = await f.plan();
  assert.equal(plan.status, "review-required", plan.reason);
  assert.deepEqual(plan.requiredApprovals, ["solution-import"]);
  assert.match(plan.steps[0].description, /unmanaged.*development/i);
  f.platform.calls.length = 0;
  await assert.rejects(runDeployment("apply", { ...f.approved(plan), approve: [] }, f.deps), /approval/i);
  assert.deepEqual(f.platform.calls, []);
  const result = await runDeployment("apply", { ...f.approved(plan), approve: plan.requiredApprovals }, f.deps);
  assert.equal(result.status, "imported");
  assert.equal(result.platformOutcome.publicationVerified, false);
  assert.deepEqual(f.platform.calls.filter((call) => call !== "probe"), ["import"]);
});

test("unmanaged import stage changes invalidate approval before provider construction", async (t) => {
  const f = await nativeFixture(t);
  f.request.copilotStudio.solutionType = "unmanaged";
  await f.save();
  const plan = await f.plan();
  await setNativeEnvironment(f, "production");
  let constructed = 0;
  f.deps.providerFactory = async () => { constructed++; return f.platform; };
  f.platform.calls.length = 0;
  await assert.rejects(runDeployment("apply", { ...f.approved(plan), approve: plan.requiredApprovals }, f.deps), /contract|development|changed/i);
  assert.equal(constructed, 0);
  assert.deepEqual(f.platform.calls, []);
});

test("omitted PAC solutionType keeps managed imports available across declared stages", async (t) => {
  for (const environment of ["development", "staging", "production"]) {
    const f = await nativeFixture(t);
    await setNativeEnvironment(f, environment);
    assert.equal(Object.hasOwn(f.request.copilotStudio, "solutionType"), false);
    validateRequest(f.request);
    const plan = await f.plan();
    assert.equal(plan.status, "review-required", plan.reason);
    assert.match(plan.steps[0].description, /managed/i);
    assert.deepEqual(plan.requiredApprovals, ["solution-import"]);
  }
});

test("Toolkit retained-ZIP publish/update require operation approval without lifecycle authority", async (t) => {
  for (const operation of ["publish", "update"]) {
    const f = await nativeFixture(t, "microsoft-365-agents-toolkit");
    const appId = "77777777-7777-4777-8777-777777777777";
    const manifest = JSON.stringify({ id: appId, version: "1.0.0" });
    const zip = Buffer.from("retained package represented by an injected provider");
    await writeFile(path.join(f.project, "toolkit", "manifest.json"), manifest);
    await writeFile(path.join(f.project, "retained.zip"), zip);
    const manifestRef = { path: "toolkit/manifest.json", sha256: digest(manifest) };
    delete f.request.agentsToolkit.lifecycle;
    Object.assign(f.request.agentsToolkit, {
      operation, manifest: manifestRef, appId, appVersion: "1.0.0",
      package: { path: "retained.zip", sha256: digest(zip) }
    });
    f.request.agentsToolkit.sourceFiles.push(manifestRef);
    await f.save();
    f.platform.execute = async (selected) => {
      f.platform.calls.push(selected);
      return {
        status: "publication-submitted", responseId: appId, resourceIds: [appId], version: "1.0.0",
        mutationAccepted: true, publicationVerified: false, evidenceSha256: digest(zip),
        messageCode: "RETAINED_PACKAGE_SUBMITTED"
      };
    };
    const plan = await f.plan();
    assert.equal(plan.status, "review-required", plan.reason);
    assert.deepEqual(plan.requiredApprovals, [`toolkit-${operation}`]);
    assert.match(plan.steps[0].description, /retained ZIP/i);
    f.platform.calls.length = 0;
    await assert.rejects(runDeployment("apply", { ...f.approved(plan), approve: ["reviewed-code-execution"] }, f.deps), /approval/i);
    assert.deepEqual(f.platform.calls, []);
    const result = await runDeployment("apply", { ...f.approved(plan), approve: plan.requiredApprovals }, f.deps);
    assert.equal(result.status, "publication-submitted", result.message);
    assert.equal(result.platformOutcome.publicationVerified, false);
    assert.deepEqual(f.platform.calls.filter((call) => call !== "probe"), [operation]);
  }
});

test("central Toolkit packaging rejects raw TypeSpec markers in comments before any CLI call", async (t) => {
  const f = await nativeFixture(t, "microsoft-365-agents-toolkit");
  const yaml = "version: v1.9\n# dormant typeSpec/compile marker must still block SDK auto-install\nprovision: []\n";
  const appId = "77777777-7777-4777-8777-777777777777";
  const manifest = JSON.stringify({ id: appId, version: "1.0.0" });
  await writeFile(path.join(f.project, "toolkit", "m365agents.yml"), yaml);
  await writeFile(path.join(f.project, "toolkit", "manifest.json"), manifest);
  f.request.agentsToolkit = {
    operation: "package", expectedCliVersion: "1.0.0", environment: "dev", projectDirectory: "toolkit",
    sourceFiles: [
      { path: "toolkit/m365agents.yml", sha256: digest(yaml) },
      { path: "toolkit/manifest.json", sha256: digest(manifest) }
    ],
    manifest: { path: "toolkit/manifest.json", sha256: digest(manifest) },
    appId, appVersion: "1.0.0",
    outputDirectory: "reports/agent-deployment/platform-work/atk/output", outputFileName: "app.zip"
  };
  await f.save();
  delete f.deps.providerFactory;
  let cliCalls = 0;
  f.deps.runCli = async () => { cliCalls++; throw new Error("A rejected marker must not reach any CLI."); };
  const plan = await f.plan();
  assert.equal(plan.status, "unavailable");
  assert.match(plan.reason, /TypeSpec/i);
  assert.equal(cliCalls, 0);
});

test("Toolkit registry separates lifecycle execution from retained-package submission", () => {
  const capability = getCapabilities().providers.find((item) => item.target === "microsoft-365-agents-toolkit");
  assert.match(capability.automaticSteps.join(" "), /retained ZIP/i);
  assert.match(capability.limitations.join(" "), /TypeSpec.*comments/i);
});
