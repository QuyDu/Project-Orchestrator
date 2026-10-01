---
mode: agent
description: Help for the audit-azure-environment skill.
---

# audit-azure-environment Help

Perform an evidence-based, read-only Azure security, reliability, governance, cost, and configuration assessment. Use to assess a deployed tenant, subscription, or resource group; use architecture-review instead for design-time review of infrastructure code in the repository.

Explain this contract as help only. Do not execute its procedures or treat examples as action approval.
Read the complete contract at .github/skills/audit-azure-environment/SKILL.md before using this skill.

## Purpose

Perform an evidence-based, read-only Azure security, reliability, governance, cost, and configuration assessment.

## Preconditions

- Read repository instructions and applicable configuration.
- Inspect authoritative existing artifacts before replacing derived views.
- Verify that this skill owns the requested decision or output.

## Inputs

- Audit scope: tenant, subscriptions, management groups, resource groups, and exclusions.
- Security, reliability, governance, and cost priorities plus required policy baselines.
- Collected Azure evidence: resource inventories, policy states, identity assignments, diagnostics, and billing signals.

## Approved Tools and Resources

- Use read-only repository inspection by default.
- Use deterministic scripts and schema validators when provided.
- Use mutating tools only within the approved workflow boundary.

## Read and Write Boundaries

- Write only the owned reports listed below.
- Never rewrite accepted event-stream records.
- Do not silently mutate source, infrastructure, external systems, or unrelated artifacts.

## Procedure

1. Confirm scope boundaries, data sources, and read-only constraints before collecting findings.
2. Evaluate security posture: identity/RBAC, network exposure, secret handling, encryption, and threat-protection configuration.
3. Evaluate reliability posture: HA/DR settings, backup coverage, monitoring/alerting, and service resiliency patterns.
4. Evaluate governance posture: policy compliance, tagging, resource hygiene, and management guardrails.
5. Evaluate cost posture: overprovisioning, orphaned resources, commitment opportunities, and anomaly indicators.
6. Record findings with evidence references, impact, confidence, and remediation direction while separating verified facts from assumptions.
7. Emit the machine-readable report with explicit limitations for unavailable evidence.

## Validation

- Every finding includes reproducible evidence path, affected scope, impact, and confidence.
- No recommendation implies mutation execution by this skill.
- Audit limitations and inaccessible data sources are explicit.
- Output is internally consistent and consumable by downstream review.

## Outputs

- `reports/azure-audit-findings.json`

## Failure Behavior

- Fail closed when scope authority or evidence provenance cannot be established.
- Return a partial assessment only when covered scope is explicit and separated from unknown scope.
- Never claim compliance or safety for areas without supporting evidence.

## Approval Gates

This skill is read-only; require separate explicit approval for any command that mutates Azure resources or policy state.

## Composition and Dependencies

- None

## Examples

- Assess a subscription's security and policy drift while preserving evidence for formal review.
- Produce a cost and reliability risk summary for resources in a scoped resource group set.

## Related commands

- Run the skill with /audit-azure-environment.
- Open this help with /audit-azure-environment-help.
- Inspect the full contract with @.github/skills/audit-azure-environment/SKILL.md.
