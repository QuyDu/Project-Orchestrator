---
mode: agent
description: Help for the project-status skill.
---

# project-status Help

Report the current project lifecycle, deployed Azure resource health, sync freshness and errors, and deployment currency from local and read-only cloud evidence. Use when a user asks whether a project, deployment, or data sync is current, healthy, stale, or blocked.

Explain this contract as help only. Do not execute its procedures or treat examples as action approval.
Read the complete contract at .github/skills/project-status/SKILL.md before using this skill.

## Purpose

Produce one current, evidence-backed project status report. When `.azure/environment.json` identifies a subscription, query the declared Azure cloud read-only for project resources and health evidence.

## Preconditions

- Read the current handoff, execution state, manifest, and Azure profile when present.
- Use only the Azure cloud and subscription recorded in the project profile.

## Inputs

- Current project root, optional status window, source revision, and project-local sync or deployment evidence.

## Approved Tools and Resources

- Read-only file, Git, Azure CLI, and Azure Resource Graph inspection.
- The project-local Azure environment profile and cloud endpoint catalog.

## Read and Write Boundaries

- Read source, reports, Git metadata, and Azure resource metadata.
- Write only `reports/project-status.json` and `reports/project-status.md`.
- Never deploy, start, stop, sync, login, switch clouds, or mutate Azure resources.

## Procedure

1. Read authoritative local state and Git `HEAD`.
2. Inspect `.azure/environment.json`. When it has a subscription and endpoint catalog, use its cloud context for read-only Azure resource inventory and App Service state checks.
3. Discover project resource names from Azure deployment reports, IaC outputs, and Azure resource-group naming metadata. Report no deployment evidence when none exists.
4. Read sync reports, event streams, and heartbeat records when present. Mark a sync `failed` on its latest failure; mark it `stale` when its latest success or heartbeat is older than the declared interval plus grace period; otherwise report `unknown` when no observable evidence exists.
   Future success timestamps, including sub-second clock skew, are `unknown` with an explicit diagnostic rather than healthy. An explicitly reported failure remains failed.
5. Compare local Git `HEAD`, the latest validated CI artifact when recorded, and a deployed build/version marker when observable. Never report current when the deployed marker is absent.
6. Publish the report and classify each unavailable evidence source as `unknown`.

## Validation

- The report validates against `schemas/project-status.schema.json`.
- Azure results identify the cloud and subscription from the profile and never infer a Commercial or Government endpoint.
- Every `current`, `healthy`, `failed`, or `stale` conclusion includes evidence.

## Outputs

- `reports/project-status.json`
- `reports/project-status.md`

## Failure Behavior

- Return partial status when Azure authentication, health, sync, CI, or deployment markers are unavailable.
- Never report an unavailable resource, sync, or deployment as healthy or current.

## Approval Gates

- This skill is read-only. Azure login, deployment, sync execution, restart, cleanup, commit, and push require separate approval.

## Composition and Dependencies

- project-handoff
- workflow-telemetry
- audit-azure-environment

## Examples

- Report whether a deployed Azure Government web app is running and matches the local Git revision.
- Report that a scheduled data sync is stale because its heartbeat exceeds its configured interval.

## Related commands

- Run the skill with /project-status.
- Open this help with /project-status-help.
- Inspect the full contract with @.github/skills/project-status/SKILL.md.
