# Infrastructure

Azure discovery and deployment for this project. Azure CLI plus Bicep, orchestrated by PowerShell.

## Not yet verified against a live subscription

This scaffold was generated, compiled, and linted, but **it has not been deployed to a real Azure
subscription**. Run it with `-WhatIf` first and read the plan before you trust it.

## Layout

| File | Role |
| --- | --- |
| `deploy.ps1` | The entry point. Dot-sources the modules below and runs them in order. |
| `azure-environment.ps1` | Persists nonsecret Azure choices, configures MCP opt-in, and establishes the Azure CLI context. |
| `discover.ps1` | Library. Probes services, selects chat and image models, checks image quota, and summarizes compatible image deployments. |
| `deploy-infra.ps1` | Library. Runs `az deployment group create` against `main.bicep`. |
| `main.bicep` | App Service with a system-assigned identity, Key Vault with RBAC, optional Azure OpenAI. |

`azure-environment.ps1`, `discover.ps1`, and `deploy-infra.ps1` are **libraries, not entry points**. Running one directly
defines its functions and exits without doing anything. Only `deploy.ps1` does work.

## Usage

```powershell
# See what would happen, change nothing.
./deploy.ps1 -SiteName contoso-api -WhatIf

# Commercial cloud.
./deploy.ps1 -SiteName contoso-api

# Azure US Government.
./deploy.ps1 -SiteName contoso-api -AzureGov -Location usgovvirginia
```

The first Azure action creates the ignored local profile `.azure/environment.json`. It records the
cloud, region, environment, authentication method, public tenant/subscription identifiers, and Azure
MCP service selection. Explicit `-Commercial` or `-Gov` overrides and updates the profile; otherwise
the saved cloud is used, with Azure Commercial as the final default. The legacy `-AzureGov` switch
remains supported as an alias for `-Gov`.

The Copilot skill `/azure-discovery` runs the same read-only probe and writes both
`reports/azure-discovery.json` and the readable `reports/azure-discovery.md`. Use
`/azure-discovery -Commercial` or `/azure-discovery -Gov` to update the saved cloud.
The report records whether the existing Speech-resource query succeeded plus only the count, kinds,
and regions of compatible accounts. It also discovers Azure OpenAI and Microsoft MAI image models,
prefers generally available `gpt-image-2` over limited-access or preview candidates, checks matching
regional quota, and summarizes compatible image deployments by count, region, model, and format.
Account and deployment names are used only transiently for read-only enumeration. The report never
stores them, resource identifiers, endpoints, subscription or tenant IDs, or keys. Catalog presence
alone is not deployment readiness: missing quota evidence remains `unknown`, and limited-access or
preview models require separate acceptance. `/project-video` requires Speech evidence to be no older
than 14 days before Azure narration.

## Cleanup

Cleanup is read-only by default. Preview a project resource group:

```powershell
./cleanup.ps1 -All -SiteName contoso-api -Commercial
```

Preview a single resource or named group:

```powershell
./cleanup.ps1 -Resource app-contoso-api -RG rg-contoso-api -Gov
./cleanup.ps1 -ResourceGroup rg-contoso-api -Commercial
```

The script lists the subscription, cloud, target, and resources first. To apply a deletion, add
`-Apply` and type `DELETE` when asked. Every result and error is reported; no credentials are stored.

Use `/environment-update` to inventory already-installed development tools and list available
updates. It reports all findings first, supports `-WhatIf` by default, and requires selection and
confirmation before updating a tool.

The entered project name drives every resource name. It is normalized once, and the repeatable
`Get-AzureResourceName` function applies each Azure service's naming limit:

| Resource | Pattern | Worst case |
| --- | --- | --- |
| Resource group | `rg-<normalized-project-name>` | 90 |
| App Service plan | `asp-<short-name>-<hash>` | 40 |
| Web app | `app-<short-name>-<hash>` | 60 |
| Key Vault | `kv-<short-name>-<hash>` | 24 |
| Azure OpenAI | `oai-<short-name>-<hash>` | 64 |
| Azure Speech | `speech-<short-name>-<hash>` | 64 |

`<hash>` is six characters derived from the normalized project name. Names are stable across reruns,
and the full project name remains visible on the resource group and resource tags. Existing deployed
resources are not renamed by adoption or update operations.

## Authentication

Deployment selects the cloud and subscription from `.azure/environment.json`. If authentication is
missing or stale, the scripts start the recorded login flow automatically. Interactive login uses a
device code only after selecting the recorded cloud, preventing Government work from opening a
Commercial authority.

The local profile is excluded from source control. It may contain public tenant, subscription, and
OAuth client IDs, but never passwords, keys, access tokens, refresh tokens, or client secrets.

Azure MCP is disabled until the profile opts in. Workspace sampling and enabled namespaces then
follow the profile. `foundryextensions` stays disabled unless a client ID was explicitly recorded,
so VS Code does not repeatedly request unsupported dynamic client registration.

## How the application authenticates

The web app gets a **system-assigned managed identity**, and `main.bicep` grants it RBAC roles
rather than issuing keys. Use `DefaultAzureCredential` in application code; do not put service keys
in app settings.

## Network access: change this before production

`publicNetworkAccess` defaults to `Enabled` so the baseline deploys to a working state without a
VNet. A freshly created deployment holds no data, so the exposure at that moment is an empty
resource defended by RBAC, which is a reasonable place to start.

That stops being true the moment real data lands. Before it does:

1. Set `publicNetworkAccess` to `Disabled`.
2. Add a VNet, subnet, private endpoints, and private DNS zones, and integrate the web app.
3. Record the decision in `docs/adr/`.

The project's own `bicep.instructions.md` requires private endpoints by default, so leaving this at
`Enabled` will be flagged by `security-review` and `architecture-review` until an ADR explains it.

## Optional components

| Parameter | Default | Turn it off when |
| --- | --- | --- |
| `deployKeyVault` | `true` | The project keeps no secrets of its own. The app setting and role assignment disappear with it. |
| `deployOpenAI` | `false` | Set automatically from discovery; no account is created unless a model was found. |

With `deployKeyVault` false the deployment is just an App Service with a managed identity, which is
often all a stateless service needs.

## Sovereign clouds

`main.bicep` sets `AZURE_CLOUD` to `AzureUSGovernment` or `AzureCloud`. Read that setting at
startup to choose the right authority host and service endpoints, so one build works against both
`.com` and `.us` without a rebuild. The environment module switches the Azure CLI to the requested
cloud and starts its login flow when the saved account is unavailable.

## Region availability

`Get-AzureCognitiveKindRegion` probes **every** region in the current cloud rather than just the
target one. A single-region probe reports a false negative whenever a service is region-limited,
and creating an account in a region that does not list the SKU fails preflight with
`SpecialFeatureOrQuotaIdRequired`. This matters most in Azure US Government, where several AI
services are offered in only one region.

## Extending this

`main.bicep` is deliberately minimal. Add the services your application actually needs, grant the
managed identity a role assignment for each, and extend `Invoke-AzureDiscovery` when a service is
not available in every region you deploy to.
