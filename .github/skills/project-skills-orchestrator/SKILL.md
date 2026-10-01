---
name: project-skills-orchestrator
description: Coordinate project workflows by discovering capabilities, routing intent, enforcing ownership boundaries, and composing approved skills. Use to route any request that spans more than one skill or whose owner is unclear; do not use when a single owning skill clearly applies.
lifecycle: tested
confidence: medium
---

# project-skills-orchestrator

## Purpose

Coordinate project workflows by discovering capabilities, routing intent, enforcing ownership boundaries, and composing approved skills.

## Preconditions

- Read repository instructions and applicable configuration.
- Inspect authoritative existing artifacts before replacing derived views.
- Verify that this skill owns the requested decision or output.

## Inputs

- User intent, constraints, risk boundaries, and required completion criteria.
- Clarification result from `clarify-the-ask` when the request is ambiguous, conflicting, or high impact.
- Skill and ownership catalog from `skill-inventory`.
- Workflow plan from `workflow-planner`, current execution state from `workflow-state-manager`, and policy decision evidence from `policy-engine`.
- Explicit native Copilot Studio runtime/operation intent and the project-local `.github/instructions/copilot-studio.instructions.md` when that destination is selected. A generic Copilot term or a distribution label alone does not establish native implementation.

## Approved Tools and Resources

- Use read-only repository inspection by default.
- Use deterministic scripts and schema validators when provided.
- Use mutating tools only within the approved workflow boundary.

## Read and Write Boundaries

- Write only the owned reports listed below.
- Never rewrite accepted event-stream records.
- Do not silently mutate source, infrastructure, external systems, or unrelated artifacts.

## Procedure

1. Route every new user prompt through `clarify-the-ask` first; when the project configures `askEveryPrompt`, no step is dispatched until the required questions are answered and the stated plan is explicitly confirmed.
2. Resolve clarified intent to candidate skills using the inventory and ownership map.
   For native Copilot Studio creation, update, import, evaluation, troubleshooting or publication, explicitly load and validate `.github/instructions/copilot-studio.instructions.md` before requirements, scaffolding, blueprint validation or deployment handoff, even when no native files exist. Resolve ambiguous destinations once and reuse that choice; preserve each distinct requested operation. The runtime records the guide path and SHA-256 in its routing step before it writes a native workflow plan.
3. Route any request to create, add, define, author, build, or make a skill to `skill-create` before any other skill-authoring step, regardless of the user's wording. `skill-create` must compare the requested capability with the inventory and identify reusable existing skills before authoring.
4. Route any request to modify, revise, enhance, fix, or update an existing skill to `skill-update`. When the user did not provide an exact canonical ID, require candidate identification and user selection before an update proposal is prepared.
   Native project setup uses the existing `project-setup` owner and explicit `--stack copilot-studio`; native creation/update preparation uses `agent-builder`; approved remote operations and evidence use `agent-deployment`. Do not install a hosted backend, require an Azure hosting subscription, or grant auth/publication authority through local routing.
5. Load authoritative workflow plan and current execution state to determine next executable step.
6. Enforce policy decisions before dispatching any step that is blocked, denied, or approval-gated.
7. Route each eligible step to exactly one owning skill and prevent overlapping ownership claims.
8. Track step outcomes, blocked states, and required approvals to maintain deterministic progression.
9. Emit completion artifacts summarizing executed, skipped, blocked, and pending steps with rationale.

## Validation

- Clarification completed for the current prompt before any step was dispatched.
- Every routed step maps to one owning skill and one policy outcome.
- Every skill-creation request is routed through `skill-create` and receives duplicate/reuse analysis before authoring.
- Every existing-skill update is routed through `skill-update`, resolves one exact target, presents its complete update boundary, and waits for `-Proceed` or `--proceed` before mutation.
- Orchestration status aligns with current execution state and workflow plan ordering.
- Blocked or approval-wait states are explicit and not reported as complete.
- Completion artifacts are internally consistent and traceable to upstream evidence.
- Native intent is never satisfied by a local Markdown agent alone. Missing guide, runtime choice, operation, capability or evidence remains a specific blocked/pending condition. Ordinary app, GitHub Copilot, SDK, Foundry and Toolkit routes remain separate.

## Outputs

- `reports/workflow-completion.json`
- `reports/workflow-completion.md`

## Failure Behavior

- Fail closed when plan/state/policy artifacts are missing or contradictory.
- Preserve last valid orchestration checkpoint and return explicit resume conditions.
- Never dispatch a step that lacks authoritative ownership or policy allowance.

## Approval Gates

Require explicit approval before dispatching any destructive, external, privileged, irreversible, or scope-expanding workflow step.

## Composition and Dependencies

- clarify-the-ask
- workflow-planner
- skill-inventory
- policy-engine
- workflow-state-manager
- skill-update

## Examples

- Route a validated remediation workflow through review, planning, and gated execution steps.
- Halt orchestration when policy denies a requested operation and publish the blocked path.
