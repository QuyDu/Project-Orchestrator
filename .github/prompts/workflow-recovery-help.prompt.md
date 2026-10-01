---
mode: agent
description: Help for the workflow-recovery skill.
---

# workflow-recovery Help

Analyze interrupted or partially failed workflows and produce a safe recovery plan from events, checkpoints, artifacts, and handoffs. Use when a workflow was interrupted, crashed, or partially applied and must resume safely; do not use for normal planning.

Explain this contract as help only. Do not execute its procedures or treat examples as action approval.
Read the complete contract at .github/skills/workflow-recovery/SKILL.md before using this skill.

## Purpose

Analyze interrupted or partially failed workflows and produce a safe recovery plan from events, checkpoints, artifacts, and handoffs.

## Preconditions

- Read repository instructions and applicable configuration.
- Inspect authoritative existing artifacts before replacing derived views.
- Verify that this skill owns the requested decision or output.

## Inputs

- Current execution state and event history from `workflow-state-manager` outputs.
- Latest continuity and blocker records from `project-handoff` outputs.
- Recovery objectives, safety constraints, and allowed retry boundaries.

## Approved Tools and Resources

- Use read-only repository inspection by default.
- Use deterministic scripts and schema validators when provided.
- Use mutating tools only within the approved workflow boundary.

## Read and Write Boundaries

- Write only the owned reports listed below.
- Never rewrite accepted event-stream records.
- Do not silently mutate source, infrastructure, external systems, or unrelated artifacts.

## Procedure

1. Reconstruct the interrupted workflow timeline from authoritative state and event logs.
2. Identify last known good checkpoint, failed step, and side effects that may need rollback or compensation.
3. Classify failure cause: transient, deterministic defect, policy block, missing approval, or external dependency outage.
4. Generate recovery options: retry, rollback, compensate, or branch to alternate path.
5. Select safest executable recovery path under current constraints and define resume prerequisites.
6. Publish recovery artifacts with explicit operator actions and stop conditions.

## Validation

- Recovery path references concrete checkpoint and event evidence.
- Side effects are accounted for with rollback or compensation actions.
- Retry recommendations include deterministic stop criteria and max attempt boundaries.
- Blocked conditions and needed approvals are explicit.

## Outputs

- `reports/recovery-plan.json`
- `reports/recovery-plan.md`

## Failure Behavior

- Fail closed when execution history is incomplete or inconsistent.
- Return blocked recovery status when no safe rollback or compensation path exists.
- Never recommend resume when unresolved side effects can corrupt state.

## Approval Gates

Require explicit approval before executing destructive rollback, external compensation, or irreversible recovery actions.

## Composition and Dependencies

- workflow-state-manager
- project-handoff

## Examples

- Recover from a failed remediation rollout by rolling back to the last approved checkpoint.
- Produce a compensation-first plan when partial external side effects already occurred.

## Related commands

- Run the skill with /workflow-recovery.
- Open this help with /workflow-recovery-help.
- Inspect the full contract with @.github/skills/workflow-recovery/SKILL.md.
