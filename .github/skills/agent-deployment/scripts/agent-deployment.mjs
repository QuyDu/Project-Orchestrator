#!/usr/bin/env node
import path from "node:path";
import { pathToFileURL } from "node:url";
import {
  digest, implementationDigest, jsonBytes, rejectSecrets, safeError, stableJson, stop, validateContract, validateContractPart, validateRequest
} from "./contracts.mjs";
import {
  appendRecord, immutableFile, projectRoot, readBytes, readJson, relativePath, withProjectLock, writeAtomic
} from "./files.mjs";
import { loadContext, verifyPackage, writePackage } from "./package.mjs";
import { createFoundryProvider } from "./providers/foundry.mjs";
import { getCapabilities } from "./providers/registry.mjs";
import { hasPlatformConfiguration, isPlatformTarget, planPlatform, runPlatform } from "./platform-engine.mjs";

export { digest, getCapabilities, stableJson, validateContract, validateRequest };

const planReport = "reports/agent-deployment-plan.json";
const stateReport = "reports/agent-deployment-state.json";
const resultReport = "reports/agent-deployment-result.json";
const operationContracts = {
  "create-version": { approval: "agent-version-create", description: "Create the reviewed immutable prompt version; create mode also creates its live stable agent endpoint." },
  "wait-version-active": { approval: "hosted-code-execution", description: "Validate reviewed hosted-code authority and poll the exact hosted version within its startup bound; never activate or invoke it before active readiness." },
  "configure-endpoint": { approval: "endpoint-configuration", description: "Configure only Responses protocol and Microsoft Entra authorization for the newly created agent." },
  "pin-version": { approval: "endpoint-routing", description: "Pin 100 percent of traffic to the exact reviewed immutable version." },
  "invoke-probe": { approval: "endpoint-invocation", description: "Invoke the pinned endpoint once with the reviewed bounded verification prompt." },
  "rollback-pin": { approval: "rollback-routing", description: "Repin the captured prior immutable version without deleting created versions or changing identity." }
};
const approvalClasses = new Set(Object.values(operationContracts).map((item) => item.approval));

function timestamp(dependencies) {
  const date = dependencies.now ? dependencies.now() : new Date();
  if (!(date instanceof Date) || !Number.isFinite(date.getTime())) stop("CLOCK_INVALID", "A valid execution clock is required.");
  return date.toISOString();
}

function runDirectory(plan) {
  return `reports/agent-deployment/${plan.agentId}/runs/${plan.planId}`;
}

function stepsFor(request) {
  return [
    ...(request.mode === "promote" ? [] : ["create-version"]),
    ...(request.runtime.kind === "hosted" ? ["wait-version-active"] : []),
    ...(request.mode === "create" ? ["configure-endpoint"] : []),
    "pin-version", "invoke-probe"
  ].map((operation) => ({
    operation, ...operationContracts[operation], executable: true,
    ...(operation === "create-version" && request.runtime.kind === "hosted" ? {
      approval: "hosted-code-execution",
      description: `Create an immutable hosted version from the approved OCI digest using ${request.hosted.cpu} CPU and ${request.hosted.memory}; this starts billable compute and executes reviewed container code.`
    } : {})
  }));
}

function planHash(plan) {
  const { planSha256, ...body } = plan;
  return digest(body);
}

function resultFor(action, context = null, plan = null, state = null, overrides = {}) {
  const result = {
    schemaVersion: "1.0.0", action, status: state?.status === "applying" ? "unverified" : state?.status ?? "unverified",
    target: context?.request.target ?? plan?.target ?? null, agentId: context?.blueprint.id ?? plan?.agentId ?? null,
    planId: plan?.planId ?? null, planSha256: plan?.planSha256 ?? null,
    packagePath: context?.packagePath ?? plan?.packagePath ?? null, packageSha256: context?.packageSha256 ?? plan?.packageSha256 ?? null,
    statePath: state && plan ? `${runDirectory(plan)}/state.json` : null,
    activeVersion: state?.activeVersion ?? null, previousVersion: state?.previousVersion ?? null, identityId: state?.identityId ?? null,
    verifiedAt: state?.status === "verified" ? state.verification.at : null,
    code: state?.code ?? null,
    message: state?.message ?? "No accepted deployment evidence exists; remote deployment and health have not been established.",
    ...overrides
  };
  rejectSecrets(result);
  return validateContract("result", result);
}

async function persistResult(root, result) {
  await writeAtomic(root, resultReport, jsonBytes(validateContract("result", result)));
  return result;
}

function unavailable(context, now = new Date().toISOString()) {
  const { request, blueprint, distribution, capability } = context;
  if (request.cloud === "AzureUSGovernment") return "AzureUSGovernment is unverified and blocked. No Commercial routing is inferred.";
  if (request.target === "foundry-endpoint" && request.cloud !== "AzureCloud") return "The executable Foundry adapter requires an explicitly selected Azure Commercial cloud.";
  if (request.target === "foundry-endpoint" && blueprint.id.length > 63) return "Foundry agent names are limited to 63 characters; review a compatible blueprint ID.";
  if (capability.support === "unavailable") return capability.limitations[0];
  if (capability.executable && !request.acceptPreview) return "The pinned provider contract uses preview capabilities; explicit request-level preview acceptance is required.";
  if (distribution && request.environment !== distribution.environment) return "Deployment environment differs from the blueprint's reviewed distribution intent.";
  if (distribution && request.data.boundary !== distribution.dataBoundary) return "Data boundary differs from the blueprint's reviewed distribution intent.";
  if (request.target === "foundry-endpoint" && request.data.boundary === "project-local") return "Project-local data cannot be transmitted to a remote provider.";
  if (request.foundry && !request.data.residency.includes(request.foundry.location)) return "The requested provider region does not satisfy the declared residency requirement.";
  if (blueprint.azure?.required && blueprint.azure.cloud !== request.cloud) return "The blueprint and deployment request specify different clouds.";
  if (blueprint.azure?.required && request.foundry && blueprint.azure.location !== request.foundry.location) return "The blueprint and deployment request specify different regions.";
  if (distribution?.microsoft365Audience && distribution.microsoft365Audience !== request.audience) return "Microsoft 365 audience differs from the reviewed blueprint.";
  if (distribution?.chatgptVisibility && distribution.chatgptVisibility !== request.audience) return "ChatGPT visibility differs from the reviewed blueprint.";
  if (request.target === "foundry-endpoint" && request.audience !== "individual") return "The executable adapter supports only RBAC-scoped Entra callers, not tenant or public audience grants.";
  if (capability.executable && distribution?.versionPolicy === "latest") return "Latest-version activation is unsupported. Review an explicit pinned distribution before execution.";
  if (capability.executable && request.mode === "rollback") return "Use rollback with the unchanged applied plan and a separate rollback-routing approval, or review a promote request.";
  if (capability.executable && request.mode === "promote" && !request.foundry.promoteVersion) return "Promotion requires an explicitly reviewed immutable promoteVersion.";
  if (capability.executable && request.mode !== "promote" && request.foundry.promoteVersion) return "promoteVersion is valid only for promotion.";
  if (capability.executable && request.mode !== "create" && request.rollback.strategy !== "repin") return "Updates and promotions require a reviewed prior-version repin rollback.";
  if (capability.executable && request.mode === "create" && (request.rollback.strategy !== "manual" || request.rollback.version !== null)) return "First creation has no prior version. Explicitly select manual rollback without a version; deletion is not automated.";
  if (request.runtime.kind === "hosted") {
    const evidence = context.hostedTestEvidence;
    const clock = Date.parse(now);
    if (!evidence || Date.parse(evidence.verifiedAt) > clock || Date.parse(evidence.expiresAt) <= clock
        || Date.parse(evidence.expiresAt) <= Date.parse(evidence.verifiedAt)
        || clock - Date.parse(evidence.verifiedAt) > 7 * 86_400_000
        || Date.parse(evidence.expiresAt) - Date.parse(evidence.verifiedAt) > 31 * 86_400_000) {
      return "Hosted image test evidence is expired, future-dated or outside the seven-day freshness bound.";
    }
  }
  return null;
}

async function loadProfile(context) {
  const profileFile = await readJson(context.root, ".azure/environment.json");
  rejectSecrets(profileFile.value);
  const profile = profileFile.value;
  if (profile.cloud !== context.request.cloud || profile.location !== context.request.foundry.location || profile.environmentName !== context.request.environment) {
    stop("AZURE_PROFILE_MISMATCH", "The target project's Azure cloud, location or environment differs from the reviewed request.");
  }
  if (!["interactive", "managed-identity"].includes(profile.authentication?.method) || profile.mutationPolicy !== "approval-required") {
    stop("POLICY_DENIED", "The project profile must permit approval-gated mutations through an existing supported Azure session.");
  }
  if (!profile.subscription?.subscriptionId || !profile.subscription?.tenantId) stop("AZURE_PROFILE_REQUIRED", "The target project profile must record its intended subscription and tenant.");
  const allowlist = await readJson(context.root, ".azure/agent-deployment-allowlist.json");
  rejectSecrets(allowlist.value);
  validateContractPart("request", "endpointAllowlist", allowlist.value);
  if (!allowlist.value.projectEndpoints.includes(context.request.foundry.projectEndpoint)) {
    stop("ENDPOINT_NOT_APPROVED", "The exact Foundry project endpoint is not in the target project's reviewed endpoint allowlist.");
  }
  if (context.request.runtime.kind === "hosted" && !allowlist.value.containerRegistries?.includes(context.request.hosted.image.split("/")[0])) {
    stop("REGISTRY_NOT_APPROVED", "The immutable image registry is not in the target project's reviewed container registry allowlist.");
  }
  return { profile, profileSha256: digest({ profile: digest(profileFile.bytes), allowlist: digest(allowlist.bytes) }) };
}

async function providerFor(context, dependencies) {
  return dependencies.providerFactory
    ? dependencies.providerFactory(context)
    : createFoundryProvider(context, dependencies);
}

function validateRemote(remote) {
  validateContractPart("plan", "remote", remote);
  rejectSecrets(remote);
  if (new Set(remote.versions.map((item) => item.version)).size !== remote.versions.length) stop("PROVIDER_CONTRACT", "Remote version identities are not unique.");
  if (!remote.exists && (remote.agentId || remote.identityId || remote.activeVersion || remote.endpointSha256 || remote.endpointPolicySha256 || remote.agentPropertiesSha256 || remote.versions.length || remote.selector !== "none")) {
    stop("PROVIDER_CONTRACT", "Missing-agent state contradicts provider evidence.");
  }
  if (remote.exists && (!remote.agentId || !remote.endpointSha256 || !remote.endpointPolicySha256 || !remote.agentPropertiesSha256)) stop("PROVIDER_CONTRACT", "Remote agent lacks complete drift evidence.");
  return remote;
}

function remoteReadiness(context, remote) {
  const request = context.request;
  if (request.runtime.kind === "hosted") {
    const source = remote.hostedSource;
    if (!source || source.agentName !== request.hosted.testedAgentName || source.version !== request.hosted.testedVersion
        || source.status !== "active" || source.draft || source.image !== request.hosted.image
        || source.definitionSha256 !== digest(context.definition)) return "The tested hosted source version is not active or does not match the approved immutable image and runtime configuration.";
  }
  if (request.mode === "create" && remote.exists) return "Create requires an absent remote agent; review an update instead.";
  if (request.mode !== "create" && !remote.exists) return "The requested remote agent does not exist; update and promotion cannot create implicitly.";
  if (remote.exists) {
    if (!remote.identityId) return "Existing legacy agents without an active agent identity require an explicit migration or recreate plan.";
    if (remote.selector !== "pinned" || !remote.activeVersion || !remote.versions.some((item) => item.version === remote.activeVersion)) return "Existing agent must have one pinned, retrievable prior version before an update or promotion.";
    if (!readyVersion(remote.versions.find((item) => item.version === remote.activeVersion), request.runtime.kind)) return `Previously pinned version must be an active, non-draft ${request.runtime.kind} version; migrate incompatible runtimes separately.`;
    if (stableJson(remote.protocols) !== stableJson(["responses"]) || stableJson(remote.authorization) !== stableJson(["Entra"])) return "Existing endpoint must already use only Responses and Entra; protocol or authorization migration needs a separate review.";
    if (request.rollback.version !== null && request.rollback.version !== remote.activeVersion) return "Requested rollback version does not match the captured active prior version.";
    if (request.mode !== "promote" && remote.versions.some((version) => version.release === request.release)) return "This release identifier already exists remotely; reconcile or choose a newly reviewed release.";
    if (request.mode === "promote") {
      const version = remote.versions.find((item) => item.version === request.foundry.promoteVersion);
      if (!version || version.definitionSha256 !== digest(context.definition)) return "Promotion target does not exist or its definition differs from the reviewed blueprint package.";
      if (!readyVersion(version, request.runtime.kind)) return `Promotion target must be an active, non-draft ${request.runtime.kind} version before any selector mutation.`;
    }
  }
  return null;
}

function readyVersion(version, kind = "prompt") {
  return version?.kind === kind && version.status === "active" && version.draft === false;
}

function buildPlan(context, evidence, generatedAt, expiresAt) {
  const { capability, request } = context;
  const reason = evidence.reason;
  const status = reason ? "unavailable" : capability.executable ? "review-required" : "manual-handoff";
  const executable = status === "review-required";
  const steps = executable ? stepsFor(request) : [];
  const previousVersion = executable && evidence.remote?.selector === "pinned" ? evidence.remote.activeVersion : null;
  const core = {
    schemaVersion: "1.0.0", generatedAt, expiresAt, status, projectRoot: context.root,
    requestPath: context.requestPath, requestSha256: context.requestSha256, blueprintSha256: request.blueprint.sha256,
    packagePath: context.packagePath, packageSha256: context.packageSha256, registrySha256: digest(getCapabilities()), implementationSha256: implementationDigest(),
    profileSha256: evidence.profileSha256 ?? null, target: request.target, agentId: context.blueprint.id, release: request.release,
    adapter: capability.id, remote: evidence.remote ?? null, remoteSha256: evidence.remote ? digest(evidence.remote) : null,
    steps, requiredApprovals: [...new Set(steps.map((step) => step.approval))],
    permissions: capability.executable ? ["Existing Azure CLI session matching the target project's recorded cloud, subscription and tenant.", "Foundry User on the reviewed project for version management and endpoint invocation. No role assignments are performed."] : [],
    blastRadius: capability.executable ? "One named agent in the exact reviewed project endpoint. Creating an agent exposes its endpoint immediately. No project, model, Bot Service, tenant catalog or RBAC changes." : "Local package and manual checklist only; no external changes.",
    costAndQuota: capability.executable ? [
      ...(request.runtime.kind === "hosted"
        ? [`Hosted creation executes approved code and incurs ${request.hosted.cpu} CPU/${request.hosted.memory} compute charges; idle timeout is ${request.hosted.idleTimeoutSeconds} seconds.`, `Startup polling is bounded to ${request.hosted.startupTimeoutSeconds} seconds. Image provenance, code, quota, pricing and the referenced test receipt require operator review.`, "Existing registry access must already be configured through the reviewed project connection/identity. No image build, push, registry creation or RBAC grant is performed."]
        : ["Existing model deployment only; no model or hosted-compute provisioning is performed."]),
      `Each approved verification invocation is limited to ${request.verification.maxOutputTokens} output tokens.`,
      "Quota, pricing and model/data residency must be reviewed by the operator; runtime routing and residency cannot be inferred from an endpoint URL.",
      "No automatic mutation retry or live retail-price estimate is implied."
    ] : ["No cloud or model API calls are made for this target."],
    identityChanges: capability.executable ? ["Initial agent creation may create its service-managed identity. Its principal is recorded after the operation.", "No downstream RBAC assignments or custom identities are created; review such permissions separately."] : [],
    verification: capability.executable ? "Require exact version-definition digest, Responses protocol and Entra authorization; pin 100 percent of traffic; invoke once; require completed output containing the reviewed expected substring. Store only response identifier and output digest." : "Validate package and manual prerequisites only. Deployment, publication, catalog acceptance and runtime health remain unverified.",
    rollback: {
      strategy: previousVersion && capability.executable ? "repin" : "manual", previousVersion,
      approval: "rollback-routing",
      procedure: previousVersion && capability.executable ? "After explicit rollback-routing approval and fresh drift checks, repin the captured prior version and verify its active selector. Preserve created versions and identity; do not delete. Repinning cannot undo invocations, incurred charges, identity or permission changes, or channel effects." : "No approved prior pinned version is available for automatic rollback. Reconcile manually under a separately approved plan; no delete or reversal of invocations, charges, identity or channel effects is implied."
    },
    limitations: capability.limitations,
    reason: reason ?? (executable ? "Local and read-only provider checks passed. Explicit digest-bound approvals are required before any external mutation." : "This target has a nonexecuting manual handoff only; package creation is not deployment or publication.")
  };
  const planId = `DEP-${digest(core).slice(0, 32)}`;
  const plan = { ...core, planId };
  plan.planSha256 = planHash(plan);
  return validateContract("plan", plan);
}

async function planDeployment(root, options, dependencies) {
  if (!options.request) stop("REQUEST_REQUIRED", "Planning requires --request with a target-project-relative request JSON.");
  const context = await loadContext(root, options.request);
  if (hasPlatformConfiguration(context.request)) return planPlatform(context, options, dependencies);
  await writePackage(context);
  const evidence = { reason: unavailable(context, timestamp(dependencies)), remote: null, profileSha256: null };
  if (!evidence.reason && context.capability.executable) {
    try {
      Object.assign(context, await loadProfile(context));
      evidence.profileSha256 = context.profileSha256;
      const provider = await providerFor(context, dependencies);
      evidence.remote = validateRemote(await provider.probe());
      evidence.reason = remoteReadiness(context, evidence.remote);
    } catch (error) { evidence.reason = safeError(error).message; }
  }
  const generatedAt = timestamp(dependencies);
  const ttl = options.ttlMinutes ?? 60;
  if (!Number.isSafeInteger(ttl) || ttl < 1 || ttl > 60) stop("PLAN_TTL_INVALID", "Plan lifetime must be between one and 60 minutes.");
  const plan = buildPlan(context, evidence, generatedAt, new Date(Date.parse(generatedAt) + ttl * 60_000).toISOString());
  await immutableFile(root, `${runDirectory(plan)}/plan.json`, jsonBytes(plan));
  await writeAtomic(root, planReport, jsonBytes(plan));
  return plan;
}

function requireApprovals(options, plan, action) {
  const required = action === "rollback" ? ["rollback-routing"]
    : action === "verify" ? ["endpoint-invocation"] : plan.requiredApprovals;
  if (options.acceptRisk !== true || !Array.isArray(options.approve) || options.approve.some((item) => !approvalClasses.has(item))
      || required.some((item) => !options.approve.includes(item))) stop("APPROVAL_REQUIRED", "Explicit approval requires --accept-risk and every operation-class --approve immediately before execution.");
  if (options.planDigest !== plan.planSha256) stop("PLAN_DIGEST_APPROVAL", "Approval must include the exact reviewed --plan-digest.");
}

function checkLifetime(plan, dependencies, allowExpired = false) {
  const now = Date.parse(timestamp(dependencies));
  const generated = Date.parse(plan.generatedAt);
  const expires = Date.parse(plan.expiresAt);
  if (expires <= generated || expires - generated > 3_600_000 || generated > now + 30_000 || (!allowExpired && now >= expires)) {
    stop("PLAN_EXPIRED", "Review plan expired or its time window is invalid; create and review a fresh plan.");
  }
}

async function readReviewed(root, options, dependencies, action) {
  if (!options.plan) stop("PLAN_REQUIRED", "Use --plan with the unchanged target-project-relative reviewed plan.");
  const artifact = await readJson(root, relativePath(options.plan));
  rejectSecrets(artifact.value);
  const plan = validateContract("plan", artifact.value);
  if (plan.projectRoot !== root || planHash(plan) !== plan.planSha256) stop("PLAN_TAMPERED", "Reviewed plan digest or project binding has changed.");
  if (action !== "status") requireApprovals(options, plan, action);
  checkLifetime(plan, dependencies, action === "status");
  if (plan.status !== "review-required") stop("NONEXECUTING_TARGET", "Manual-handoff or unavailable plans cannot apply, verify remotely or roll back.");
  const context = await loadContext(root, plan.requestPath);
  if (context.requestSha256 !== plan.requestSha256 || context.packageSha256 !== plan.packageSha256 || context.request.blueprint.sha256 !== plan.blueprintSha256) {
    stop("INPUT_DRIFT", "Reviewed request bytes, blueprint or package digest changed.");
  }
  await verifyPackage(context);
  const reason = unavailable(context, timestamp(dependencies));
  if (reason) stop("PROVIDER_UNAVAILABLE", reason);
  Object.assign(context, await loadProfile(context));
  if (context.profileSha256 !== plan.profileSha256) stop("PROFILE_DRIFT", "The project Azure profile changed after review.");
  if (digest(getCapabilities()) !== plan.registrySha256) stop("ADAPTER_DRIFT", "Provider capability registry changed; review a fresh plan.");
  if (implementationDigest() !== plan.implementationSha256) stop("RUNTIME_DRIFT", "Deployment runtime or schemas changed after review; review a fresh plan.");
  const expected = buildPlan(context, { remote: plan.remote, profileSha256: context.profileSha256, reason: null }, plan.generatedAt, plan.expiresAt);
  if (stableJson(expected) !== stableJson(plan)) stop("PLAN_TAMPERED", "Plan operations or review evidence differ from trusted code and the reviewed request.");
  const immutable = await readBytes(root, `${runDirectory(plan)}/plan.json`);
  if (!immutable.equals(Buffer.from(jsonBytes(plan)))) stop("PLAN_TAMPERED", "Immutable run plan differs from the reviewed plan.");
  return { context, plan };
}

async function loadState(root, plan) {
  const directory = runDirectory(plan);
  const artifact = await readJson(root, `${directory}/state.json`, { optional: true });
  if (!artifact) return null;
  const state = validateContract("state", artifact.value);
  rejectSecrets(state);
  if (state.projectRoot !== root || state.planSha256 !== plan.planSha256 || state.planId !== plan.planId
      || state.requestSha256 !== plan.requestSha256 || state.packageSha256 !== plan.packageSha256
      || state.previousVersion !== plan.rollback.previousVersion || state.baselineSha256 !== plan.remoteSha256
      || state.agentId !== plan.agentId || state.target !== plan.target || state.release !== plan.release) {
    stop("STATE_TAMPERED", "Deployment state no longer matches the reviewed run.");
  }
  const journal = await readBytes(root, `${directory}/journal.jsonl`);
  if (journal.toString("utf8") !== state.journal.map((entry) => `${JSON.stringify(entry)}\n`).join("")
      || state.journal.some((entry, index) => entry.sequence !== index + 1)) {
    stop("JOURNAL_DIVERGED", "Durable journal and state diverged; reconcile the interrupted run before any mutation.");
  }
  if (state.createdVersion && !state.journal.some((entry) => entry.operation === "create-version" && entry.status === "accepted" && entry.version === state.createdVersion)) {
    stop("STATE_TAMPERED", "Created version lacks accepted creation evidence.");
  }
  return state;
}

async function saveState(root, plan, state, dependencies) {
  state.updatedAt = timestamp(dependencies);
  validateContract("state", state);
  rejectSecrets(state);
  await writeAtomic(root, `${runDirectory(plan)}/state.json`, jsonBytes(state));
  await writeAtomic(root, stateReport, jsonBytes(state));
}

async function record(context, plan, state, operation, status, responseId, code, dependencies) {
  const entry = {
    sequence: state.journal.length + 1, at: timestamp(dependencies), operation, status,
    responseId: typeof responseId === "object" && responseId !== null ? responseId.id : responseId,
    version: typeof responseId === "object" && responseId !== null ? responseId.version : null, code
  };
  validateContract("state", { ...state, journal: [...state.journal, entry] });
  rejectSecrets(entry);
  await appendRecord(context.root, `${runDirectory(plan)}/journal.jsonl`, entry);
  state.journal.push(entry);
  await saveState(context.root, plan, state, dependencies);
}

async function checkedProbe(provider, expectedDigest) {
  const remote = validateRemote(await provider.probe());
  if (expectedDigest !== null && digest(remote) !== expectedDigest) stop("REMOTE_DRIFT", "Remote state drifted from reviewed or accepted execution evidence.");
  return remote;
}

function assertVersion(context, remote, version, { owned = true, requireReady = true } = {}) {
  const selected = remote.versions.find((item) => item.version === version);
  const lifecycleValid = requireReady ? readyVersion(selected, context.request.runtime.kind)
    : selected?.kind === context.request.runtime.kind && selected.draft === false && ["creating", "active"].includes(selected.status);
  if (!remote.exists || !remote.identityId || !lifecycleValid || selected.definitionSha256 !== digest(context.definition)
      || (owned && context.request.mode !== "promote" && (selected.packageSha256 !== context.packageSha256 || selected.release !== context.request.release))) {
    stop("VERSION_MISMATCH", "Remote immutable version or agent identity does not match the reviewed deployment.");
  }
}

function assertPinned(remote, version, kind = "prompt") {
  if (!remote.exists || !remote.identityId || remote.selector !== "pinned" || remote.activeVersion !== version
      || !readyVersion(remote.versions.find((item) => item.version === version), kind)
      || stableJson(remote.protocols) !== stableJson(["responses"]) || stableJson(remote.authorization) !== stableJson(["Entra"])) {
    stop("PIN_VERIFICATION_FAILED", "The exact version, Responses protocol, active identity and Entra authorization were not verified.");
  }
}

async function revalidateInputs(context, plan, dependencies) {
  checkLifetime(plan, dependencies);
  if (implementationDigest() !== plan.implementationSha256) stop("RUNTIME_DRIFT", "Deployment runtime or schemas changed during execution.");
  const current = await loadContext(context.root, context.requestPath);
  const reason = unavailable(current, timestamp(dependencies));
  if (reason) stop("PROVIDER_UNAVAILABLE", reason);
  if (current.requestSha256 !== plan.requestSha256 || current.packageSha256 !== plan.packageSha256) stop("INPUT_DRIFT", "Reviewed inputs changed during execution.");
  await verifyPackage(current);
  const binding = await loadProfile(current);
  if (binding.profileSha256 !== plan.profileSha256) stop("PROFILE_DRIFT", "Azure profile changed during execution.");
}

function assertTransition(operation, context, state, before, after) {
  const drift = () => stop("REMOTE_DRIFT", "An unreviewed concurrent change accompanied the accepted provider mutation; reconcile before proceeding.");
  if (!after.exists || !after.identityId) drift();
  if (before.exists && (before.agentId !== after.agentId || before.identityId !== after.identityId
      || before.agentPropertiesSha256 !== after.agentPropertiesSha256)) drift();
  if (before.apiVersion !== after.apiVersion || before.cliVersion !== after.cliVersion) drift();
  if (stableJson(before.hostedSource) !== stableJson(after.hostedSource)) drift();
  if (operation === "create-version") {
    if (after.versions.length !== before.versions.length + 1
        || stableJson(after.versions.filter((item) => item.version !== state.createdVersion)) !== stableJson(before.versions)) drift();
    assertVersion(context, after, state.createdVersion, { requireReady: context.request.runtime.kind !== "hosted" });
    if (before.exists && (before.endpointSha256 !== after.endpointSha256 || before.activeVersion !== after.activeVersion)) drift();
  } else {
    if (stableJson(before.versions) !== stableJson(after.versions)) drift();
    if (operation === "configure-endpoint") {
      if (before.selector !== after.selector || before.activeVersion !== after.activeVersion
          || stableJson(after.protocols) !== stableJson(["responses"]) || stableJson(after.authorization) !== stableJson(["Entra"])) drift();
    } else if (operation === "invoke-probe") {
      if (digest(before) !== digest(after)) drift();
    } else {
      if (before.endpointPolicySha256 !== after.endpointPolicySha256) drift();
      assertPinned(after, operation === "rollback-pin" ? state.previousVersion : state.createdVersion ?? context.request.foundry.promoteVersion, context.request.runtime.kind);
    }
  }
}

async function perform(operation, context, plan, state, provider, options, dependencies, callback) {
  const approval = operation === "create-version" && context.request.runtime.kind === "hosted" ? "hosted-code-execution" : operationContracts[operation].approval;
  if (!options.approve.includes(approval) || !options.acceptRisk || options.planDigest !== plan.planSha256) stop("APPROVAL_REQUIRED", "The next external operation lacks its explicit digest-bound approval.");
  await revalidateInputs(context, plan, dependencies);
  const before = await checkedProbe(provider, state.observedRemoteSha256);
  await record(context, plan, state, operation, "started", null, null, dependencies);
  // Once a request might have left the process, no automatic replay is safe.
  state.observedRemoteSha256 = null;
  await saveState(context.root, plan, state, dependencies);
  try {
    const responseId = await callback();
    await record(context, plan, state, operation, "accepted", responseId ?? null, null, dependencies);
    const remote = await checkedProbe(provider, null);
    assertTransition(operation, context, state, before, remote);
    state.observedRemoteSha256 = digest(remote);
    state.activeVersion = remote.activeVersion;
    state.identityId = remote.identityId;
    await saveState(context.root, plan, state, dependencies);
    return remote;
  } catch (error) {
    const safe = safeError(error);
    await record(context, plan, state, operation, "failed", null, safe.code, dependencies);
    throw safe;
  }
}

async function waitForHostedVersion(context, plan, state, provider, options, dependencies, before) {
  if (!options.acceptRisk || options.planDigest !== plan.planSha256 || !options.approve.includes("hosted-code-execution")) stop("APPROVAL_REQUIRED", "Hosted execution requires its distinct code-and-compute approval.");
  if (typeof provider.waitForVersion !== "function") stop("PROVIDER_CONTRACT", "The hosted adapter does not expose bounded exact-version readiness.");
  const version = state.createdVersion ?? context.request.foundry.promoteVersion;
  const comparable = (remote) => {
    const copy = structuredClone(remote);
    const candidate = copy.versions.find((item) => item.version === version);
    if (candidate) candidate.status = "creating";
    return digest(copy);
  };
  await revalidateInputs(context, plan, dependencies);
  const current = await checkedProbe(provider, null);
  if (comparable(current) !== comparable(before)) stop("REMOTE_DRIFT", "An unrelated change occurred before hosted readiness polling.");
  await record(context, plan, state, "wait-version-active", "started", null, null, dependencies);
  state.observedRemoteSha256 = null;
  await saveState(context.root, plan, state, dependencies);
  try {
    const accepted = await provider.waitForVersion(version);
    if (accepted?.version !== version || typeof accepted.id !== "string" || !/^[a-zA-Z0-9][a-zA-Z0-9:._-]{0,255}$/.test(accepted.id)) stop("PROVIDER_CONTRACT", "Hosted readiness returned an invalid version identifier.");
    rejectSecrets(accepted.id);
    const after = await checkedProbe(provider, null);
    if (comparable(after) !== comparable(before)) stop("REMOTE_DRIFT", "Unrelated remote state changed while the hosted version was provisioning.");
    assertVersion(context, after, version);
    state.observedRemoteSha256 = digest(after);
    state.activeVersion = after.activeVersion;
    state.identityId = after.identityId;
    await record(context, plan, state, "wait-version-active", "accepted", accepted, null, dependencies);
  } catch (error) {
    const safe = safeError(error);
    await record(context, plan, state, "wait-version-active", "failed", null, safe.code, dependencies);
    throw safe;
  }
}

async function invokeProbe(context, plan, state, provider, options, dependencies) {
  const version = state.createdVersion ?? context.request.foundry.promoteVersion;
  const before = await checkedProbe(provider, state.observedRemoteSha256);
  assertVersion(context, before, version);
  assertPinned(before, version, context.request.runtime.kind);
  let verification;
  const after = await perform("invoke-probe", context, plan, state, provider, options, dependencies, async () => {
    const response = await provider.invoke(context.request.verification);
    if (!response || typeof response.id !== "string" || !/^[a-zA-Z0-9][a-zA-Z0-9:._-]{0,255}$/.test(response.id) || typeof response.outputText !== "string") {
      stop("PROBE_CONTRACT", "Verification returned an unsupported response.");
    }
    rejectSecrets(response.id);
    if (response.outputText.length > 131072) stop("PROBE_CONTRACT", "Verification output exceeded the bounded response contract.");
    // Model output remains untrusted: inspect locally, persist only a digest, and never execute it.
    verification = {
      status: response.status === "completed" && response.outputText.includes(context.request.verification.expectedSubstring) ? "passed" : "failed",
      at: timestamp(dependencies), version, responseId: response.id, outputSha256: digest(response.outputText)
    };
    state.verification = verification;
    return response.id;
  });
  if (digest(before) !== digest(after)) stop("REMOTE_DRIFT", "Remote version or endpoint drifted during the verification invocation.");
  assertVersion(context, after, version);
  assertPinned(after, version, context.request.runtime.kind);
  if (verification.status !== "passed") stop("PROBE_FAILED", "Bounded invocation did not complete with the reviewed expected text.");
  state.status = "verified";
  state.code = null;
  state.message = "Pinned immutable version and one bounded endpoint invocation were verified. No tenant or marketplace publication was performed.";
  await saveState(context.root, plan, state, dependencies);
}

async function executionFailure(action, context, plan, state, error, dependencies) {
  const safe = safeError(error);
  state.status = action === "rollback" ? "rollback-partial" : "partial";
  state.code = safe.code;
  state.message = `${safe.message} Preserve the journal and reconcile before retrying; accepted operations will not be replayed.`;
  await saveState(context.root, plan, state, dependencies);
  return persistResult(context.root, resultFor(action, context, plan, state));
}

async function applyDeployment(root, options, dependencies) {
  const { context, plan } = await readReviewed(root, options, dependencies, "apply");
  let state = await loadState(root, plan);
  if (state && state.status !== "verified") stop("RUN_RECONCILIATION_REQUIRED", "A partial, interrupted or rolled-back run cannot be replayed; reconcile it and review a new plan.");
  const provider = await providerFor(context, dependencies);
  const initial = await checkedProbe(provider, state ? state.observedRemoteSha256 : plan.remoteSha256);
  if (state) {
    assertVersion(context, initial, state.activeVersion);
    assertPinned(initial, state.activeVersion, context.request.runtime.kind);
    return persistResult(root, resultFor("apply", context, plan, state));
  }
  const reason = remoteReadiness(context, initial);
  if (reason) stop("REMOTE_UNAVAILABLE", reason);
  const startedAt = timestamp(dependencies);
  state = {
    schemaVersion: "1.0.0", planId: plan.planId, planSha256: plan.planSha256, requestSha256: plan.requestSha256,
    packageSha256: plan.packageSha256, projectRoot: root, target: plan.target, agentId: plan.agentId, release: plan.release,
    status: "applying", previousVersion: plan.rollback.previousVersion, createdVersion: null,
    activeVersion: initial.activeVersion, identityId: initial.identityId, baselineSha256: plan.remoteSha256,
    observedRemoteSha256: digest(initial), startedAt, updatedAt: startedAt, journal: [],
    verification: { status: "not-run", at: null, version: null, responseId: null, outputSha256: null },
    code: null, message: "Approved execution started; no success is implied until bounded invocation is verified."
  };
  await immutableFile(root, `${runDirectory(plan)}/journal.jsonl`, "");
  await saveState(root, plan, state, dependencies);
  try {
    // Operations are derived here from trusted code and revalidated request bytes, never dispatched from plan content.
    if (context.request.mode !== "promote") {
      const afterCreate = await perform("create-version", context, plan, state, provider, options, dependencies, async () => {
        const created = await provider.createVersion(context.definition, { pso_package: context.packageSha256, pso_release: context.request.release });
        if (!created || !/^[1-9][0-9]{0,15}$/.test(created.version ?? "") || typeof created.id !== "string"
            || !/^[a-zA-Z0-9][a-zA-Z0-9:._-]{0,255}$/.test(created.id)) stop("PROVIDER_CONTRACT", "Creation did not return a valid immutable version identifier.");
        rejectSecrets(created.id);
        state.createdVersion = created.version;
        return { id: created.id, version: created.version };
      });
      assertVersion(context, afterCreate, state.createdVersion, { requireReady: context.request.runtime.kind !== "hosted" });
      if (context.request.mode !== "create" && afterCreate.activeVersion !== initial.activeVersion) stop("UNEXPECTED_ACTIVATION", "Version creation changed the previously pinned active selector.");
      if (context.request.runtime.kind === "hosted") await waitForHostedVersion(context, plan, state, provider, options, dependencies, afterCreate);
    } else if (context.request.runtime.kind === "hosted") await waitForHostedVersion(context, plan, state, provider, options, dependencies, initial);
    if (context.request.mode === "create") {
      await perform("configure-endpoint", context, plan, state, provider, options, dependencies, () => provider.configureEndpoint());
    }
    const version = state.createdVersion ?? context.request.foundry.promoteVersion;
    const afterPin = await perform("pin-version", context, plan, state, provider, options, dependencies, async () => {
      await provider.pinVersion(version);
      return version;
    });
    assertVersion(context, afterPin, version);
    assertPinned(afterPin, version, context.request.runtime.kind);
    await invokeProbe(context, plan, state, provider, options, dependencies);
    return persistResult(root, resultFor("apply", context, plan, state));
  } catch (error) { return executionFailure("apply", context, plan, state, error, dependencies); }
}

async function verifyDeployment(root, options, dependencies) {
  const { context, plan } = await readReviewed(root, options, dependencies, "verify");
  const state = await loadState(root, plan);
  if (!state || !state.observedRemoteSha256 || !state.journal.some((entry) => entry.operation === "pin-version" && entry.status === "accepted")
      || ["applying", "rolled-back", "rollback-partial"].includes(state.status)) stop("EXECUTION_EVIDENCE_REQUIRED", "No accepted pinned-deployment evidence exists for verification.");
  const provider = await providerFor(context, dependencies);
  await checkedProbe(provider, state.observedRemoteSha256);
  try {
    await invokeProbe(context, plan, state, provider, options, dependencies);
    return persistResult(root, resultFor("verify", context, plan, state));
  } catch (error) { return executionFailure("verify", context, plan, state, error, dependencies); }
}

async function rollbackDeployment(root, options, dependencies) {
  const { context, plan } = await readReviewed(root, options, dependencies, "rollback");
  const state = await loadState(root, plan);
  if (!state || !state.previousVersion || !state.observedRemoteSha256 || plan.rollback.strategy !== "repin") stop("ROLLBACK_EVIDENCE_REQUIRED", "Rollback requires accepted execution evidence, a known remote snapshot and the captured prior pinned version; reconcile manually otherwise.");
  if (state.status === "applying" || state.status === "rollback-partial") stop("RUN_RECONCILIATION_REQUIRED", "Interrupted rollback requires manual reconciliation before further mutations.");
  const provider = await providerFor(context, dependencies);
  const remote = await checkedProbe(provider, state.observedRemoteSha256);
  if (state.status === "rolled-back") {
    assertPinned(remote, state.previousVersion, context.request.runtime.kind);
    return persistResult(root, resultFor("rollback", context, plan, state));
  }
  const prior = plan.remote.versions.find((version) => version.version === state.previousVersion);
  const currentPrior = remote.versions.find((version) => version.version === state.previousVersion);
  if (!prior || stableJson(prior) !== stableJson(currentPrior)) stop("ROLLBACK_DRIFT", "Prior immutable version changed or disappeared; rollback is blocked.");
  try {
    const after = await perform("rollback-pin", context, plan, state, provider, options, dependencies, async () => {
      await provider.pinVersion(state.previousVersion);
      return state.previousVersion;
    });
    assertPinned(after, state.previousVersion, context.request.runtime.kind);
    state.status = "rolled-back";
    state.code = null;
    state.message = "Prior immutable version was repinned and its selector verified. Created versions and identity were retained; no deletion or catalog operation occurred. Only routing was reversed: invocations, charges, identity or permission changes, and channel effects were not undone.";
    state.verification = { status: "not-run", at: null, version: null, responseId: null, outputSha256: null };
    await saveState(root, plan, state, dependencies);
    return persistResult(root, resultFor("rollback", context, plan, state));
  } catch (error) { return executionFailure("rollback", context, plan, state, error, dependencies); }
}

async function deploymentStatus(root, options, dependencies) {
  if (!options.plan) {
    const latest = await readJson(root, stateReport, { optional: true });
    if (!latest) return resultFor("status");
    const state = validateContract("state", latest.value);
    options = { ...options, plan: `${runDirectory(state)}/plan.json` };
  }
  let reviewed;
  try { reviewed = await readReviewed(root, options, dependencies, "status"); }
  catch (error) {
    const safe = safeError(error);
    return resultFor("status", null, null, null, { status: "unverified", code: safe.code, message: safe.message });
  }
  const { context, plan } = reviewed;
  const state = await loadState(root, plan);
  if (!state) return resultFor("status", context, plan);
  try {
    const provider = await providerFor(context, dependencies);
    const remote = await checkedProbe(provider, state.observedRemoteSha256);
    if (state.status === "verified") { assertVersion(context, remote, state.activeVersion); assertPinned(remote, state.activeVersion, context.request.runtime.kind); }
    if (state.status === "rolled-back") assertPinned(remote, state.previousVersion, context.request.runtime.kind);
    return resultFor("status", context, plan, state);
  } catch (error) {
    const safe = safeError(error);
    return resultFor("status", context, plan, state, { status: "drifted", verifiedAt: null, code: safe.code, message: safe.message });
  }
}

export async function runDeployment(command, options = {}, dependencies = {}) {
  try { return await dispatch(command, options, dependencies); }
  catch (error) { throw safeError(error); }
}

async function dispatch(command, options, dependencies) {
  if (command === "capabilities") return getCapabilities();
  const commands = ["package", "plan", "apply", "verify", "status", "rollback"];
  if (!commands.includes(command)) stop("COMMAND_UNKNOWN", "Unknown deployment command; use help.");
  const root = await projectRoot(options.project, dependencies);
  if (command === "status") {
    const record = options.plan ? await readJson(root, relativePath(options.plan))
      : await readJson(root, stateReport, { optional: true });
    if (record && isPlatformTarget(record.value.target)) return runPlatform(command, root, options, dependencies);
    return deploymentStatus(root, options, dependencies);
  }
  return withProjectLock(root, async () => {
    if (command === "package") {
      if (!options.request) stop("REQUEST_REQUIRED", "Packaging requires --request with a target-project-relative request JSON.");
      const context = await loadContext(root, options.request);
      await writePackage(context);
      return persistResult(root, resultFor("package", context, null, null, {
        status: "packaged", message: "Deterministic digest-bound package written locally. No provider call, deployment, tool grant or publication occurred."
      }));
    }
    if (command === "plan") return planDeployment(root, options, dependencies);
    if (options.plan) {
      const plan = (await readJson(root, relativePath(options.plan))).value;
      if (isPlatformTarget(plan.target)) return runPlatform(command, root, options, dependencies);
    }
    if (command === "apply") return applyDeployment(root, options, dependencies);
    if (command === "verify") return verifyDeployment(root, options, dependencies);
    return rollbackDeployment(root, options, dependencies);
  });
}

export const help = `Governed agent deployment
  pso agent package --project <target> --request <relative.json> [--json]
  pso agent deploy capabilities [--json]
  pso agent deploy plan --project <target> --request <relative.json> [--ttl-minutes 1..60] [--json]
  pso agent deploy apply --project <target> --plan <relative.json> --plan-digest <sha256>
      --accept-risk --approve <comma-separated-plan-approval-classes> [--json]
  pso agent deploy verify --project <target> --plan <relative.json> --plan-digest <sha256>
      --accept-risk --approve endpoint-invocation [--json]
  pso agent deploy rollback --project <target> --plan <relative.json> --plan-digest <sha256>
      --accept-risk --approve rollback-routing [--json]
  pso agent deploy status --project <target> [--plan <relative.json>] [--json]

Default reports: reports/agent-deployment-{plan,result,state}.json.
Requests and plans contain data only, never commands, credentials or arbitrary execution URLs.
Foundry prompt and prebuilt hosted v1 Commercial are preview-only, pinned and explicitly approval-gated.
Hosted execution requires an allowlisted OCI digest, SBOM, tested source version and fresh test evidence.
Government is unavailable; other control planes retain their declared provider-specific gates.
No login, cloud/account switching, dependency installation, RBAC, deletion or publication is performed.
`;

function parseArgs(argv) {
  const command = argv[0] ?? "help";
  const options = {};
  const boolean = new Map([["accept-risk", "acceptRisk"], ["json", "json"]]);
  const valued = new Map([["project", "project"], ["request", "request"], ["plan", "plan"], ["plan-digest", "planDigest"], ["approve", "approve"], ["ttl-minutes", "ttlMinutes"]]);
  for (let index = 1; index < argv.length; index++) {
    const value = argv[index];
    if (!value.startsWith("--")) stop("ARGUMENT_INVALID", "Only named deployment options are accepted.");
    const key = value.slice(2);
    if (/token|secret|password|api-key|connection-string|credential/i.test(key)) stop("CREDENTIAL_REJECTED", "Credential parameters are prohibited; use an existing Azure CLI session.");
    const field = boolean.get(key) ?? valued.get(key);
    if (!field || Object.hasOwn(options, field)) stop("ARGUMENT_INVALID", "Unknown or duplicate deployment option.");
    if (boolean.has(key)) options[field] = true;
    else {
      const next = argv[++index];
      if (!next || next.startsWith("--")) stop("ARGUMENT_INVALID", "A required deployment option value is missing.");
      options[field] = field === "approve" ? next.split(",") : field === "ttlMinutes" ? Number(next) : next;
    }
  }
  const allowed = {
    package: ["project", "request", "json"], plan: ["project", "request", "json", "ttlMinutes"],
    apply: ["project", "plan", "planDigest", "acceptRisk", "approve", "json"],
    verify: ["project", "plan", "planDigest", "acceptRisk", "approve", "json"],
    rollback: ["project", "plan", "planDigest", "acceptRisk", "approve", "json"],
    status: ["project", "plan", "json"], capabilities: ["json"], help: ["json"]
  };
  if (!allowed[command] || Object.keys(options).some((key) => !allowed[command].includes(key))) stop("ARGUMENT_INVALID", "Unsupported command or option for this operation.");
  return { command, options };
}

export async function main(argv = process.argv.slice(2), dependencies = {}) {
  try {
    if (!argv.length || ["help", "--help", "-h"].includes(argv[0])) { console.log(help); return 0; }
    const { command, options } = parseArgs(argv);
    const result = await runDeployment(command, options, dependencies);
    console.log(options.json || command === "capabilities" ? jsonBytes(result).trimEnd()
      : `${result.status}: ${result.message ?? result.reason}\n${result.planSha256 ? `Review digest: ${result.planSha256}` : result.packageSha256 ? `Package digest: ${result.packageSha256}` : ""}`);
    return ["partial", "rollback-partial", "unverified", "drifted", "manual-handoff", "unavailable", "publication-submitted", "pending-admin-approval", "verification-required"].includes(result.status) ? 2 : 0;
  } catch (error) {
    const safe = safeError(error);
    console.error(JSON.stringify({ status: "blocked", code: safe.code, message: safe.message }));
    return 1;
  }
}

if (process.argv[1] && import.meta.url === pathToFileURL(path.resolve(process.argv[1])).href) {
  process.exitCode = await main();
}
