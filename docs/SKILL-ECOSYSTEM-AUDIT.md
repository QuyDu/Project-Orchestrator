# Skill Ecosystem Audit

## Scope

This assessment reviews the repository's skill contracts, dependency graph, profiles, artifact ownership, runtime validation, and direct user value. It also compares the catalog with current Agent Skills guidance and public developer-skill ecosystems.

Assessment date: 2026-08-04.

## Evidence Summary

- The original 23-skill graph was acyclic and all declared report producers were unique.
- Structural conformance did not establish execution quality: every skill remains `draft` with `low` confidence until capability-specific fixtures or runtime evidence support promotion.
- The original `core`, `durable`, and `distributed` profiles omitted transitive dependencies. The contract suite now verifies dependency closure for every profile.
- The catalog was strongest in governance, workflow state, framework lifecycle, audit, and continuity. It lacked direct owners for failure diagnosis, regression-test creation, bounded change review, hosted CI triage, and application package maintenance.
- `prepare-commit` was disconnected. It now consumes the bounded `change-review` result.
- The CLI validates inventory, dependencies, profiles, ownership, and selected handoffs. Its `plan` command now deterministically matches intent to installed skill descriptions, expands declared prerequisites, and records a governed handoff; it plans but does not dispatch skills.

## Mechanism Boundary

Use an Agent Skill for a repeatable, task-specific procedure with explicit inputs, evidence, validation, and failure behavior.

- Put always-on repository facts, build commands, and coding conventions in repository or path-specific instructions.
- Put persistent personas and restricted tool sets in custom agents.
- Put external services, remote data, and executable integrations behind MCP tools with least privilege.
- Keep skill descriptions specific enough for progressive-disclosure activation and state when a neighboring skill should be used instead.

This boundary follows the Agent Skills specification and current GitHub Copilot customization model.

## Added Developer Workflows

| Skill | User outcome | Boundary | Risk controls |
| --- | --- | --- | --- |
| `clarify-the-ask` | Evidence-grounded requirements and a deterministic proceed-or-block decision before planning | Material request ambiguity, not project planning or implementation | Repository-first discovery, bounded questions, no secrets, no vendor-specific input dependency, blocking on unresolved material ambiguity |
| `development-environment-readiness` | Reproducible, validated pre-coding environment and approved remediation plan | Onboarding and project preparation, not feature implementation | Read-only assessment first, mutation scopes, secure interactive authentication, approval and rollback |
| `systematic-debugging` | Reproduced failure, confirmed root cause, and focused verified repair | Observed failures, not broad audits | One-hypothesis checks, secret redaction, approval for production diagnostics |
| `regression-test-development` | Durable red-green evidence for a defect or requested behavior | Test creation, not suite-only execution | Existing framework, deterministic assertions, no weakened tests |
| `change-review` | Severity-ranked findings for an exact diff | Base/head or working-tree scope, not repository-wide assessment | Read-only review, evidence requirement, residual-risk reporting |
| `ci-failure-triage` | First-cause diagnosis and locally verified CI repair | Hosted run or pull-request checks, not local-only failures | Least-privilege reads, untrusted-log handling, approval for reruns |
| `dependency-maintenance` | Provenance-aware package update with lockfile and test evidence | Application packages, not skill dependencies or schema migrations | Integrity checks, lifecycle-script gates, isolated installs, rollback |

## Deliberate Exclusions

- The upstream `first-ask` skill is not installed separately because it overlaps `clarify-the-ask`, requires the optional Joyride extension, and lacks a bounded portable output contract.
- Generic planning and epic breakdown duplicate `workflow-planner`.
- Codebase tours and context maps overlap project handoff, memory, and knowledge capture; stable facts belong in instructions.
- Conventional commits and branch naming belong in instructions and `prepare-commit`.
- Agent teams and personas duplicate the orchestrator, scheduler, coordinator, policy, and state skills.
- Framework coding-style catalogs should be path-specific instructions unless they define an evidence-producing procedure.
- Browser acceptance testing is useful but should be added only with a web-focused profile and capability fixture.
- Property and mutation testing are valuable specialized extensions, but lower-frequency than the five selected workflows.

## Remaining Priorities

1. Add policy decisions, state transitions, and output validation to intent-expanded plans before lifecycle promotion.
2. Add schemas and fixtures for developer-workflow machine-readable reports before lifecycle promotion.
3. Extend artifact ownership with consumers, schemas, versions, optionality, and freshness rules.
4. Clarify whether profiles govern installation, activation, or conformance; adoption currently installs the full catalog.
5. Add deterministic activation conflict tests for neighboring skills.

## Sources

- Agent Skills specification: https://agentskills.io/specification
- Agent Skills overview: https://agentskills.io/what-are-skills
- GitHub Copilot repository instructions: https://docs.github.com/en/copilot/customizing-copilot/adding-repository-custom-instructions-for-github-copilot
- GitHub Copilot MCP guidance: https://docs.github.com/en/copilot/customizing-copilot/extending-copilot-chat-with-mcp
- Awesome GitHub Copilot: https://github.com/github/awesome-copilot
- Awesome GitHub Copilot `first-ask`: https://github.com/github/awesome-copilot/tree/main/skills/first-ask
- Anthropic skills examples: https://github.com/anthropics/skills
- OpenAI skills catalog: https://github.com/openai/skills (deprecated; retained only as historical workflow evidence)

Public examples inform capability selection, not trust. Third-party skills require independent review and local validation before adoption.