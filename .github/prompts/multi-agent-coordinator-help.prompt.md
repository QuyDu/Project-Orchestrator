---
mode: agent
description: Help for the multi-agent-coordinator skill.
---

# multi-agent-coordinator Help

Coordinate concurrent agents with leases, fencing tokens, ownership transfer, conflict detection, and shared-read or exclusive-write semantics. Use when more than one agent may write the same artifacts concurrently; do not use for single-agent sequential work.

Explain this contract as help only. Do not execute its procedures or treat examples as action approval.
Read the complete contract at .github/skills/multi-agent-coordinator/SKILL.md before using this skill.

## Purpose

Coordinate concurrent agents with leases, fencing tokens, ownership transfer, conflict detection, and shared-read or exclusive-write semantics.

## Preconditions

- Read repository instructions and applicable configuration.
- Inspect authoritative existing artifacts before replacing derived views.
- Verify that this skill owns the requested decision or output.

## Inputs

- Active work items, ownership intents, and concurrency constraints.
- Current execution state from `workflow-state-manager`.
- Scheduling priorities and admission decisions from `workflow-scheduler`.

## Approved Tools and Resources

- Use read-only repository inspection by default.
- Use deterministic scripts and schema validators when provided.
- Use mutating tools only within the approved workflow boundary.

## Read and Write Boundaries

- Write only the owned reports listed below.
- Never rewrite accepted event-stream records.
- Do not silently mutate source, infrastructure, external systems, or unrelated artifacts.

## Procedure

1. Resolve current owners, active leases, and pending claims for each contested resource.
2. Issue or renew leases with fencing tokens, TTLs, and explicit read/write scope.
3. Enforce shared-read or exclusive-write semantics and reject conflicting claims deterministically.
4. Coordinate ownership transfers by requiring current owner release and next-owner acceptance.
5. Record conflict outcomes, retries, and expired leases with resume guidance.
6. Publish coordination state for downstream execution and observability.

## Validation

- No resource has overlapping exclusive-write leases.
- Every active lease has owner, token, scope, and expiration metadata.
- Rejected claims include deterministic conflict reason and next action.
- Coordination outputs reflect current execution and scheduler inputs.

## Outputs

- `reports/coordination-state.json`
- `reports/coordination-state.md`

## Failure Behavior

- Fail closed when lease state is ambiguous or fencing token integrity is broken.
- Preserve last valid coordination snapshot and return a blocked conflict state.
- Never grant write ownership under uncertain concurrency conditions.

## Approval Gates

Require explicit approval before forced lease revocation or manual ownership override that could discard in-flight work.

## Composition and Dependencies

- workflow-state-manager
- workflow-scheduler

## Examples

- Coordinate two agents contending for the same report output using exclusive-write lease semantics.
- Transfer ownership of a workflow step after current owner checkpoints and releases its lease.

## Related commands

- Run the skill with /multi-agent-coordinator.
- Open this help with /multi-agent-coordinator-help.
- Inspect the full contract with @.github/skills/multi-agent-coordinator/SKILL.md.
