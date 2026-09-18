# STEP-012 Regression Test Result

- Workflow: `WF-SAFE-PROJECT-UPDATE-20260917`
- Step: `STEP-012`
- Sequence: `46` (preserved; state not advanced)
- Status: **Passed**

## Red Evidence

All five confirmed findings reproduced before their fixes. A persisted fork caused duplicate report
producer errors on an unrelated second update; an unknown lock-entry field was accepted; `--mdoe`
silently defaulted update mode; an extra local package member remained canonical after fork; and the
repository guide-binding test observed stale guide and Project Understanding hashes.

## Green Evidence

The focused five-test updater selection passed 5/5 after syntax validation. The three neighboring
suites passed 80/80: adoption/update 66/66, security fuzz 12/12, and documentation builder 2/2.
The documentation-builder validator accepted the existing approved guide and synchronized evidence.

`npm run check` passed 172 tests with 0 failures and 1 expected platform skip, scanned 274 files,
checksum-verified 183 release files, and inventoried, audited, and distribution-verified all 47 skills.

## Result

Persisted fork ownership now survives later applies. Runtime lock validation fails closed on malformed
shape, scope, policy, ownership, references, paths, and digests before planning or apply mutation.
Update rejects unknown options before mode fallback. Fork transactions preserve the complete local
package, restore canonical content exactly from upstream, and roll back the full package directory.
The approved project guide was not regenerated; its evidence binding was synchronized and is now gated.

## State Boundary

Workflow state remains current step 12 with last completed step 11 and last sequence 46.
`reports/current-execution-state.json`, its Markdown view, and `reports/execution-log.jsonl` were not
edited by this remediation. No commit, push, fetch, network, Azure, deployment, or publication action
was performed.

## Review Readiness

Ready to rerun STEP-012. The bounded post-fix review reports no remaining findings.
