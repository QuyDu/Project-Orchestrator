# Safe Update Dependency And Ownership Map

Generated: 2026-09-17T22:03:02.8302569Z

Workflow: `WF-SAFE-PROJECT-UPDATE-20260917`
Step: `STEP-001`
Status: **Passed**

## Result

The authoritative inventory contains 47 skill nodes. Every declared dependency resolves, the graph is acyclic, and all four profiles are dependency-closed. Edges in the companion JSON are directed from each consuming skill to its declared dependency.

| Profile | Parent | Declared entries | Effective skills | Closed |
| --- | --- | ---: | ---: | --- |
| `core` | none | 34 | 34 | yes |
| `durable` | `core` | 11 | 43 | yes |
| `distributed` | `durable` | 3 | 45 | yes |
| `advanced` | `distributed` | 3 | 47 | yes |

Evidence comes from `reports/skill-inventory.json`, `config/profiles.yaml`, the dependency contract test in `tests/skill-contracts.test.mjs`, and repository revision `ad3e73cb19a645bccdedfc0ffa781976d98b31a8`.

## Managed Boundary

Framework-owned update units are skill directories, generated skill-help prompts, schemas, the profile and scaffold catalogs, and catalog-selected scaffold templates. Shared files such as `.github/copilot-instructions.md`, `AGENTS.md`, and `config/orchestrator.yaml` require region-aware or project-section-preserving reconciliation. The root `project-orchestrator.json` and producer-owned reports are generated artifacts.

Application code, unrecorded local skills, project documentation outside managed regions, reports owned by another producer, and existing `createOnly` scaffold destinations remain project-owned. They must not be enrolled or changed implicitly.

Every selected skill carries its transitive dependencies and generated `.github/prompts/<id>-help.prompt.md` companion. Creation, adoption, update, inventory, verification, scaffold selection, and contract tests are affected consumers.

## Current Update Gap

The current `updateProject` path delegates to adoption planning and transactional apply. It provides destination-state checks, backup, rollback, managed instruction-region reconciliation, and post-apply verification, but it is not the planned safe three-way updater:

- framework skill packages are replaced as directories;
- no per-asset base digest or policy is recorded;
- legacy differences cannot be distinguished as local-only, upstream-only, or diverged;
- additive, safe-all, and selective plan contracts do not yet exist.

This confirms that implementation must add provenance and planning before changing apply behavior. Existing transactional primitives can be reused after the pure classifier and versioned contracts are validated.

## Safe Order

1. Freeze manifest, baseline-lock, plan, and selection contracts.
2. Implement normalized digesting and the pure three-way classifier.
3. Record managed baselines during creation and adoption.
4. Add additive and selective planning with dependency and companion closure.
5. Add track, pin, fork, keep, replace, and exact force dispositions.
6. Integrate transactional apply and update-aware verification.
7. Validate legacy migration, security boundaries, rollback, and recovery.

## Findings

No cycles, missing dependency nodes, ownership conflicts, or `STEP-001` blockers were found.

Warnings:

- Current skill replacement can overwrite local edits inside framework-owned skill directories.
- Existing projects lack per-asset baseline provenance and must treat differing managed content conservatively.
- Generated companions must remain dependency-closed with their owning skill.

Outcome: `STEP-001` is complete and `STEP-002` may define the migration and rollback contracts. No runtime, schema, skill contract, project, cloud resource, or external system was changed.

## STEP-010 Post-Implementation Validation

Generated: 2026-09-18T07:30:36.0620117Z
State context: sequence 44, `STEP-009` passed; workflow state and event log were not advanced.
Implementation: working tree at `ad3e73cb19a645bccdedfc0ffa781976d98b31a8`
Status: **Passed**

The implemented catalog still contains 47 skills and 97 consumer-to-dependency edges. All dependency targets resolve, the graph is acyclic, and the effective `core` (34), `durable` (43), `distributed` (45), and `advanced` (47) profiles are dependency-closed.

### Managed Update Closure

- Manifest 1.1, lock 1.0, update plan 1.0, selection 1.0, and update verification 1.0 each have framework schema ownership, direct runtime consumers, and contract assertions in `tests/skill-contracts.test.mjs`.
- `project-orchestrator.json`, `project-orchestrator.lock.json`, both update plan views, and `reports/update-verification.json` now have explicit `pso-runtime` ownership in generated ownership inventories.
- Project creation and adoption enroll the complete skill and schema catalogs. Scaffold entries are enrolled only when applicable and installed; `createOnly` assets are not newly adopted, while already tracked scaffold assets retain their baseline relationship.
- Every selected skill closes over its complete package scope, transitive skill dependencies, and generated help companion. Additive selection also includes framework schemas; safe-all covers the combined baseline and upstream catalog.
- Candidate locks reject unresolved dependency or companion references. No orphan generated help, schema, manifest, lock, plan, selection, verification, or scaffold-managed artifact remains.
- Every update mode now validates the declared profile independently of the selected slice. Missing required contracts, invalid persisted forks, and omitted profile dependencies block compatibility; pins block when they make a selected dependency unavailable or incompatible. Planned forks remain valid before creation, and verification requires the fork contract after apply.

### Defects Found And Fixed

1. Selective updates could certify an unrelated asset while a required profile skill was missing or associated with an invalid persisted fork. `pso.mjs` now validates effective profile closure during planning and candidate verification; focused regression coverage was added.
2. Runtime-produced manifest, lock, plan, and verification artifacts were absent from `artifact-ownership.json`. The inventory generator now registers them under `pso-runtime`, with generated-project coverage.
3. The selection schema allowed targets without `installedSource`, although apply requires exact source-bound target equality. The schema and contract assertion now require it.

### Findings

Post-fix results: zero cycles, missing nodes, missing owners, missing schema contract tests, ambiguous owners, orphan artifacts, orphan generated companions, unresolved references, ownership conflicts, or blockers.

### Validation Evidence

- Graph and schema assertions: 18 passed, 0 failed.
- Focused update closure, selection, profile, pin, and fork tests: 7 passed, 0 failed.
- Update input and path security tests: 12 passed, 0 failed.
- `npm run check`: passed, 169 tests passed, 0 failed, 1 expected skip; 274 files passed security scanning, 183 release files were checksum-verified, and all 47 skills passed distribution verification.
- `git diff --check`: passed; only the pre-existing `tests/security-fuzz.test.mjs` CRLF normalization warning was emitted.

### STEP-011 Readiness

Ready. Implementation, dependency and profile closure, managed artifact ownership, schema contracts, focused update and security tests, the full repository gate, and bounded diff review pass. No state transition, event append, commit, push, network operation, Azure action, or deployment was performed.