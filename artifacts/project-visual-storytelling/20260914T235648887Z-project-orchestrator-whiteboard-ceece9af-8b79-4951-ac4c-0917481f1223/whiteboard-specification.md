# Project Orchestrator Whiteboard

## Render Status

No finished image produced. Current Azure Government discovery does not qualify MAI-Image, and Blender is not installed or available on `PATH`.

## Purpose

Explain how Project Orchestrator turns a repository request into a governed GitHub Copilot workspace with bounded skills, approval-aware execution, deterministic validation, and reusable evidence.

## Audience

Engineering teams, platform owners, and security reviewers evaluating Project Orchestrator.

## Dominant Metaphor

A governed assembly line moves a project request through five connected workshop stations. The line begins in VS Code and ends with verified evidence and measurable delivery outcomes. Guardrails remain visible around planning, approval, and validation rather than appearing as an afterthought.

## Composition

- Landscape physical workshop whiteboard viewed straight-on with subtle product-photography perspective.
- Five raised paper zones connected left to right: Request, Understand, Govern, Validate, and Evidence.
- A purple route marks the active flow. Dark green check marks identify verified outcomes. Red gate symbols identify approval and release boundaries. Black supplies neutral structure and attribution.
- Use a single large line rather than nested cards or a dense architecture diagram.
- Reserve a clean lower-left attribution plaque for `AI-assisted for Project Orchestrator` and a lower-right date plaque for `2026-09-15`.

## Zone Content

1. **Request** — VS Code, Copilot Chat, and slash prompts provide the user-facing entry point.
2. **Understand** — Repository context, Project Understanding, and the skill catalog ground the requested work.
3. **Govern** — Project Orchestrator routes bounded workflows through policy, execution state, and human approval.
4. **Validate** — Schemas, security checks, tests, and release verification provide deterministic controls.
5. **Evidence** — Machine-readable reports support faster onboarding, lower risk, stronger compliance, and accelerated delivery.

## Renderer Qualification

- Requested provider preference: `auto`
- MAI-Code-1.1-Flash: suitable as the VS Code coding and planning model, but not an image-output renderer.
- MAI-Image: unavailable because current Azure Government discovery does not confirm a supported image-generation deployment.
- Blender/Cycles: unavailable because Blender is not installed or on `PATH`.
- Final status: specification, alt text, and validated render plan only.

## Evidence Mapping

| Visible label | Verified meaning | Evidence |
| --- | --- | --- |
| Request | Users interact through VS Code, Copilot Chat, and slash prompts. | `docs/PROJECT-ARCHITECTURE.md` |
| Understand | The intelligence layer reasons over repository context and governed skills. | `docs/PROJECT-ARCHITECTURE.md`, `reports/project-understanding.md` |
| Govern | Orchestration plans, routes, tracks work, and exposes human approval controls. | `docs/PROJECT-ARCHITECTURE.md`, `.github/skills/project-skills-orchestrator/SKILL.md` |
| Validate | The complete gate performs syntax, security, release, test, and distribution verification. | `package.json` |
| Evidence | Reports and schemas make workflow outcomes auditable and reusable. | `README.md`, `reports/project-understanding.md` |

## Attribution

- Source: current Project Orchestrator launch-pad repository
- Source digest: `ea90687a84a0416b0876abda1fd7b87b1089bb1a03e894761c9967b337c70ba8`
- Signature: AI-assisted for Project Orchestrator
- Creation date: 2026-09-15
- Publication: not approved

## Final Review

- Every visible claim maps to current repository evidence.
- The visual does not claim that Project Orchestrator generates application code or that the unsigned release is published.
- No Azure identifier, credential, confidential path, or external source is exposed.
- A PNG must not be created or claimed until a qualified renderer and full visual review are available.