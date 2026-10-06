---
mode: agent
description: Help for the documentation-builder skill.
---

# documentation-builder Help

Generate and maintain the authoritative project guide, README files, decision records, deployment guides, and operations runbooks from verified repository evidence. Use when documentation is missing, stale, or contradicts the code; do not use to narrate changes an agent just made.

Explain this contract as help only. Do not execute its procedures or treat examples as action approval.
Read the complete contract at .github/skills/documentation-builder/SKILL.md before using this skill.

## Purpose

Produce and refresh human-facing documentation that is verified against the repository, addresses one audience per document, and never presents intended behavior as delivered behavior. The canonical shared artifact is `docs/PROJECT-GUIDE.md`, with a machine-readable companion at `reports/project-guide.json`; downstream presentation, social-post, and executive-demo skills consume it as their common project narrative.

## Preconditions

- Read repository instructions and existing documentation before writing.
- Inspect the code, configuration, and infrastructure that each claim describes.
- Confirm this skill owns documentation output rather than the skill that owns the underlying artifact.
- Never create a document that narrates agent activity instead of describing the system.

## Inputs

- Documentation request: target artifacts, audience, and depth.
- Repository evidence: entry points, manifests, scripts, configuration, infrastructure definitions, and tests.
- Existing documentation, decision records, and authoritative reports under `reports/`.
- The current Project Understanding artifacts and their content digests.
- Clarification result from `clarify-the-ask` when audience, scope, or product intent is ambiguous.

## Approved Tools and Resources

- Use read-only repository inspection to verify every command, path, port, and setting.
- Use file creation and in-place edits for the documentation artifacts named in the approved plan.
- Use schema validators for the emitted plan.
- Do not modify source, configuration, infrastructure, or machine-readable reports.

## Read and Write Boundaries

- Update existing documents in place rather than creating parallel documents that will drift.
- Write only the owned reports listed below plus the approved documentation artifacts.
- Never include secrets, tokens, tenant or subscription identifiers, customer names, or personal data.
- Never contradict a machine-readable report under `reports/`; cite it instead.

## Procedure

1. Determine which documents are required, which exist, and which are stale relative to the code they describe.
2. Run `node .github/skills/documentation-builder/scripts/documentation-builder.mjs build` from the target project after `project-understanding scan`. The helper builds `docs/PROJECT-GUIDE.md` and `reports/project-guide.json` for that project's own evidence, not the orchestrator source repository.
3. Run `node .github/skills/documentation-builder/scripts/documentation-builder.mjs validate` before relying on the guide. It rejects missing or stale Project Understanding digests and unsupported claim evidence.
   Both build and validation reuse the `project-understanding` owner's current-source checker. Added, removed, or changed scanned files require a fresh owner scan; a self-consistent historical report pair alone does not prove current source.
   The producer explicitly identifies downstream operational attestations excluded from current-code provenance, preventing guide/checkpoint/certificate publication cycles. This guide is not a cached substitute for current workflow status or secret-scan evidence.
4. Fix one audience per additional document: new contributor, operator, security reviewer, or executive.
5. Classify each additional document by Diátaxis intent: tutorial for learning, how-to for a goal, reference for exact facts, or explanation for understanding. Do not mix intents without an explicit navigation boundary.
6. Extract verified facts from the repository: prerequisites, setup, run and test commands, configuration keys, endpoints, and environments.
7. Verify every command and path by inspection; discard any claim that cannot be confirmed.
8. Draft or update each document, leading with the outcome and following with the procedure.
9. Mark planned or unimplemented behavior explicitly and never describe it as available.
10. Reconcile documentation against accepted decision records and authoritative reports, and flag contradictions rather than resolving them silently.
11. Record which documents were created, updated, left unchanged, or blocked, with the evidence used for each.

## Validation

- Every command, path, and configuration key in the output was verified against the repository.
- `docs/PROJECT-GUIDE.md` is the canonical shared narrative and `reports/project-guide.json` binds its claims to current evidence.
- Each document addresses exactly one audience and contains one top-level heading.
- Each additional document has one primary Diátaxis intent, and its structure matches that intent.
- Preserve `verified` and `planned` claim classifications. Map `inferred` and `unknown` source claims to unavailable verification evidence, with their original uncertainty label visible in the guide; never promote them to verified behavior.
- Validate the understanding Markdown digest even when its content is empty, and compare guide claims with their current source classifications.
- Unverified or planned behavior is explicitly marked.
- No secrets, identifiers, or personal data appear in any output.
- Contradictions with `reports/` artifacts are reported, not silently reconciled.
- The plan validates against `schemas/documentation-plan.schema.json`.

## Outputs

- `reports/documentation-plan.json`
- `reports/documentation-plan.md`
- `docs/PROJECT-GUIDE.md`
- `reports/project-guide.json`

## Failure Behavior

- Fail closed when the repository provides no verifiable evidence for the requested document.
- Leave a document unchanged and report it as blocked rather than publishing an unverified claim.
- Never invent setup steps, commands, endpoints, or architecture to fill a gap.

## Approval Gates

Require explicit approval before creating a new document, restructuring an existing one, or publishing documentation outside the repository.

## Composition and Dependencies

- clarify-the-ask
- project-understanding

## Examples

- Rebuild a stale `README.md` from the verified build, run, and test commands the repository actually defines.
- Produce an operations runbook covering monitoring signals, common failures, and recovery steps for a deployed service.

## Related commands

- Run the skill with /documentation-builder.
- Open this help with /documentation-builder-help.
- Inspect the full contract with @.github/skills/documentation-builder/SKILL.md.
