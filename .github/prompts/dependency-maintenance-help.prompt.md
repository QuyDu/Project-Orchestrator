---
mode: agent
description: Help for the dependency-maintenance skill.
---

# dependency-maintenance Help

Assess and update application package dependencies with provenance, advisory, compatibility, lockfile, and test evidence. Use for package upgrades or vulnerability remediation; do not use for Agent Skill graph dependencies or schema migrations.

Explain this contract as help only. Do not execute its procedures or treat examples as action approval.
Read the complete contract at .github/skills/dependency-maintenance/SKILL.md before using this skill.

## Purpose

Upgrade application dependencies through a minimal, provenance-aware change with compatibility analysis, reproducible lockfiles, focused validation, and rollback guidance.

## Preconditions

- Read repository instructions, package-manager configuration, and applicable policy.
- Identify the package ecosystem, target dependency, requested version range, and reason for change.
- Preserve unrelated manifest and lockfile changes.

## Inputs

- Package manifests, lockfiles, registry configuration, and supported runtime matrix.
- Current and target versions, authoritative release notes, advisories, and migration guidance.
- Existing tests, build commands, dependency policies, and software-bill-of-material evidence.

## Approved Tools and Resources

- Use the repository's locked package manager and authoritative registries or advisory databases.
- Inspect package provenance, signatures or integrity metadata, lifecycle scripts, transitive changes, and maintainer guidance.
- Use isolated or non-production environments for installs and validation.

## Read and Write Boundaries

- Write only relevant manifests, lockfiles, compatibility changes, tests, and owned reports.
- Do not change registry credentials, trust settings, unrelated packages, or update policies silently.
- Never execute unreviewed install scripts with elevated privileges.

## Procedure

1. Record the current dependency graph, runtime constraints, requested outcome, and clean rollback point.
2. Verify target package identity, source, integrity, release notes, advisories, license impact, and required migration steps.
3. Predict direct and transitive changes using package-manager dry-run or lockfile evidence where supported.
4. Obtain approval for risky lifecycle scripts, major-version changes, new registries, license changes, or broad transitive churn.
5. Apply the smallest supported update with the repository's package manager and inspect manifest and lockfile diffs.
6. Add compatibility or regression coverage where behavior changes, then run focused tests, build, security, and required repository checks.
7. Record versions, provenance, advisories addressed, transitive changes, commands, outcomes, residual risks, and rollback instructions.

## Validation

- Manifest and lockfile agree and reproduce from the approved registry configuration.
- The target package and unexpected transitive additions have provenance and integrity evidence.
- Required runtime, test, build, and security checks pass on the supported scope.
- The report distinguishes advisories resolved, still applicable, disputed, or newly introduced.

## Outputs

- `reports/dependency-maintenance.json`
- `reports/dependency-maintenance.md`

## Failure Behavior

- Restore or preserve the prior manifest and lockfile when update or validation fails.
- Return blocked status for unavailable provenance, incompatible runtimes, unresolved advisories, or unauthorized scripts.
- Never weaken security controls or pin to an unverified source to force an update.

## Approval Gates

Require explicit approval before major upgrades, new package sources, lifecycle scripts with material effects, license changes, privileged installs, or remote publication.

## Composition and Dependencies

- policy-engine
- regression-test-development
- workflow-state-manager

## Examples

- Patch a vulnerable direct dependency, verify registry integrity and lockfile changes, run focused and repository checks, and record the advisory resolution.
- Block a major upgrade whose migration requires an unapproved runtime change and broad transitive replacement.

## Related commands

- Run the skill with /dependency-maintenance.
- Open this help with /dependency-maintenance-help.
- Inspect the full contract with @.github/skills/dependency-maintenance/SKILL.md.
