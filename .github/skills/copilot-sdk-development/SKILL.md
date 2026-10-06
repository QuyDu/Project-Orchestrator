---
name: copilot-sdk-development
description: Design and validate GitHub Copilot SDK applications in an explicit target project, including sessions, streaming, tools, custom agents, and bounded MCP connections. Use for Copilot SDK application work; do not create target application code inside the Project Orchestrator launch pad.
lifecycle: draft
confidence: low
---

# copilot-sdk-development

## Purpose

Guide target-project Copilot SDK development with clear session, tool, security, observability, testing, and deployment boundaries.

## Preconditions

- Select or create an explicit target project outside the Project Orchestrator launch pad.
- Read target repository instructions and verify the supported SDK/runtime version.
- Clarify users, session model, tools, data boundaries, and acceptance criteria.

## Inputs

- Target language/runtime, SDK version, application architecture, and user interaction model.
- Session lifecycle, streaming behavior, custom-agent definitions, tools, and optional MCP endpoints.
- Authentication, data classification, telemetry, testing, and deployment constraints.

## Approved Tools and Resources

- Use target-project package managers, tests, SDK documentation, and local debugging tools.
- Reuse validated agent blueprints from `agent-builder`.
- Do not install MCP servers, deploy applications, or create hosted resources without separate approval.

## Read and Write Boundaries

- Write application code and tests only in the explicit target project.
- In this repository, write only owned planning and validation reports.
- Never persist tokens, conversation secrets, or unredacted tool payloads.

## Procedure

1. Verify SDK/runtime compatibility and define the application and trust boundaries.
2. Design session creation, cancellation, reconnection, streaming, and error behavior.
3. Define least-privilege tools with typed inputs, bounded outputs, and explicit approval classes.
4. Validate custom-agent and MCP composition without granting implicit tool authority.
5. Implement in the target project using small testable components.
6. Add deterministic tests for session state, streaming, tool failures, cancellation, and redaction.
7. Validate telemetry, resource disposal, accessibility, and deployment handoff readiness.
8. Report implemented behavior separately from hosted or published status.

## Validation

- SDK and runtime versions are supported and recorded.
- Session and tool boundaries are explicit, cancellable, and resource safe.
- Untrusted model/tool content cannot bypass authorization or data boundaries.
- Tests cover streaming, failures, cancellation, and cleanup without live credentials.

## Outputs

- `reports/copilot-sdk-development-plan.json`
- `reports/copilot-sdk-development-report.md`

## Failure Behavior

- Return blocked when no target project, supported SDK version, or safe tool boundary exists.
- Fail closed on ambiguous MCP authority or credential handling.
- Never claim deployment or publication from local source validation.

## Approval Gates

Require approval before dependency changes, code execution with external tools, MCP installation, authentication, deployment, publication, commit, or push.

## Composition and Dependencies

- clarify-the-ask
- agent-builder
- architecture-review
- regression-test-development

## Examples

- Build and test a target-project streaming chat session with cancellable typed tools.
- Review a Copilot SDK MCP integration plan and block tools whose authority is not explicit.
