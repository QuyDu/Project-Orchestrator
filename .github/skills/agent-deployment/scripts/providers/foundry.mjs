import { digest, rejectSecrets, stop, validateRequest } from "../contracts.mjs";
import { runAzureCli } from "./azure-cli.mjs";

const endpointPattern = /^https:\/\/[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?\.services\.ai\.azure\.com\/api\/projects\/[a-zA-Z0-9][a-zA-Z0-9_-]{0,63}$/;
const identifier = /^[a-zA-Z0-9][a-zA-Z0-9:._-]{0,255}$/;
const versionPattern = /^[1-9][0-9]{0,15}$/;
const uuid = /^[a-f0-9]{8}-(?:[a-f0-9]{4}-){3}[a-f0-9]{12}$/i;

export function validateEndpoint(endpoint) {
  if (typeof endpoint !== "string" || !endpointPattern.test(endpoint)) {
    stop("UNTRUSTED_ENDPOINT", "Foundry project endpoint must be an exact Commercial services.ai.azure.com project URL.");
  }
  return endpoint;
}

function responseId(value) {
  if (typeof value !== "string" || !identifier.test(value)) stop("PROVIDER_CONTRACT", "Provider returned an unsupported identifier.");
  rejectSecrets(value);
  return value;
}

async function boundedJson(response) {
  const limit = 2_097_152;
  if (Number(response.headers.get("content-length") ?? 0) > limit) stop("PROVIDER_RESPONSE_LIMIT", "Provider response exceeded the bounded contract size.");
  const reader = response.body?.getReader();
  if (!reader) stop("PROVIDER_CONTRACT", "Provider returned an empty response.");
  let length = 0;
  const chunks = [];
  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      length += value.length;
      if (length > limit) stop("PROVIDER_RESPONSE_LIMIT", "Provider response exceeded the bounded contract size.");
      chunks.push(Buffer.from(value));
    }
  } finally {
    await reader.cancel().catch(() => {});
    reader.releaseLock();
  }
  try { return JSON.parse(Buffer.concat(chunks).toString("utf8")); }
  catch { stop("PROVIDER_CONTRACT", "Provider returned invalid JSON; output was redacted."); }
}

export async function createFoundryProvider(context, dependencies = {}) {
  const { request, blueprint, profile } = context;
  const endpoint = validateEndpoint(request.foundry?.projectEndpoint);
  validateRequest(request);
  if (!request.acceptPreview) stop("PREVIEW_NOT_ACCEPTED", "The preview REST contract requires explicit request-level acceptance.");
  if (request.cloud !== "AzureCloud" || profile?.cloud !== "AzureCloud") stop("CLOUD_UNVERIFIED", "AzureUSGovernment and other clouds are unverified; no inferred Commercial routing is permitted.");
  if (request.foundry.apiVersion !== "v1" || !["prompt", "hosted"].includes(request.runtime?.kind)) stop("PROVIDER_UNAVAILABLE", "Only the pinned v1 prompt or reviewed immutable hosted contract is executable.");
  if (!/^[a-z][a-z0-9]*(?:-[a-z0-9]+)*$/.test(blueprint?.id ?? "") || blueprint.id.length > 63) stop("AGENT_ID_INVALID", "Invalid reviewed agent identity; Foundry names are limited to 63 characters.");
  if (!uuid.test(profile.subscription?.subscriptionId ?? "") || !uuid.test(profile.subscription?.tenantId ?? "")) {
    stop("AZURE_PROFILE_REQUIRED", "Record the intended Azure subscription and tenant in the target project's environment profile.");
  }
  const invokeCli = dependencies.runAzureCli ?? runAzureCli;
  const fetchImpl = dependencies.fetch ?? globalThis.fetch;
  const cli = await invokeCli(["version", "--output", "json"]);
  if (!/^\d+\.\d+\.\d+$/.test(cli?.["azure-cli"] ?? "")) stop("AZURE_CLI_CONTRACT", "Azure CLI version could not be established.");
  const cloud = await invokeCli(["cloud", "show", "--output", "json"]);
  if (cloud?.name !== profile.cloud) stop("AZURE_CLOUD_MISMATCH", "The selected Azure CLI cloud does not match the project profile; no cloud switching was attempted.");
  const account = await invokeCli(["account", "show", "--output", "json", "--only-show-errors"]);
  if (account?.environmentName !== profile.cloud || account?.id !== profile.subscription.subscriptionId || account?.tenantId !== profile.subscription.tenantId || account?.state !== "Enabled") {
    stop("AZURE_ACCOUNT_MISMATCH", "Azure CLI cloud, account or tenant does not match the project profile. No login or account switching was attempted.");
  }
  let token = null;
  let expiresAt = 0;
  async function credential() {
    if (token && expiresAt > Date.now() + 60_000) return token;
    const result = await invokeCli(["account", "get-access-token", "--resource", "https://ai.azure.com", "--output", "json", "--only-show-errors"]);
    if (typeof result?.accessToken !== "string" || !result.accessToken || /[\r\n]/.test(result.accessToken)) stop("AZURE_SESSION_REQUIRED", "A valid in-memory Entra access token is required.");
    if (result.subscription !== profile.subscription.subscriptionId) stop("AZURE_ACCOUNT_MISMATCH", "The token account no longer matches the project profile.");
    if (result.tenant !== profile.subscription.tenantId) stop("AZURE_ACCOUNT_MISMATCH", "The token tenant no longer matches the project profile.");
    expiresAt = Number(result.expires_on) * 1000;
    if (!Number.isFinite(expiresAt) || expiresAt <= Date.now() + 60_000) stop("AZURE_SESSION_EXPIRED", "Entra session is expired or too close to expiry; renew it outside this command.");
    token = result.accessToken;
    return token;
  }
  const agentRoute = `/agents/${encodeURIComponent(blueprint.id)}`;
  async function requestJson(method, route, body, { missing = false, query = "", merge = false, timeoutMs } = {}) {
    const url = `${endpoint}${route}?api-version=v1${query}`;
    if (!url.startsWith(`${endpoint}/agents`) || !["GET", "POST", "PATCH"].includes(method)) stop("PROVIDER_ROUTE", "Untrusted provider operation.");
    let response;
    try {
      response = await fetchImpl(url, {
        method, headers: { Authorization: `Bearer ${await credential()}`, Accept: "application/json",
          ...(body ? { "Content-Type": merge ? "application/merge-patch+json" : "application/json" } : {}) },
        ...(body ? { body: JSON.stringify(body) } : {}),
        redirect: "error", signal: AbortSignal.timeout(timeoutMs ?? (method === "POST" ? 60_000 : 20_000))
      });
    } catch (error) {
      if (error?.name === "DeploymentError") throw error;
      stop("PROVIDER_TRANSPORT", "Provider request failed or timed out; output was redacted and mutations must not be retried blindly.");
    }
    if (missing && response.status === 404) { await response.body?.cancel().catch(() => {}); return null; }
    if (response.status !== 200) {
      await response.body?.cancel().catch(() => {});
      stop(`PROVIDER_HTTP_${response.status}`, `Provider denied or rejected the pinned REST contract (HTTP ${response.status}); response details were redacted.`);
    }
    return boundedJson(response);
  }
  let collectionProbed = false;
  return {
    async probe() {
      if (!collectionProbed) {
        const collection = await requestJson("GET", "/agents", undefined, { query: "&limit=1" });
        if (!Array.isArray(collection?.data)) stop("PROVIDER_CONTRACT", "The project does not expose the expected v1 agents collection.");
        collectionProbed = true;
      }
      const remote = await requestJson("GET", agentRoute, undefined, { missing: true });
      const base = {
        exists: remote !== null, agentId: null, identityId: null, selector: "none", activeVersion: null,
        protocols: [], authorization: [], endpointSha256: null, endpointPolicySha256: null, agentPropertiesSha256: null, hostedSource: null,
        versions: [], apiVersion: "v1", cliVersion: cli["azure-cli"]
      };
      if (request.runtime.kind === "hosted") {
        const sourceRoute = `/agents/${encodeURIComponent(request.hosted.testedAgentName)}`;
        const sourceAgent = await requestJson("GET", sourceRoute);
        const sourceVersion = await requestJson("GET", `${sourceRoute}/versions/${encodeURIComponent(request.hosted.testedVersion)}`);
        if (sourceAgent.name !== request.hosted.testedAgentName || sourceAgent.state !== "enabled"
            || !uuid.test(sourceAgent.instance_identity?.principal_id ?? "") || sourceAgent.instance_identity?.status === "disabled"
            || sourceVersion.name !== request.hosted.testedAgentName || sourceVersion.version !== request.hosted.testedVersion
            || sourceVersion.definition?.kind !== "hosted") stop("HOSTED_SOURCE_INVALID", "The tested hosted source agent or immutable version cannot be verified.");
        base.hostedSource = {
          agentName: request.hosted.testedAgentName, version: request.hosted.testedVersion,
          definitionSha256: digest(sourceVersion.definition), identitySha256: digest(sourceAgent.instance_identity),
          status: sourceVersion.status ?? "unknown", draft: sourceVersion.draft ?? false,
          image: sourceVersion.definition.container_configuration?.image
        };
      }
      if (!remote) return base;
      if (remote.object !== "agent" || remote.name !== blueprint.id || remote.state !== "enabled") stop("PROVIDER_CONTRACT", "The remote agent is not enabled or does not match the reviewed identity.");
      base.agentId = responseId(remote.id);
      if ([undefined, "active"].includes(remote.instance_identity?.status) && uuid.test(remote.instance_identity?.principal_id ?? "")) {
        base.identityId = remote.instance_identity.principal_id;
      }
      const config = remote.agent_endpoint ?? {};
      base.endpointSha256 = digest(config);
      const { version_selector, ...policy } = config;
      base.endpointPolicySha256 = digest(policy);
      const { agent_endpoint, versions, ...properties } = remote;
      base.agentPropertiesSha256 = digest(properties);
      const rules = config.version_selector?.version_selection_rules;
      base.selector = rules?.length === 1 && rules[0].type === "FixedRatio" && rules[0].traffic_percentage === 100 && versionPattern.test(rules[0].agent_version ?? "")
        ? "pinned" : !rules?.length || rules?.[0]?.type === "Latest" ? "latest" : "unknown";
      base.activeVersion = base.selector === "pinned" ? rules[0].agent_version : null;
      base.protocols = Object.keys(config.protocol_configuration ?? {}).sort();
      base.authorization = Array.isArray(config.authorization_schemes) ? config.authorization_schemes.map((scheme) => scheme.type).sort() : [];
      if (config.protocol_configuration?.responses && Object.keys(config.protocol_configuration.responses).length) base.protocols.push("unsupportedconfiguration");
      if (config.authorization_schemes?.some((scheme) => Object.keys(scheme).some((key) => key !== "type"))) base.authorization.push("UnsupportedConfiguration");
      if (base.protocols.some((item) => typeof item !== "string" || !/^[a-z0-9_]{1,40}$/.test(item)) || base.authorization.some((item) => typeof item !== "string" || !/^[a-zA-Z0-9]{1,40}$/.test(item))) {
        stop("PROVIDER_CONTRACT", "Unsupported endpoint protocol or authorization shape.");
      }
      let after = "";
      const seen = new Set();
      while (true) {
        const page = await requestJson("GET", `${agentRoute}/versions`, undefined, { query: `&limit=100${after ? `&after=${encodeURIComponent(after)}` : ""}` });
        if (!Array.isArray(page?.data) || typeof page.has_more !== "boolean") stop("PROVIDER_CONTRACT", "The version listing contract could not be verified.");
        for (const item of page.data) {
          if (!versionPattern.test(item?.version ?? "") || seen.has(item.version) || !item.definition || item.name !== blueprint.id) stop("PROVIDER_CONTRACT", "Unsupported or duplicated immutable version data.");
          const kind = ["prompt", "hosted"].includes(item.definition.kind) ? item.definition.kind : "unsupported";
          // The v1 TypeSpec explicitly defaults omitted non-hosted status to active.
          const status = item.status ?? (kind === "prompt" ? "active" : "unknown");
          const draft = item.draft ?? false;
          if (!["creating", "active", "failed", "deleting", "deleted", "unknown"].includes(status) || typeof draft !== "boolean") {
            stop("PROVIDER_CONTRACT", "Unsupported version lifecycle or draft state.");
          }
          seen.add(item.version);
          base.versions.push({
            id: responseId(item.id), version: item.version, kind, status, draft, definitionSha256: digest(item.definition),
            packageSha256: /^[a-f0-9]{64}$/.test(item.metadata?.pso_package ?? "") ? item.metadata.pso_package : null,
            release: /^[a-zA-Z0-9][a-zA-Z0-9._-]{0,63}$/.test(item.metadata?.pso_release ?? "") ? item.metadata.pso_release : null
          });
        }
        if (base.versions.length > 500) stop("PROVIDER_RESPONSE_LIMIT", "Version history exceeds the review limit; archive or review it manually.");
        if (!page.has_more) break;
        if (!page.data.length || base.versions.length === 500) stop("PROVIDER_RESPONSE_LIMIT", "The full version history cannot be reviewed within the bounded limit.");
        after = responseId(page.last_id ?? page.data.at(-1).id);
      }
      base.versions.sort((left, right) => left.version.localeCompare(right.version, "en", { numeric: true }));
      if (base.selector === "latest" && versionPattern.test(remote.versions?.latest?.version ?? "")) base.activeVersion = remote.versions.latest.version;
      return base;
    },
    async createVersion(definition, metadata) {
      const create = request.mode === "create";
      const response = await requestJson("POST", create ? "/agents" : `${agentRoute}/versions`, {
        ...(create ? { name: blueprint.id } : {}), definition, metadata, description: blueprint.description
      });
      const version = create ? response.versions?.latest : response;
      if (create && (response.object !== "agent" || response.name !== blueprint.id)) stop("PROVIDER_CONTRACT", "Created agent does not match the reviewed identity.");
      if (!versionPattern.test(version?.version ?? "") || version.name !== blueprint.id || !version.definition || digest(version.definition) !== digest(definition)) {
        stop("PROVIDER_CONTRACT", "Created immutable version does not match the reviewed definition; reconcile the partial mutation.");
      }
      return { id: responseId(version.id), version: version.version };
    },
    async configureEndpoint() {
      await requestJson("PATCH", agentRoute, {
        agent_endpoint: { protocol_configuration: { responses: {} }, authorization_schemes: [{ type: "Entra" }] }
      }, { merge: true });
    },
    async pinVersion(version) {
      if (!versionPattern.test(version)) stop("VERSION_INVALID", "Only an immutable numeric agent version can be pinned.");
      await requestJson("PATCH", agentRoute, {
        agent_endpoint: { version_selector: { version_selection_rules: [{ type: "FixedRatio", agent_version: version, traffic_percentage: 100 }] } }
      }, { merge: true });
    },
    async waitForVersion(version) {
      if (request.runtime.kind !== "hosted" || !versionPattern.test(version)) stop("PROVIDER_UNAVAILABLE", "Readiness polling is limited to a reviewed hosted version.");
      const sleep = dependencies.sleep ?? ((milliseconds) => new Promise((resolve) => setTimeout(resolve, milliseconds)));
      const attempts = Math.ceil(request.hosted.startupTimeoutSeconds / 5);
      const deadline = Date.now() + request.hosted.startupTimeoutSeconds * 1000;
      for (let attempt = 0; attempt <= attempts; attempt++) {
        const remaining = deadline - Date.now();
        if (remaining <= 0) break;
        const current = await requestJson("GET", `${agentRoute}/versions/${encodeURIComponent(version)}`, undefined, { timeoutMs: Math.min(20_000, remaining) });
        if (current.name !== blueprint.id || current.version !== version || current.definition?.kind !== "hosted"
            || current.draft === true || (context.definition && digest(current.definition) !== digest(context.definition))) {
          stop("HOSTED_VERSION_DRIFT", "The hosted version changed or is not the reviewed immutable release.");
        }
        if (current.status === "active") return { id: responseId(current.id), version };
        if (current.status !== "creating") stop("HOSTED_STARTUP_FAILED", "The hosted version did not reach active readiness; no pin or invocation was attempted.");
        if (attempt < attempts) await sleep(Math.min(5000, Math.max(0, deadline - Date.now())));
      }
      stop("HOSTED_STARTUP_TIMEOUT", "Hosted readiness exceeded the reviewed startup bound; preserve the partial run and reconcile.");
    },
    async invoke(probe) {
      const response = await requestJson("POST", `${agentRoute}/endpoint/protocols/openai/responses`, {
        input: [{ role: "user", content: probe.prompt }], max_output_tokens: probe.maxOutputTokens, store: false, stream: false
      });
      const text = (response.output ?? []).flatMap((output) => output.type === "message" && Array.isArray(output.content)
        ? output.content.filter((item) => item.type === "output_text").map((item) => item.text) : []).join("\n");
      if (typeof text !== "string" || text.length > 131072) stop("PROVIDER_CONTRACT", "Verification response exceeded the bounded text contract.");
      return { id: responseId(response.id), status: response.status === "completed" ? "completed" : "incomplete", outputText: text };
    }
  };
}
