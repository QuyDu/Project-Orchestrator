---
mode: agent
description: Help for the change-review skill.
---

# change-review Help

Review a bounded working-tree, commit, or pull-request diff for defects, security regressions, requirement gaps, and missing tests, with severity-ranked evidence. Use before commit or merge; use audit-code instead for repository-wide assessment.

Explain this contract as help only. Do not execute its procedures or treat examples as action approval.
Read the complete contract at .github/skills/change-review/SKILL.md before using this skill.

## Purpose

Evaluate a precisely bounded change against its intent and surrounding code, producing actionable findings without mutating the reviewed change.

## Preconditions

- Read repository instructions and applicable configuration.
- Identify the exact base and head revisions or working-tree scope.
- Obtain the change objective, acceptance criteria, and available validation evidence.

## Inputs

- Bounded diff, changed-file list, and relevant surrounding implementation.
- Requested behavior, issue or plan, repository conventions, and test results.
- Security and compatibility constraints applicable to the changed surface.

## Approved Tools and Resources

- Use read-only diff, history, reference, diagnostic, and test-result inspection.
- Run non-mutating focused validation when needed to confirm a finding.
- Use authoritative documentation for security, API, or compatibility claims.

## Read and Write Boundaries

- Do not edit files while acting as reviewer.
- Write only the owned reports listed below.
- Do not review unrelated pre-existing changes outside the declared base/head scope.

## Procedure

1. Freeze the review boundary and summarize the intended behavior in verifiable terms.
2. Inspect the diff and the nearest controlling call sites, contracts, tests, and error paths.
3. Check correctness, security, data integrity, concurrency, resource handling, compatibility, and test sufficiency proportional to the change.
4. Confirm each potential issue against concrete code or executable evidence and avoid speculative style findings.
5. Rank findings by user impact and exploitability; include location, failure scenario, evidence, and a minimal remediation direction.
6. Record open questions, validation gaps, and residual risk separately from confirmed findings.
7. Emit machine-readable and concise human-readable reports with identical finding IDs and ordering.

## Validation

- Every finding is introduced or exposed by the bounded change and cites reproducible evidence.
- Severity reflects concrete impact rather than effort or preference.
- The report states the exact review boundary and validation commands inspected or run.
- A no-findings result still records test gaps and residual risk.

## Outputs

- `reports/change-review.json`
- `reports/change-review.md`

## Failure Behavior

- Return blocked status when the diff boundary, intent, or required context cannot be established.
- Mark unconfirmed concerns as questions or risks, not findings.
- Never modify the reviewed files or claim repository-wide coverage.

## Approval Gates

No approval is required for local read-only review; require approval before remote access or executing privileged validation.

## Composition and Dependencies

- policy-engine

## Examples

- Review the current branch against its merge base and report a high-severity authorization regression with a missing negative test.
- Produce a no-findings report for a documentation-only diff while recording that executable validation was not applicable.

## Related commands

- Run the skill with /change-review.
- Open this help with /change-review-help.
- Inspect the full contract with @.github/skills/change-review/SKILL.md.
