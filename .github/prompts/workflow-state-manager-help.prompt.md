---
mode: agent
description: Help for the workflow-state-manager skill.
---

# workflow-state-manager Help

Maintain live event-sourced execution state and deterministic pause, resume, approval-wait, checkpoint, and terminal-state behavior. Use to read or advance authoritative execution state; use policy-engine for approval decisions and project-skills-orchestrator for routing.

Explain this contract as help only. Do not execute its procedures or treat examples as action approval.
Read the complete contract at .github/skills/workflow-state-manager/SKILL.md before using this skill.

## Purpose

Maintain live event-sourced execution state and deterministic pause, resume, approval-wait, checkpoint, and terminal-state behavior.

## Preconditions

- Read repository instructions and applicable configuration.
- Inspect authoritative existing artifacts before replacing derived views.
- Verify that this skill owns the requested decision or output.

## Inputs

- Authoritative workflow plan from `workflow-planner`.
- Execution events, step outcomes, approval decisions, and checkpoint markers.
- State transition constraints and terminal-state definitions.

## Approved Tools and Resources

- Use read-only repository inspection by default.
- Use deterministic scripts and schema validators when provided.
- Use mutating tools only within the approved workflow boundary.

## Read and Write Boundaries

- Write only the owned reports listed below.
- Never rewrite accepted event-stream records.
- Do not silently mutate source, infrastructure, external systems, or unrelated artifacts.

## Procedure

1. Load current execution state snapshot and append-only event log as authoritative sources.
2. Validate proposed transition against allowed state machine rules.
3. Apply valid transitions by appending immutable events, then deriving new materialized state.
4. Emit checkpoints at deterministic boundaries and maintain pause, resume, and approval-wait semantics.
5. Reconcile terminal states only when all required step outcomes are final.
6. Publish updated state snapshot and append-only event records.

## Validation

- Event log remains append-only and ordered; no accepted records are rewritten.
- Materialized state is reproducible from event history.
- Invalid transitions are rejected with deterministic rule identifiers.
- Terminal states are reached only through valid completion paths.

## Outputs

- `reports/current-execution-state.json`
- `reports/current-execution-state.md`
- `reports/execution-log.jsonl`

## Failure Behavior

- Fail closed when event history integrity cannot be verified.
- Preserve last valid snapshot and emit blocked transition diagnostics.
- Never advance workflow state on partial or ambiguous transition evidence.

## Approval Gates

Require explicit approval before any manual state override or forced terminal transition.

## Composition and Dependencies

- workflow-planner

## Examples

- Transition a workflow from running to approval-wait after a gated step completes.
- Restore deterministic state after interruption by replaying events from the last checkpoint.

## Related commands

- Run the skill with /workflow-state-manager.
- Open this help with /workflow-state-manager-help.
- Inspect the full contract with @.github/skills/workflow-state-manager/SKILL.md.
