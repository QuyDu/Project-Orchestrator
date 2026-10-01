---
mode: agent
description: Help for the audit-remediation skill.
---

# audit-remediation Help

Execute an approved audit remediation plan by all eligible phases, one phase, one finding, or resume state, with validation, rollback, checkpoints, and project handoff updates. Use only after audit-plan-remediation produces a valid plan; do not use to discover, review, or prioritize findings.

Explain this contract as help only. Do not execute its procedures or treat examples as action approval.
Read the complete contract at .github/skills/audit-remediation/SKILL.md before using this skill.

## Purpose

Execute approved items from a validated audit remediation plan while preserving finding traceability, dependency order, approval gates, focused validation, rollback boundaries, event-sourced progress, and durable project continuity.

## Preconditions

- Read repository instructions, `reports/audit-remediation-plan.json`, `reports/current-execution-state.json`, and `reports/project-handoff.json` when present.
- Validate the remediation plan against `schemas/audit-remediation-plan.schema.json` and reject raw findings or an unreviewed audit.
- Confirm the plan applies to the current repository and revision, then identify intervening changes that could invalidate scope, evidence, dependencies, acceptance criteria, or rollback guidance.
- Require exactly one selection mode: `-All`, `-Phase <milestone-id>`, `-Finding <AUD-id>`, or `-Resume`.

## Inputs

- `-All` selects every eligible incomplete remediation item in dependency and priority order.
- `-Phase <milestone-id>` selects one plan milestone and any incomplete prerequisite items required by it.
- `-Finding <AUD-id>` selects items mapped to one source finding and any incomplete prerequisites required by them.
- `-Resume` continues the previously selected scope from the last valid workflow checkpoint.
- Optional user constraints, approved risk dispositions, maintenance windows, and explicit approvals required by selected items.

## Approved Tools and Resources

- Use repository-native editors and the narrowest applicable build, test, lint, typecheck, security, dependency, and infrastructure validation commands named by the plan.
- Use `policy-engine` before every approval-gated item, `workflow-state-manager` for events and checkpoints, `change-review` for each completed phase, and `project-handoff` after every checkpoint.
- Use `systematic-debugging` when validation fails unexpectedly and `regression-test-development` when a finding requires durable reproduction coverage.
- Do not deploy, publish, commit, push, rotate credentials, rewrite Git history, contact external systems, or perform destructive work unless separately and explicitly approved at the point of action.

## Read and Write Boundaries

- Modify only files listed by selected remediation item scopes or files proven necessary to satisfy their acceptance criteria; treat unrelated working-tree changes as user-owned.
- Write only `reports/audit-remediation-execution.json` and `reports/audit-remediation-execution.md` directly.
- Dispatch `workflow-state-manager` to update its owned state and append-only event artifacts; never rewrite accepted `reports/execution-log.jsonl` records.
- Dispatch `project-handoff` to update `reports/project-handoff.json`, `reports/project-handoff.md`, and `reports/current-work-state.json`; never write those artifacts directly.
- Treat files under `reports/audit-remediation-plans/` as immutable evidence: never edit, replace, or delete them. Protect that directory with repository and filesystem access controls appropriate to the environment.
- Never weaken tests, security controls, audit evidence, acceptance criteria, or standards requirements merely to mark an item complete.

## Procedure

1. Parse the requested selection mode and reject missing, combined, unknown, or ambiguous parameters. Resolve `-Phase` only against `milestones[].id` and `-Finding` only against source finding IDs present in `items[].findingIds`.
2. Validate plan integrity, source review, repository identity, current revision compatibility, item IDs, milestone membership, finding mappings, and the acyclic `dependsOn` graph. Before execution, publish an immutable content-addressed plan with `node .github/skills/audit-code/scripts/audit-validate.mjs snapshot reports/audit-remediation-plan.json .`. Record the returned snapshot path and digest, and validate every new execution artifact against that snapshot with `audit-validate.mjs execution <plan-snapshot.json> reports/audit-remediation-execution.json --root .`; add `--resume-root .` for `-Resume` so repository and worktree drift fail closed.
3. Build the execution set. Include incomplete transitive prerequisites, exclude completed items with current validation evidence, preserve plan priority, and stop when a required prerequisite is deferred, rejected, stale, or outside approved scope.
4. Present the selected items, files and systems affected, expected side effects, validation, rollback, approval requirements, and remaining unselected work. Obtain phase approval before mutation. One phase approval may cover its disclosed local reversible edits; destructive, external, privileged, credential, deployment, commit, push, publication, and risk-acceptance actions always require separate approval.
5. Ask `policy-engine` to evaluate each item before execution. Stop in `approval-wait`, `blocked`, or `denied` states rather than bypassing policy.
6. For each eligible item, reproduce or verify the source finding when feasible, make the smallest plan-conformant change, and immediately run the narrowest validation that can falsify the repair. Add regression coverage proportional to risk.
7. If validation fails, stop the item, preserve diagnostics, and follow its rollback guidance when rollback is safe and approved. Use `systematic-debugging` for an unexpected local defect; do not continue to dependent items while a prerequisite is failed or rolled back.
8. After every item, dispatch `workflow-state-manager` to append the outcome and derive current state. Generate checkpoint identity with `node .github/skills/audit-code/scripts/audit-validate.mjs checkpoint .`, then record changed paths, commands, validation, approvals, residual risk, rollback status, source finding IDs, remaining dependencies, repository revision, and the content-sensitive worktree digest.
9. After every selected phase or interruption, run `change-review`, write the execution result, create a workflow checkpoint, and dispatch `project-handoff`. The handoff must list completed, failed, blocked, rolled-back, deferred, and remaining item and finding IDs, validation evidence, pending approvals, and the single next eligible action.
10. For `-Resume`, verify event and checkpoint integrity, plan digest, repository identity, working-tree compatibility, prior side effects, and pending approvals before continuing. Refuse stale or ambiguous resume state and route interrupted recovery analysis to `workflow-recovery`.
11. After all selected items pass, rerun the applicable security and repository checks. Never mark a source finding resolved solely because implementation steps ran; resolution requires passing acceptance criteria and a subsequent `audit-code` verification that can no longer reproduce it.
12. Emit schema 3.1 execution artifacts carrying the same `auditRunId` as the immutable schema 2.1 plan snapshot, validate schema, run the deterministic execution validator, derive Markdown, checkpoint terminal state, and dispatch final handoff. Earlier execution records remain historical evidence.

## Validation

- Exactly one selection mode is recorded, and every executed item belongs to that selection or its transitive prerequisites.
- Items execute only after dependencies complete successfully and required approvals are current; critical containment and high-severity security work retain plan priority unless prerequisites require otherwise.
- Every completed item records source finding IDs, changed paths, validation commands and outcomes, review status, residual risk, and checkpoint ID.
- Failed, blocked, denied, rolled-back, deferred, and approval-wait items remain incomplete and prevent dependent execution.
- `-Resume` reproduces state from the append-only event log and rejects plan, repository, or worktree drift that invalidates the checkpoint.
- Project handoff and current-work-state match the latest execution checkpoint and identify all work remaining from the source audit.
- The JSON uses schema 3.0, references a contained content-addressed snapshot, validates against `schemas/audit-remediation-execution.schema.json`, and passes `audit-validate.mjs execution`; Markdown preserves the same selection, ordering, statuses, evidence, approvals, and next action.
- Current schema 3.1 execution carries the same auditRunId as its immutable plan snapshot.

## Outputs

- `reports/audit-remediation-execution.json`
- `reports/audit-remediation-execution.md`

## Failure Behavior

- Fail closed on invalid plans, dependency cycles, stale source evidence, ambiguous selections, repository drift, unapproved actions, failed validation, rollback uncertainty, state-integrity failures, or conflicting working-tree changes.
- Preserve the last valid checkpoint and report a deterministic resume or recovery route; never mark partial work complete.
- Stop and escalate immediately for a potentially live credential, active exploitation, destructive side effect, or security-control regression.

## Approval Gates

Require explicit approval before each remediation phase begins. Require separate point-of-action approval for destructive, external, privileged, irreversible, credential, production-data, deployment, publication, commit, push, history-rewrite, or risk-acceptance actions. `-All`, `-Phase`, `-Finding`, and `-Resume` select scope but never grant approval.

## Composition and Dependencies

- audit-plan-remediation
- policy-engine
- workflow-state-manager
- workflow-recovery
- change-review
- systematic-debugging
- regression-test-development
- project-handoff
- audit-code

## Examples

- `/audit-remediation -All` presents every eligible phase in dependency order and waits for phase approval before local edits.
- `/audit-remediation -Phase containment` executes the named milestone and incomplete prerequisites, then checkpoints and updates project handoff.
- `/audit-remediation -Finding AUD-0007` executes only plan items mapped to that finding and required prerequisites.
- `/audit-remediation -Resume` validates the last checkpoint and continues the previously approved scope without assuming prior approvals remain valid.

## Related commands

- Run the skill with /audit-remediation.
- Open this help with /audit-remediation-help.
- Inspect the full contract with @.github/skills/audit-remediation/SKILL.md.
