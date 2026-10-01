---
mode: agent
description: Help for the skill-inventory skill.
---

# skill-inventory Help

Discover and inventory skills, reports, add-ins, integrations, schemas, templates, adapters, migrations, runtime components, and configuration extensions. Use to establish what capabilities and artifacts a project actually has before planning; do not use to execute them.

Explain this contract as help only. Do not execute its procedures or treat examples as action approval.
Read the complete contract at .github/skills/skill-inventory/SKILL.md before using this skill.

## Purpose

Discover and inventory skills, reports, add-ins, integrations, schemas, templates, adapters, migrations, runtime components, and configuration extensions.

## Preconditions

- Read repository instructions and applicable configuration.
- Inspect authoritative existing artifacts before replacing derived views.
- Verify that this skill owns the requested decision or output.

## Inputs

- Repository root path and inclusion/exclusion rules for discoverable framework artifacts.
- Skill contract files, schemas, configs, reports, templates, and runtime descriptors.
- Prior inventory artifacts for drift comparison when available.

## Approved Tools and Resources

- Use read-only repository inspection by default.
- Use deterministic scripts and schema validators when provided.
- Use mutating tools only within the approved workflow boundary.

## Read and Write Boundaries

- Write only the owned reports listed below.
- Never rewrite accepted event-stream records.
- Do not silently mutate source, infrastructure, external systems, or unrelated artifacts.

## Procedure

1. Enumerate all discoverable artifacts in scope and classify by type.
2. Extract normalized metadata for each skill: ID, capability, dependencies, outputs, and lifecycle markers.
3. Derive artifact ownership map from contract-declared outputs and detect collisions.
4. Build detailed skill records, including source paths and contract completeness indicators.
5. Compare with prior inventory to flag additions, removals, and significant metadata drift.
6. Emit inventory and detail artifacts for downstream dependency and orchestration consumers.

## Validation

- Every discovered skill directory has exactly one corresponding inventory entry.
- Output ownership collisions are explicit with conflicting producers listed.
- Markdown views summarize the same counts and IDs as machine-readable outputs.
- Unknown artifact classes are reported as degraded discovery, not silently dropped.

## Outputs

- `reports/skill-inventory.json`
- `reports/skill-inventory.md`
- `reports/skill-details.json`
- `reports/skill-details.md`
- `reports/artifact-ownership.json`

## Failure Behavior

- Fail closed when inventory coverage cannot be established for required paths.
- Publish partial inventory only when covered paths are explicit and reproducible.
- Never claim full inventory completeness while discovery is blocked.

## Approval Gates

This skill is read-only; require explicit approval before any requested remediation that mutates discovered artifacts.

## Composition and Dependencies

- None

## Examples

- Generate baseline skill and artifact ownership catalogs for dependency validation.
- Detect newly added skills and report missing contract metadata fields.

## Related commands

- Run the skill with /skill-inventory.
- Open this help with /skill-inventory-help.
- Inspect the full contract with @.github/skills/skill-inventory/SKILL.md.
