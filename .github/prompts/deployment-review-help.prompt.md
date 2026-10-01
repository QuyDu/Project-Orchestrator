---
mode: agent
description: Help for the deployment-review skill.
---

# deployment-review Help

Validate that a release candidate is deployable by checking build reproducibility, configuration completeness, environment parity, verification steps, and rollback readiness. Use before requesting deployment approval; this skill never performs a deployment.

Explain this contract as help only. Do not execute its procedures or treat examples as action approval.
Read the complete contract at .github/skills/deployment-review/SKILL.md before using this skill.

## Purpose

Determine whether a release candidate can be deployed safely to a named environment, and produce the gate evidence, verification procedure, and rollback route required before deployment approval is requested.

## Preconditions

- Read repository instructions, deployment documentation, and prior deployment evidence.
- Confirm the target environment, its blast radius, and whether it carries production data.
- Confirm this skill owns the pre-deployment decision; it never executes a deployment.
- Require current architecture and security review evidence before assessing readiness.

## Inputs

- Target environment, release identifier, and the change set included in the candidate.
- Build, packaging, and pipeline definitions plus their pinned dependency and action versions.
- Environment configuration, secret references, feature flags, and infrastructure definitions.
- Findings from `security-review` and `architecture-review` for the same candidate.
- Migration definitions, data-compatibility constraints, and the declared recovery objectives.

## Approved Tools and Resources

- Use read-only inspection of pipeline definitions, manifests, configuration, and infrastructure code.
- Use read-only queries against a target environment only when explicitly authorized.
- Use schema validators for the emitted report.
- Do not deploy, promote, migrate, restart, scale, or mutate any environment.

## Read and Write Boundaries

- Write only the owned reports listed below.
- Never modify pipelines, configuration, infrastructure, secrets, or environment state.
- Never record secret values; record only the reference and the resolution mechanism.

## Procedure

1. Identify the exact candidate under review and the environment it targets, and record the blast radius of a failed deployment.
2. Verify build reproducibility: pinned dependencies, committed lock files, pinned pipeline actions, and a deterministic artifact.
3. Verify configuration completeness: every required setting and secret reference exists for the target environment and resolves without a literal value in source.
4. Verify environment parity: differences between the candidate's validated environment and the target, including region, cloud, scale, and data volume.
5. Verify that unresolved blocking findings from `security-review` and `architecture-review` are closed or explicitly accepted by a named owner.
6. Verify data safety: schema migrations are backward compatible or gated, backups are current, and restore has been exercised.
7. Verify observability: health signals, alerts, and dashboards exist and will show a failed deployment.
8. Define the post-deployment verification procedure and the specific signals that constitute success.
9. Define the rollback route, its trigger conditions, its time cost, and any irreversible step that rollback cannot undo.
10. Emit a readiness decision of `ready`, `conditional`, or `blocked`, with every unmet gate enumerated.

## Validation

- Every readiness gate has an explicit pass, fail, or not-applicable state with evidence.
- No blocking security or architecture finding is unresolved and unaccepted.
- The rollback route is concrete, time-bounded, and names irreversible steps.
- Post-deployment verification signals are specific and observable.
- A `ready` decision is never emitted while any blocking gate is unmet.
- The report validates against `schemas/deployment-review.schema.json` and the Markdown view derives from it.

## Outputs

- `reports/deployment-review.json`
- `reports/deployment-review.md`

## Failure Behavior

- Fail closed when the candidate, target environment, or rollback route cannot be established.
- Emit `blocked` rather than `conditional` when a gate cannot be evaluated at all.
- Never infer readiness from a previous successful deployment of a different candidate.

## Approval Gates

This skill is read-only and produces a recommendation only. Deployment, promotion, migration, and rollback each require separate explicit user approval and are executed outside this skill.

## Composition and Dependencies

- architecture-review
- security-review

## Examples

- Assess a release candidate for a staging environment and return `conditional` with the two unmet observability gates enumerated.
- Return `blocked` for a production candidate whose database migration is not backward compatible and has no tested restore path.

## Related commands

- Run the skill with /deployment-review.
- Open this help with /deployment-review-help.
- Inspect the full contract with @.github/skills/deployment-review/SKILL.md.
