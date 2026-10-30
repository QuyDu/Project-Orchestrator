# Audit Remediation Plan

Plan: PLAN-b02206bb-f6f7-42f6-9da7-3acceb241e3c
Run: b02206bb-f6f7-42f6-9da7-3acceb241e3c
Source review SHA-256: 2ec5717bbafa0d0753538afe510da613627c7f49ffd77c20d71f10aacb21eecb

Status: approval-wait. This plan has not executed any repair.

## M1: Protect workflow lineage and report publication

- REM-0147: Planning silently replaces a workflow that is waiting for approval; complexity medium; owner Framework runtime maintainer; explicit approval required.
- REM-0148: Planner emits new events that fail the shipped event schema; complexity medium; owner Framework runtime maintainer; explicit approval required.
- REM-0149: Planner reuses event sequence numbers for accepted legacy history; complexity medium; owner Framework runtime maintainer; explicit approval required.
- REM-0150: Failed inventory publication leaves a mixed report generation; complexity medium; owner Framework runtime maintainer; explicit approval required.

## M2: Enforce provider input and resource lifetimes

- REM-0151: Caller transcript metadata bypasses the aggregate input ceiling; complexity low; owner Live Chat maintainer through the owning skill-update boundary when its package/contract changes; explicit approval required.
- REM-0152: Provider rate records retain completed sessions without a bound; complexity medium; owner Live Chat maintainer through the owning skill-update boundary when its package/contract changes; explicit approval required.
- REM-0154: A stalled credential call outlives the request deadline and retains the identity slot; complexity medium; owner Live Chat maintainer through the owning skill-update boundary when its package/contract changes; explicit approval required.

## M3: Correct retry observability

- REM-0153: Retry telemetry reports one attempt after three transport attempts; complexity low; owner Live Chat maintainer through the owning skill-update boundary when its package/contract changes; explicit approval required.

## Execution Boundaries

Every confirmed finding maps to one independently approvable item. REM-0149 depends on REM-0148; other items are separately bounded. Each JSON item records scope, acceptance, verification, rollout, rollback, and residual risk. Changes to governed skills must use their exact skill-update proposal and approval boundary.

Do not rewrite event history, install tools, change hosted protections, use cloud resources, commit, push, deploy, publish, or accept risk based on this plan alone. Missing hosted/analyzer/standards/platform assurance remains separate from fixing these defects.
