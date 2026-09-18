# Safe Update Artifact Migration Design

Generated: 2026-09-18T06:54:18.4548657Z

Workflow: `WF-SAFE-PROJECT-UPDATE-20260917`
Design provenance: `STEP-002`
Validation step: `STEP-009`
Sequence: 43
Status: **Implementation validated**

## Decision

The original STEP-002 migration design is preserved below. STEP-009 validated its implementation and found one local compatibility defect: the updater did not enforce `minimumUpdaterRuntimeVersion`. The runtime now rejects manifests requiring a newer updater while continuing to accept an older compatible minimum. No skill contract, workflow state, generated external project, cloud resource, or external system was changed.

The target contract set is:

| Artifact | Current | Target |
| --- | --- | --- |
| `project-orchestrator.json` | 1.0 | 1.1 |
| `project-orchestrator.lock.json` | absent | 1.0 |
| manifest schema | absent | 1.1 |
| lock schema | absent | 1.0 |
| update-plan schema | absent | 1.0 |
| selection/resolution schema | absent | 1.0 |
| update plan and Markdown view | absent | 1.0 |
| update verification report | absent | 1.0 |

Manifest 1.1 retains all manifest 1.0 fields. It adds only the lock reference, digest algorithm, source identity, minimum updater runtime, and last successful reconciliation metadata. Per-asset state belongs in the lock.

## Compatibility

- The current runtime reads and writes manifest 1.0 without a lock; that remains the legacy state.
- The new lock-aware runtime may read manifest 1.0 without mutation, then plan a conservative bootstrap.
- Manifest 1.1 is valid only with a valid lock 1.0. A missing or invalid lock is a recovery state, not permission to rebuild silently.
- An older runtime must not mutate a manifest 1.1 project. Downgrade use requires complete restoration of the pre-migration transaction backup.
- A lock present beside manifest 1.0 represents interrupted cutover and is handled only through journaled recovery.

Reading an older artifact is not authorization to mutate it. Every migration still requires a fresh digest-bound plan, destination preconditions, risk acceptance, and the applicable approval.

## Forward Migration

1. Validate version pairing, paths, ownership, profile closure, selectors, resolutions, plan digest, destination preconditions, and transaction availability.
2. Journal and verify backups for the manifest, prior lock if any, selected assets, companions, and pre-existing update reports.
3. Create approved forks, apply dependency-ordered content, regenerate selected help and managed wiring, and verify the candidate while the old metadata remains authoritative.
4. Write the verified lock atomically.
5. Write manifest 1.1 atomically as the final visibility switch.
6. Verify persisted manifest-lock agreement, publish update verification, and mark the transaction complete.

This ordering prevents manifest 1.1 from advertising a missing lock. Any failure after content mutation starts enters rollback; no failed candidate advances the baseline.

## Legacy Bootstrap

Only equality is sufficient to infer a baseline:

- `local = upstream` with no base is `legacy-equivalent`; record the digest with `track` policy without rewriting content.
- `local != upstream` with no base is `legacy-unknown`; preserve it and require `keep`, `replace`, or `fork`.
- a local path absent upstream is project-owned unless existing evidence proves framework ownership.
- local deletion and upstream removal remain explicit states and never imply automatic restoration or deletion.

## Rollback

Rollback starts on stale state, unresolved conflict, unapproved overwrite, failed write, interruption, failed candidate verification, manifest-lock disagreement, or failed persisted verification. While holding the transaction lock, restore the manifest and lock to their prior presence and bytes, restore managed assets and reports in reverse order, verify every recorded digest, then mark the journal `rolled-back`. If exact restoration cannot be proved, preserve the backup and mark `recovery-required`.

## Implementation Evidence

The focused compatibility matrix passed for manifest 1.0 without a lock, manifest 1.1 with lock 1.0, missing modern locks, interrupted manifest 1.0 plus lock state, unsupported older and newer manifest/lock schema versions, malformed minimum-runtime metadata, newer minimum runtime rejection, and older compatible minimum runtime acceptance. Rejections include recovery or downgrade guidance and do not mutate project content.

Transaction evidence covers upstream replacement, keep/pin, fork, exact reviewed removal, exact-force interruption, legacy migration, generated companions, manifest, lock, and all prior adoption/update reports. The interrupted exact-force fixture verified all 15 journal targets and restored their original bytes, including CRLF report content. Keep/pin correctly leaves unchanged local content outside the mutation set while journaling metadata and reports. Fork records missing fork destinations and generated help so rollback removes partial creations. Exact removal retains a verified backup.

The cutover order is lock then manifest: `applyUpdate` verifies candidate content, atomically writes `project-orchestrator.lock.json`, reaches the tested pre-manifest failure point, and only then atomically writes `project-orchestrator.json`. The injected legacy failure at that point produced a `rolled-back` journal, restored manifest 1.0 exactly, removed the new lock, and restored all prior report bytes.

Validation completed at 2026-09-18T07:07:38.0587045Z: `node --check pso.mjs` passed; the focused minimum-runtime matrix passed 2/2; exact-force recovery passed 1/1; and the complete adoption, security-fuzz, and skill-contract suites passed 93/93 with no skips. `npm run check` passed 168 tests with 0 failures and 1 expected skip, scanned 274 files, checksum-verified 183 release files, and inventoried, audited, and distribution-verified all 47 skills. `git diff --check` passed with no whitespace errors and one non-failing CRLF normalization warning.

## Defect Found And Fixed

`STEP-009-DEFECT-001`: manifest 1.1 validation checked schema and lock pairing but accepted a `minimumUpdaterRuntimeVersion` newer than runtime 1.1.2. A red regression reproduced the acceptance. The loader now validates a strict three-part version and compares it numerically, failing closed with compatible-updater and complete-backup downgrade guidance. The focused regression and neighboring suites pass after the repair.

## Preserved STEP-003 Decisions

The original design required the product owner to explicitly approve:

1. Deriving the minimum lock-aware runtime from the implementation release rather than guessing it now.
2. Failing closed on unresolved safe-all conflicts and accepting only digest-bound resolution input.
3. Blocking incompatible pins rather than removing them automatically.
4. Regenerating selected skill help and required managed wiring as explicit closure actions.
5. Keeping bare `pso update` as safe-all, requiring selectors for noninteractive select, and providing no force-all option.

The expected implementation boundary is `pso.mjs`, the scaffold manifest, four new schemas, focused adoption/security/contract tests, and the listed operator documentation. Existing skill contracts remain unchanged unless separately routed through `skill-update` and approved.

## Risks And Gate

The highest risks are misclassifying legacy customization and interrupting manifest-lock cutover. Equality-only bootstrap, conflict blocking, lock-first/manifest-final writes, verified backups, and journaled recovery are mandatory controls.

No migration compatibility, backup, restoration, or repository-gate blocker remains. STEP-010 is ready to recompute skill and artifact dependency closure. This report does not advance workflow state or authorize commit, push, fetch, publication, release, deployment, Azure activity, or any external mutation.