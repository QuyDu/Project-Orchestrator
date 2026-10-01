---
mode: agent
description: Help for the project-handoff skill.
---

# project-handoff Help

Record verified project continuity, milestone status, key decisions, blockers, last completed work, and the next approved action. Use at the end of a work session or before transferring ownership so the next agent or person can resume; do not use as a change log.

Explain this contract as help only. Do not execute its procedures or treat examples as action approval.
Read the complete contract at .github/skills/project-handoff/SKILL.md before using this skill.

## Purpose

Record verified project continuity, milestone status, key decisions, blockers, last completed work, and the next approved action.

## Preconditions

- Read repository instructions and applicable configuration.
- Inspect authoritative existing artifacts before replacing derived views.
- Verify that this skill owns the requested decision or output.

## Inputs

- Current execution state and recent event history from `workflow-state-manager` outputs.
- Verified completion evidence: changed files, validation outcomes, open blockers, and pending approvals.
- Active milestone objectives and agreed next actions.

## Approved Tools and Resources

- Use read-only repository inspection by default.
- Use deterministic scripts and schema validators when provided.
- Use mutating tools only within the approved workflow boundary.

## Read and Write Boundaries

- Write only the owned reports listed below.
- Never rewrite accepted event-stream records.
- Do not silently mutate source, infrastructure, external systems, or unrelated artifacts.

## Procedure

1. Collect authoritative current state, latest completed steps, and unresolved blockers.
2. Verify milestone status against observable evidence, not intent statements.
3. Summarize key decisions, assumptions, and risk items that affect continuity.
4. Identify the single next approved action and prerequisites for resumption.
5. Write synchronized machine-readable and markdown handoff artifacts.
6. Update current work state snapshot to match the same handoff conclusion.

## Validation

- Handoff status, blockers, and next action are evidence-backed and mutually consistent.
- Current work state and handoff records do not conflict.
- No unresolved approval is represented as completed work.
- Limitations and unknowns are explicit for the next operator.

## Outputs

- `reports/project-handoff.json`
- `reports/project-handoff.md`
- `reports/current-work-state.json`

## Failure Behavior

- Fail closed when authoritative execution state is missing or stale.
- Preserve prior handoff records and publish blocked continuity status.
- Never label a handoff complete if next action prerequisites are unresolved.

## Approval Gates

Require explicit approval before altering scope commitments or handoffing an action that includes destructive or external mutation.

## Composition and Dependencies

- workflow-state-manager

## Examples

- Publish a handoff after partial workflow completion with clear blockers and resume point.
- Record a continuity update that transfers ownership to the next operator with evidence links.

## Related commands

- Run the skill with /project-handoff.
- Open this help with /project-handoff-help.
- Inspect the full contract with @.github/skills/project-handoff/SKILL.md.
