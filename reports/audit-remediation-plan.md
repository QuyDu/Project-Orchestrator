# Audit Remediation Plan

Audit run: `b9be041a-c060-4172-b294-67b388b84ba6`. Generated: 2026-09-30T23:30:25.340Z.

**Approval-wait: 45 proposed implementation items, one unscheduled scope question. No remediation performed.** The current checkpoint and closing scan are blocked by AUD-0146.

[Authoritative plan](audit-remediation-plan.json) | [Reviewed findings](code-audit-review.md) | [Review JSON](code-audit-review.json)

Bound source review SHA-256: `f155e2fa51550be12a5cd0aad411fa25198dcfc398d81162ea7401ba4ed104da`.

Security severity and implementation priority are separate. Several non-security rollback defects are high priority because they can lose existing files. All roles below are proposed and unassigned.

## Milestones and dependency order

- **M1: Repair checkpoint capacity and audit evidence lifecycle; verify execution prerequisites** - REM-0146, REM-0108.
- **M2: Protect existing files and enforce highest-priority local boundaries** - REM-0106, REM-0128, REM-0110, REM-0111, REM-0122, REM-0129, REM-0130, REM-0131.
- **M3: Close remaining confirmed security/privacy weaknesses** - REM-0121, REM-0115, REM-0116, REM-0137, REM-0138.
- **M4: Restore compatible runtime, agent, media, grounding and artifact behavior** - REM-0101, REM-0102, REM-0103, REM-0104, REM-0105, REM-0107, REM-0109, REM-0112, REM-0114, REM-0117, REM-0118, REM-0120, REM-0123, REM-0125, REM-0126, REM-0127, REM-0134, REM-0135, REM-0136, REM-0139, REM-0142, REM-0143, REM-0113, REM-0124, REM-0132, REM-0140, REM-0141.
- **M5: Complete lower-frequency bounds and schema repairs** - REM-0119, REM-0144, REM-0145.

Every item requires approval. Dependencies do not authorize work. Check current plan/state, policy and immutable history before starting; do not reuse historical delivery approval.

| Item | Finding | Priority | Security | Complexity | Owner role |
|---|---|---|---|---|---|
| REM-0146 | AUD-0146 | P1 | none | high | audit-code maintainer (proposed role; unassigned) |
| REM-0108 | AUD-0108 | P1 | none | high | audit-code maintainer (proposed role; unassigned) |
| REM-0106 | AUD-0106 | P1 | medium | medium | live-chat-interaction maintainer (proposed role; unassigned) |
| REM-0128 | AUD-0128 | P1 | medium | low | project-video maintainer (proposed role; unassigned) |
| REM-0110 | AUD-0110 | P1 | none | high | agent-builder maintainer (proposed role; unassigned) |
| REM-0111 | AUD-0111 | P1 | none | high | agent-builder maintainer (proposed role; unassigned) |
| REM-0122 | AUD-0122 | P1 | none | high | Framework runtime/release maintainer (proposed role; unassigned) |
| REM-0129 | AUD-0129 | P1 | none | high | project-visual-storytelling maintainer (proposed role; unassigned) |
| REM-0130 | AUD-0130 | P1 | none | high | project-understanding + project-video maintainer (proposed role; unassigned) |
| REM-0131 | AUD-0131 | P1 | none | high | project-video maintainer (proposed role; unassigned) |
| REM-0121 | AUD-0121 | P2 | medium | low | Framework runtime/release maintainer (proposed role; unassigned) |
| REM-0115 | AUD-0115 | P2 | low | medium | agent-builder maintainer (proposed role; unassigned) |
| REM-0116 | AUD-0116 | P2 | low | medium | agent-builder maintainer (proposed role; unassigned) |
| REM-0137 | AUD-0137 | P2 | low | low | user-personalization maintainer (proposed role; unassigned) |
| REM-0138 | AUD-0138 | P2 | low | medium | user-personalization maintainer (proposed role; unassigned) |
| REM-0101 | AUD-0101 | P2 | none | low | live-chat-interaction maintainer (proposed role; unassigned) |
| REM-0102 | AUD-0102 | P2 | none | low | live-chat-interaction maintainer (proposed role; unassigned) |
| REM-0103 | AUD-0103 | P2 | none | low | live-chat-interaction maintainer (proposed role; unassigned) |
| REM-0104 | AUD-0104 | P2 | none | low | live-chat-interaction maintainer (proposed role; unassigned) |
| REM-0105 | AUD-0105 | P2 | none | low | live-chat-interaction maintainer (proposed role; unassigned) |
| REM-0107 | AUD-0107 | P2 | none | low | live-chat-interaction maintainer (proposed role; unassigned) |
| REM-0109 | AUD-0109 | P2 | none | medium | azure-cleanup maintainer (proposed role; unassigned) |
| REM-0112 | AUD-0112 | P2 | none | medium | agent-builder maintainer (proposed role; unassigned) |
| REM-0114 | AUD-0114 | P2 | none | medium | agent-builder maintainer (proposed role; unassigned) |
| REM-0117 | AUD-0117 | P2 | none | medium | agent-builder maintainer (proposed role; unassigned) |
| REM-0118 | AUD-0118 | P2 | none | low | agent-builder maintainer (proposed role; unassigned) |
| REM-0120 | AUD-0120 | P2 | none | low | agent-builder maintainer (proposed role; unassigned) |
| REM-0123 | AUD-0123 | P2 | none | low | Framework runtime/release maintainer (proposed role; unassigned) |
| REM-0125 | AUD-0125 | P2 | none | low | Framework runtime/release maintainer (proposed role; unassigned) |
| REM-0126 | AUD-0126 | P2 | none | medium | Framework runtime/release maintainer (proposed role; unassigned) |
| REM-0127 | AUD-0127 | P2 | none | low | Framework runtime/release maintainer (proposed role; unassigned) |
| REM-0134 | AUD-0134 | P2 | none | low | project-video maintainer (proposed role; unassigned) |
| REM-0135 | AUD-0135 | P2 | none | medium | project-video maintainer (proposed role; unassigned) |
| REM-0136 | AUD-0136 | P2 | none | low | azure-discovery maintainer (proposed role; unassigned) |
| REM-0139 | AUD-0139 | P2 | none | low | project-status maintainer (proposed role; unassigned) |
| REM-0142 | AUD-0142 | P2 | none | medium | documentation-builder + project-understanding maintainer (proposed role; unassigned) |
| REM-0143 | AUD-0143 | P2 | none | medium | project-video + project-visual-storytelling maintainer (proposed role; unassigned) |
| REM-0113 | AUD-0113 | P2 | none | high | agent-builder maintainer (proposed role; unassigned) |
| REM-0124 | AUD-0124 | P2 | none | medium | Framework runtime/release maintainer (proposed role; unassigned) |
| REM-0132 | AUD-0132 | P2 | none | medium | project-visual-storytelling maintainer (proposed role; unassigned) |
| REM-0140 | AUD-0140 | P2 | none | medium | documentation-builder maintainer (proposed role; unassigned) |
| REM-0141 | AUD-0141 | P2 | none | medium | documentation-builder maintainer (proposed role; unassigned) |
| REM-0119 | AUD-0119 | P3 | none | medium | agent-builder maintainer (proposed role; unassigned) |
| REM-0144 | AUD-0144 | P3 | none | low | project-understanding maintainer (proposed role; unassigned) |
| REM-0145 | AUD-0145 | P3 | none | medium | azure-discovery maintainer (proposed role; unassigned) |

## REM-0146: Checkpoint collection fails when a legitimate Git diff exceeds one MiB

Finding: AUD-0146. Depends on: none. Approval: **required**.

**Proposed files:**
- [.github/prompts/audit-code-help.prompt.md](../.github/prompts/audit-code-help.prompt.md)
- [.github/skills/audit-code/SKILL.md](../.github/skills/audit-code/SKILL.md)
- [.github/skills/audit-code/scripts/audit-evidence.mjs](../.github/skills/audit-code/scripts/audit-evidence.mjs)
- [.github/skills/audit-code/scripts/audit-validate.mjs](../.github/skills/audit-code/scripts/audit-validate.mjs)
- [tests/audit-assurance.test.mjs](../tests/audit-assurance.test.mjs)
- [tests/audit-execution.test.mjs](../tests/audit-execution.test.mjs)
- [tests/skill-contracts.test.mjs](../tests/skill-contracts.test.mjs)

**Implementation:**
1. Obtain explicit approval for this exact finding, files and intended behavior. Before editing any existing skill package, route its named owner through skill-update and its required proceed gate; expand scope only with a revised approved proposal.
2. Add the smallest durable red regression reproducing AUD-0146; use the recorded controlled conditions without credentials, live providers, or destructive real-project fixtures.
3. Use bounded incremental subprocess-output hashing or safe spooling, preserve the exact existing digest semantics, and report subprocess errors explicitly without echoing raw diff content. Treat an explicit resource ceiling as a documented failure condition, not an undocumented one-MiB default. Do not exclude audit reports or reduce findings to evade the defect.
4. Keep directly related owner guidance/help accurate, reuse existing compatible helpers, and avoid unrelated changes or a broad refactor.
5. Run the focused regression and positive/compatibility controls, then the full native gate in a short-path isolated snapshot. Validate emitted artifacts with actual local schemas, review the bounded diff, and publish only owner-approved local evidence.

**Acceptance:**
- Exercise the actual checkpoint command with tracked textual and binary diffs below, at and above one MiB; compare its successful digest against an independent complete-byte reference.
- Run audit-evidence and the pinned offline scanner against the large worktree and require valid metadata/checkpoint/digest results.
- Run the post-report audit/contract suites with the complete current findings, review and plan, preserving all IDs and evidence.
- Inject a real subprocess failure and confirm an actionable sanitized diagnostic rather than truncated output or a success-shaped fallback.
- Supported success paths remain correct; intentional rejection changes are explicit and safely diagnosed.
- No unrelated source/user data/accepted history changes, widened tools/permissions, new external calls, silent fallback or false success claim.

**Verification:**
- node --test tests\audit-assurance.test.mjs tests\audit-execution.test.mjs tests\skill-contracts.test.mjs
- npm run check
- Validate affected produced JSON against its actual schema; inspect preserved originals and safe diagnostics on negative paths.

**Rollout:** After exact owner/file approval, add a failing focused regression, implement the bounded repair, verify adjacent behavior, actual artifact schemas and the full local gate, then use the normal governed project-update path.

**Rollback:** Revert only the approved implementation change after review if regressions appear. Keep user data, existing outputs and accepted evidence/history unchanged; do not reset the shared worktree or weaken the relevant guard.

**Residual risk:** Only the stated root cause is addressed. Other confirmed findings, blocked deployment review, hosted/advisory/standards gaps and unqualified physical/live behavior remain. Security assurance must be reassessed after evidence refresh.

## REM-0108: Publishing audit evidence invalidates the secret-scan binding it certifies

Finding: AUD-0108. Depends on: REM-0146. Approval: **required**.

**Proposed files:**
- [.github/prompts/audit-code-help.prompt.md](../.github/prompts/audit-code-help.prompt.md)
- [.github/skills/audit-code/SKILL.md](../.github/skills/audit-code/SKILL.md)
- [.github/skills/audit-code/scripts/audit-evidence.mjs](../.github/skills/audit-code/scripts/audit-evidence.mjs)
- [.github/skills/audit-code/scripts/gitleaks-scan.mjs](../.github/skills/audit-code/scripts/gitleaks-scan.mjs)
- [tests/audit-assurance.test.mjs](../tests/audit-assurance.test.mjs)
- [tests/audit-execution.test.mjs](../tests/audit-execution.test.mjs)
- [tests/skill-contracts.test.mjs](../tests/skill-contracts.test.mjs)

**Implementation:**
1. Obtain explicit approval for this exact finding, files and intended behavior. Before editing any existing skill package, route its named owner through skill-update and its required proceed gate; expand scope only with a revised approved proposal.
2. Add the smallest durable red regression reproducing AUD-0108; use the recorded controlled conditions without credentials, live providers, or destructive real-project fixtures.
3. Separate immutable assessed-input identity from generated audit outputs, while retaining secret scans of tracked reports and independently hashing/scanning new outputs. Do not broadly exempt all reports or weaken source-drift detection.
4. Keep directly related owner guidance/help accurate, reuse existing compatible helpers, and avoid unrelated changes or a broad refactor.
5. Run the focused regression and positive/compatibility controls, then the full native gate in a short-path isolated snapshot. Validate emitted artifacts with actual local schemas, review the bounded diff, and publish only owner-approved local evidence.

**Acceptance:**
- Scan a stable fixture, generate evidence, and repeat evidence inspection; completion must remain stable without rescanning unchanged source. A real source or pre-existing report change must still invalidate freshness.
- Supported success paths remain correct; intentional rejection changes are explicit and safely diagnosed.
- No unrelated source/user data/accepted history changes, widened tools/permissions, new external calls, silent fallback or false success claim.

**Verification:**
- node --test tests\audit-assurance.test.mjs tests\audit-execution.test.mjs tests\skill-contracts.test.mjs
- npm run check
- Validate affected produced JSON against its actual schema; inspect preserved originals and safe diagnostics on negative paths.

**Rollout:** After exact owner/file approval, add a failing focused regression, implement the bounded repair, verify adjacent behavior, actual artifact schemas and the full local gate, then use the normal governed project-update path.

**Rollback:** Revert only the approved implementation change after review if regressions appear. Keep user data, existing outputs and accepted evidence/history unchanged; do not reset the shared worktree or weaken the relevant guard.

**Residual risk:** Only the stated root cause is addressed. Other confirmed findings, blocked deployment review, hosted/advisory/standards gaps and unqualified physical/live behavior remain. Security assurance must be reassessed after evidence refresh.

## REM-0106: Declared provider response-token ceiling is not enforced

Finding: AUD-0106. Depends on: REM-0108. Approval: **required**.

**Proposed files:**
- [.github/prompts/live-chat-interaction-help.prompt.md](../.github/prompts/live-chat-interaction-help.prompt.md)
- [.github/skills/live-chat-interaction/SKILL.md](../.github/skills/live-chat-interaction/SKILL.md)
- [README.md](../README.md)
- [templates/project/.skills-orchestrator/live-chat/server/provider-adapter.mjs](../templates/project/.skills-orchestrator/live-chat/server/provider-adapter.mjs)
- [tests/live-chat-provider-adapter.test.mjs](../tests/live-chat-provider-adapter.test.mjs)
- [tests/skill-contracts.test.mjs](../tests/skill-contracts.test.mjs)

**Implementation:**
1. Obtain explicit approval for this exact finding, files and intended behavior. Before editing any existing skill package, route its named owner through skill-update and its required proceed gate; expand scope only with a revised approved proposal.
2. Add the smallest durable red regression reproducing AUD-0106; use the recorded controlled conditions without credentials, live providers, or destructive real-project fixtures.
3. Enforce a provider-supported output token option and local streaming bounds at the single server adapter, with cancellation and resource cleanup when exceeded. Validate budget inputs as finite nonnegative values.
4. Update affected producer/runtime/schema/template/help contracts together and extend tests/skill-contracts.test.mjs. Preserve supported legacy inputs and explicitly migrate or reject unsupported state.
5. Run the focused regression and positive/compatibility controls, then the full native gate in a short-path isolated snapshot. Validate emitted artifacts with actual local schemas, review the bounded diff, and publish only owner-approved local evidence.

**Acceptance:**
- Capture the outgoing fake request and assert the configured model-compatible limit; stream oversized unterminated lines and excessive deltas and verify bounded failure before accumulation or further yields.
- Supported success paths remain correct; intentional rejection changes are explicit and safely diagnosed.
- No unrelated source/user data/accepted history changes, widened tools/permissions, new external calls, silent fallback or false success claim.

**Verification:**
- node --test tests\live-chat-provider-adapter.test.mjs
- npm run check
- Validate affected produced JSON against its actual schema; inspect preserved originals and safe diagnostics on negative paths.

**Rollout:** After approval, update the shipped template and focused local tests; keep provider/device work offline and gated. Existing target projects require explicit managed updates rather than silent retrofit.

**Rollback:** Revert only the approved implementation change after review if regressions appear. Keep user data, existing outputs and accepted evidence/history unchanged; do not reset the shared worktree or weaken the relevant guard.

**Residual risk:** Only the stated root cause is addressed. Other confirmed findings, blocked deployment review, hosted/advisory/standards gaps and unqualified physical/live behavior remain. Security assurance must be reassessed after evidence refresh.

## REM-0128: Pinned FFmpeg executes before its integrity check

Finding: AUD-0128. Depends on: REM-0108. Approval: **required**.

**Proposed files:**
- [.github/prompts/project-video-help.prompt.md](../.github/prompts/project-video-help.prompt.md)
- [.github/skills/project-video/SKILL.md](../.github/skills/project-video/SKILL.md)
- [.github/skills/project-video/scripts/project-video.mjs](../.github/skills/project-video/scripts/project-video.mjs)
- [tests/project-video.test.mjs](../tests/project-video.test.mjs)

**Implementation:**
1. Obtain explicit approval for this exact finding, files and intended behavior. Before editing any existing skill package, route its named owner through skill-update and its required proceed gate; expand scope only with a revised approved proposal.
2. Add the smallest durable red regression reproducing AUD-0128; use the recorded controlled conditions without credentials, live providers, or destructive real-project fixtures.
3. Validate the pinned manifest, approved binary digest, and safe file identity before invoking the executable; do not silently substitute another renderer for a rejected explicit choice.
4. Keep directly related owner guidance/help accurate, reuse existing compatible helpers, and avoid unrelated changes or a broad refactor.
5. Run the focused regression and positive/compatibility controls, then the full native gate in a short-path isolated snapshot. Validate emitted artifacts with actual local schemas, review the bounded diff, and publish only owner-approved local evidence.

**Acceptance:**
- Replace only the pinned binary while retaining the approved manifest; assert rejection and zero process launches.
- Cover missing and invalid manifests before the version probe.
- Supported success paths remain correct; intentional rejection changes are explicit and safely diagnosed.
- No unrelated source/user data/accepted history changes, widened tools/permissions, new external calls, silent fallback or false success claim.

**Verification:**
- node --test tests\project-video.test.mjs
- npm run check
- Validate affected produced JSON against its actual schema; inspect preserved originals and safe diagnostics on negative paths.

**Rollout:** After exact owner/file approval, add a failing focused regression, implement the bounded repair, verify adjacent behavior, actual artifact schemas and the full local gate, then use the normal governed project-update path.

**Rollback:** Revert only the approved implementation change after review if regressions appear. Keep user data, existing outputs and accepted evidence/history unchanged; do not reset the shared worktree or weaken the relevant guard.

**Residual risk:** Only the stated root cause is addressed. Other confirmed findings, blocked deployment review, hosted/advisory/standards gaps and unqualified physical/live behavior remain. Security assurance must be reassessed after evidence refresh.

## REM-0110: Pre-write failure can delete the existing agent

Finding: AUD-0110. Depends on: REM-0108. Approval: **required**.

**Proposed files:**
- [.github/prompts/agent-builder-help.prompt.md](../.github/prompts/agent-builder-help.prompt.md)
- [.github/skills/agent-builder/SKILL.md](../.github/skills/agent-builder/SKILL.md)
- [.github/skills/agent-builder/scripts/agent-builder.mjs](../.github/skills/agent-builder/scripts/agent-builder.mjs)
- [tests/agent-builder.test.mjs](../tests/agent-builder.test.mjs)
- [tests/native-copilot-studio.test.mjs](../tests/native-copilot-studio.test.mjs)

**Implementation:**
1. Obtain explicit approval for this exact finding, files and intended behavior. Before editing any existing skill package, route its named owner through skill-update and its required proceed gate; expand scope only with a revised approved proposal.
2. Add the smallest durable red regression reproducing AUD-0110; use the recorded controlled conditions without credentials, live providers, or destructive real-project fixtures.
3. Distinguish completed backup creation from actual target replacement and roll back only writes owned by this invocation.
4. Keep directly related owner guidance/help accurate, reuse existing compatible helpers, and avoid unrelated changes or a broad refactor.
5. Run the focused regression and positive/compatibility controls, then the full native gate in a short-path isolated snapshot. Validate emitted artifacts with actual local schemas, review the bounded diff, and publish only owner-approved local evidence.

**Acceptance:**
- Inject failures at all three observed boundaries; assert original/current target bytes remain, no target rename occurred, and original errors are preserved.
- Supported success paths remain correct; intentional rejection changes are explicit and safely diagnosed.
- No unrelated source/user data/accepted history changes, widened tools/permissions, new external calls, silent fallback or false success claim.

**Verification:**
- node --test tests\agent-builder.test.mjs tests\native-copilot-studio.test.mjs
- npm run check
- Validate affected produced JSON against its actual schema; inspect preserved originals and safe diagnostics on negative paths.

**Rollout:** After exact agent-builder approval, exercise both classic and native paths with preserved legacy blueprint interfaces. Apply only to temporary fixtures first; existing agent installations need their own reviewed update.

**Rollback:** If validation fails, stop before applying to real destinations and roll back only the approved source patch. Preserve originals, concurrent edits, incomplete journals and surviving backups; never delete them merely to make rollback look successful.

**Residual risk:** Only the stated root cause is addressed. Other confirmed findings, blocked deployment review, hosted/advisory/standards gaps and unqualified physical/live behavior remain. Security assurance must be reassessed after evidence refresh.

## REM-0111: Native build overwrites an input spec that aliases an output

Finding: AUD-0111. Depends on: REM-0108. Approval: **required**.

**Proposed files:**
- [.github/prompts/agent-builder-help.prompt.md](../.github/prompts/agent-builder-help.prompt.md)
- [.github/skills/agent-builder/SKILL.md](../.github/skills/agent-builder/SKILL.md)
- [.github/skills/agent-builder/scripts/native-studio.mjs](../.github/skills/agent-builder/scripts/native-studio.mjs)
- [tests/agent-builder.test.mjs](../tests/agent-builder.test.mjs)
- [tests/native-copilot-studio.test.mjs](../tests/native-copilot-studio.test.mjs)

**Implementation:**
1. Obtain explicit approval for this exact finding, files and intended behavior. Before editing any existing skill package, route its named owner through skill-update and its required proceed gate; expand scope only with a revised approved proposal.
2. Add the smallest durable red regression reproducing AUD-0111; use the recorded controlled conditions without credentials, live providers, or destructive real-project fixtures.
3. Preflight canonical input/output aliases, including Windows case-insensitive aliases, before PAC or artifact writes.
4. Keep directly related owner guidance/help accurate, reuse existing compatible helpers, and avoid unrelated changes or a broad refactor.
5. Run the focused regression and positive/compatibility controls, then the full native gate in a short-path isolated snapshot. Validate emitted artifacts with actual local schemas, review the bounded diff, and publish only owner-approved local evidence.

**Acceptance:**
- Exercise both spec aliases and authored-input aliases; reject without changing any input or existing output.
- Supported success paths remain correct; intentional rejection changes are explicit and safely diagnosed.
- No unrelated source/user data/accepted history changes, widened tools/permissions, new external calls, silent fallback or false success claim.

**Verification:**
- node --test tests\agent-builder.test.mjs tests\native-copilot-studio.test.mjs
- npm run check
- Validate affected produced JSON against its actual schema; inspect preserved originals and safe diagnostics on negative paths.

**Rollout:** After exact agent-builder approval, exercise both classic and native paths with preserved legacy blueprint interfaces. Apply only to temporary fixtures first; existing agent installations need their own reviewed update.

**Rollback:** If validation fails, stop before applying to real destinations and roll back only the approved source patch. Preserve originals, concurrent edits, incomplete journals and surviving backups; never delete them merely to make rollback look successful.

**Residual risk:** Only the stated root cause is addressed. Other confirmed findings, blocked deployment review, hosted/advisory/standards gaps and unqualified physical/live behavior remain. Security assurance must be reassessed after evidence refresh.

## REM-0122: Adoption rollback leaves the newly written baseline lock

Finding: AUD-0122. Depends on: REM-0108. Approval: **required**.

**Proposed files:**
- [README.md](../README.md)
- [pso.mjs](../pso.mjs)
- [tests/adoption-rerun.test.mjs](../tests/adoption-rerun.test.mjs)

**Implementation:**
1. Obtain explicit approval for this exact finding, files and intended behavior. Before editing any existing skill package, route its named owner through skill-update and its required proceed gate; expand scope only with a revised approved proposal.
2. Add the smallest durable red regression reproducing AUD-0122; use the recorded controlled conditions without credentials, live providers, or destructive real-project fixtures.
3. Journal the baseline lock and all unconditionally written metadata before any adoption mutation.
4. Keep directly related owner guidance/help accurate, reuse existing compatible helpers, and avoid unrelated changes or a broad refactor.
5. Run the focused regression and positive/compatibility controls, then the full native gate in a short-path isolated snapshot. Validate emitted artifacts with actual local schemas, review the bounded diff, and publish only owner-approved local evidence.

**Acceptance:**
- Inject failure after the lock write and interrupt at the same point; verify byte-exact pair restoration and successful subsequent update planning.
- Supported success paths remain correct; intentional rejection changes are explicit and safely diagnosed.
- No unrelated source/user data/accepted history changes, widened tools/permissions, new external calls, silent fallback or false success claim.

**Verification:**
- node --test tests\adoption-rerun.test.mjs
- npm run check
- Validate affected produced JSON against its actual schema; inspect preserved originals and safe diagnostics on negative paths.

**Rollout:** After explicit approval, test a copy of a generated/adopted project across supported manifest versions, then rerun the native update/adoption/release regressions and full gate. Do not automatically modify existing projects or publish a release.

**Rollback:** If validation fails, stop before applying to real destinations and roll back only the approved source patch. Preserve originals, concurrent edits, incomplete journals and surviving backups; never delete them merely to make rollback look successful.

**Residual risk:** Only the stated root cause is addressed. Other confirmed findings, blocked deployment review, hosted/advisory/standards gaps and unqualified physical/live behavior remain. Security assurance must be reassessed after evidence refresh.

## REM-0129: Failed rerender removes artifacts owned by an earlier invocation

Finding: AUD-0129. Depends on: REM-0108. Approval: **required**.

**Proposed files:**
- [.github/prompts/project-visual-storytelling-help.prompt.md](../.github/prompts/project-visual-storytelling-help.prompt.md)
- [.github/skills/project-visual-storytelling/SKILL.md](../.github/skills/project-visual-storytelling/SKILL.md)
- [.github/skills/project-visual-storytelling/scripts/azure-openai-image-render.mjs](../.github/skills/project-visual-storytelling/scripts/azure-openai-image-render.mjs)
- [.github/skills/project-visual-storytelling/scripts/project-visual-storytelling.mjs](../.github/skills/project-visual-storytelling/scripts/project-visual-storytelling.mjs)
- [tests/project-visual-storytelling.test.mjs](../tests/project-visual-storytelling.test.mjs)

**Implementation:**
1. Obtain explicit approval for this exact finding, files and intended behavior. Before editing any existing skill package, route its named owner through skill-update and its required proceed gate; expand scope only with a revised approved proposal.
2. Add the smallest durable red regression reproducing AUD-0129; use the recorded controlled conditions without credentials, live providers, or destructive real-project fixtures.
3. Preflight existing outputs before external work, reserve the run, stage unique files, and remove only invocation-owned creations on failure.
4. Keep directly related owner guidance/help accurate, reuse existing compatible helpers, and avoid unrelated changes or a broad refactor.
5. Run the focused regression and positive/compatibility controls, then the full native gate in a short-path isolated snapshot. Validate emitted artifacts with actual local schemas, review the bounded diff, and publish only owner-approved local evidence.

**Acceptance:**
- Rerender a run with an existing image/report and inject EEXIST and transport failures; assert original bytes remain.
- Exercise two writers targeting one run and prevent loser cleanup from deleting winner outputs.
- Supported success paths remain correct; intentional rejection changes are explicit and safely diagnosed.
- No unrelated source/user data/accepted history changes, widened tools/permissions, new external calls, silent fallback or false success claim.

**Verification:**
- node --test tests\project-visual-storytelling.test.mjs
- npm run check
- Validate affected produced JSON against its actual schema; inspect preserved originals and safe diagnostics on negative paths.

**Rollout:** After owner approval, fault-test publication and recovery in isolated copies before normal successful replacement. Keep prior generation backups until commit is verified; no billable provider operation is required for regressions.

**Rollback:** If validation fails, stop before applying to real destinations and roll back only the approved source patch. Preserve originals, concurrent edits, incomplete journals and surviving backups; never delete them merely to make rollback look successful.

**Residual risk:** Only the stated root cause is addressed. Other confirmed findings, blocked deployment review, hosted/advisory/standards gaps and unqualified physical/live behavior remain. Security assurance must be reassessed after evidence refresh.

## REM-0130: Incomplete rollback deletes the remaining recovery backups

Finding: AUD-0130. Depends on: REM-0108. Approval: **required**.

**Proposed files:**
- [.github/prompts/project-understanding-help.prompt.md](../.github/prompts/project-understanding-help.prompt.md)
- [.github/prompts/project-video-help.prompt.md](../.github/prompts/project-video-help.prompt.md)
- [.github/skills/project-understanding/SKILL.md](../.github/skills/project-understanding/SKILL.md)
- [.github/skills/project-understanding/scripts/project-understanding.mjs](../.github/skills/project-understanding/scripts/project-understanding.mjs)
- [.github/skills/project-video/SKILL.md](../.github/skills/project-video/SKILL.md)
- [.github/skills/project-video/scripts/project-video.mjs](../.github/skills/project-video/scripts/project-video.mjs)
- [tests/project-understanding.test.mjs](../tests/project-understanding.test.mjs)
- [tests/project-video.test.mjs](../tests/project-video.test.mjs)

**Implementation:**
1. Obtain explicit approval for this exact finding, files and intended behavior. Before editing any existing skill package, route its named owner through skill-update and its required proceed gate; expand scope only with a revised approved proposal.
2. Add the smallest durable red regression reproducing AUD-0130; use the recorded controlled conditions without credentials, live providers, or destructive real-project fixtures.
3. Distinguish committed, rolled-back, and recovery-required states; retain backups and aggregate failures unless restoration or commitment was verified.
4. Keep directly related owner guidance/help accurate, reuse existing compatible helpers, and avoid unrelated changes or a broad refactor.
5. Run the focused regression and positive/compatibility controls, then the full native gate in a short-path isolated snapshot. Validate emitted artifacts with actual local schemas, review the bounded diff, and publish only owner-approved local evidence.

**Acceptance:**
- Fault-inject every publish, restore, and backup-cleanup step; incomplete rollback must leave recoverable originals.
- Reproduce both preview-rollback-destroys-backups and understanding-rollback-destroys-backups.
- Supported success paths remain correct; intentional rejection changes are explicit and safely diagnosed.
- No unrelated source/user data/accepted history changes, widened tools/permissions, new external calls, silent fallback or false success claim.

**Verification:**
- node --test tests\project-understanding.test.mjs tests\project-video.test.mjs
- npm run check
- Validate affected produced JSON against its actual schema; inspect preserved originals and safe diagnostics on negative paths.

**Rollout:** After owner approval, fault-test publication and recovery in isolated copies before normal successful replacement. Keep prior generation backups until commit is verified; no billable provider operation is required for regressions.

**Rollback:** If validation fails, stop before applying to real destinations and roll back only the approved source patch. Preserve originals, concurrent edits, incomplete journals and surviving backups; never delete them merely to make rollback look successful.

**Residual risk:** Only the stated root cause is addressed. Other confirmed findings, blocked deployment review, hosted/advisory/standards gaps and unqualified physical/live behavior remain. Security assurance must be reassessed after evidence refresh.

## REM-0131: Failed MP4 publication leaves a mixed-generation artifact set

Finding: AUD-0131. Depends on: REM-0130, REM-0108. Approval: **required**.

**Proposed files:**
- [.github/prompts/project-video-help.prompt.md](../.github/prompts/project-video-help.prompt.md)
- [.github/skills/project-video/SKILL.md](../.github/skills/project-video/SKILL.md)
- [.github/skills/project-video/scripts/project-video.mjs](../.github/skills/project-video/scripts/project-video.mjs)
- [tests/project-video.test.mjs](../tests/project-video.test.mjs)

**Implementation:**
1. Obtain explicit approval for this exact finding, files and intended behavior. Before editing any existing skill package, route its named owner through skill-update and its required proceed gate; expand scope only with a revised approved proposal.
2. Add the smallest durable red regression reproducing AUD-0131; use the recorded controlled conditions without credentials, live providers, or destructive real-project fixtures.
3. Stage the complete artifact set, retain old-generation backups, and use a durable commit/recovery point for all three outputs.
4. Keep directly related owner guidance/help accurate, reuse existing compatible helpers, and avoid unrelated changes or a broad refactor.
5. Run the focused regression and positive/compatibility controls, then the full native gate in a short-path isolated snapshot. Validate emitted artifacts with actual local schemas, review the bounded diff, and publish only owner-approved local evidence.

**Acceptance:**
- Inject failures after MP4 installation and before source/manifest installation; preserve a complete old or new set with recoverable evidence.
- Verify every published manifest hash matches the installed output after recovery.
- Supported success paths remain correct; intentional rejection changes are explicit and safely diagnosed.
- No unrelated source/user data/accepted history changes, widened tools/permissions, new external calls, silent fallback or false success claim.

**Verification:**
- node --test tests\project-video.test.mjs
- npm run check
- Validate affected produced JSON against its actual schema; inspect preserved originals and safe diagnostics on negative paths.

**Rollout:** After owner approval, fault-test publication and recovery in isolated copies before normal successful replacement. Keep prior generation backups until commit is verified; no billable provider operation is required for regressions.

**Rollback:** If validation fails, stop before applying to real destinations and roll back only the approved source patch. Preserve originals, concurrent edits, incomplete journals and surviving backups; never delete them merely to make rollback look successful.

**Residual risk:** Only the stated root cause is addressed. Other confirmed findings, blocked deployment review, hosted/advisory/standards gaps and unqualified physical/live behavior remain. Security assurance must be reassessed after evidence refresh.

## REM-0121: Checksum symlink target is read and echoed before link rejection

Finding: AUD-0121. Depends on: REM-0108. Approval: **required**.

**Proposed files:**
- [README.md](../README.md)
- [scripts/verify-release.mjs](../scripts/verify-release.mjs)
- [tests/production-gates.test.mjs](../tests/production-gates.test.mjs)

**Implementation:**
1. Obtain explicit approval for this exact finding, files and intended behavior. Before editing any existing skill package, route its named owner through skill-update and its required proceed gate; expand scope only with a revised approved proposal.
2. Add the smallest durable red regression reproducing AUD-0121; use the recorded controlled conditions without credentials, live providers, or destructive real-project fixtures.
3. Check the manifest leaf and every input path before reading; report line numbers or rule IDs instead of raw line contents.
4. Keep directly related owner guidance/help accurate, reuse existing compatible helpers, and avoid unrelated changes or a broad refactor.
5. Run the focused regression and positive/compatibility controls, then the full native gate in a short-path isolated snapshot. Validate emitted artifacts with actual local schemas, review the bounded diff, and publish only owner-approved local evidence.

**Acceptance:**
- Add platform-supported physical symlink tests and assert rejection before target read plus redacted error output.
- Supported success paths remain correct; intentional rejection changes are explicit and safely diagnosed.
- No unrelated source/user data/accepted history changes, widened tools/permissions, new external calls, silent fallback or false success claim.

**Verification:**
- node --test tests\production-gates.test.mjs
- npm run check
- Validate affected produced JSON against its actual schema; inspect preserved originals and safe diagnostics on negative paths.

**Rollout:** After explicit approval, test a copy of a generated/adopted project across supported manifest versions, then rerun the native update/adoption/release regressions and full gate. Do not automatically modify existing projects or publish a release.

**Rollback:** Revert only the approved implementation change after review if regressions appear. Keep user data, existing outputs and accepted evidence/history unchanged; do not reset the shared worktree or weaken the relevant guard.

**Residual risk:** Only the stated root cause is addressed. Other confirmed findings, blocked deployment review, hosted/advisory/standards gaps and unqualified physical/live behavior remain. Security assurance must be reassessed after evidence refresh.

## REM-0115: Native source comments bypass credential-material checks

Finding: AUD-0115. Depends on: REM-0108. Approval: **required**.

**Proposed files:**
- [.github/prompts/agent-builder-help.prompt.md](../.github/prompts/agent-builder-help.prompt.md)
- [.github/skills/agent-builder/SKILL.md](../.github/skills/agent-builder/SKILL.md)
- [.github/skills/agent-builder/scripts/native-studio.mjs](../.github/skills/agent-builder/scripts/native-studio.mjs)
- [tests/agent-builder.test.mjs](../tests/agent-builder.test.mjs)
- [tests/native-copilot-studio.test.mjs](../tests/native-copilot-studio.test.mjs)

**Implementation:**
1. Obtain explicit approval for this exact finding, files and intended behavior. Before editing any existing skill package, route its named owner through skill-update and its required proceed gate; expand scope only with a revised approved proposal.
2. Add the smallest durable red regression reproducing AUD-0115; use the recorded controlled conditions without credentials, live providers, or destructive real-project fixtures.
3. Inspect bounded raw source bytes, including comments, before copying while preserving originals and sanitized errors.
4. Keep directly related owner guidance/help accurate, reuse existing compatible helpers, and avoid unrelated changes or a broad refactor.
5. Run the focused regression and positive/compatibility controls, then the full native gate in a short-path isolated snapshot. Validate emitted artifacts with actual local schemas, review the bounded diff, and publish only owner-approved local evidence.

**Acceptance:**
- Generate canaries only at runtime, compare preserved/echoed booleans, and never record their values; require comment and scalar controls to block.
- Supported success paths remain correct; intentional rejection changes are explicit and safely diagnosed.
- No unrelated source/user data/accepted history changes, widened tools/permissions, new external calls, silent fallback or false success claim.

**Verification:**
- node --test tests\agent-builder.test.mjs tests\native-copilot-studio.test.mjs
- npm run check
- Validate affected produced JSON against its actual schema; inspect preserved originals and safe diagnostics on negative paths.

**Rollout:** After exact agent-builder approval, exercise both classic and native paths with preserved legacy blueprint interfaces. Apply only to temporary fixtures first; existing agent installations need their own reviewed update.

**Rollback:** Revert only the approved implementation change after review if regressions appear. Keep user data, existing outputs and accepted evidence/history unchanged; do not reset the shared worktree or weaken the relevant guard.

**Residual risk:** Only the stated root cause is addressed. Other confirmed findings, blocked deployment review, hosted/advisory/standards gaps and unqualified physical/live behavior remain. Security assurance must be reassessed after evidence refresh.

## REM-0116: Classic validation echoes credential-bearing rejected values

Finding: AUD-0116. Depends on: REM-0108. Approval: **required**.

**Proposed files:**
- [.github/prompts/agent-builder-help.prompt.md](../.github/prompts/agent-builder-help.prompt.md)
- [.github/skills/agent-builder/SKILL.md](../.github/skills/agent-builder/SKILL.md)
- [.github/skills/agent-builder/scripts/agent-builder.mjs](../.github/skills/agent-builder/scripts/agent-builder.mjs)
- [tests/agent-builder.test.mjs](../tests/agent-builder.test.mjs)
- [tests/native-copilot-studio.test.mjs](../tests/native-copilot-studio.test.mjs)

**Implementation:**
1. Obtain explicit approval for this exact finding, files and intended behavior. Before editing any existing skill package, route its named owner through skill-update and its required proceed gate; expand scope only with a revised approved proposal.
2. Add the smallest durable red regression reproducing AUD-0116; use the recorded controlled conditions without credentials, live providers, or destructive real-project fixtures.
3. Remove untrusted-value interpolation from diagnostics and retain field locations plus safe allowed-value descriptions.
4. Keep directly related owner guidance/help accurate, reuse existing compatible helpers, and avoid unrelated changes or a broad refactor.
5. Run the focused regression and positive/compatibility controls, then the full native gate in a short-path isolated snapshot. Validate emitted artifacts with actual local schemas, review the bounded diff, and publish only owner-approved local evidence.

**Acceptance:**
- Exercise main and fail, capture output in memory, and persist only rejected/echoed booleans.
- Supported success paths remain correct; intentional rejection changes are explicit and safely diagnosed.
- No unrelated source/user data/accepted history changes, widened tools/permissions, new external calls, silent fallback or false success claim.

**Verification:**
- node --test tests\agent-builder.test.mjs tests\native-copilot-studio.test.mjs
- npm run check
- Validate affected produced JSON against its actual schema; inspect preserved originals and safe diagnostics on negative paths.

**Rollout:** After exact agent-builder approval, exercise both classic and native paths with preserved legacy blueprint interfaces. Apply only to temporary fixtures first; existing agent installations need their own reviewed update.

**Rollback:** Revert only the approved implementation change after review if regressions appear. Keep user data, existing outputs and accepted evidence/history unchanged; do not reset the shared worktree or weaken the relevant guard.

**Residual risk:** Only the stated root cause is addressed. Other confirmed findings, blocked deployment review, hosted/advisory/standards gaps and unqualified physical/live behavior remain. Security assurance must be reassessed after evidence refresh.

## REM-0137: Private profile storage is accepted despite effective Git ignore negation

Finding: AUD-0137. Depends on: REM-0108. Approval: **required**.

**Proposed files:**
- [.github/prompts/user-personalization-help.prompt.md](../.github/prompts/user-personalization-help.prompt.md)
- [.github/skills/user-personalization/SKILL.md](../.github/skills/user-personalization/SKILL.md)
- [.github/skills/user-personalization/scripts/user-personalization.mjs](../.github/skills/user-personalization/scripts/user-personalization.mjs)
- [tests/user-personalization.test.mjs](../tests/user-personalization.test.mjs)

**Implementation:**
1. Obtain explicit approval for this exact finding, files and intended behavior. Before editing any existing skill package, route its named owner through skill-update and its required proceed gate; expand scope only with a revised approved proposal.
2. Add the smallest durable red regression reproducing AUD-0137; use the recorded controlled conditions without credentials, live providers, or destructive real-project fixtures.
3. Use effective Git ignore and tracked-index checks, covering target and transaction sibling paths; fail closed for contradictory storage rules.
4. Keep directly related owner guidance/help accurate, reuse existing compatible helpers, and avoid unrelated changes or a broad refactor.
5. Run the focused regression and positive/compatibility controls, then the full native gate in a short-path isolated snapshot. Validate emitted artifacts with actual local schemas, review the bounded diff, and publish only owner-approved local evidence.

**Acceptance:**
- Use real Git with positive and negated ignore rules and compare the public helper result.
- Test already-tracked profiles, nested overrides, and exact-file rules that leave backup/partial files exposed.
- Supported success paths remain correct; intentional rejection changes are explicit and safely diagnosed.
- No unrelated source/user data/accepted history changes, widened tools/permissions, new external calls, silent fallback or false success claim.

**Verification:**
- node --test tests\user-personalization.test.mjs
- npm run check
- Validate affected produced JSON against its actual schema; inspect preserved originals and safe diagnostics on negative paths.

**Rollout:** After exact owner/file approval, add a failing focused regression, implement the bounded repair, verify adjacent behavior, actual artifact schemas and the full local gate, then use the normal governed project-update path.

**Rollback:** Revert only the approved implementation change after review if regressions appear. Keep user data, existing outputs and accepted evidence/history unchanged; do not reset the shared worktree or weaken the relevant guard.

**Residual risk:** Only the stated root cause is addressed. Other confirmed findings, blocked deployment review, hosted/advisory/standards gaps and unqualified physical/live behavior remain. Security assurance must be reassessed after evidence refresh.

## REM-0138: Rejected sensitive-looking profile content is copied into diagnostics

Finding: AUD-0138. Depends on: REM-0108. Approval: **required**.

**Proposed files:**
- [.github/prompts/user-personalization-help.prompt.md](../.github/prompts/user-personalization-help.prompt.md)
- [.github/skills/user-personalization/SKILL.md](../.github/skills/user-personalization/SKILL.md)
- [.github/skills/user-personalization/scripts/user-personalization.mjs](../.github/skills/user-personalization/scripts/user-personalization.mjs)
- [tests/user-personalization.test.mjs](../tests/user-personalization.test.mjs)

**Implementation:**
1. Obtain explicit approval for this exact finding, files and intended behavior. Before editing any existing skill package, route its named owner through skill-update and its required proceed gate; expand scope only with a revised approved proposal.
2. Add the smallest durable red regression reproducing AUD-0138; use the recorded controlled conditions without credentials, live providers, or destructive real-project fixtures.
3. Remove raw values from diagnostics and replace JSON parser messages with sanitized location/type errors; ensure rejected content never reaches summary or stderr.
4. Keep directly related owner guidance/help accurate, reuse existing compatible helpers, and avoid unrelated changes or a broad refactor.
5. Run the focused regression and positive/compatibility controls, then the full native gate in a short-path isolated snapshot. Validate emitted artifacts with actual local schemas, review the bounded diff, and publish only owner-approved local evidence.

**Acceptance:**
- Assert synthetic diagnostic canaries are absent from all public outputs for malformed JSON and each unsupported-list field.
- Test both validate/apply failures and status on invalid stored profiles.
- Supported success paths remain correct; intentional rejection changes are explicit and safely diagnosed.
- No unrelated source/user data/accepted history changes, widened tools/permissions, new external calls, silent fallback or false success claim.

**Verification:**
- node --test tests\user-personalization.test.mjs
- npm run check
- Validate affected produced JSON against its actual schema; inspect preserved originals and safe diagnostics on negative paths.

**Rollout:** After exact owner/file approval, add a failing focused regression, implement the bounded repair, verify adjacent behavior, actual artifact schemas and the full local gate, then use the normal governed project-update path.

**Rollback:** Revert only the approved implementation change after review if regressions appear. Keep user data, existing outputs and accepted evidence/history unchanged; do not reset the shared worktree or weaken the relevant guard.

**Residual risk:** Only the stated root cause is addressed. Other confirmed findings, blocked deployment review, hosted/advisory/standards gaps and unqualified physical/live behavior remain. Security assurance must be reassessed after evidence refresh.

## REM-0101: Final transcripts submit the preceding interim text

Finding: AUD-0101. Depends on: REM-0108. Approval: **required**.

**Proposed files:**
- [.github/prompts/live-chat-interaction-help.prompt.md](../.github/prompts/live-chat-interaction-help.prompt.md)
- [.github/skills/live-chat-interaction/SKILL.md](../.github/skills/live-chat-interaction/SKILL.md)
- [README.md](../README.md)
- [templates/project/.skills-orchestrator/live-chat/conversation-state.mjs](../templates/project/.skills-orchestrator/live-chat/conversation-state.mjs)
- [tests/live-chat-interaction.test.mjs](../tests/live-chat-interaction.test.mjs)
- [tests/live-chat-step016-evaluation.test.mjs](../tests/live-chat-step016-evaluation.test.mjs)
- [tests/skill-contracts.test.mjs](../tests/skill-contracts.test.mjs)

**Implementation:**
1. Obtain explicit approval for this exact finding, files and intended behavior. Before editing any existing skill package, route its named owner through skill-update and its required proceed gate; expand scope only with a revised approved proposal.
2. Add the smallest durable red regression reproducing AUD-0101; use the recorded controlled conditions without credentials, live providers, or destructive real-project fixtures.
3. Apply and validate the final text before constructing pendingSubmission; make confirmation bind to the same immutable final text.
4. Update affected producer/runtime/schema/template/help contracts together and extend tests/skill-contracts.test.mjs. Preserve supported legacy inputs and explicitly migrate or reject unsupported state.
5. Run the focused regression and positive/compatibility controls, then the full native gate in a short-path isolated snapshot. Validate emitted artifacts with actual local schemas, review the bounded diff, and publish only owner-approved local evidence.

**Acceptance:**
- Add a final-only event test proving pendingSubmission.text equals the final transcript.
- Add differing interim/final and corrected consequential-turn cases, and assert the confirmed payload rather than only status and submitCount.
- Supported success paths remain correct; intentional rejection changes are explicit and safely diagnosed.
- No unrelated source/user data/accepted history changes, widened tools/permissions, new external calls, silent fallback or false success claim.

**Verification:**
- node --test tests\live-chat-interaction.test.mjs tests\live-chat-step016-evaluation.test.mjs
- npm run check
- Validate affected produced JSON against its actual schema; inspect preserved originals and safe diagnostics on negative paths.

**Rollout:** After approval, update the shipped template and focused local tests; keep provider/device work offline and gated. Existing target projects require explicit managed updates rather than silent retrofit.

**Rollback:** Revert only the approved implementation change after review if regressions appear. Keep user data, existing outputs and accepted evidence/history unchanged; do not reset the shared worktree or weaken the relevant guard.

**Residual risk:** Only the stated root cause is addressed. Other confirmed findings, blocked deployment review, hosted/advisory/standards gaps and unqualified physical/live behavior remain. Security assurance must be reassessed after evidence refresh.

## REM-0102: New conversation turns append to the prior response

Finding: AUD-0102. Depends on: REM-0108. Approval: **required**.

**Proposed files:**
- [.github/prompts/live-chat-interaction-help.prompt.md](../.github/prompts/live-chat-interaction-help.prompt.md)
- [.github/skills/live-chat-interaction/SKILL.md](../.github/skills/live-chat-interaction/SKILL.md)
- [README.md](../README.md)
- [templates/project/.skills-orchestrator/live-chat/conversation-state.mjs](../templates/project/.skills-orchestrator/live-chat/conversation-state.mjs)
- [tests/live-chat-interaction.test.mjs](../tests/live-chat-interaction.test.mjs)
- [tests/live-chat-step016-evaluation.test.mjs](../tests/live-chat-step016-evaluation.test.mjs)
- [tests/skill-contracts.test.mjs](../tests/skill-contracts.test.mjs)

**Implementation:**
1. Obtain explicit approval for this exact finding, files and intended behavior. Before editing any existing skill package, route its named owner through skill-update and its required proceed gate; expand scope only with a revised approved proposal.
2. Add the smallest durable red regression reproducing AUD-0102; use the recorded controlled conditions without credentials, live providers, or destructive real-project fixtures.
3. Reset the per-turn response buffer at the start of a newly accepted turn without discarding intentional historical messages.
4. Update affected producer/runtime/schema/template/help contracts together and extend tests/skill-contracts.test.mjs. Preserve supported legacy inputs and explicitly migrate or reject unsupported state.
5. Run the focused regression and positive/compatibility controls, then the full native gate in a short-path isolated snapshot. Validate emitted artifacts with actual local schemas, review the bounded diff, and publish only owner-approved local evidence.

**Acceptance:**
- Run two complete turns and assert the second response contains only its deltas; retain cancellation and half-duplex assertions.
- Supported success paths remain correct; intentional rejection changes are explicit and safely diagnosed.
- No unrelated source/user data/accepted history changes, widened tools/permissions, new external calls, silent fallback or false success claim.

**Verification:**
- node --test tests\live-chat-interaction.test.mjs tests\live-chat-step016-evaluation.test.mjs
- npm run check
- Validate affected produced JSON against its actual schema; inspect preserved originals and safe diagnostics on negative paths.

**Rollout:** After approval, update the shipped template and focused local tests; keep provider/device work offline and gated. Existing target projects require explicit managed updates rather than silent retrofit.

**Rollback:** Revert only the approved implementation change after review if regressions appear. Keep user data, existing outputs and accepted evidence/history unchanged; do not reset the shared worktree or weaken the relevant guard.

**Residual risk:** Only the stated root cause is addressed. Other confirmed findings, blocked deployment review, hosted/advisory/standards gaps and unqualified physical/live behavior remain. Security assurance must be reassessed after evidence refresh.

## REM-0103: Late microphone permission completion reverses cancellation

Finding: AUD-0103. Depends on: REM-0108. Approval: **required**.

**Proposed files:**
- [.github/prompts/live-chat-interaction-help.prompt.md](../.github/prompts/live-chat-interaction-help.prompt.md)
- [.github/skills/live-chat-interaction/SKILL.md](../.github/skills/live-chat-interaction/SKILL.md)
- [README.md](../README.md)
- [templates/project/.skills-orchestrator/live-chat/browser-controller.mjs](../templates/project/.skills-orchestrator/live-chat/browser-controller.mjs)
- [templates/project/.skills-orchestrator/live-chat/conversation-state.mjs](../templates/project/.skills-orchestrator/live-chat/conversation-state.mjs)
- [tests/live-chat-interaction.test.mjs](../tests/live-chat-interaction.test.mjs)
- [tests/live-chat-step016-evaluation.test.mjs](../tests/live-chat-step016-evaluation.test.mjs)
- [tests/skill-contracts.test.mjs](../tests/skill-contracts.test.mjs)

**Implementation:**
1. Obtain explicit approval for this exact finding, files and intended behavior. Before editing any existing skill package, route its named owner through skill-update and its required proceed gate; expand scope only with a revised approved proposal.
2. Add the smallest durable red regression reproducing AUD-0103; use the recorded controlled conditions without credentials, live providers, or destructive real-project fixtures.
3. Fence permission attempts with a request generation or cancellation marker and suppress stale completion dispatches while still releasing tracks.
4. Update affected producer/runtime/schema/template/help contracts together and extend tests/skill-contracts.test.mjs. Preserve supported legacy inputs and explicitly migrate or reject unsupported state.
5. Run the focused regression and positive/compatibility controls, then the full native gate in a short-path isolated snapshot. Validate emitted artifacts with actual local schemas, review the bounded diff, and publish only owner-approved local evidence.

**Acceptance:**
- Use a deferred getUserMedia fake, cancel before resolution/rejection, and verify cancelled state is retained and every returned track is stopped.
- Supported success paths remain correct; intentional rejection changes are explicit and safely diagnosed.
- No unrelated source/user data/accepted history changes, widened tools/permissions, new external calls, silent fallback or false success claim.

**Verification:**
- node --test tests\live-chat-interaction.test.mjs tests\live-chat-step016-evaluation.test.mjs
- npm run check
- Validate affected produced JSON against its actual schema; inspect preserved originals and safe diagnostics on negative paths.

**Rollout:** After approval, update the shipped template and focused local tests; keep provider/device work offline and gated. Existing target projects require explicit managed updates rather than silent retrofit.

**Rollback:** Revert only the approved implementation change after review if regressions appear. Keep user data, existing outputs and accepted evidence/history unchanged; do not reset the shared worktree or weaken the relevant guard.

**Residual risk:** Only the stated root cause is addressed. Other confirmed findings, blocked deployment review, hosted/advisory/standards gaps and unqualified physical/live behavior remain. Security assurance must be reassessed after evidence refresh.

## REM-0104: Malformed grounding manifests throw before the safe fallback

Finding: AUD-0104. Depends on: REM-0108. Approval: **required**.

**Proposed files:**
- [.github/prompts/live-chat-interaction-help.prompt.md](../.github/prompts/live-chat-interaction-help.prompt.md)
- [.github/skills/live-chat-interaction/SKILL.md](../.github/skills/live-chat-interaction/SKILL.md)
- [README.md](../README.md)
- [templates/project/.skills-orchestrator/live-chat/grounding.mjs](../templates/project/.skills-orchestrator/live-chat/grounding.mjs)
- [tests/live-chat-grounding.test.mjs](../tests/live-chat-grounding.test.mjs)
- [tests/skill-contracts.test.mjs](../tests/skill-contracts.test.mjs)

**Implementation:**
1. Obtain explicit approval for this exact finding, files and intended behavior. Before editing any existing skill package, route its named owner through skill-update and its required proceed gate; expand scope only with a revised approved proposal.
2. Add the smallest durable red regression reproducing AUD-0104; use the recorded controlled conditions without credentials, live providers, or destructive real-project fixtures.
3. Return the explicit invalid-manifest fallback before constructing source/citation indexes; validate response collection members at the same boundary.
4. Update affected producer/runtime/schema/template/help contracts together and extend tests/skill-contracts.test.mjs. Preserve supported legacy inputs and explicitly migrate or reject unsupported state.
5. Run the focused regression and positive/compatibility controls, then the full native gate in a short-path isolated snapshot. Validate emitted artifacts with actual local schemas, review the bounded diff, and publish only owner-approved local evidence.

**Acceptance:**
- Test sources as object/null/non-array and arrays containing null, plus malformed citation/sourceIds values; assert safe fallback and no exception.
- Supported success paths remain correct; intentional rejection changes are explicit and safely diagnosed.
- No unrelated source/user data/accepted history changes, widened tools/permissions, new external calls, silent fallback or false success claim.

**Verification:**
- node --test tests\live-chat-grounding.test.mjs
- npm run check
- Validate affected produced JSON against its actual schema; inspect preserved originals and safe diagnostics on negative paths.

**Rollout:** After approval, update the shipped template and focused local tests; keep provider/device work offline and gated. Existing target projects require explicit managed updates rather than silent retrofit.

**Rollback:** Revert only the approved implementation change after review if regressions appear. Keep user data, existing outputs and accepted evidence/history unchanged; do not reset the shared worktree or weaken the relevant guard.

**Residual risk:** Only the stated root cause is addressed. Other confirmed findings, blocked deployment review, hosted/advisory/standards gaps and unqualified physical/live behavior remain. Security assurance must be reassessed after evidence refresh.

## REM-0105: Rate-limited requests permanently consume an identity concurrency slot

Finding: AUD-0105. Depends on: REM-0108. Approval: **required**.

**Proposed files:**
- [.github/prompts/live-chat-interaction-help.prompt.md](../.github/prompts/live-chat-interaction-help.prompt.md)
- [.github/skills/live-chat-interaction/SKILL.md](../.github/skills/live-chat-interaction/SKILL.md)
- [README.md](../README.md)
- [templates/project/.skills-orchestrator/live-chat/server/provider-adapter.mjs](../templates/project/.skills-orchestrator/live-chat/server/provider-adapter.mjs)
- [tests/live-chat-provider-adapter.test.mjs](../tests/live-chat-provider-adapter.test.mjs)
- [tests/skill-contracts.test.mjs](../tests/skill-contracts.test.mjs)

**Implementation:**
1. Obtain explicit approval for this exact finding, files and intended behavior. Before editing any existing skill package, route its named owner through skill-update and its required proceed gate; expand scope only with a revised approved proposal.
2. Add the smallest durable red regression reproducing AUD-0105; use the recorded controlled conditions without credentials, live providers, or destructive real-project fixtures.
3. Check rate before taking the active slot or move every post-acquisition operation inside the cleanup boundary; release empty identity records.
4. Update affected producer/runtime/schema/template/help contracts together and extend tests/skill-contracts.test.mjs. Preserve supported legacy inputs and explicitly migrate or reject unsupported state.
5. Run the focused regression and positive/compatibility controls, then the full native gate in a short-path isolated snapshot. Validate emitted artifacts with actual local schemas, review the bounded diff, and publish only owner-approved local evidence.

**Acceptance:**
- Exceed the rate window, advance a fake clock, and assert the same identity can stream again; cover exceptions between slot acquisition and transport start.
- Supported success paths remain correct; intentional rejection changes are explicit and safely diagnosed.
- No unrelated source/user data/accepted history changes, widened tools/permissions, new external calls, silent fallback or false success claim.

**Verification:**
- node --test tests\live-chat-provider-adapter.test.mjs
- npm run check
- Validate affected produced JSON against its actual schema; inspect preserved originals and safe diagnostics on negative paths.

**Rollout:** After approval, update the shipped template and focused local tests; keep provider/device work offline and gated. Existing target projects require explicit managed updates rather than silent retrofit.

**Rollback:** Revert only the approved implementation change after review if regressions appear. Keep user data, existing outputs and accepted evidence/history unchanged; do not reset the shared worktree or weaken the relevant guard.

**Residual risk:** Only the stated root cause is addressed. Other confirmed findings, blocked deployment review, hosted/advisory/standards gaps and unqualified physical/live behavior remain. Security assurance must be reassessed after evidence refresh.

## REM-0107: Streaming decoder corrupts UTF-8 characters split across chunks

Finding: AUD-0107. Depends on: REM-0108. Approval: **required**.

**Proposed files:**
- [.github/prompts/live-chat-interaction-help.prompt.md](../.github/prompts/live-chat-interaction-help.prompt.md)
- [.github/skills/live-chat-interaction/SKILL.md](../.github/skills/live-chat-interaction/SKILL.md)
- [README.md](../README.md)
- [templates/project/.skills-orchestrator/live-chat/server/provider-adapter.mjs](../templates/project/.skills-orchestrator/live-chat/server/provider-adapter.mjs)
- [tests/live-chat-provider-adapter.test.mjs](../tests/live-chat-provider-adapter.test.mjs)
- [tests/skill-contracts.test.mjs](../tests/skill-contracts.test.mjs)

**Implementation:**
1. Obtain explicit approval for this exact finding, files and intended behavior. Before editing any existing skill package, route its named owner through skill-update and its required proceed gate; expand scope only with a revised approved proposal.
2. Add the smallest durable red regression reproducing AUD-0107; use the recorded controlled conditions without credentials, live providers, or destructive real-project fixtures.
3. Reuse one streaming TextDecoder for both response body interfaces, including final flush and cleanup.
4. Update affected producer/runtime/schema/template/help contracts together and extend tests/skill-contracts.test.mjs. Preserve supported legacy inputs and explicitly migrate or reject unsupported state.
5. Run the focused regression and positive/compatibility controls, then the full native gate in a short-path isolated snapshot. Validate emitted artifacts with actual local schemas, review the bounded diff, and publish only owner-approved local evidence.

**Acceptance:**
- Split every byte boundary of accented and multi-byte Unicode strings in fake SSE chunks; assert exact delta text and unchanged JSON parsing semantics.
- Supported success paths remain correct; intentional rejection changes are explicit and safely diagnosed.
- No unrelated source/user data/accepted history changes, widened tools/permissions, new external calls, silent fallback or false success claim.

**Verification:**
- node --test tests\live-chat-provider-adapter.test.mjs
- npm run check
- Validate affected produced JSON against its actual schema; inspect preserved originals and safe diagnostics on negative paths.

**Rollout:** After approval, update the shipped template and focused local tests; keep provider/device work offline and gated. Existing target projects require explicit managed updates rather than silent retrofit.

**Rollback:** Revert only the approved implementation change after review if regressions appear. Keep user data, existing outputs and accepted evidence/history unchanged; do not reset the shared worktree or weaken the relevant guard.

**Residual risk:** Only the stated root cause is addressed. Other confirmed findings, blocked deployment review, hosted/advisory/standards gaps and unqualified physical/live behavior remain. Security assurance must be reassessed after evidence refresh.

## REM-0109: Cleanup derives a different resource group for supported long project names

Finding: AUD-0109. Depends on: REM-0108. Approval: **required**.

**Proposed files:**
- [.github/prompts/azure-cleanup-help.prompt.md](../.github/prompts/azure-cleanup-help.prompt.md)
- [.github/skills/azure-cleanup/SKILL.md](../.github/skills/azure-cleanup/SKILL.md)
- [README.md](../README.md)
- [templates/project/infra/cleanup.ps1](../templates/project/infra/cleanup.ps1)
- [templates/project/infra/deploy-infra.ps1](../templates/project/infra/deploy-infra.ps1)
- [templates/project/infra/main.bicep](../templates/project/infra/main.bicep)
- [tests/skill-contracts.test.mjs](../tests/skill-contracts.test.mjs)

**Implementation:**
1. Obtain explicit approval for this exact finding, files and intended behavior. Before editing any existing skill package, route its named owner through skill-update and its required proceed gate; expand scope only with a revised approved proposal.
2. Add the smallest durable red regression reproducing AUD-0109; use the recorded controlled conditions without credentials, live providers, or destructive real-project fixtures.
3. Reuse the deployment naming helper for cleanup or extract a single shared resource-naming owner; do not silently change identities of existing resources.
4. Update affected producer/runtime/schema/template/help contracts together and extend tests/skill-contracts.test.mjs. Preserve supported legacy inputs and explicitly migrate or reject unsupported state.
5. Run the focused regression and positive/compatibility controls, then the full native gate in a short-path isolated snapshot. Validate emitted artifacts with actual local schemas, review the bounded diff, and publish only owner-approved local evidence.

**Acceptance:**
- Cover names at 86, 87, 88, and 90 normalized characters and assert deploy/cleanup group identity equality; use fake Azure commands and verify no deletion without the exact existing confirmation gate.
- Supported success paths remain correct; intentional rejection changes are explicit and safely diagnosed.
- No unrelated source/user data/accepted history changes, widened tools/permissions, new external calls, silent fallback or false success claim.

**Verification:**
- node --test tests\skill-contracts.test.mjs
- npm run check
- Validate affected produced JSON against its actual schema; inspect preserved originals and safe diagnostics on negative paths.

**Rollout:** After exact owner/file approval, add a failing focused regression, implement the bounded repair, verify adjacent behavior, actual artifact schemas and the full local gate, then use the normal governed project-update path.

**Rollback:** Revert only the approved implementation change after review if regressions appear. Keep user data, existing outputs and accepted evidence/history unchanged; do not reset the shared worktree or weaken the relevant guard.

**Residual risk:** Only the stated root cause is addressed. Other confirmed findings, blocked deployment review, hosted/advisory/standards gaps and unqualified physical/live behavior remain. Security assurance must be reassessed after evidence refresh.

## REM-0112: Classic apply interprets an explicit negative risk value as approval

Finding: AUD-0112. Depends on: REM-0108. Approval: **required**.

**Proposed files:**
- [.github/prompts/agent-builder-help.prompt.md](../.github/prompts/agent-builder-help.prompt.md)
- [.github/skills/agent-builder/SKILL.md](../.github/skills/agent-builder/SKILL.md)
- [.github/skills/agent-builder/scripts/agent-builder.mjs](../.github/skills/agent-builder/scripts/agent-builder.mjs)
- [tests/agent-builder.test.mjs](../tests/agent-builder.test.mjs)
- [tests/native-copilot-studio.test.mjs](../tests/native-copilot-studio.test.mjs)

**Implementation:**
1. Obtain explicit approval for this exact finding, files and intended behavior. Before editing any existing skill package, route its named owner through skill-update and its required proceed gate; expand scope only with a revised approved proposal.
2. Add the smallest durable red regression reproducing AUD-0112; use the recorded controlled conditions without credentials, live providers, or destructive real-project fixtures.
3. Reject extra positionals on all commands or parse boolean-valued flags explicitly.
4. Keep directly related owner guidance/help accurate, reuse existing compatible helpers, and avoid unrelated changes or a broad refactor.
5. Run the focused regression and positive/compatibility controls, then the full native gate in a short-path isolated snapshot. Validate emitted artifacts with actual local schemas, review the bounded diff, and publish only owner-approved local evidence.

**Acceptance:**
- Run false and no through main and verify rejection plus unchanged destination; retain the documented bare-flag success control.
- Supported success paths remain correct; intentional rejection changes are explicit and safely diagnosed.
- No unrelated source/user data/accepted history changes, widened tools/permissions, new external calls, silent fallback or false success claim.

**Verification:**
- node --test tests\agent-builder.test.mjs tests\native-copilot-studio.test.mjs
- npm run check
- Validate affected produced JSON against its actual schema; inspect preserved originals and safe diagnostics on negative paths.

**Rollout:** After exact agent-builder approval, exercise both classic and native paths with preserved legacy blueprint interfaces. Apply only to temporary fixtures first; existing agent installations need their own reviewed update.

**Rollback:** Revert only the approved implementation change after review if regressions appear. Keep user data, existing outputs and accepted evidence/history unchanged; do not reset the shared worktree or weaken the relevant guard.

**Residual risk:** Only the stated root cause is addressed. Other confirmed findings, blocked deployment review, hosted/advisory/standards gaps and unqualified physical/live behavior remain. Security assurance must be reassessed after evidence refresh.

## REM-0114: Native parser treats ambiguous implicit scalars as validated text

Finding: AUD-0114. Depends on: REM-0108. Approval: **required**.

**Proposed files:**
- [.github/prompts/agent-builder-help.prompt.md](../.github/prompts/agent-builder-help.prompt.md)
- [.github/skills/agent-builder/SKILL.md](../.github/skills/agent-builder/SKILL.md)
- [.github/skills/agent-builder/scripts/native-studio.mjs](../.github/skills/agent-builder/scripts/native-studio.mjs)
- [tests/agent-builder.test.mjs](../tests/agent-builder.test.mjs)
- [tests/native-copilot-studio.test.mjs](../tests/native-copilot-studio.test.mjs)

**Implementation:**
1. Obtain explicit approval for this exact finding, files and intended behavior. Before editing any existing skill package, route its named owner through skill-update and its required proceed gate; expand scope only with a revised approved proposal.
2. Add the smallest durable red regression reproducing AUD-0114; use the recorded controlled conditions without credentials, live providers, or destructive real-project fixtures.
3. Reject implicit scalar forms outside the supported subset or implement consistent typing.
4. Keep directly related owner guidance/help accurate, reuse existing compatible helpers, and avoid unrelated changes or a broad refactor.
5. Run the focused regression and positive/compatibility controls, then the full native gate in a short-path isolated snapshot. Validate emitted artifacts with actual local schemas, review the bounded diff, and publish only owner-approved local evidence.

**Acceptance:**
- Test quoted/unquoted boolean, null, scientific-number, hexadecimal, and reserved plain-scalar forms.
- Supported success paths remain correct; intentional rejection changes are explicit and safely diagnosed.
- No unrelated source/user data/accepted history changes, widened tools/permissions, new external calls, silent fallback or false success claim.

**Verification:**
- node --test tests\agent-builder.test.mjs tests\native-copilot-studio.test.mjs
- npm run check
- Validate affected produced JSON against its actual schema; inspect preserved originals and safe diagnostics on negative paths.

**Rollout:** After exact agent-builder approval, exercise both classic and native paths with preserved legacy blueprint interfaces. Apply only to temporary fixtures first; existing agent installations need their own reviewed update.

**Rollback:** Revert only the approved implementation change after review if regressions appear. Keep user data, existing outputs and accepted evidence/history unchanged; do not reset the shared worktree or weaken the relevant guard.

**Residual risk:** Only the stated root cause is addressed. Other confirmed findings, blocked deployment review, hosted/advisory/standards gaps and unqualified physical/live behavior remain. Security assurance must be reassessed after evidence refresh.

## REM-0117: Complete push handoff accepts blocked or missing draft approval

Finding: AUD-0117. Depends on: REM-0108. Approval: **required**.

**Proposed files:**
- [.github/prompts/agent-builder-help.prompt.md](../.github/prompts/agent-builder-help.prompt.md)
- [.github/skills/agent-builder/SKILL.md](../.github/skills/agent-builder/SKILL.md)
- [.github/skills/agent-builder/scripts/native-studio.mjs](../.github/skills/agent-builder/scripts/native-studio.mjs)
- [schemas/copilot-studio-handoff.schema.json](../schemas/copilot-studio-handoff.schema.json)
- [tests/agent-builder.test.mjs](../tests/agent-builder.test.mjs)
- [tests/native-copilot-studio.test.mjs](../tests/native-copilot-studio.test.mjs)
- [tests/skill-contracts.test.mjs](../tests/skill-contracts.test.mjs)

**Implementation:**
1. Obtain explicit approval for this exact finding, files and intended behavior. Before editing any existing skill package, route its named owner through skill-update and its required proceed gate; expand scope only with a revised approved proposal.
2. Add the smallest durable red regression reproducing AUD-0117; use the recorded controlled conditions without credentials, live providers, or destructive real-project fixtures.
3. Require operation-relevant completion approvals and reject explicit applicable blockers.
4. Update affected producer/runtime/schema/template/help contracts together and extend tests/skill-contracts.test.mjs. Preserve supported legacy inputs and explicitly migrate or reject unsupported state.
5. Run the focused regression and positive/compatibility controls, then the full native gate in a short-path isolated snapshot. Validate emitted artifacts with actual local schemas, review the bounded diff, and publish only owner-approved local evidence.

**Acceptance:**
- Require verified draft approval for push and test not-requested/blocked variants against both validators; keep an approved control.
- Supported success paths remain correct; intentional rejection changes are explicit and safely diagnosed.
- No unrelated source/user data/accepted history changes, widened tools/permissions, new external calls, silent fallback or false success claim.

**Verification:**
- node --test tests\agent-builder.test.mjs tests\native-copilot-studio.test.mjs
- npm run check
- Validate affected produced JSON against its actual schema; inspect preserved originals and safe diagnostics on negative paths.

**Rollout:** After exact agent-builder approval, exercise both classic and native paths with preserved legacy blueprint interfaces. Apply only to temporary fixtures first; existing agent installations need their own reviewed update.

**Rollback:** Restore the prior approved producer/schema pair and retain pre-migration artifacts if compatibility fails; do not reinterpret old provenance or rewrite accepted records.

**Residual risk:** Only the stated root cause is addressed. Other confirmed findings, blocked deployment review, hosted/advisory/standards gaps and unqualified physical/live behavior remain. Security assurance must be reassessed after evidence refresh.

## REM-0118: Cycle detection misses ordinary YAML agent-list formats

Finding: AUD-0118. Depends on: REM-0108. Approval: **required**.

**Proposed files:**
- [.github/prompts/agent-builder-help.prompt.md](../.github/prompts/agent-builder-help.prompt.md)
- [.github/skills/agent-builder/SKILL.md](../.github/skills/agent-builder/SKILL.md)
- [.github/skills/agent-builder/scripts/agent-builder.mjs](../.github/skills/agent-builder/scripts/agent-builder.mjs)
- [tests/agent-builder.test.mjs](../tests/agent-builder.test.mjs)
- [tests/native-copilot-studio.test.mjs](../tests/native-copilot-studio.test.mjs)

**Implementation:**
1. Obtain explicit approval for this exact finding, files and intended behavior. Before editing any existing skill package, route its named owner through skill-update and its required proceed gate; expand scope only with a revised approved proposal.
2. Add the smallest durable red regression reproducing AUD-0118; use the recorded controlled conditions without credentials, live providers, or destructive real-project fixtures.
3. Parse supported frontmatter reference forms correctly or fail closed on unrecognized reference syntax.
4. Keep directly related owner guidance/help accurate, reuse existing compatible helpers, and avoid unrelated changes or a broad refactor.
5. Run the focused regression and positive/compatibility controls, then the full native gate in a short-path isolated snapshot. Validate emitted artifacts with actual local schemas, review the bounded diff, and publish only owner-approved local evidence.

**Acceptance:**
- Run the same two-agent graph with quoted-flow, plain-flow, and block-list forms and require equivalent rejection.
- Supported success paths remain correct; intentional rejection changes are explicit and safely diagnosed.
- No unrelated source/user data/accepted history changes, widened tools/permissions, new external calls, silent fallback or false success claim.

**Verification:**
- node --test tests\agent-builder.test.mjs tests\native-copilot-studio.test.mjs
- npm run check
- Validate affected produced JSON against its actual schema; inspect preserved originals and safe diagnostics on negative paths.

**Rollout:** After exact agent-builder approval, exercise both classic and native paths with preserved legacy blueprint interfaces. Apply only to temporary fixtures first; existing agent installations need their own reviewed update.

**Rollback:** Revert only the approved implementation change after review if regressions appear. Keep user data, existing outputs and accepted evidence/history unchanged; do not reset the shared worktree or weaken the relevant guard.

**Residual risk:** Only the stated root cause is addressed. Other confirmed findings, blocked deployment review, hosted/advisory/standards gaps and unqualified physical/live behavior remain. Security assurance must be reassessed after evidence refresh.

## REM-0120: Partial initial lock write leaves an orphan project lock

Finding: AUD-0120. Depends on: REM-0108. Approval: **required**.

**Proposed files:**
- [.github/prompts/agent-builder-help.prompt.md](../.github/prompts/agent-builder-help.prompt.md)
- [.github/skills/agent-builder/SKILL.md](../.github/skills/agent-builder/SKILL.md)
- [.github/skills/agent-builder/scripts/agent-builder.mjs](../.github/skills/agent-builder/scripts/agent-builder.mjs)
- [tests/agent-builder.test.mjs](../tests/agent-builder.test.mjs)
- [tests/native-copilot-studio.test.mjs](../tests/native-copilot-studio.test.mjs)

**Implementation:**
1. Obtain explicit approval for this exact finding, files and intended behavior. Before editing any existing skill package, route its named owner through skill-update and its required proceed gate; expand scope only with a revised approved proposal.
2. Add the smallest durable red regression reproducing AUD-0120; use the recorded controlled conditions without credentials, live providers, or destructive real-project fixtures.
3. Acquire an exclusive handle, track ownership, and perform lock content writes within its cleanup boundary.
4. Keep directly related owner guidance/help accurate, reuse existing compatible helpers, and avoid unrelated changes or a broad refactor.
5. Run the focused regression and positive/compatibility controls, then the full native gate in a short-path isolated snapshot. Validate emitted artifacts with actual local schemas, review the bounded diff, and publish only owner-approved local evidence.

**Acceptance:**
- Inject a create-then-fail write and assert owned lock removal; separately ensure EEXIST never removes another invocation's lock.
- Supported success paths remain correct; intentional rejection changes are explicit and safely diagnosed.
- No unrelated source/user data/accepted history changes, widened tools/permissions, new external calls, silent fallback or false success claim.

**Verification:**
- node --test tests\agent-builder.test.mjs tests\native-copilot-studio.test.mjs
- npm run check
- Validate affected produced JSON against its actual schema; inspect preserved originals and safe diagnostics on negative paths.

**Rollout:** After exact agent-builder approval, exercise both classic and native paths with preserved legacy blueprint interfaces. Apply only to temporary fixtures first; existing agent installations need their own reviewed update.

**Rollback:** Revert only the approved implementation change after review if regressions appear. Keep user data, existing outputs and accepted evidence/history unchanged; do not reset the shared worktree or weaken the relevant guard.

**Residual risk:** Only the stated root cause is addressed. Other confirmed findings, blocked deployment review, hosted/advisory/standards gaps and unqualified physical/live behavior remain. Security assurance must be reassessed after evidence refresh.

## REM-0123: Scaffold apply selects Launch Pad content instead of the hashed template

Finding: AUD-0123. Depends on: REM-0108. Approval: **required**.

**Proposed files:**
- [README.md](../README.md)
- [pso.mjs](../pso.mjs)
- [tests/adoption-rerun.test.mjs](../tests/adoption-rerun.test.mjs)

**Implementation:**
1. Obtain explicit approval for this exact finding, files and intended behavior. Before editing any existing skill package, route its named owner through skill-update and its required proceed gate; expand scope only with a revised approved proposal.
2. Add the smallest durable red regression reproducing AUD-0123; use the recorded controlled conditions without credentials, live providers, or destructive real-project fixtures.
3. Select source content from the asset's declared scope/provenance; scaffold assets must resolve to the scaffold template, not an existence-based fallback.
4. Keep directly related owner guidance/help accurate, reuse existing compatible helpers, and avoid unrelated changes or a broad refactor.
5. Run the focused regression and positive/compatibility controls, then the full native gate in a short-path isolated snapshot. Validate emitted artifacts with actual local schemas, review the bounded diff, and publish only owner-approved local evidence.

**Acceptance:**
- Apply an instruction-template upgrade with a deliberately different Launch Pad file and assert exact planned content; cover .gitattributes too.
- Supported success paths remain correct; intentional rejection changes are explicit and safely diagnosed.
- No unrelated source/user data/accepted history changes, widened tools/permissions, new external calls, silent fallback or false success claim.

**Verification:**
- node --test tests\adoption-rerun.test.mjs
- npm run check
- Validate affected produced JSON against its actual schema; inspect preserved originals and safe diagnostics on negative paths.

**Rollout:** After explicit approval, test a copy of a generated/adopted project across supported manifest versions, then rerun the native update/adoption/release regressions and full gate. Do not automatically modify existing projects or publish a release.

**Rollback:** Revert only the approved implementation change after review if regressions appear. Keep user data, existing outputs and accepted evidence/history unchanged; do not reset the shared worktree or weaken the relevant guard.

**Residual risk:** Only the stated root cause is addressed. Other confirmed findings, blocked deployment review, hosted/advisory/standards gaps and unqualified physical/live behavior remain. Security assurance must be reassessed after evidence refresh.

## REM-0125: Profile validation blocks additive restoration of required skills

Finding: AUD-0125. Depends on: REM-0108. Approval: **required**.

**Proposed files:**
- [README.md](../README.md)
- [pso.mjs](../pso.mjs)
- [tests/adoption-rerun.test.mjs](../tests/adoption-rerun.test.mjs)

**Implementation:**
1. Obtain explicit approval for this exact finding, files and intended behavior. Before editing any existing skill package, route its named owner through skill-update and its required proceed gate; expand scope only with a revised approved proposal.
2. Add the smallest durable red regression reproducing AUD-0125; use the recorded controlled conditions without credentials, live providers, or destructive real-project fixtures.
3. Evaluate projected skill availability from verified planned creates/replacements and retained installed assets.
4. Keep directly related owner guidance/help accurate, reuse existing compatible helpers, and avoid unrelated changes or a broad refactor.
5. Run the focused regression and positive/compatibility controls, then the full native gate in a short-path isolated snapshot. Validate emitted artifacts with actual local schemas, review the bounded diff, and publish only owner-approved local evidence.

**Acceptance:**
- Apply additive workflow-planner restoration and a new-required-skill upgrade; retain the negative test for an unrelated selective update leaving a requirement absent.
- Supported success paths remain correct; intentional rejection changes are explicit and safely diagnosed.
- No unrelated source/user data/accepted history changes, widened tools/permissions, new external calls, silent fallback or false success claim.

**Verification:**
- node --test tests\adoption-rerun.test.mjs
- npm run check
- Validate affected produced JSON against its actual schema; inspect preserved originals and safe diagnostics on negative paths.

**Rollout:** After explicit approval, test a copy of a generated/adopted project across supported manifest versions, then rerun the native update/adoption/release regressions and full gate. Do not automatically modify existing projects or publish a release.

**Rollback:** Revert only the approved implementation change after review if regressions appear. Keep user data, existing outputs and accepted evidence/history unchanged; do not reset the shared worktree or weaken the relevant guard.

**Residual risk:** Only the stated root cause is addressed. Other confirmed findings, blocked deployment review, hosted/advisory/standards gaps and unqualified physical/live behavior remain. Security assurance must be reassessed after evidence refresh.

## REM-0126: Legacy update plans omit required source provenance metadata

Finding: AUD-0126. Depends on: REM-0108. Approval: **required**.

**Proposed files:**
- [README.md](../README.md)
- [pso.mjs](../pso.mjs)
- [schemas/project-update-plan.schema.json](../schemas/project-update-plan.schema.json)
- [tests/adoption-rerun.test.mjs](../tests/adoption-rerun.test.mjs)
- [tests/skill-contracts.test.mjs](../tests/skill-contracts.test.mjs)

**Implementation:**
1. Obtain explicit approval for this exact finding, files and intended behavior. Before editing any existing skill package, route its named owner through skill-update and its required proceed gate; expand scope only with a revised approved proposal.
2. Add the smallest durable red regression reproducing AUD-0126; use the recorded controlled conditions without credentials, live providers, or destructive real-project fixtures.
3. Represent unknown legacy provenance explicitly in the plan schema/runtime, rather than substituting current upstream identity for historical evidence.
4. Update affected producer/runtime/schema/template/help contracts together and extend tests/skill-contracts.test.mjs. Preserve supported legacy inputs and explicitly migrate or reject unsupported state.
5. Run the focused regression and positive/compatibility controls, then the full native gate in a short-path isolated snapshot. Validate emitted artifacts with actual local schemas, review the bounded diff, and publish only owner-approved local evidence.

**Acceptance:**
- Validate emitted plans from legacy 1.0 and current 1.1 fixtures against the actual plan schema, then test their migration paths.
- Supported success paths remain correct; intentional rejection changes are explicit and safely diagnosed.
- No unrelated source/user data/accepted history changes, widened tools/permissions, new external calls, silent fallback or false success claim.

**Verification:**
- node --test tests\adoption-rerun.test.mjs
- npm run check
- Validate affected produced JSON against its actual schema; inspect preserved originals and safe diagnostics on negative paths.

**Rollout:** After explicit approval, test a copy of a generated/adopted project across supported manifest versions, then rerun the native update/adoption/release regressions and full gate. Do not automatically modify existing projects or publish a release.

**Rollback:** Restore the prior approved producer/schema pair and retain pre-migration artifacts if compatibility fails; do not reinterpret old provenance or rewrite accepted records.

**Residual risk:** Only the stated root cause is addressed. Other confirmed findings, blocked deployment review, hosted/advisory/standards gaps and unqualified physical/live behavior remain. Security assurance must be reassessed after evidence refresh.

## REM-0127: Candidate freshness ignores added and deleted shipped sources

Finding: AUD-0127. Depends on: REM-0108. Approval: **required**.

**Proposed files:**
- [README.md](../README.md)
- [scripts/build-release.mjs](../scripts/build-release.mjs)
- [scripts/verify-release.mjs](../scripts/verify-release.mjs)
- [tests/production-gates.test.mjs](../tests/production-gates.test.mjs)

**Implementation:**
1. Obtain explicit approval for this exact finding, files and intended behavior. Before editing any existing skill package, route its named owner through skill-update and its required proceed gate; expand scope only with a revised approved proposal.
2. Add the smallest durable red regression reproducing AUD-0127; use the recorded controlled conditions without credentials, live providers, or destructive real-project fixtures.
3. Compare the canonical shipped source and payload path sets before comparing file digests; exclude only declared non-source/generated artifacts.
4. Keep directly related owner guidance/help accurate, reuse existing compatible helpers, and avoid unrelated changes or a broad refactor.
5. Run the focused regression and positive/compatibility controls, then the full native gate in a short-path isolated snapshot. Validate emitted artifacts with actual local schemas, review the bounded diff, and publish only owner-approved local evidence.

**Acceptance:**
- Test additions and deletions independently under schemas and other shipped roots; ensure reports/dist outputs do not create false positives.
- Supported success paths remain correct; intentional rejection changes are explicit and safely diagnosed.
- No unrelated source/user data/accepted history changes, widened tools/permissions, new external calls, silent fallback or false success claim.

**Verification:**
- node --test tests\production-gates.test.mjs
- npm run check
- Validate affected produced JSON against its actual schema; inspect preserved originals and safe diagnostics on negative paths.

**Rollout:** After explicit approval, test a copy of a generated/adopted project across supported manifest versions, then rerun the native update/adoption/release regressions and full gate. Do not automatically modify existing projects or publish a release.

**Rollback:** Revert only the approved implementation change after review if regressions appear. Keep user data, existing outputs and accepted evidence/history unchanged; do not reset the shared worktree or weaken the relevant guard.

**Residual risk:** Only the stated root cause is addressed. Other confirmed findings, blocked deployment review, hosted/advisory/standards gaps and unqualified physical/live behavior remain. Security assurance must be reassessed after evidence refresh.

## REM-0134: Plan parsing and hashing can bind different file revisions

Finding: AUD-0134. Depends on: REM-0108. Approval: **required**.

**Proposed files:**
- [.github/prompts/project-video-help.prompt.md](../.github/prompts/project-video-help.prompt.md)
- [.github/skills/project-video/SKILL.md](../.github/skills/project-video/SKILL.md)
- [.github/skills/project-video/scripts/project-video.mjs](../.github/skills/project-video/scripts/project-video.mjs)
- [tests/project-video.test.mjs](../tests/project-video.test.mjs)

**Implementation:**
1. Obtain explicit approval for this exact finding, files and intended behavior. Before editing any existing skill package, route its named owner through skill-update and its required proceed gate; expand scope only with a revised approved proposal.
2. Add the smallest durable red regression reproducing AUD-0134; use the recorded controlled conditions without credentials, live providers, or destructive real-project fixtures.
3. Read the plan once and compute both its parsed representation and hash from that immutable byte snapshot; check separate evidence drift explicitly.
4. Keep directly related owner guidance/help accurate, reuse existing compatible helpers, and avoid unrelated changes or a broad refactor.
5. Run the focused regression and positive/compatibility controls, then the full native gate in a short-path isolated snapshot. Validate emitted artifacts with actual local schemas, review the bounded diff, and publish only owner-approved local evidence.

**Acceptance:**
- Inject a deterministic edit between parsing and hashing; never return mismatched content and digest.
- Avoid sleep-dependent race tests.
- Supported success paths remain correct; intentional rejection changes are explicit and safely diagnosed.
- No unrelated source/user data/accepted history changes, widened tools/permissions, new external calls, silent fallback or false success claim.

**Verification:**
- node --test tests\project-video.test.mjs
- npm run check
- Validate affected produced JSON against its actual schema; inspect preserved originals and safe diagnostics on negative paths.

**Rollout:** After exact owner/file approval, add a failing focused regression, implement the bounded repair, verify adjacent behavior, actual artifact schemas and the full local gate, then use the normal governed project-update path.

**Rollback:** Revert only the approved implementation change after review if regressions appear. Keep user data, existing outputs and accepted evidence/history unchanged; do not reset the shared worktree or weaken the relevant guard.

**Residual risk:** Only the stated root cause is addressed. Other confirmed findings, blocked deployment review, hosted/advisory/standards gaps and unqualified physical/live behavior remain. Security assurance must be reassessed after evidence refresh.

## REM-0135: The emitted third voice profile is rejected by four owned schemas

Finding: AUD-0135. Depends on: REM-0108. Approval: **required**.

**Proposed files:**
- [.github/prompts/project-video-help.prompt.md](../.github/prompts/project-video-help.prompt.md)
- [.github/skills/project-video/SKILL.md](../.github/skills/project-video/SKILL.md)
- [.github/skills/project-video/scripts/project-video.mjs](../.github/skills/project-video/scripts/project-video.mjs)
- [schemas/project-video-manifest.schema.json](../schemas/project-video-manifest.schema.json)
- [schemas/project-video-narration-manifest.schema.json](../schemas/project-video-narration-manifest.schema.json)
- [schemas/project-video-voice-samples.schema.json](../schemas/project-video-voice-samples.schema.json)
- [schemas/project-video-voice-selection.schema.json](../schemas/project-video-voice-selection.schema.json)
- [tests/project-video.test.mjs](../tests/project-video.test.mjs)
- [tests/skill-contracts.test.mjs](../tests/skill-contracts.test.mjs)

**Implementation:**
1. Obtain explicit approval for this exact finding, files and intended behavior. Before editing any existing skill package, route its named owner through skill-update and its required proceed gate; expand scope only with a revised approved proposal.
2. Add the smallest durable red regression reproducing AUD-0135; use the recorded controlled conditions without credentials, live providers, or destructive real-project fixtures.
3. Synchronize canonical profile definitions and schemas, with an explicit compatibility decision for existing artifacts.
4. Update affected producer/runtime/schema/template/help contracts together and extend tests/skill-contracts.test.mjs. Preserve supported legacy inputs and explicitly migrate or reject unsupported state.
5. Run the focused regression and positive/compatibility controls, then the full native gate in a short-path isolated snapshot. Validate emitted artifacts with actual local schemas, review the bounded diff, and publish only owner-approved local evidence.

**Acceptance:**
- Validate actual emitted A/B/C audition, selection, narration, and final-video artifacts against all owning schemas.
- Do not limit assertions to producer-internal field equality.
- Supported success paths remain correct; intentional rejection changes are explicit and safely diagnosed.
- No unrelated source/user data/accepted history changes, widened tools/permissions, new external calls, silent fallback or false success claim.

**Verification:**
- node --test tests\project-video.test.mjs
- npm run check
- Validate affected produced JSON against its actual schema; inspect preserved originals and safe diagnostics on negative paths.

**Rollout:** After approval, update producer/runtime/schema/help definitions together, define compatibility for existing artifacts, and validate real emitted artifacts against actual schemas before rolling out.

**Rollback:** Restore the prior approved producer/schema pair and retain pre-migration artifacts if compatibility fails; do not reinterpret old provenance or rewrite accepted records.

**Residual risk:** Only the stated root cause is addressed. Other confirmed findings, blocked deployment review, hosted/advisory/standards gaps and unqualified physical/live behavior remain. Security assurance must be reassessed after evidence refresh.

## REM-0136: Selected-SKU quota falls back to another SKU's capacity

Finding: AUD-0136. Depends on: REM-0108. Approval: **required**.

**Proposed files:**
- [.github/prompts/azure-discovery-help.prompt.md](../.github/prompts/azure-discovery-help.prompt.md)
- [.github/skills/azure-discovery/SKILL.md](../.github/skills/azure-discovery/SKILL.md)
- [.github/skills/azure-discovery/scripts/azure-discovery.ps1](../.github/skills/azure-discovery/scripts/azure-discovery.ps1)
- [tests/azure-discovery.test.mjs](../tests/azure-discovery.test.mjs)

**Implementation:**
1. Obtain explicit approval for this exact finding, files and intended behavior. Before editing any existing skill package, route its named owner through skill-update and its required proceed gate; expand scope only with a revised approved proposal.
2. Add the smallest durable red regression reproducing AUD-0136; use the recorded controlled conditions without credentials, live providers, or destructive real-project fixtures.
3. Use unambiguous model/SKU matching and remove fallback to a different quota bucket.
4. Keep directly related owner guidance/help accurate, reuse existing compatible helpers, and avoid unrelated changes or a broad refactor.
5. Run the focused regression and positive/compatibility controls, then the full native gate in a short-path isolated snapshot. Validate emitted artifacts with actual local schemas, review the bounded diff, and publish only owner-approved local evidence.

**Acceptance:**
- Supply Standard capacity but no GlobalStandard bucket; a GlobalStandard request must remain unknown.
- Cover exhausted and available buckets across different SKUs and similarly prefixed model names.
- Supported success paths remain correct; intentional rejection changes are explicit and safely diagnosed.
- No unrelated source/user data/accepted history changes, widened tools/permissions, new external calls, silent fallback or false success claim.

**Verification:**
- node --test tests\azure-discovery.test.mjs
- npm run check
- Validate affected produced JSON against its actual schema; inspect preserved originals and safe diagnostics on negative paths.

**Rollout:** After exact owner/file approval, add a failing focused regression, implement the bounded repair, verify adjacent behavior, actual artifact schemas and the full local gate, then use the normal governed project-update path.

**Rollback:** Revert only the approved implementation change after review if regressions appear. Keep user data, existing outputs and accepted evidence/history unchanged; do not reset the shared worktree or weaken the relevant guard.

**Residual risk:** Only the stated root cause is addressed. Other confirmed findings, blocked deployment review, hosted/advisory/standards gaps and unqualified physical/live behavior remain. Security assurance must be reassessed after evidence refresh.

## REM-0139: Future sync timestamps are reported healthy

Finding: AUD-0139. Depends on: REM-0108. Approval: **required**.

**Proposed files:**
- [.github/prompts/project-status-help.prompt.md](../.github/prompts/project-status-help.prompt.md)
- [.github/skills/project-status/SKILL.md](../.github/skills/project-status/SKILL.md)
- [.github/skills/project-status/scripts/project-status.mjs](../.github/skills/project-status/scripts/project-status.mjs)
- [tests/project-status.test.mjs](../tests/project-status.test.mjs)

**Implementation:**
1. Obtain explicit approval for this exact finding, files and intended behavior. Before editing any existing skill package, route its named owner through skill-update and its required proceed gate; expand scope only with a revised approved proposal.
2. Add the smallest durable red regression reproducing AUD-0139; use the recorded controlled conditions without credentials, live providers, or destructive real-project fixtures.
3. Validate timestamps against the evaluation clock and define any allowed skew explicitly.
4. Keep directly related owner guidance/help accurate, reuse existing compatible helpers, and avoid unrelated changes or a broad refactor.
5. Run the focused regression and positive/compatibility controls, then the full native gate in a short-path isolated snapshot. Validate emitted artifacts with actual local schemas, review the bounded diff, and publish only owner-approved local evidence.

**Acceptance:**
- Test one-millisecond and large future offsets, invalid dates, stale past observations, and explicit failed status.
- Supported success paths remain correct; intentional rejection changes are explicit and safely diagnosed.
- No unrelated source/user data/accepted history changes, widened tools/permissions, new external calls, silent fallback or false success claim.

**Verification:**
- node --test tests\project-status.test.mjs
- npm run check
- Validate affected produced JSON against its actual schema; inspect preserved originals and safe diagnostics on negative paths.

**Rollout:** After exact owner/file approval, add a failing focused regression, implement the bounded repair, verify adjacent behavior, actual artifact schemas and the full local gate, then use the normal governed project-update path.

**Rollback:** Revert only the approved implementation change after review if regressions appear. Keep user data, existing outputs and accepted evidence/history unchanged; do not reset the shared worktree or weaken the relevant guard.

**Residual risk:** Only the stated root cause is addressed. Other confirmed findings, blocked deployment review, hosted/advisory/standards gaps and unqualified physical/live behavior remain. Security assurance must be reassessed after evidence refresh.

## REM-0142: Documentation build publishes new verified guides from stale source snapshots

Finding: AUD-0142. Depends on: REM-0108. Approval: **required**.

**Proposed files:**
- [.github/prompts/documentation-builder-help.prompt.md](../.github/prompts/documentation-builder-help.prompt.md)
- [.github/prompts/project-understanding-help.prompt.md](../.github/prompts/project-understanding-help.prompt.md)
- [.github/skills/documentation-builder/SKILL.md](../.github/skills/documentation-builder/SKILL.md)
- [.github/skills/documentation-builder/scripts/documentation-builder.mjs](../.github/skills/documentation-builder/scripts/documentation-builder.mjs)
- [.github/skills/project-understanding/SKILL.md](../.github/skills/project-understanding/SKILL.md)
- [tests/documentation-builder.test.mjs](../tests/documentation-builder.test.mjs)
- [tests/project-understanding.test.mjs](../tests/project-understanding.test.mjs)

**Implementation:**
1. Obtain explicit approval for this exact finding, files and intended behavior. Before editing any existing skill package, route its named owner through skill-update and its required proceed gate; expand scope only with a revised approved proposal.
2. Add the smallest durable red regression reproducing AUD-0142; use the recorded controlled conditions without credentials, live providers, or destructive real-project fixtures.
3. Preserve historical report-pair validation. Add or require a current-source gate at documentation generation, reusing the producer's bounded/excluded scan contract, or expose an explicitly historical mode with snapshot date/currency instead of current-source assurance.
4. Keep directly related owner guidance/help accurate, reuse existing compatible helpers, and avoid unrelated changes or a broad refactor.
5. Run the focused regression and positive/compatibility controls, then the full native gate in a short-path isolated snapshot. Validate emitted artifacts with actual local schemas, review the bounded diff, and publish only owner-approved local evidence.

**Acceptance:**
- Produce a genuine snapshot, then change the start command and README and delete the original source before generating a new guide; reject, refresh, or explicitly label the output historical.
- Verify that snapshot-only validation continues to accept an unmodified historical report pair.
- Ensure verified current claims do not retain obsolete commands or deleted source evidence.
- Supported success paths remain correct; intentional rejection changes are explicit and safely diagnosed.
- No unrelated source/user data/accepted history changes, widened tools/permissions, new external calls, silent fallback or false success claim.

**Verification:**
- node --test tests\documentation-builder.test.mjs tests\project-understanding.test.mjs
- npm run check
- Validate affected produced JSON against its actual schema; inspect preserved originals and safe diagnostics on negative paths.

**Rollout:** After exact owner/file approval, add a failing focused regression, implement the bounded repair, verify adjacent behavior, actual artifact schemas and the full local gate, then use the normal governed project-update path.

**Rollback:** Revert only the approved implementation change after review if regressions appear. Keep user data, existing outputs and accepted evidence/history unchanged; do not reset the shared worktree or weaken the relevant guard.

**Residual risk:** Only the stated root cause is addressed. Other confirmed findings, blocked deployment review, hosted/advisory/standards gaps and unqualified physical/live behavior remain. Security assurance must be reassessed after evidence refresh.

## REM-0143: Media response caps are enforced only after full body buffering

Finding: AUD-0143. Depends on: REM-0108. Approval: **required**.

**Proposed files:**
- [.github/prompts/project-video-help.prompt.md](../.github/prompts/project-video-help.prompt.md)
- [.github/prompts/project-visual-storytelling-help.prompt.md](../.github/prompts/project-visual-storytelling-help.prompt.md)
- [.github/skills/project-video/SKILL.md](../.github/skills/project-video/SKILL.md)
- [.github/skills/project-video/scripts/project-video.mjs](../.github/skills/project-video/scripts/project-video.mjs)
- [.github/skills/project-visual-storytelling/SKILL.md](../.github/skills/project-visual-storytelling/SKILL.md)
- [.github/skills/project-visual-storytelling/scripts/azure-openai-image-render.mjs](../.github/skills/project-visual-storytelling/scripts/azure-openai-image-render.mjs)
- [.github/skills/project-visual-storytelling/scripts/mai-image-render.mjs](../.github/skills/project-visual-storytelling/scripts/mai-image-render.mjs)
- [tests/project-video.test.mjs](../tests/project-video.test.mjs)
- [tests/project-visual-storytelling.test.mjs](../tests/project-visual-storytelling.test.mjs)

**Implementation:**
1. Obtain explicit approval for this exact finding, files and intended behavior. Before editing any existing skill package, route its named owner through skill-update and its required proceed gate; expand scope only with a revised approved proposal.
2. Add the smallest durable red regression reproducing AUD-0143; use the recorded controlled conditions without credentials, live providers, or destructive real-project fixtures.
3. Use bounded streaming readers for successful and error responses; abort and release the response at the first exceeded limit.
4. Keep directly related owner guidance/help accurate, reuse existing compatible helpers, and avoid unrelated changes or a broad refactor.
5. Run the focused regression and positive/compatibility controls, then the full native gate in a short-path isolated snapshot. Validate emitted artifacts with actual local schemas, review the bounded diff, and publish only owner-approved local evidence.

**Acceptance:**
- Use fake chunked streams without Content-Length and assert early cancellation before accumulating more than the cap.
- Cover false Content-Length and oversized image JSON/error bodies.
- Supported success paths remain correct; intentional rejection changes are explicit and safely diagnosed.
- No unrelated source/user data/accepted history changes, widened tools/permissions, new external calls, silent fallback or false success claim.

**Verification:**
- node --test tests\project-video.test.mjs tests\project-visual-storytelling.test.mjs
- npm run check
- Validate affected produced JSON against its actual schema; inspect preserved originals and safe diagnostics on negative paths.

**Rollout:** After exact owner/file approval, add a failing focused regression, implement the bounded repair, verify adjacent behavior, actual artifact schemas and the full local gate, then use the normal governed project-update path.

**Rollback:** Revert only the approved implementation change after review if regressions appear. Keep user data, existing outputs and accepted evidence/history unchanged; do not reset the shared worktree or weaken the relevant guard.

**Residual risk:** Only the stated root cause is addressed. Other confirmed findings, blocked deployment review, hosted/advisory/standards gaps and unqualified physical/live behavior remain. Security assurance must be reassessed after evidence refresh.

## REM-0113: Classic result-persistence failure leaves the new agent installed

Finding: AUD-0113. Depends on: REM-0110, REM-0120, REM-0108. Approval: **required**.

**Proposed files:**
- [.github/prompts/agent-builder-help.prompt.md](../.github/prompts/agent-builder-help.prompt.md)
- [.github/skills/agent-builder/SKILL.md](../.github/skills/agent-builder/SKILL.md)
- [.github/skills/agent-builder/scripts/agent-builder.mjs](../.github/skills/agent-builder/scripts/agent-builder.mjs)
- [tests/agent-builder.test.mjs](../tests/agent-builder.test.mjs)
- [tests/native-copilot-studio.test.mjs](../tests/native-copilot-studio.test.mjs)

**Implementation:**
1. Obtain explicit approval for this exact finding, files and intended behavior. Before editing any existing skill package, route its named owner through skill-update and its required proceed gate; expand scope only with a revised approved proposal.
2. Add the smallest durable red regression reproducing AUD-0113; use the recorded controlled conditions without credentials, live providers, or destructive real-project fixtures.
3. Include result persistence in the transaction and lock lifetime with explicit outcome handling.
4. Keep directly related owner guidance/help accurate, reuse existing compatible helpers, and avoid unrelated changes or a broad refactor.
5. Run the focused regression and positive/compatibility controls, then the full native gate in a short-path isolated snapshot. Validate emitted artifacts with actual local schemas, review the bounded diff, and publish only owner-approved local evidence.

**Acceptance:**
- Inject only the final result rename failure; assert a coherent result or rollback and verify the lock is retained through outcome persistence.
- Supported success paths remain correct; intentional rejection changes are explicit and safely diagnosed.
- No unrelated source/user data/accepted history changes, widened tools/permissions, new external calls, silent fallback or false success claim.

**Verification:**
- node --test tests\agent-builder.test.mjs tests\native-copilot-studio.test.mjs
- npm run check
- Validate affected produced JSON against its actual schema; inspect preserved originals and safe diagnostics on negative paths.

**Rollout:** After exact agent-builder approval, exercise both classic and native paths with preserved legacy blueprint interfaces. Apply only to temporary fixtures first; existing agent installations need their own reviewed update.

**Rollback:** If validation fails, stop before applying to real destinations and roll back only the approved source patch. Preserve originals, concurrent edits, incomplete journals and surviving backups; never delete them merely to make rollback look successful.

**Residual risk:** Only the stated root cause is addressed. Other confirmed findings, blocked deployment review, hosted/advisory/standards gaps and unqualified physical/live behavior remain. Security assurance must be reassessed after evidence refresh.

## REM-0124: Safe-all accepts local-only edits then rolls back while verifying them

Finding: AUD-0124. Depends on: REM-0123, REM-0108. Approval: **required**.

**Proposed files:**
- [README.md](../README.md)
- [pso.mjs](../pso.mjs)
- [tests/adoption-rerun.test.mjs](../tests/adoption-rerun.test.mjs)

**Implementation:**
1. Obtain explicit approval for this exact finding, files and intended behavior. Before editing any existing skill package, route its named owner through skill-update and its required proceed gate; expand scope only with a revised approved proposal.
2. Add the smallest durable red regression reproducing AUD-0124; use the recorded controlled conditions without credentials, live providers, or destructive real-project fixtures.
3. Make candidate verification classification/action-aware; distinguish preservation from replacement and baseline advancement.
4. Keep directly related owner guidance/help accurate, reuse existing compatible helpers, and avoid unrelated changes or a broad refactor.
5. Run the focused regression and positive/compatibility controls, then the full native gate in a short-path isolated snapshot. Validate emitted artifacts with actual local schemas, review the bounded diff, and publish only owner-approved local evidence.

**Acceptance:**
- Apply safe-all with valid local-only content and test converged/no-action cases, ensuring bytes and baseline policy remain correct.
- Supported success paths remain correct; intentional rejection changes are explicit and safely diagnosed.
- No unrelated source/user data/accepted history changes, widened tools/permissions, new external calls, silent fallback or false success claim.

**Verification:**
- node --test tests\adoption-rerun.test.mjs
- npm run check
- Validate affected produced JSON against its actual schema; inspect preserved originals and safe diagnostics on negative paths.

**Rollout:** After explicit approval, test a copy of a generated/adopted project across supported manifest versions, then rerun the native update/adoption/release regressions and full gate. Do not automatically modify existing projects or publish a release.

**Rollback:** Revert only the approved implementation change after review if regressions appear. Keep user data, existing outputs and accepted evidence/history unchanged; do not reset the shared worktree or weaken the relevant guard.

**Residual risk:** Only the stated root cause is addressed. Other confirmed findings, blocked deployment review, hosted/advisory/standards gaps and unqualified physical/live behavior remain. Security assurance must be reassessed after evidence refresh.

## REM-0132: Header-only invalid PNGs pass automated image qualification

Finding: AUD-0132. Depends on: REM-0143, REM-0108. Approval: **required**.

**Proposed files:**
- [.github/prompts/project-visual-storytelling-help.prompt.md](../.github/prompts/project-visual-storytelling-help.prompt.md)
- [.github/skills/project-visual-storytelling/SKILL.md](../.github/skills/project-visual-storytelling/SKILL.md)
- [.github/skills/project-visual-storytelling/scripts/azure-openai-image-render.mjs](../.github/skills/project-visual-storytelling/scripts/azure-openai-image-render.mjs)
- [.github/skills/project-visual-storytelling/scripts/mai-image-render.mjs](../.github/skills/project-visual-storytelling/scripts/mai-image-render.mjs)
- [.github/skills/project-visual-storytelling/scripts/project-visual-storytelling.mjs](../.github/skills/project-visual-storytelling/scripts/project-visual-storytelling.mjs)
- [tests/project-visual-storytelling.test.mjs](../tests/project-visual-storytelling.test.mjs)

**Implementation:**
1. Obtain explicit approval for this exact finding, files and intended behavior. Before editing any existing skill package, route its named owner through skill-update and its required proceed gate; expand scope only with a revised approved proposal.
2. Add the smallest durable red regression reproducing AUD-0132; use the recorded controlled conditions without credentials, live providers, or destructive real-project fixtures.
3. Perform full bounded PNG decoding compatible with the supported dimensions and color formats, including chunk/CRC/data validation.
4. Keep directly related owner guidance/help accurate, reuse existing compatible helpers, and avoid unrelated changes or a broad refactor.
5. Run the focused regression and positive/compatibility controls, then the full native gate in a short-path isolated snapshot. Validate emitted artifacts with actual local schemas, review the bounded diff, and publish only owner-approved local evidence.

**Acceptance:**
- Reject signature-only, truncated, CRC-corrupt, missing-IDAT, and oversized-expansion PNGs.
- Use an independent real PNG encoder for provider success fixtures.
- Supported success paths remain correct; intentional rejection changes are explicit and safely diagnosed.
- No unrelated source/user data/accepted history changes, widened tools/permissions, new external calls, silent fallback or false success claim.

**Verification:**
- node --test tests\project-visual-storytelling.test.mjs
- npm run check
- Validate affected produced JSON against its actual schema; inspect preserved originals and safe diagnostics on negative paths.

**Rollout:** After exact owner/file approval, add a failing focused regression, implement the bounded repair, verify adjacent behavior, actual artifact schemas and the full local gate, then use the normal governed project-update path.

**Rollback:** Revert only the approved implementation change after review if regressions appear. Keep user data, existing outputs and accepted evidence/history unchanged; do not reset the shared worktree or weaken the relevant guard.

**Residual risk:** Only the stated root cause is addressed. Other confirmed findings, blocked deployment review, hosted/advisory/standards gaps and unqualified physical/live behavior remain. Security assurance must be reassessed after evidence refresh.

## REM-0140: Documentation promotes planned items into verified claims

Finding: AUD-0140. Depends on: REM-0142, REM-0108. Approval: **required**.

**Proposed files:**
- [.github/prompts/documentation-builder-help.prompt.md](../.github/prompts/documentation-builder-help.prompt.md)
- [.github/skills/documentation-builder/SKILL.md](../.github/skills/documentation-builder/SKILL.md)
- [.github/skills/documentation-builder/scripts/documentation-builder.mjs](../.github/skills/documentation-builder/scripts/documentation-builder.mjs)
- [tests/documentation-builder.test.mjs](../tests/documentation-builder.test.mjs)

**Implementation:**
1. Obtain explicit approval for this exact finding, files and intended behavior. Before editing any existing skill package, route its named owner through skill-update and its required proceed gate; expand scope only with a revised approved proposal.
2. Add the smallest durable red regression reproducing AUD-0140; use the recorded controlled conditions without credentials, live providers, or destructive real-project fixtures.
3. Preserve supported statuses, explicitly map uncertainty, or exclude unsupported assertions with a limitation.
4. Keep directly related owner guidance/help accurate, reuse existing compatible helpers, and avoid unrelated changes or a broad refactor.
5. Run the focused regression and positive/compatibility controls, then the full native gate in a short-path isolated snapshot. Validate emitted artifacts with actual local schemas, review the bounded diff, and publish only owner-approved local evidence.

**Acceptance:**
- Generate guides from verified, planned, inferred, and unknown source items; none may silently gain stronger assurance.
- Supported success paths remain correct; intentional rejection changes are explicit and safely diagnosed.
- No unrelated source/user data/accepted history changes, widened tools/permissions, new external calls, silent fallback or false success claim.

**Verification:**
- node --test tests\documentation-builder.test.mjs
- npm run check
- Validate affected produced JSON against its actual schema; inspect preserved originals and safe diagnostics on negative paths.

**Rollout:** After exact owner/file approval, add a failing focused regression, implement the bounded repair, verify adjacent behavior, actual artifact schemas and the full local gate, then use the normal governed project-update path.

**Rollback:** Revert only the approved implementation change after review if regressions appear. Keep user data, existing outputs and accepted evidence/history unchanged; do not reset the shared worktree or weaken the relevant guard.

**Residual risk:** Only the stated root cause is addressed. Other confirmed findings, blocked deployment review, hosted/advisory/standards gaps and unqualified physical/live behavior remain. Security assurance must be reassessed after evidence refresh.

## REM-0141: Empty understanding Markdown bypasses its digest check

Finding: AUD-0141. Depends on: REM-0142, REM-0108. Approval: **required**.

**Proposed files:**
- [.github/prompts/documentation-builder-help.prompt.md](../.github/prompts/documentation-builder-help.prompt.md)
- [.github/skills/documentation-builder/SKILL.md](../.github/skills/documentation-builder/SKILL.md)
- [.github/skills/documentation-builder/scripts/documentation-builder.mjs](../.github/skills/documentation-builder/scripts/documentation-builder.mjs)
- [tests/documentation-builder.test.mjs](../tests/documentation-builder.test.mjs)

**Implementation:**
1. Obtain explicit approval for this exact finding, files and intended behavior. Before editing any existing skill package, route its named owner through skill-update and its required proceed gate; expand scope only with a revised approved proposal.
2. Add the smallest durable red regression reproducing AUD-0141; use the recorded controlled conditions without credentials, live providers, or destructive real-project fixtures.
3. Distinguish unavailable input from empty input and always hash supplied Markdown.
4. Keep directly related owner guidance/help accurate, reuse existing compatible helpers, and avoid unrelated changes or a broad refactor.
5. Run the focused regression and positive/compatibility controls, then the full native gate in a short-path isolated snapshot. Validate emitted artifacts with actual local schemas, review the bounded diff, and publish only owner-approved local evidence.

**Acceptance:**
- Truncate the understanding Markdown to zero bytes after generating a valid guide; validate must fail.
- Retain tests for appended and replaced content.
- Supported success paths remain correct; intentional rejection changes are explicit and safely diagnosed.
- No unrelated source/user data/accepted history changes, widened tools/permissions, new external calls, silent fallback or false success claim.

**Verification:**
- node --test tests\documentation-builder.test.mjs
- npm run check
- Validate affected produced JSON against its actual schema; inspect preserved originals and safe diagnostics on negative paths.

**Rollout:** After exact owner/file approval, add a failing focused regression, implement the bounded repair, verify adjacent behavior, actual artifact schemas and the full local gate, then use the normal governed project-update path.

**Rollback:** Revert only the approved implementation change after review if regressions appear. Keep user data, existing outputs and accepted evidence/history unchanged; do not reset the shared worktree or weaken the relevant guard.

**Residual risk:** Only the stated root cause is addressed. Other confirmed findings, blocked deployment review, hosted/advisory/standards gaps and unqualified physical/live behavior remain. Security assurance must be reassessed after evidence refresh.

## REM-0119: Boolean solution name passes runtime but violates emitted schema

Finding: AUD-0119. Depends on: REM-0108. Approval: **required**.

**Proposed files:**
- [.github/prompts/agent-builder-help.prompt.md](../.github/prompts/agent-builder-help.prompt.md)
- [.github/skills/agent-builder/SKILL.md](../.github/skills/agent-builder/SKILL.md)
- [.github/skills/agent-builder/scripts/native-studio.mjs](../.github/skills/agent-builder/scripts/native-studio.mjs)
- [schemas/copilot-studio-handoff.schema.json](../schemas/copilot-studio-handoff.schema.json)
- [tests/agent-builder.test.mjs](../tests/agent-builder.test.mjs)
- [tests/native-copilot-studio.test.mjs](../tests/native-copilot-studio.test.mjs)
- [tests/skill-contracts.test.mjs](../tests/skill-contracts.test.mjs)

**Implementation:**
1. Obtain explicit approval for this exact finding, files and intended behavior. Before editing any existing skill package, route its named owner through skill-update and its required proceed gate; expand scope only with a revised approved proposal.
2. Add the smallest durable red regression reproducing AUD-0119; use the recorded controlled conditions without credentials, live providers, or destructive real-project fixtures.
3. Check scalar types before applying regexes in both spec and handoff validation.
4. Update affected producer/runtime/schema/template/help contracts together and extend tests/skill-contracts.test.mjs. Preserve supported legacy inputs and explicitly migrate or reject unsupported state.
5. Run the focused regression and positive/compatibility controls, then the full native gate in a short-path isolated snapshot. Validate emitted artifacts with actual local schemas, review the bounded diff, and publish only owner-approved local evidence.

**Acceptance:**
- Add producer/API/schema parity tests for true, false, arrays, objects, and valid strings/null.
- Supported success paths remain correct; intentional rejection changes are explicit and safely diagnosed.
- No unrelated source/user data/accepted history changes, widened tools/permissions, new external calls, silent fallback or false success claim.

**Verification:**
- node --test tests\agent-builder.test.mjs tests\native-copilot-studio.test.mjs
- npm run check
- Validate affected produced JSON against its actual schema; inspect preserved originals and safe diagnostics on negative paths.

**Rollout:** After exact agent-builder approval, exercise both classic and native paths with preserved legacy blueprint interfaces. Apply only to temporary fixtures first; existing agent installations need their own reviewed update.

**Rollback:** Restore the prior approved producer/schema pair and retain pre-migration artifacts if compatibility fails; do not reinterpret old provenance or rewrite accepted records.

**Residual risk:** Only the stated root cause is addressed. Other confirmed findings, blocked deployment review, hosted/advisory/standards gaps and unqualified physical/live behavior remain. Security assurance must be reassessed after evidence refresh.

## REM-0144: A flat directory bypasses the repository file-count limit

Finding: AUD-0144. Depends on: REM-0108. Approval: **required**.

**Proposed files:**
- [.github/prompts/project-understanding-help.prompt.md](../.github/prompts/project-understanding-help.prompt.md)
- [.github/skills/project-understanding/SKILL.md](../.github/skills/project-understanding/SKILL.md)
- [.github/skills/project-understanding/scripts/project-understanding.mjs](../.github/skills/project-understanding/scripts/project-understanding.mjs)
- [tests/project-understanding.test.mjs](../tests/project-understanding.test.mjs)

**Implementation:**
1. Obtain explicit approval for this exact finding, files and intended behavior. Before editing any existing skill package, route its named owner through skill-update and its required proceed gate; expand scope only with a revised approved proposal.
2. Add the smallest durable red regression reproducing AUD-0144; use the recorded controlled conditions without credentials, live providers, or destructive real-project fixtures.
3. Check and enforce the maximum on each insertion, with an explicit inclusive boundary.
4. Keep directly related owner guidance/help accurate, reuse existing compatible helpers, and avoid unrelated changes or a broad refactor.
5. Run the focused regression and positive/compatibility controls, then the full native gate in a short-path isolated snapshot. Validate emitted artifacts with actual local schemas, review the bounded diff, and publish only owner-approved local evidence.

**Acceptance:**
- Test 29999, 30000, and 30001 eligible files in one directory and across nested directories.
- Assert the oversized scan fails before claiming complete coverage.
- Supported success paths remain correct; intentional rejection changes are explicit and safely diagnosed.
- No unrelated source/user data/accepted history changes, widened tools/permissions, new external calls, silent fallback or false success claim.

**Verification:**
- node --test tests\project-understanding.test.mjs
- npm run check
- Validate affected produced JSON against its actual schema; inspect preserved originals and safe diagnostics on negative paths.

**Rollout:** After exact owner/file approval, add a failing focused regression, implement the bounded repair, verify adjacent behavior, actual artifact schemas and the full local gate, then use the normal governed project-update path.

**Rollback:** Revert only the approved implementation change after review if regressions appear. Keep user data, existing outputs and accepted evidence/history unchanged; do not reset the shared worktree or weaken the relevant guard.

**Residual risk:** Only the stated root cause is addressed. Other confirmed findings, blocked deployment review, hosted/advisory/standards gaps and unqualified physical/live behavior remain. Security assurance must be reassessed after evidence refresh.

## REM-0145: Default opted-in MCP services violate the environment schema

Finding: AUD-0145. Depends on: REM-0108. Approval: **required**.

**Proposed files:**
- [.github/prompts/azure-discovery-help.prompt.md](../.github/prompts/azure-discovery-help.prompt.md)
- [.github/skills/azure-discovery/SKILL.md](../.github/skills/azure-discovery/SKILL.md)
- [.github/skills/azure-discovery/scripts/azure-environment.ps1](../.github/skills/azure-discovery/scripts/azure-environment.ps1)
- [schemas/azure-environment.schema.json](../schemas/azure-environment.schema.json)
- [tests/azure-discovery.test.mjs](../tests/azure-discovery.test.mjs)
- [tests/skill-contracts.test.mjs](../tests/skill-contracts.test.mjs)

**Implementation:**
1. Obtain explicit approval for this exact finding, files and intended behavior. Before editing any existing skill package, route its named owner through skill-update and its required proceed gate; expand scope only with a revised approved proposal.
2. Add the smallest durable red regression reproducing AUD-0145; use the recorded controlled conditions without credentials, live providers, or destructive real-project fixtures.
3. Reconcile supported MCP service identifiers and schema syntax rather than weakening unrelated profile validation.
4. Update affected producer/runtime/schema/template/help contracts together and extend tests/skill-contracts.test.mjs. Preserve supported legacy inputs and explicitly migrate or reject unsupported state.
5. Run the focused regression and positive/compatibility controls, then the full native gate in a short-path isolated snapshot. Validate emitted artifacts with actual local schemas, review the bounded diff, and publish only owner-approved local evidence.

**Acceptance:**
- Schema-validate the complete default MCP-enabled profile and representative explicit service lists.
- Retain default-disabled and Foundry Extensions opt-in gate tests.
- Supported success paths remain correct; intentional rejection changes are explicit and safely diagnosed.
- No unrelated source/user data/accepted history changes, widened tools/permissions, new external calls, silent fallback or false success claim.

**Verification:**
- node --test tests\azure-discovery.test.mjs
- npm run check
- Validate affected produced JSON against its actual schema; inspect preserved originals and safe diagnostics on negative paths.

**Rollout:** After approval, update producer/runtime/schema/help definitions together, define compatibility for existing artifacts, and validate real emitted artifacts against actual schemas before rolling out.

**Rollback:** Restore the prior approved producer/schema pair and retain pre-migration artifacts if compatibility fails; do not reinterpret old provenance or rewrite accepted records.

**Residual risk:** Only the stated root cause is addressed. Other confirmed findings, blocked deployment review, hosted/advisory/standards gaps and unqualified physical/live behavior remain. Security assurance must be reassessed after evidence refresh.

## Unscheduled disposition

- **AUD-0133: needs-more-evidence.** Public-CLI positive/control probes confirm identical requires-review outcomes for changed image bytes. The documented contract remains preliminary and does not promise hash identity; preserve medium confidence and request a boundary decision rather than calling this a confirmed defect.

## Limitations and gates

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
- Execution state is approval-wait. All 45 implementation items require explicit approval; owner roles are proposed, not assignments or recorded consent. No remediation was executed.
- Before execution, audit-remediation must pass policy, current-plan digest, checkpoint and event-integrity gates. The historical joined JSONL record is not authority to rewrite accepted history; use an explicitly approved recovery route if it blocks execution.
- M1 addresses the reproduced source/report evidence-lifecycle blocker, not a blanket exclusion of reports from scans. Rescan all generated reports independently and retain honest pre-/post-publication evidence.
- M1 is not assumed runnable while required checkpoints fail. Resolve the blocker through an explicitly approved owning recovery route and regenerate run-bound evidence before continuing; this plan never authorizes bypassing a gate or rewriting accepted history.
- Dependencies are technical/precondition edges, not a permission shortcut. Execute in dependency order, use one owner/writer per file, and avoid parallel edits to shared runtime, schemas, test or report surfaces.
- No broad project upgrade, automatic retrofit of installed agents, live-provider test, download, external standards fetch, signing, deployment or release publication is included.
- Current external best-practice citations remain unavailable. The concrete acceptance criteria come from verified repository behavior; obtain separate approved external evidence before claiming standards conformance.
