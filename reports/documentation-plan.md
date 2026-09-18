# Documentation Plan

- Workflow: `WF-SAFE-PROJECT-UPDATE-20260917`
- Step: `STEP-011`
- Starting sequence: `45`
- Status: **applied**
- Owner: `documentation-builder`

## Updated Documents

| File | Audience | Evidence |
| --- | --- | --- |
| `README.md` | Operator | Live `node pso.mjs help`; updater planning, policy, apply, migration, and recovery implementation/tests |
| `STANDALONE-WINDOWS.md` | Operator | Verified PowerShell CLI spellings and Windows-safe update flow |
| `docs/PROJECT-OVERVIEW.md` | Executive | Runtime trust boundaries, transaction lifecycle, and manifest/lock contracts |
| `docs/PROJECT-ARCHITECTURE.md` | Contributor | Separate Git-native Launch Pad and generated-project reconciliation paths |
| `docs/PROJECT-GUIDE.md` | Contributor | Concise current command, policy, report, migration, and recovery reference |

## Scope

The Launch Pad remains Git-native: status, explicitly approved fetch, trusted-target/diff/release-note
inspection, normal protected Git integration, conditional dependency restore, and `npm run check`.
Generated projects use plan-only `pso update` by default, explicit `--apply --accept-risk`, safe-all,
additive, and selective modes, digest-bound selection files, policy and resolution controls, exact-only
force replacement, transaction backup, verification, migration, and recovery.

## Constraints

Workflow state and `reports/execution-log.jsonl` remain unchanged. No source, skill, schema, test,
deployment, Azure, publication, commit, push, or network action is in scope. The approved boundary
for STEP-011 excluded regeneration of `reports/project-guide.json`; the confirmed STEP-012
consistency remediation synchronizes that binding without regenerating or changing the approved guide.

## Validation

- `node pso.mjs help`: exit `0`; update/recover spellings matched every PowerShell example.
- Documentation, production-gate, and skill-contract selection: 32 passed, 0 failed.
- Focused updater/adoption and security-fuzz selections: passed, 0 failed.
- `reports/documentation-plan.json`: PowerShell `Test-Json -SchemaFile` and Node `JSON.parse` passed.
- Relative-link, stale overwrite claim, stale apply command, and tab-indentation scans: no findings.
- `git diff --check`: exit `0`; no whitespace errors.
- `npm run check`: exit `0`; 169 passed, 0 failed, 1 expected skip; 47 skills inventoried,
	audited, and distribution-verified.
- STEP-011 appended its accepted completion event at sequence `46`. STEP-012 leaves state at current
	step `12`, active owner `change-review`, last sequence `46`, with no new event appended.