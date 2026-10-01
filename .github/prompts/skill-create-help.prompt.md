---
mode: agent
description: Help for the skill-create skill.
---

# skill-create Help

Create concise, composable skill packages with valid metadata, bounded tools, ownership, validation, dependencies, help, and documentation. Always use when a user asks, directly or indirectly, to create, add, define, author, build, or make a new skill; use skill-update for an existing skill.

Explain this contract as help only. Do not execute its procedures or treat examples as action approval.
Read the complete contract at .github/skills/skill-create/SKILL.md before using this skill.

## Purpose

Create concise, composable skill packages with valid metadata, bounded tools, ownership, validation, dependencies, help, and examples. This is the mandatory entry point for every request to create a new skill, regardless of the user's wording.

## Preconditions

- Read repository instructions and applicable configuration.
- Inspect authoritative existing artifacts before replacing derived views.
- Verify that this skill owns the requested decision or output.

## Inputs

- Target skill ID, capability description, ownership intent, and allowed tool boundary.
- Existing inventory and dependency evidence from `skill-inventory` and `skill-dependency-manager`.
- The user's requested capability, expected inputs and outputs, audience, triggers, and failure behavior.
- Required schemas, conventions, and repository instruction constraints for skill contracts.

## Approved Tools and Resources

- Use read-only repository inspection by default.
- Use deterministic scripts and schema validators when provided.
- Use mutating tools only within the approved workflow boundary.

## Read and Write Boundaries

- Write only the owned reports listed below.
- Never rewrite accepted event-stream records.
- Do not silently mutate source, infrastructure, external systems, or unrelated artifacts.

## Procedure

1. Route every skill-creation request here, even when the user describes the desired behavior without using the word skill.
2. Understand the requested capability and distinguish creation from work on an existing skill ID. Route updates and extensions to `skill-update` and lifecycle changes to `skill-registry`.
3. Run `skill-inventory` and compare the request against existing skill names, descriptions, outputs, ownership, and triggers. Reuse or extend a matching capability; do not create a duplicate silently.
4. When no duplicate exists, identify reusable skills that should provide authoritative inputs or workflow steps, including project-understanding for current-project discovery when applicable.
5. When no existing skill fits, notify the user of the inventory result and obtain explicit approval before authoring a new skill.
6. Validate that frontmatter name exactly matches directory ID and remains lowercase kebab-case.
7. Define or refine contract sections: purpose, authoritative inputs, deterministic procedure, validation, failure behavior, approval gates, and examples.
8. Analyze both directions of integration: determine which existing skills the new skill must depend on and which existing skills should depend on or route to the new capability. Record every accepted or rejected wiring decision with its rationale.
9. Ensure dependencies include only existing skill IDs that are required as authoritative inputs and remain acyclic and dependency-closed.
10. Verify output ownership boundaries and remove ambiguous ownership claims.
11. Apply minimal edits to the new skill package and its approved routing, profile, and test surfaces.
12. Verify deterministic help is generated as `.github/prompts/<skill-name>-help.prompt.md` for generated and adopted projects and matches the new contract.
13. Refresh the authoritative skill inventory, Project Understanding, `docs/PROJECT-GUIDE.md`, `reports/project-guide.json`, and human-facing skill catalog or count references from verified repository evidence.
14. Re-check contract completeness, ownership, dependency closure, help coverage, documentation accuracy, and duplicate-skill evidence after creation.

## Validation

- Updated skill contract is complete, internally consistent, and executable without placeholder language.
- The request's capability comparison is recorded and any similar or duplicate skill was reported before authoring.
- Reusable existing skills are referenced as dependencies whenever they provide authoritative inputs or required workflow steps.
- Incoming and outgoing wiring decisions are explicit, justified, and preserve single-owner routing.
- Declared dependencies resolve to existing skills and are acyclic.
- Ownership and mutation boundaries are explicit and non-conflicting.
- Generated and adopted projects receive one current help prompt for every governed skill.
- Inventory, authoritative documentation, human-facing skill details, and skill counts agree with the discovered repository state.
- Any unresolved contract ambiguity is recorded as blocked work, not silently accepted.

## Outputs

- No dedicated report; the created or updated skill package is the output.

## Failure Behavior

- Fail closed when requested ownership or dependency claims conflict with existing contracts.
- Preserve unchanged skills when validation fails and report exact blocking defects.
- Never publish a partially defined skill as complete.

## Approval Gates

Require explicit approval before authoring a new skill after the inventory finds no reusable match, and before publishing or installing skills outside the local repository.

## Composition and Dependencies

- skill-inventory
- skill-dependency-manager
- project-understanding
- documentation-builder

## Examples

- Create a new skill contract for a bounded reporting capability with explicit ownership and validation criteria.
- Update an existing skill's dependencies after verifying authoritative artifact usage.

## Related commands

- Run the skill with /skill-create.
- Open this help with /skill-create-help.
- Inspect the full contract with @.github/skills/skill-create/SKILL.md.
