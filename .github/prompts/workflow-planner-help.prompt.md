---
mode: agent
description: Help for the workflow-planner skill.
---

# workflow-planner Help

Convert user intent into an ordered, validated workflow plan with inputs, outputs, approvals, checkpoints, rollback points, and recovery routes. Use after clarification to turn a confirmed request into an executable sequence; do not use to execute the plan.

Explain this contract as help only. Do not execute its procedures or treat examples as action approval.
Read the complete contract at .github/skills/workflow-planner/SKILL.md before using this skill.

## Purpose

Convert user intent into an ordered, validated workflow plan with inputs, outputs, approvals, checkpoints, rollback points, and recovery routes.

## Preconditions

- Read repository instructions and applicable configuration.
- Inspect authoritative existing artifacts before replacing derived views.
- Verify that this skill owns the requested decision or output.

## Inputs

- User objective, constraints, success criteria, and prohibited actions.
- Ready clarification result from `clarify-the-ask`, including confirmed requirements, project facts, and accepted assumptions.
- Skill catalog and ownership map from `skill-inventory`.
- Dependency graph and cycle checks from `skill-dependency-manager`.

## Approved Tools and Resources

- Use read-only repository inspection by default.
- Use deterministic scripts and schema validators when provided.
- Use mutating tools only within the approved workflow boundary.

## Read and Write Boundaries

- Write only the owned reports listed below.
- Never rewrite accepted event-stream records.
- Do not silently mutate source, infrastructure, external systems, or unrelated artifacts.

## Procedure

1. Validate that clarification is ready and resolve its confirmed objective into candidate workflow steps owned by available skills.
2. Define step inputs, expected outputs, and completion criteria per skill boundary.
3. Order steps using dependency graph evidence and reject cyclic plans.
4. Assign every step either one existing skill owner or one explicit operator owner. Operator steps are approval gates, never inferred executable skills.
5. Insert checkpoints, rollback points, explicit approval classes, and terminal handoff routes where mutation risk or interruption exists.
6. Define `onBlocked` and `onFailed` recovery branches for every nonterminal step and require both routes to reach the `project-handoff` terminal step.
7. Emit schema 1.1 machine-readable and Markdown workflow plans with identical ordering. Continue to read legacy schema 1.0 plans, but require schema 1.1 for new execution lineage.
8. Validate unique step IDs, owner resolution, prerequisite references, acyclic dependencies, approval consistency, exactly one ready prerequisite-free step, and terminal-route reachability.
9. Append one `workflow-planned` event and derive synchronized current execution state for the same workflow and run IDs without rewriting accepted event records.

## Validation

- Every step has one owner, clear prerequisites, and deterministic success criteria.
- Planning does not proceed while the clarification result is blocked by material ambiguity.
- Ordering respects dependency constraints and contains no unresolved cycles.
- Approval gates are tied to concrete mutation or external-impact operations.
- Recovery branches exist for each critical path failure point.
- Every blocked or failed nonterminal path reaches a terminal handoff that records partial outcomes and one next action.
- The workflow plan, planning event, and current execution state carry the same workflow ID, run ID, step count, and initial owner.
- New plans use schema 1.1 while legacy schema 1.0 plans remain readable.
- A workflow-planned event is appended before matching current execution state is published.
- `node pso.mjs plan validate` rejects duplicate IDs, dangling references, unknown skill owners, cycles, inconsistent approval declarations, and unreachable terminal routes.

## Outputs

- `reports/workflow-plan.json`
- `reports/workflow-plan.md`

## Failure Behavior

- Fail closed when ownership mapping or dependency evidence is incomplete.
- Return blocked planning output with unresolved prerequisites listed.
- Never publish an executable plan with ambiguous step authority.

## Approval Gates

Require explicit approval before including steps that perform destructive, privileged, external, or irreversible mutations.

## Composition and Dependencies

- clarify-the-ask
- skill-inventory
- skill-dependency-manager

## Examples

- Build an audit-to-remediation workflow with review, planning, and gated execution phases.
- Produce a blocked plan when requested goals require unavailable owning skills.

## Related commands

- Run the skill with /workflow-planner.
- Open this help with /workflow-planner-help.
- Inspect the full contract with @.github/skills/workflow-planner/SKILL.md.
