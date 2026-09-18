# Workflow Simulation

## Result

Analytical STEP-004 passed. Thirteen deterministic local scenarios have complete transitions, recovery routes, stop conditions, and pass criteria. This is contract simulation only; it does not prove an implementation or measured runtime performance.

| Scenario | Deterministic transition | Required outcome |
|---|---|---|
| Silence | listening -> idle | No submission; retain no audio; keep text/guided controls. |
| Noise | listening -> listening/idle | No fabricated transcript or endpoint below confidence floor. |
| False endpoint | endpoint-pending -> correcting | Continue/correct/send/cancel; latest token only; never duplicate. |
| Correction | correcting -> endpoint-pending -> accepted | Only corrected revision reaches grounding. |
| Cancel | active -> cancelled -> idle | Stop capture/playback and all adapter work; reject late events. |
| Interruption | speaking -> speaking or explicit stop -> listening | Preserve half-duplex; no implicit barge-in. |
| Microphone denied | consent-required -> denied -> text-fallback | No permission loop; focus accessible fallback. |
| Service unavailable | active -> retrying -> text/guided fallback | At most two transient retries; no indefinite spinner or hidden provider switch. |
| Reconnect | active -> reconnecting -> safe prior state/fallback | Replay after acknowledged sequence; reject replay and cross-session resume. |
| Stale grounding | thinking -> guided-fallback | Explicit unknown; no stale claim or citation. |
| Approval denied | approval-wait -> STEP-020 | Zero denied mutation; never infer authorization. |
| Cost ceiling | active -> guided-fallback | Reserve budget before call; no over-budget or Commercial fallback. |
| Fallback | any nonterminal -> text/guided fallback | Preserve accessible local capability and perform no consequential action. |

## STEP-005 Proposed Boundary

Approval remains **unresolved**. The exact candidate skill is `live-chat-interaction`, and STEP-005 must separately authorize `skill-create --proceed` before STEP-006.

Proposed governed files:

- Skill and routing: `.github/skills/live-chat-interaction/SKILL.md`, generated help, `config/skills-orchestrator.json`, and `config/profiles.yaml`.
- Contracts: four schemas for configuration, events, grounding manifest, and evaluation.
- Shipped reusable assets: conversation state, grounding, server session/transport, browser controller, and accessible panel under `templates/project/.skills-orchestrator/live-chat/`, registered in `templates/scaffold-manifest.json`.
- Validation: four focused live-chat test files plus `tests/skill-contracts.test.mjs`.
- Documentation: README, architecture guide, project guide, and threat model.

No permanent demo application belongs in the Launch Pad. Local fake adapters remain mandatory through STEP-011. Provider/model/Speech/region/SKU/quota selection, Azure discovery, external processing, commit, push, deployment, publication, and release remain excluded.

## STEP-005 Proposed Thresholds

All values are exact proposals, not approved or measured results.

- Endpointing: 900 ms default silence, tunable 600-1600 ms; 250 ms minimum voice; confidence floors 0.65 voice and 0.80 endpoint; 1500 ms correction grace; 30 s utterance maximum; false endpoints at most 5% clean and 10% noise fixtures; zero duplicate submissions.
- Latency p95: interim transcript 300 ms; accepted endpoint 1200 ms after speech; cancel 250 ms; first text delta 2500 ms; spoken start 1000 ms after first text; reconnect 2000 ms; visible fallback 500 ms.
- Grounding: 100% supported factual claims cited; 100% citations resolve to active corpus; at least 95% unsupported prompts explicitly unknown; 100% stale corpus fallback and injection-fixture rejection; zero unavailable capability claims.
- Privacy/security: zero retained raw-audio bytes, session-only transcript, 30-minute idle and 120-minute absolute session expiry, spoken output off, zero browser service secrets, zero cross-session access, zero unconfirmed consequential actions, and 100% critical/high security test pass.
- Rate/retry/health: one session per identity, one active turn, 30 turns/10 minutes, 8000 transcript characters, 1500 response tokens, two transient retries, 250-2000 ms retry delay, 15 s dependency deadline, circuit open after five failures/minute and half-open after 30 s.
- Accessibility: 100% critical keyboard, screen-reader announcement, reduced-motion, responsive, text-fallback, and guided-fallback flows.
- Cost: $0 through STEP-011; future proposal at most $0.10 per 10-minute external session and $10/day development use; undefined or exhausted budget denies external processing and falls back; Azure Commercial fallback is forbidden.
- Fallback: 100% deterministic fallback for denied microphone, unavailable service, retry exhaustion, cost ceiling, and stale grounding; zero indefinite loading states.

## Approval Wait

Current state is STEP-005, owned by `operator:product-owner`. No approval is inferred. Rejection or narrowing routes to STEP-020; approval must name the exact boundary and thresholds and separately satisfy the skill-create proceed requirement.