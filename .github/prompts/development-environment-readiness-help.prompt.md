---
mode: agent
description: Help for the development-environment-readiness skill.
---

# development-environment-readiness Help

Assess, plan, configure, and validate a project's pre-coding development environment, including access, editor, source control, runtimes, authentication, isolation, debugging, testing, automation, and security gates. Use when onboarding a repository or preparing a new project; do not use for feature implementation.

Explain this contract as help only. Do not execute its procedures or treat examples as action approval.
Read the complete contract at .github/skills/development-environment-readiness/SKILL.md before using this skill.

## Purpose

Establish an evidence-based, reproducible, and secure development environment before implementation begins, without silently changing the repository, user profile, machine, or remote services.

## Preconditions

- Read repository instructions, setup documentation, manifests, lockfiles, tool-version files, and applicable organizational policy.
- Identify the target operating system, architecture, repository, user role, and supported development scenarios.
- Separate read-only assessment from mutating setup and obtain approval before crossing that boundary.

## Inputs

- Repository URL or root, access requirements, supported platforms, and required developer roles.
- Required editors, extensions, source-control tools, runtimes, package managers, containers, cloud CLIs, and service integrations.
- Existing workspace configuration, development-container definition, build/test/debug commands, CI workflows, and security controls.
- Organization policies for authentication, least privilege, secrets, software sources, licenses, and endpoint management.

## Approved Tools and Resources

- Use read-only version, configuration, extension, authentication-status, and repository inspection first.
- Use official vendor documentation and approved package sources for installation and configuration requirements.
- Use repository-local environments, lockfiles, tool manifests, and development containers where they improve reproducibility.
- Authentication secrets, tokens, passwords, passphrases, and device codes must be entered by the user through the tool's secure interactive flow and must never be copied into reports or commands sent through an agent.

## Read and Write Boundaries

- During assessment, write only the owned reports listed below.
- After approval, write only reviewed project configuration and execute only approved user-, machine-, or remote-scoped actions.
- Preserve existing workspace settings, tasks, launch configurations, extension recommendations, and unrelated user changes.
- Never modify global Git identity, system policy, credential stores, branch protection, cloud resources, or organization settings silently.

## Procedure

1. Record project scope, platform, architecture, role, required services, and authoritative setup sources.
2. Verify repository and service access using least-privilege status checks without exposing credential material.
3. Inventory VS Code, Git, GitHub CLI, required cloud or DevOps CLIs, language runtimes, package managers, PowerShell, containers, and project-specific version constraints.
4. Inspect Git identity and repository configuration, remotes, default branch expectations, ignore rules, contribution rules, and source-control protections.
5. Inspect workspace settings, extension recommendations, tasks, launch configurations, Copilot instructions, development containers, and project folder conventions without replacing existing files.
6. Verify isolated project environments, dependency restoration, approved package sources, lockfiles, and secret-handling configuration.
7. Discover documented build, lint, format, static-analysis, test, debug, security, and automation commands and map each to a deterministic validation.
8. Classify every requirement as `ready`, `missing`, `misconfigured`, `unverified`, or `not-applicable`; attach redacted evidence and a minimal remediation.
9. Produce an ordered action plan with repository, user, machine, and remote scopes, explicit dependencies, rollback instructions, and approval requirements.
10. After approval, apply only selected actions, one scope at a time, and stop on unexpected prompts, untrusted sources, elevated privileges, policy conflicts, or unrelated diffs.
11. Rerun readiness checks, build, tests, linting, static analysis, debugger smoke tests where automatable, and relevant security checks.
12. Validate `reports/development-environment-readiness.json` against `schemas/development-environment-readiness.schema.json` and derive the Markdown report from the same result.

## Validation

- Every required category has a status, current redacted evidence, and a remediation or explicit reason it is not applicable.
- Installed versions satisfy repository constraints and come from approved sources.
- Authentication is verified only by account, tenant, subscription, host, or scope metadata safe to retain; no credential material is recorded.
- Repository, user, machine, and remote mutations are distinguishable and traceable to approval.
- Build, test, lint, debug, and security outcomes are based on current execution or explicitly marked unverified.
- The machine-readable report validates against its schema and the Markdown view preserves status, action ordering, approvals, and limitations.

## Outputs

- `reports/development-environment-readiness.json`
- `reports/development-environment-readiness.md`

## Failure Behavior

- Return `blocked` when required access, policy, trusted installation sources, runtime compatibility, or secure authentication is unavailable.
- Return `degraded` when optional capabilities are missing or checks cannot be automated, and identify the manual validation owner.
- Stop before elevation, destructive replacement, external mutation, or interactive secret entry that cannot be completed directly by the user.
- Never report readiness from tool presence alone when required build, test, or authentication validation has not run.

## Approval Gates

Require explicit approval before repository writes, extension installation, package restoration, user-profile changes, machine-wide installation, elevation, authentication, remote configuration, branch-protection changes, CI/CD creation, or cloud mutation. The user must enter all secrets directly into trusted interactive prompts.

## Composition and Dependencies

- policy-engine
- workflow-state-manager

## Examples

- Assess a new Node.js repository, identify a missing supported Node release and absent test task, approve repository-local setup, and verify install, lint, test, debug, and security commands.
- Produce a blocked report when Azure access requires an unauthorized tenant or a required package source cannot be verified.

## Related commands

- Run the skill with /development-environment-readiness.
- Open this help with /development-environment-readiness-help.
- Inspect the full contract with @.github/skills/development-environment-readiness/SKILL.md.
