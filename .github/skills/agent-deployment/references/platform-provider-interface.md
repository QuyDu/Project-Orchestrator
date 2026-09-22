# Platform adapter execution interface

This is the shared interface for the disjoint PAC and Agents Toolkit adapters and the Microsoft 365 REST publication adapter. The central deployment engine owns approval, review expiry, package/input/profile/runtime drift checks, project locking, durable journals, result/state persistence and idempotent replay. Provider files never write the three summary reports themselves.

The PAC, Toolkit and Microsoft 365 adapters are wired through the central platform execution engine. The normalized DTOs distinguish accepted operations from catalog acceptance; support does not imply live tenant validation or automatic admin approval.

## Module exports

- `pac.mjs`: `createPacProvider(context, dependencies = {})`, `requestSchema`, `validateConfig(config)`.
- `atk.mjs`: `createAtkProvider(context, dependencies = {})`, `requestSchema`, `validateConfig(config)`.
- `microsoft365.mjs`: `createMicrosoft365Provider(context, dependencies = {})`.

Context includes `root`, `request`, `blueprint`, `profile`, `packagePath`, `packageSha256` and optional `workDirectory` (a checked target-relative run workspace). PAC configuration is under `request.copilotStudio`; Toolkit configuration is under `request.agentsToolkit`. The provider author supplies its exact strict JSON Schema fragment as `requestSchema`; the integration owner copies it into the central request schema and verifies equivalence before enabling the adapter.

The central CLI interprets public `outputDirectory`/`outputFile` values as workspace-relative
and resolves them before calling these factories. Its workspace is consistently
`reports/agent-deployment/platform-work/<tool>/<package-sha>/` during plan, apply and verify.
Factories receive resolved project-relative output paths. Neither a request hash nor a plan ID
belongs in a user's output configuration; there is no self-referential path calculation.

Core calls always supply `workDirectory`. Native execution uses `runtime.kind: application`. The central schema's `copilotStudio` and `agentsToolkit` fragments are checked for exact equality with the leaf exports. Every adapter/helper/launcher is included in the reviewed implementation digest.

The skill owns the leaf-default checked workspace `reports/agent-deployment/platform-work/<tool>/<package-sha>/` as well as explicit per-run workspaces. A caller/default workspace must remain package-bound and disjoint from source inputs; staging or output elsewhere is not implied by the interface.

Factories must be side-effect-free apart from read-only authentication/version/capability checks. They return:

```text
probe() -> PlatformSnapshot
execute(operation, receipt = null) -> PlatformOutcome
verify(receipt) -> PlatformOutcome
rollback(receipt) -> PlatformOutcome
```

Operations are closed, code-defined identifiers, never arbitrary CLI arguments, executable paths, shell text, HTTP bodies or request URLs from a plan. The central engine derives them again from the reviewed request. PAC pack, import, publish and export are distinct operations. Toolkit provision, deploy, package, publish and update are distinct operations. Do not combine import/deploy with publication implicitly.

`verify` is read-only. If publication/catalog acceptance cannot be established, return `publication-submitted`, `pending-admin-approval`, or `verification-required`, never `published`. A resource's absence must be proven by the documented missing-resource result, not any CLI failure. A mutation with an ambiguous outcome must throw a redacted `DeploymentError`/`stop` from `contracts.mjs`; the central journal keeps the started operation and prohibits blind replay.

Core does not automatically chain publication to import/deploy. It derives the exact operation from reviewed config, checks all class approvals immediately before execution, journals the start, revalidates remote identity and drift, and retains each accepted outcome. Read-only `verify` may carry a receipt describing a previously accepted mutation; the central verification result clears `mutationAccepted` for that read-only operation without erasing the original execution receipt.

Microsoft 365 resource operations optionally use the core-provided `context.onAccepted(outcome)` checkpoint before readiness polling so known ARM IDs survive later failures. `context.expectedSnapshotSha256` binds the immediate pre-mutation probe. These are trusted in-process hooks, never request/plan fields or caller-supplied command authority.

PAC and Toolkit have no documented atomic rollback operation. Their `rollback` methods must return an explicit blocked recovery requirement rather than inventing a rollback command. PAC cannot export an installed managed solution; retain previously approved managed ZIPs and settings before import. A compatible reimport or environment restore needs its own reviewed recovery plan and must respect Dataverse version/layer rules. `--stage-and-upgrade` is a forward upgrade, not rollback. Toolkit uninstall is destructive cleanup, not rollback; a retained package may support a separately approved republish, not an automatic restore.

## Exact normalized evidence

`providers/platform-contract.mjs` exports the authoritative `platformSnapshotSchema`, `platformOutcomeSchema`, `validatePlatformSnapshot`, `validatePlatformOutcome`, and `assertPlatformProvider`. No additional fields are allowed.

Snapshot:

```text
{
  target: exact platform target ID,
  cliVersion: exact installed semantic version,
  identitySha256: SHA-256 of stable identity/tenant evidence,
  configurationSha256: SHA-256 of stable full relevant remote/configuration evidence,
  resourceIds: bounded noncredential resource identifiers[],
  version: string | null,
  phase: missing | ready | imported | provisioned | deployed | packaged |
         publication-submitted | pending-admin-approval | published | unknown
}
```

Outcome:

```text
{
  status: imported | provisioned | deployed | packaged | publication-submitted |
          pending-admin-approval | published | verification-required | rolled-back,
  responseId: string | null,
  resourceIds: bounded noncredential resource identifiers[],
  version: string | null,
  mutationAccepted: boolean,
  publicationVerified: boolean,
  evidenceSha256: SHA-256 of relevant response/verification evidence,
  messageCode: stable uppercase machine-readable code
}
```

Only `published` may set `publicationVerified: true`, and `published` must set it. Imports, provisioning, packaging, deployment and submission never imply catalog publication. Version and identity probes must omit volatile timestamps from stable digests while including fields whose changes affect authorization or target selection. Never persist raw CLI output, tokens, secrets or authentication identifiers; use the stable identity digest.

## CLI safety and packaging

Use fixed operation tables and a trusted Windows `-File` bridge with executable/arguments passed as data. Never invoke `.cmd` directly with Node `shell:false`, enable `shell:true`, interpolate names/paths into shell text, or override execution policy. Reject dangerous launcher/argument metacharacters and resolve installed executables without installation or login. Test actual isolated fake launchers as well as injected doubles.

Use explicit noninteractive CLI flags when documented and block if the authenticated tenant/environment does not match the target profile and reviewed configuration. Do not accept a default environment silently. Run from the checked project/run workspace, not the source launch pad. Bind every consumed source manifest, solution ZIP, deployment settings file and lifecycle configuration to reviewed bytes. Reject raw secrets and unsupported lifecycle actions; declaring an action in editable YAML is not deployment authority. Generated artifacts and nonsecret tool state must stay in owned target-project paths.

No public request-shape guess is implied by this interface: provider authors must use current official CLI documentation and return actionable blocked errors for unsupported modes. Authentication setup, admin consent and catalog acceptance may remain explicit operator/admin gates; supported provision/import/deploy/publish operations themselves must be implemented and tested, not silently replaced by checklists.

## Verified CLI constraints

- PAC supports `copilot pack`, explicit-environment `solution import`, `copilot publish --bot`, and read-only `copilot status --bot-id`. Do not add an undocumented general `--json` option. `auth who` and `auth list` are read-only; selecting an auth profile is operator setup. A successful import does not publish an agent, and `--publish-changes` requires a separate explicit decision.
- PAC publish updates all connected channels. The publication approval must account for every connected-channel audience and data exposure, not pretend that `--bot` selects only one channel.
- Toolkit supports distinct `provision`, `deploy`, `package`, `publish`, and `update` commands. Always supply documented noninteractive `-i false` for prompt-capable commands. Auth setup is separate; `auth list` is a preflight, not permission to run `auth login`. Do not invent a JSON-output or service-principal flag contract.
- Pack/export success requires a nonempty expected ZIP, its digest, and the relevant manifest identity in addition to an exit code. Read-only status/launch-information lookups do not by themselves prove tenant catalog approval.
- Process stdout/stderr may be captured verbatim **in memory** for a bounded parser/digest, but raw logs must not be persisted or surfaced because credentials or personal identifiers can appear. Reports retain only validated nonsecret fields, bounded error codes, hashes and genuine accepted identifiers.
- Toolkit provision/deploy executes repository lifecycle stages. Treat these as explicit code execution: freeze/review the consumed working tree and YAML, require the separate core `reviewed-code-execution` approval, prohibit scripts/installation/credential-producing actions outside the supported subset, and revalidate before execution.
- Toolkit publish/update routes to direct retained-package handlers. Use `--package-file` without conflicting `--manifest-file`; retain the manifest as package-identity review evidence, not a second CLI input selector. These calls require their operation approval, not a fictitious publish-lifecycle grant.
- Reject raw `typeSpec/compile` anywhere in consumed YAML, including comments, before invoking any CLI. The vendor's project-type check can otherwise trigger `npm install` even though an ordinary YAML parser ignores the comment.

Official sources verified on 2026-09-22:

- [PAC copilot commands](https://learn.microsoft.com/power-platform/developer/cli/reference/copilot)
- [PAC solution commands](https://learn.microsoft.com/power-platform/developer/cli/reference/solution)
- [PAC authentication commands](https://learn.microsoft.com/power-platform/developer/cli/reference/auth)
- [Copilot Studio solution import/export limitations](https://learn.microsoft.com/microsoft-copilot-studio/authoring-solutions-import-export)
- [Dataverse solution ALM](https://learn.microsoft.com/power-platform/alm/solution-concepts-alm)
- [Microsoft 365 Agents Toolkit CLI](https://learn.microsoft.com/microsoftteams/platform/toolkit/microsoft-365-agents-toolkit-cli)
- [Toolkit provisioning actions](https://learn.microsoft.com/microsoftteams/platform/toolkit/toolkit-v4/provision-vs)
- [Toolkit retained-package argument validation](https://github.com/OfficeDev/microsoft-365-agents-toolkit/blob/dev/packages/cli/src/commands/models/teamsapp/update.ts)
- [SDK project-type detection](https://github.com/OfficeDev/microsoft-365-agents-toolkit/blob/dev/packages/fx-core/src/common/projectTypeChecker.ts)
- [SDK TypeSpec tool initialization](https://github.com/OfficeDev/microsoft-365-agents-toolkit/blob/dev/packages/fx-core/src/common/tools.ts)
