---
mode: agent
description: Help for the workflow-simulator skill.
---

# workflow-simulator Help

Predict workflow behavior, failure paths, approval rejection, conflicts, migrations, interruptions, and budget outcomes without real mutations. Use to dry-run a plan and expose failure and approval paths before committing to it; this skill never mutates real state.

Explain this contract as help only. Do not execute its procedures or treat examples as action approval.
Read the complete contract at .github/skills/workflow-simulator/SKILL.md before using this skill.

## Purpose

Predict workflow behavior, failure paths, approval rejection, conflicts, migrations, interruptions, and budget outcomes without real mutations.

## Preconditions

- Read repository instructions and applicable configuration.
- Inspect authoritative existing artifacts before replacing derived views.
- Verify that this skill owns the requested decision or output.

## Inputs

- Proposed workflow plan from `workflow-planner`.
- Policy outcomes and constraints from `policy-engine`.
- Simulation assumptions: failure rates, budget limits, capacity, and approval response models.

## Approved Tools and Resources

- Use read-only repository inspection by default.
- Use deterministic scripts and schema validators when provided.
- Use mutating tools only within the approved workflow boundary.

## Read and Write Boundaries

- Write only the owned reports listed below.
- Never rewrite accepted event-stream records.
- Do not silently mutate source, infrastructure, external systems, or unrelated artifacts.

## Procedure

1. Parse the workflow plan into executable state transitions without mutating real state.
2. Inject deterministic scenario variables for failure, denial, delay, and interruption paths.
3. Execute simulation runs across baseline and stress scenarios.
4. Measure completion likelihood, bottlenecks, policy rejection impact, and budget exposure.
5. Derive recommended mitigations: reorder steps, add checkpoints, or adjust approvals.
6. Publish simulation outputs and assumptions for planning consumers.

## Validation

- Simulation does not mutate operational workflow state or external systems.
- Assumptions are explicit and separable from measured results.
- Reported risks correspond to reproducible scenario runs.
- Recommendations map to specific simulated failure paths.

## Outputs

- `reports/workflow-simulation.json`
- `reports/workflow-simulation.md`

## Failure Behavior

- Fail closed when plan or policy inputs are incomplete for deterministic simulation.
- Emit blocked simulation output with missing scenario parameters.
- Never present speculative projections as validated operational outcomes.

## Approval Gates

This skill is non-mutating; require explicit approval before acting on high-impact recommendations.

## Composition and Dependencies

- workflow-planner
- policy-engine

## Examples

- Simulate approval rejection paths for a multi-stage remediation workflow.
- Evaluate budget-overrun risk under reduced execution capacity.

## Related commands

- Run the skill with /workflow-simulator.
- Open this help with /workflow-simulator-help.
- Inspect the full contract with @.github/skills/workflow-simulator/SKILL.md.
