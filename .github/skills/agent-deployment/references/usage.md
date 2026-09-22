# Governed deployment inputs and recovery

The Foundry execution adapters are **preview prompt agents and reviewed prebuilt hosted agents on Azure Commercial**. Tests validate orchestration and HTTP contracts with fakes, not a live tenant. Preview acceptance does not assert production support, model-region availability or live compute validation.

## Prepare a target project

Use a separate project directory. Never select the framework root or its descendants. The existing `.azure/environment.json` must record `AzureCloud`, the intended subscription and tenant, the requested location/environment, an `interactive` or `managed-identity` authentication method, and `mutationPolicy: "approval-required"`. The script never logs in or switches accounts/clouds. It checks the current `az account show` and token account against this profile, obtains an Entra token for `https://ai.azure.com`, and keeps it in memory only.

On Windows, an absolute `az.exe` or `az.cmd` is resolved from installed PATH locations and called through the shipped Windows PowerShell `-File` bridge. Only fixed read-only argument vectors are allowed: version, current cloud, current account, and token acquisition for the fixed Foundry or ARM audience. Executable paths are passed as data, dangerous launcher-path metacharacters are rejected, and no command-string evaluation, execution-policy override, `shell:true`, user arguments, or provider bodies enter the bridge. Non-Windows hosts execute the resolved Azure CLI directly with `shell:false`. Launcher/authentication failures are redacted and never trigger login or installation.

Create `.azure/agent-deployment-allowlist.json` **in the target project**, review the exact project endpoint, and replace the example host/project:

```json
{
  "schemaVersion": "1.0.0",
  "cloud": "AzureCloud",
  "projectEndpoints": [
    "https://example.services.ai.azure.com/api/projects/example-project"
  ]
}
```

The allowlist shape is defined at `$defs.endpointAllowlist` in the deployment request schema. Its bytes and the existing profile bytes are digest-bound into every executable plan. URLs with credentials, queries, fragments, ports, alternate hosts, or path traversal are rejected; redirects are never followed with a token.

## Request example

This is an **update** of an existing pinned agent. Replace the blueprint digest with the SHA-256 of the exact file bytes. The blueprint ID determines the provider agent name. The model deployment must already exist and have been reviewed for quota, pricing and residency; the adapter does not deploy models or infer these properties from a hostname.

```json
{
  "schemaVersion": "1.0.0",
  "blueprint": {
    "path": "agents/review-helper.blueprint.json",
    "sha256": "0000000000000000000000000000000000000000000000000000000000000000"
  },
  "target": "foundry-endpoint",
  "release": "release-1",
  "mode": "update",
  "cloud": "AzureCloud",
  "environment": "development",
  "audience": "individual",
  "data": {
    "classification": "internal",
    "boundary": "organization",
    "residency": ["eastus"]
  },
  "runtime": {
    "kind": "prompt",
    "tools": [],
    "acknowledgeLocalCapabilitiesOmitted": true
  },
  "verification": {
    "prompt": "Reply with HEALTHY only.",
    "expectedSubstring": "HEALTHY",
    "maxOutputTokens": 32
  },
  "rollback": { "strategy": "repin", "version": "1" },
  "acceptPreview": true,
  "foundry": {
    "projectEndpoint": "https://example.services.ai.azure.com/api/projects/example-project",
    "apiVersion": "v1",
    "modelDeployment": "existing-model-deployment",
    "location": "eastus",
    "versionPolicy": "pinned",
    "protocols": ["responses"],
    "authorization": "Entra",
    "quotaReviewed": true,
    "costReviewed": true
  }
}
```

`rollback.version: null` for update/promotion means capture the currently pinned prior version during the read-only plan. An explicit version must match that version. For initial **create**, use `mode: "create"` and `rollback: { "strategy": "manual", "version": null }`; agent creation exposes the stable endpoint immediately. For **promote**, select `mode: "promote"` and `foundry.promoteVersion`; the existing immutable definition must exactly match the packaged prompt and model. No new version is created.

An existing agent that tracks `latest` is rejected **before** candidate creation, because creating a new version could immediately change serving traffic. Convert to a reviewed pinned prior version through a separately approved operation and then generate a new deployment plan. A `latest` observation is not an approved rollback target; unavailable plans expose no automatic rollback version. Initial creation itself has an external effect and is never described as isolated staging.

The selected prior and promoted versions must be active, non-draft versions of the requested runtime. The official v1 TypeSpec explicitly defaults omitted non-hosted status to `active`; this adapter applies that default only to prompt versions and never invents hosted readiness. Explicit `creating`, `failed`, `deleting`, `deleted`, unsupported runtime or draft state blocks activation.

## Prebuilt hosted requests

Set `runtime.kind` to `hosted`, omit `foundry.modelDeployment`, and supply `hosted`:

```json
{
  "image": "approved.azurecr.io/review-agent@sha256:1111111111111111111111111111111111111111111111111111111111111111",
  "sbom": { "path": "sbom.json", "sha256": "<exact-file-sha256>" },
  "testedAgentName": "tested-source-agent",
  "testedVersion": "1",
  "testEvidence": { "path": "hosted-test.json", "sha256": "<exact-file-sha256>" },
  "cpu": "0.5",
  "memory": "1Gi",
  "protocolVersion": "2.0.0",
  "idleTimeoutSeconds": 900,
  "startupTimeoutSeconds": 300,
  "registryConnectionId": "existing-reviewed-registry-connection",
  "codeReviewed": true,
  "imageProvenanceReviewed": true
}
```

The image must use an immutable digest from a host in the target allowlist's `containerRegistries`. An optional existing registry connection reference is passed as `registry_connection_id`; no credentials are copied. The source agent/version must already exist in the same project, be active and non-draft, and contain the exact requested hosted runtime definition. Source ZIP, remote dependency builds, arbitrary environment variables, image pushes and registry/RBAC provisioning are not performed.

The test receipt follows `$defs.hostedTestEvidence` in the request schema. It binds `agentName`, `version`, `image`, `blueprintSha256`, successful `probeResponseSha256`, `passed: true`, `verifiedAt` and `expiresAt`. Operator-attested receipts require explicit review, must be at most seven days old, and cannot outlive 31 days from verification. The live read-only source probe corroborates the referenced active version and exact definition; a receipt alone cannot prove remote readiness.

`hosted-code-execution` is a distinct required approval. v1 hosted creation starts billable compute. The accepted immutable version ID is journaled before exact-version polling. Only its expected lifecycle transition may change while waiting; unrelated drift, startup timeout or failure produces a partial result and never pins or invokes the candidate. After active readiness, normal pinning, bounded invocation and prior-version repin rollback apply. Compute pricing, remaining quota and downstream permissions require review outside this API slice.

Every input path is relative to `--project`. Absolute paths, traversal, symlinks/junctions, hard-linked files, Windows device names and alternate streams are rejected. Source digests use raw bytes, so even whitespace changes invalidate review.

## CLI and imported interface

Direct script commands are `package`, `capabilities`, `plan`, `apply`, `verify`, `status`, `rollback`, and `help`. The parent CLI forwards `pso agent package ...` to `package` and `pso agent deploy <action> ...` to that action.

- `package --project <root> --request <relative.json> [--json]`
- `plan --project <root> --request <relative.json> [--ttl-minutes 1..60] [--json]`
- `apply --project <root> --plan <relative.json> --plan-digest <sha256> --accept-risk --approve <classes> [--json]`
- Foundry `verify` uses the same reviewed plan/digest and `endpoint-invocation` approval. Platform `verify` is read-only and requires only project/plan; it never invokes a model or performs tenant approval.
- `rollback` uses the same reviewed plan/digest and only `rollback-routing` approval.
- `status --project <root> [--plan <relative.json>] [--json]` is read-only and never invokes a model.
- `capabilities [--json]` and `help` need no project and make no provider calls.

Apply approval classes come directly from `requiredApprovals` in the reviewed plan. Each is checked again immediately before its operation; no general-purpose command, URL, request body, or bypass can be embedded in plan steps. The explicit digest is the operator's review binding, not a digital signature or a replacement for host filesystem access controls.

Plans also bind the exact deployment runtime and schema bytes. A runtime/schema upgrade requires a new review, even when the request is unchanged. The v1 API does not offer this workflow as an atomic transaction: concurrent remote writers must coordinate, and unexpected pre/post-operation changes stop in a partial state rather than automatically retrying or deleting another actor's work.

`agent-deployment.mjs` exports side-effect-free `digest`, `stableJson`, `validateRequest`, `validateContract`, `getCapabilities`, and async `runDeployment(command, options, dependencies?)`, plus CLI `main(argv, dependencies?)`. Option keys for imports are `project`, `request`, `plan`, `planDigest`, `acceptRisk`, `approve` (array), and `ttlMinutes`. Trusted in-process test dependencies are `now`, `providerFactory`, `runAzureCli`, `fetch`, and `frameworkRoot`; none can be supplied through CLI, request, plan, or environment overrides. The CLI uses only the built-in adapter. Low-level `createFoundryProvider(context, dependencies?)` is a testable transport, not an approval-bearing command interface.

## Evidence and recovery

Packages live under `reports/agent-deployment/<id>/packages/<sha256>/`; a manifest binds all file names, lengths and digests. Run plans are preserved under `runs/<plan-id>/plan.json`, state under `state.json`, and accepted/started/failed events in `journal.jsonl`. Summary reports are `reports/agent-deployment-{plan,result,state}.json`. Previously accepted run journals are never rewritten.

The deployment skill also owns checked native staging/output workspaces under `reports/agent-deployment/platform-work/<tool>/<package-sha>/`, used by leaf defaults when no explicit checked run workspace is supplied. These hold reviewed inputs and bounded nonsecret outputs only; the tool and package digest do not authorize writes outside this subtree or other approved deployment run workspaces.

For central CLI requests, `outputDirectory` and `outputFile` are **workspace-relative**: use an
output directory such as `output`, or an export file such as `output/ReviewedAgent.zip`.
Do not put a request hash, plan ID, package hash, or project-level report prefix in those values.
The core resolves them beneath the package-bound workspace named in the reviewed plan and uses
that same workspace for planning, application, verification and replay. Input file references
remain relative to the target project. Low-level provider factories receive the resolved
project-relative output paths; they do not independently reinterpret the public request.

An unknown timeout may mean a remote operation succeeded. The started event and `partial` result deliberately prevent an automatic create replay. Preserve evidence, inspect provider state read-only, and review a new request/plan or separately authorized manual recovery. An interrupted run may leave a project lock; determine that no process owns it and reconcile the journal before an operator removes that specific lock. No force/unlock option bypasses this gate.

Rollback is a **repin**, not deletion, model retirement, identity cleanup, solution import or tenant unpublication. It requires a still-valid plan, unchanged inputs, a known current remote snapshot, and an unchanged prior immutable version. When the review expires, create a new reviewed promotion request with the prior version and its original blueprint, or use separately governed manual recovery. There is no automatic delete rollback for initial creation.

Repinning cannot undo prior invocations, incurred charges, identity or permission changes, or channel effects. Unrelated remote identity, definition, protocol, authorization or endpoint-policy drift blocks rollback rather than being overwritten. Only an explicit agent-object HTTP 404 following a successful collection capability probe means absent; authentication/CLI errors, 403 responses, missing collection APIs and transport failures remain blocking errors. A response lost after creation preserves a started/failed journal and a partial result, never an invented accepted version or automatic retry.

## Microsoft 365 / Teams execution

Use `target: "microsoft-365-copilot-and-teams"` with the strict `microsoft365` object in `$defs.microsoft365`. It names the exact Commercial project endpoint/location, existing `agentVersion`, canonical `definitionSha256`, digest-bound `testEvidence`, Bot resource group/name/mode, and exact camelCase app metadata. `publishScope` is `Shared`, `Personal`, or `Tenant`; audience must agree. The Bot mode is `existing` or `create-or-verify`.

The successful test receipt follows `$defs.publicationTestEvidence`: it binds project endpoint, agent name/version, definition and blueprint hashes, a successful bounded invocation hash and dated verification/expiry. It must be fresh within 24 hours. Publication probes corroborate the actual active pinned version and unique identity; they never create an agent version or invoke a model. Include both the Foundry region and `global` in reviewed residency requirements because global Bot/Microsoft365 processing is not inferred to remain within the Foundry region.

Add the exact Bot resource group to `.azure/agent-deployment-allowlist.json` as `botResourceGroups`. The resource group and registered `Microsoft.BotService` provider must already exist. New bridges use the documented `Microsoft.BotService/botServices@2022-09-15` SingleTenant/global/F0 resource and enabled `MsTeamsChannel`. Existing identity, tenant, endpoint or channel mismatches block rather than being overwritten. The documented Activity bridge route has its separate `2025-05-15-preview` protocol query; project configuration and publication use `api-version=v1`, never an obsolete `2025-11` publication URL.

The plan separates `bot-resource-change`, `teams-channel-change`, `endpoint-authorization`, optional `public-activity-exposure`, and either `publication-submission` or `tenant-publication`. Set `enableM365PublicEndpoint` explicitly; enabling the public Activity exception never changes the Foundry account's other private endpoints. Protocol/auth collections are copied in full before adding the reviewed Activity/Bot scheme. The active version selector is never changed by publication.

Accepted resource IDs are journaled before waiting for readiness. Lost responses or later failures retain partial evidence and cannot replay PUT/PATCH/POST blindly. `POST /agents/{name}/microsoft365/publish?api-version=v1` sends exact camelCase metadata with `publishAsAutopilot: false`. Tenant submissions end at `pending-admin-approval`; Shared/Personal ends at `publication-submitted`. Neither result proves a working conversation or accepted catalog listing. Read-only verification checks the retained bridge/agent evidence and keeps these boundaries. No automatic unpublish, role assignment, provider registration or destructive rollback is implemented.

Subsequent ordinary Foundry version updates currently **gate** published Activity/Bot authorization surfaces for a separate review instead of stripping them or silently reverting to Entra-only configuration.

## Native PAC and Agents Toolkit execution

Native requests use `runtime.kind: "application"`, retain `tools: []` and the explicit local-capability omission acknowledgment, and set `rollback: { "strategy": "manual", "version": null }`. This represents an application/solution operation, not a remotely executable interpretation of portable prompt tool labels.

Package verification and immutable reuse compare each file within its already-validated exact
byte length. Binary inputs are not restricted by the smaller JSON/read-default limit; native
archive and aggregate input-size limits still apply.

- `copilotStudio.operation`: `pack`, `import`, `publish`, or `export`. Its central schema fragment is identical to `pac.mjs`'s exported `requestSchema`.
- PAC import optionally selects `solutionType: "managed" | "unmanaged"`; omission remains **managed** for backward compatibility. `unmanaged` is accepted only when the common request `environment` is explicitly `development`. Staging, production and missing stage are rejected before provider/CLI calls, and the exact ZIP `Managed` state must match the selected type. This supports development pack-to-import without implicit publication; export remains managed.
- **PAC publish updates all connected channels.** It is not a single-channel deployment. Review every connected channel, its audience, authentication and data exposure before approving `agent-publication`; an import or successful package does not perform this publication.
- `agentsToolkit.operation`: `provision`, `deploy`, `package`, `publish`, or `update`. Its central schema fragment is identical to `atk.mjs`'s exported `requestSchema`.
- Every configuration pins `expectedCliVersion`; remote operations bind the explicit environment and operator-reviewed CLI identity evidence. `identityEvidence` contains only `sha256`; the tenant binding comes from the local profile, not copied request identifiers.
- File references are `{ "path": "<target-relative path>", "sha256": "<exact file hash>" }`. Source-tree arrays must cover the full consumed tree. The core packages/revalidates references; leaf adapters stage and recheck native source, manifests, solution ZIPs and settings. A changed request, file, profile, tool evidence, package or implementation invalidates mutation approval.
- Native plan/apply is one explicit operation. PAC uses separate `local-package-execution`, `solution-import`, `agent-publication`, and `solution-export` approvals. Toolkit uses `toolkit-provision`, `toolkit-deploy`, `toolkit-package`, `toolkit-publish`, or `toolkit-update`; only the provision/deploy lifecycle operations additionally require **`reviewed-code-execution`**.
- Toolkit publish/update uses a reviewed retained ZIP through the current direct package handlers, not `models/publish.ts` lifecycle execution. These commands pass `--package-file` without `--manifest-file`, which the vendor treats as conflicting options. The manifest reference still binds and validates package identity; it is not a conflicting command argument.
- The supported lifecycle subset rejects arbitrary scripts, credential-producing actions and installation stages. Any raw `typeSpec/compile` marker in consumed YAML, including a comment, is rejected before CLI calls because the SDK's project-type detector can invoke `npm install`. There is no hidden TypeSpec installation exception. CLI arguments are fixed, noninteractive and safely launched; neither CLI is given an invented general `--json` flag.
- Imported/provisioned/deployed/packaged outcomes are not publication. Native status/launch-information evidence does not invent catalog approval. Retained artifacts and source-stage approval remain available for separately reviewed recovery; there is no atomic rollback, automatic downgrade, forced import or uninstall.

Existing requests without an execution configuration remain explicit nonexecuting compatibility handoffs. They do not silently execute new provider operations. Supply the appropriate strict configuration to enable the supported branch.

## Operator and unsupported boundaries

- **Hosted Foundry:** supported for prebuilt allowlisted immutable images with the prerequisites above. Image authoring/build/push, source-ZIP builds and infrastructure/IAM preparation remain separate work.
- **Foundry Microsoft 365/Teams:** bridge/configuration/submission execution is supported; registration, resource-group permissions, licenses, tenant administration and catalog/conversation acceptance remain explicit prerequisites or operator gates.
- **Agents Toolkit:** reviewed native operations are supported; arbitrary lifecycle YAML and automatic catalog acceptance are not.
- **Copilot Studio:** distinct pack/import/publish/export operations are supported; post-import configuration, per-channel acceptance and compatible recovery still require their own evidence.
- **OpenAI API application:** working server-side `application.mjs` Responses client export, consuming `OPENAI_API_KEY` only in its application's runtime environment. Packaging does not invoke it, host an application, or publish a Custom GPT.
- **ChatGPT Action:** JSON OpenAPI validation/export only. Approved public HTTPS servers, local references, consistent none/OAuth2 authorization-code authentication, consequential mutation confirmation, domain/workspace review and a privacy URL for public sharing are required. No browser automation, GPT-management API or GPT Store publisher is implemented.

Inspect `capabilities --json` for dated official source links and exact support levels. Never interpret `manual-handoff`, `unavailable`, `unverified`, or a successful package as verified deployment.

OpenAI help reviewed on 2026-09-22 describes planned Custom GPT retirement for affected Enterprise workspaces on December 11, 2026, with a migration experience targeted for September 17, 2026. These are planned/targeted dates, not guaranteed availability or a confirmed universal retirement date. Current creation, publishing and migration eligibility vary by account/workspace and product notices. The action export is a compatibility handoff for an eligible existing workspace, not a promise that GPT creation or publication remains available.
