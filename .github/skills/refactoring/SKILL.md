---
name: refactoring
description: Perform behavior-preserving code refactoring through characterization tests, small reversible steps, focused review, and measurable validation. Use when code structure needs improvement without changing its public behavior; use systematic-debugging instead when the primary goal is defect diagnosis.
lifecycle: draft
confidence: low
---

# refactoring

## Purpose

Improve code clarity, cohesion, duplication, and maintainability while preserving supported behavior and producing evidence that the refactor is safe.

## Preconditions

- Read repository instructions, architecture, and test conventions.
- Define the behavior boundary and measurable structural objective.
- Establish a clean characterization baseline for affected behavior.

## Inputs

- Refactoring objective, affected symbols/files, and explicit exclusions.
- Current implementation, callers, tests, performance constraints, and compatibility requirements.
- An implementation plan from `workflow-planner` when the change spans multiple steps.

## Approved Tools and Resources

- Use repository-native symbol, test, formatter, linter, and static-analysis tools.
- Prefer automated rename/extract operations when semantics are preserved.
- Do not add dependencies solely to perform a refactor.

## Read and Write Boundaries

- Modify only the approved code, tests, and directly related documentation.
- Preserve public APIs unless an API change is separately approved.
- Never weaken assertions, controls, or error handling to make validation pass.

## Procedure

1. Record baseline behavior, tests, complexity indicators, and affected callers.
2. Add characterization coverage where behavior is not already protected.
3. Divide the refactor into small reversible transformations.
4. Apply one coherent transformation at a time using existing abstractions and conventions.
5. Run focused validation after each transformation and inspect failures before continuing.
6. Remove obsolete duplication and update directly related documentation.
7. Run neighboring and full required validation, then request bounded change review.
8. Report behavior evidence, structural improvement, residual risk, and rollback units.

## Validation

- Supported behavior and public contracts remain unchanged.
- Characterization, focused, and neighboring tests pass from current execution.
- Complexity or duplication improves measurably without speculative abstraction.
- The final diff contains no unrelated formatting or cleanup.

## Outputs

- `reports/refactoring-plan.json`
- `reports/refactoring-result.md`

## Failure Behavior

- Stop when behavior cannot be characterized or a transformation changes public semantics.
- Preserve the last validated state and report the smallest failed transformation.
- Route newly discovered defects to `systematic-debugging`.

## Approval Gates

Require approval before public API changes, dependency changes, broad mechanical rewrites, destructive migration, commit, or push.

## Composition and Dependencies

- clarify-the-ask
- workflow-planner
- regression-test-development
- change-review

## Examples

- Split a long parser into cohesive private helpers while preserving its public API and regression suite.
- Consolidate duplicated validation logic behind an existing shared owner with characterization evidence.
