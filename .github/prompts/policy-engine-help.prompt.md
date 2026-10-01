---
mode: agent
description: Help for the policy-engine skill.
---

# policy-engine Help

Evaluate centralized authorization, risk, compliance, escalation, and approval policies without executing the governed action. Use to decide whether an action is allowed, denied, or approval-gated; never use it to perform the action.

Explain this contract as help only. Do not execute its procedures or treat examples as action approval.
Read the complete contract at .github/skills/policy-engine/SKILL.md before using this skill.

## Purpose

Evaluate centralized authorization, risk, compliance, escalation, and approval policies without executing the governed action.

## Preconditions

- Read repository instructions and applicable configuration.
- Inspect authoritative existing artifacts before replacing derived views.
- Verify that this skill owns the requested decision or output.

## Inputs

- Proposed action request including actor, target, scope, and intended mutation level.
- Applicable policy set, risk thresholds, and required approval rules.
- Evidence relevant to the decision context, including current workflow state when provided.

## Approved Tools and Resources

- Use read-only repository inspection by default.
- Use deterministic scripts and schema validators when provided.
- Use mutating tools only within the approved workflow boundary.

## Read and Write Boundaries

- Write only the owned reports listed below.
- Never rewrite accepted event-stream records.
- Do not silently mutate source, infrastructure, external systems, or unrelated artifacts.

## Procedure

1. Parse the request context into deterministic decision attributes.
2. Evaluate authorization rules, then risk/compliance constraints, then escalation and approval requirements.
3. Produce an allow, deny, or require-approval decision with ordered rule trace and rationale.
4. Attach required controls and preconditions for any non-deny outcome.
5. Record decision provenance and limitations without executing the governed action.

## Validation

- Decision is deterministic for the same input attributes and policy set.
- Rule trace shows every matched or blocking condition in evaluation order.
- Required approvals and control conditions are explicit when decision is not deny.
- Missing policy context results in blocked or deny, never implicit allow.

## Outputs

- `reports/policy-evaluation.json`
- `reports/policy-evaluation.md`
- `reports/policy-decision-log.jsonl`

## Failure Behavior

- Fail closed when policy set or decision attributes are incomplete.
- Emit blocked decision artifacts with unresolved input requirements.
- Never produce an allow decision without traceable policy justification.

## Approval Gates

Policy decisions never substitute for explicit user approval.

## Composition and Dependencies

- None

## Examples

- Evaluate whether a requested production deployment must be denied or escalated for security approval.
- Determine if a destructive migration requires additional controls before execution.

## Related commands

- Run the skill with /policy-engine.
- Open this help with /policy-engine-help.
- Inspect the full contract with @.github/skills/policy-engine/SKILL.md.
