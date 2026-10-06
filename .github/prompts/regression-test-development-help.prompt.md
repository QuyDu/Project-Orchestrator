---
mode: agent
description: Help for the regression-test-development skill.
---

# regression-test-development Help

Create or strengthen focused automated tests that reproduce a bug or specify a requested behavior, then capture red-green validation evidence. Use when a change needs durable regression coverage; do not use only to execute an existing test suite.

Explain this contract as help only. Do not execute its procedures or treat examples as action approval.
Read the complete contract at .github/skills/regression-test-development/SKILL.md before using this skill.

## Purpose

Convert a confirmed behavior requirement or defect into focused, maintainable automated regression coverage with current execution evidence.

## Preconditions

- Read repository instructions, test conventions, and applicable configuration.
- Identify the behavior boundary, expected result, and supported test framework.
- Preserve unrelated tests and production behavior outside the requested scope.

## Inputs

- Expected behavior, defect reproduction, or acceptance criterion.
- Relevant production path, neighboring tests, fixtures, and test commands.
- Debugging evidence from `systematic-debugging` when the input is a defect.
- Optional audit mode with a bounded source surface, existing coverage evidence, risk model, and explicit exclusions.

## Approved Tools and Resources

- Use the repository's existing test framework, fixtures, fakes, and deterministic validation commands.
- Prefer behavior-level assertions over implementation-detail assertions.
- Use external services only through approved test doubles or isolated test environments.

## Read and Write Boundaries

- Write only tests, fixtures, and minimal production changes required by the requested behavior.
- Write the owned reports listed below.
- Never weaken unrelated assertions, skip failing tests, or replace deterministic checks with snapshots without justification.

## Procedure

1. Inventory the bounded behavior surface, existing tests, untested branches and failure paths, and risk-critical inputs before selecting work.
2. In audit mode, publish a risk-ranked test-gap list with evidence and stop before mutation unless test creation is approved.
3. Locate the nearest existing test boundary and state the selected behavior in observable terms.
4. Add the smallest test that fails for the missing or defective behavior for the expected reason.
5. Run the focused test and capture the failing command, assertion, and outcome.
6. Apply or coordinate the minimum production change needed to satisfy the behavior.
7. Rerun the focused test, then the narrowest relevant neighboring suite.
8. Check determinism, isolation, cleanup, boundary cases, and whether the test would fail if the defect returned.
9. Record changed files, red-green evidence, residual gaps, and the exact validation commands.

## Validation

- Red evidence predates the production repair unless the behavior already exists and the task is coverage-only.
- Green evidence comes from current execution of the focused and relevant neighboring tests.
- Assertions verify externally meaningful behavior and do not rely on timing or uncontrolled external state.
- Skips, retries, broad snapshots, and fixture changes are justified explicitly.
- Test-gap findings identify the uncovered behavior, concrete risk, nearest test boundary, and recommended assertion without equating line coverage with correctness.

## Outputs

- `reports/regression-test-result.json`
- `reports/regression-test-result.md`

## Failure Behavior

- Return blocked status when no supported test boundary or executable environment is available.
- Preserve a correctly failing test when implementation is separately blocked, and label the repository state clearly.
- Never report coverage from tests that were not executed.

## Approval Gates

Require explicit approval before changing public behavior, test infrastructure, external services, or destructive fixtures.

## Composition and Dependencies

- policy-engine
- workflow-state-manager

## Examples

- Add a focused test that reproduces a parser regression, demonstrate the failure, repair the parser, and capture passing neighboring tests.
- Add coverage for an already-correct boundary case and explicitly record that no red phase was expected.

## Related commands

- Run the skill with /regression-test-development.
- Open this help with /regression-test-development-help.
- Inspect the full contract with @.github/skills/regression-test-development/SKILL.md.
