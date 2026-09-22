import { digest, implementationDigest, jsonBytes, rejectSecrets, safeError, stableJson, stop, validateContract, validateContractPart } from "./contracts.mjs";
import { appendRecord, immutableFile, makeDirectory, readBytes, readJson, relativePath, writeAtomic } from "./files.mjs";
import { loadContext, verifyPackage, writePackage } from "./package.mjs";
import { getCapabilities } from "./providers/registry.mjs";
import { createMicrosoft365Provider } from "./providers/microsoft365.mjs";
import { assertPlatformProvider, validatePlatformOutcome, validatePlatformSnapshot } from "./providers/platform-contract.mjs";

const fields = {
  "microsoft-365-copilot-and-teams": "microsoft365",
  "copilot-studio": "copilotStudio",
  "microsoft-365-agents-toolkit": "agentsToolkit"
};
const operationTable = {
  "m365-bot": ["bot", "bot-resource-change", "Create or verify the approved single-tenant Bot Service bridge; never overwrite another identity or tenant."],
  "m365-channel": ["channel", "teams-channel-change", "Create or verify only the enabled MsTeamsChannel under the approved bot."],
  "m365-endpoint": ["endpoint", "endpoint-authorization", "Preserve all endpoint protocols, authorization entries and pinned routing while adding the reviewed Activity/Bot scheme."],
  "m365-publish": ["publish", "publication-submission", "Submit the reviewed v1 app metadata; submission is not catalog acceptance or conversation verification."],
  "pac-pack": ["pack", "local-package-execution", "Run the reviewed local PAC pack operation and validate its retained package artifact."],
  "pac-import": ["import", "solution-import", "Import only the reviewed solution/settings into the explicit environment; do not publish implicitly."],
  "pac-publish": ["publish", "agent-publication", "Submit the reviewed Copilot Studio agent publication, separately from import."],
  "pac-export": ["export", "solution-export", "Export an exportable source solution into the approved target-project artifact path."],
  "atk-provision": ["provision", "toolkit-provision", "Execute only the reviewed frozen Toolkit provision lifecycle; code execution requires its separate approval."],
  "atk-deploy": ["deploy", "toolkit-deploy", "Execute only the reviewed frozen Toolkit deploy lifecycle; this does not publish a catalog listing."],
  "atk-package": ["package", "toolkit-package", "Run the explicit Toolkit package operation and validate the package digest and identity."],
  "atk-publish": ["publish", "toolkit-publish", "Submit the reviewed retained ZIP through Toolkit's direct package handler, without running a provision/deploy lifecycle or claiming tenant-admin acceptance."],
  "atk-update": ["update", "toolkit-update", "Update Developer Portal registration from the reviewed retained ZIP through the direct package handler; do not claim tenant catalog approval."]
};
const allApprovals = new Set([...Object.values(operationTable).map((item) => item[1]), "tenant-publication", "public-activity-exposure", "reviewed-code-execution", "rollback-routing"]);
const prefix = (plan) => `reports/agent-deployment/${plan.agentId}/runs/${plan.planId}`;
const clock = (deps) => (deps.now ? deps.now() : new Date()).toISOString();
const hashPlan = ({ planSha256, ...value }) => digest(value);
export const hasPlatformConfiguration = (request) => Boolean(fields[request.target] && request[fields[request.target]]);
export const isPlatformTarget = (target) => Object.hasOwn(fields, target);

function workspaceFor(context) {
  const tool = context.request.copilotStudio ? "pac" : context.request.agentsToolkit ? "atk" : "microsoft365";
  return `reports/agent-deployment/platform-work/${tool}/${context.packageSha256}`;
}

function nativeContext(context) {
  const field = context.request.copilotStudio ? "copilotStudio" : context.request.agentsToolkit ? "agentsToolkit" : null;
  if (!field) return context;
  const config = { ...context.request[field] };
  for (const output of ["outputDirectory", "outputFile"]) {
    if (config[output] !== undefined) config[output] = `${context.workDirectory}/${relativePath(config[output])}`;
  }
  return { ...context, request: { ...context.request, [field]: config } };
}

function stepsFor(request) {
  const operations = request.microsoft365 ? ["m365-bot", "m365-channel", "m365-endpoint", "m365-publish"]
    : request.copilotStudio ? [`pac-${request.copilotStudio.operation}`] : [`atk-${request.agentsToolkit.operation}`];
  return operations.map((operation) => {
    const item = operationTable[operation];
    if (!item) stop("PLATFORM_OPERATION", "The requested platform operation is not supported.");
    return {
      operation, approval: operation === "m365-publish" && request.microsoft365.publishScope === "Tenant" ? "tenant-publication" : item[1],
      executable: true,
      description: operation === "pac-import"
        ? `Import only the reviewed ${request.copilotStudio.solutionType ?? "managed"} solution/settings into the explicit ${request.environment} environment; do not publish implicitly.`
        : item[2]
    };
  });
}

function approvalsFor(request) {
  return [...new Set([
    ...stepsFor(request).map((step) => step.approval),
    ...(request.microsoft365?.enableM365PublicEndpoint ? ["public-activity-exposure"] : []),
    ...(request.agentsToolkit && ["provision", "deploy"].includes(request.agentsToolkit.operation) ? ["reviewed-code-execution"] : [])
  ])];
}

function localOnly(request) {
  return request.copilotStudio?.operation === "pack" || request.agentsToolkit?.operation === "package";
}

function readiness(context, now) {
  const { request, distribution } = context;
  if (request.copilotStudio?.operation === "import" && request.copilotStudio.solutionType === "unmanaged"
      && request.environment !== "development") return "Unmanaged Copilot Studio import requires an explicit development environment; staging, production and missing stage are blocked.";
  if (request.cloud === "AzureUSGovernment") return "AzureUSGovernment remains unverified; no alternate routing is inferred.";
  if (distribution && (distribution.environment !== request.environment || distribution.dataBoundary !== request.data.boundary)) return "The provider environment or data boundary differs from the validated blueprint.";
  if (distribution?.microsoft365Audience && distribution.microsoft365Audience !== request.audience) return "The requested Microsoft 365 audience differs from reviewed distribution intent.";
  if (!localOnly(request) && request.data.boundary === "project-local") return "Project-local data cannot enter an external provider operation.";
  if (request.rollback.strategy !== "manual" || request.rollback.version !== null) return "This platform has no transactional rollback; retain artifacts for separately reviewed recovery.";
  if (request.microsoft365) {
    const cfg = request.microsoft365;
    const proof = context.publicationTestEvidence;
    if (request.cloud !== "AzureCloud" || !request.acceptPreview) return "Microsoft 365 publication requires the reviewed Commercial preview contract.";
    if (distribution?.versionPolicy === "latest") return "Publication requires an explicitly pinned distribution policy.";
    if (!request.data.residency.includes(cfg.location) || !request.data.residency.includes("global")) return "Publication requires review of both the Foundry region and global Bot/Microsoft365 processing; regional guarantees are not inferred.";
    if ((cfg.publishScope === "Tenant") !== (request.audience === "tenant")) return "The app publish scope and reviewed audience do not match.";
    if (!proof || Date.parse(proof.verifiedAt) > Date.parse(now) || Date.parse(proof.expiresAt) <= Date.parse(now)
        || Date.parse(now) - Date.parse(proof.verifiedAt) > 86_400_000 || Date.parse(proof.expiresAt) <= Date.parse(proof.verifiedAt)) return "The pinned-agent verification receipt is missing, expired or older than 24 hours.";
  } else if (request.runtime.kind !== "application") return "Native application/solution adapters require runtime.kind application; prompt/hosted labels cannot grant application authority.";
  return null;
}

async function bindProfile(context) {
  const profile = await readJson(context.root, ".azure/environment.json", { optional: !context.request.microsoft365 });
  const allowlist = await readJson(context.root, ".azure/agent-deployment-allowlist.json", { optional: !context.request.microsoft365 });
  if (profile) rejectSecrets(profile.value);
  if (allowlist) rejectSecrets(allowlist.value);
  if (profile?.value.cloud === "AzureUSGovernment") stop("CLOUD_UNVERIFIED", "The saved project cloud is unverified; no cloud switching is permitted.");
  if (!localOnly(context.request) && profile?.value.mutationPolicy === "read-only") stop("POLICY_DENIED", "The project profile prohibits external mutation.");
  if (context.request.microsoft365) {
    const cfg = context.request.microsoft365;
    if (profile.value.cloud !== "AzureCloud" || profile.value.location !== cfg.location
        || profile.value.environmentName !== context.request.environment || profile.value.mutationPolicy !== "approval-required") stop("AZURE_PROFILE_MISMATCH", "The saved project profile differs from the reviewed publication environment.");
    validateContractPart("request", "endpointAllowlist", allowlist.value);
    if (!allowlist.value.projectEndpoints.includes(cfg.projectEndpoint) || !allowlist.value.botResourceGroups?.includes(cfg.bot.resourceGroup)) stop("PUBLICATION_SCOPE", "The exact Foundry endpoint and Bot resource group must be independently allowlisted.");
  }
  return {
    profile: profile?.value ?? null,
    profileSha256: digest({ profile: profile ? digest(profile.bytes) : null, allowlist: allowlist ? digest(allowlist.bytes) : null })
  };
}

async function providerFor(context, dependencies) {
  context = nativeContext(context);
  if (dependencies.providerFactory) return assertPlatformProvider(await dependencies.providerFactory(context));
  if (context.request.microsoft365) return assertPlatformProvider(await createMicrosoft365Provider(context, dependencies));
  const module = context.request.copilotStudio ? await import("./providers/pac.mjs") : await import("./providers/atk.mjs");
  const config = context.request.copilotStudio ?? context.request.agentsToolkit;
  module.validateConfig(config);
  return assertPlatformProvider(await (context.request.copilotStudio ? module.createPacProvider : module.createAtkProvider)(context, dependencies));
}

function buildPlan(context, remote, evidenceSha256, generatedAt, expiresAt, reason) {
  const request = context.request;
  const steps = reason ? [] : stepsFor(request);
  const body = {
    schemaVersion: "1.0.0", generatedAt, expiresAt, status: reason ? "unavailable" : "review-required",
    projectRoot: context.root, requestPath: context.requestPath, requestSha256: context.requestSha256,
    blueprintSha256: request.blueprint.sha256, packagePath: context.packagePath, packageSha256: context.packageSha256,
    registrySha256: digest(getCapabilities()), implementationSha256: implementationDigest(), profileSha256: context.profileSha256 ?? null,
    target: request.target, agentId: context.blueprint.id, release: request.release, adapter: context.capability.id,
    remote: remote ?? null, remoteSha256: remote ? digest(remote) : null, providerEvidenceSha256: evidenceSha256 ?? null,
    steps, requiredApprovals: reason ? [] : approvalsFor(request),
    permissions: request.microsoft365
      ? ["Existing matching Entra CLI session and Foundry permissions for the exact agent.", "Microsoft.BotService must already be registered; the approved resource group must exist.", "Bot/Teams resource changes require appropriate resource-group permissions. No role assignments or tenant consents are performed."]
      : ["Existing provider authentication and the explicit reviewed environment.", "Installed pinned CLI and prerequisites for the selected operation. No login, profile selection or installation is performed.",
        `Native outputDirectory/outputFile values are workspace-relative. The reviewed workspace is ${workspaceFor(context)}; source input paths remain target-project-relative.`],
    blastRadius: request.microsoft365 ? "The existing pinned agent's endpoint configuration, the named allowlisted Bot/Teams bridge, and one versioned Microsoft365 app submission. This is not agent deployment or tenant-admin acceptance."
      : "Only the explicit native operation and reviewed application/solution working tree. Import, provisioning, deployment and publication are separate operations.",
    costAndQuota: ["Operator review of provider quota, licensing, pricing and data boundaries remains required; no retail-price or capacity guarantee is inferred.",
      ...(request.microsoft365 ? ["Bot Service uses the documented F0/global bridge shape. Activity public exposure, when selected, requires its own approval. Publication does not invoke a model."]
        : request.agentsToolkit && ["provision", "deploy"].includes(request.agentsToolkit.operation)
          ? ["Toolkit provision/deploy lifecycle execution may create billable resources and execute reviewed code; operation and code approvals are separate."]
          : ["Only the reviewed artifact operation is authorized. Retained-ZIP publish/update does not authorize lifecycle execution or hidden dependency installation."])],
    identityChanges: ["Use only the reviewed existing identities. No role assignments, tenant consent, auth switching or credential persistence is authorized."],
    verification: "Read-only provider checks plus accepted identifiers and operation-specific artifact evidence. No model invocation. Submission, import, packaging and deployment do not prove catalog acceptance or conversation health.",
    rollback: { strategy: "manual", previousVersion: null, approval: "rollback-routing", procedure: "No transactional rollback or unpublish is implied. Retain accepted IDs and prior artifacts; use a separately reviewed compatible recovery plan. Never substitute destructive uninstall for rollback." },
    limitations: context.capability.limitations,
    reason: reason ?? "Reviewed provider operation is ready for explicit digest-bound class approvals. Plans never execute editable command strings."
  };
  const plan = { ...body, planId: `DEP-${digest(body).slice(0, 32)}` };
  plan.planSha256 = hashPlan(plan);
  return validateContract("plan", plan);
}

export async function planPlatform(context, options, deps) {
  await writePackage(context);
  const generatedAt = clock(deps);
  const ttl = options.ttlMinutes ?? 60;
  if (!Number.isSafeInteger(ttl) || ttl < 1 || ttl > 60) stop("PLAN_TTL_INVALID", "Plan lifetime must be between one and 60 minutes.");
  let reason = readiness(context, generatedAt);
  let remote = null;
  let providerEvidence = null;
  context.workDirectory = workspaceFor(context);
  if (!reason) {
    try {
      Object.assign(context, await bindProfile(context));
      const provider = await providerFor(context, deps);
      remote = validatePlatformSnapshot(await provider.probe());
      if (remote.target !== context.request.target) stop("PLATFORM_READINESS", "The provider did not establish the reviewed target binding.");
      if (provider.evidence) {
        providerEvidence = await provider.evidence();
        rejectSecrets(providerEvidence);
        if (Buffer.byteLength(jsonBytes(providerEvidence)) > 262144) stop("PLATFORM_EVIDENCE_LIMIT", "Provider review evidence exceeds the bounded size.");
      }
    } catch (error) { reason = safeError(error).message; }
  }
  const plan = buildPlan(context, remote, providerEvidence ? digest(providerEvidence) : null, generatedAt, new Date(Date.parse(generatedAt) + ttl * 60_000).toISOString(), reason);
  await immutableFile(context.root, `${prefix(plan)}/plan.json`, jsonBytes(plan));
  if (providerEvidence) await immutableFile(context.root, `${prefix(plan)}/provider-evidence.json`, jsonBytes(providerEvidence));
  await writeAtomic(context.root, "reports/agent-deployment-plan.json", jsonBytes(plan));
  return plan;
}

function approvals(options, plan, action) {
  if (["status", "verify"].includes(action)) return;
  const required = action === "rollback" ? ["rollback-routing"] : plan.requiredApprovals;
  if (options.acceptRisk !== true || !Array.isArray(options.approve) || options.approve.some((item) => !allApprovals.has(item))
      || required.some((item) => !options.approve.includes(item))) stop("APPROVAL_REQUIRED", "Every platform operation requires its explicit class approvals and --accept-risk.");
  if (options.planDigest !== plan.planSha256) stop("PLAN_DIGEST_APPROVAL", "Approval must name the exact reviewed --plan-digest.");
}

function lifetime(plan, deps, readOnly = false) {
  const now = Date.parse(clock(deps));
  if (Date.parse(plan.expiresAt) <= Date.parse(plan.generatedAt) || Date.parse(plan.expiresAt) - Date.parse(plan.generatedAt) > 3_600_000
      || Date.parse(plan.generatedAt) > now + 30_000 || (!readOnly && Date.parse(plan.expiresAt) <= now)) stop("PLAN_EXPIRED", "The review window expired or is invalid; review a new mutation plan.");
}

async function reviewed(root, options, deps, action) {
  if (!options.plan) stop("PLAN_REQUIRED", "Use the unchanged target-relative reviewed --plan.");
  const plan = validateContract("plan", (await readJson(root, relativePath(options.plan))).value);
  rejectSecrets(plan);
  if (plan.projectRoot !== root || hashPlan(plan) !== plan.planSha256) stop("PLAN_TAMPERED", "Plan project binding or digest changed.");
  if (plan.status !== "review-required") stop("NONEXECUTING_TARGET", "Manual or unavailable platform plans cannot execute.");
  approvals(options, plan, action);
  lifetime(plan, deps, ["verify", "status"].includes(action));
  const context = await loadContext(root, plan.requestPath);
  if (!hasPlatformConfiguration(context.request) || context.requestSha256 !== plan.requestSha256 || context.packageSha256 !== plan.packageSha256) stop("INPUT_DRIFT", "Reviewed platform request or package bytes changed.");
  await verifyPackage(context);
  Object.assign(context, await bindProfile(context));
  if (context.profileSha256 !== plan.profileSha256 || digest(getCapabilities()) !== plan.registrySha256 || implementationDigest() !== plan.implementationSha256) stop("ENVIRONMENT_DRIFT", "Profile, allowlist, registry or implementation changed after review.");
  const reason = readiness(context, ["verify", "status"].includes(action) ? plan.generatedAt : clock(deps));
  if (reason) stop("PLATFORM_UNAVAILABLE", reason);
  const expected = buildPlan(context, plan.remote, plan.providerEvidenceSha256, plan.generatedAt, plan.expiresAt, null);
  if (stableJson(expected) !== stableJson(plan)) stop("PLAN_TAMPERED", "Platform operations do not match trusted code and the reviewed request.");
  if (!(await readBytes(root, `${prefix(plan)}/plan.json`)).equals(Buffer.from(jsonBytes(plan)))) stop("PLAN_TAMPERED", "Immutable run plan differs from review.");
  if (plan.providerEvidenceSha256) {
    const evidence = (await readJson(root, `${prefix(plan)}/provider-evidence.json`)).value;
    rejectSecrets(evidence);
    if (digest(evidence) !== plan.providerEvidenceSha256) stop("EVIDENCE_DRIFT", "Provider review evidence changed.");
  }
  context.workDirectory = workspaceFor(context);
  return { plan, context };
}

async function readState(root, plan) {
  const data = await readJson(root, `${prefix(plan)}/state.json`, { optional: true });
  if (!data) return null;
  const state = validateContract("state", data.value);
  rejectSecrets(state);
  if (state.planSha256 !== plan.planSha256 || state.projectRoot !== root || state.planId !== plan.planId
      || state.requestSha256 !== plan.requestSha256 || state.packageSha256 !== plan.packageSha256 || state.target !== plan.target
      || state.agentId !== plan.agentId || state.release !== plan.release || state.baselineSha256 !== plan.remoteSha256) stop("STATE_TAMPERED", "Platform state is not bound to this reviewed run.");
  const journal = (await readBytes(root, `${prefix(plan)}/journal.jsonl`)).toString("utf8");
  if (journal !== state.journal.map((entry) => `${JSON.stringify(entry)}\n`).join("")
      || state.journal.some((entry, index) => entry.sequence !== index + 1)) stop("JOURNAL_DIVERGED", "The durable journal diverged from state; reconcile before execution.");
  for (const receipt of state.platformReceipts ?? []) {
    if (!state.journal.some((entry) => entry.operation === receipt.operation && ["accepted", "completed"].includes(entry.status)
        && entry.responseId === receipt.outcome.responseId)) stop("STATE_TAMPERED", "A platform receipt lacks accepted execution evidence.");
  }
  return state;
}

async function save(root, plan, state, deps) {
  state.updatedAt = clock(deps);
  rejectSecrets(state);
  validateContract("state", state);
  await writeAtomic(root, `${prefix(plan)}/state.json`, jsonBytes(state));
  await writeAtomic(root, "reports/agent-deployment-state.json", jsonBytes(state));
}

async function event(context, plan, state, operation, status, id, code, deps) {
  const entry = { sequence: state.journal.length + 1, at: clock(deps), operation, status, responseId: id, version: null, code };
  validateContract("state", { ...state, journal: [...state.journal, entry] });
  rejectSecrets(entry);
  await appendRecord(context.root, `${prefix(plan)}/journal.jsonl`, entry);
  state.journal.push(entry);
  await save(context.root, plan, state, deps);
}

function result(action, plan, state, overrides = {}) {
  return validateContract("result", {
    schemaVersion: "1.0.0", action, status: state?.status === "applying" ? "unverified" : state?.status ?? "unverified",
    target: plan.target, agentId: plan.agentId, planId: plan.planId, planSha256: plan.planSha256,
    packagePath: plan.packagePath, packageSha256: plan.packageSha256, statePath: state ? `${prefix(plan)}/state.json` : null,
    activeVersion: null, previousVersion: null, identityId: null, verifiedAt: null,
    platformOutcome: state?.platformOutcome ?? null, code: state?.code ?? null,
    message: state?.message ?? "No accepted platform execution evidence exists; resource presence is not proof of this deployment.",
    ...overrides
  });
}

async function writeResult(root, value) {
  rejectSecrets(value);
  await writeAtomic(root, "reports/agent-deployment-result.json", jsonBytes(value));
  return value;
}

async function probe(provider, expected = null) {
  const snapshot = validatePlatformSnapshot(await provider.probe());
  if (expected !== null && digest(snapshot) !== expected) stop("REMOTE_DRIFT", "Provider state drifted from reviewed or accepted evidence.");
  return snapshot;
}

function checkOutcome(context, step, value) {
  validatePlatformOutcome(value);
  const operation = operationTable[step.operation][0];
  if (["pack", "package", "import", "export", "provision", "deploy", "update"].includes(operation) && value.publicationVerified) stop("PUBLICATION_CLAIM", "A local/import/deploy operation cannot prove publication.");
  if (step.operation === "m365-publish" && (value.publicationVerified
      || value.status !== (context.request.microsoft365.publishScope === "Tenant" ? "pending-admin-approval" : "publication-submitted"))) stop("PUBLICATION_CLAIM", "M365 submission must preserve its explicit admin/catalog verification boundary.");
}

export async function runPlatform(action, root, options, deps) {
  if (action === "status" && !options.plan) {
    const latest = await readJson(root, "reports/agent-deployment-state.json", { optional: true });
    if (!latest) stop("EXECUTION_EVIDENCE_REQUIRED", "No local execution evidence exists.");
    const state = validateContract("state", latest.value);
    options = { ...options, plan: `${prefix(state)}/plan.json` };
  }
  const { context, plan } = await reviewed(root, options, deps, action);
  let state = await readState(root, plan);
  if (action === "rollback") stop("MANUAL_RECOVERY_REQUIRED", "This provider has no reviewed automatic rollback/unpublish. Retain accepted IDs and artifacts for separately approved compatible recovery.");
  if (action !== "apply" && !state) return result(action, plan, null);
  if (action === "apply" && state && ["partial", "applying", "rollback-partial"].includes(state.status)) stop("RUN_RECONCILIATION_REQUIRED", "An interrupted or partial platform run cannot replay mutations; reconcile it and review a new plan.");
  const provider = await providerFor(context, deps);
  if (action === "status") {
    try { await probe(provider, state.observedRemoteSha256); return result(action, plan, state); }
    catch (error) { const safe = safeError(error); return result(action, plan, state, { status: "drifted", code: safe.code, message: safe.message }); }
  }
  if (action === "verify") {
    if (!state.platformOutcome || ["partial", "applying"].includes(state.status)) stop("EXECUTION_EVIDENCE_REQUIRED", "Read-only verification requires an accepted completed operation receipt.");
    const current = await probe(provider);
    if (current.identitySha256 !== plan.remote.identitySha256) stop("IDENTITY_DRIFT", "Provider identity changed; verification is blocked.");
    const outcome = validatePlatformOutcome(await provider.verify(state.platformOutcome));
    const last = stepsFor(context.request).at(-1);
    checkOutcome(context, last, outcome);
    state.platformOutcome = { ...outcome, mutationAccepted: false };
    state.status = outcome.status;
    state.observedRemoteSha256 = digest(await probe(provider));
    state.message = `Read-only provider evidence: ${outcome.messageCode}. No model invocation or automatic admin approval occurred.`;
    await event(context, plan, state, "platform-verify", "completed", outcome.responseId, null, deps);
    return writeResult(root, result(action, plan, state));
  }
  const initial = await probe(provider, state ? state.observedRemoteSha256 : plan.remoteSha256);
  if (state) return writeResult(root, result(action, plan, state));
  const at = clock(deps);
  state = {
    schemaVersion: "1.0.0", planId: plan.planId, planSha256: plan.planSha256, requestSha256: plan.requestSha256,
    packageSha256: plan.packageSha256, projectRoot: root, target: plan.target, agentId: plan.agentId, release: plan.release,
    status: "applying", previousVersion: null, createdVersion: null, activeVersion: null, identityId: null,
    baselineSha256: plan.remoteSha256, observedRemoteSha256: digest(initial), startedAt: at, updatedAt: at,
    journal: [], platformOutcome: null, platformReceipts: [],
    verification: { status: "not-run", at: null, version: null, responseId: null, outputSha256: null },
    code: null, message: "Approved platform execution started; no publication success is implied."
  };
  await immutableFile(root, `${prefix(plan)}/journal.jsonl`, "");
  await makeDirectory(root, context.workDirectory);
  await save(root, plan, state, deps);
  try {
    for (const step of stepsFor(context.request)) {
      approvals(options, plan, "apply");
      await reviewed(root, options, deps, "apply");
      const before = await probe(provider, state.observedRemoteSha256);
      context.expectedSnapshotSha256 = digest(before);
      await event(context, plan, state, step.operation, "started", null, null, deps);
      state.observedRemoteSha256 = null;
      await save(root, plan, state, deps);
      let checkpointed = false;
      context.onAccepted = async (receipt) => {
        if (checkpointed) stop("DUPLICATE_CHECKPOINT", "The provider attempted to accept the same operation twice.");
        validatePlatformOutcome(receipt);
        if (!receipt.mutationAccepted) stop("CHECKPOINT_INVALID", "A mutation checkpoint must identify a genuinely accepted mutation.");
        state.platformReceipts.push({ operation: step.operation, outcome: receipt });
        checkpointed = true;
        await event(context, plan, state, step.operation, "accepted", receipt.responseId, null, deps);
      };
      try {
        const outcome = validatePlatformOutcome(await provider.execute(operationTable[step.operation][0], state.platformOutcome));
        checkOutcome(context, step, outcome);
        if (!checkpointed) {
          if (outcome.mutationAccepted) await context.onAccepted(outcome);
          else state.platformReceipts.push({ operation: step.operation, outcome });
        } else state.platformReceipts.at(-1).outcome = outcome;
        state.platformOutcome = outcome;
        const after = await probe(provider);
        if (after.identitySha256 !== before.identitySha256) stop("IDENTITY_DRIFT", "Provider identity changed during the accepted operation.");
        if (!outcome.mutationAccepted && digest(after) !== digest(before)) stop("REMOTE_DRIFT", "A no-op operation observed unrelated provider drift.");
        state.observedRemoteSha256 = digest(after);
        await event(context, plan, state, step.operation, "completed", outcome.responseId, null, deps);
        if (outcome.status === "verification-required") break;
      } catch (error) {
        const safe = safeError(error);
        await event(context, plan, state, step.operation, "failed", null, safe.code, deps);
        throw safe;
      } finally { context.onAccepted = undefined; }
    }
    state.status = state.platformOutcome.status;
    state.message = `Provider operation recorded: ${state.platformOutcome.messageCode}. Import/deploy/submission does not imply catalog acceptance or conversation health.`;
    await save(root, plan, state, deps);
    return writeResult(root, result("apply", plan, state));
  } catch (error) {
    const safe = safeError(error);
    state.status = "partial";
    state.code = safe.code;
    state.message = `${safe.message} Accepted IDs and the started journal are preserved; do not replay the mutation.`;
    await save(root, plan, state, deps);
    return writeResult(root, result("apply", plan, state));
  }
}
