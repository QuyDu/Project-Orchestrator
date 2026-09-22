import { validateContract } from "../contracts.mjs";

const configure = "https://learn.microsoft.com/azure/foundry/agents/how-to/configure-agent";
const publish = "https://learn.microsoft.com/azure/foundry/agents/how-to/publish-copilot-virtual-network";
const registry = {
  schemaVersion: "1.0.0", registryVersion: "2026-09-22.1", reviewedOn: "2026-09-22",
  providers: [
    {
      id: "foundry-prompt-v1", target: "foundry-endpoint", runtime: "prompt", support: "preview",
      clouds: ["AzureCloud"], apiVersion: "v1", executable: true,
      automaticSteps: ["Probe the authenticated Commercial project using the pinned v1 REST contract.", "Create an immutable prompt version or promote an existing matching version.", "Configure Responses and Entra only for a newly created agent.", "Pin a version, invoke a bounded probe, and repin the captured prior version on approved rollback."],
      manualSteps: ["Provision the project and model deployment and review model pricing, quota and residency.", "Grant Foundry User access and review downstream agent-identity permissions outside this adapter."],
      limitations: ["Preview requires explicit acceptance; no live tenant validation is included with the framework.", "AzureUSGovernment is unverified and blocked; no cloud switching or inferred Commercial endpoints.", "Portable capability labels are never remote tools. Only explicitly acknowledged tool-free prompt execution is supported.", "Existing agents must expose an active identity, Entra-only Responses endpoint and a pinned active non-draft prompt version.", "New-agent creation makes a live endpoint immediately; first deployment has no automatic delete rollback.", "The current SDK state: enabled contract is required; older status: Enabled documentation is not silently coerced.", "Remote writes are not an atomic transaction; pre/post drift checks stop on concurrent changes, and ambiguous outcomes require reconciliation.", "No RBAC, model deployment, hosted compute, MCP, Activity, catalog or marketplace mutations."],
      sources: [configure, "https://raw.githubusercontent.com/Azure/azure-sdk-for-js/main/sdk/ai/ai-projects/src/api/agents/operations.ts", "https://raw.githubusercontent.com/Azure/azure-sdk-for-js/main/sdk/ai/ai-projects/src/models/models.ts", "https://raw.githubusercontent.com/Azure/azure-sdk-for-js/main/sdk/ai/ai-projects/src/aiProjectClient.ts", "https://raw.githubusercontent.com/Azure/azure-rest-api-specs/main/specification/ai-foundry/data-plane/Foundry/src/agents/routes.tsp", "https://raw.githubusercontent.com/Azure/azure-rest-api-specs/main/specification/ai-foundry/data-plane/Foundry/src/agents/models.tsp", "https://learn.microsoft.com/azure/foundry/agents/quickstarts/prompt-agent"]
    },
    {
      id: "foundry-hosted-v1", target: "foundry-endpoint", runtime: "hosted", support: "preview",
      clouds: ["AzureCloud"], apiVersion: "v1", executable: true,
      automaticSteps: ["Package the approved immutable OCI digest, JSON SBOM and fresh digest-bound test receipt.", "Probe a tested active hosted source version in the same project and require an identical runtime definition.", "Create the immutable hosted version, poll exact-version active readiness, pin and invoke once after distinct hosted-code-and-compute approval.", "Repin the captured prior active hosted version on separately approved rollback; retain created versions and resources."],
      manualSteps: ["Build and provenance-review the immutable image, configure existing registry access, and obtain a tested active source version.", "Review region/capacity quota, CPU/memory pricing, code authority and downstream permissions before execution."],
      limitations: ["Preview acceptance and a registry allowlist are required. No live tenant validation is included with the framework.", "Only prebuilt images from an approved Commercial Azure Container Registry are supported; no image build/push, source ZIP, remote build, arbitrary environment variables or RBAC assignment.", "Hosted creation executes reviewed code and starts billable compute. Failure preserves a partial journal and never retries creation.", "Startup polls exact v1 version status; missing hosted status is not active, and inactive versions cannot receive traffic.", "No Government routing, traffic splitting, destructive resource cleanup, or rollback of prior invocations/charges is implied."],
      sources: ["https://learn.microsoft.com/azure/foundry/agents/concepts/hosted-agents", "https://learn.microsoft.com/azure/foundry/agents/quickstarts/quickstart-hosted-agent", "https://raw.githubusercontent.com/Azure/azure-rest-api-specs/main/specification/ai-foundry/data-plane/Foundry/src/agents/routes.tsp", "https://raw.githubusercontent.com/Azure/azure-rest-api-specs/main/specification/ai-foundry/data-plane/Foundry/src/agents/models.tsp"]
    },
    {
      id: "foundry-m365-v1", target: "microsoft-365-copilot-and-teams", runtime: "package", support: "preview",
      clouds: ["AzureCloud"], apiVersion: "v1", executable: true, automaticSteps: ["Verify the tested active pinned agent and unique identity in the allowlisted project.", "Create or verify an approved single-tenant Bot Service and Teams channel using fixed ARM routes.", "Preserve existing endpoint protocols and authorization while adding Activity and the reviewed Bot Service scheme.", "Submit exact v1 publication metadata after separate resource/configuration/publication approvals; persist accepted IDs and pending-admin state."],
      manualSteps: ["Test and pin the Foundry version; verify agent identity, Microsoft.BotService registration and resource-group permissions.", "Review Activity protocol and BotServiceRbac or BotServiceTenant separately from version content.", "Verify the dedicated publish API contract and Bot Service resources before a separately approved mutation.", "For tenant scope, stop at pending-admin-approval until an administrator approves; then verify catalog discovery."],
      limitations: ["No live tenant validation is included. The documented Activity bridge uses its separate 2025-05-15-preview protocol route while publication uses v1.", "Only approved resource groups and matching single-tenant identities are permitted; existing bridges are never overwritten.", "Tenant publication terminates at pending-admin-approval. Shared/Personal submission does not prove catalog acceptance or conversation health.", "No automatic provider registration, role assignment, tenant consent, destructive rollback or unpublish is performed."],
      sources: [publish, configure]
    },
    {
      id: "m365-toolkit-cli", target: "microsoft-365-agents-toolkit", runtime: "package", support: "supported",
      clouds: ["AzureCloud", "none"], apiVersion: null, executable: true, automaticSteps: ["Bind exact CLI version, operator-reviewed authentication evidence and a frozen source tree.", "Execute provision/deploy as reviewed lifecycle operations, and package as a separate bounded artifact operation.", "Publish/update the reviewed retained ZIP through direct package handlers using --package-file without conflicting --manifest-file.", "Validate retained ZIP/manifest identity and preserve accepted outcomes without inferring catalog acceptance."],
      manualSteps: ["Pin and verify the installed atk CLI and review m365agents.yml, authentication and selected environment.", "Review provision, deploy, package, publish and update as separate approval classes.", "Validate the application package and obtain tenant catalog or Partner Center review when required."],
      limitations: ["Only the adapter's reviewed lifecycle subset is executable; arbitrary scripts, credential-producing actions, implicit environment substitutions and dependency installation are rejected.", "Provision/deploy require both operation approval and reviewed-code-execution; retained-ZIP publish/update requires its own operation approval, not lifecycle authority.", "Any raw TypeSpec compile marker, including comments, is rejected before CLI execution because vendor project detection may install dependencies.", "Toolkit deployment does not prove tenant catalog listing or publication acceptance; deprecated TeamsFx paths are not used.", "No transactional rollback, invented JSON/auth flag, automatic login or destructive uninstall is performed."],
      sources: ["https://learn.microsoft.com/microsoftteams/platform/toolkit/microsoft-365-agents-toolkit-cli", "https://raw.githubusercontent.com/OfficeDev/microsoft-365-agents-toolkit/dev/packages/cli/src/commands/models/teamsapp/update.ts", "https://raw.githubusercontent.com/OfficeDev/microsoft-365-agents-toolkit/dev/packages/fx-core/src/common/tools.ts", "https://raw.githubusercontent.com/OfficeDev/microsoft-365-agents-toolkit/dev/packages/fx-core/src/common/projectTypeChecker.ts"]
    },
    {
      id: "copilot-studio-pac", target: "copilot-studio", runtime: "package", support: "supported",
      clouds: ["AzureCloud", "none"], apiVersion: null, executable: true, automaticSteps: ["Bind the exact CLI version, explicit environment and operator-reviewed identity evidence.", "Execute separate pack, managed-solution import, agent publish or export operations using frozen inputs.", "Validate retained solution ZIP identity; retain submission/verification boundaries rather than infer catalog acceptance."],
      manualSteps: ["Verify pac version, authenticated identity, selected Power Platform environment and workspace.", "Develop in an unmanaged solution; import the reviewed managed solution downstream after checking connection references and environment variables.", "Complete post-import authentication, icons, channels and nonsolution configuration gates.", "Separately approve publish, verify each channel and retain the prior approved managed solution for rollback."],
      limitations: ["Solution import is not agent publication.", "The current PAC reference has no general JSON output contract; localized prose is not parsed into fabricated identity or health claims.", "Post-import authentication, connection/environment variables, icons and each channel still need explicit verification.", "Installed managed solutions cannot be exported and no atomic downgrade/rollback is claimed; recovery requires a separately reviewed compatible artifact or environment restore."],
      sources: ["https://learn.microsoft.com/power-platform/developer/cli/reference/copilot", "https://learn.microsoft.com/power-platform/developer/cli/reference/solution"]
    },
    {
      id: "openai-application-export", target: "openai-api-application", runtime: "package", support: "manual",
      clouds: ["none", "AzureCloud"], apiVersion: null, executable: false, automaticSteps: ["Export a dependency-free server-side Responses client module for an application the project owns."],
      manualSteps: ["Select and govern the application's own hosting, credentials, UI, privacy, retention and deployment pipeline.", "Integrate and validate the exported client with explicit network and model-spend approval."],
      limitations: ["No OpenAI call is made during packaging.", "An API application is not a ChatGPT Custom GPT or GPT Store publisher; application hosting is outside this skill's executable adapters."],
      sources: ["https://platform.openai.com/docs/api-reference/responses"]
    },
    {
      id: "chatgpt-action-handoff", target: "chatgpt-action-handoff", runtime: "package", support: "manual",
      clouds: ["none", "AzureCloud"], apiVersion: null, executable: false, automaticSteps: ["Validate and export a digest-bound JSON OpenAPI action document with HTTPS, authentication, privacy and domain checks."],
      manualSteps: ["Confirm workspace eligibility, GPT lifecycle availability and domain policy.", "Check account-specific GPT creation and retirement notices; published dates are planned or targeted, not guarantees of availability.", "Use the governed product UI to configure the action and obtain sharing or workspace approval.", "Recheck public privacy policy, authentication, cross-platform data flow and consequential operation confirmation."],
      limitations: ["Always manual-handoff: no apply, browser automation, GPT management API or GPT Store publication.", "Only JSON OpenAPI 3.0.3 or 3.1.0 with local references and approved HTTPS hosts is supported."],
      sources: ["https://platform.openai.com/docs/actions/introduction", "https://platform.openai.com/docs/actions/production", "https://help.openai.com/en/articles/8554407-gpts-in-chatgpt", "https://help.openai.com/en/articles/8554397-creating-and-editing-gpts"]
    }
  ]
};

export function getCapabilities() {
  return validateContract("capabilities", structuredClone(registry));
}

export function capabilityFor(request) {
  const capability = getCapabilities().providers.find((item) => item.target === request.target && (request.target !== "foundry-endpoint" || item.runtime === request.runtime.kind));
  const field = { "microsoft-365-copilot-and-teams": "microsoft365", "copilot-studio": "copilotStudio", "microsoft-365-agents-toolkit": "agentsToolkit" }[request.target];
  if (capability && field && !request[field]) return {
    ...capability, executable: false, support: "manual",
    limitations: [`Execution configuration ${field} is absent. This legacy compatibility package is nonexecuting; supply the strict provider configuration for an executable plan.`, ...capability.limitations]
  };
  return capability;
}
