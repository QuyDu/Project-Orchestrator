---
mode: agent
description: Help for the agent-deployment skill.
---

# agent-deployment Help

Package validated agents and applications, review provider-bound plans, and execute approved Foundry deployments, Microsoft 365 submissions, Copilot Studio ALM, or Agents Toolkit operations with durable evidence. Use for governed agent packaging, deployment, publication submission, verification, or recovery; never use to bypass identity, code-execution, or tenant-admin gates.

Explain this contract as help only. Do not execute its procedures or treat examples as action approval.
Read the complete contract at .github/skills/agent-deployment/SKILL.md before using this skill.

## Purpose

Own the governed boundary between validated local agent intent and supported provider operations. Produce deterministic packages and expiring, digest-bound plans; execute only trusted adapter operations after separate approval classes; preserve partial-state evidence and verify pinned versions. Unsupported platforms receive explicit manual handoffs or unavailable results, not success-shaped deployment claims.

## Preconditions

- Work in a separate target project, not this framework launch pad or its descendants. Local unit-test fixtures are not deployed projects.
- Use `agent-builder` to validate the complete source blueprint. Preserve schema 1.0 through 2.2 bytes; normalize legacy ChatGPT publication into a manual handoff without rewriting it.
- Complete applicable policy, architecture, security, and deployment-readiness reviews. A policy denial or unresolved data-boundary requirement blocks execution.
- For Foundry execution, provide an existing Azure Commercial project and, for prompt agents, a model deployment, a matching recorded `.azure/environment.json`, an existing Entra-authenticated Azure CLI session, and `.azure/agent-deployment-allowlist.json` containing the exact approved project endpoint.
- Review quota, model pricing, model-specific processing residency, agent-identity implications, and downstream access separately. The script does not provision these prerequisites.
- Existing agents must have an active service-managed identity, only Responses and Entra configuration, and one retrievable pinned prior version. Legacy identity migration and protocol changes are separate work.
- Hosted execution additionally requires an approved Commercial ACR digest, credential-free JSON SBOM, fresh digest-bound test receipt, an active tested source version with the same runtime definition, reviewed code/provenance, and existing registry access. The framework does not build/push images, provision registries or assign pull roles.
- Microsoft 365 publication requires a tested active pinned agent, unique identity, an independently allowlisted Bot resource group, prior `Microsoft.BotService` registration, reviewed metadata/data flow, and explicit public Activity exposure intent. Resource-group existence, permissions, licenses and tenant approval are prerequisites, not automatically granted.
- Native PAC/Toolkit execution requires `runtime.kind: application`, an exactly pinned installed CLI version, explicit operation/environment, complete reviewed input hashes and operator-reviewed identity evidence. Credential/auth setup stays outside execution.

## Inputs

- A strict `agent-deployment-request.schema.json` request: source blueprint path and SHA-256, exact target, cloud, environment, release, mode, audience, data classification and residency, bounded verification, rollback requirement, and explicit preview acceptance.
- Explicit acknowledgment that portable `read`, `search`, `web`, `edit`, `execute`, `agent`, and `todo` labels are local design metadata, not remote grants. Executable prompt deployment has no runtime tools, subagents, or handoffs.
- Provider-specific nonsecret metadata; Foundry uses one exact HTTPS project endpoint, pinned `v1`, `pinned` routing, Responses and Entra. Prompt execution uses an existing model deployment. Hosted execution uses an immutable OCI digest, reviewed CPU/memory/session limits, digest-bound SBOM and test evidence, and a tested source version.
- The unchanged reviewed plan, its SHA-256, `--accept-risk`, and explicit operation-class approvals for apply, invocation, or rollback.
- Optional ChatGPT JSON OpenAPI source with immutable digest, approved HTTPS hosts, authentication, privacy policy when publicly shared, workspace-policy and cross-platform data-flow review.
- OpenAPI operations, path items and authentication schemes must be inline so their effective policy is reviewable. Ordinary local data-schema references remain supported; referenced action/security objects are rejected rather than exported unchecked.
- `microsoft365` selects tested-agent publication and bridge management. `copilotStudio.operation` selects only `pack`, `import`, `publish`, or `export`. `agentsToolkit.operation` selects only `provision`, `deploy`, `package`, `publish`, or `update`. Native configuration fragments exactly match their exported leaf schemas.
- Native `outputDirectory` and `outputFile` values are relative to the package-bound workspace shown in the central plan, not to the project root; input references remain project-relative. Planning, execution and verification use the identical output workspace.

## Approved Tools and Resources

- Use `scripts/agent-deployment.mjs` through `pso agent package` or `pso agent deploy capabilities|plan|apply|verify|status|rollback`.
- Use Node built-ins and the already installed Azure CLI, PAC, or Agents Toolkit CLI required by the selected adapter. Credentials remain in provider stores or are acquired from the Azure CLI session in memory; they are never accepted in requests, command options, reports, packages, or errors.
- The executable transport uses fixed official Foundry v1 REST routes, exact host allowlisting, bounded responses, timeouts, and redirect rejection. No editable plan step is executable code.
- `scripts/providers/registry.mjs` records dated provider support levels, official evidence sources, manual prerequisites, and lifecycle limits. Preview requires explicit acceptance; Azure Government is unverified and blocked.
- Do not invoke Azure MCP, install tools, log in, select another cloud/account, invoke arbitrary commands, or automate product browsers.

## Read and Write Boundaries

- Read only target-relative, nonsymlink input paths, the target Azure profile and endpoint allowlist, and read-only provider metadata during planning/status.
- Write only the three owned report paths below, per-agent packages/run evidence, and checked native workspaces under `reports/agent-deployment/platform-work/<tool>/<package-sha>/` in the target project. Native workspaces contain reviewed staged inputs and bounded nonsecret generated artifacts; they are not arbitrary output-path authority.
- Do not overwrite source blueprints, local agent definitions, other skill reports, or accepted execution-log events.
- Never write through symbolic links, junctions, hard-linked files, path traversal, device names, or alternate data streams.
- Foundry execution is limited to immutable prompt or hosted version creation, bounded hosted-readiness polling, initial Responses/Entra configuration, pinned routing, and one separately approved bounded invocation per verification. Hosted creation starts service-managed compute and executes the reviewed image. No role assignment, model provisioning, container build/push, registry provisioning or destructive deletion is performed.
- Microsoft 365 execution may create the specifically approved Bot/Teams bridge, add reviewed Activity/Bot authorization without dropping existing endpoint settings, and submit v1 publication metadata. Native operations execute only their reviewed fixed CLI contract from staged project inputs. No arbitrary command/body from a plan is dispatched.

## Procedure

1. Validate the request against the shipped schema and reject credential material before creating artifacts or contacting providers.
2. Validate the entire blueprint through `agent-builder`; normalize distribution as a pure read. Confirm source and ancillary input digests, intended target, environment, audience, and data boundaries.
3. Package deterministic source bytes, rendered local agent, tool-free prompt instructions, provider definition or nonexecuting export, and a hashed manifest. Reusing a package requires every byte and file-set entry to match.
4. Discover support from the fixed registry. Return `unavailable` for unaccepted previews, Government, policy/profile conflicts, unsupported runtime mappings, unmet residency requirements, or hosted image/test/registry readiness failures. Respect each other control plane's declared execution and operator/admin gates.
5. For an executable plan, validate the saved profile and endpoint allowlist; check the current CLI cloud, account and tenant without changing them; probe the agents and complete bounded version-list contracts read-only. Capture the prior pinned selector, identity, immutable definitions, full endpoint-configuration digest, tool versions, and remote-state digest.
6. Produce an expiring plan, default 60 minutes, with exact mutations, required permissions, approval classes, blast radius, identity effects, quota/cost limitations, verification and rollback procedures. Preserve a run-specific immutable copy. No model invocation occurs during planning.
7. Apply only with the exact reviewed digest and all required approval classes. Recheck request bytes, package files, profile/allowlist, registry, plan derivation, lifetime and remote state. Acquire a per-project exclusive lock.
8. Derive operations from trusted adapter code and the revalidated request, not plan strings. Before each approved mutation, recheck local evidence and remote drift; persist a started journal event. Persist returned identifiers and accepted evidence before proceeding. Never retry an ambiguous mutation automatically.
9. For prompt creation/update, create one immutable tool-free version. Initial creation also creates a live stable endpoint and requires a separate configuration approval. For promotion, require an existing version whose definition matches the package. Pin 100 percent of traffic to the exact version.
   For hosted creation/update, require distinct `hosted-code-execution` approval, verify the source hosted version and image against fresh test evidence, create the immutable hosted definition through v1, and journal the accepted version ID before polling its exact readiness. Permit only its expected `creating` to `active` transition; unrelated drift, timeout, failure or unknown status stops without pinning or invocation. Promotion also rechecks hosted-code authority and active readiness. Only prebuilt reviewed image definitions are supported; source ZIP, remote builds and arbitrary environment variables remain out of scope.
10. Verify the pinned selector, active identity, exact immutable definition, Responses and Entra configuration; invoke once with the bounded reviewed prompt; require a completed response containing the expected text. Persist only the response identifier and output digest, never model output or credentials.
11. Replays of a verified unchanged run perform only fresh read-only checks. Interrupted/partial runs require reconciliation and cannot replay creation. Status without local execution evidence is `unverified`, even when a remote resource might already exist.
12. Roll back only after separate `rollback-routing` approval, exact input/plan checks, fresh remote-state checks and prior-version validation. Repin and verify the captured prior version; retain created versions and identities. First creation has no automatic deletion rollback.
13. For Microsoft 365/Teams, probe the exact tested active pinned version and unique identity, registered Bot provider, and allowlisted resource group. Refuse existing bot/channel identity, tenant, endpoint or configuration mismatches instead of overwriting them. Journal accepted bridge IDs before bounded readiness checks. Preserve every endpoint protocol, authorization entry and version selector when adding Activity and `BotServiceRbac` or `BotServiceTenant`. Public exposure needs its own approval. Submit exact v1 camelCase metadata; Shared/Personal terminates at `publication-submitted`, Tenant at `pending-admin-approval`, never invented catalog or conversation verification.
14. For Copilot Studio, execute pack, import, publish or export as distinct native operations. Validate retained ZIP identity, settings and explicit environment; import never publishes implicitly. PAC publish updates all connected channels, not one selected channel; review the entire connected-channel audience and data exposure before publication approval. For Toolkit, provision/deploy are lifecycle operations and additionally require `reviewed-code-execution`; package is a separate artifact operation, while publish/update submit a reviewed retained ZIP through direct package handlers, not a publish lifecycle. Never combine `--package-file` with conflicting `--manifest-file` on publish/update. Freeze consumed YAML/working-tree bytes and reject unsupported scripts, credential outputs, installation actions and any raw `typeSpec/compile` marker, including comments, before CLI calls. Use existing vendor authentication and documented noninteractive flags; never invent a general `--json` flag.
15. Platform verification is read-only: use accepted receipts, retained artifact digests and supported status/launch-information calls. It never invokes a model or approves tenant submissions. Platform rollback is an explicit manual recovery gate; do not substitute uninstall, forced import, downgrade or stage-and-upgrade for atomic rollback.
16. Export OpenAI API application client code only for a project-owned server-side application. Validate ChatGPT action OpenAPI, HTTPS domains, local references, authentication and consequential-action flags; export a manual compatibility handoff only. Neither target is a GPT-management or GPT Store publisher.

## Validation

- `node --test tests/agent-deployment.test.mjs` uses isolated project fixtures and injected provider/CLI/HTTP fakes; no live network or tenant mutation is part of tests.
- Schema/runtime checks reject unknown properties, bad enums/types, invalid paths, unbounded probes, unsupported tool mappings and credential fields.
- Package and plan digests are deterministic for the same evidence and clock; package, request, plan, profile, allowlist, registry, runtime/schema, remote or journal drift blocks replay.
- Missing approvals produce no provider call. Every supported operation records started and accepted or failed state; partial results never claim success.
- Verification proves only the pinned endpoint and bounded smoke response, not broad model quality, residency guarantees, downstream permissions, marketplace acceptance, or service-level availability.
- Live tenant validation, Government availability and provider-specific operator/admin prerequisites remain explicit gaps. Hosted REST/polling behavior is validated with fakes, not a live compute deployment. Do not promote the skill lifecycle based solely on fake-provider tests.

## Outputs

- `reports/agent-deployment-plan.json`
- `reports/agent-deployment-result.json`
- `reports/agent-deployment-state.json`
- `reports/agent-deployment/<agent-id>/packages/<sha256>/`
- `reports/agent-deployment/<agent-id>/runs/<plan-id>/`
- `reports/agent-deployment/platform-work/<tool>/<package-sha>/`

## Failure Behavior

- Fail closed with redacted structured errors; do not echo provider bodies, CLI output, secrets, model output, tenant identifiers, or user-controlled exception messages.
- Record `partial` or `rollback-partial` after ambiguous or accepted mutations. Preserve immutable run plans and append-only journals; never remove remote versions automatically.
- A stale process lock, divergent journal, unknown remote outcome, expired review, changed identity or rollback target blocks mutation until operator reconciliation and fresh review.
- Manual and unavailable plans cannot apply. CLI exit code `0` represents a completed local/provider operation or verified supported execution; `2` represents manual, unavailable, unverified, drifted, partial, submitted, verification-required or pending-admin outcomes; `1` represents a rejected operation.
- A successful package, solution import, submitted app, or empty remote state is never evidence of runtime deployment or publication.

## Approval Gates

Require explicit approval before every external mutation class: `agent-version-create` for prompts, `hosted-code-execution` for reviewed hosted code/compute, `endpoint-configuration`, `endpoint-routing`, `endpoint-invocation`, and independently `rollback-routing`. Bind approval to `--plan-digest`; `--accept-risk` alone is insufficient. Credential access is read-only through the current CLI session and does not authorize login, cloud switching, RBAC, installation, deletion, publication, commits, or pushes. Tenant and marketplace administrators retain their own approval authority.

Platform operations additionally require distinct `bot-resource-change`, `teams-channel-change`, `endpoint-authorization`, `public-activity-exposure`, `publication-submission` or `tenant-publication` approvals as applicable. Native operations require their local-package, solution import/export, agent publication or Toolkit operation class; Toolkit provision/deploy additionally require `reviewed-code-execution`. Retained-ZIP publish/update keeps its separate operation approval without granting lifecycle-code authority. These authorize only the reviewed operation or submission, never admin approval, destructive recovery, arbitrary scripts or catalog acceptance.

## Composition and Dependencies

### Prerequisite Dependencies

- clarify-the-ask
- agent-builder
- policy-engine
- azure-discovery
- architecture-review
- security-review
- deployment-review
- workflow-state-manager
- workflow-telemetry
- project-handoff

### Ownership Decisions

`agent-builder` owns source validation and pure distribution normalization; it does not depend back on deployment. Governance/review skills remain read-only or own their separate state and handoff artifacts. This skill exclusively owns its execution reports and package/run subtree. Supported provider operations are explicit adapters; tenant/admin acceptance, unsupported recovery, application hosting outside these adapters and GPT product publication remain separate boundaries.

## Examples

- `pso agent package --project C:\work\my-project --request deployment-request.json --json`
- `pso agent deploy plan --project C:\work\my-project --request deployment-request.json --json`
- `pso agent deploy apply --project C:\work\my-project --plan reports\agent-deployment-plan.json --plan-digest <reviewed-sha256> --accept-risk --approve agent-version-create,endpoint-routing,endpoint-invocation`
- Add `endpoint-configuration` for initial create. It is not an RBAC or tenant-publication approval.
- `pso agent deploy rollback --project C:\work\my-project --plan reports\agent-deployment-plan.json --plan-digest <reviewed-sha256> --accept-risk --approve rollback-routing`
- `pso agent deploy capabilities --json` identifies supported preview adapters, Government unavailability and provider-specific operator/admin gates.

## Related commands

- Run the skill with /agent-deployment.
- Open this help with /agent-deployment-help.
- Inspect the full contract with @.github/skills/agent-deployment/SKILL.md.
