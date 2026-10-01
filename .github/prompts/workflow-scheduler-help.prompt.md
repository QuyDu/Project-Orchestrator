---
mode: agent
description: Help for the workflow-scheduler skill.
---

# workflow-scheduler Help

Own admission, prioritization, fairness, budgets, deadlines, throttling, capacity, and starvation prevention for eligible workflows. Use when multiple eligible workflows compete for limited capacity or budget; do not use for a single sequential workflow.

Explain this contract as help only. Do not execute its procedures or treat examples as action approval.
Read the complete contract at .github/skills/workflow-scheduler/SKILL.md before using this skill.

## Purpose

Own admission, prioritization, fairness, budgets, deadlines, throttling, capacity, and starvation prevention for eligible workflows.

## Preconditions

- Read repository instructions and applicable configuration.
- Inspect authoritative existing artifacts before replacing derived views.
- Verify that this skill owns the requested decision or output.

## Inputs

- Current execution backlog and runtime capacity from `workflow-state-manager` outputs.
- Policy constraints and priority/risk controls from `policy-engine` decisions.
- Scheduling objectives: fairness policy, deadlines, budget caps, and throttling limits.

## Approved Tools and Resources

- Use read-only repository inspection by default.
- Use deterministic scripts and schema validators when provided.
- Use mutating tools only within the approved workflow boundary.

## Read and Write Boundaries

- Write only the owned reports listed below.
- Never rewrite accepted event-stream records.
- Do not silently mutate source, infrastructure, external systems, or unrelated artifacts.

## Procedure

1. Build the candidate queue from eligible workflows and unresolved dependencies.
2. Apply admission controls for capacity, budget, and policy constraints.
3. Compute priority scores using urgency, impact, fairness debt, and starvation risk.
4. Allocate execution slots deterministically and emit throttle or defer decisions.
5. Record denied or blocked scheduling outcomes with policy or dependency rationale.
6. Publish scheduler state snapshots for orchestration and telemetry consumers.

## Validation

- Scheduled set does not exceed declared capacity or budget constraints.
- Deferred workflows include explicit reason and next eligibility condition.
- Fairness and starvation controls are observable in queue ordering decisions.
- Policy-denied workflows are never admitted.

## Outputs

- `reports/scheduler-state.json`
- `reports/scheduler-state.md`

## Failure Behavior

- Fail closed when queue state or policy inputs are stale or contradictory.
- Preserve last valid schedule and mark new admission decisions blocked.
- Never admit work under unknown capacity or policy conditions.

## Approval Gates

Require explicit approval before overriding policy-denied admission or fairness controls.

## Composition and Dependencies

- workflow-state-manager
- policy-engine

## Examples

- Prioritize urgent security remediation while preventing starvation of queued governance tasks.
- Defer non-critical workflows when budget or capacity thresholds are reached.

## Related commands

- Run the skill with /workflow-scheduler.
- Open this help with /workflow-scheduler-help.
- Inspect the full contract with @.github/skills/workflow-scheduler/SKILL.md.
