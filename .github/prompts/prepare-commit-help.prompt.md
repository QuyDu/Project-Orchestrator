---
mode: agent
description: Help for the prepare-commit skill.
---

# prepare-commit Help

Prepare a minimal, validated change set and commit summary after bounded change review, without committing, pushing, deploying, or bypassing protections. Use when changes are ready for a pre-commit decision.

Explain this contract as help only. Do not execute its procedures or treat examples as action approval.
Read the complete contract at .github/skills/prepare-commit/SKILL.md before using this skill.

## Purpose

Prepare a minimal, validated change set and commit summary without pushing, deploying, or bypassing repository protections.

## Preconditions

- Read repository instructions and applicable configuration.
- Inspect authoritative existing artifacts before replacing derived views.
- Verify that this skill owns the requested decision or output.

## Inputs

- Requested change objective and scope boundaries.
- Working tree status, staged/unstaged diff, and relevant validation requirements.
- `reports/change-review.json` from `change-review` for the selected change boundary.
- Repository protection rules and prohibited actions for the current task.

## Approved Tools and Resources

- Use read-only repository inspection by default.
- Use deterministic scripts and schema validators when provided.
- Use mutating tools only within the approved workflow boundary.

## Read and Write Boundaries

- Write only the owned reports listed below.
- Never rewrite accepted event-stream records.
- Do not silently mutate source, infrastructure, external systems, or unrelated artifacts.

## Procedure

1. Inspect repository status and isolate only files relevant to the requested change.
2. Remove accidental scope creep by excluding unrelated modifications from the proposed commit set.
3. Run required validation checks for the touched scope and capture failing checks with evidence.
4. Prepare a commit message summary that explains intent, impact, and validation results.
5. Present a final pre-commit checklist including blocked items that prevent safe commit creation.

## Validation

- Proposed change set is minimal and maps directly to the requested objective.
- Validation outcomes are current for the selected files and are not inferred.
- Commit summary reflects actual diffs and does not claim push/deploy execution.
- Repository protection constraints are preserved.

## Outputs

- No dedicated report

## Failure Behavior

- Fail closed when touched-file scope cannot be safely isolated.
- Return blocked status when required validation checks are unavailable or failing.
- Never imply commit readiness when protections or checks are unresolved.

## Approval Gates

Committing, pushing, opening a pull request, or deploying follows repository and user approval requirements.

## Composition and Dependencies

- change-review

## Examples

- Prepare a focused commit proposal for a contract-only change after passing required checks.
- Produce a blocked pre-commit report when unrelated risky changes are mixed into the diff.

## Related commands

- Run the skill with /prepare-commit.
- Open this help with /prepare-commit-help.
- Inspect the full contract with @.github/skills/prepare-commit/SKILL.md.
