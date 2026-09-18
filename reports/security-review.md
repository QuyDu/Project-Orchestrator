# Security Review

## LIVE-CHAT-001 Threat Model

Analytical STEP-003 passed with four pre-implementation control findings. These are mandatory design and test requirements, not claims that protections already exist.

| ID | Severity | Threat boundary | Required control |
|---|---|---|---|
| SECF-2026091801 | High | Notice, consent, microphone, audio, transcript, spoken output | Affirmative microphone action; visible listening state; immediate stop/cancel; no raw-audio retention; session-only transcript; disabled content analytics; spoken output off until per-session opt-in; accessible text/guided alternatives. |
| SECF-2026091802 | High | User/retrieved content to grounding and generated output | Separate instructions from data; allowlist versioned corpus; constrain input; treat retrieved instructions as inert; validate claims, citations, URLs, and corpus version; apply approved input/output content safety; fail to unknown/refusal/fallback. |
| SECF-2026091803 | High | Browser identity to server session and future service adapters | Authenticate before session creation; authorize every event; bind short-lived resume tokens to identity/session/sequence; reject replay and cross-session IDs; require consequential-action confirmation; keep secrets and least-privilege RBAC server-side. |
| SECF-2026091804 | Medium | Rate, retry, dependency health, cost, and telemetry | Bound concurrency, duration, size, turns, output, reconnect, retry, and cost; propagate cancellation; expose liveness/readiness; circuit-break repeated failure; log only redacted correlation and operational fields. |

## Required Privacy Defaults

- Notice and consent precede microphone permission and any future cloud processing.
- Raw audio is never retained.
- Transcripts remain in the current session and are deleted at expiry unless a later explicit policy changes that default.
- Spoken responses are off until the user opts in for the current session.
- Routine logs exclude raw audio, transcripts, prompts, retrieved passages, responses, credentials, tokens, headers, and secret values.
- Informational turns may endpoint automatically; consequential actions always require explicit confirmation and authorization.

## Failure Posture

Injection, unsupported claims, unsafe content, stale grounding, invalid citations, expired session, replay, authorization failure, rate limit, health failure, retry exhaustion, or cost ceiling fail closed to correction, cancellation, explicit unknown/refusal, text fallback, guided fallback, reconnect, or stop. No failure path implies external authorization or consequential submission.

## Preserved Historical Finding

`SECF-0205` remains a medium-severity, high-confidence proven supply-chain weakness: independent human review is not enforced for source changes because only one write-capable collaborator exists. It is unrelated to LIVE-CHAT-001 and remains unchanged.

## Limits

No implementation, exploit, credential validation, network or Azure access, provider selection, external processing, commit, push, deployment, publication, or release occurred. Content-safety and AzureUSGovernment availability remain unknown pending later approval.