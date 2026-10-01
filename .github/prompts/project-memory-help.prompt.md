---
mode: agent
description: Help for the project-memory skill.
---

# project-memory Help

Maintain operational experience and durable preferences while ensuring current instructions and repository evidence outrank saved memory. Use to record or recall durable working preferences across sessions; never use stored memory to override the current request or repository evidence.

Explain this contract as help only. Do not execute its procedures or treat examples as action approval.
Read the complete contract at .github/skills/project-memory/SKILL.md before using this skill.

## Purpose

Maintain operational experience and durable preferences while ensuring current instructions and repository evidence outrank saved memory.

## Preconditions

- Read repository instructions and applicable configuration.
- Inspect authoritative existing artifacts before replacing derived views.
- Verify that this skill owns the requested decision or output.

## Inputs

- Curated knowledge artifacts from `project-knowledge-capture`.
- Current repository instructions, contract rules, and authoritative runtime evidence.
- Existing memory entries and retention boundaries across user, session, and repository scopes.

## Approved Tools and Resources

- Use read-only repository inspection by default.
- Use deterministic scripts and schema validators when provided.
- Use mutating tools only within the approved workflow boundary.

## Read and Write Boundaries

- Write only the owned reports listed below.
- Never rewrite accepted event-stream records.
- Do not silently mutate source, infrastructure, external systems, or unrelated artifacts.

## Procedure

1. Identify candidate memory updates from verified project knowledge and recent validated outcomes.
2. Apply precedence rules: current user instructions and repository evidence override stored memory.
3. Store concise, reusable entries in the correct scope and avoid duplicating existing notes.
4. Remove or downgrade stale memory that conflicts with current authoritative evidence.
5. Publish an update report with additions, revisions, removals, and rationale.

## Validation

- Memory entries are concise, non-sensitive, and scoped correctly.
- Every new or changed entry references authoritative supporting evidence.
- No memory entry contradicts active instructions or verified repository state.
- Update report accurately reflects applied memory changes.

## Outputs

- `reports/project-memory.json`
- `reports/project-memory.md`

## Failure Behavior

- Fail closed when evidence does not support the proposed memory update.
- Preserve previous memory state when precedence conflicts cannot be resolved.
- Never persist uncertain claims as durable memory.

## Approval Gates

Require explicit approval before deleting broad memory scopes or exporting memory artifacts externally.

## Composition and Dependencies

- project-knowledge-capture

## Examples

- Add a verified repository convention to repository-scoped memory after repeated successful usage.
- Retire an outdated operational note after conflicting current evidence is confirmed.

## Related commands

- Run the skill with /project-memory.
- Open this help with /project-memory-help.
- Inspect the full contract with @.github/skills/project-memory/SKILL.md.
