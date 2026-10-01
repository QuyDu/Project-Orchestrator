# Code Audit Review

Audit run: `b9be041a-c060-4172-b294-67b388b84ba6`. Generated: 2026-09-30T23:30:23.237Z.

**45 confirmed findings; one scope-dependent integrity candidate needs more evidence.** Security classification: 3 medium, 4 low, no confirmed critical/high. Non-security defects are not inflated into vulnerabilities.

**Assurance: insufficient-evidence. No remediation performed.** This reviews the current dirty worktree, not only its HEAD commit. The dedicated deployment source review was blocked; hosted/standards/advisory/live coverage remains unavailable.

[Authoritative review](code-audit-review.json) | [Source findings](code-audit-findings.json) | [Remediation plan](audit-remediation-plan.md)

## Validation and scope

- Before audit report publication, the identical-source full gate had **454 passed, 0 failed, 1 skipped**; 50 skills verified, 376 security-check files and 232 checksum-covered unsigned candidate files.
- **Current post-report integration: 38 passed, 1 failed, 1 skipped.** The checkpoint cannot buffer the complete Git diff (AUD-0146). The final repository gate is not claimed green.
- Initial long-path run failed 15 PowerShell-loading cases. Short-path control and the full rerun passed without source or execution-policy changes; both logs are retained in private run evidence.
- The earlier pinned Gitleaks 8.30.1 scan found zero issues in its local scopes. **Closing scanning is blocked by AUD-0146.** The retained [pre-report scan](gitleaks-scan.json) is not current post-publication evidence; no scan gate or scope was bypassed.
- Standalone PowerShell parsing found no syntax errors in 13 files. Missing specialist analyzers, deployment source review and external controls are not marked passed.
- Synthetic fault/transport/process probes establish stated mechanisms, not actual cloud actions, disk failures, final publication, malware execution or live credential exposure.

## Findings, ordered by security severity and priority

| ID | Review status | Security | Priority | Finding |
|---|---|---|---|---|
| AUD-0106 | confirmed | medium | P1 | Declared provider response-token ceiling is not enforced |
| AUD-0128 | confirmed | medium | P1 | Pinned FFmpeg executes before its integrity check |
| AUD-0121 | confirmed | medium | P2 | Checksum symlink target is read and echoed before link rejection |
| AUD-0115 | confirmed | low | P2 | Native source comments bypass credential-material checks |
| AUD-0116 | confirmed | low | P2 | Classic validation echoes credential-bearing rejected values |
| AUD-0137 | confirmed | low | P2 | Private profile storage is accepted despite effective Git ignore negation |
| AUD-0138 | confirmed | low | P2 | Rejected sensitive-looking profile content is copied into diagnostics |
| AUD-0110 | confirmed | none | P1 | Pre-write failure can delete the existing agent |
| AUD-0111 | confirmed | none | P1 | Native build overwrites an input spec that aliases an output |
| AUD-0122 | confirmed | none | P1 | Adoption rollback leaves the newly written baseline lock |
| AUD-0129 | confirmed | none | P1 | Failed rerender removes artifacts owned by an earlier invocation |
| AUD-0130 | confirmed | none | P1 | Incomplete rollback deletes the remaining recovery backups |
| AUD-0131 | confirmed | none | P1 | Failed MP4 publication leaves a mixed-generation artifact set |
| AUD-0146 | confirmed | none | P1 | Checkpoint collection fails when a legitimate Git diff exceeds one MiB |
| AUD-0101 | confirmed | none | P2 | Final transcripts submit the preceding interim text |
| AUD-0102 | confirmed | none | P2 | New conversation turns append to the prior response |
| AUD-0103 | confirmed | none | P2 | Late microphone permission completion reverses cancellation |
| AUD-0104 | confirmed | none | P2 | Malformed grounding manifests throw before the safe fallback |
| AUD-0105 | confirmed | none | P2 | Rate-limited requests permanently consume an identity concurrency slot |
| AUD-0107 | confirmed | none | P2 | Streaming decoder corrupts UTF-8 characters split across chunks |
| AUD-0108 | confirmed | none | P2 | Publishing audit evidence invalidates the secret-scan binding it certifies |
| AUD-0109 | confirmed | none | P2 | Cleanup derives a different resource group for supported long project names |
| AUD-0112 | confirmed | none | P2 | Classic apply interprets an explicit negative risk value as approval |
| AUD-0113 | confirmed | none | P2 | Classic result-persistence failure leaves the new agent installed |
| AUD-0114 | confirmed | none | P2 | Native parser treats ambiguous implicit scalars as validated text |
| AUD-0117 | confirmed | none | P2 | Complete push handoff accepts blocked or missing draft approval |
| AUD-0118 | confirmed | none | P2 | Cycle detection misses ordinary YAML agent-list formats |
| AUD-0123 | confirmed | none | P2 | Scaffold apply selects Launch Pad content instead of the hashed template |
| AUD-0124 | confirmed | none | P2 | Safe-all accepts local-only edits then rolls back while verifying them |
| AUD-0125 | confirmed | none | P2 | Profile validation blocks additive restoration of required skills |
| AUD-0126 | confirmed | none | P2 | Legacy update plans omit required source provenance metadata |
| AUD-0127 | confirmed | none | P2 | Candidate freshness ignores added and deleted shipped sources |
| AUD-0132 | confirmed | none | P2 | Header-only invalid PNGs pass automated image qualification |
| AUD-0134 | confirmed | none | P2 | Plan parsing and hashing can bind different file revisions |
| AUD-0135 | confirmed | none | P2 | The emitted third voice profile is rejected by four owned schemas |
| AUD-0136 | confirmed | none | P2 | Selected-SKU quota falls back to another SKU's capacity |
| AUD-0139 | confirmed | none | P2 | Future sync timestamps are reported healthy |
| AUD-0140 | confirmed | none | P2 | Documentation promotes planned items into verified claims |
| AUD-0141 | confirmed | none | P2 | Empty understanding Markdown bypasses its digest check |
| AUD-0142 | confirmed | none | P2 | Documentation build publishes new verified guides from stale source snapshots |
| AUD-0143 | confirmed | none | P2 | Media response caps are enforced only after full body buffering |
| AUD-0119 | confirmed | none | P3 | Boolean solution name passes runtime but violates emitted schema |
| AUD-0120 | confirmed | none | P3 | Partial initial lock write leaves an orphan project lock |
| AUD-0133 | needs-more-evidence | none | P3 | Preliminary image verifier does not compare the recorded artifact hash |
| AUD-0144 | confirmed | none | P3 | A flat directory bypasses the repository file-count limit |
| AUD-0145 | confirmed | none | P3 | Default opted-in MCP services violate the environment schema |

## AUD-0106: Declared provider response-token ceiling is not enforced

Status: **confirmed**. Security: **medium**. Confidence: **high**.

Evidence: [templates/project/.skills-orchestrator/live-chat/server/provider-adapter.mjs:165](../templates/project/.skills-orchestrator/live-chat/server/provider-adapter.mjs#L165); [templates/project/.skills-orchestrator/live-chat/server/provider-adapter.mjs:184](../templates/project/.skills-orchestrator/live-chat/server/provider-adapter.mjs#L184); [templates/project/.skills-orchestrator/live-chat/server/provider-adapter.mjs:88](../templates/project/.skills-orchestrator/live-chat/server/provider-adapter.mjs#L88)

**Observed:** responseTokens is range-checked but neither it nor maxResponseTokens is sent in the provider payload; the payload contains only messages and stream. Streaming output and pending line data are accumulated without an enforced response-size ceiling. A fake response returned 24,000 characters despite a configured/requested two-token ceiling.

**Expected:** Send a model-compatible provider output limit and enforce a bounded streaming byte/character budget locally, cancelling excessive output and releasing the transport.

**Impact:** A downstream application relying on the advertised ceiling can incur output costs and retain memory beyond its approved limit. A user-controlled prompt or unexpectedly large provider stream can exercise the path; the endpoint is trusted but output volume is not bounded by this adapter.

**Resolution:** Enforce a provider-supported output token option and local streaming bounds at the single server adapter, with cancellation and resource cleanup when exceeded. Validate budget inputs as finite nonnegative values.

**Containment recommendation (not executed):** Do not rely on this opt-in server scaffold as the sole production output/cost boundary. Keep live use gated until independently enforced provider and stream limits are verified.

**Verification:**
- Capture the outgoing fake request and assert the configured model-compatible limit; stream oversized unterminated lines and excessive deltas and verify bounded failure before accumulation or further yields.

**Review rationale:** Confirmed root cause and stated consequence are supported by the exact current source and persisted deterministic reproduction. Trust-boundary, fault-injection and live/physical-platform limits are preserved. No severity or confidence was silently changed, and no external citation was invented.

**Limits:** No live provider invocation or actual charge occurred; the exact accepted model parameter must be verified during remediation. The adapter is an opt-in server scaffold, not a deployed endpoint. Private session reproduction (b9be041a-c060-4172-b294-67b388b84ba6): live-chat-reproduction.mjs: response-budget. Source-body/injected-boundary results establish the stated mechanism, not live provider qualification.

## AUD-0128: Pinned FFmpeg executes before its integrity check

Status: **confirmed**. Security: **medium**. Confidence: **high**.

Evidence: [.github/skills/project-video/scripts/project-video.mjs:1292](../.github/skills/project-video/scripts/project-video.mjs#L1292); [.github/skills/project-video/scripts/project-video.mjs:1317](../.github/skills/project-video/scripts/project-video.mjs#L1317)

**Observed:** locateFfmpeg launches the isolated binary with -version before reading and checking renderer-manifest.json. A modified binary was launched by the reproduction spy, then rejected for its digest.

**Expected:** Reject untrusted or modified pinned binaries before any execution, including a version probe.

**Impact:** The integrity gate cannot prevent execution of a substituted renderer with the operator's privileges.

**Resolution:** Validate the pinned manifest, approved binary digest, and safe file identity before invoking the executable; do not silently substitute another renderer for a rejected explicit choice.

**Containment recommendation (not executed):** Do not execute an unverified or suspected modified renderer, including a -version probe. Verify trusted provenance and bytes before use; rendering approval is not approval to run substituted code.

**Verification:**
- Replace only the pinned binary while retaining the approved manifest; assert rejection and zero process launches.
- Cover missing and invalid manifests before the version probe.

**Review rationale:** Confirmed root cause and stated consequence are supported by the exact current source and persisted deterministic reproduction. Trust-boundary, fault-injection and live/physical-platform limits are preserved. No severity or confidence was silently changed, and no external citation was invented.

**Limits:** The attacker controls the renderer artifact, not the trusted helper or approved digest. The reproduction uses an execution spy, not malicious native code. This is a local execution-integrity boundary failure, not a demonstrated remote exploit or privilege escalation. Likelihood preconditions: Conditional: an attacker must replace the isolated renderer/cache executable before the operator invokes an independently approved render. Private session reproduction (b9be041a-c060-4172-b294-67b388b84ba6): helpers-repro-results.json: renderer-executed-before-integrity. Source-body/injected-boundary results establish the stated mechanism, not live provider qualification.

## AUD-0121: Checksum symlink target is read and echoed before link rejection

Status: **confirmed**. Security: **medium**. Confidence: **high**.

Evidence: [scripts/verify-release.mjs:30](../scripts/verify-release.mjs#L30)

**Observed:** Original verifier/path-guard bodies followed the modeled link and emitted the synthetic canary in an error before any artifact directory walk.

**Expected:** Reject the linked manifest before reading its target and never include raw manifest data in validation errors.

**Impact:** Potential first-line disclosure of an unrelated readable file into verifier errors or CI/support logs. No race, real credential, or live-secret access was used in the probe.

**Resolution:** Check the manifest leaf and every input path before reading; report line numbers or rule IDs instead of raw line contents.

**Containment recommendation (not executed):** Use only independently trusted candidate directories pending the fix; do not run the verifier on a suspicious linked manifest or redistribute raw invalid-manifest diagnostics.

**Verification:**
- Add platform-supported physical symlink tests and assert rejection before target read plus redacted error output.

**Review rationale:** Confirmed root cause and stated consequence are supported by the exact current source and persisted deterministic reproduction. Trust-boundary, fault-injection and live/physical-platform limits are preserved. No severity or confidence was silently changed, and no external citation was invented.

**Limits:** An untrusted candidate contains a SHA256SUMS symlink to a readable external file; its first line is not a checksum entry. Anyone receiving verifier stderr may receive that line. Private session reproduction (b9be041a-c060-4172-b294-67b388b84ba6): {"artifact":"runtime-release-results.json","probe":"RT-01","status":"reproduced","physicalFilesystemTest":false}. Source-body/injected-boundary results establish the stated mechanism, not live provider qualification.

## AUD-0115: Native source comments bypass credential-material checks

Status: **confirmed**. Security: **low**. Confidence: **high**.

Evidence: [.github/skills/agent-builder/scripts/native-studio.mjs:218](../.github/skills/agent-builder/scripts/native-studio.mjs#L218); [.github/skills/agent-builder/scripts/native-studio.mjs:314](../.github/skills/agent-builder/scripts/native-studio.mjs#L314); [.github/skills/agent-builder/scripts/native-studio.mjs:581](../.github/skills/agent-builder/scripts/native-studio.mjs#L581); [.github/skills/agent-builder/scripts/native-studio.mjs:709](../.github/skills/agent-builder/scripts/native-studio.mjs#L709)

**Observed:** Build/apply/validate pass and a runtime-generated synthetic canary remains in canonical source; placing it in activity text blocks preparation.

**Expected:** Reject suspected credential material before copying it into generated portable artifacts.

**Impact:** Potential credential propagation into generated source; external disclosure was not demonstrated.

**Resolution:** Inspect bounded raw source bytes, including comments, before copying while preserving originals and sanitized errors.

**Containment recommendation (not executed):** Keep credential or private material out of authored input/comments, and do not share raw failing diagnostics. Any real exposure requires a separately authorized response; this audit found no live secret.

**Verification:**
- Generate canaries only at runtime, compare preserved/echoed booleans, and never record their values; require comment and scalar controls to block.

**Review rationale:** Confirmed root cause and stated consequence are supported by the exact current source and persisted deterministic reproduction. Trust-boundary, fault-injection and live/physical-platform limits are preserved. No severity or confidence was silently changed, and no external citation was invented.

**Limits:** An authored topic inadvertently contains credential-shaped material in a YAML comment. No live credential or external transmission was used. Persisted evidence contains only canary-preserved/echoed booleans. Private session reproduction (b9be041a-c060-4172-b294-67b388b84ba6): {"runner":"builder-probes.mjs","group":"native","cases":["AB-06-comment","native-secret-activity-control"],"results":"builder-native-results.json"}. Source-body/injected-boundary results establish the stated mechanism, not live provider qualification.

## AUD-0116: Classic validation echoes credential-bearing rejected values

Status: **confirmed**. Security: **low**. Confidence: **high**.

Evidence: [.github/skills/agent-builder/scripts/agent-builder.mjs:192](../.github/skills/agent-builder/scripts/agent-builder.mjs#L192); [.github/skills/agent-builder/scripts/agent-builder.mjs:317](../.github/skills/agent-builder/scripts/agent-builder.mjs#L317); [.github/skills/agent-builder/scripts/agent-builder.mjs:404](../.github/skills/agent-builder/scripts/agent-builder.mjs#L404); [.github/skills/agent-builder/scripts/agent-builder.mjs:57](../.github/skills/agent-builder/scripts/agent-builder.mjs#L57)

**Observed:** The unchanged main/fail path prints the generated synthetic canary in captured CLI diagnostics; the instruction-text control rejects without echoing it.

**Expected:** Reject using a field-specific diagnostic without echoing the untrusted value.

**Impact:** Accidental secret-bearing malformed input can enter terminal or agent transcripts.

**Resolution:** Remove untrusted-value interpolation from diagnostics and retain field locations plus safe allowed-value descriptions.

**Containment recommendation (not executed):** Keep credential or private material out of authored input/comments, and do not share raw failing diagnostics. Any real exposure requires a separately authorized response; this audit found no live secret.

**Verification:**
- Exercise main and fail, capture output in memory, and persist only rejected/echoed booleans.

**Review rationale:** Confirmed root cause and stated consequence are supported by the exact current source and persisted deterministic reproduction. Trust-boundary, fault-injection and live/physical-platform limits are preserved. No severity or confidence was silently changed, and no external citation was invented.

**Limits:** Credential-shaped input occurs in an invalid capability or subagent identifier. No canary value, raw credential-like diagnostic, live credential, or external transmission is recorded. Private session reproduction (b9be041a-c060-4172-b294-67b388b84ba6): {"runner":"builder-probes.mjs","group":"public","cases":["AB-07-cli-diagnostic"],"results":"builder-public-results.json"}. Source-body/injected-boundary results establish the stated mechanism, not live provider qualification.

## AUD-0137: Private profile storage is accepted despite effective Git ignore negation

Status: **confirmed**. Security: **low**. Confidence: **high**.

Evidence: [.github/skills/user-personalization/scripts/user-personalization.mjs:229](../.github/skills/user-personalization/scripts/user-personalization.mjs#L229); [.github/skills/user-personalization/scripts/user-personalization.mjs:247](../.github/skills/user-personalization/scripts/user-personalization.mjs#L247)

**Observed:** The public profile status command reports valid when a recognized ignore rule is followed by a cancelling negation. Real git check-ignore reports the same rules do not ignore the target; the positive control does.

**Expected:** Claim ignored private storage only after verifying effective ignore behavior and absence from the Git index.

**Impact:** Private personalization can become eligible for later broad staging and publication despite the helper claiming its storage prerequisite passed.

**Resolution:** Use effective Git ignore and tracked-index checks, covering target and transaction sibling paths; fail closed for contradictory storage rules.

**Containment recommendation (not executed):** Before storing private profiles, inspect effective Git ignore and tracked status, not only pattern text. Do not stage or publish profile/transaction files.

**Verification:**
- Use real Git with positive and negated ignore rules and compare the public helper result.
- Test already-tracked profiles, nested overrides, and exact-file rules that leave backup/partial files exposed.

**Review rationale:** Confirmed root cause and stated consequence are supported by the exact current source and persisted deterministic reproduction. Trust-boundary, fault-injection and live/physical-platform limits are preserved. No severity or confidence was silently changed, and no external citation was invented.

**Limits:** Repository-controlled ignore policy is less trusted than the user's expectation of private local profile storage. Apply/status alone does not publish the profile. The corroboration uses actual Git rule evaluation in an explicit session worktree with --no-index and optional locks disabled; repository metadata is read-only. The unchanged public profile CLI consumes identical rules through a virtual .gitignore, not an on-disk target project. Likelihood preconditions: Conditional: repository rules negate the recognized line, a nested override applies, or the target is already tracked; a later staging/publication action is needed for exposure. Private session reproduction (b9be041a-c060-4172-b294-67b388b84ba6): helpers-corroboration-results.json: profile-public-status-versus-git-ignore. Source-body/injected-boundary results establish the stated mechanism, not live provider qualification.

## AUD-0138: Rejected sensitive-looking profile content is copied into diagnostics

Status: **confirmed**. Security: **low**. Confidence: **high**.

Evidence: [.github/skills/user-personalization/scripts/user-personalization.mjs:85](../.github/skills/user-personalization/scripts/user-personalization.mjs#L85); [.github/skills/user-personalization/scripts/user-personalization.mjs:178](../.github/skills/user-personalization/scripts/user-personalization.mjs#L178); [.github/skills/user-personalization/scripts/user-personalization.mjs:220](../.github/skills/user-personalization/scripts/user-personalization.mjs#L220); [.github/skills/user-personalization/scripts/user-personalization.mjs:324](../.github/skills/user-personalization/scripts/user-personalization.mjs#L324)

**Observed:** An unsupported list item is interpolated verbatim into an error before sensitive-content screening. Malformed JSON errors also retain parser-supplied input fragments. Status/main expose those messages.

**Expected:** Reject invalid profile data using value-free diagnostics that do not copy private or sensitive-looking content to output.

**Impact:** Private candidate/profile content can move into terminal, agent, or CI logs even when validation rejects persistence.

**Resolution:** Remove raw values from diagnostics and replace JSON parser messages with sanitized location/type errors; ensure rejected content never reaches summary or stderr.

**Containment recommendation (not executed):** Keep credential or private material out of authored input/comments, and do not share raw failing diagnostics. Any real exposure requires a separately authorized response; this audit found no live secret.

**Verification:**
- Assert synthetic diagnostic canaries are absent from all public outputs for malformed JSON and each unsupported-list field.
- Test both validate/apply failures and status on invalid stored profiles.

**Review rationale:** Confirmed root cause and stated consequence are supported by the exact current source and persisted deterministic reproduction. Trust-boundary, fault-injection and live/physical-platform limits are preserved. No severity or confidence was silently changed, and no external citation was invented.

**Limits:** Only synthetic canaries were used; saved evidence and tool diagnostics record disclosure booleans, not canary values. No live credential or actual private profile was inspected or disclosed. Likelihood preconditions: Conditional: a user supplies malformed or misplaced confidential content in a candidate or existing profile. Private session reproduction (b9be041a-c060-4172-b294-67b388b84ba6): helpers-repro-results.json: profile-enum-error-echo. Source-body/injected-boundary results establish the stated mechanism, not live provider qualification.

## AUD-0110: Pre-write failure can delete the existing agent

Status: **confirmed**. Security: **none**. Confidence: **high**.

Evidence: [.github/skills/agent-builder/scripts/agent-builder.mjs:839](../.github/skills/agent-builder/scripts/agent-builder.mjs#L839); [.github/skills/agent-builder/scripts/agent-builder.mjs:859](../.github/skills/agent-builder/scripts/agent-builder.mjs#L859)

**Observed:** The real controlling catch calls rm(target) before any target replacement. All three injections leave the target absent; failed backup restoration additionally changes EIO to ENOENT.

**Expected:** A pre-write failure preserves the current destination.

**Impact:** Loss of the original agent or a concurrent user edit during an unsuccessful update.

**Resolution:** Distinguish completed backup creation from actual target replacement and roll back only writes owned by this invocation.

**Containment recommendation (not executed):** Preserve independent copies of existing inputs, installed definitions, metadata and generated outputs; avoid replacement/rerender operations that exercise the failing path until the owner-approved repair is validated.

**Verification:**
- Inject failures at all three observed boundaries; assert original/current target bytes remain, no target rename occurred, and original errors are preserved.

**Review rationale:** Confirmed root cause and stated consequence are supported by the exact current source and persisted deterministic reproduction. Trust-boundary, fault-injection and live/physical-platform limits are preserved. No severity or confidence was silently changed, and no external citation was invented.

**Limits:** A valid reviewed classic update; a concurrent save after lock creation, transaction-directory EACCES, or backup-copy EIO. Filesystem errors are narrowly injected into an in-memory regular-file model, not induced on a physical disk. The success control and recorded boundary events distinguish product cleanup from instrumentation. Private session reproduction (b9be041a-c060-4172-b294-67b388b84ba6): {"runner":"builder-probes.mjs","group":"classic","cases":["AB-01-post-lock-drift","AB-01-mkdir-denied","AB-01-copy-failure"],"results":"builder-classic-results.json"}. Source-body/injected-boundary results establish the stated mechanism, not live provider qualification.

## AUD-0111: Native build overwrites an input spec that aliases an output

Status: **confirmed**. Security: **none**. Confidence: **high**.

Evidence: [.github/skills/agent-builder/scripts/native-studio.mjs:852](../.github/skills/agent-builder/scripts/native-studio.mjs#L852); [.github/skills/agent-builder/scripts/native-studio.mjs:732](../.github/skills/agent-builder/scripts/native-studio.mjs#L732); [.github/skills/agent-builder/scripts/native-studio.mjs:890](../.github/skills/agent-builder/scripts/native-studio.mjs#L890)

**Observed:** Build returns review-required but overwrites the spec; apply then rejects the changed spec digest.

**Expected:** Reject the collision before output writes and preserve the reviewed input.

**Impact:** The original specification is lost and the just-produced review cannot be applied.

**Resolution:** Preflight canonical input/output aliases, including Windows case-insensitive aliases, before PAC or artifact writes.

**Containment recommendation (not executed):** Preserve independent copies of existing inputs, installed definitions, metadata and generated outputs; avoid replacement/rerender operations that exercise the failing path until the owner-approved repair is validated.

**Verification:**
- Exercise both spec aliases and authored-input aliases; reject without changing any input or existing output.

**Review rationale:** Confirmed root cause and stated consequence are supported by the exact current source and persisted deterministic reproduction. Trust-boundary, fault-injection and live/physical-platform limits are preserved. No severity or confidence was silently changed, and no external citation was invented.

**Limits:** A valid native spec is selected from reports/agent-blueprints/native-reviewer.json or reports/agent-builder-plan.json. Current public native driver executed unchanged with virtual filesystem and fake PAC only. Private session reproduction (b9be041a-c060-4172-b294-67b388b84ba6): {"runner":"builder-probes.mjs","group":"native","cases":["AB-02-blueprint-alias","AB-02-plan-alias"],"results":"builder-native-results.json"}. Source-body/injected-boundary results establish the stated mechanism, not live provider qualification.

## AUD-0122: Adoption rollback leaves the newly written baseline lock

Status: **confirmed**. Security: **none**. Confidence: **high**.

Evidence: [pso.mjs:625](../pso.mjs#L625); [pso.mjs:3801](../pso.mjs#L3801)

**Observed:** Injected EIO at adoption-verification.json yielded journal status rolled-back, restored the old manifest, retained the new unjournaled lock, and caused the next update to reject mismatching manifest/lock identities.

**Expected:** Restore the complete original manifest/lock pair, or remove the new lock if none previously existed.

**Impact:** A reportedly rolled-back project retains inconsistent provenance and cannot use normal updates until the baseline pair is repaired.

**Resolution:** Journal the baseline lock and all unconditionally written metadata before any adoption mutation.

**Containment recommendation (not executed):** Preserve independent copies of existing inputs, installed definitions, metadata and generated outputs; avoid replacement/rerender operations that exercise the failing path until the owner-approved repair is validated.

**Verification:**
- Inject failure after the lock write and interrupt at the same point; verify byte-exact pair restoration and successful subsequent update planning.

**Review rationale:** Confirmed root cause and stated consequence are supported by the exact current source and persisted deterministic reproduction. Trust-boundary, fault-injection and live/physical-platform limits are preserved. No severity or confidence was silently changed, and no external citation was invented.

**Limits:** An adoption changes installed-source identity and fails after its lock write, such as a final verification-report I/O failure. Private session reproduction (b9be041a-c060-4172-b294-67b388b84ba6): {"artifact":"runtime-update-results.json","probe":"RT-02","status":"reproduced","injection":"Only writeFile for the final reports/adoption-verification.json raises EIO; other virtual writes succeed."}. Source-body/injected-boundary results establish the stated mechanism, not live provider qualification.

## AUD-0129: Failed rerender removes artifacts owned by an earlier invocation

Status: **confirmed**. Security: **none**. Confidence: **high**.

Evidence: [.github/skills/project-visual-storytelling/scripts/project-visual-storytelling.mjs:269](../.github/skills/project-visual-storytelling/scripts/project-visual-storytelling.mjs#L269); [.github/skills/project-visual-storytelling/scripts/azure-openai-image-render.mjs:152](../.github/skills/project-visual-storytelling/scripts/azure-openai-image-render.mjs#L152)

**Observed:** renderRun removes the candidate image and qualification report on any generation error, including EEXIST. The reproduction removed both earlier artifacts although the failing invocation created neither.

**Expected:** A failed invocation must preserve previously existing results and clean only files it created.

**Impact:** A rerun, transport failure, or competing renderer can destroy an earlier paid-for candidate and its evidence.

**Resolution:** Preflight existing outputs before external work, reserve the run, stage unique files, and remove only invocation-owned creations on failure.

**Containment recommendation (not executed):** Preserve independent copies of existing inputs, installed definitions, metadata and generated outputs; avoid replacement/rerender operations that exercise the failing path until the owner-approved repair is validated.

**Verification:**
- Rerender a run with an existing image/report and inject EEXIST and transport failures; assert original bytes remain.
- Exercise two writers targeting one run and prevent loser cleanup from deleting winner outputs.

**Review rationale:** Confirmed root cause and stated consequence are supported by the exact current source and persisted deterministic reproduction. Trust-boundary, fault-injection and live/physical-platform limits are preserved. No severity or confidence was silently changed, and no external citation was invented.

**Limits:** Rendering itself is separately approved; approval does not implicitly authorize destructive cleanup of an earlier result. Filesystem and generation errors were injected in memory. Likelihood preconditions: Moderate: rerunning an existing run ID or overlapping renders reaches the same fixed paths. Private session reproduction (b9be041a-c060-4172-b294-67b388b84ba6): helpers-repro-results.json: visual-rerender-deletes-existing. Source-body/injected-boundary results establish the stated mechanism, not live provider qualification.

## AUD-0130: Incomplete rollback deletes the remaining recovery backups

Status: **confirmed**. Security: **none**. Confidence: **high**.

Evidence: [.github/skills/project-understanding/scripts/project-understanding.mjs:137](../.github/skills/project-understanding/scripts/project-understanding.mjs#L137); [.github/skills/project-video/scripts/project-video.mjs:197](../.github/skills/project-video/scripts/project-video.mjs#L197)

**Observed:** The understanding and browser-preview publication helpers unconditionally delete backups in finally. An injected publication error followed by restoration failure leaves neither the original pair nor its backups.

**Expected:** Preserve surviving backups and recovery evidence when rollback cannot complete.

**Impact:** Transient filesystem failures can turn a recoverable replacement failure into permanent loss of the previous complete publication.

**Resolution:** Distinguish committed, rolled-back, and recovery-required states; retain backups and aggregate failures unless restoration or commitment was verified.

**Containment recommendation (not executed):** Preserve independent copies of existing inputs, installed definitions, metadata and generated outputs; avoid replacement/rerender operations that exercise the failing path until the owner-approved repair is validated.

**Verification:**
- Fault-inject every publish, restore, and backup-cleanup step; incomplete rollback must leave recoverable originals.
- Reproduce both preview-rollback-destroys-backups and understanding-rollback-destroys-backups.

**Review rationale:** Confirmed root cause and stated consequence are supported by the exact current source and persisted deterministic reproduction. Trust-boundary, fault-injection and live/physical-platform limits are preserved. No severity or confidence was silently changed, and no external citation was invented.

**Limits:** The two call sites share the destructive cleanup pattern but require fixes at both owners. The reproduction establishes control flow with a memory filesystem, not an OS crash experiment. Likelihood preconditions: Conditional: publication and restoration or cleanup must fail; locking and permission failures make this plausible on real filesystems. Private session reproduction (b9be041a-c060-4172-b294-67b388b84ba6): helpers-repro-results.json: preview-rollback-destroys-backups. Source-body/injected-boundary results establish the stated mechanism, not live provider qualification.

## AUD-0131: Failed MP4 publication leaves a mixed-generation artifact set

Status: **confirmed**. Security: **none**. Confidence: **high**.

Evidence: [.github/skills/project-video/scripts/project-video.mjs:1969](../.github/skills/project-video/scripts/project-video.mjs#L1969); [.github/skills/project-video/scripts/project-video.mjs:2023](../.github/skills/project-video/scripts/project-video.mjs#L2023)

**Observed:** renderVideo replaces the MP4 and deletes the source directory before installing new source and writing its manifest. Injecting source installation failure left the new video, no source directory, and the old manifest.

**Expected:** Publish video, source artifacts, and integrity manifest as one recoverable generation.

**Impact:** Replacement failure loses prior output and leaves stale evidence describing different bytes.

**Resolution:** Stage the complete artifact set, retain old-generation backups, and use a durable commit/recovery point for all three outputs.

**Containment recommendation (not executed):** Preserve independent copies of existing inputs, installed definitions, metadata and generated outputs; avoid replacement/rerender operations that exercise the failing path until the owner-approved repair is validated.

**Verification:**
- Inject failures after MP4 installation and before source/manifest installation; preserve a complete old or new set with recoverable evidence.
- Verify every published manifest hash matches the installed output after recovery.

**Review rationale:** Confirmed root cause and stated consequence are supported by the exact current source and persisted deterministic reproduction. Trust-boundary, fault-injection and live/physical-platform limits are preserved. No severity or confidence was silently changed, and no external citation was invented.

**Limits:** The run has explicit render and replacement approval. Media operations and filesystem faults are faked; actual FFmpeg was not invoked. Likelihood preconditions: Moderate under disk, access, rename, or interruption failures during an approved replacement. Private session reproduction (b9be041a-c060-4172-b294-67b388b84ba6): helpers-repro-results.json: video-publication-failure-leaves-mixed-trio. Source-body/injected-boundary results establish the stated mechanism, not live provider qualification.

## AUD-0146: Checkpoint collection fails when a legitimate Git diff exceeds one MiB

Status: **confirmed**. Security: **none**. Confidence: **high**.

Evidence: [.github/skills/audit-code/scripts/audit-validate.mjs:177](../.github/skills/audit-code/scripts/audit-validate.mjs#L177); [.github/skills/audit-code/scripts/audit-evidence.mjs:129](../.github/skills/audit-code/scripts/audit-evidence.mjs#L129); [tests/skill-contracts.test.mjs:1313](../tests/skill-contracts.test.mjs#L1313)

**Observed:** gitBuffer invokes spawnSync without an explicit output policy. On the audited dirty worktree after its report chain is emitted, git diff --binary exceeds Node's default 1,048,576-byte buffer. The child returns status null, signal SIGTERM and error ENOBUFS; the actual positional checkpoint command fails and the native audit contract test receives helperValidity.checkpoint=false. An otherwise identical read-only Git control with a four-MiB diagnostic buffer succeeds and returns the complete diff.

**Expected:** Deterministically hash all in-scope diff bytes for supported worktrees using bounded streaming/spooling or an explicit documented output limit with an actionable diagnostic, without dropping findings, reports or source from the audited scope.

**Impact:** Ordinary large pending changes or a detailed audit's own reports prevent checkpoint creation, audit-evidence readiness and the pinned secret-scan wrapper from completing. The post-report regression fails even though the report schemas and their lineage validate.

**Resolution:** Use bounded incremental subprocess-output hashing or safe spooling, preserve the exact existing digest semantics, and report subprocess errors explicitly without echoing raw diff content. Treat an explicit resource ceiling as a documented failure condition, not an undocumented one-MiB default. Do not exclude audit reports or reduce findings to evade the defect.

**Verification:**
- Exercise the actual checkpoint command with tracked textual and binary diffs below, at and above one MiB; compare its successful digest against an independent complete-byte reference.
- Run audit-evidence and the pinned offline scanner against the large worktree and require valid metadata/checkpoint/digest results.
- Run the post-report audit/contract suites with the complete current findings, review and plan, preserving all IDs and evidence.
- Inject a real subprocess failure and confirm an actionable sanitized diagnostic rather than truncated output or a success-shaped fallback.

**Review rationale:** Confirmed root cause and stated consequence are supported by the exact current source and persisted deterministic reproduction. Trust-boundary, fault-injection and live/physical-platform limits are preserved. No severity or confidence was silently changed, and no external citation was invented.

**Limits:** Reproduced on the actual current repository and unmodified public checkpoint CLI; no source, Git configuration, staging or history was changed. The four-MiB Git invocation is a diagnostic control only, not a substitute completed checkpoint or a bypass of a required scan gate. An earlier diagnostic invocation mistakenly supplied --root to this positional command; that usage error is excluded from evidence. This is a local reliability/operability defect, not a demonstrated credential disclosure or remote exploit. Private session reproduction (b9be041a-c060-4172-b294-67b388b84ba6): checkpoint-buffer-reproduction.mjs and post-report-tests.log. Source-body/injected-boundary results establish the stated mechanism, not live provider qualification.

## AUD-0101: Final transcripts submit the preceding interim text

Status: **confirmed**. Security: **none**. Confidence: **high**.

Evidence: [templates/project/.skills-orchestrator/live-chat/conversation-state.mjs:25](../templates/project/.skills-orchestrator/live-chat/conversation-state.mjs#L25); [templates/project/.skills-orchestrator/live-chat/conversation-state.mjs:43](../templates/project/.skills-orchestrator/live-chat/conversation-state.mjs#L43)

**Observed:** TRANSCRIPT_FINAL calls withSubmission(state, ...) before applying event.text. The pending submission therefore contains the previous interim transcript or an empty string. A local reproduction used interim 'Delete the old record', final 'Keep the old record', then confirmation; transcript displayed the final text while pendingSubmission.text retained the interim text.

**Expected:** The submission awaiting acceptance or confirmation must contain the exact final transcript that the user sees, including final-only and corrected-final recognition events.

**Impact:** Consumers reading pendingSubmission can submit a different or empty request from the displayed text. Consequential-intent confirmation cannot establish the intended content. The shipped local reducer does not itself execute destructive actions, so this is not claimed as a demonstrated remote authorization exploit.

**Resolution:** Apply and validate the final text before constructing pendingSubmission; make confirmation bind to the same immutable final text.

**Verification:**
- Add a final-only event test proving pendingSubmission.text equals the final transcript.
- Add differing interim/final and corrected consequential-turn cases, and assert the confirmed payload rather than only status and submitCount.

**Review rationale:** Confirmed root cause and stated consequence are supported by the exact current source and persisted deterministic reproduction. Trust-boundary, fault-injection and live/physical-platform limits are preserved. No severity or confidence was silently changed, and no external citation was invented.

**Limits:** Confirmed with a pure local reducer reproduction; no consumer-side remote operation was executed. Private session reproduction (b9be041a-c060-4172-b294-67b388b84ba6): live-chat-reproduction.mjs: final-transcript. Source-body/injected-boundary results establish the stated mechanism, not live provider qualification.

## AUD-0102: New conversation turns append to the prior response

Status: **confirmed**. Security: **none**. Confidence: **high**.

Evidence: [templates/project/.skills-orchestrator/live-chat/conversation-state.mjs:40](../templates/project/.skills-orchestrator/live-chat/conversation-state.mjs#L40); [templates/project/.skills-orchestrator/live-chat/conversation-state.mjs:52](../templates/project/.skills-orchestrator/live-chat/conversation-state.mjs#L52)

**Observed:** RESPONSE_COMPLETE leaves response intact and START_LISTENING clears only transcript/pendingSubmission. RESPONSE_DELTA concatenates onto the retained response. Two normal turns produce 'First answer.Second answer.' as the second turn's response.

**Expected:** A fresh request should have its own response buffer while any intended conversation history is maintained separately.

**Impact:** The UI or speech consumer receives duplicated/misattributed answers and can speak an earlier answer again.

**Resolution:** Reset the per-turn response buffer at the start of a newly accepted turn without discarding intentional historical messages.

**Verification:**
- Run two complete turns and assert the second response contains only its deltas; retain cancellation and half-duplex assertions.

**Review rationale:** Confirmed root cause and stated consequence are supported by the exact current source and persisted deterministic reproduction. Trust-boundary, fault-injection and live/physical-platform limits are preserved. No severity or confidence was silently changed, and no external citation was invented.

**Limits:** This is turn isolation within one local session, not a demonstrated cross-user leak. Private session reproduction (b9be041a-c060-4172-b294-67b388b84ba6): live-chat-reproduction.mjs: response-turn-state. Source-body/injected-boundary results establish the stated mechanism, not live provider qualification.

## AUD-0103: Late microphone permission completion reverses cancellation

Status: **confirmed**. Security: **none**. Confidence: **high**.

Evidence: [templates/project/.skills-orchestrator/live-chat/browser-controller.mjs:3](../templates/project/.skills-orchestrator/live-chat/browser-controller.mjs#L3); [templates/project/.skills-orchestrator/live-chat/conversation-state.mjs:36](../templates/project/.skills-orchestrator/live-chat/conversation-state.mjs#L36)

**Observed:** requestPermission awaits getUserMedia with no cancellation generation check. After cancel dispatches CANCEL, a delayed successful request dispatches GRANT_CONSENT; the reducer explicitly accepts that event and resets cancelled=false/status=idle.

**Expected:** A cancelled permission attempt must stop returned tracks but ignore its late consent completion; only a new explicit request may resume the conversation.

**Impact:** The visible cancellation state is undone after the user cancels. This contradicts the skill's stated late-event invariant and permits unintended state resumption; it does not bypass the browser's own permission prompt.

**Resolution:** Fence permission attempts with a request generation or cancellation marker and suppress stale completion dispatches while still releasing tracks.

**Verification:**
- Use a deferred getUserMedia fake, cancel before resolution/rejection, and verify cancelled state is retained and every returned track is stopped.

**Review rationale:** Confirmed root cause and stated consequence are supported by the exact current source and persisted deterministic reproduction. Trust-boundary, fault-injection and live/physical-platform limits are preserved. No severity or confidence was silently changed, and no external citation was invented.

**Limits:** No microphone device or browser permission was accessed; a deferred local fake reproduced the ordering. Private session reproduction (b9be041a-c060-4172-b294-67b388b84ba6): live-chat-reproduction.mjs: permission-cancellation. Source-body/injected-boundary results establish the stated mechanism, not live provider qualification.

## AUD-0104: Malformed grounding manifests throw before the safe fallback

Status: **confirmed**. Security: **none**. Confidence: **high**.

Evidence: [templates/project/.skills-orchestrator/live-chat/grounding.mjs:4](../templates/project/.skills-orchestrator/live-chat/grounding.mjs#L4); [templates/project/.skills-orchestrator/live-chat/grounding.mjs:13](../templates/project/.skills-orchestrator/live-chat/grounding.mjs#L13)

**Observed:** groundResponse obtains a failed validation result but immediately maps manifest.sources and dereferences source.id. sources:{} and sources:[null] each throw TypeError before the guarded fallback can run.

**Expected:** Reject malformed/unapproved manifest data before traversing it and return the explicit unknown/guided fallback defined by the grounding contract.

**Impact:** A corrupt or malformed grounding record crashes the local response path instead of preserving a usable fallback, despite tests and the skill describing malformed content as inert.

**Resolution:** Return the explicit invalid-manifest fallback before constructing source/citation indexes; validate response collection members at the same boundary.

**Verification:**
- Test sources as object/null/non-array and arrays containing null, plus malformed citation/sourceIds values; assert safe fallback and no exception.

**Review rationale:** Confirmed root cause and stated consequence are supported by the exact current source and persisted deterministic reproduction. Trust-boundary, fault-injection and live/physical-platform limits are preserved. No severity or confidence was silently changed, and no external citation was invented.

**Limits:** Malformed input is part of the existing documented failure behavior, not an invented supported input shape. Private session reproduction (b9be041a-c060-4172-b294-67b388b84ba6): live-chat-reproduction.mjs: malformed-grounding. Source-body/injected-boundary results establish the stated mechanism, not live provider qualification.

## AUD-0105: Rate-limited requests permanently consume an identity concurrency slot

Status: **confirmed**. Security: **none**. Confidence: **high**.

Evidence: [templates/project/.skills-orchestrator/live-chat/server/provider-adapter.mjs:174](../templates/project/.skills-orchestrator/live-chat/server/provider-adapter.mjs#L174); [templates/project/.skills-orchestrator/live-chat/server/provider-adapter.mjs:218](../templates/project/.skills-orchestrator/live-chat/server/provider-adapter.mjs#L218)

**Observed:** streamOpenAI increments activeByIdentity before guardRate, outside the try/finally that decrements it. A rate rejection leaks the count. A local fake with a one-request window succeeded once, rejected the next request for rate, then still rejected the same identity for concurrency after advancing the clock past the window.

**Expected:** Rejected requests must not hold an active identity slot. All acquisitions must be paired with release on normal, exception, cancellation and early-return paths.

**Impact:** Normal bursts can permanently lock a user's adapter identity until the adapter instance is recreated, regardless of rate-window recovery.

**Resolution:** Check rate before taking the active slot or move every post-acquisition operation inside the cleanup boundary; release empty identity records.

**Verification:**
- Exceed the rate window, advance a fake clock, and assert the same identity can stream again; cover exceptions between slot acquisition and transport start.

**Review rationale:** Confirmed root cause and stated consequence are supported by the exact current source and persisted deterministic reproduction. Trust-boundary, fault-injection and live/physical-platform limits are preserved. No severity or confidence was silently changed, and no external citation was invented.

**Limits:** Authenticated identity derivation by a hosting application was not assessed; this is a locally reproduced availability defect. Private session reproduction (b9be041a-c060-4172-b294-67b388b84ba6): live-chat-reproduction.mjs: rate-slot-leak. Source-body/injected-boundary results establish the stated mechanism, not live provider qualification.

## AUD-0107: Streaming decoder corrupts UTF-8 characters split across chunks

Status: **confirmed**. Security: **none**. Confidence: **high**.

Evidence: [templates/project/.skills-orchestrator/live-chat/server/provider-adapter.mjs:87](../templates/project/.skills-orchestrator/live-chat/server/provider-adapter.mjs#L87); [templates/project/.skills-orchestrator/live-chat/server/provider-adapter.mjs:100](../templates/project/.skills-orchestrator/live-chat/server/provider-adapter.mjs#L100)

**Observed:** The preferred async-iterator response path decodes each Buffer independently with toString('utf8'). Splitting the two bytes of a non-ASCII character across chunks produces replacement characters in the emitted delta. A café delta was emitted as caf followed by two replacement characters.

**Expected:** Decode all network chunks with one streaming UTF-8 decoder and flush it only at stream completion.

**Impact:** Legitimate streamed non-ASCII names, user content, localized responses, and citation text are corrupted at arbitrary network chunk boundaries.

**Resolution:** Reuse one streaming TextDecoder for both response body interfaces, including final flush and cleanup.

**Verification:**
- Split every byte boundary of accented and multi-byte Unicode strings in fake SSE chunks; assert exact delta text and unchanged JSON parsing semantics.

**Review rationale:** Confirmed root cause and stated consequence are supported by the exact current source and persisted deterministic reproduction. Trust-boundary, fault-injection and live/physical-platform limits are preserved. No severity or confidence was silently changed, and no external citation was invented.

**Limits:** Reproduced with byte buffers through the production exported adapter and fake transport. Private session reproduction (b9be041a-c060-4172-b294-67b388b84ba6): live-chat-reproduction.mjs: split-utf8. Source-body/injected-boundary results establish the stated mechanism, not live provider qualification.

## AUD-0108: Publishing audit evidence invalidates the secret-scan binding it certifies

Status: **confirmed**. Security: **none**. Confidence: **high**.

Evidence: [.github/skills/audit-code/scripts/gitleaks-scan.mjs:123](../.github/skills/audit-code/scripts/gitleaks-scan.mjs#L123); [.github/skills/audit-code/scripts/audit-evidence.mjs:158](../.github/skills/audit-code/scripts/audit-evidence.mjs#L158); [.github/skills/audit-code/scripts/audit-evidence.mjs:242](../.github/skills/audit-code/scripts/audit-evidence.mjs#L242)

**Observed:** After a current successful pinned Gitleaks scan, audit-evidence reports secretHistory=completed and writes a new content-addressed snapshot beneath reports/audit-evidence. Both scanInputDigest and the untracked worktree digest include that new snapshot. Immediately rerunning the helper with the same run ID and no source changes reports secretHistory=ready, because the helper's own publication changed its required input digests.

**Expected:** The audit should bind a well-defined pre-report source/input snapshot and separately attest its generated evidence, so publishing the required report does not automatically make a just-completed audit appear stale.

**Impact:** The required scan-to-evidence workflow cannot reach a stable completed freshness state. Repeated scans/evidence generations keep invalidating one another and complicate trustworthy downstream assurance and resume checks.

**Resolution:** Separate immutable assessed-input identity from generated audit outputs, while retaining secret scans of tracked reports and independently hashing/scanning new outputs. Do not broadly exempt all reports or weaken source-drift detection.

**Verification:**
- Scan a stable fixture, generate evidence, and repeat evidence inspection; completion must remain stable without rescanning unchanged source. A real source or pre-existing report change must still invalidate freshness.

**Review rationale:** Confirmed root cause and stated consequence are supported by the exact current source and persisted deterministic reproduction. Trust-boundary, fault-injection and live/physical-platform limits are preserved. No severity or confidence was silently changed, and no external citation was invented.

**Limits:** Reproduced on this audit run with two immutable snapshots; both snapshots are retained. The pinned scan itself completed successfully with zero findings. Private session reproduction (b9be041a-c060-4172-b294-67b388b84ba6): audit-freshness-reproduction.json. Source-body/injected-boundary results establish the stated mechanism, not live provider qualification.

## AUD-0109: Cleanup derives a different resource group for supported long project names

Status: **confirmed**. Security: **none**. Confidence: **high**.

Evidence: [templates/project/infra/deploy-infra.ps1:45](../templates/project/infra/deploy-infra.ps1#L45); [templates/project/infra/cleanup.ps1:39](../templates/project/infra/cleanup.ps1#L39); [templates/project/infra/main.bicep:7](../templates/project/infra/main.bicep#L7)

**Observed:** Deployment uses Get-AzureResourceName and truncates resource-group names to 90 characters. Cleanup -All independently prepends rg- to the unbounded normalized project name. For a supported 90-character siteName, deployment uses a 90-character group while cleanup queries a 93-character name.

**Expected:** Creation and cleanup must resolve the same exact group identity for every supported project name, using the shared naming owner.

**Impact:** The documented -All cleanup path cannot find resources created for long valid project names; it fails instead of cleaning the intended group. No live resources were queried or deleted.

**Resolution:** Reuse the deployment naming helper for cleanup or extract a single shared resource-naming owner; do not silently change identities of existing resources.

**Verification:**
- Cover names at 86, 87, 88, and 90 normalized characters and assert deploy/cleanup group identity equality; use fake Azure commands and verify no deletion without the exact existing confirmation gate.

**Review rationale:** Confirmed root cause and stated consequence are supported by the exact current source and persisted deterministic reproduction. Trust-boundary, fault-injection and live/physical-platform limits are preserved. No severity or confidence was silently changed, and no external citation was invented.

**Limits:** A local helper comparison reproduced 90 versus 93 characters. The script comment claiming 2-20 characters is not the actual Bicep maximum. Private session reproduction (b9be041a-c060-4172-b294-67b388b84ba6): PowerShell: Get-AzureResourceName -ProjectName ('a' * 90) -ResourceType resourceGroup versus cleanup's rg- plus ConvertTo-AzureProjectToken. Source-body/injected-boundary results establish the stated mechanism, not live provider qualification.

## AUD-0112: Classic apply interprets an explicit negative risk value as approval

Status: **confirmed**. Security: **none**. Confidence: **high**.

Evidence: [.github/skills/agent-builder/scripts/agent-builder.mjs:65](../.github/skills/agent-builder/scripts/agent-builder.mjs#L65); [.github/skills/agent-builder/scripts/agent-builder.mjs:933](../.github/skills/agent-builder/scripts/agent-builder.mjs#L933); [.github/skills/agent-builder/scripts/agent-builder.mjs:972](../.github/skills/agent-builder/scripts/agent-builder.mjs#L972)

**Observed:** The unchanged main/parse/apply path ignores false as an extra positional, installs the new target, and persists an applied result.

**Expected:** Reject the unsupported flag value or treat it as withheld approval.

**Impact:** Malformed negative approval input authorizes local installation contrary to its expressed value.

**Resolution:** Reject extra positionals on all commands or parse boolean-valued flags explicitly.

**Verification:**
- Run false and no through main and verify rejection plus unchanged destination; retain the documented bare-flag success control.

**Review rationale:** Confirmed root cause and stated consequence are supported by the exact current source and persisted deterministic reproduction. Trust-boundary, fault-injection and live/physical-platform limits are preserved. No severity or confidence was silently changed, and no external citation was invented.

**Limits:** An otherwise valid reviewed classic update is invoked with --accept-risk false. This establishes a local CLI contract defect, not a remote authorization bypass. Private session reproduction (b9be041a-c060-4172-b294-67b388b84ba6): {"runner":"builder-probes.mjs","group":"classic","cases":["AB-03-explicit-false-through-main"],"results":"builder-classic-results.json"}. Source-body/injected-boundary results establish the stated mechanism, not live provider qualification.

## AUD-0113: Classic result-persistence failure leaves the new agent installed

Status: **confirmed**. Security: **none**. Confidence: **high**.

Evidence: [.github/skills/agent-builder/scripts/agent-builder.mjs:853](../.github/skills/agent-builder/scripts/agent-builder.mjs#L853); [.github/skills/agent-builder/scripts/agent-builder.mjs:879](../.github/skills/agent-builder/scripts/agent-builder.mjs#L879)

**Observed:** The real controlling code verifies and marks the target applied, releases the lock, then throws on the result rename without restoring the original.

**Expected:** A consistent successful transaction/result or restoration of the prior destination with a recorded failure.

**Impact:** The command reports failure while the changed agent remains active and the current result is absent.

**Resolution:** Include result persistence in the transaction and lock lifetime with explicit outcome handling.

**Containment recommendation (not executed):** Preserve independent copies of existing inputs, installed definitions, metadata and generated outputs; avoid replacement/rerender operations that exercise the failing path until the owner-approved repair is validated.

**Verification:**
- Inject only the final result rename failure; assert a coherent result or rollback and verify the lock is retained through outcome persistence.

**Review rationale:** Confirmed root cause and stated consequence are supported by the exact current source and persisted deterministic reproduction. Trust-boundary, fault-injection and live/physical-platform limits are preserved. No severity or confidence was silently changed, and no external citation was invented.

**Limits:** Installation succeeds, then rename of the pending reports/agent-builder-result.json fails with EACCES. Boundary trace shows the successful target rename and lock removal preceding the one injected failure; no target mutation is performed by the injection. Private session reproduction (b9be041a-c060-4172-b294-67b388b84ba6): {"runner":"builder-probes.mjs","group":"classic","cases":["AB-04-result-persistence"],"results":"builder-classic-results.json"}. Source-body/injected-boundary results establish the stated mechanism, not live provider qualification.

## AUD-0114: Native parser treats ambiguous implicit scalars as validated text

Status: **confirmed**. Security: **none**. Confidence: **high**.

Evidence: [.github/skills/agent-builder/scripts/native-studio.mjs:232](../.github/skills/agent-builder/scripts/native-studio.mjs#L232); [.github/skills/agent-builder/scripts/native-studio.mjs:314](../.github/skills/agent-builder/scripts/native-studio.mjs#L314); [.github/skills/agent-builder/scripts/native-studio.mjs:349](../.github/skills/agent-builder/scripts/native-studio.mjs#L349); [.github/skills/agent-builder/scripts/native-studio.mjs:612](../.github/skills/agent-builder/scripts/native-studio.mjs#L612)

**Observed:** The scalar falls through as a string; build, apply, and installed validation pass with locally verified implementation.

**Expected:** Correct YAML scalar typing or conservative rejection requiring explicit quotes.

**Impact:** Local structural assurance can certify a value interpreted differently by YAML tooling.

**Resolution:** Reject implicit scalar forms outside the supported subset or implement consistent typing.

**Verification:**
- Test quoted/unquoted boolean, null, scientific-number, hexadecimal, and reserved plain-scalar forms.

**Review rationale:** Confirmed root cause and stated consequence are supported by the exact current source and persisted deterministic reproduction. Trust-boundary, fault-injection and live/physical-platform limits are preserved. No severity or confidence was silently changed, and no external citation was invented.

**Limits:** A supported static topic uses unquoted activity: True. No live-platform rejection is asserted; the finding concerns local YAML semantics and the generated validation claim. Private session reproduction (b9be041a-c060-4172-b294-67b388b84ba6): {"runner":"builder-probes.mjs","group":"native","cases":["AB-05-implicit-boolean"],"results":"builder-native-results.json"}. Source-body/injected-boundary results establish the stated mechanism, not live provider qualification.

## AUD-0117: Complete push handoff accepts blocked or missing draft approval

Status: **confirmed**. Security: **none**. Confidence: **high**.

Evidence: [.github/skills/agent-builder/scripts/native-studio.mjs:168](../.github/skills/agent-builder/scripts/native-studio.mjs#L168); [schemas/copilot-studio-handoff.schema.json:114](../schemas/copilot-studio-handoff.schema.json#L114)

**Observed:** Both the current exported validator and the actual unchanged JSON Schema accept complete:true.

**Expected:** The applicable draft approval must be verified before the push handoff may claim complete.

**Impact:** The portable completeness contract overstates applicable approval evidence.

**Resolution:** Require operation-relevant completion approvals and reject explicit applicable blockers.

**Verification:**
- Require verified draft approval for push and test not-requested/blocked variants against both validators; keep an approved control.

**Review rationale:** Confirmed root cause and stated consequence are supported by the exact current source and persisted deterministic reproduction. Trust-boundary, fault-injection and live/physical-platform limits are preserved. No severity or confidence was silently changed, and no external citation was invented.

**Limits:** An otherwise complete handoff selects push, records verified synchronization, and declares draft approval blocked or not-requested. Cost approval is deliberately excluded from this finding because no necessary cost-bearing operation was established. No downstream authorization bypass is asserted. Private session reproduction (b9be041a-c060-4172-b294-67b388b84ba6): {"runner":"builder-probes.mjs","group":"public","cases":["AB-08-push-draft-verified","AB-08-push-draft-not-requested","AB-08-push-draft-blocked"],"results":"builder-public-results.json"}. Source-body/injected-boundary results establish the stated mechanism, not live provider qualification.

## AUD-0118: Cycle detection misses ordinary YAML agent-list formats

Status: **confirmed**. Security: **none**. Confidence: **high**.

Evidence: [.github/skills/agent-builder/scripts/agent-builder.mjs:470](../.github/skills/agent-builder/scripts/agent-builder.mjs#L470); [.github/skills/agent-builder/scripts/agent-builder.mjs:480](../.github/skills/agent-builder/scripts/agent-builder.mjs#L480)

**Observed:** The graph builder records no reverse edge for either ordinary alternative form and accepts the cycle.

**Expected:** Reject the same cycle detected in quoted-flow-list form.

**Impact:** The invocation-cycle invariant depends on cosmetic YAML formatting.

**Resolution:** Parse supported frontmatter reference forms correctly or fail closed on unrecognized reference syntax.

**Verification:**
- Run the same two-agent graph with quoted-flow, plain-flow, and block-list forms and require equivalent rejection.

**Review rationale:** Confirmed root cause and stated consequence are supported by the exact current source and persisted deterministic reproduction. Trust-boundary, fault-injection and live/physical-platform limits are preserved. No severity or confidence was silently changed, and no external citation was invented.

**Limits:** A proposed first agent delegates to an existing second agent whose reverse reference uses a plain flow list or block list. No actual recursive agent invocation or resource-consumption outcome is claimed. Private session reproduction (b9be041a-c060-4172-b294-67b388b84ba6): {"runner":"builder-probes.mjs","group":"public","cases":["AB-09-cycle"],"results":"builder-public-results.json"}. Source-body/injected-boundary results establish the stated mechanism, not live provider qualification.

## AUD-0123: Scaffold apply selects Launch Pad content instead of the hashed template

Status: **confirmed**. Security: **none**. Confidence: **high**.

Evidence: [pso.mjs:2808](../pso.mjs#L2808); [pso.mjs:3269](../pso.mjs#L3269)

**Observed:** A fixture lacking only the new native-routing block planned upstream-only with canApply true, then instruction update rolled back with Written upstream digest does not match .github/copilot-instructions.md.

**Expected:** Read the same template bytes whose digest the plan reviewed, keeping Launch Pad instructions distinct from target-project instructions.

**Impact:** The native routing instruction upgrade, and other colliding scaffold updates, cannot be applied through the reviewed update path.

**Resolution:** Select source content from the asset's declared scope/provenance; scaffold assets must resolve to the scaffold template, not an existence-based fallback.

**Verification:**
- Apply an instruction-template upgrade with a deliberately different Launch Pad file and assert exact planned content; cover .gitattributes too.

**Review rationale:** Confirmed root cause and stated consequence are supported by the exact current source and persisted deterministic reproduction. Trust-boundary, fault-injection and live/physical-platform limits are preserved. No severity or confidence was silently changed, and no external citation was invented.

**Limits:** A generated project's scaffold needs updating and its path also exists with different contents in the Launch Pad, as currently occurs for .github/copilot-instructions.md and .gitattributes. Private session reproduction (b9be041a-c060-4172-b294-67b388b84ba6): {"artifact":"runtime-update-results.json","probe":"RT-03","status":"reproduced","fixture":"Current shipped instruction template minus its native-studio-routing managed block, with matching old normalized baseline."}. Source-body/injected-boundary results establish the stated mechanism, not live provider qualification.

## AUD-0124: Safe-all accepts local-only edits then rolls back while verifying them

Status: **confirmed**. Security: **none**. Confidence: **high**.

Evidence: [pso.mjs:2870](../pso.mjs#L2870); [pso.mjs:3352](../pso.mjs#L3352)

**Observed:** A valid skill with one harmless local note produced local-only/none/canApply true, but apply rolled back because its bytes did not equal upstream.

**Expected:** Verify the preserved local state according to its no-action plan and complete otherwise-compatible reconciliation.

**Impact:** Ordinary customized projects cannot complete the advertised safe-all update even when no upstream/local conflict exists.

**Resolution:** Make candidate verification classification/action-aware; distinguish preservation from replacement and baseline advancement.

**Verification:**
- Apply safe-all with valid local-only content and test converged/no-action cases, ensuring bytes and baseline policy remain correct.

**Review rationale:** Confirmed root cause and stated consequence are supported by the exact current source and persisted deterministic reproduction. Trust-boundary, fault-injection and live/physical-platform limits are preserved. No severity or confidence was silently changed, and no external citation was invented.

**Limits:** A valid managed asset has a local-only change; its installed baseline and current upstream are equal. Private session reproduction (b9be041a-c060-4172-b294-67b388b84ba6): {"artifact":"runtime-update-results.json","probe":"RT-04","status":"reproduced"}. Source-body/injected-boundary results establish the stated mechanism, not live provider qualification.

## AUD-0125: Profile validation blocks additive restoration of required skills

Status: **confirmed**. Security: **none**. Confidence: **high**.

Evidence: [pso.mjs:3154](../pso.mjs#L3154)

**Observed:** Missing workflow-planner was classified new-upstream/create but INCOMPATIBLE_PROFILE set canApply false; actual updateProject apply refused.

**Expected:** Check the proposed post-apply profile, while still blocking required skills that are neither present nor being installed.

**Impact:** The additive command cannot repair required skills or introduce newly required profile skills through this path.

**Resolution:** Evaluate projected skill availability from verified planned creates/replacements and retained installed assets.

**Verification:**
- Apply additive workflow-planner restoration and a new-required-skill upgrade; retain the negative test for an unrelated selective update leaving a requirement absent.

**Review rationale:** Confirmed root cause and stated consequence are supported by the exact current source and persisted deterministic reproduction. Trust-boundary, fault-injection and live/physical-platform limits are preserved. No severity or confidence was silently changed, and no external citation was invented.

**Limits:** A required skill is absent and is explicitly selected for a dependency-closed additive installation, or is newly required by an upstream profile. Private session reproduction (b9be041a-c060-4172-b294-67b388b84ba6): {"artifact":"runtime-update-results.json","probe":"RT-05","status":"reproduced"}. Source-body/injected-boundary results establish the stated mechanism, not live provider qualification.

## AUD-0126: Legacy update plans omit required source provenance metadata

Status: **confirmed**. Security: **none**. Confidence: **high**.

Evidence: [pso.mjs:3196](../pso.mjs#L3196); [schemas/project-update-plan.schema.json:69](../schemas/project-update-plan.schema.json#L69)

**Observed:** Legacy planning reported canApply true; serialized plan.source omitted installedSource and failed the schema's required-property condition.

**Expected:** Every emitted supported-version plan must satisfy its advertised contract without inventing historical identity.

**Impact:** Schema-consuming reviewers or automation reject the supposedly usable legacy migration plan.

**Resolution:** Represent unknown legacy provenance explicitly in the plan schema/runtime, rather than substituting current upstream identity for historical evidence.

**Verification:**
- Validate emitted plans from legacy 1.0 and current 1.1 fixtures against the actual plan schema, then test their migration paths.

**Review rationale:** Confirmed root cause and stated consequence are supported by the exact current source and persisted deterministic reproduction. Trust-boundary, fault-injection and live/physical-platform limits are preserved. No severity or confidence was silently changed, and no external citation was invented.

**Limits:** Supported manifest 1.0 without installedSource or a 1.1 baseline lock. Private session reproduction (b9be041a-c060-4172-b294-67b388b84ba6): {"artifact":"runtime-update-results.json","probe":"RT-06","status":"reproduced","validatorScope":"Direct required-property check, not a general JSON Schema engine."}. Source-body/injected-boundary results establish the stated mechanism, not live provider qualification.

## AUD-0127: Candidate freshness ignores added and deleted shipped sources

Status: **confirmed**. Security: **none**. Confidence: **high**.

Evidence: [scripts/verify-release.mjs:64](../scripts/verify-release.mjs#L64); [scripts/build-release.mjs:16](../scripts/build-release.mjs#L16)

**Observed:** Separate added schemas/added.schema.json and deleted schemas/retired.schema.json cases both exited 0 as verified. Baseline and a nonshipped reports output control also passed.

**Expected:** Reject either shipped-file-set change while continuing to ignore nonshipped outputs and generated candidate metadata.

**Impact:** Release readiness can accept an artifact missing newly shipped functionality or retaining removed schemas/source.

**Resolution:** Compare the canonical shipped source and payload path sets before comparing file digests; exclude only declared non-source/generated artifacts.

**Verification:**
- Test additions and deletions independently under schemas and other shipped roots; ensure reports/dist outputs do not create false positives.

**Review rationale:** Confirmed root cause and stated consequence are supported by the exact current source and persisted deterministic reproduction. Trust-boundary, fault-injection and live/physical-platform limits are preserved. No severity or confidence was silently changed, and no external citation was invented.

**Limits:** A candidate predates an added or removed source file beneath a shipped root, without a change to another compared source file. Private session reproduction (b9be041a-c060-4172-b294-67b388b84ba6): {"artifact":"runtime-release-results.json","probe":"RT-07","status":"reproduced","fixture":"Minimal synthetic integrity-valid candidate; altered paths are inside the actual builder's shipped schemas root."}. Source-body/injected-boundary results establish the stated mechanism, not live provider qualification.

## AUD-0132: Header-only invalid PNGs pass automated image qualification

Status: **confirmed**. Security: **none**. Confidence: **high**.

Evidence: [.github/skills/project-visual-storytelling/scripts/project-visual-storytelling.mjs:190](../.github/skills/project-visual-storytelling/scripts/project-visual-storytelling.mjs#L190); [.github/skills/project-visual-storytelling/scripts/azure-openai-image-render.mjs:116](../.github/skills/project-visual-storytelling/scripts/azure-openai-image-render.mjs#L116); [.github/skills/project-visual-storytelling/scripts/mai-image-render.mjs:107](../.github/skills/project-visual-storytelling/scripts/mai-image-render.mjs#L107); [tests/project-visual-storytelling.test.mjs:43](../tests/project-visual-storytelling.test.mjs#L43)

**Observed:** The verifier accepts a 24-byte signature/IHDR/dimensions buffer with no valid image chunks or data. Adapter checks also accept malformed header-shaped payloads.

**Expected:** Automated candidate qualification should establish that the artifact is a decodable, bounded PNG before requesting human fidelity review.

**Impact:** Unusable files can be described as rendered and automatically qualified candidates; no final-human-approval bypass is claimed.

**Resolution:** Perform full bounded PNG decoding compatible with the supported dimensions and color formats, including chunk/CRC/data validation.

**Verification:**
- Reject signature-only, truncated, CRC-corrupt, missing-IDAT, and oversized-expansion PNGs.
- Use an independent real PNG encoder for provider success fixtures.

**Review rationale:** Confirmed root cause and stated consequence are supported by the exact current source and persisted deterministic reproduction. Trust-boundary, fault-injection and live/physical-platform limits are preserved. No severity or confidence was silently changed, and no external citation was invented.

**Limits:** Human review remains required for appearance, text, attribution, and evidence fidelity. No browser image decoder vulnerability is alleged. Likelihood preconditions: Moderate with truncated, corrupt, or malformed provider output; successful image tests currently use similarly invalid header-only fixtures. Private session reproduction (b9be041a-c060-4172-b294-67b388b84ba6): helpers-repro-results.json: visual-invalid-png-qualification. Source-body/injected-boundary results establish the stated mechanism, not live provider qualification.

## AUD-0134: Plan parsing and hashing can bind different file revisions

Status: **confirmed**. Security: **none**. Confidence: **high**.

Evidence: [.github/skills/project-video/scripts/project-video.mjs:437](../.github/skills/project-video/scripts/project-video.mjs#L437); [.github/skills/project-video/scripts/project-video.mjs:458](../.github/skills/project-video/scripts/project-video.mjs#L458)

**Observed:** loadPlan parses one file read, awaits other operations, then rereads the file for hashing. A deterministic edit between these operations returns old narration with the new plan's digest.

**Expected:** The returned plan and SHA-256 must refer to the same consumed bytes.

**Impact:** Generated media can appear bound to the current plan although it used earlier content.

**Resolution:** Read the plan once and compute both its parsed representation and hash from that immutable byte snapshot; check separate evidence drift explicitly.

**Verification:**
- Inject a deterministic edit between parsing and hashing; never return mismatched content and digest.
- Avoid sleep-dependent race tests.

**Review rationale:** Confirmed root cause and stated consequence are supported by the exact current source and persisted deterministic reproduction. Trust-boundary, fault-injection and live/physical-platform limits are preserved. No severity or confidence was silently changed, and no external citation was invented.

**Limits:** The reproduction controls the interleaving through fake I/O rather than relying on timing. This finding does not assert malicious editing of the plan. Likelihood preconditions: Moderate with editor autosave or another writer during the validation/hash interval; no attacker is required. Private session reproduction (b9be041a-c060-4172-b294-67b388b84ba6): helpers-repro-results.json: video-plan-read-hash-race. Source-body/injected-boundary results establish the stated mechanism, not live provider qualification.

## AUD-0135: The emitted third voice profile is rejected by four owned schemas

Status: **confirmed**. Security: **none**. Confidence: **high**.

Evidence: [.github/skills/project-video/scripts/project-video.mjs:97](../.github/skills/project-video/scripts/project-video.mjs#L97); [schemas/project-video-voice-samples.schema.json:30](../schemas/project-video-voice-samples.schema.json#L30); [schemas/project-video-voice-selection.schema.json:12](../schemas/project-video-voice-selection.schema.json#L12); [schemas/project-video-narration-manifest.schema.json:16](../schemas/project-video-narration-manifest.schema.json#L16); [schemas/project-video-manifest.schema.json:103](../schemas/project-video-manifest.schema.json#L103)

**Observed:** The producer emits jenny-professional for profile C, while the audition, selection, narration, and final-video schemas allow aria-professional instead.

**Expected:** Every supported generated voice profile and its artifact paths must satisfy the owning schemas.

**Impact:** Every three-profile audition includes an invalid record; choosing C also yields invalid downstream artifacts.

**Resolution:** Synchronize canonical profile definitions and schemas, with an explicit compatibility decision for existing artifacts.

**Verification:**
- Validate actual emitted A/B/C audition, selection, narration, and final-video artifacts against all owning schemas.
- Do not limit assertions to producer-internal field equality.

**Review rationale:** Confirmed root cause and stated consequence are supported by the exact current source and persisted deterministic reproduction. Trust-boundary, fault-injection and live/physical-platform limits are preserved. No severity or confidence was silently changed, and no external citation was invented.

**Limits:** This is a local contract defect independent of provider availability or Speech synthesis. No schema validator or dependencies were installed. Likelihood preconditions: High for generated Azure auditions because the complete A/B/C set always includes C. Private session reproduction (b9be041a-c060-4172-b294-67b388b84ba6): helpers-repro-results.json: video-profile-c-schema-drift. Source-body/injected-boundary results establish the stated mechanism, not live provider qualification.

## AUD-0136: Selected-SKU quota falls back to another SKU's capacity

Status: **confirmed**. Security: **none**. Confidence: **high**.

Evidence: [.github/skills/azure-discovery/scripts/azure-discovery.ps1:193](../.github/skills/azure-discovery/scripts/azure-discovery.ps1#L193)

**Observed:** A GlobalStandard request with only Standard usage evidence returns available and matchFound true because missing SKU matches fall back to the first model match.

**Expected:** Report selected-model/SKU quota only from matching evidence; absent matching usage remains unknown.

**Impact:** Discovery can report deployable capacity for a SKU whose quota was never observed.

**Resolution:** Use unambiguous model/SKU matching and remove fallback to a different quota bucket.

**Verification:**
- Supply Standard capacity but no GlobalStandard bucket; a GlobalStandard request must remain unknown.
- Cover exhausted and available buckets across different SKUs and similarly prefixed model names.

**Review rationale:** Confirmed root cause and stated consequence are supported by the exact current source and persisted deterministic reproduction. Trust-boundary, fault-injection and live/physical-platform limits are preserved. No severity or confidence was silently changed, and no external citation was invented.

**Limits:** The actual PowerShell function was executed with a local fake az function. Availability evidence itself is not deployment authorization. Likelihood preconditions: Moderate when usage results contain another SKU for the same model but not the chosen SKU. Private session reproduction (b9be041a-c060-4172-b294-67b388b84ba6): helpers-repro-results.json: quota-unmatched-sku-fallback. Source-body/injected-boundary results establish the stated mechanism, not live provider qualification.

## AUD-0139: Future sync timestamps are reported healthy

Status: **confirmed**. Security: **none**. Confidence: **high**.

Evidence: [.github/skills/project-status/scripts/project-status.mjs:45](../.github/skills/project-status/scripts/project-status.mjs#L45)

**Observed:** A last-success timestamp 26390 days ahead is treated as healthy because only old timestamps are rejected as stale.

**Expected:** Future-dated observations should be rejected or reported unknown with a clock/evidence limitation.

**Impact:** Clock errors or invalid producer data can hide unhealthy/stale syncs for an arbitrarily long period.

**Resolution:** Validate timestamps against the evaluation clock and define any allowed skew explicitly.

**Verification:**
- Test one-millisecond and large future offsets, invalid dates, stale past observations, and explicit failed status.

**Review rationale:** Confirmed root cause and stated consequence are supported by the exact current source and persisted deterministic reproduction. Trust-boundary, fault-injection and live/physical-platform limits are preserved. No severity or confidence was silently changed, and no external citation was invented.

**Limits:** This is a health-correctness issue; no attacker-controlled service boundary is alleged. Likelihood preconditions: Moderate with clock drift, date mistakes, or malformed upstream status data. Private session reproduction (b9be041a-c060-4172-b294-67b388b84ba6): helpers-repro-results.json: status-future-success. Source-body/injected-boundary results establish the stated mechanism, not live provider qualification.

## AUD-0140: Documentation promotes planned items into verified claims

Status: **confirmed**. Security: **none**. Confidence: **high**.

Evidence: [.github/skills/documentation-builder/scripts/documentation-builder.mjs:36](../.github/skills/documentation-builder/scripts/documentation-builder.mjs#L36); [.github/skills/documentation-builder/scripts/documentation-builder.mjs:92](../.github/skills/documentation-builder/scripts/documentation-builder.mjs#L92)

**Observed:** build ignores each understanding item's status and constructs every retained claim with status verified. A planned item becomes a verified guide claim.

**Expected:** Preserve planned or uncertain classifications instead of silently promoting them.

**Impact:** Downstream documentation can misrepresent intended or unverified behavior as delivered.

**Resolution:** Preserve supported statuses, explicitly map uncertainty, or exclude unsupported assertions with a limitation.

**Verification:**
- Generate guides from verified, planned, inferred, and unknown source items; none may silently gain stronger assurance.

**Review rationale:** Confirmed root cause and stated consequence are supported by the exact current source and persisted deterministic reproduction. Trust-boundary, fault-injection and live/physical-platform limits are preserved. No severity or confidence was silently changed, and no external citation was invented.

**Limits:** The understanding schema supports non-verified item classifications. No claim that a feature's implementation was actually delivered was inferred from this reproduction. Likelihood preconditions: Conditional: a complete understanding record contains planned or uncertain items, which its schema permits. Private session reproduction (b9be041a-c060-4172-b294-67b388b84ba6): helpers-repro-results.json: guide-empty-markdown-and-planned-claim. Source-body/injected-boundary results establish the stated mechanism, not live provider qualification.

## AUD-0141: Empty understanding Markdown bypasses its digest check

Status: **confirmed**. Security: **none**. Confidence: **high**.

Evidence: [.github/skills/documentation-builder/scripts/documentation-builder.mjs:125](../.github/skills/documentation-builder/scripts/documentation-builder.mjs#L125); [.github/skills/documentation-builder/scripts/documentation-builder.mjs:162](../.github/skills/documentation-builder/scripts/documentation-builder.mjs#L162)

**Observed:** Documentation validation accepts an empty understanding Markdown string despite a stored digest for nonempty content.

**Expected:** Validate the digest of every present input, including zero-byte content.

**Impact:** Truncated evidence can pass guide validation and appear correctly bound.

**Resolution:** Distinguish unavailable input from empty input and always hash supplied Markdown.

**Verification:**
- Truncate the understanding Markdown to zero bytes after generating a valid guide; validate must fail.
- Retain tests for appended and replaced content.

**Review rationale:** Confirmed root cause and stated consequence are supported by the exact current source and persisted deterministic reproduction. Trust-boundary, fault-injection and live/physical-platform limits are preserved. No severity or confidence was silently changed, and no external citation was invented.

**Limits:** The reproduction establishes the validation branch directly with exact empty content. Build already checks this digest separately; the defect is in validation. Likelihood preconditions: Conditional: the understanding Markdown file becomes empty while its JSON/report binding remains unchanged. Private session reproduction (b9be041a-c060-4172-b294-67b388b84ba6): helpers-repro-results.json: guide-empty-markdown-and-planned-claim. Source-body/injected-boundary results establish the stated mechanism, not live provider qualification.

## AUD-0142: Documentation build publishes new verified guides from stale source snapshots

Status: **confirmed**. Security: **none**. Confidence: **high**.

Evidence: [.github/skills/documentation-builder/SKILL.md:58](../.github/skills/documentation-builder/SKILL.md#L58); [.github/skills/documentation-builder/scripts/documentation-builder.mjs:147](../.github/skills/documentation-builder/scripts/documentation-builder.mjs#L147); [.github/skills/documentation-builder/scripts/documentation-builder.mjs:84](../.github/skills/documentation-builder/scripts/documentation-builder.mjs#L84); [.github/skills/documentation-builder/scripts/documentation-builder.mjs:45](../.github/skills/documentation-builder/scripts/documentation-builder.mjs#L45)

**Observed:** An unchanged, self-consistent snapshot was retained after deleting its original source and changing package.json and README. documentation-builder then created a new, later-dated guide containing the obsolete start command as verified and a verified claim referencing the deleted source. Its own guide validation succeeded. The build read only the archived report pair.

**Expected:** Historical snapshots may remain valid. A consumer promising a current project guide must refresh or establish current-source evidence before publication, or explicitly emit a historical/as-of guide instead.

**Impact:** A newly generated guide can present commands and evidence that no longer exist as current/verified, despite an internally sound historical snapshot.

**Resolution:** Preserve historical report-pair validation. Add or require a current-source gate at documentation generation, reusing the producer's bounded/excluded scan contract, or expose an explicitly historical mode with snapshot date/currency instead of current-source assurance.

**Containment recommendation (not executed):** Run the existing Project Understanding scan immediately before guide generation and check cited commands/source until the consumer enforces current-source evidence.

**Verification:**
- Produce a genuine snapshot, then change the start command and README and delete the original source before generating a new guide; reject, refresh, or explicitly label the output historical.
- Verify that snapshot-only validation continues to accept an unmodified historical report pair.
- Ensure verified current claims do not retain obsolete commands or deleted source evidence.

**Review rationale:** Confirmed root cause and stated consequence are supported by the exact current source and persisted deterministic reproduction. Trust-boundary, fault-injection and live/physical-platform limits are preserved. No severity or confidence was silently changed, and no external citation was invented.

**Limits:** H15 no longer identifies historical artifact validation itself as defective; the owning defect is the documentation consumer's missing current-source gate. The producer and consumer function bodies are unchanged; a controlled clock and memory-only project prove newly generated output after source changes without repository writes. The documented skill procedure says to build after a scan; that operational prerequisite mitigates the issue only when freshness remains true at consumption. Likelihood preconditions: Conditional: source changes after the most recent scan and before a separate documentation build. Workflows that ensure a fresh scan and prevent intervening source changes mitigate this consumer gap. Private session reproduction (b9be041a-c060-4172-b294-67b388b84ba6): helpers-h15-results.json: documentation-build-publishes-stale-current-claims. Source-body/injected-boundary results establish the stated mechanism, not live provider qualification.

## AUD-0143: Media response caps are enforced only after full body buffering

Status: **confirmed**. Security: **none**. Confidence: **high**.

Evidence: [.github/skills/project-video/scripts/project-video.mjs:943](../.github/skills/project-video/scripts/project-video.mjs#L943); [.github/skills/project-visual-storytelling/scripts/azure-openai-image-render.mjs:152](../.github/skills/project-visual-storytelling/scripts/azure-openai-image-render.mjs#L152); [.github/skills/project-visual-storytelling/scripts/mai-image-render.mjs:105](../.github/skills/project-visual-storytelling/scripts/mai-image-render.mjs#L105)

**Observed:** Without Content-Length, Speech fully buffers a response before checking its 20 MiB cap. The reproduction allocated 20971521 bytes before rejection. Image JSON and error bodies are similarly consumed before output-length checks.

**Expected:** Enforce body limits while streaming, before unbounded allocation, and cancel oversized responses.

**Impact:** Missing or inaccurate length metadata defeats the intended memory bound and can exhaust the worker on large responses.

**Resolution:** Use bounded streaming readers for successful and error responses; abort and release the response at the first exceeded limit.

**Verification:**
- Use fake chunked streams without Content-Length and assert early cancellation before accumulating more than the cap.
- Cover false Content-Length and oversized image JSON/error bodies.

**Review rationale:** Confirmed root cause and stated consequence are supported by the exact current source and persisted deterministic reproduction. Trust-boundary, fault-injection and live/physical-platform limits are preserved. No severity or confidence was silently changed, and no external citation was invented.

**Limits:** Transport was entirely faked; no real network or provider request occurred. No arbitrary-attacker endpoint or demonstrated remote denial-of-service exploit is alleged. Likelihood preconditions: Conditional: an approved provider or transport returns a large chunked, malformed, or incorrectly declared body. Private session reproduction (b9be041a-c060-4172-b294-67b388b84ba6): helpers-repro-results.json: speech-size-cap-after-allocation. Source-body/injected-boundary results establish the stated mechanism, not live provider qualification.

## AUD-0119: Boolean solution name passes runtime but violates emitted schema

Status: **confirmed**. Security: **none**. Confidence: **high**.

Evidence: [.github/skills/agent-builder/scripts/native-studio.mjs:79](../.github/skills/agent-builder/scripts/native-studio.mjs#L79); [.github/skills/agent-builder/scripts/native-studio.mjs:392](../.github/skills/agent-builder/scripts/native-studio.mjs#L392); [.github/skills/agent-builder/scripts/native-studio.mjs:633](../.github/skills/agent-builder/scripts/native-studio.mjs#L633); [schemas/copilot-studio-handoff.schema.json:214](../schemas/copilot-studio-handoff.schema.json#L214)

**Observed:** The unchanged exported spec validator returns the same object. Current public build/apply/validate succeed in the virtual filesystem. The actual produced handoff passes runtime validation but fails actual Test-Json schema validation.

**Expected:** Reject before preparation because the field is string-or-null.

**Impact:** The producer emits an artifact its authoritative schema rejects while declaring installed validation successful.

**Resolution:** Check scalar types before applying regexes in both spec and handoff validation.

**Verification:**
- Add producer/API/schema parity tests for true, false, arrays, objects, and valid strings/null.

**Review rationale:** Confirmed root cause and stated consequence are supported by the exact current source and persisted deterministic reproduction. Trust-boundary, fault-injection and live/physical-platform limits are preserved. No severity or confidence was silently changed, and no external citation was invented.

**Limits:** A native specification sets target.solutionUniqueName to the JSON boolean true. Public modules are imported from current original files. Installation is a virtual-filesystem exercise, not an on-disk or cloud qualification. Private session reproduction (b9be041a-c060-4172-b294-67b388b84ba6): {"runner":"builder-probes.mjs","group":"public","cases":["AB-10-current-public-spec-api","AB-10-boolean-solution","AB-10-actual-produced-handoff"],"results":"builder-public-results.json"}. Source-body/injected-boundary results establish the stated mechanism, not live provider qualification.

## AUD-0120: Partial initial lock write leaves an orphan project lock

Status: **confirmed**. Security: **none**. Confidence: **high**.

Evidence: [.github/skills/agent-builder/scripts/agent-builder.mjs:831](../.github/skills/agent-builder/scripts/agent-builder.mjs#L831); [.github/skills/agent-builder/scripts/agent-builder.mjs:865](../.github/skills/agent-builder/scripts/agent-builder.mjs#L865)

**Observed:** The real early catch rethrows before the cleanup region. No target write occurs and the empty lock remains.

**Expected:** Remove the lock owned by this failed invocation without touching any preexisting lock.

**Impact:** Later applies are blocked by an orphan lock even though this apply never installed anything.

**Resolution:** Acquire an exclusive handle, track ownership, and perform lock content writes within its cleanup boundary.

**Verification:**
- Inject a create-then-fail write and assert owned lock removal; separately ensure EEXIST never removes another invocation's lock.

**Review rationale:** Confirmed root cause and stated consequence are supported by the exact current source and persisted deterministic reproduction. Trust-boundary, fault-injection and live/physical-platform limits are preserved. No severity or confidence was silently changed, and no external citation was invented.

**Limits:** The exclusive write creates the lock file but its content write fails with ENOSPC. The probe explicitly models the partial-file creation precondition; it does not claim to have exhausted a physical disk or leaked an OS descriptor. Private session reproduction (b9be041a-c060-4172-b294-67b388b84ba6): {"runner":"builder-probes.mjs","group":"classic","cases":["AB-11-partial-lock-write"],"results":"builder-classic-results.json"}. Source-body/injected-boundary results establish the stated mechanism, not live provider qualification.

## AUD-0133: Preliminary image verifier does not compare the recorded artifact hash

Status: **needs-more-evidence**. Security: **none**. Confidence: **medium**.

Evidence: [.github/skills/project-visual-storytelling/scripts/project-visual-storytelling.mjs:202](../.github/skills/project-visual-storytelling/scripts/project-visual-storytelling.mjs#L202); [.github/skills/project-visual-storytelling/scripts/project-visual-storytelling.mjs:762](../.github/skills/project-visual-storytelling/scripts/project-visual-storytelling.mjs#L762); [.github/skills/project-visual-storytelling/scripts/project-visual-storytelling.mjs:804](../.github/skills/project-visual-storytelling/scripts/project-visual-storytelling.mjs#L804); [.github/skills/project-visual-storytelling/references/renderer-contract.md:15](../.github/skills/project-visual-storytelling/references/renderer-contract.md#L15)

**Observed:** The unchanged public verify CLI exits zero and returns identical requires-review output for the original PNG and a different valid same-dimension PNG whose bytes disagree with result.json. It repeats provider/plan provenance without detecting the replacement.

**Expected:** If public verification is intended to validate the emitted artifact manifest, report image-byte drift before treating the candidate as the previously qualified render; otherwise explicitly expose that artifact identity is unchecked.

**Impact:** Candidate provenance and previously recorded hashes can silently diverge. The command still requires manual review and never grants complete or final approval.

**Resolution:** First establish whether manifest image identity is an intended requirement. Do not implement a purported final-approval bypass fix: that claim was not established.

**Containment recommendation (not executed):** Preserve mandatory human image review. A successful preliminary verify command is not final approval or proof that image bytes match a prior manifest.

**Verification:**
- Run the actual public verify command before and after replacing a valid PNG with another valid same-dimension PNG while retaining the original manifest.
- Ensure any strengthened integrity check preserves the separate manual-review requirement.

**Review rationale:** Public-CLI positive/control probes confirm identical requires-review outcomes for changed image bytes. The documented contract remains preliminary and does not promise hash identity; preserve medium confidence and request a boundary decision rather than calling this a confirmed defect.

**Limits:** Mechanism and public CLI behavior are corroborated; classification as a defect depends on whether manifest integrity belongs to the verifier's intended contract. Treat as a low-priority integrity-hardening/requirement gap if the deliberately narrower documented verifier is authoritative. This is not a claim that a replacement obtains final approval or bypasses manual review. The public CLI source is unchanged; only filesystem inputs are virtual and read-only. Likelihood preconditions: Conditional: a candidate is edited, overwritten, or replaced after the original result manifest was written. Private session reproduction (b9be041a-c060-4172-b294-67b388b84ba6): helpers-corroboration-results.json: visual-public-verify-replacement. Source-body/injected-boundary results establish the stated mechanism, not live provider qualification.

## AUD-0144: A flat directory bypasses the repository file-count limit

Status: **confirmed**. Security: **none**. Confidence: **high**.

Evidence: [.github/skills/project-understanding/scripts/project-understanding.mjs:57](../.github/skills/project-understanding/scripts/project-understanding.mjs#L57)

**Observed:** walk checks the 30000-file bound only when entering a directory. A single directory with 30001 eligible files is accepted.

**Expected:** Enforce the file-count bound before each accepted insertion.

**Impact:** The stated scan bound does not constrain flat directories, allowing excessive scan work and report growth.

**Resolution:** Check and enforce the maximum on each insertion, with an explicit inclusive boundary.

**Verification:**
- Test 29999, 30000, and 30001 eligible files in one directory and across nested directories.
- Assert the oversized scan fails before claiming complete coverage.

**Review rationale:** Confirmed root cause and stated consequence are supported by the exact current source and persisted deterministic reproduction. Trust-boundary, fault-injection and live/physical-platform limits are preserved. No severity or confidence was silently changed, and no external citation was invented.

**Limits:** The reproduction uses in-memory directory entries. Whole-file hashing and possible memory exhaustion are separate optional concerns, not part of this confirmed finding. Likelihood preconditions: Conditional: a large flat source or generated directory is not excluded. Private session reproduction (b9be041a-c060-4172-b294-67b388b84ba6): helpers-repro-results.json: understanding-flat-file-limit. Source-body/injected-boundary results establish the stated mechanism, not live provider qualification.

## AUD-0145: Default opted-in MCP services violate the environment schema

Status: **confirmed**. Security: **none**. Confidence: **high**.

Evidence: [.github/skills/azure-discovery/scripts/azure-environment.ps1:6](../.github/skills/azure-discovery/scripts/azure-environment.ps1#L6); [schemas/azure-environment.schema.json:55](../schemas/azure-environment.schema.json#L55)

**Observed:** The default service list contains get_azure_bestpractices, but the environment schema's service-name pattern rejects underscores.

**Expected:** Default supported configuration must validate against its owning schema.

**Impact:** Default MCP opt-in produces configuration rejected by a schema-respecting consumer or validator.

**Resolution:** Reconcile supported MCP service identifiers and schema syntax rather than weakening unrelated profile validation.

**Verification:**
- Schema-validate the complete default MCP-enabled profile and representative explicit service lists.
- Retain default-disabled and Foundry Extensions opt-in gate tests.

**Review rationale:** Confirmed root cause and stated consequence are supported by the exact current source and persisted deterministic reproduction. Trust-boundary, fault-injection and live/physical-platform limits are preserved. No severity or confidence was silently changed, and no external citation was invented.

**Limits:** The mismatch is confirmed statically from the actual default list and schema pattern; setup was not run. This is a contract defect, not authorization to invoke MCP or any cloud service. Likelihood preconditions: High when initial setup opts into the default MCP service list and schema validation is applied. Private session reproduction (b9be041a-c060-4172-b294-67b388b84ba6): helpers-repro-results.json: azure-default-mcp-schema-drift. Source-body/injected-boundary results establish the stated mechanism, not live provider qualification.

## Limitations and next state

- Read-only audit of the dirty worktree, not only HEAD. No source, policy, dependency, credential, accepted workflow event, tenant, deployment, publication, commit, or push was changed.
- The dedicated agent-deployment source review failed at its provider with HTTP 422 and returned no completed result. It was not retried or rerouted. Deployment-related repository tests passed, but they do not replace the missing independent source review. No unpublished deployment probes are counted as evidence.
- Hosted GitHub controls/alerts/current workflow runs, remote-only refs, package registries/advisories, current external standards, and cloud/provider operations were not accessed because external access was not approved.
- Unreachable/pruned objects, remote forks/pull-request refs, hosted Actions logs/artifacts/releases/packages, issues/discussions/wikis, organizational controls, and caches outside the local scan boundary remain unassessed.
- The pinned Gitleaks run succeeded for its recorded pre-report input digest. Subsequent audit outputs change that digest (AUD-0108). The closing scan is BLOCKED by the production checkpoint failure in AUD-0146; reports/gitleaks-scan.json remains the earlier successful scan, not current post-publication evidence. No scan gate was bypassed and no broad report exclusions were introduced.
- Current standards retrieval is blocked. The nine required standards rows retain the previous report's unverified 2026-09-23 accessedAt metadata because schema 2.2 has no null/unretrieved date. This is NOT an assertion that the authoritative URLs were accessed on that date, and no date was refreshed. All rows are informational and blocked.
- Additional AI guidance was considered applicable or partly applicable: Microsoft SDL for AI and the conditional local catalog entries for OWASP GenAI LLM Top 10 2026, OWASP Agentic Top 10 2026, NIST AI RMF 1.0, and NIST AI 600-1. Their current versions/URLs were not externally verified; no authoritative access dates or conformance rows were fabricated.
- PowerShell parsing is syntax-only. PSScriptAnalyzer and CodeQL CLI were unavailable. No independent Bicep compiler/policy-analyzer or generated-application type-check evidence was collected. No scanner or package was installed.
- Fault injection uses original controlling functions with virtual filesystems or transport/process doubles. It does not qualify physical disk exhaustion, ACL/junction/symlink races, crash recovery on every filesystem, live cancellation/process-tree handling, or real cloud/device behavior.
- No load, heap/handle, real-browser accessibility/device, production trace, or cross-platform qualification was performed. Performance findings concern demonstrable bounds, not invented benchmark results.
- The first isolated npm gate failed 15 video cases at very long Windows fixture paths with unsigned-script diagnostics. The same source passed a short-path control and the complete gate after relocation; no execution policy or source change was made. Both logs are retained.
- The final gate skipped one canonical-root-alias test because the temporary directory had no filesystem alias. It verified an unsigned candidate only, not a signed or independently approved production release.
- Historical continuity reports remain September 22 snapshots, not current delivery authority. The already-documented joined JSONL records at physical line 71 of reports/execution-log.jsonl remain unchanged; full historical replay is not certified.
- Empty external-reference arrays are intentional: proposed repairs are grounded in repository code and deterministic observations, not fabricated fresh citations. Approved standards/advisory retrieval and completion of blocked coverage are required before stronger assurance.
- After the new reports were copied into the identical-source isolated snapshot, the focused audit/contract run had 38 passed, 1 failed, 1 skipped. AUD-0146 explains the required checkpoint failure on a diff exceeding Node's one-MiB default. The earlier full gate's 454/0/1 result predates report publication and is not a claim that the final repository gate is green.
- Review corroboration is based on persisted exact-source fingerprints, deterministic reproductions, actual exported/public CLI paths where feasible, and actual local schema validation. Modeled boundaries are explicitly identified; passing tests are not substituted for negative evidence.
- H06 / AUD-0133 remains needs-more-evidence: the documented preliminary verifier does not explicitly promise image-hash validation and still mandates human review. Its absence of digest comparison is confirmed, but a required-contract defect or final-approval bypass is not established. No implementation is scheduled for it.

State: **approval-wait**. This audit does not authorize implementation, external retrieval, tenant operations, publication, commits or pushes. Accepted execution-history records and unrelated prior work remain untouched.
