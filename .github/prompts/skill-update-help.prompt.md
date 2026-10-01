---
mode: agent
description: Help for the skill-update skill.
---

# skill-update Help

Identify and update an existing governed skill through candidate resolution, bounded change review, explicit proceed approval, dependency analysis, help regeneration, and project documentation refresh. Always use when a user asks to modify, revise, enhance, fix, or update an existing skill; use skill-create for new skills.

Explain this contract as help only. Do not execute its procedures or treat examples as action approval.
Read the complete contract at .github/skills/skill-update/SKILL.md before using this skill.

## Purpose

Update exactly one existing governed skill only after resolving its canonical ID, presenting the complete proposed change, and receiving explicit approval.

## Preconditions

- Read repository instructions and applicable configuration.
- Load the current skill inventory and dependency graph before proposing changes.
- Preserve the existing skill ID and public ownership boundary unless the user explicitly requests a separately governed migration.

## Inputs

- User intent, supplied skill name or description, requested behavior, constraints, and acceptance criteria.
- Current skill names, descriptions, triggers, outputs, dependencies, and lifecycle metadata from `skill-inventory`.
- Dependency and downstream-impact evidence from `skill-dependency-manager`.
- Current project documentation and Project Understanding evidence used to describe the skill catalog.

## Approved Tools and Resources

- Use read-only repository inspection while resolving the target and preparing the proposal.
- Use deterministic similarity ranking over canonical IDs, aliases, descriptions, triggers, and user-provided capability terms.
- Use mutating tools only after an accepted proposal includes `-Proceed` or `--proceed`, matched case-insensitively.

## Read and Write Boundaries

- Before approval, write no skill, configuration, documentation, help, test, or report artifacts.
- After approval, modify only the exact files listed in the accepted proposal.
- Never rewrite accepted event-stream records or silently update a second skill discovered during implementation.

## Procedure

1. Route every request to modify, revise, enhance, fix, or update an existing skill here, regardless of whether the user supplies an exact skill ID.
2. Normalize an entered name case-insensitively and compare it with canonical skill IDs, known aliases, descriptions, triggers, dependencies, and capability terms in the current inventory.
3. When one exact canonical ID is not established, rank the plausible matches, explain briefly why each may fit, offer the candidate IDs as options, and wait for the user to select one. Never mutate the closest match merely because it ranked first.
4. When no plausible match exists, report that no existing skill was identified and route a request for a new capability to `skill-create`; do not create a skill from this workflow.
5. After one canonical target is confirmed, inspect its complete contract, owned artifacts, tests, generated help behavior, direct dependencies, and downstream dependents.
6. Prepare a bounded update proposal that names the exact skill ID and every file to change, describes current and proposed behavior, enumerates additions, removals, compatibility effects, dependency-wiring decisions, documentation updates, tests, validation, risks, and rollback.
7. Present the proposal and require the user to enter `-Proceed` or `--proceed` if they agree and authorize the listed changes. A prior general request, an inferred preference, silence, or a different token does not authorize mutation.
8. If the requested scope changes after approval, stop, replace the proposal, and require a new proceed token for the revised file and behavior boundary.
9. Apply only the approved update while preserving all unrelated repository and user changes.
10. Re-run dependency analysis to confirm every required incoming and outgoing integration is intentionally wired, every declared dependency resolves, and the graph remains acyclic and dependency-closed.
11. Verify deterministic help for the updated skill is regenerated as `.github/prompts/<skill-name>-help.prompt.md` in generated and adopted projects and reflects the current contract.
12. Refresh the authoritative skill inventory, Project Understanding, `docs/PROJECT-GUIDE.md`, `reports/project-guide.json`, and human-facing skill catalog or count references from verified repository evidence.
13. Run focused tests for the changed behavior, then the repository's complete validation gate, and report changed files, validation evidence, limitations, and any blocked follow-up.

## Validation

- Exactly one canonical existing skill ID was confirmed before proposal generation.
- No mutation occurred before a matching `-Proceed` or `--proceed` token approved the current proposal.
- The resulting contract retains all required sections, valid metadata, distinct triggers, and non-conflicting output ownership.
- Dependency wiring reflects the updated capability, resolves to existing skill IDs, remains acyclic, and preserves profile closure.
- Generated or adopted projects receive one current help prompt for every governed skill, including the updated skill.
- Inventory, authoritative project documentation, human-facing skill details, and skill counts agree with the discovered repository state.
- Focused tests and the full repository validation gate pass after the update.

## Outputs

- The approved existing skill package and directly associated tests or schemas.
- Regenerated per-skill help in generated and adopted projects.
- Refreshed skill inventory, Project Understanding, project guide, and approved human-facing catalog documentation.

## Failure Behavior

- Stop and offer candidates when the target skill is ambiguous; never guess and mutate.
- Stop without changes when approval is missing, malformed, stale, or does not cover the current proposal.
- Fail closed on ownership collisions, unresolved dependencies, cycles, profile gaps, stale documentation evidence, or validation failures.
- Preserve the last valid skill and report exact recovery steps when an approved update cannot be completed.

## Approval Gates

Require `-Proceed` or `--proceed` after the exact target and complete update proposal are presented. Require separate approval for publishing, installing outside the local repository, destructive migration, external mutation, commit, or push.

## Composition and Dependencies

- skill-inventory
- skill-dependency-manager
- project-understanding
- documentation-builder

## Examples

- Resolve “the Azure cleanup skill” to `azure-cleanup`, present the exact contract and test changes, and wait for `--proceed` before editing.
- Offer `project-status`, `project-handoff`, and `workflow-telemetry` when “update the reporting skill” is ambiguous, then continue only after one ID is selected.
- Reject an unapproved dependency expansion discovered during implementation and issue a revised proposal instead of silently widening scope.

## Related commands

- Run the skill with /skill-update.
- Open this help with /skill-update-help.
- Inspect the full contract with @.github/skills/skill-update/SKILL.md.
