# STEP-016 Regression Test Result

- Workflow: `WF-LIVE-CHAT-20260918`
- Step: `STEP-016`
- Sequence: `79`
- Status: **Passed with a local measurement boundary**

## Frozen Threshold Evaluation

Deterministic offline fixtures and injected fakes evaluated 16 metric groups: **16 passed, 0 failed,
and 0 unmeasured within the local contract**. No Azure, network, live inference, resource mutation, deployment, publication,
commit, or push occurred.

Passed: 900ms default endpoint; correction, cancellation, and late-event submission protection;
active citations; unknown, stale, and injection fallback; raw-audio null and session-only transcript;
cross-session and replay rejection; safety hooks and redacted telemetry; $0.10 session cost ceiling;
server-only credential/retry/deadline boundary; Government endpoint/model/API matrix, Speech fail-closed,
and Commercial rejection; permission-denied plus text/guided fallback; and the accessibility fixture.

Repaired and verified: idle and absolute session expiry; identity-bound concurrency; explicit turn IDs;
transcript and response ceilings; and circuit-breaker enforcement.

Measured locally: synthetic clean-speech, short-pause, and noise endpoint fixtures produced zero
false endpoints; local transition timing measured P95 6ms against the 500ms fallback threshold.
These measurements do not represent microphone-device false-endpoint rates or live provider latency.

Focused Live Chat evaluation and contract tests passed 20/20. Neighboring suites, `node pso.mjs verify`,
and `git diff --check` passed. `npm run check` passed with 189 tests: 188 passed, 0 failed, and 1
expected skip. The provider-adapter suite is now included in both standard npm gates.

## Prior Red Evidence

All five confirmed findings reproduced before their fixes. A persisted fork caused duplicate report
producer errors on an unrelated second update; an unknown lock-entry field was accepted; `--mdoe`
silently defaulted update mode; an extra local package member remained canonical after fork; and the
repository guide-binding test observed stale guide and Project Understanding hashes.

## Green Evidence

The focused five-test updater selection passed 5/5 after syntax validation. The three neighboring
suites passed 80/80: adoption/update 66/66, security fuzz 12/12, and documentation builder 2/2.
The documentation-builder validator accepted the existing approved guide and synchronized evidence.

The clean full gate passed 189 tests with 188 passes, 0 failures, and 1 expected platform skip; security
and release verification passed, and the repository inventoried, audited, and distribution-verified
all 48 skills.

## Result

Persisted fork ownership now survives later applies. Runtime lock validation fails closed on malformed
shape, scope, policy, ownership, references, paths, and digests before planning or apply mutation.
Update rejects unknown options before mode fallback. Fork transactions preserve the complete local
package, restore canonical content exactly from upstream, and roll back the full package directory.
The approved project guide was not regenerated; its evidence binding was synchronized and is now gated.

## LIVE-CHAT-001 Local Evidence

- STEP-006 red: 8 focused Live Chat tests failed before implementation because the governed skill and template assets were absent.
- STEP-006 green: 26 tests passed across skill contracts, reducer, grounding, security, and disposable generated-project fixture.
- Local generators passed: inventory discovered and audited 48 skills; Project Understanding scanned 379 files.
- Cloud access: none. No Azure discovery, model or Speech selection, external processing, provisioning, deployment, publication, commit, or push occurred.

## STEP-011 Final Local Gate

- `node --check pso.mjs`: passed.
- Focused Live Chat tests: 10 passed, 0 failed, 0 skipped.
- Neighboring suites: passed.
- `node pso.mjs verify`: passed; 48 skills inventoried and audited.
- `npm run check`: passed with exit code 0.
- `git diff --check`: passed with no output.
- No local security findings; no cloud access occurred.

## State Boundary

Workflow state remains current step 12 with last completed step 11 and last sequence 46.
`reports/current-execution-state.json`, its Markdown view, and `reports/execution-log.jsonl` were not
edited by this remediation. No commit, push, fetch, network, Azure, deployment, or publication action
was performed.

## Review Readiness

The local measurement update is complete. Do not claim device microphone or live provider performance
until separately approved instrumentation and execution evidence exist.
