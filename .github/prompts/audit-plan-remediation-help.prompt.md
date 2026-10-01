---
mode: agent
description: Help for the audit-plan-remediation skill.
---

# audit-plan-remediation Help

Convert validated audit findings into prioritized remediation work with owners, dependencies, verification, rollout, and rollback guidance. Use after findings are reviewed and confirmed; do not use to generate findings or to execute the remediation work.

Explain this contract as help only. Do not execute its procedures or treat examples as action approval.
Read the complete contract at .github/skills/audit-plan-remediation/SKILL.md before using this skill.

## Purpose

Convert validated audit findings into prioritized, complexity-estimated remediation phases with owners, dependencies, verification, rollout, and rollback guidance. This skill plans work only; `audit-remediation` exclusively owns execution.

## Preconditions

- Read repository instructions and applicable configuration.
- Inspect authoritative existing artifacts before replacing derived views.
- Verify that this skill owns the requested decision or output.

## Inputs

- `reports/code-audit-review.json` or `reports/azure-audit-review.json` produced by `audit-review-findings`.
- Delivery constraints, ownership boundaries, maintenance windows, risk tolerance, and required approval policy.
- Repository architecture and dependency evidence needed to sequence changes safely.

## Approved Tools and Resources

- Use read-only repository inspection by default.
- Use deterministic scripts and schema validators when provided.
- Use mutating tools only within the approved workflow boundary.

## Read and Write Boundaries

- Write only the owned reports listed below.
- Never rewrite accepted event-stream records.
- Do not silently mutate source, infrastructure, external systems, or unrelated artifacts.

## Procedure

1. Validate the reviewed findings report against `schemas/audit-findings-review.schema.json`; reject raw or unreviewed findings.
2. Include confirmed findings and explicitly disposition `needs-more-evidence`, disputed, and false-positive findings without scheduling unsupported repairs.
3. Build a directed dependency graph from finding prerequisites, shared root causes, affected components, containment needs, and release constraints. Reject cycles until they are resolved or explicitly broken into phases.
4. Estimate each item as `low`, `medium`, `high`, or `very-high` complexity using affected scope, dependency depth, migration needs, validation breadth, rollback difficulty, and operational coordination. Record rationale; never use complexity to defer required containment silently.
5. Prioritize mandatory containment and critical/high security findings first, except where a prerequisite must precede them. Then order by dependency criticality, severity, exploitability, user impact, confidence, complexity, and remediation cost.
6. Group findings only when one change and one verification strategy resolves the same root cause; preserve all source finding IDs.
7. For each work item define owner role, scope, prerequisites, implementation steps, complexity and rationale, Microsoft and industry guidance inherited from review, acceptance criteria, tests, security validation, rollout, rollback, approvals, and residual risk.
8. Define stable milestone IDs as executable phase IDs and list their ordered item IDs. Separate immediate containment, permanent remediation, and deferred risk acceptance; identify parallelizable work without violating dependencies.
9. Require explicit approval for accepted risk, destructive changes, production deployment, external mutation, or bypassing a security control.
10. Emit new plans with `schemaVersion: 2.1.0`, preserve the source review `auditRunId`, bind `sourceReviewSha256`, include `complexity`, validate schema, and run `audit-validate.mjs plan`. Legacy plans remain readable but cannot establish current run-bound execution.

## Validation

- Every confirmed reviewed finding is mapped to a remediation item, containment item, or explicit approved disposition.
- Dependencies are acyclic, resolvable, and reflected in execution order; no lower-severity item bypasses an unresolved prerequisite.
- Each item has acceptance criteria, verification, owner role, rollout, rollback, approval requirements, and source finding IDs.
- Every item has a complexity estimate and rationale; every milestone has a stable phase ID usable by `audit-remediation -Phase`.
- The JSON validates against `schemas/audit-remediation-plan.schema.json`; Markdown preserves the same ordering and traceability.
- Current schema 2.1 plans preserve the source review auditRunId and SHA-256 digest.

## Outputs

- `reports/audit-remediation-plan.json`
- `reports/audit-remediation-plan.md`

## Failure Behavior

- Fail closed when authority, evidence, schema compatibility, or approval is missing.
- Preserve valid partial artifacts and identify a safe resume or recovery point.
- Never report success for blocked or unvalidated work.

## Approval Gates

Pause for explicit approval before destructive, external, privileged, irreversible, or scope-expanding actions.

## Composition and Dependencies

- audit-review-findings
- policy-engine

## Examples

- Invoke `audit-plan-remediation` when its owned capability is selected by the workflow plan.
- Validate its reports before downstream skills consume them.

## Related commands

- Run the skill with /audit-plan-remediation.
- Open this help with /audit-plan-remediation-help.
- Inspect the full contract with @.github/skills/audit-plan-remediation/SKILL.md.
