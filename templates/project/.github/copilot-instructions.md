# Project Instructions

These instructions are always in context. Keep them accurate; stale instructions are worse than none.

Sections wrapped in `pso:begin` / `pso:end` markers are managed by Project Orchestrator and are replaced on update. Edit freely outside those markers.

<!-- pso:begin id=clarification-protocol version=1 -->
## Engagement protocol (mandatory, highest precedence)

Apply this to every new user prompt, without exception, before any analysis, tool use, file change, or answer.

1. Run `clarify-the-ask`.
2. Ask one question round only: ask three questions for an ordinary request, and up to five only when the request is complex, confusing, high-impact, or potentially damaging to the current project.
3. Wait for the user's answers. Do not begin work while a question is unanswered.
4. After the answers arrive, do not ask any more clarification questions for this prompt. State the objective, concrete steps, files or systems touched, and risks, then continue.

- This runs once for every new prompt, including follow-ups later in the same session. Answers close clarification for that prompt; the next prompt starts a new round.
- Ground the three questions in repository evidence; ask about intent, scope, constraints, and acceptance criteria rather than facts the repository already answers.
- Never treat your own plan description as approval.
- Do not ask filler questions. Three is the normal round size; use four or five only when additional decisions are genuinely material. Unresolved material ambiguity still blocks.
- The only exception is an explicit instruction in the current prompt to skip clarification, including the exact `--proceed` or `--Proceed` token. Treat the token case-insensitively.
<!-- pso:end id=clarification-protocol -->

<!-- pso:begin id=orchestration-routing version=1 -->
## Orchestration

Use `.github/skills/project-skills-orchestrator/SKILL.md` for project orchestration. Audit existing project state, inventory available skills, plan before execution, preserve repository-owned skills, and stop at approval gates.
<!-- pso:end id=orchestration-routing -->

<!-- pso:begin id=native-studio-routing version=1 -->
## Native Copilot Studio routing

- For native Copilot Studio creation, configuration, troubleshooting, evaluation, import, publication, or delivery, load `.github/instructions/copilot-studio.instructions.md` before requirements, scaffolding, blueprint validation, or handoff.
- Use the existing orchestrator, agent-builder and agent-deployment owners. A local agent definition or distribution label is not a native runtime or proof of completed features.
- Resolve an ambiguous Copilot destination once. Do not route ordinary apps, GitHub Copilot agents/SDK apps, Foundry agents or Agents Toolkit projects through the native Studio workflow.
- Use the project-local scoped guide. If absent, stop for governed native project setup; do not fall back to another project's private files or guess a target.
- Native Studio selection does not authorize remote operations, Azure hosting, sign-in, billing, DLP changes or audience expansion. Preserve explicit target and operation approvals.
<!-- pso:end id=native-studio-routing -->

<!-- pso:begin id=post-creation-workspace version=1 -->
## Open created projects and agents

- After creating a new project or agent, open its owning project in VS Code before reporting completion. Prefer the generated `.code-workspace` file; otherwise open the project folder. Use a new window for a different project so the current workspace is preserved.
- For a new agent, also open its definition. If only a blueprint or review plan was created, open that preview and state that installation or deployment is still pending.
- When using `create-project`, include `--open`; agent creation outside that command still requires an explicit workspace-opening step. Writing files or changing a shell directory is not the same as opening the project.
- The only scope exception is an explicit user request to upgrade Project Orchestrator itself to include the new projects, agents, files, or other framework artifacts. Keep that work in the Project Orchestrator workspace instead.
- Verify the target workspace opened. If VS Code is unavailable or opening fails, report the blocked opening step and provide the exact workspace path and manual open command; never silently skip it or claim it opened.
- Opening a workspace does not approve agent installation, deployment, publication, external mutation, commits, or pushes.
<!-- pso:end id=post-creation-workspace -->

## Target project work

This repository is the target project. Build application code, tests, documentation, project-specific prompts, deployment configuration, and validation artifacts here when the user asks to implement this project's app or operations. Use the installed skills as project-local capabilities, keep generated evidence under `reports/`, and preserve the approval gates before Azure, deployment, external, destructive, privileged, commit, or push actions.

## Skill reuse

- Automatically use an existing skill when its trigger and ownership match the request; continue with normal engineering work only when no available skill fits. Prefer reuse over duplicating an existing skill, script, workflow, report, or capability.
- Before authoring a new skill, invoke `/skill-create` to inventory and compare current skills. Notify the user and obtain explicit approval when no existing skill fits before creating the new skill.
- Before changing an existing skill, invoke `/skill-update`. Resolve an inexact name by offering ranked candidate skill IDs, identify one exact target, present every proposed file and behavior change, and wait for `-Proceed` or `--proceed` before editing.

<!-- pso:begin id=azure-environment-automation version=1 -->
## Azure environment automation

- Read `.azure/environment.json` before Azure work. Explicit `-Gov` or `-Commercial` overrides the saved cloud; otherwise use the saved profile, then Azure Commercial as the default.
- If the profile is missing, collect its nonsecret environment choices once and persist them. Never repeat cloud, subscription, MCP, or login questions while the profile remains valid.
- Select the recorded Azure CLI cloud and subscription automatically. If authentication is absent or stale, start the recorded login flow instead of asking whether to log in.
- Azure MCP is opt-in. Do not invoke it when disabled, and never invoke `foundryextensions` unless the profile already enables it with a client ID.
<!-- pso:end id=azure-environment-automation -->

- Machine-readable artifacts under `reports/` are authoritative. Markdown views are derived.
- Never rewrite accepted records in `reports/execution-log.jsonl`.

## Startup continuity

At the beginning of work, read `reports/project-handoff.json` before planning or changing files. If
it does not exist, create an initial handoff through `/project-handoff`. After understanding the
handoff, read the Azure environment profile and discovery reports before Azure-dependent planning.

`/project-understanding` performs a complete repository rescan and atomically rebuilds
`reports/project-understanding.json` and `reports/project-understanding.md`; it never appends an
incremental summary. `/documentation-builder` uses that scan to build the canonical
`docs/PROJECT-GUIDE.md` and evidence-bound `reports/project-guide.json`. `/project-video`,
`/linkedin-post`, and presentation workflows consume the project guide after checking it against
current code and reports, so the repository where each command runs remains the subject.

After refreshing Project Understanding, `/project-video` runs its packaged `discovery-status`. When Azure narration is selected
and discovery is missing, incompatible, or stale, refresh it using the environment profile and run
`azure-preflight`. Use `browser-preview` when the project does not select Azure narration. Discovery
never creates a resource or retrieves its key.

Select the smallest valid video production path. Prefer Azure Speech in the configured region when
available and approved. Require approval before same-cloud cross-region processing. Otherwise retain
the same pages and dialogue in an interactive browser-default-voice presentation. Offer local Piper
only when a portable offline narrated MP4 is required, and use local FFmpeg for approved MP4 output.
Azure OpenAI, Azure Speech, Speech Avatar, downloads, and FFmpeg rendering each retain their separate
approvals. The entire production workflow remains executable from VS Code. Browser speech is HTML,
not rendered media, and an Avatar presenter clip is never a completed project or final MP4.

`/azure-discovery` accepts `-Commercial` or `-Gov`. Without a flag it uses the saved environment or
defaults a new profile to Commercial Azure. To explicitly bypass the normal clarification round, append the exact token
`--proceed` or `--Proceed` to the prompt. Treat the token case-insensitively. This is a user instruction to proceed with reasonable defaults,
not permission for destructive, external, privileged, irreversible, commit, or push actions.

## Project purpose

<!-- Replace: one paragraph describing what this system does and who uses it. -->

## Architecture overview

<!-- Replace: components, boundaries, data flow, external dependencies, and hosting model. -->

Record every significant architectural decision as an ADR in `docs/adr/` using `/create-adr`. Do not change a documented decision without superseding its ADR.

## Coding standards

- Prefer clarity over cleverness. Small, single-responsibility units.
- No dead code, commented-out code, unused imports, or speculative abstractions.
- Handle errors at system boundaries; do not swallow exceptions.
- Dispose or release every acquired resource deterministically.
- Comments explain *why*, never *what*. One line where one line will do.

## Naming standards

- Names describe intent, not type or implementation.
- Azure resources follow the documented naming convention and are tagged with owner, environment, and cost center.
- Files and directories use lowercase-kebab-case unless the language convention requires otherwise.

## Azure standards

- Prefer Azure-native, first-party services over custom infrastructure.
- Apply Zero Trust: explicit verification, least privilege, assume breach.
- Use Managed Identity for service-to-service authentication. Connection strings and keys are a last resort and require an ADR.
- Define all infrastructure as code with Bicep. No portal-only changes in any shared environment.
- Every deployable environment has diagnostic settings, alerts, and a documented recovery objective.

## Security requirements

- Never hard-code secrets, tokens, keys, or connection strings. Use Key Vault and Managed Identity.
- Validate and encode at every trust boundary. Treat all external input as hostile.
- Address the OWASP Top 10 explicitly for any request-handling code.
- Pin third-party GitHub Actions to a full commit SHA.
- Run `/security-review` before merging changes that touch authentication, authorization, secrets, network exposure, or data handling.

## Testing requirements

- Every bug fix ships with a failing-then-passing regression test via `/regression-test-development`.
- Tests assert behavior, not implementation details.
- No new code path merges without coverage of its success path and its primary failure path.
- The full test suite must pass locally before a commit is prepared.

## Documentation requirements

- Update `README.md` when setup, commands, or entry points change.
- Update `docs/` when architecture, operations, or deployment change.
- Generate and refresh documentation with `/documentation-builder`.
- Record continuity with `/project-handoff` at the end of any substantial work session.

## Approval gates

Require explicit user approval before: destructive changes, deployment, publication, privileged access, remote mutation, force operations, commits, and pushes. Never bypass safety checks such as `--no-verify`.
