---
mode: agent
description: Help for the workflow-telemetry skill.
---

# workflow-telemetry Help

Derive operational metrics, resource usage, retries, failures, approvals, artifacts, and skill performance from authoritative runtime events. Use to analyze recorded workflow events after execution; do not use as a live monitoring or alerting system.

Explain this contract as help only. Do not execute its procedures or treat examples as action approval.
Read the complete contract at .github/skills/workflow-telemetry/SKILL.md before using this skill.

## Purpose

Derive operational metrics, resource usage, retries, failures, approvals, artifacts, and skill performance from authoritative runtime events.

## Preconditions

- Read repository instructions and applicable configuration.
- Inspect authoritative existing artifacts before replacing derived views.
- Verify that this skill owns the requested decision or output.

## Inputs

- Authoritative execution state and event log outputs from `workflow-state-manager`.
- Metric definitions and reporting windows.
- Optional baselines for trend comparison.

## Approved Tools and Resources

- Use read-only repository inspection by default.
- Use deterministic scripts and schema validators when provided.
- Use mutating tools only within the approved workflow boundary.

## Read and Write Boundaries

- Write only the owned reports listed below.
- Never rewrite accepted event-stream records.
- Do not silently mutate source, infrastructure, external systems, or unrelated artifacts.

## Procedure

1. Ingest event streams and snapshots for the requested analysis window.
2. Normalize events into consistent dimensions: workflow, skill, step, status, and duration.
3. Compute metrics for throughput, latency, retries, failures, approval waits, and artifact production.
4. Derive resource and budget indicators where data is available.
5. Compare against baseline trends and identify statistically meaningful deviations.
6. Publish telemetry artifacts with provenance and known data gaps.

## Validation

- Metrics are reproducible from the same event window and definitions.
- Aggregations preserve source counts and status totals.
- Missing telemetry dimensions are explicitly marked as degraded coverage.
- Human-readable summary matches machine-readable metric values.

## Outputs

- `reports/workflow-telemetry.json`
- `reports/workflow-telemetry.md`

## Failure Behavior

- Fail closed when event provenance or time window boundaries are ambiguous.
- Return partial telemetry only with explicit excluded dimensions.
- Never claim trend confidence when baseline data is insufficient.

## Approval Gates

This skill is analytical; require explicit approval before sharing telemetry outside authorized project boundaries.

## Composition and Dependencies

- workflow-state-manager

## Examples

- Generate weekly metrics for failure rate and approval latency by skill.
- Identify retry hotspots after a contract migration rollout.

## Related commands

- Run the skill with /workflow-telemetry.
- Open this help with /workflow-telemetry-help.
- Inspect the full contract with @.github/skills/workflow-telemetry/SKILL.md.
