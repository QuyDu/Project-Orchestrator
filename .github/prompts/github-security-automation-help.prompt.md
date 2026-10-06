---
mode: agent
description: Help for the github-security-automation skill.
---

# github-security-automation Help

Plan, create, and validate repository-local CodeQL and Dependabot configuration with least privilege, pinned actions, accurate ecosystem detection, and CI evidence. Use when GitHub security automation is missing or misconfigured; do not enable remote repository settings without separate approval.

Explain this contract as help only. Do not execute its procedures or treat examples as action approval.
Read the complete contract at .github/skills/github-security-automation/SKILL.md before using this skill.

## Purpose

Establish maintainable GitHub security automation configuration without silently enabling remote services or duplicating application-security review.

## Preconditions

- Read repository instructions, security policy, workflows, manifests, and lock files.
- Confirm repository visibility, supported ecosystems, default branch, and GitHub Actions policy.
- Review current security findings and dependency-maintenance evidence.

## Inputs

- Repository languages, package ecosystems, build commands, and generated-code boundaries.
- Existing CodeQL, Dependabot, workflow, and permissions configuration.
- Required schedules, branches, registries, and explicit exclusions.

## Approved Tools and Resources

- Use local file inspection, GitHub configuration schemas, and offline workflow validation.
- Use read-only GitHub metadata only when explicitly authorized.
- Never enable settings, create secrets, merge alerts, or mutate the remote repository.

## Read and Write Boundaries

- Write only owned reports and approved files under `.github/workflows/`, `.github/dependabot.yml`, or CodeQL configuration paths.
- Preserve unrelated workflows and repository settings.
- Never include credentials or unpinned third-party actions.

## Procedure

1. Detect supported languages, package ecosystems, build modes, and existing security automation.
2. Classify existing configuration as current, incomplete, conflicting, or absent.
3. Plan CodeQL languages, build strategy, triggers, permissions, query suites, and generated-code exclusions.
4. Plan Dependabot ecosystems, directories, schedules, grouping, limits, and registry references.
5. Produce a reviewed before/after configuration plan with remote-operation boundaries.
6. Apply only approved local configuration and validate syntax, permissions, action pinning, and build commands.
7. Report local readiness separately from remote enablement and first-run results.

## Validation

- Configured languages and ecosystems exist in the repository.
- Workflow permissions are least privilege and third-party actions are commit pinned.
- Dependabot directories and package managers are valid and non-duplicative.
- Local validation never claims alerts, scans, or updates ran remotely.

## Outputs

- `reports/github-security-automation-plan.json`
- `reports/github-security-automation-report.md`

## Failure Behavior

- Return blocked for unsupported ecosystems, ambiguous build modes, or missing registry ownership.
- Preserve existing configuration when the reviewed plan has drifted.
- Never weaken branch protections or security checks to obtain a successful run.

## Approval Gates

Require approval before local configuration changes and separate approval for remote enablement, secrets, repository settings, commits, or pushes.

## Composition and Dependencies

- security-review
- dependency-maintenance
- policy-engine
- regression-test-development

## Examples

- Add a pinned least-privilege CodeQL workflow for detected JavaScript and Python code.
- Review Dependabot coverage and propose one grouped weekly update policy per verified ecosystem.

## Related commands

- Run the skill with /github-security-automation.
- Open this help with /github-security-automation-help.
- Inspect the full contract with @.github/skills/github-security-automation/SKILL.md.
