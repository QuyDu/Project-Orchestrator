import { digest, rejectSecrets, stableJson, stop, validateRequest } from "../contracts.mjs";
import { validateEndpoint } from "./foundry.mjs";
import { createAzureHttp } from "./azure-http.mjs";
import { validatePlatformOutcome, validatePlatformSnapshot } from "./platform-contract.mjs";

const guid = /^[a-f0-9]{8}-(?:[a-f0-9]{4}-){3}[a-f0-9]{12}$/i;
const sameId = (left, right) => typeof left === "string" && typeof right === "string" && left.toLowerCase() === right.toLowerCase();
const schemeFor = (scope) => scope === "Tenant" ? "BotServiceTenant" : "BotServiceRbac";

export async function createMicrosoft365Provider(context, dependencies = {}) {
  const { request, blueprint, profile } = context;
  validateRequest(request);
  const config = request.microsoft365;
  if (!config || request.target !== "microsoft-365-copilot-and-teams" || request.cloud !== "AzureCloud" || !request.acceptPreview) stop("PUBLICATION_CONTEXT", "A reviewed Commercial v1 Microsoft 365 publication request is required.");
  const endpoint = validateEndpoint(config.projectEndpoint);
  const http = await createAzureHttp(profile, dependencies);
  const groupId = `/subscriptions/${profile.subscription.subscriptionId}/resourceGroups/${config.bot.resourceGroup}`;
  const botId = `${groupId}/providers/Microsoft.BotService/botServices/${config.bot.name}`;
  const channelId = `${botId}/channels/MsTeamsChannel`;
  const agentPath = `${endpoint}/agents/${encodeURIComponent(blueprint.id)}`;
  const activityEndpoint = `${agentPath}/endpoint/protocols/activityProtocol?api-version=2025-05-15-preview`;
  const routes = {
    agent: { url: `${agentPath}?api-version=v1`, method: "GET", audience: "foundry" },
    version: { url: `${agentPath}/versions/${config.agentVersion}?api-version=v1`, method: "GET", audience: "foundry" },
    provider: { url: `https://management.azure.com/subscriptions/${profile.subscription.subscriptionId}/providers/Microsoft.BotService?api-version=2021-04-01`, method: "GET", audience: "arm" },
    group: { url: `https://management.azure.com${groupId}?api-version=2021-04-01`, method: "GET", audience: "arm" },
    bot: { url: `https://management.azure.com${botId}?api-version=2022-09-15`, method: "GET", audience: "arm" },
    channel: { url: `https://management.azure.com${channelId}?api-version=2022-09-15`, method: "GET", audience: "arm" },
    botPut: { url: `https://management.azure.com${botId}?api-version=2022-09-15`, method: "PUT", audience: "arm" },
    channelPut: { url: `https://management.azure.com${channelId}?api-version=2022-09-15`, method: "PUT", audience: "arm" },
    endpointPatch: { url: `${agentPath}?api-version=v1`, method: "PATCH", audience: "foundry", merge: true },
    publish: { url: `${agentPath}/microsoft365/publish?api-version=v1`, method: "POST", audience: "foundry" }
  };
  let observed = null;
  async function get(name, missing = false, timeoutMs = 20_000) { return (await http.send(routes[name], { missing, timeoutMs }))?.body ?? null; }
  function verifyAgent(agent, version) {
    const rules = agent?.agent_endpoint?.version_selector?.version_selection_rules;
    if (agent?.object !== "agent" || agent.name !== blueprint.id || agent.state !== "enabled"
        || !guid.test(agent.instance_identity?.principal_id ?? "") || !guid.test(agent.instance_identity?.client_id ?? "")
        || agent.instance_identity?.status === "disabled" || rules?.length !== 1 || rules[0].type !== "FixedRatio"
        || rules[0].traffic_percentage !== 100 || rules[0].agent_version !== config.agentVersion
        || version?.name !== blueprint.id || version.version !== config.agentVersion
        || version.draft === true || version.definition?.kind !== request.runtime.kind
        || (version.status ?? (version.definition?.kind === "prompt" ? "active" : "unknown")) !== "active"
        || digest(version.definition) !== config.definitionSha256) stop("PUBLICATION_AGENT_DRIFT", "Publication requires the exact tested active pinned version and its unique active identity.");
    const endpointConfig = agent.agent_endpoint;
    if (!endpointConfig.protocol_configuration?.responses || !Array.isArray(endpointConfig.authorization_schemes)
        || !endpointConfig.authorization_schemes.some((scheme) => scheme.type === "Entra")) stop("PUBLICATION_AUTH", "Preserved Responses and Entra access are prerequisites for publication.");
    rejectSecrets(endpointConfig);
  }
  function verifyBot(bot, agent) {
    if (!bot) return;
    const properties = bot.properties;
    if (!sameId(bot.id, botId) || bot.kind?.toLowerCase() !== "azurebot" || !properties
        || !sameId(properties.msaAppId, agent.instance_identity.client_id)
        || !sameId(properties.msaAppTenantId, profile.subscription.tenantId)
        || properties.msaAppType !== "SingleTenant"
        || properties.endpoint !== activityEndpoint || properties.publicNetworkAccess !== "Disabled") {
      stop("BOT_OWNERSHIP_DRIFT", "Existing Bot Service does not match the reviewed identity, tenant, endpoint or network boundary; overwrite is refused.");
    }
    if (["Failed", "Canceled", "Deleting"].includes(properties.provisioningState)) stop("BOT_PROVISIONING_FAILED", "Bot Service provisioning is not healthy.");
  }
  function verifyChannel(channel) {
    if (channel && (!sameId(channel.id, channelId) || channel.properties?.channelName !== "MsTeamsChannel"
        || channel.properties?.properties?.isEnabled !== true)) stop("CHANNEL_OWNERSHIP_DRIFT", "Existing Teams channel differs from the reviewed bridge; overwrite is refused.");
    if (["Failed", "Canceled", "Deleting"].includes(channel?.properties?.provisioningState)) stop("CHANNEL_PROVISIONING_FAILED", "Teams channel provisioning failed.");
  }
  async function observe() {
    const agent = await get("agent");
    const version = await get("version");
    verifyAgent(agent, version);
    const provider = await get("provider");
    const group = await get("group");
    if (provider?.registrationState !== "Registered" || !sameId(group?.id, groupId)) stop("BOT_PREREQUISITE", "Microsoft.BotService registration and the approved resource group must already exist.");
    const bot = await get("bot", true);
    verifyBot(bot, agent);
    if (bot?.properties?.provisioningState && bot.properties.provisioningState !== "Succeeded") stop("BOT_NOT_READY", "The existing Bot Service is still provisioning; wait and review a fresh plan.");
    if (!bot && config.bot.mode === "existing") stop("BOT_REQUIRED", "The reviewed existing Bot Service bridge is missing.");
    const channel = bot ? await get("channel", true) : null;
    verifyChannel(channel);
    if (channel?.properties?.provisioningState && channel.properties.provisioningState !== "Succeeded") stop("CHANNEL_NOT_READY", "The existing Teams channel is still provisioning; wait and review a fresh plan.");
    const identitySha256 = digest({ account: profile.subscription, agentIdentity: agent.instance_identity });
    const stable = {
      agent: { id: agent.id, state: agent.state, identity: agent.instance_identity, endpoint: agent.agent_endpoint },
      version: { version: version.version, definition: version.definition, status: version.status ?? "active", draft: version.draft ?? false },
      bot: bot ? { id: bot.id, kind: bot.kind, location: bot.location, sku: bot.sku, properties: bot.properties, tags: bot.tags ?? {} } : null,
      channel: channel ? { id: channel.id, properties: channel.properties } : null
    };
    observed = { agent, version, bot, channel, stable };
    return validatePlatformSnapshot({
      target: request.target, cliVersion: http.cliVersion, identitySha256, configurationSha256: digest(stable),
      resourceIds: [agent.id, ...(bot ? [botId] : []), ...(channel ? [channelId] : [])].sort(),
      version: config.agentVersion, phase: bot && channel ? "ready" : "missing"
    });
  }
  function outcome(status, id, evidence, mutationAccepted, code, ids = [id]) {
    return validatePlatformOutcome({
      status, responseId: id, resourceIds: ids, version: status.includes("approval") || status.includes("submitted") ? config.appVersion : config.agentVersion,
      mutationAccepted, publicationVerified: false, evidenceSha256: digest(evidence), messageCode: code
    });
  }
  async function accepted(value) { if (context.onAccepted) await context.onAccepted(value); }
  async function poll(name, check, limit = config.provisioningTimeoutSeconds ?? 300) {
    const deadline = Date.now() + limit * 1000;
    const sleep = dependencies.sleep ?? ((milliseconds) => new Promise((resolve) => setTimeout(resolve, milliseconds)));
    for (let attempt = 0; attempt <= Math.ceil(limit / 5); attempt++) {
      const remaining = deadline - Date.now();
      if (remaining <= 0) break;
      const result = await get(name, true, Math.min(20_000, remaining));
      if (result) {
        check(result);
        const state = result.properties?.provisioningState;
        if (!state || state === "Succeeded") return result;
      }
      if (Date.now() >= deadline) break;
      await sleep(Math.min(5000, Math.max(0, deadline - Date.now())));
    }
    stop("BOT_READINESS_TIMEOUT", "The accepted bridge mutation did not become ready within the reviewed timeout; preserve its recorded ID.");
  }
  async function unchanged(baseline, keys) {
    await observe();
    if (keys.some((key) => stableJson(baseline[key]) !== stableJson(observed.stable[key]))) stop("PUBLICATION_REMOTE_DRIFT", "An unrelated remote change accompanied the accepted publication operation; reconcile before proceeding.");
  }
  return {
    probe: observe,
    evidence() {
      if (!observed) stop("PUBLICATION_EVIDENCE", "Probe the existing endpoint before reviewing publication.");
      return {
        activeVersion: config.agentVersion, endpoint: structuredClone(observed.agent.agent_endpoint),
        definitionSha256: config.definitionSha256, botResourceId: botId, channelResourceId: channelId,
        botExists: Boolean(observed.bot), channelExists: Boolean(observed.channel)
      };
    },
    async execute(operation) {
      if (!["bot", "channel", "endpoint", "publish"].includes(operation)) stop("PUBLICATION_OPERATION", "Unsupported publication operation.");
      const before = await observe();
      if (context.expectedSnapshotSha256 && digest(before) !== context.expectedSnapshotSha256) stop("REMOTE_DRIFT", "Publication scope changed immediately before the provider mutation.");
      const baseline = structuredClone(observed.stable);
      if (operation === "bot") {
        if (observed.bot) return outcome("provisioned", botId, observed.stable.bot, false, "BOT_REUSED");
        const body = {
          location: "global", kind: "azurebot", sku: { name: "F0" },
          tags: { "pso-agent": blueprint.id, "pso-package": context.packageSha256 },
          properties: {
            displayName: config.agentDisplayName, msaAppType: "SingleTenant",
            msaAppId: observed.agent.instance_identity.client_id, msaAppTenantId: profile.subscription.tenantId,
            endpoint: activityEndpoint, publicNetworkAccess: "Disabled"
          }
        };
        const response = await http.send(routes.botPut, { body });
        await accepted(outcome("verification-required", botId, { status: response.status, request: digest(body) }, true, "BOT_CREATE_ACCEPTED"));
        const ready = await poll("bot", (value) => verifyBot(value, observed.agent));
        await unchanged(baseline, ["agent", "version", "channel"]);
        return outcome("provisioned", botId, ready, true, "BOT_PROVISIONED");
      }
      if (!observed.bot) stop("BOT_REQUIRED", "The Bot Service bridge must exist before channel configuration.");
      if (operation === "channel") {
        if (observed.channel) return outcome("provisioned", channelId, observed.stable.channel, false, "TEAMS_CHANNEL_REUSED");
        const body = { location: "global", properties: { channelName: "MsTeamsChannel", properties: { isEnabled: true } } };
        const response = await http.send(routes.channelPut, { body });
        await accepted(outcome("verification-required", channelId, { status: response.status, request: digest(body) }, true, "TEAMS_CHANNEL_CREATE_ACCEPTED"));
        const ready = await poll("channel", verifyChannel);
        await unchanged(baseline, ["agent", "version"]);
        return outcome("provisioned", channelId, ready, true, "TEAMS_CHANNEL_PROVISIONED");
      }
      if (!observed.channel) stop("CHANNEL_REQUIRED", "The reviewed Teams channel must exist before endpoint configuration or publication.");
      const current = observed.agent.agent_endpoint;
      const desired = {
        ...structuredClone(current),
        protocol_configuration: {
          ...structuredClone(current.protocol_configuration),
          activity: { ...structuredClone(current.protocol_configuration.activity ?? {}), ...(config.enableM365PublicEndpoint ? { enable_m365_public_endpoint: true } : {}) }
        },
        authorization_schemes: current.authorization_schemes.some((scheme) => scheme.type === schemeFor(config.publishScope))
          ? structuredClone(current.authorization_schemes) : [...structuredClone(current.authorization_schemes), { type: schemeFor(config.publishScope) }]
      };
      if (operation === "endpoint") {
        if (stableJson(current) === stableJson(desired)) return outcome("deployed", observed.agent.id, current, false, "ACTIVITY_CONFIGURATION_REUSED");
        const body = { agent_endpoint: { protocol_configuration: desired.protocol_configuration, authorization_schemes: desired.authorization_schemes } };
        await http.send(routes.endpointPatch, { body });
        await accepted(outcome("verification-required", observed.agent.id, body, true, "ACTIVITY_CONFIGURATION_ACCEPTED"));
        const after = await get("agent");
        verifyAgent(after, observed.version);
        if (stableJson(after.agent_endpoint) !== stableJson(desired)) stop("ENDPOINT_CONFIGURATION_DRIFT", "Endpoint configuration did not preserve the reviewed protocols, authorization and selector.");
        await unchanged(baseline, ["version", "bot", "channel"]);
        if (stableJson(observed.agent.agent_endpoint) !== stableJson(desired)) stop("ENDPOINT_CONFIGURATION_DRIFT", "Endpoint settings changed after their accepted configuration.");
        return outcome("deployed", after.id, after.agent_endpoint, true, "ACTIVITY_CONFIGURATION_VERIFIED");
      }
      if (stableJson(current) !== stableJson(desired)) stop("PUBLICATION_PREREQUISITE", "Activity and the reviewed Bot Service authorization must be configured before submission.");
      const body = {
        agentDisplayName: config.agentDisplayName, botServiceArmId: botId, publishScope: config.publishScope,
        publishAsAutopilot: false, appVersion: config.appVersion, shortDescription: config.shortDescription,
        fullDescription: config.fullDescription, developerName: config.developerName,
        developerWebsiteUrl: config.developerWebsiteUrl, privacyUrl: config.privacyUrl, termsOfUseUrl: config.termsOfUseUrl
      };
      const response = (await http.send(routes.publish, { body })).body;
      if (typeof response?.titleId !== "string" || !/^[a-zA-Z0-9][a-zA-Z0-9._-]{0,255}$/.test(response.titleId)
          || (response.teamsAppId !== undefined && !guid.test(response.teamsAppId))) stop("PUBLICATION_RESPONSE", "Publication response lacks valid accepted identifiers; reconcile the potentially accepted submission.");
      rejectSecrets(response.titleId);
      const ids = [response.titleId, ...(response.teamsAppId ? [response.teamsAppId] : [])];
      const receipt = outcome(config.publishScope === "Tenant" ? "pending-admin-approval" : "publication-submitted",
        response.titleId, response, true, config.publishScope === "Tenant" ? "TENANT_ADMIN_APPROVAL_PENDING" : "PUBLICATION_SUBMITTED_NOT_CONVERSATION_VERIFIED", ids);
      await accepted(receipt);
      await unchanged(baseline, ["agent", "version", "channel"]);
      return receipt;
    },
    async verify(receipt) {
      await observe();
      if (!receipt || !["pending-admin-approval", "publication-submitted"].includes(receipt.status)) stop("PUBLICATION_EVIDENCE", "Accepted publication evidence is required for read-only verification.");
      if (!observed.bot || !observed.channel || !observed.agent.agent_endpoint.protocol_configuration.activity
          || !observed.agent.agent_endpoint.authorization_schemes.some((entry) => entry.type === schemeFor(config.publishScope))
          || (config.enableM365PublicEndpoint && observed.agent.agent_endpoint.protocol_configuration.activity.enable_m365_public_endpoint !== true)) {
        stop("PUBLICATION_REMOTE_DRIFT", "The accepted publication bridge or endpoint authorization is no longer present.");
      }
      return validatePlatformOutcome({ ...receipt, mutationAccepted: false, publicationVerified: false,
        messageCode: config.publishScope === "Tenant" ? "TENANT_ADMIN_APPROVAL_PENDING" : "CATALOG_AND_CONVERSATION_VERIFICATION_REQUIRED" });
    },
    async rollback() {
      stop("MANUAL_RECOVERY_REQUIRED", "No automatic Bot deletion, unpublish or transactional rollback is supported. Preserve accepted IDs and obtain a separately reviewed recovery plan.");
    }
  };
}
