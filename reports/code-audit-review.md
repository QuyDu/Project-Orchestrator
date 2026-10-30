# Complete Local Code Audit Review

Audit: AUDIT-2026-10-29-B02206BB
Run: b02206bb-f6f7-42f6-9da7-3acceb241e3c
Baseline: fd46d377183ea7efdc41317e064bb731568a7719
Generated: 2026-10-29T18:15:14.046Z

Assurance: insufficient-evidence. This is not a security certification or formal release approval.

Eight behavior-backed findings are confirmed; all have security severity none because attacker exploitability was not established. Full committed-baseline gate: exit 1.

## Findings

### AUD-0147: Planning silently replaces a workflow that is waiting for approval

correctness; high confidence; security severity: none.

A committed-runtime plan command exited 0 and replaced a synthetic waiting-approval workflow with a new planned workflow, without an explicit supersession decision.

Impact: The pending approval and resume lineage disappear from the materialized state. This is a local state-integrity defect; no unauthorized external mutation was demonstrated.

Resolution: Read and reconcile the existing workflow/state before publication. Refuse nonterminal supersession by default; require an explicit operation-bound decision and append a valid transition when supersession is approved.

Evidence: pso.mjs, committed-baseline line 4096.

### AUD-0148: Planner emits new events that fail the shipped event schema

correctness; high confidence; security severity: none.

The new planner event lacks eventId, eventType, occurredAt, and payload and uses extra top-level fields that the shipped workflow-event schema does not accept.

Impact: Strict consumers cannot validate or replay newly planned workflows using the distributed schema. Existing legacy compatibility is not evidence that new invalid records are acceptable.

Resolution: Use a single trusted event constructor and validate before append. Put intent, step count, and state in the schema-defined payload; preserve legacy history unchanged.

Evidence: pso.mjs, committed-baseline line 4178.

### AUD-0149: Planner reuses event sequence numbers for accepted legacy history

reliability; high confidence; security severity: none.

Using an unchanged copy of accepted local history, the planner appended sequence 137 after an existing sequence 137. The accepted prefix was not changed; joined legacy records make physical lines differ from logical sequence numbers.

Impact: Replay and checkpoint ordering become ambiguous, and state can point to the wrong event. The reproduction uses committed code with copied accepted local history, including pending recovery evidence.

Resolution: Derive sequence from a validated event stream or verified legacy-prefix/suffix anchor, not newline counts. Refuse ambiguous history and coordinate append under a single event-store lock.

Evidence: pso.mjs, committed-baseline line 4172.

### AUD-0150: Failed inventory publication leaves a mixed report generation

reliability; high confidence; security severity: none.

A synthetic ownership collision caused inventory to exit 1 after replacing skill-inventory.json, skill-inventory.md, and skill-details.json, while preserving the previous skill-details.md and artifact-ownership.json.

Impact: Consumers can observe mutually inconsistent inventory, detail, and ownership evidence despite the command failing.

Resolution: Complete ownership and consistency validation before publishing. Stage the complete report set and provide recovery/rollback if any replacement fails; do not claim operating-system atomicity across multiple files.

Evidence: pso.mjs, committed-baseline line 3934.

### AUD-0151: Caller transcript metadata bypasses the aggregate input ceiling

correctness; high confidence; security severity: none.

The fake transport received two 5,000-character messages with transcriptChars: 0, although the configured aggregate ceiling is 8,000 characters.

Impact: Incorrect or adversarial caller metadata can exceed the intended request-size/cost guard. Public attacker reachability was not established, so this is not classified as an exploited security vulnerability.

Resolution: Always compute and validate the aggregate from messages, validate numeric limit configuration, and reject inconsistent optional counts before token acquisition or transport.

Evidence: templates/project/.skills-orchestrator/live-chat/server/provider-adapter.mjs, committed-baseline line 199.

### AUD-0152: Provider rate records retain completed sessions without a bound

resource-management; high confidence; security severity: none.

After 30 completed distinct sessions and advancing the injected clock by 24 hours, a new request left 31 session-rate records retained. Active identity records correctly returned to zero.

Impact: Memory grows with distinct session IDs over the adapter lifetime even after request completion. No throughput benchmark or remote denial-of-service exploitation was claimed.

Resolution: Add bounded expiry/eviction or explicit session disposal and review similar circuit bookkeeping. Avoid replacing one unbounded structure with unbounded per-entry timers.

Evidence: templates/project/.skills-orchestrator/live-chat/server/provider-adapter.mjs, committed-baseline line 159.

### AUD-0153: Retry telemetry reports one attempt after three transport attempts

operability; high confidence; security severity: none.

Two injected 503 responses followed by success invoked fetch three times, while provider.request telemetry reported attempts: 1.

Impact: Operational diagnostics understate retry pressure, latency causes, and transport work. This is an observability defect, not a demonstrated security vulnerability.

Resolution: Track attempts actually executed and emit the observed count rather than the configured maximum or a constant minimum expression.

Evidence: templates/project/.skills-orchestrator/live-chat/server/provider-adapter.mjs, committed-baseline line 220.

### AUD-0154: A stalled credential call outlives the request deadline and retains the identity slot

resource-management; high confidence; security severity: none.

With a deferred fake credential and a 5-ms deadline, the request was still pending after 35 ms and a follow-up on the identity failed concurrency-limited. It settled deadline-exceeded only after the credential was explicitly released.

Impact: An identity can remain blocked beyond its configured deadline during token-service stalls; cleanup is deferred until the unresolved await finishes.

Resolution: Make credential and other awaited pre-transport work cancellation-aware, including bounded settlement for noncooperative dependencies, and guarantee adapter-owned slot/timer cleanup.

Evidence: templates/project/.skills-orchestrator/live-chat/server/provider-adapter.mjs, committed-baseline line 216.

## Verification and Scope

79 JavaScript syntax checks and 13 PowerShell parser checks passed. Pinned offline Gitleaks initial scanning and receipt verification passed. Scanner-wrapper checks: 4 passed, 1 environment-dependent skip. The full gate is executed against committed HEAD in isolation, not the dirty original worktree.

Hosted GitHub settings/alerts, remote-only stores, current normative standards retrieval, semantic analyzers, cross-platform and live-provider qualification remain incomplete. The standards access date records local-profile inspection only; it is not fresh authoritative retrieval. Do not equate references, source scanning, or passing tests with complete conformance.

No code fix, dependency installation, cloud operation, commit, push, or accepted-history rewrite occurred. Remediation is pending explicit approval. Final secret-scan receipt verification must close the frozen findings/review/plan outputs; subsequent tracked publication requires a new explicit scan.
