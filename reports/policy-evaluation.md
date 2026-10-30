# Audit Commit And Push Policy

Decision: allow under the current explicit request and delegated clarification answers.

Scope: reviewed audit fixes and required evidence to origin/release/1.1.2; runtime/framework metadata unchanged.

- The exact isolated candidate must pass focused and full checks plus a fresh offline secret scan.
- Verify no worktree/index drift before staging; preserve unrelated pending changes.
- Reject a changed upstream or non-fast-forward push; no force push, branch replacement, history rewrite, dependency installation, cloud operation, tag or release publication.
- Do not reuse historical scan receipts as current proof after candidate, index, ref or HEAD changes.
