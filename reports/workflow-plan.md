# LIVE-CHAT-001 Governed Workflow Plan

Generated: `2026-09-18T15:25:09.3571524Z`

Workflow: `WF-LIVE-CHAT-20260918`
Run: `RUN-LIVE-CHAT-PLAN-20260918-01`
Status: **Planning only**
Exact next action: **STEP-001 only**

## Authorization Boundary

This plan does not authorize implementation. The first implementation gate is **STEP-005**. Cloud and subscription discovery is separately gated at **STEP-012**. Any external or billable model or Speech processing and related provisioning is separately gated at **STEP-014**. Azure Government remains the required deployment-test target.

No commit, push, deployment, publication, release, model selection, Azure resource creation, or external processing is implied. No demo project currently exists. Local implementation validation, if STEP-005 is approved, uses disposable generated-project fixtures and leaves no permanent application inside the Launch Pad beyond explicitly approved reusable shipped framework assets.

## Objective

Create a reusable natural live-voice and grounded-text capability with:

- live interim transcript and configurable pause detection;
- automatic submission for informational voice turns without a manual Submit action;
- explicit confirmation before consequential actions;
- correction and cancellation after false endpointing;
- natural half-duplex response and listening resume, with future barge-in as an extension;
- session-only transcript by default, no raw-audio retention, and spoken response opt-in;
- text-only and guided-only fallback;
- answers grounded in approved versioned sources with links and explicit unknowns;
- keyboard, screen-reader, reduced-motion, and responsive operation;
- browser/server separation with all credentials and privileged processing server-side;
- Azure Commercial and Azure Government through the saved cloud profile and correct cloud endpoints; no silent cross-cloud fallback.
- Dynamic per-subscription discovery of service/model availability, regions, quotas, cost indicators, auth/RBAC feasibility, data boundaries, and SDK/REST API versions before provider integration.

No model is selected by this plan.

## Governing Design

The local baseline separates client microphone/transcript state, a server session and authentication boundary, asynchronous streaming transport, VAD/end-of-turn adapters, grounding, cancellation, reconnect, speech/model adapters, health, and metrics. Fake adapters make the baseline deterministic and cloud-free.

All input, retrieved content, source metadata, and generated output are untrusted. Required controls include input/output validation, prompt-injection isolation, content safety, least-privilege RBAC, `DefaultAzureCredential` or managed identity for any approved Azure adapter, redacted structured logging, bounded retries with backoff, rate limits, abuse controls, health checks, metrics, privacy notice, and evaluation before rollout consideration.

## Approval Gates

| Gate | Approval classes | Exact scope | Explicit exclusions |
| --- | --- | --- | --- |
| STEP-005 | `phase` | Exact skill/runtime/template/schema/test/docs boundary, UX defaults, frozen thresholds, and explicit `skill-create --proceed` when a new skill remains necessary | Azure work, external processing, provisioning, commit, push, deploy, publish, release |
| STEP-012 | `phase`, `external`, `privileged` | Read-only discovery in the saved cloud and one named subscription | Model selection, resource creation, billing, inference, application-data transfer, deployment |
| STEP-014 | `phase`, `external`, `privileged` | Exact approved cloud, subscription, services, API versions, data classes, retention, cost ceiling, resources, identity, and external-processing implementation | Inferred approval, deployment, publication, release, commit, push |

A denied, missing, or waiting approval routes to STEP-020. Azure Commercial is never a fallback.

## Ordered Workflow

| Step | Owner | Status | Outcome | Approval |
| --- | --- | --- | --- | --- |
| STEP-001 | `skill:skill-inventory` | Ready | Map reuse and duplication; decide whether `live-chat-interaction` is needed without authoring it. | None |
| STEP-002 | `skill:architecture-review` | Planned | Freeze local-first client, server, streaming, VAD, grounding, cancellation, reconnect, half-duplex, and barge-in-extension contracts. | None |
| STEP-003 | `skill:security-review` | Planned | Threat-model privacy, consent, injection, output safety, retention, auth/RBAC, abuse, telemetry, and browser permission. | None |
| STEP-004 | `skill:workflow-simulator` | Planned | Simulate voice, permission, service, reconnect, grounding, approval, cost, and fallback failures. | None |
| STEP-005 | `operator:product-owner` | Planned | Approve exact local implementation boundary, UX thresholds, and skill-create proceed decision. | Phase |
| STEP-006 | `skill:skill-create` | Planned | Create the governed owner only if renewed inventory proves reuse insufficient; otherwise avoid duplication. | Prior STEP-005 gate |
| STEP-007 | `skill:regression-test-development` | Planned | Red-green the pure conversation state machine and fake adapters. | Prior STEP-005 gate |
| STEP-008 | `skill:regression-test-development` | Planned | Red-green versioned grounding, citations, unknowns, injection boundaries, and output validation. | Prior STEP-005 gate |
| STEP-009 | `skill:development-environment-readiness` | Planned | Validate local server transport, streaming, auth, health, retry, and fake-adapter boundaries. | Prior STEP-005 gate |
| STEP-010 | `skill:regression-test-development` | Planned | Validate the accessible responsive experience in a disposable generated project. | Prior STEP-005 gate |
| STEP-011 | `skill:security-review` | Planned | Run local security/change checkpoint, focused tests, and `npm run check`. | None |
| STEP-012 | `operator:product-owner` | Planned | Approve read-only discovery in the saved Azure cloud for one named subscription. | Phase, external, privileged |
| STEP-013 | `skill:azure-discovery` | Planned | Discover selected-cloud Speech/model availability, regions, quota, cost, identity, endpoints, API versions, and data boundary without selecting or creating. | Prior STEP-012 gate |
| STEP-014 | `operator:product-owner` | Planned | Separately approve any external/billable processing implementation or provisioning. | Phase, external, privileged |
| STEP-015 | `skill:regression-test-development` | Planned | Integrate and test only the approved cloud-specific server adapter; Azure Government remains the deployment-test target. | Prior STEP-014 gate |
| STEP-016 | `skill:regression-test-development` | Planned | Evaluate frozen latency, endpoint, correction, grounding, safety, accessibility, cost, and fallback thresholds. | None |
| STEP-017 | `skill:documentation-builder` | Planned | Update authoritative guides, runbooks, privacy, retention, configuration, and corpus procedures from evidence. | None |
| STEP-018 | `skill:change-review` | Planned | Review the bounded complete diff and validation evidence. | None |
| STEP-019 | `skill:prepare-commit` | Planned | Prepare a candidate boundary and summary without staging or committing. | None |
| STEP-020 | `skill:project-handoff` | Planned | Publish the single terminal continuity record with exactly one next action. | None |

## Step Governance

### STEP-001: Inventory

Completion: map current runtime, grounding, security, testing, documentation, and Azure owners; prove reuse or the exact nonduplicate candidate ID.
Checkpoint: `CP-LIVE-CHAT-INVENTORY`
Rollback: preserve the prior inventory and discard the assessment.
Recovery: refresh ownership evidence and rerun; unresolved ambiguity stops at STEP-020.

### STEP-002: Architecture

Completion: separate browser, server session, adapters, and versioned sources; define live transcript, tunable endpoint, auto-submit, correction/cancel, streaming, reconnect, half-duplex resume, and future barge-in.
Checkpoint: `CP-LIVE-CHAT-ARCHITECTURE`
Rollback: reject the design without changing framework boundaries.
Recovery: resolve state or trust-boundary gaps and repeat review.

### STEP-003: Security

Completion: freeze consent, session-only transcript, no raw audio, spoken opt-in, injection, safety, least privilege, validation, redacted telemetry, retries, rate, health, and abuse controls.
Checkpoint: `CP-LIVE-CHAT-THREAT-MODEL`
Rollback: discard only the threat model.
Recovery: carry unresolved safe-default choices to STEP-005 or stop.

### STEP-004: Simulation

Completion: deterministic outcomes for silence/noise/false endpoint, interruption, denied mic, unavailable Speech/model, reconnect, stale grounding, rejected approval, cost, and fallback.
Checkpoint: `CP-LIVE-CHAT-SIMULATED`
Rollback: discard simulation output.
Recovery: repair architecture or controls and repeat simulation.

### STEP-005: First Implementation Gate

Completion: approve exact files and behaviors, freeze measurable thresholds, and explicitly satisfy skill-create proceed when needed; all later gates remain excluded.
Checkpoint: `CP-LIVE-CHAT-IMPLEMENTATION-APPROVED`
Rollback: withdraw approval before implementation.
Recovery: record rejection or narrowing and stop at STEP-020.

### STEP-006: Governed Owner

Completion: create a complete `live-chat-interaction` package only after renewed no-owner proof and explicit proceed; propagate catalog, help, profile, dependency, routing, tests, and docs, or record reuse.
Checkpoint: `CP-LIVE-CHAT-OWNER-ESTABLISHED`
Rollback: remove only the new package and approved companions.
Recovery: repair duplication or contract failures and repeat validation.

### STEP-007: Conversation Core

Completion: deterministic tests pass for no-manual-submit informational turns, explicit action confirmation, live transcript, tunable pause, false-endpoint correction/cancel, session-only transcript, no raw audio, spoken opt-in, and listening resume.
Checkpoint: `CP-LIVE-CHAT-STATE-MACHINE-GREEN`
Rollback: remove this implementation slice and tests.
Recovery: keep the smallest failing transition and repair it.

### STEP-008: Grounding

Completion: approved source links and versions or explicit unknowns; retrieved instructions cannot override policy; stale or malformed sources fall back safely.
Checkpoint: `CP-LIVE-CHAT-GROUNDING-GREEN`
Rollback: remove grounding and restore STEP-007.
Recovery: isolate one source, citation, unknown, or injection failure and repair it.

### STEP-009: Local Transport

Completion: no browser credentials; session isolation, async streaming/cancel, reconnect, bounded retry, rate signal, health, metrics, and fallback work with local fakes.
Checkpoint: `CP-LIVE-CHAT-LOCAL-TRANSPORT`
Rollback: remove transport scaffolding.
Recovery: repair with fake adapters and repeat readiness checks.

### STEP-010: Disposable UX Fixture

Completion: all microphone/listening/transcribing/thinking/speaking/error states plus keyboard, screen-reader, reduced-motion, responsive, text-only, and guided-only paths pass.
Checkpoint: `CP-LIVE-CHAT-DEMO-FIXTURE-GREEN`
Rollback: delete the disposable fixture and this slice's approved assets.
Recovery: reproduce the failing state, repair the reusable owner, and retest.

### STEP-011: Local Gate

Completion: no critical/high local security or privacy finding; bounded diff matches STEP-005; focused tests and `npm run check` pass.
Checkpoint: `CP-LIVE-CHAT-LOCAL-GATE-PASSED`
Rollback: preserve the last passing checkpoint.
Recovery: repair findings at their owner and repeat the full gate.

### STEP-012: Azure Discovery Gate

Completion: explicit saved-cloud and named-subscription read-only scope approval; no application data transfer or creation authority. Azure Government is the required deployment-test target.
Checkpoint: `CP-LIVE-CHAT-AZURE-DISCOVERY-APPROVED`
Rollback: withdraw before discovery.
Recovery: denial, missing auth, or invalid cloud context stops at STEP-020 without silent cross-cloud fallback.

### STEP-013: Azure Discovery

Completion: sanitized selected-cloud/subscription Speech/model availability, regions, quota, cost indicators, cloud endpoints, SDK/REST API versions, managed-identity feasibility, and data boundaries are evidenced without model selection or resource creation.
Checkpoint: `CP-LIVE-CHAT-AZURE-DISCOVERED`
Rollback: discard stale local discovery output.
Recovery: retry only in the approved cloud/subscription context or hand off with local fallback; Azure Government availability remains a separate deployment-test requirement.

### STEP-014: External Processing Gate

Completion: explicit cloud, subscription, services, API versions, data classes, retention, cost ceiling, resources, identity, and processing scope; no approval inferred from discovery.
Checkpoint: `CP-LIVE-CHAT-EXTERNAL-PROCESSING-APPROVED`
Rollback: withdraw before external implementation or provisioning.
Recovery: rejection, narrowing, or waiting stops at STEP-020.

### STEP-015: Approved Azure Adapter

Completion: the approved cloud-specific adapter uses `DefaultAzureCredential` or managed identity, least-privilege RBAC, async streaming/cancel, bounded retries, content safety, input/output validation, redacted logs, rate limits, health, metrics, and fallback within the approved API matrix; Azure Government deployment-test evidence remains required.
Checkpoint: `CP-LIVE-CHAT-AZURE-ADAPTER-GREEN`
Rollback: disable the adapter and remove only resources covered by the approved rollback.
Recovery: fail closed to local text/guided mode and hand off.

### STEP-016: Evaluation

Completion: all frozen endpoint, latency, correction, grounding, citation, unknown, injection, safety, privacy, accessibility, cost, rate, retry, and fallback thresholds pass before rollout consideration.
Checkpoint: `CP-LIVE-CHAT-EVALUATION-PASSED`
Rollback: reject the candidate at the last passing checkpoint.
Recovery: repair each failed metric at its owner and rerun the full frozen suite.

### STEP-017: Documentation

Completion: evidence-backed guides distinguish local fakes from approved Government processing and cover privacy, retention, consent, configuration, corpus versions, accessibility, health, metrics, fallback, and recovery.
Checkpoint: `CP-LIVE-CHAT-DOCUMENTED`
Rollback: restore prior docs for withdrawn behavior.
Recovery: correct claims against tests and rerun validation.

### STEP-018: Change Review

Completion: no critical/high defect, unauthorized external behavior, unsupported claim, missing acceptance coverage, or Launch Pad violation remains.
Checkpoint: `CP-LIVE-CHAT-CHANGE-REVIEWED`
Rollback: review is read-only.
Recovery: repair each finding, rerun validation, and repeat review.

### STEP-019: Prepare Commit

Completion: minimal path boundary and current tests/evaluation/review/full gate; no staging, commit, push, deployment, publication, or release.
Checkpoint: `CP-LIVE-CHAT-CANDIDATE-PREPARED`
Rollback: discard only candidate-preparation output.
Recovery: return to STEP-018 whenever the candidate or evidence changes.

### STEP-020: Terminal Handoff

Completion: one terminal continuity record distinguishes local, discovery, external-processing, and candidate states; preserves safe-update and P4 history; records exactly one next action.
Checkpoint: `CP-LIVE-CHAT-HANDOFF-PUBLISHED`
Rollback: preserve the last valid handoff and regenerate mutable views.
Recovery: rebuild from the latest checkpoint and append-only event history.

## Deterministic Routing

Prerequisites are sequential and acyclic from STEP-001 through STEP-020. Every nonterminal `onBlocked` and `onFailed` route goes directly to STEP-020. STEP-020 is the only terminal project-handoff. Exactly one prerequisite-free step is ready: STEP-001.

## Acceptance Criteria

- Informational voice turns submit automatically after the tunable pause; no manual submit is required.
- Live interim transcript, correction, cancellation, and false-endpoint recovery are visible and testable.
- Consequential actions always require explicit confirmation.
- Transcript persistence defaults to session-only; raw audio is not retained; spoken response is opt-in.
- Text-only and guided-only fallbacks remain functional.
- Grounded answers include approved source links and corpus versions or explicit unknowns.
- Source content cannot override policy, authorization, or output validation.
- Keyboard, screen-reader, reduced-motion, responsive, and browser-permission-denied paths remain functional.
- Secrets remain server-side. Approved Azure access uses managed identity or `DefaultAzureCredential` with least privilege.
- Any approved cloud use follows the saved cloud profile and discovered cloud endpoints; Azure Government is the required deployment-test target and Azure Commercial is never silently substituted for a Government test.
- Async streaming, retries/backoff, content safety, redacted structured logging, rate limits, health, metrics, and evaluation precede rollout consideration.

Terminal handoff: `STEP-020`.
