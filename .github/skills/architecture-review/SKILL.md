---
name: architecture-review
description: Assess a repository's designed architecture against reliability, security, cost, operational, and performance criteria using infrastructure-as-code, configuration, and decision records. Use for design-time review of the architecture a repository defines; use audit-azure-environment instead to assess a deployed cloud tenant.
lifecycle: draft
confidence: low
---

# architecture-review

## Purpose

Produce an evidence-based, design-time assessment of the architecture a repository defines, with pillar-aligned findings, trade-offs, and explicit coverage limits.

## Preconditions

- Read repository instructions and existing decision records before forming a judgment.
- Read prior architecture findings so this review supersedes rather than duplicates them.
- Confirm this skill owns design-time review; deployed-environment posture belongs to `audit-azure-environment`.

## Inputs

- Review scope: components, environments, regions, target cloud, and explicit exclusions.
- Infrastructure definitions, application configuration, service dependencies, and network topology declarations.
- Accepted decision records under `docs/adr/` and any documented non-functional requirements.
- Stated reliability, compliance, data-residency, and cost constraints.
- Clarification result from `clarify-the-ask` when scope, target cloud, or requirements are ambiguous.

## Approved Tools and Resources

- Use read-only repository inspection of infrastructure, configuration, and documentation.
- Use authoritative vendor documentation to confirm service capability, regional availability, and cloud-specific differences.
- Use schema validators for the emitted report.
- Do not query, modify, or deploy live environments.

## Read and Write Boundaries

- Write only the owned reports listed below.
- Never modify infrastructure definitions, configuration, or decision records.
- Do not restate deployed-environment findings owned by another skill.

## Procedure

1. Establish scope, target cloud, environments, and exclusions, and record what evidence exists for each.
2. Reconstruct the architecture from infrastructure definitions and configuration rather than from naming or documentation claims.
3. For agentic systems, reconstruct agent roles, orchestration, tool authority, state and memory ownership, human approval points, inter-agent trust, telemetry, and recovery paths; reject multi-agent complexity without a concrete boundary benefit.
4. Assess reliability: redundancy, failure domains, recovery objectives, backup coverage, and tested recovery paths.
5. Assess security architecture: identity model, authentication between services, network exposure, secret handling, encryption, and data-boundary controls.
6. Assess cost posture: sizing, tier selection, idle capacity, commitment opportunities, and cost drivers that scale with load.
7. Assess operational excellence: diagnostics, alerting, deployment repeatability, environment parity, and configuration drift risk.
8. Assess performance efficiency: scaling model, bottlenecks, data access patterns, and capacity assumptions.
9. Verify that each recommended service exists in the target region and cloud, and flag any recommendation that cannot be confirmed.
10. Reconcile findings against accepted decision records, distinguishing a violated decision from an undocumented one.
11. Record each finding with location, pillar, impact, severity, confidence, recommendation, and trade-offs, then state uncovered scope explicitly.

## Validation

- Every finding cites a concrete repository path or decision record.
- Each finding maps to exactly one pillar and carries severity and confidence.
- Recommendations identify trade-offs and never present a single option as the only option.
- Agent architecture findings distinguish model behavior, deterministic workflow control, tool authority, state ownership, and provider runtime boundaries.
- Service availability claims are confirmed for the stated region and cloud.
- Uncovered scope and unavailable evidence are enumerated.
- The report validates against `schemas/architecture-review.schema.json` and the Markdown view derives from it.

## Outputs

- `reports/architecture-review.json`
- `reports/architecture-review.md`

## Failure Behavior

- Fail closed when the architecture cannot be reconstructed from available evidence.
- Return a partial review only when covered and uncovered scope are separated explicitly.
- Never assert compliance, resilience, or cost efficiency for an area without supporting evidence.

## Approval Gates

This skill is read-only. Require separate explicit approval for any change to infrastructure, configuration, decision records, or deployed environments.

## Composition and Dependencies

- clarify-the-ask

## Examples

- Review a Bicep-defined Azure workload before its first production deployment and record pillar-aligned findings.
- Identify where the deployed design has drifted from an accepted decision record and flag the conflict for resolution.
