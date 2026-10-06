---
name: microsoft-agent-framework-development
description: Design and validate Microsoft Agent Framework applications in explicit .NET or Python target projects using current reference evidence, bounded tools, state, orchestration, telemetry, and tests. Use for Microsoft Agent Framework implementation; use agent-builder for portable agent definitions.
lifecycle: draft
confidence: low
---

# microsoft-agent-framework-development

## Purpose

Guide target-project Microsoft Agent Framework development without conflating framework source, portable agent definitions, hosted deployment, or publication.

## Preconditions

- Select an explicit .NET or Python target project outside the launch pad.
- Verify current framework packages, runtime support, and official reference evidence.
- Clarify agent topology, tools, state, identity, data boundary, and acceptance criteria.

## Inputs

- Target language/runtime, package versions, application architecture, and hosting intent.
- Agent roles, orchestration pattern, tools, memory/state model, middleware, and telemetry requirements.
- Security, evaluation, testing, and deployment constraints.

## Approved Tools and Resources

- Use target-project package managers, tests, Microsoft reference evidence, and local debugging tools.
- Reuse `agent-builder` for portable definitions and `architecture-review` for design assessment.
- Do not authenticate, deploy, provision, or publish without separate approval.

## Read and Write Boundaries

- Write implementation and tests only in the explicit target project.
- In this repository, write only owned planning and validation reports.
- Never persist credentials, hidden reasoning, or unredacted sensitive tool data.

## Procedure

1. Verify framework/runtime compatibility and establish the application trust boundary.
2. Select the simplest justified single-agent, workflow, or multi-agent pattern.
3. Define typed least-privilege tools, state ownership, cancellation, retries, and idempotency.
4. Define identity, authorization, data handling, telemetry, and evaluation before implementation.
5. Implement small composable target-project components using current framework APIs.
6. Add deterministic tests for orchestration, tool failure, state recovery, cancellation, and redaction.
7. Validate resource disposal, observability, package provenance, and deployment handoff evidence.
8. Report local implementation separately from hosted availability or publication.

## Validation

- Package and API usage matches current Microsoft reference evidence.
- Agent and tool authority is explicit and least privilege.
- State, failure, cancellation, and recovery behavior is deterministic and tested.
- No hosted or published claim is made without provider evidence.

## Outputs

- `reports/microsoft-agent-framework-plan.json`
- `reports/microsoft-agent-framework-report.md`

## Failure Behavior

- Return blocked for unsupported runtimes, ambiguous identity, unsafe tools, or unavailable reference evidence.
- Preserve the last passing target-project state when a framework change fails.
- Route provider deployment to the owning deployment skill.

## Approval Gates

Require approval before dependency installation, external tool execution, authentication, deployment, publication, commit, or push.

## Composition and Dependencies

- microsoft-reference
- agent-builder
- architecture-review
- regression-test-development

## Examples

- Build a tested Python agent workflow with typed tools and explicit state recovery in a target project.
- Review a .NET multi-agent design and simplify it to one agent when coordination adds no justified value.
