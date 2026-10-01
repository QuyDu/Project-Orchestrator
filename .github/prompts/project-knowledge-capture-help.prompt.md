---
mode: agent
description: Help for the project-knowledge-capture skill.
---

# project-knowledge-capture Help

Transform verified decisions, lessons, patterns, anti-patterns, and architecture discoveries into reusable project knowledge. Use when an insight should outlive the current task; use project-handoff instead for current status and next actions.

Explain this contract as help only. Do not execute its procedures or treat examples as action approval.
Read the complete contract at .github/skills/project-knowledge-capture/SKILL.md before using this skill.

## Purpose

Transform verified decisions, lessons, patterns, anti-patterns, and architecture discoveries into reusable project knowledge.

## Preconditions

- Read repository instructions and applicable configuration.
- Inspect authoritative existing artifacts before replacing derived views.
- Verify that this skill owns the requested decision or output.

## Inputs

- Verified project continuity records from `project-handoff` outputs.
- Evidence for decisions, outcomes, incidents, and remediation effectiveness.
- Existing knowledge artifacts to avoid duplicate or contradictory entries.

## Approved Tools and Resources

- Use read-only repository inspection by default.
- Use deterministic scripts and schema validators when provided.
- Use mutating tools only within the approved workflow boundary.

## Read and Write Boundaries

- Write only the owned reports listed below.
- Never rewrite accepted event-stream records.
- Do not silently mutate source, infrastructure, external systems, or unrelated artifacts.

## Procedure

1. Gather candidate knowledge signals from handoffs, validated outcomes, and recurring issues.
2. Filter to verified facts and explicitly exclude unconfirmed hypotheses.
3. Normalize entries into reusable forms: decision, lesson, pattern, anti-pattern, and architecture note.
4. Attach context, trigger conditions, constraints, and evidence provenance to each entry.
5. Merge duplicates by root concept while preserving distinct evidence trails.
6. Publish machine-readable and markdown knowledge artifacts.

## Validation

- Each knowledge entry maps to at least one verified evidence source.
- Entries distinguish universally reusable guidance from context-specific caveats.
- Contradictory entries are resolved or marked with explicit uncertainty.
- Outputs remain traceable and consumable by downstream memory workflows.

## Outputs

- `reports/knowledge.json`
- `reports/knowledge-capture.md`

## Failure Behavior

- Fail closed when evidence provenance for claimed lessons is missing.
- Emit blocked status when conflicting evidence cannot be reconciled.
- Never promote speculative advice as verified project knowledge.

## Approval Gates

Require explicit approval before publishing knowledge externally or applying knowledge-driven policy changes.

## Composition and Dependencies

- project-handoff

## Examples

- Convert repeated rollback incidents into an anti-pattern with clear prevention guidance.
- Capture a verified design decision with conditions where it should not be reused.

## Related commands

- Run the skill with /project-knowledge-capture.
- Open this help with /project-knowledge-capture-help.
- Inspect the full contract with @.github/skills/project-knowledge-capture/SKILL.md.
