---
mode: agent
description: Create or review the versioned project blueprint before implementation.
---

# Project Blueprint

Create or review `docs/PROJECT-BLUEPRINT.json` before application implementation begins.

## Required process

1. Read the repository instructions, project brief, current handoff, and `schemas/project-blueprint.schema.json`.
2. Resolve project purpose, project type, stack, runtime and delivery target first. When the destination is native Copilot Studio, load `.github/instructions/copilot-studio.instructions.md` before further requirements or scaffolding, and use the native project selector. Resolve an ambiguous Copilot destination once; a local agent distribution label is not a native implementation.
3. Ask only the material questions needed for data store, environment, testing, security, observability, compliance and acceptance criteria. Run `/azure-discovery` before selecting Azure services, models, or regions only when Azure is actually part of the approved architecture. A Studio/Power Platform-only project does not require an Azure hosting subscription.
4. Run `/architecture-review` for the proposed design and record unresolved tradeoffs as assumptions or ADRs.
5. Write the blueprint only after the user confirms the plan. Validate it against `schemas/project-blueprint.schema.json`.
6. Hand the validated blueprint to `/project-setup`, `/development-environment-readiness`, and `/workflow-planner` in that order.

## Safety boundaries

- This prompt designs and validates a project; it does not deploy resources or mutate production systems.
- Never place credentials, tokens, connection strings, or secret values in the blueprint.
- Use `AzureCloud` or `AzureUSGovernment` explicitly when Azure is selected.
- Native Studio projects use blueprint 1.1 with `project.type: copilot-studio`, `stack.runtime: native-copilot-studio`, and `delivery.target: power-platform`. Real cloud/environment/identity evidence belongs to the native handoff; a development label is not an environment ID. Existing project blueprints remain compatible.
- Preserve assumptions and open questions instead of inventing requirements.

## Completion evidence

- `docs/PROJECT-BLUEPRINT.json` exists and validates against the schema.
- `docs/PROJECT-BLUEPRINT.md` summarizes the confirmed decisions, assumptions, dependencies, and acceptance criteria.
- The next action and owning skill are recorded in the project handoff.