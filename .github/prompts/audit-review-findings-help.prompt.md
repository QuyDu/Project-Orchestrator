---
mode: agent
description: Help for the audit-review-findings skill.
---

# audit-review-findings Help

Transform structured audit findings into a traceable mixed-audience review while preserving IDs, severity, confidence, evidence, and limitations. Use between audit-code and remediation planning; do not use to discover new findings.

Explain this contract as help only. Do not execute its procedures or treat examples as action approval.
Read the complete contract at .github/skills/audit-review-findings/SKILL.md before using this skill.

## Purpose

Transform structured audit findings into a traceable mixed-audience review while preserving IDs, severity, confidence, evidence, and limitations.

## Preconditions

- Read repository instructions and applicable configuration.
- Inspect authoritative existing artifacts before replacing derived views.
- Verify that this skill owns the requested decision or output.

## Inputs

- `reports/code-audit-findings.json` from `audit-code` and/or `reports/azure-audit-findings.json` from `audit-azure-environment`.
- The source revision and repository evidence cited by each finding.
- Current authoritative Microsoft documentation and applicable industry standards.

## Approved Tools and Resources

- Use read-only repository inspection by default.
- Use deterministic scripts and schema validators when provided.
- Use mutating tools only within the approved workflow boundary.

## Read and Write Boundaries

- Write only the owned reports listed below.
- Never rewrite accepted event-stream records.
- Do not silently mutate source, infrastructure, external systems, or unrelated artifacts.

## Procedure

1. Select the input report by audit type and validate it against its declared schema before interpreting findings.
2. Preserve every source finding ID and evidence reference. For schema 2.0 and 2.1 code audits, also preserve repository evidence, standards applicability and control status, exceptions and expiry, assurance conclusion, blocking evidence, and limitations. For schema 2.1, preserve `verificationEvidence` exactly. Do not silently add, merge, split, suppress, or change severity; record each review decision and rationale.
3. Reproduce or corroborate each finding where feasible and classify it as `confirmed`, `needs-more-evidence`, `disputed`, or `false-positive`.
4. Explain why the issue matters, the affected behavior and stakeholders, exploitability when relevant, security severity, bug type, root cause, and likely consequence of leaving it unresolved.
5. Add implementation-ready resolution guidance, alternatives and tradeoffs, validation steps, rollout considerations, and rollback guidance proportional to risk.
6. Cite current Microsoft best practices when the technology is Microsoft-owned or Microsoft guidance applies. Also cite authoritative industry practices such as OWASP, CWE, NIST, CIS, language/framework maintainers, or standards bodies as applicable. Include title, publisher, URL, and access date; never invent a citation.
7. Identify prerequisites and dependencies among findings without scheduling remediation. Mark urgent containment separately from permanent repair.
8. Order the human-readable review by confirmed security severity, then dependency impact and confidence. Preserve limitations and unresolved questions.
9. Emit a review matching the source schema version through 2.2. Schema 2.2 reviews preserve `auditRunId`, immutable evidence reference, assurance, and verification evidence exactly. Validate schema and run `audit-validate.mjs review` before downstream planning.

## Validation

- Input and output reports validate against their schemas, including `schemas/audit-findings-review.schema.json`, and every source finding appears exactly once in the reviewed output.
- Each confirmed finding contains issue context, bug type, security severity, resolution detail, verification steps, and applicable best-practice citations.
- Severity changes, false-positive decisions, and unresolved evidence are explicit and justified.
- Reviews of schema 2.0 or 2.1 code audits cannot upgrade or soften the source assurance conclusion. Schema 2.1 reviews preserve secret, analyzer, resource-ownership, AI-quality, and assurance-gate evidence exactly.
- Schema 2.1 reviews preserve verification evidence exactly.
- Machine-readable JSON remains authoritative; Markdown preserves IDs, ordering, status, and limitations.

## Outputs

- `reports/code-audit-review.json`
- `reports/code-audit-review.md`
- `reports/azure-audit-review.json`
- `reports/azure-audit-review.md`

## Failure Behavior

- Fail closed when authority, evidence, schema compatibility, or approval is missing.
- Preserve valid partial artifacts and identify a safe resume or recovery point.
- Never report success for blocked or unvalidated work.

## Approval Gates

Pause for explicit approval before destructive, external, privileged, irreversible, or scope-expanding actions.

## Composition and Dependencies

- audit-code
- audit-azure-environment

## Examples

- Invoke `audit-review-findings` when its owned capability is selected by the workflow plan.
- Validate its reports before downstream skills consume them.

## Related commands

- Run the skill with /audit-review-findings.
- Open this help with /audit-review-findings-help.
- Inspect the full contract with @.github/skills/audit-review-findings/SKILL.md.
