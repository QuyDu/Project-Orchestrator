# Project Orchestrator Project Guide

Generated from a complete repository scan. This guide describes the project in which the generator runs.

## Purpose

Turn any repository into a governed GitHub Copilot workspace: agent instructions, scoped standards, reusable prompts, specialist agents, and 47 governed skills — installed consistently, verified after every run, and safe to rerun.

## Architecture

- **.azure**: Top-level project boundary containing 1 scanned files.
- **.github**: Top-level project boundary containing 86 scanned files.
- **.vscode**: Top-level project boundary containing 2 scanned files.
- **Demo**: Top-level project boundary containing 15 scanned files.
- **artifacts**: Top-level project boundary containing 6 scanned files.
- **config**: Top-level project boundary containing 4 scanned files.
- **docs**: Top-level project boundary containing 6 scanned files.
- **release**: Top-level project boundary containing 1 scanned files.
- **reports**: Top-level project boundary containing 89 scanned files.
- **schemas**: Top-level project boundary containing 49 scanned files.
- **scripts**: Top-level project boundary containing 13 scanned files.
- **templates**: Top-level project boundary containing 34 scanned files.
- **tests**: Top-level project boundary containing 16 scanned files.

## Technology

- **.md**: 127 scanned files use this extension.
- **.json**: 108 scanned files use this extension.
- **.mjs**: 40 scanned files use this extension.
- **.mp3**: 22 scanned files use this extension.
- **.ps1**: 11 scanned files use this extension.
- **.svg**: 8 scanned files use this extension.
- **.yml**: 3 scanned files use this extension.
- **.toml**: 2 scanned files use this extension.
- **.yaml**: 2 scanned files use this extension.
- **.html**: 2 scanned files use this extension.
- **.jsonl**: 2 scanned files use this extension.
- **.mmd**: 1 scanned files use this extension.

## Setup And Usage

- **npm run check**: node --check pso.mjs && npm run security && npm run release && npm run release:verify:candidate && node --test tests/skill-contracts.test.mjs tests/agent-builder.test.mjs tests/audit-assurance.test.mjs tests/audit-execution.test.mjs tests/adoption-rerun.test.mjs tests/security-fuzz.test.mjs tests/production-gates.test.mjs tests/package-install.test.mjs tests/project-understanding.test.mjs tests/documentation-builder.test.mjs tests/project-status.test.mjs tests/project-video.test.mjs tests/user-personalization.test.mjs tests/project-visual-storytelling.test.mjs && node pso.mjs verify
- **npm run evidence:adoption**: node scripts/adoption-evidence.mjs
- **npm run inventory**: node pso.mjs inventory --root .
- **npm run release**: node scripts/build-release.mjs
- **npm run release:status**: node scripts/release-status.mjs
- **npm run release:verify**: node scripts/verify-release.mjs
- **npm run release:verify:candidate**: node scripts/verify-release.mjs --candidate
- **npm run security**: node scripts/security-check.mjs
- **npm run security:gitleaks**: node .github/skills/audit-code/scripts/gitleaks-scan.mjs scan
- **npm run security:gitleaks:install**: node .github/skills/audit-code/scripts/gitleaks-scan.mjs install
- **npm run test**: node --test tests/skill-contracts.test.mjs tests/agent-builder.test.mjs tests/audit-assurance.test.mjs tests/audit-execution.test.mjs tests/adoption-rerun.test.mjs tests/security-fuzz.test.mjs tests/production-gates.test.mjs tests/package-install.test.mjs tests/project-understanding.test.mjs tests/documentation-builder.test.mjs tests/project-status.test.mjs tests/project-video.test.mjs tests/user-personalization.test.mjs tests/project-visual-storytelling.test.mjs
- **npm run test:gitleaks**: node --test tests/gitleaks-scan.test.mjs
- **npm run verify**: node pso.mjs verify

### Safe Updates

- Update the Launch Pad with an explicitly approved `git fetch`, trusted-target and release-note
  inspection, normal protected Git integration, conditional `npm ci` only for changed dependency
  metadata, and `npm run check`. `pso` does not hide Git mutation or publication.
- Generated projects use `node .\pso.mjs update --project PATH` for a plan-only safe-all update.
  `--mode additive` installs absent selected content with dependency closure; `--mode select` accepts
  comma-separated `--skills`, exact `--assets`, interactive selectors, or `--selection-file`.
- Selection files bind the target and plan digest and carry `track`, `pin`, or `fork` policies plus
  exact `keep`, `replace`, `fork`, or eligible `remove` resolutions. Exact force is limited to an
  exact selected replacement and still requires `--accept-risk`; force-all does not exist.
- Apply requires both `--apply` and `--accept-risk`, transactionally backs up every target, rejects
  stale evidence, preserves unmanaged and retained project-owned content, and writes
  `reports/project-update-plan.json`, `reports/project-update-plan.md`, and
  `reports/update-verification.json`.
- Manifest 1.0 migrates forward to manifest 1.1 with lock 1.0 only after verification. Do not
  downgrade the retained pair in place. Recover interrupted work with
  `node .\pso.mjs recover --project PATH [--transaction ID]` before replanning.

## Capabilities

- **Governed skill workflows**: 47 installed skills provide bounded project actions.
- **Reusable prompt workflows**: 10 prompt files provide user-invoked workflows.
- **Machine-readable contracts**: Schemas validate governed plans, reports, and runtime evidence.
- **Automated validation**: Repository tests protect contracts and implementation behavior.

## Validation

- **npm run check**: node --check pso.mjs && npm run security && npm run release && npm run release:verify:candidate && node --test tests/skill-contracts.test.mjs tests/agent-builder.test.mjs tests/audit-assurance.test.mjs tests/audit-execution.test.mjs tests/adoption-rerun.test.mjs tests/security-fuzz.test.mjs tests/production-gates.test.mjs tests/package-install.test.mjs tests/project-understanding.test.mjs tests/documentation-builder.test.mjs tests/project-status.test.mjs tests/project-video.test.mjs tests/user-personalization.test.mjs tests/project-visual-storytelling.test.mjs && node pso.mjs verify
- **npm run release:verify**: node scripts/verify-release.mjs
- **npm run release:verify:candidate**: node scripts/verify-release.mjs --candidate
- **npm run security**: node scripts/security-check.mjs
- **npm run security:gitleaks**: node .github/skills/audit-code/scripts/gitleaks-scan.mjs scan
- **npm run security:gitleaks:install**: node .github/skills/audit-code/scripts/gitleaks-scan.mjs install
- **npm run test**: node --test tests/skill-contracts.test.mjs tests/agent-builder.test.mjs tests/audit-assurance.test.mjs tests/audit-execution.test.mjs tests/adoption-rerun.test.mjs tests/security-fuzz.test.mjs tests/production-gates.test.mjs tests/package-install.test.mjs tests/project-understanding.test.mjs tests/documentation-builder.test.mjs tests/project-status.test.mjs tests/project-video.test.mjs tests/user-personalization.test.mjs tests/project-visual-storytelling.test.mjs
- **npm run test:gitleaks**: node --test tests/gitleaks-scan.test.mjs
- **npm run verify**: node pso.mjs verify

## Limitations

- No explicit limitations were discovered by Project Understanding.

## Evidence

The companion report at `reports/project-guide.json` contains 51 claims bound to the Project Understanding digests used for this guide.
