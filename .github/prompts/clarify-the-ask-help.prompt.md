---
mode: agent
description: Help for the clarify-the-ask skill.
---

# clarify-the-ask Help

Determine whether a development request is sufficiently defined, inspect available project evidence, surface conflicts and assumptions, and ask only material clarifying questions before planning or implementation. Use for ambiguous, conflicting, high-impact, or underspecified requests; skip questions when repository evidence and safe defaults are sufficient.

Explain this contract as help only. Do not execute its procedures or treat examples as action approval.
Read the complete contract at .github/skills/clarify-the-ask/SKILL.md before using this skill.

## Purpose

Turn a user request into a concise, evidence-grounded understanding with resolved requirements, explicit assumptions, and a deterministic decision to proceed or wait for clarification.

## Preconditions

- Read repository instructions and `config/skills-orchestrator.json` when present.
- Preserve the user's stated objective and constraints without expanding scope.
- Use read-only inspection before asking the user for information already available in the project.

## Inputs

- Original request, conversation context, stated constraints, deliverables, and success criteria.
- Repository instructions, architecture, configuration, nearby implementation, tests, and authoritative project artifacts.
- The resolved `clarification` configuration containing `enabled`, `maxQuestionsPerRound`, `blockOnMaterialAmbiguity`, `askEveryPrompt`, `questionsPerPrompt`, and `confirmPlanBeforeExecution`.

## Approved Tools and Resources

- Use read-only repository search, file inspection, diagnostics, history, and authoritative documentation to resolve factual questions first.
- Use the agent platform's available human-input mechanism; do not require a specific extension or vendor tool.
- Ask questions in ordinary chat when no structured input tool is available.

## Read and Write Boundaries

- Do not modify source, configuration, external systems, or workflow state while clarification is unresolved.
- Write only the owned reports listed below after sufficient information is available or the request is blocked.
- Never request passwords, tokens, keys, passphrases, personal data, or other secrets through agent-visible input.

## Procedure

1. Restate the requested outcome, explicit constraints, deliverables, and success criteria in concise terms.
2. Inspect project evidence needed to distinguish known facts from missing inputs; do not ask the user to repeat discoverable information.
3. Identify contradictions, material ambiguity, risky assumptions, and choices that would substantially change behavior, architecture, security, cost, compatibility, or rework.
4. Apply safe, reversible repository conventions as defaults for low-risk omissions and record each assumption.
5. If clarification is disabled, proceed only when no material ambiguity remains; otherwise return `blocked` when configured to block on material ambiguity.
6. When `askEveryPrompt` is true, run this procedure for every new user prompt, including short follow-ups in an established session, and always ask exactly `questionsPerPrompt` questions.
7. When `askEveryPrompt` is false, ask at most `maxQuestionsPerRound` targeted questions, ordered by decision impact. Ask fewer questions when sufficient and include a recommended default when one is defensible.
8. Direct every question at intent, scope, constraints, priorities, or acceptance criteria that repository evidence cannot settle; never spend a required question on a fact already present in the project.
9. Wait for answers when unresolved ambiguity is material and `blockOnMaterialAmbiguity` is true. Do not exhaust the numeric limit with unnecessary questions.
10. Re-evaluate answers against repository evidence and repeat another bounded round only when newly exposed material ambiguity remains.
11. When `confirmPlanBeforeExecution` is true, state the objective, the concrete steps, the files or systems that will be touched, and the risks or irreversible actions, then wait for explicit user confirmation before any downstream skill executes.
12. Produce a concise understanding statement separating confirmed requirements, project facts, accepted assumptions, resolved conflicts, open questions, and the proceed-or-block decision.
13. Validate the machine-readable result against `schemas/clarification-result.schema.json` and derive the Markdown view from the same record.

## Validation

- Every question maps to a specific material decision and was not already answered by available evidence.
- Questions asked in each round do not exceed `maxQuestionsPerRound`; zero questions is valid only while `askEveryPrompt` is false.
- When `askEveryPrompt` is true, exactly `questionsPerPrompt` questions were asked for the current prompt.
- When `confirmPlanBeforeExecution` is true, the stated plan was presented and explicitly confirmed before any downstream execution.
- Defaults are explicit, low risk, reversible, and consistent with repository conventions.
- Material unresolved ambiguity produces `blocked` when configured; question limits never authorize unsafe guessing.
- The final understanding preserves the user's objective and is sufficient input for `workflow-planner`.

## Outputs

- `reports/clarification-result.json`
- `reports/clarification-result.md`

## Failure Behavior

- Return `blocked` with the exact unresolved decisions when required answers or evidence are unavailable.
- Surface conflicting requirements without choosing silently between them.
- Never proceed merely because the question limit was reached.
- Never treat the agent's own plan statement as the user's confirmation to proceed.

## Approval Gates

Clarification is read-only. Obtain normal workflow approval later for destructive, external, privileged, irreversible, or scope-expanding actions identified during clarification.

## Composition and Dependencies

- None

## Examples

- Ask the three configured questions for a new prompt, then restate the objective, steps, affected files, and risks and wait for explicit confirmation.
- Inspect an existing API and ask one question about backward compatibility while defaulting naming and formatting to repository conventions.
- Ask zero questions when `askEveryPrompt` is disabled and the request, nearby implementation, and tests already establish the required behavior.
- Block planning after three high-impact questions when authentication scope remains contradictory and the project requires ambiguity blocking.

## Related commands

- Run the skill with /clarify-the-ask.
- Open this help with /clarify-the-ask-help.
- Inspect the full contract with @.github/skills/clarify-the-ask/SKILL.md.
