---
mode: agent
description: Help for the azure-discovery skill.
---

# azure-discovery Help

Discover Azure Commercial or Azure US Government service, model, quota, and sanitized deployment availability; own dated, context-bound evidence that consumers reuse for 30 days or refresh through this skill.

Explain this contract as help only. Do not execute its procedures or treat examples as action approval.
Read the complete contract at .github/skills/azure-discovery/SKILL.md before using this skill.

## Purpose

Resolve and persist the project's Azure environment once, then own reusable discovery evidence for services, regions, chat and image-generation models, SKUs, API versions, quota certainty, Speech-resource readiness, and image-deployment readiness. Reuse evidence for up to 30 days in the same Azure context; establish the matching Azure CLI context and refresh only when required or explicitly requested.

## Preconditions

- Read repository instructions and the current project handoff first.
- Read `reports/azure-discovery.json` and `reports/azure-discovery.md` when present.
- Read `.azure/environment.json` when present and reuse it without asking for the cloud, subscription, MCP policy, or login again.
- Confirm Azure CLI is installed. When its context is absent or mismatched, start the authentication method recorded in the local profile rather than asking whether to log in.
- Never request or record credentials or tokens. Tenant, subscription, and OAuth client IDs are nonsecret identifiers and may exist only in the ignored local profile, never in discovery reports or distributable templates.

## Inputs

- Optional `-Commercial` or `-Gov` selection. An explicit flag updates the local profile; persisted configuration is next in precedence; a missing profile defaults to Azure Commercial.
- Optional target location and preferred chat model. Image generation uses a fixed safety order: generally available Azure OpenAI image models, limited-access Azure OpenAI image models, then preview Microsoft MAI Image models.
- Optional `-Refresh` to bypass a current cache. The default output is `reports/azure-discovery.json` and its derived Markdown companion; custom outputs must remain inside the owning project's `reports/` directory, never replace the local profile or source files.
- One-time environment name, subscription target, authentication method, and Azure MCP service selection when the local profile does not exist.

## Approved Tools and Resources

- The packaged `.github/skills/azure-discovery/scripts/azure-environment.ps1`, `azure-discovery.ps1`, and `discovery-cache.mjs`. The infrastructure entrypoints `infra/azure-environment.ps1` and `infra/discover.ps1` delegate to this package instead of duplicating its implementation.
- Node.js for the shared schema, cache policy, context fingerprint, and report publication; PowerShell for the existing Azure CLI probe.
- Azure CLI read-only discovery commands.
- Existing project reports and configuration.

## Read and Write Boundaries

- Read Azure subscription metadata, service availability, Speech-capable account kinds and regions, image-model catalog and quota records, and compatible image deployments. Account and deployment names may exist transiently only to enumerate deployments; reports persist only aggregate counts, regions, model names, and model formats.
- Update `.vscode/settings.json` so Azure MCP sampling and namespaces match the recorded profile. MCP is disabled until the project opts in, and `foundryextensions` remains excluded unless a client ID is already recorded.
- Write `reports/azure-discovery.json` and the readable `reports/azure-discovery.md`.
- Never deploy resources, change Azure state, or write secrets.

## Procedure

1. Read `.azure/environment.json`. If it is missing, collect the Azure cloud, environment name, default region, subscription target, authentication method, and Azure MCP namespaces during the initial project questions, then initialize the profile. Use Azure Commercial for an omitted cloud.
2. Apply cloud precedence deterministically: explicit `-Gov` or `-Commercial`, then persisted profile, then Azure Commercial. Never ask again after the profile exists unless reconfiguration is explicitly requested.
3. Keep Azure MCP disabled by default. If enabled, write the selected namespaces to workspace settings. Exclude `foundryextensions` until its nonsecret OAuth client ID is recorded, avoiding VS Code's unsupported dynamic-registration prompt.
4. Use `discovery-cache.mjs` to inspect existing evidence before Azure CLI work. Reuse the report without changing its timestamp when its schema and companion are valid, its context matches, and its age is between zero and 30 days inclusive. Missing, malformed, unbound legacy, future-dated, expired, or mismatched evidence requires refresh; never return stale evidence as success.
5. Dot-source `.github/skills/azure-discovery/scripts/azure-discovery.ps1` and invoke `Invoke-AzureDiscovery` with the resolved cloud, location, and optional chat-model preference. It uses the shared cache policy and automatically runs its existing probe on a cache miss. Before probing, select the profile's cloud and subscription and start the recorded login method when needed. Discover compatible image models from the active cloud and region, select generally available `gpt-image-2` ahead of limited-access Azure OpenAI and preview MAI Image candidates, and record whether non-GA acceptance is required.
6. Query regional Cognitive Services usage for the selected image model. Record `available`, `exhausted`, or `unknown` only when matching usage evidence supports that status; missing or failed quota queries remain `unknown`.
   Match the structured OpenAI usage name to the exact normalized selected model and SKU. Missing, ambiguous or unrecognized identities remain unknown; another SKU's capacity, a model-name prefix or localized display text is not a match.
7. Enumerate existing compatible image deployments across `OpenAI`, `AIServices`, and `CognitiveServices` accounts. Use account names and resource groups only as transient CLI inputs, fail the aggregate closed on any partial query failure, and persist no resource, account, deployment, endpoint, subscription, or tenant identifier.
8. Publish JSON and Markdown as a validated pair through `discovery-cache.mjs`, retaining the probe's UTC `discoveredAt`, deriving `expiresAt` exactly 30 days later, and storing a `contextSha256` fingerprint over cloud, tenant, subscription, region, and normalized chat-model preference. Never persist the underlying identifiers in reports. Retain the prior pair if publication fails; do not renew its timestamps without a successful probe.

## Validation

- The selected cloud is `AzureCloud` or `AzureUSGovernment`.
- `.azure/environment.json` validates against `schemas/azure-environment.schema.json`, is excluded from source control, and contains no secret values.
- Both report files exist and contain the same discovery timestamp and cloud.
- The JSON report validates against `schemas/azure-discovery.schema.json`; legacy `1.0.0` reports without `imageGeneration` remain valid, while new reports include the strict image summary.
- New persisted reports include `expiresAt` and `contextSha256` together. Legacy reports remain readable but cannot satisfy context-bound cache reuse until refreshed.
- Image model ordering is generally available, limited access, then preview. A limited-access or preview selection sets `requiresExplicitAcceptance` and never implies authorization to deploy or invoke it.
- Image deployment evidence contains only query certainty, count, regions, model names, and model formats. It contains no resource name, deployment name, endpoint, resource ID, subscription ID, tenant ID, key, or token.
- Discovery failures are reported as unknown or unavailable according to the script output.
- The shared freshness bound is 30 days inclusive, measured from `discoveredAt`, not file modification time or profile `updatedAt`. One millisecond beyond that bound, any future timestamp, or a changed discovery context requires refresh.
- Cache hits perform no Azure queries or timestamp-only rewrites. Refresh failures cannot fall back to stale success.

## Outputs

- `reports/azure-discovery.json`
- `reports/azure-discovery.md`
- `.azure/environment.json` (ignored local state)

## Failure Behavior

- Fail closed when the profile is invalid or the requested cloud, tenant, or subscription cannot be selected.
- Surface the Azure CLI login process directly when user interaction is required; do not replace it with repeated login questions.
- Treat unavailable or partial Azure queries as discovery uncertainty. Image quota or deployment uncertainty must remain `unknown` or unavailable rather than being inferred from catalog availability.
- Failed service, model-catalog, Speech-resource, or image-deployment queries abort refresh and retain existing reports. Optional image quota uncertainty stays explicitly `unknown`, never inferred availability.
- MCP service identifiers use the emitted lower-case namespace syntax, including underscores such as `get_azure_bestpractices`. Schema compatibility does not enable MCP or bypass the opt-in and Foundry Extensions client-ID gates.
- Invalid profiles, unsafe paths, and in-progress publication fail explicitly. Do not take over another writer's lock; retain backups if rollback itself fails.
- Never claim deployment readiness from discovery alone.

## Approval Gates

Discovery is read-only and does not require deployment approval. Limited-access or preview model use, deployment, billable inference, or any other external mutation requires its normal explicit approval gate.

## Composition and Dependencies

- project-handoff

Consumers must reference this skill and its produced files instead of copying Azure queries, schemas, or cache-age constants. JavaScript consumers can import `inspectCachedDiscovery` for read-only inspection or `ensureDiscovery` to refresh through the existing PowerShell owner. An agent invokes `azure-discovery` when inspection requires refresh, then reloads and validates the resulting evidence before continuing. Neither reuse nor refresh approves deployment or inference.

`project-video` and `project-visual-storytelling` use this owner's shared validation and freshness policy. Their diagnostic and local-only paths inspect evidence without refreshing it. Eligible Azure operations delegate refresh under their existing approval gates, then revalidate provider readiness and downstream evidence. A refreshed discovery record never silently rebinds an existing media manifest or reviewed render plan.

## Examples

- `/azure-discovery -Commercial`
- `/azure-discovery -Gov`
- `/azure-discovery` uses the saved profile or initializes an Azure Commercial profile when no cloud was selected.
- `Invoke-AzureDiscovery -Refresh` performs a new probe even when cached evidence is current.
- A report exactly 30 days old is reusable; a report older by one millisecond is refreshed before use.
- A report may show a GA image model in the catalog while quota remains `unknown`; consumers must not treat that combination as deployable.

## Related commands

- Run the skill with /azure-discovery.
- Open this help with /azure-discovery-help.
- Inspect the full contract with @.github/skills/azure-discovery/SKILL.md.
