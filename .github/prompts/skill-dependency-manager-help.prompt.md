---
mode: agent
description: Help for the skill-dependency-manager skill.
---

# skill-dependency-manager Help

Resolve skill and artifact dependencies, validate compatible versions, detect cycles, assess upgrade impact, and generate dependency graphs. Use for the skill and artifact graph; use dependency-maintenance instead for application package dependencies.

Explain this contract as help only. Do not execute its procedures or treat examples as action approval.
Read the complete contract at .github/skills/skill-dependency-manager/SKILL.md before using this skill.

## Purpose

Resolve skill and artifact dependencies, validate compatible versions, detect cycles, assess upgrade impact, and generate dependency graphs.

## Preconditions

- Read repository instructions and applicable configuration.
- Inspect authoritative existing artifacts before replacing derived views.
- Verify that this skill owns the requested decision or output.

## Inputs

- Skill metadata and artifact ownership inventory from `skill-inventory` outputs.
- Contract-declared composition edges and optional version constraints.
- Requested dependency analysis scope: full graph, impacted subset, or migration target.

## Approved Tools and Resources

- Use read-only repository inspection by default.
- Use deterministic scripts and schema validators when provided.
- Use mutating tools only within the approved workflow boundary.

## Read and Write Boundaries

- Write only the owned reports listed below.
- Never rewrite accepted event-stream records.
- Do not silently mutate source, infrastructure, external systems, or unrelated artifacts.

## Procedure

1. Parse all skill contracts to extract direct dependency edges and normalize IDs.
2. Validate each edge target exists and identify missing or malformed dependency declarations.
3. Build directed graphs for skill-to-skill dependencies and artifact producer/consumer relationships.
4. Detect cycles, unreachable nodes, and conflicting ownership chains.
5. Assess upgrade impact by enumerating downstream dependents and compatibility risk points.
6. Emit graph and report artifacts with actionable findings and safe ordering recommendations.

## Validation

- Graph edges exactly match normalized contract declarations.
- Every cycle finding includes a concrete node path.
- Missing dependency and ownership conflict findings include deterministic reproduction context.
- Upgrade impact paths are traceable from source change to affected dependents.

## Outputs

- `reports/skill-dependency-graph.json`
- `reports/skill-dependency-report.md`

## Failure Behavior

- Fail closed when inventory artifacts are unavailable or inconsistent.
- Emit blocked status when graph construction cannot guarantee integrity.
- Never mark dependency health as clean if any unresolved cycle or missing node exists.

## Approval Gates

This skill is analytical; require explicit approval before any dependency remediation that mutates contracts.

## Composition and Dependencies

- skill-inventory

## Examples

- Generate an acyclic dependency graph before introducing a new composition edge.
- Assess which downstream skills are impacted by a proposed contract lifecycle change.

## Related commands

- Run the skill with /skill-dependency-manager.
- Open this help with /skill-dependency-manager-help.
- Inspect the full contract with @.github/skills/skill-dependency-manager/SKILL.md.
