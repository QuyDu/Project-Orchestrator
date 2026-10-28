---
applyTo: "infra/**"
description: "Azure service design, SDK integration, identity, sovereign-cloud discovery, and governed deployment standards."
---

# Azure Services and Deployment Instructions

Reviewed: 2026-10-28

Apply the service-design and SDK rules to Azure application integration as well as infrastructure. Pipeline entry-point rules below apply only when the project uses the shipped pipeline. These instructions are not permission to authenticate, probe a tenant, provision resources, or enable MCP.

## Service Design and SDK Use

- Evaluate the five Azure Well-Architected pillars: Reliability, Security, Cost Optimization, Operational Excellence, and Performance Efficiency. Record tradeoffs, service-specific requirements, measurable recovery/availability objectives, cost budgets, and operational ownership rather than claiming that a service choice alone meets them.
- Prefer supported Azure SDKs and their documented transport/authentication pipelines over ad hoc clients. Respect per-language client ownership, cancellation, pagination, and API-version support; application-boundary validation remains required even when an SDK delegates service-parameter validation to the service.
- Bound retries, timeouts, concurrency, payload sizes, and cost exposure. Respect throttling/Retry-After, avoid nested retry multiplication, and make consequential writes idempotent before retrying them.
- Use structured diagnostics, correlation identifiers, and approved observability. Redact secrets and personal data; do not enable raw payload/token logging or cross-cloud telemetry merely to troubleshoot a failure.
- Treat public networking as an explicit development tradeoff, not a production-ready security posture. For real data, require approved network isolation, TLS, encryption, access controls, retention, recovery tests, and an incident/rollback plan.

## Entry points and libraries

- For the shipped pipeline, `deploy.ps1` is the deployment entry point; `discover.ps1` and `deploy-infra.ps1` are libraries that must be dot-sourced. Do not impose this entry point on an unrelated project's existing deployment tooling.
- Keep each module single-purpose. Add a new module rather than growing `deploy.ps1` into a monolith.

## Authentication

- Deployment reads the ignored `.azure/environment.json`, selects its cloud and subscription, and starts its recorded login method when needed. Never store a client secret, certificate, or token in source or a checked-in file.
- Collect cloud, subscription, authentication-method, and MCP preferences only when the profile is missing; do not ask for them repeatedly while it remains valid.
- Verify the active cloud and subscription before any mutating command, and fail closed on mismatch.
- Prefer managed identity or workload identity where the service supports it, with least-privilege RBAC. Configure the SDK credential chain explicitly for the environment; developer credential discovery is not a substitute for deliberate production identity selection. Never write service keys into app settings when identity-based access is supported.
- The baseline ships `publicNetworkAccess` as `Enabled` so a new project deploys to a working state. Identity-based authentication is not a substitute for network isolation: before the deployment carries real data, set it to `Disabled`, add private endpoints and private DNS, and record the decision in an ADR.

## Discovery before deployment

- Never hard-code a region's capabilities. Probe with `discover.ps1` and let the result drive Bicep parameters, so the same repository deploys to any subscription and region.
- Use approved Azure Discovery evidence for existing resources, candidate regions, provider/API/SKU/model availability, quota, capacity, policy, and global-name constraints. A negative result in one region is not proof of cloud-wide unavailability; expand only within the authorized discovery scope.
- Treat a failed probe as unknown, not unavailable, and say so in the output.

## Sovereign clouds

- Support Azure US Government and Commercial from one build. Bicep sets `AZURE_CLOUD`; application code reads it to select the authority host and service endpoints.
- Never assume a `.com` endpoint. Resolve endpoints from the cloud profile.
- Model and SKU availability differs between clouds. Confirm the selection is valid in the target cloud before deploying.

## Approval

- Deployment mutates a shared external system. Run `-WhatIf` and present the plan before any apply, and require explicit approval for the apply itself.
- Never bypass a confirmation prompt to save a step.

## Verification

Use offline tests/fakes for application behavior and separate approved cloud tests for actual identity, availability, service integration, deployment, and recovery evidence. Keep deployment tests in the project's approved cloud; never switch clouds to clear a failing gate. Respect saved MCP opt-in and keep credentials and tenant identifiers out of tracked templates and reports.

## References

- [Azure Well-Architected Framework](https://learn.microsoft.com/en-us/azure/well-architected/)
- [Azure SDK implementation, diagnostics, and testability guidance](https://azure.github.io/azure-sdk/general_implementation.html)
- [Azure Government and global Azure differences](https://learn.microsoft.com/en-us/azure/azure-government/compare-azure-government-global-azure)
