---
mode: agent
description: Help for the systematic-debugging skill.
---

# systematic-debugging Help

Reproduce an observed software failure, gather diagnostic evidence, isolate its root cause, and verify the smallest safe fix. Use for failing behavior, crashes, incorrect output, flaky tests, or regressions; do not use for broad repository audits.

Explain this contract as help only. Do not execute its procedures or treat examples as action approval.
Read the complete contract at .github/skills/systematic-debugging/SKILL.md before using this skill.

## Purpose

Turn an observed software failure into a reproducible case, evidence-backed root cause, and focused verified repair.

## Preconditions

- Read repository instructions and applicable configuration.
- Obtain an observed failure, expected behavior, and the environment or revision where it occurs.
- Preserve unrelated working-tree changes and collect secrets only through approved secure channels.

## Inputs

- Failure symptoms, error output, reproduction steps, and expected behavior.
- Relevant source revision, environment details, logs, tests, and recent changes.
- Repository build, test, lint, and diagnostic commands.

## Approved Tools and Resources

- Use repository search, diagnostics, tests, debuggers, and local instrumentation appropriate to the failing path.
- Prefer deterministic local reproduction before external research or remote mutation.
- Redact credentials, tokens, personal data, and unrelated sensitive log content from reports.

## Read and Write Boundaries

- Write only the smallest source, test, or temporary diagnostic changes needed to discriminate between root-cause hypotheses.
- Write the owned reports listed below and remove temporary instrumentation before completion.
- Never rewrite accepted event-stream records or unrelated user changes.

## Procedure

1. Record expected and actual behavior, environment, revision, and the narrowest known reproduction.
2. Reproduce the failure with a focused command or test; if reproduction is unavailable, mark conclusions as hypotheses.
3. Trace the nearest code path that directly controls the failure and state one falsifiable root-cause hypothesis.
4. Run the cheapest discriminating check, changing one variable at a time and preserving diagnostic evidence.
5. Add or identify a regression check that fails for the confirmed cause before applying the production repair.
6. Apply the smallest repair at the controlling boundary and rerun the focused check plus relevant neighboring validation.
7. Remove diagnostic probes and record the cause, changed files, commands, outcomes, limitations, and rollback route.

## Validation

- The report distinguishes observations, hypotheses, and confirmed conclusions.
- A focused check demonstrates the failure before repair and success afterward, or the report is explicitly blocked.
- The repair addresses the confirmed controlling path without unrelated refactoring.
- Sensitive diagnostic data is excluded or redacted.

## Outputs

- `reports/debugging-result.json`
- `reports/debugging-result.md`

## Failure Behavior

- Return blocked status when the failure cannot be reproduced or required diagnostics are unavailable.
- Preserve the original failure evidence when a proposed cause is falsified and test the next local hypothesis.
- Never claim a root cause or successful fix from correlation alone.

## Approval Gates

Require explicit approval before destructive diagnostics, production access, external mutation, privileged actions, or sending sensitive evidence to remote services.

## Composition and Dependencies

- policy-engine
- workflow-state-manager

## Examples

- Reproduce a failing API test, isolate an incorrect cache key, add a regression test, and verify the focused repair.
- Return a blocked report when an intermittent production failure cannot be reproduced and required telemetry is unavailable.

## Related commands

- Run the skill with /systematic-debugging.
- Open this help with /systematic-debugging-help.
- Inspect the full contract with @.github/skills/systematic-debugging/SKILL.md.
