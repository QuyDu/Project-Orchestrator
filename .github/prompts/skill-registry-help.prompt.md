---
mode: agent
description: Help for the skill-registry skill.
---

# skill-registry Help

Manage governed skill package metadata, discovery, provenance, integrity, lifecycle promotion, deprecation, retirement, and revocation proposals. Use to promote, deprecate, retire, or verify the provenance of a skill package; use skill-create instead to author its content.

Explain this contract as help only. Do not execute its procedures or treat examples as action approval.
Read the complete contract at .github/skills/skill-registry/SKILL.md before using this skill.

## Purpose

Manage governed skill package metadata, discovery, provenance, integrity, lifecycle promotion, deprecation, retirement, and revocation proposals.

## Preconditions

- Read repository instructions and applicable configuration.
- Inspect authoritative existing artifacts before replacing derived views.
- Verify that this skill owns the requested decision or output.

## Inputs

- Skill inventory and ownership metadata from `skill-inventory`.
- Dependency and impact evidence from `skill-dependency-manager`.
- Policy decisions for promotion, deprecation, retirement, or revocation from `policy-engine`.

## Approved Tools and Resources

- Use read-only repository inspection by default.
- Use deterministic scripts and schema validators when provided.
- Use mutating tools only within the approved workflow boundary.

## Read and Write Boundaries

- Write only the owned reports listed below.
- Never rewrite accepted event-stream records.
- Do not silently mutate source, infrastructure, external systems, or unrelated artifacts.

## Procedure

1. Resolve target skill packages and requested registry action.
2. Verify package integrity, provenance metadata, and ownership consistency.
3. Evaluate dependency impact and downstream break risk for the requested lifecycle action.
4. Enforce policy outcomes for authorization, risk controls, and required approvals.
5. Produce a governed action proposal with rationale, prerequisites, and rollback route.
6. Record decision status as approved, denied, or approval-required without performing remote mutation.

## Validation

- Proposal includes provenance, integrity checks, policy trace, and dependency impact summary.
- Lifecycle transitions are consistent with declared skill IDs and ownership boundaries.
- Required approvals are explicit for non-read-only actions.
- No registry mutation is represented as executed by this contract alone.

## Outputs

- `reports/skill-registry.json`
- `reports/skill-registry.md`

## Failure Behavior

- Fail closed when provenance, policy outcome, or dependency impact cannot be validated.
- Emit blocked proposals with unresolved approval or integrity prerequisites.
- Never recommend promotion or retirement without traceable governance evidence.

## Approval Gates

Publishing, installation, promotion, retirement, revocation, or remote mutation requires explicit approval.

## Composition and Dependencies

- skill-inventory
- skill-dependency-manager
- policy-engine

## Examples

- Prepare a deprecation proposal for a skill with complete dependency impact and policy trace.
- Block a promotion request when provenance checks fail or required approvals are missing.

## Related commands

- Run the skill with /skill-registry.
- Open this help with /skill-registry-help.
- Inspect the full contract with @.github/skills/skill-registry/SKILL.md.
