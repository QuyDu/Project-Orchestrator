---
mode: agent
description: Help for the artifact-upgrade skill.
---

# artifact-upgrade Help

Plan and validate schema and artifact migrations with compatibility checks, backups, rollback routes, and migration evidence. Use when a schema or artifact version changes and existing records must migrate; use dependency-maintenance instead for application package upgrades.

Explain this contract as help only. Do not execute its procedures or treat examples as action approval.
Read the complete contract at .github/skills/artifact-upgrade/SKILL.md before using this skill.

## Purpose

Plan and validate schema and artifact migrations with compatibility checks, backups, rollback routes, and migration evidence.

## Preconditions

- Read repository instructions and applicable configuration.
- Inspect authoritative existing artifacts before replacing derived views.
- Verify that this skill owns the requested decision or output.

## Inputs

- Requested artifact or schema change scope, invariants, and migration success criteria.
- Current authoritative source artifacts and their consumers discovered by `skill-inventory`.
- Dependency and compatibility evidence from `reports/skill-dependency-graph.json`.

## Approved Tools and Resources

- Use read-only repository inspection by default.
- Use deterministic scripts and schema validators when provided.
- Use mutating tools only within the approved workflow boundary.

## Read and Write Boundaries

- Write only the owned reports listed below.
- Never rewrite accepted event-stream records.
- Do not silently mutate source, infrastructure, external systems, or unrelated artifacts.

## Procedure

1. Confirm the target artifact owner, current version, downstream consumers, and non-negotiable compatibility constraints.
2. Define migration phases: preflight checks, backup or snapshot, forward change, verification checks, and rollback trigger.
3. Build a compatibility matrix for producer/consumer version combinations and identify any required phased rollout.
4. Produce a migration plan with exact change steps, deterministic validation commands, evidence capture, and cutover criteria.
5. Produce a rollback plan with objective rollback triggers, restore order, and post-rollback validation.
6. Record assumptions, residual risks, and explicitly blocked prerequisites.
7. Validate outputs for internal consistency before publication.

## Validation

- The plan enumerates forward and rollback sequences with deterministic pass/fail gates.
- Every compatibility claim references observed dependency evidence and affected consumers.
- Backup or snapshot requirements are explicit and testable before cutover.
- Blocked prerequisites and non-validated steps are explicit and not marked successful.

## Outputs

- `reports/artifact-upgrade-plan.json`
- `reports/artifact-upgrade-report.md`

## Failure Behavior

- Fail closed when ownership, dependency evidence, or rollback viability is missing.
- Emit a blocked migration plan that lists unresolved compatibility or safety prerequisites.
- Never permit a cutover-ready conclusion without both forward and rollback validation paths.

## Approval Gates

Require explicit approval before executing any migration that mutates versioned artifacts, schemas, or consumer contracts.

## Composition and Dependencies

- skill-inventory
- skill-dependency-manager

## Examples

- Plan a schema upgrade by mapping all dependent reports and producing a phased compatibility rollout.
- Produce a rollback-first migration package when downstream consumer readiness is incomplete.

## Related commands

- Run the skill with /artifact-upgrade.
- Open this help with /artifact-upgrade-help.
- Inspect the full contract with @.github/skills/artifact-upgrade/SKILL.md.
