---
name: copilot-instructions-builder
description: Analyze a target repository and create or review concise GitHub Copilot instructions that preserve existing guidance, reflect verified project conventions, and avoid secrets or unsupported claims. Use when `.github/copilot-instructions.md` is missing, stale, or needs a governed refresh.
lifecycle: draft
confidence: low
---

# copilot-instructions-builder

## Purpose

Produce repository-specific Copilot instructions from verified project evidence without replacing project-owned rules or turning documentation into executable authority.

## Preconditions

- Read repository instructions and applicable configuration.
- Complete clarification for the target project, intended audience, and update boundary.
- Obtain current Project Understanding evidence before proposing instructions.

## Inputs

- Target repository root and current instruction files.
- Project Understanding artifacts, manifests, tests, and development conventions.
- Requested instruction scope and explicit exclusions.

## Approved Tools and Resources

- Use read-only repository inspection and deterministic local validation.
- Use the existing Project Understanding and Documentation Builder outputs.
- Do not fetch or install third-party instruction packages.

## Read and Write Boundaries

- Write only the owned reports and an explicitly approved `.github/copilot-instructions.md`.
- Preserve project-authored guidance outside the approved managed boundary.
- Never include secrets, tenant identifiers, personal data, or unverifiable commands.

## Procedure

1. Inventory active repository, workspace, path-scoped, and agent instructions.
2. Identify conflicts, duplication, stale rules, and missing project conventions.
3. Derive concise guidance for architecture, commands, testing, security, and change boundaries from verified evidence.
4. Produce a before/after plan that distinguishes preserved, updated, and new instruction content.
5. Validate precedence, path references, command accuracy, and contradiction freedom.
6. Apply only the reviewed plan after explicit approval.
7. Report changed content, evidence, limitations, and rollback instructions.

## Validation

- Every project-specific rule maps to current repository evidence.
- Existing higher-precedence or project-owned instructions remain intact.
- Commands and paths exist and no secret-like value appears.
- The result is concise, non-duplicative, and free of generic filler.

## Outputs

- `reports/copilot-instructions-plan.json`
- `reports/copilot-instructions-plan.md`
- `.github/copilot-instructions.md`

## Failure Behavior

- Return blocked when instruction precedence or ownership cannot be resolved.
- Preserve the existing file when evidence is stale or the reviewed plan has drifted.
- Never invent project conventions to fill a gap.

## Approval Gates

Require explicit approval before creating or modifying repository instructions. Commit, push, publication, and external mutation remain separate approvals.

## Composition and Dependencies

- clarify-the-ask
- project-understanding
- documentation-builder
- policy-engine

## Examples

- Create concise Copilot instructions for an adopted repository using verified build and test commands.
- Review an existing instruction file and propose removal of duplicated or stale guidance without applying it.
