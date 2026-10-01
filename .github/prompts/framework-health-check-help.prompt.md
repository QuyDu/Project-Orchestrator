---
mode: agent
description: Help for the framework-health-check skill.
---

# framework-health-check Help

Validate framework structure, skill contracts, schemas, ownership, profiles, fixtures, configuration, and conformance evidence. Use to verify the installed orchestrator framework itself; use audit-code instead to assess application code.

Explain this contract as help only. Do not execute its procedures or treat examples as action approval.
Read the complete contract at .github/skills/framework-health-check/SKILL.md before using this skill.

## Purpose

Validate framework structure, skill contracts, schemas, ownership, profiles, fixtures, configuration, and conformance evidence.

## Preconditions

- Read repository instructions and applicable configuration.
- Inspect authoritative existing artifacts before replacing derived views.
- Verify that this skill owns the requested decision or output.

## Inputs

- Repository framework layout, skill contracts, schemas, profiles, and configuration files.
- Current inventory outputs and artifact ownership map from `skill-inventory`.
- Dependency graph evidence from `skill-dependency-manager` when available.

## Approved Tools and Resources

- Use read-only repository inspection by default.
- Use deterministic scripts and schema validators when provided.
- Use mutating tools only within the approved workflow boundary.

## Read and Write Boundaries

- Write only the owned reports listed below.
- Never rewrite accepted event-stream records.
- Do not silently mutate source, infrastructure, external systems, or unrelated artifacts.

## Procedure

1. Verify required framework directories, contract files, and schema files are present and readable.
2. Validate each skill contract for frontmatter integrity, required sections, and naming consistency.
3. Validate declared outputs against ownership declarations to detect collisions or unowned artifacts.
4. Check dependency consistency against known skill IDs and flag cycles or missing nodes.
5. Validate profile and orchestrator configuration references to existing skills and artifacts.
6. Summarize conformance status with actionable failures, warnings, and blockers.
7. Emit machine-readable and human-readable health reports from the same findings set.

## Validation

- Reported failures include precise file paths and failed rule identifiers.
- Conformance summary totals match the underlying machine-readable findings.
- Dependency and ownership issues are traceable to concrete contract evidence.
- Unknown or unvalidated checks are explicitly marked degraded or blocked.

## Outputs

- `reports/framework-health.json`
- `reports/framework-health.md`
- `reports/conformance-report.json`
- `reports/conformance-report.md`

## Failure Behavior

- Fail closed when foundational framework inputs are missing or unreadable.
- Emit partial health output only when covered checks are clearly partitioned from blocked checks.
- Never report conformance success while any critical contract integrity check is unresolved.

## Approval Gates

This skill is diagnostic; require explicit approval before any remediation step that mutates repository structure or contracts.

## Composition and Dependencies

- skill-inventory
- skill-dependency-manager

## Examples

- Run a full contract integrity check before accepting skill metadata changes.
- Produce a conformance report that pinpoints dependency cycles and ownership conflicts.

## Related commands

- Run the skill with /framework-health-check.
- Open this help with /framework-health-check-help.
- Inspect the full contract with @.github/skills/framework-health-check/SKILL.md.
