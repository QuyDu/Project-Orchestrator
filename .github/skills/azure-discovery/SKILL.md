---
name: azure-discovery
description: Discover Azure Commercial or Azure US Government service, chat model, image-generation model and quota, and sanitized deployment availability for the current project, persist dated results, and identify when a refresh is needed.
lifecycle: tested
confidence: medium
---

# azure-discovery

## Purpose

Resolve and persist the project's Azure environment once, establish the matching Azure CLI context automatically, then discover services, regions, chat and image-generation models, SKUs, API versions, quota certainty, and nonsecret Speech-resource readiness and image-deployment readiness in Azure Commercial or Azure US Government.

## Preconditions

- Read repository instructions and the current project handoff first.
- Read `reports/azure-discovery.json` and `reports/azure-discovery.md` when present.
- Read `.azure/environment.json` when present and reuse it without asking for the cloud, subscription, MCP policy, or login again.
- Confirm Azure CLI is installed. When its context is absent or mismatched, start the authentication method recorded in the local profile rather than asking whether to log in.
- Never request or record credentials or tokens. Tenant, subscription, and OAuth client IDs are nonsecret identifiers and may exist only in the ignored local profile, never in discovery reports or distributable templates.

## Inputs

- Optional `-Commercial` or `-Gov` selection. An explicit flag updates the local profile; persisted configuration is next in precedence; a missing profile defaults to Azure Commercial.
- Optional target location and preferred chat model. Image generation uses a fixed safety order: generally available Azure OpenAI image models, limited-access Azure OpenAI image models, then preview Microsoft MAI Image models.
- One-time environment name, subscription target, authentication method, and Azure MCP service selection when the local profile does not exist.

## Approved Tools and Resources

- The packaged `.github/skills/azure-discovery/scripts/azure-environment.ps1` and `azure-discovery.ps1`. `infra/azure-environment.ps1` and `infra/discover.ps1` remain compatible project-infrastructure copies when present.
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
4. Select the profile's Azure CLI cloud. When no matching account is active, immediately start the recorded login method; interactive login uses device code in the selected cloud. Select the recorded subscription after login.
5. Dot-source `.github/skills/azure-discovery/scripts/azure-discovery.ps1` and invoke `Invoke-AzureDiscovery` with the resolved cloud, location, and optional chat-model preference. Discover compatible image models from the active cloud and region, select generally available `gpt-image-2` ahead of limited-access Azure OpenAI and preview MAI Image candidates, and record whether non-GA acceptance is required.
6. Query regional Cognitive Services usage for the selected image model. Record `available`, `exhausted`, or `unknown` only when matching usage evidence supports that status; missing or failed quota queries remain `unknown`.
7. Enumerate existing compatible image deployments across `OpenAI`, `AIServices`, and `CognitiveServices` accounts. Use account names and resource groups only as transient CLI inputs, fail the aggregate closed on any partial query failure, and persist no resource, account, deployment, endpoint, subscription, or tenant identifier.
8. Persist the JSON result and readable Markdown report, including the UTC `discoveredAt` timestamp, image catalog and quota certainty, sanitized image deployment aggregates, and Speech query certainty, count, kinds, and regions.

## Validation

- The selected cloud is `AzureCloud` or `AzureUSGovernment`.
- `.azure/environment.json` validates against `schemas/azure-environment.schema.json`, is excluded from source control, and contains no secret values.
- Both report files exist and contain the same discovery timestamp and cloud.
- The JSON report validates against `schemas/azure-discovery.schema.json`; legacy `1.0.0` reports without `imageGeneration` remain valid, while new reports include the strict image summary.
- Image model ordering is generally available, limited access, then preview. A limited-access or preview selection sets `requiresExplicitAcceptance` and never implies authorization to deploy or invoke it.
- Image deployment evidence contains only query certainty, count, regions, model names, and model formats. It contains no resource name, deployment name, endpoint, resource ID, subscription ID, tenant ID, key, or token.
- Discovery failures are reported as unknown or unavailable according to the script output.
- A report older than 14 days is identified as stale before relying on it.

## Outputs

- `reports/azure-discovery.json`
- `reports/azure-discovery.md`
- `.azure/environment.json` (ignored local state)

## Failure Behavior

- Fail closed when the profile is invalid or the requested cloud, tenant, or subscription cannot be selected.
- Surface the Azure CLI login process directly when user interaction is required; do not replace it with repeated login questions.
- Treat unavailable or partial Azure queries as discovery uncertainty. Image quota or deployment uncertainty must remain `unknown` or unavailable rather than being inferred from catalog availability.
- Never claim deployment readiness from discovery alone.

## Approval Gates

Discovery is read-only and does not require deployment approval. Limited-access or preview model use, deployment, billable inference, or any other external mutation requires its normal explicit approval gate.

## Composition and Dependencies

- project-handoff

## Examples

- `/azure-discovery -Commercial`
- `/azure-discovery -Gov`
- `/azure-discovery` uses the saved profile or initializes an Azure Commercial profile when no cloud was selected.
- A report may show a GA image model in the catalog while quota remains `unknown`; consumers must not treat that combination as deployable.
