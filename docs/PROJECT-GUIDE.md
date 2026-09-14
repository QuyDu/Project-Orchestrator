# Project Orchestrator Project Guide

Generated from a complete repository scan. This guide describes the project in which the generator runs.

## Purpose

Turn any repository into a governed GitHub Copilot workspace: agent instructions, scoped standards, reusable prompts, specialist agents, and 47 governed skills — installed consistently, verified after every run, and safe to rerun.

## Architecture

- **.github**: Top-level project boundary containing 84 scanned files.
- **.vscode**: Top-level project boundary containing 2 scanned files.
- **Demo**: Top-level project boundary containing 15 scanned files.
- **config**: Top-level project boundary containing 4 scanned files.
- **docs**: Top-level project boundary containing 5 scanned files.
- **release**: Top-level project boundary containing 1 scanned files.
- **reports**: Top-level project boundary containing 83 scanned files.
- **schemas**: Top-level project boundary containing 46 scanned files.
- **scripts**: Top-level project boundary containing 12 scanned files.
- **templates**: Top-level project boundary containing 34 scanned files.
- **tests**: Top-level project boundary containing 15 scanned files.

## Technology

- **.md**: 121 scanned files use this extension.
- **.json**: 97 scanned files use this extension.
- **.mjs**: 38 scanned files use this extension.
- **.mp3**: 22 scanned files use this extension.
- **.ps1**: 10 scanned files use this extension.
- **.svg**: 8 scanned files use this extension.
- **.yml**: 3 scanned files use this extension.
- **.toml**: 2 scanned files use this extension.
- **.yaml**: 2 scanned files use this extension.
- **.html**: 2 scanned files use this extension.
- **.jsonl**: 2 scanned files use this extension.
- **.pptx**: 1 scanned files use this extension.

## Setup And Usage

- **npm run check**: node --check pso.mjs && npm run security && npm run release && npm run release:verify:candidate && node --test tests/skill-contracts.test.mjs tests/agent-builder.test.mjs tests/audit-assurance.test.mjs tests/audit-execution.test.mjs tests/adoption-rerun.test.mjs tests/security-fuzz.test.mjs tests/production-gates.test.mjs tests/package-install.test.mjs tests/project-understanding.test.mjs tests/documentation-builder.test.mjs tests/project-status.test.mjs tests/project-video.test.mjs tests/user-personalization.test.mjs tests/personalized-content.test.mjs && node pso.mjs verify
- **npm run evidence:adoption**: node scripts/adoption-evidence.mjs
- **npm run inventory**: node pso.mjs inventory --root .
- **npm run release**: node scripts/build-release.mjs
- **npm run release:status**: node scripts/release-status.mjs
- **npm run release:verify**: node scripts/verify-release.mjs
- **npm run release:verify:candidate**: node scripts/verify-release.mjs --candidate
- **npm run security**: node scripts/security-check.mjs
- **npm run security:gitleaks**: node .github/skills/audit-code/scripts/gitleaks-scan.mjs scan
- **npm run security:gitleaks:install**: node .github/skills/audit-code/scripts/gitleaks-scan.mjs install
- **npm run test**: node --test tests/skill-contracts.test.mjs tests/agent-builder.test.mjs tests/audit-assurance.test.mjs tests/audit-execution.test.mjs tests/adoption-rerun.test.mjs tests/security-fuzz.test.mjs tests/production-gates.test.mjs tests/package-install.test.mjs tests/project-understanding.test.mjs tests/documentation-builder.test.mjs tests/project-status.test.mjs tests/project-video.test.mjs tests/user-personalization.test.mjs tests/personalized-content.test.mjs
- **npm run test:gitleaks**: node --test tests/gitleaks-scan.test.mjs
- **npm run verify**: node pso.mjs verify

## Capabilities

- **Governed skill workflows**: 47 installed skills provide bounded project actions.
- **Reusable prompt workflows**: 10 prompt files provide user-invoked workflows.
- **Machine-readable contracts**: Schemas validate governed plans, reports, and runtime evidence.
- **Automated validation**: Repository tests protect contracts and implementation behavior.

## Validation

- **npm run check**: node --check pso.mjs && npm run security && npm run release && npm run release:verify:candidate && node --test tests/skill-contracts.test.mjs tests/agent-builder.test.mjs tests/audit-assurance.test.mjs tests/audit-execution.test.mjs tests/adoption-rerun.test.mjs tests/security-fuzz.test.mjs tests/production-gates.test.mjs tests/package-install.test.mjs tests/project-understanding.test.mjs tests/documentation-builder.test.mjs tests/project-status.test.mjs tests/project-video.test.mjs tests/user-personalization.test.mjs tests/personalized-content.test.mjs && node pso.mjs verify
- **npm run release:verify**: node scripts/verify-release.mjs
- **npm run release:verify:candidate**: node scripts/verify-release.mjs --candidate
- **npm run security**: node scripts/security-check.mjs
- **npm run security:gitleaks**: node .github/skills/audit-code/scripts/gitleaks-scan.mjs scan
- **npm run security:gitleaks:install**: node .github/skills/audit-code/scripts/gitleaks-scan.mjs install
- **npm run test**: node --test tests/skill-contracts.test.mjs tests/agent-builder.test.mjs tests/audit-assurance.test.mjs tests/audit-execution.test.mjs tests/adoption-rerun.test.mjs tests/security-fuzz.test.mjs tests/production-gates.test.mjs tests/package-install.test.mjs tests/project-understanding.test.mjs tests/documentation-builder.test.mjs tests/project-status.test.mjs tests/project-video.test.mjs tests/user-personalization.test.mjs tests/personalized-content.test.mjs
- **npm run test:gitleaks**: node --test tests/gitleaks-scan.test.mjs
- **npm run verify**: node pso.mjs verify

## Limitations

- No explicit limitations were discovered by Project Understanding.

## Evidence

The companion report at `reports/project-guide.json` contains 49 claims bound to the Project Understanding digests used for this guide.
