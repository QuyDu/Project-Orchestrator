# Architecture Review

## LIVE-CHAT-001 Decision

Analytical STEP-001 and STEP-002 passed. The current 47-skill inventory is complete, dependency-closed, and ownership-clean, so it did not need refresh.

No existing skill owns the complete real-time conversational runtime. `agent-builder` owns agent definitions, `project-video` owns narrated media, `azure-discovery` owns availability evidence, and the review, policy, grounding-input, testing, and readiness skills remain reusable support owners. The exact nonduplicate candidate is `live-chat-interaction`; authoring remains prohibited until STEP-005 explicitly approves the boundary and separately authorizes `skill-create --proceed` for STEP-006.

## Local-First Contracts

- **Browser client:** owns notice and consent, microphone permission, ephemeral capture, live interim transcript, final transcript review, correction, cancellation, opt-in spoken response, and accessible text/guided fallback. It receives no service credentials or privileged tokens.
- **Conversation reducer:** accepts typed commands and adapter events and emits state plus effects. States are idle, consent-required, listening, transcribing, endpoint-pending, thinking, speaking, correcting, reconnecting, text-fallback, guided-fallback, denied, unavailable, cancelled, and error.
- **Server session:** owns authentication, authorization, per-session/per-turn isolation, deadlines, idempotency, grounding policy, output validation, rate enforcement, health, and redacted telemetry. Session resume tokens are short-lived and scoped to one authenticated session.
- **Transport:** every event carries schema version, session ID, turn ID, monotonic sequence, timestamp, event type, and idempotency key. Reconnect supplies the last acknowledged sequence and replays only later events; expired or mismatched resumes fail closed.
- **Turn policy:** interim transcript events replace prior snapshots. A final informational turn submits automatically after endpoint acceptance. Consequential intent always transitions to confirmation-required; speech endpointing alone cannot authorize an action.
- **Adapters:** VAD/end-of-turn, speech input/output, response generation, grounding, clock, cancellation, and transport are provider-neutral ports with local fakes. Cancellation and deadlines propagate through every active adapter.
- **Grounding:** only an approved manifest with corpus version, digest, source ID, title, canonical local link, classification, and freshness metadata is accepted. Retrieved text is untrusted data, citations must resolve to the active manifest, and absent/stale/malformed support returns explicit unknown or guided fallback.
- **Duplex mode:** version one is half-duplex. Capture pauses during response playback and resumes only after completion or cancellation. Barge-in is an explicit future extension, not an implicit behavior.

No model, Speech service, region, SKU, resource, quota, price, API version, or deployment topology was selected. Future provider integration must use the saved cloud profile, discover availability per named subscription, validate cloud endpoints and SDK/REST API versions, and retain Azure Government as the deployment-test target.

## Findings

| ID | Severity | Finding | Required disposition |
|---|---|---|---|
| ARCF-2026091801 | Informational | No existing skill owns the real-time conversational runtime. | Propose `live-chat-interaction`; require STEP-005 and later `skill-create`. |
| ARCF-2026091802 | Medium | Provider-coupled state would make endpointing, correction, cancellation, and reconnect nondeterministic. | Freeze pure reducer, port, event, replay, and cancellation contracts. |
| ARCF-2026091803 | High | Unversioned grounding can permit stale claims or policy override. | Bind answers and citations to approved corpus versions; fail to unknown. |
| ARCF-2026091804 | Medium | Untyped operational behavior can leak content or leave silent stalls. | Require redacted metrics, bounded retries, health/readiness, deadlines, and typed failures. |
| ARCF-2026091805 | Informational | Provider and cost choices are intentionally unresolved. | Keep local adapters through STEP-011 and honor later Azure Government gates. |

## Preserved Historical Finding

`ARCF-0205` remains medium severity with high confidence: hosted source changes do not require an independent human review because only one write-capable collaborator exists. It is unrelated to LIVE-CHAT-001 and remains preserved without reinterpretation.

## Limits

This was local design analysis only. No implementation, runtime execution, network or Azure access, model selection, external processing, commit, push, deployment, publication, or release occurred. Proposed thresholds remain unmeasured and unapproved.