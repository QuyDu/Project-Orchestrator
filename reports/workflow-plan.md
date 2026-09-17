# Safe Project Update Workflow Plan

Generated: 2026-09-17T15:26:19.668Z

Workflow: `WF-SAFE-PROJECT-UPDATE-20260917`
Run: `RUN-SAFE-PROJECT-UPDATE-PLAN-20260917-01`
Status: **Planned; implementation approval required at STEP-003**

## Objective

Build a provenance-backed, non-destructive update system for Project Orchestrator. The design covers:

1. Git-native update guidance for the Project Orchestrator Launch Pad checkout.
2. Additive, safe-all, and selective updates for projects created or adopted by Project Orchestrator.
3. Preservation of locally enhanced skills and project-owned files.
4. Deterministic dependency closure, preview, conflict resolution, journaling, rollback, and verification.

This plan does not implement the updater and does not authorize a commit, push, fetch, publication, deployment, release, cloud operation, or other external mutation.

## Governing Decisions

- Git remains authoritative for the Launch Pad source checkout. The initial release adds documented Git procedures, not a second merge engine.
- Bare `pso update` remains accepted and maps to `--mode all`, but all means safe reconciliation, never force replacement.
- A generated project records the exact framework-owned baseline it received. Updates classify base, local, and upstream state before proposing a write.
- Unresolved conflicts make the entire update plan non-applicable. There is no partial mutation before conflict decisions are complete.
- `track` is the default for framework-installed assets. `pin` and `fork` are explicit persistent policies.
- `keep`, `replace`, and `fork` are explicit conflict dispositions. Keep does not falsely advance the baseline.
- Force replacement is limited to exact selected assets, requires risk acceptance and a fresh dry-run, and has no force-all form.
- Existing projects without baseline provenance preserve every differing managed asset as `legacy-unknown` until the operator chooses its disposition.
- Project-owned skills, application code, reports, documentation, and other paths outside the managed ledger are never enrolled or changed implicitly.

## Planned Change Boundary

The implementation phase may propose changes only after STEP-003 approval. Its expected boundary is:

| Area | Expected paths |
| --- | --- |
| Runtime | `pso.mjs` |
| Managed catalog | `templates/scaffold-manifest.json` |
| New contracts | `schemas/project-orchestrator-manifest.schema.json`, `schemas/project-orchestrator-lock.schema.json`, `schemas/project-update-plan.schema.json`, `schemas/project-update-selection.schema.json` |
| Behavior tests | `tests/adoption-rerun.test.mjs`, `tests/security-fuzz.test.mjs` |
| Contract tests | `tests/skill-contracts.test.mjs` |
| Operator docs | `README.md`, `STANDALONE-WINDOWS.md`, `docs/PROJECT-OVERVIEW.md`, `docs/PROJECT-ARCHITECTURE.md`, `docs/PROJECT-GUIDE.md` |
| Generated downstream state | `project-orchestrator.json`, `project-orchestrator.lock.json`, `reports/project-update-plan.json`, `reports/project-update-plan.md`, `reports/update-verification.json` |

No existing skill contract is changed by default. If implementation later requires an existing skill-contract change, that exact skill must go through `skill-update` and its separate `--proceed` gate before editing.

## Data Contracts

### Project manifest

Advance generated `project-orchestrator.json` from schema `1.0.0` to `1.1.0` while retaining all schema 1.0 fields. Add only compact update metadata:

- lock path and lock schema version;
- digest algorithm identifier;
- installed framework and runtime source identity;
- minimum updater runtime version;
- last successful reconciliation timestamp and transaction ID.

The manifest remains human-readable metadata. Per-asset state belongs in the lock.

### Baseline lock

Create version-controlled `project-orchestrator.lock.json` with schema `1.0.0`. Each managed asset records:

- stable asset ID, normalized relative path, kind, and ownership scope;
- scope type: whole file, directory, generated file, or managed region;
- framework identity and installed base version;
- `track`, `pin`, or `fork` policy and any fork target ID;
- normalized base digest and sorted per-file digests for directories;
- skill dependencies and generated companions when applicable;
- source catalog digest, without absolute paths or embedded secrets.

The lock records hashes and provenance, not duplicate source content. Conflict review compares local and upstream content while the recorded base digest determines which side changed.

### Digest rules

Use a named `sha256-normalized-text-v1` algorithm:

1. For valid UTF-8 text, remove a UTF-8 BOM, normalize CRLF and lone CR to LF, and preserve every other byte including final-newline presence.
2. For non-text content, hash raw bytes with SHA-256.
3. For directories, sort normalized relative file paths ordinally and hash each path, content digest, and scope marker into one package digest.
4. Ignore no file inside a managed directory unless the catalog explicitly excludes it.

This avoids false local changes caused only by checkout line endings while retaining meaningful whitespace and content changes.

### Update plan

Create schema `1.0.0` for `reports/project-update-plan.json`. It records:

- source and target framework/runtime identities;
- requested mode, selectors, and selection-file digest;
- per-asset base, local, and upstream digests;
- classification, policy, proposed action, resolution, and destination-state precondition;
- dependency and generated-companion closure;
- conflicts, warnings, counts, `canApply`, and stable plan digest;
- no source-machine absolute paths and no embedded file content.

The Markdown view presents the same actions and blockers in the same order.

### Selection and resolution file

Create schema `1.0.0` for an automation-safe input file containing:

- expected plan digest and target framework version;
- selected skill IDs or exact managed asset paths;
- policy changes;
- conflict dispositions of keep, replace, or fork with an exact fork ID;
- exact force-replace paths when explicitly authorized.

A stale plan digest, unknown selector, duplicate disposition, traversal path, or mode-incompatible option fails closed.

## Three-Way Classification

`B` is the recorded base digest, `L` is current local state, and `U` is current upstream state. Absence is a first-class state.

| Base / Local / Upstream | Classification | Default result |
| --- | --- | --- |
| `B = L = U` | current | No write |
| `L = B`, `U != B` | upstream-only | Update when selected and tracked |
| `U = B`, `L != B` | local-only change | Preserve; no baseline advance |
| `L = U`, both differ from `B` | converged | Advance lock without rewriting content |
| `L != B`, `U != B`, `L != U` | diverged | Block for keep, replace, or fork |
| No `B`, no `L`, `U` present | new-upstream | Create when included by mode and closure |
| No `B`, `L` present, no `U` | project-local | Leave unmanaged |
| No `B`, `L = U` | legacy-equivalent | Bootstrap current baseline without content write |
| No `B`, `L != U` | legacy-unknown | Preserve and block for explicit disposition |
| `B` present, `L` absent | locally deleted | Preserve deletion; block if profile or dependency closure requires the asset |
| `B` present, `U` absent | upstream removed | Preserve by default; require exact reviewed removal |
| `B` present, both absent | removed on both sides | Remove ledger entry after compatibility validation |

Managed regions are classified by region digest so user text outside the region does not create a false conflict. A malformed, duplicate, or missing managed marker is a blocking conflict.

## Update Modes

### Safe all

`pso update` and `pso update --mode all` are equivalent.

- Plan every applicable tracked managed asset.
- Include newly introduced mandatory assets and generated companions.
- Update only upstream-only assets and converge equal content.
- Preserve local-only changes and pins.
- Block the full apply while any diverged, legacy-unknown, required deletion, incompatible pin, or malformed managed-region decision remains unresolved.

### Additive

`--mode additive` installs capabilities that are absent from the project.

- A selected new skill expands to its missing transitive skill dependencies and generated help.
- New required schemas and mandatory companions are included only when absent.
- Existing files are never overwritten in additive mode.
- An existing dependency is preserved when compatible; an unprovable or incompatible dependency blocks the bundle.
- Newly discovered untracked local skills remain project-owned.

### Select

`--mode select` accepts skill IDs and exact managed asset paths.

- On an interactive TTY with no selectors, present a grouped capability list and conflict choices.
- In noninteractive execution, require selectors or `--selection-file`; an empty selection is an error.
- Expand selected skills to dependency and generated-companion closure before preview.
- Display every implicit dependency separately from explicitly selected assets.

The exact option spelling is finalized in STEP-002 and frozen at STEP-003. Planned examples are:

```powershell
node .\pso.mjs update --root C:\repos\my-project --dry-run
node .\pso.mjs update --root C:\repos\my-project --mode additive --dry-run
node .\pso.mjs update --root C:\repos\my-project --mode select --skills skill-a,skill-b --dry-run
node .\pso.mjs update --root C:\repos\my-project --mode select --selection-file .\update-selection.json --dry-run
node .\pso.mjs update --root C:\repos\my-project --resolution-file .\update-resolution.json --accept-risk
```

## Policies And Resolutions

### Track

Framework-installed assets start as tracked. Upstream-only changes update when selected. A local change does not silently change policy; it produces local-only or diverged state.

### Pin

Pin retains the recorded installed baseline. The planner reports available upstream versions and validates whether the pin still satisfies selected skill and profile dependencies. An incompatible pin blocks apply.

### Fork

Fork is explicit and applies primarily to skill packages:

1. Require an exact unused project-owned skill ID and destination.
2. Preserve the complete local package under that ID.
3. Validate its twelve-section contract and dependency references through the existing `skill-update` governance route when content or identity changes are needed.
4. Restore the canonical framework skill as tracked upstream content.
5. Regenerate canonical help and update only explicitly approved project references.

Fork never invents an ID and never rewrites arbitrary project text by substring replacement.

### Keep and replace

- Keep records a pin or explicit project-owned disposition and leaves the base digest unchanged.
- Replace writes upstream content, updates the base digest only after verification, and preserves the prior local content in the transaction backup.
- Force replacement is an exact-asset variant of replace. It requires the target path, matching plan digest, current destination-state precondition, `--accept-risk`, and backup. There is no `--force-replace all`.

## Transaction Semantics

Reuse the current lock, stale-plan, journal, backup, interruption, rollback, and verification foundation. Split update planning and reporting from adoption while sharing hardened primitives.

Apply order:

1. Validate mode, selection, resolution, profile closure, plan digest, and every destination precondition.
2. Refuse apply when another adoption, update, or recovery transaction is active.
3. Snapshot the manifest, baseline lock, selected assets, generated companions, and pre-existing update reports.
4. Create approved project-owned forks before replacing canonical paths.
5. Apply dependency-ordered creates and replacements.
6. Regenerate selected help and managed wiring.
7. Run inventory and update-specific verification.
8. Write the new lock and manifest last, then mark the journal complete.

On any failure, restore files in reverse order, restore the prior manifest and lock, verify restored digests, and leave a terminal recoverable journal. A transaction-created fork is removed only after the canonical local package has been restored and verified; its backup remains available until recovery is finalized.

`verifyInstallation` must be split or generalized so update verification understands pins, forks, selected closure, and legacy-unknown blockers. It must no longer require every managed skill to equal current upstream when policy intentionally preserves a compatible pin.

## Legacy Migration

Projects with schema 1.0 manifests or no lock use conservative bootstrap:

1. Read the existing project without writing.
2. If local content equals current upstream under the canonical digest algorithm, record that current digest as base with `track` policy.
3. If local content differs, classify it as `legacy-unknown`; do not infer whether the change was local or upstream.
4. Treat paths absent upstream as project-local unless existing framework evidence proves ownership.
5. Require explicit keep, replace, or fork for every legacy-unknown asset selected by all-mode.
6. Write schema 1.1 manifest and lock only inside a successful transaction.

Older updater runtimes cannot honor the new lock and may retain the historical overwrite behavior. The new manifest therefore records a minimum updater runtime and documentation must prohibit downgrade use. Runtime rollback after a schema 1.1 project update must be paired with restoration of that project's pre-migration transaction backup.

Legacy duplicate skills and prompt commands are removed only when their content is recognized as unchanged framework content. Any customization converts removal into a conflict.

## Launch Pad Update Procedure

The first release documents this process and does not add an automatic source merge command:

1. Record the current branch, revision, worktree status, runtime version, and validation baseline.
2. Obtain explicit approval before remote fetch because it is an external action.
3. Use normal Git to fetch tags and branches, inspect release notes and the bounded diff, and select a trusted target revision.
4. Integrate through a normal fast-forward, merge, or reviewed pull request chosen by the repository owner. Never hide reset, merge, rebase, commit, or push inside `pso`.
5. Run `npm ci` when dependency metadata changed, then `npm run check`.
6. Update downstream generated projects separately with a dry-run from the validated Launch Pad revision.

Launch Pad rollback uses normal Git history and the repository's approval rules. Destructive reset is not part of the documented default. A later read-only `pso source status` helper may be considered only if it reports local/ref/version drift without fetching or integrating by default.

## Ordered Workflow

| Step | Owner | Status | Outcome | Approval |
| --- | --- | --- | --- | --- |
| STEP-001 | `skill:skill-dependency-manager` | Ready | Build managed-asset and dependency closure map. | None |
| STEP-002 | `skill:artifact-upgrade` | Planned | Freeze schemas, compatibility, migration, and rollback design. | None |
| STEP-003 | `operator:product-owner` | Planned | Approve exact local implementation and CLI boundary. | Phase |
| STEP-004 | `skill:regression-test-development` | Planned | Implement provenance and classifier red-green slice. | Prior phase gate |
| STEP-005 | `skill:regression-test-development` | Planned | Implement additive, all, and select planning red-green slice. | Prior phase gate |
| STEP-006 | `skill:regression-test-development` | Planned | Implement track, pin, fork, and conflict resolution red-green slice. | Prior phase gate |
| STEP-007 | `skill:regression-test-development` | Planned | Integrate transactional apply, rollback, reports, and verification. | Prior phase gate |
| STEP-008 | `skill:regression-test-development` | Planned | Add conservative legacy migration and security fuzz coverage. | Prior phase gate |
| STEP-009 | `skill:artifact-upgrade` | Planned | Validate migration compatibility and rollback evidence. | None |
| STEP-010 | `skill:skill-dependency-manager` | Planned | Revalidate profile and capability closure. | None |
| STEP-011 | `skill:documentation-builder` | Planned | Publish generated-project and Launch Pad procedures. | None |
| STEP-012 | `skill:change-review` | Planned | Review bounded implementation for regressions and data loss. | None |
| STEP-013 | `skill:prepare-commit` | Planned | Prepare a validated candidate without committing. | None |
| STEP-014 | `skill:project-handoff` | Planned | Publish terminal continuity from every outcome. | None |

## Required Tests

Focused tests must demonstrate red before production repair and green afterward for:

- complete three-way digest-state matrix, including both-side convergence and absent states;
- CRLF/LF normalization, BOM handling, final newline sensitivity, binary files, and deterministic directory order;
- new-project and adopted-project lock generation;
- project-owned skill and application-file non-enrollment;
- bare safe-all compatibility and mutation-free dry-run;
- additive dependency closure and absence-only writes;
- selective interactive and noninteractive behavior;
- pin compatibility, exact fork identity, keep, replace, and exact force replacement;
- unresolved-plan atomic refusal;
- stale plan, stale selection, concurrent lock, interruption, rollback, and recovery;
- schema 1.0 legacy-equivalent and legacy-unknown bootstrap;
- upstream removal and customized legacy duplicate preservation;
- path traversal, absolute path, case collision, symlink escape, malformed lock, duplicate ID, and untrusted JSON input;
- portable reports with no absolute source paths or embedded managed content;
- Windows and Unix behavior in the existing supported runtime matrix.

Because the scaffold manifest and schemas are contract surfaces, `tests/skill-contracts.test.mjs` must validate every new schema, generated-project artifact, and manifest declaration. Final validation is `npm run check`; the known unrelated audit-checkpoint failure must be reproduced and isolated rather than waived if it remains.

## Rollout

1. Land the schemas and pure classifier behind tests before any apply path uses them.
2. Validate new-project creation and existing-project adoption in temporary repositories.
3. Exercise legacy migration in dry-run only against clean, customized, and malformed fixtures.
4. Exercise additive and select modes before safe-all apply.
5. Canary safe-all on disposable generated projects containing customized framework skills and project-owned skills.
6. Verify interruption rollback and recovery before changing documented defaults.
7. Prepare release notes with the minimum runtime requirement and downgrade limitation.
8. Request separate approval for commit, push, publication, release, or downstream use after STEP-013; none is implied by this plan.

## Rollback Triggers

Stop rollout and restore the last valid runtime candidate when any of these occurs:

- a project-owned or locally modified asset is overwritten without exact replacement approval;
- update applies with unresolved conflicts or incomplete dependency closure;
- manifest and lock disagree after verification;
- rollback cannot restore exact pre-update digests;
- a selector escapes the project root or resolves ambiguously;
- a pin or fork silently violates its profile;
- a legacy-unknown asset is inferred as safe without equality evidence;
- the new updater makes adoption or creation non-idempotent.

Per-project rollback uses the transaction journal and backup. Runtime candidate rollback uses the repository's normal reviewed Git process. A schema 1.1 project must be restored to its pre-migration state before an older updater runtime is used.

## Success Criteria

The implementation is candidate-ready only when:

- no update mode silently overwrites local customization;
- every selected capability is dependency-closed;
- all unresolved conflicts block before the first write;
- every applied asset is bound to base, local, upstream, plan, and destination digests;
- creation, adoption, update, rollback, and recovery pass focused and repository validation;
- operator documentation matches executable commands and downgrade limits;
- bounded review has no unresolved high or critical finding;
- no commit, push, publication, deployment, release, or external mutation has occurred.

Terminal handoff: `STEP-014`.