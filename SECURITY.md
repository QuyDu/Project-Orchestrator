# Security Policy

Project Orchestrator follows the [Microsoft Security Development Lifecycle](https://learn.microsoft.com/compliance/assurance/assurance-microsoft-security-development-lifecycle) and Microsoft's [SDL security practices](https://www.microsoft.com/securityengineering/sdl/practices) as its governing secure-engineering baseline.

Last reviewed: September 12, 2026.

Supported source-version metadata updated: October 7, 2026. This metadata update does not replace the policy review or formal release evidence.

## Supported Source Versions

| Version | Source date | Status |
| --- | --- | --- |
| `1.4.0` | October 7, 2026 | Current source version; formal release remains blocked |
| `1.3.x` and earlier | Before October 7, 2026 | Superseded; update before reporting a new issue |

No tool can guarantee that it will introduce no defects or vulnerabilities. This project fails closed where trust cannot be established and does not claim production security assurance until every release gate below has current evidence.

Use of this software remains subject to the independent-review and use-at-your-own-risk responsibilities in [DISCLAIMER.md](DISCLAIMER.md). That notice supplements but does not replace this policy or [LICENSE](LICENSE).

Distribution is restricted to authorized internal use under [LICENSE](LICENSE). Public registry publication or third-party distribution is prohibited. Follow [docs/INTERNAL-RELEASE.md](docs/INTERNAL-RELEASE.md) for governed internal releases.

## Supported Runtime

- Run only a maintained Node.js 22, 24, or 26 release from an official distribution channel.
- Do not bypass the runtime version check. Remove a major when it reaches end of life and validate new supported majors before adding them.
- This registry-free edition has no third-party runtime packages. The exact npm toolchain, lockfile, and repository install policy are committed even while the dependency graph is empty.
- Lifecycle scripts are disabled by default. Any exception requires review of the package source and scripts, explicit approval, and a narrowly scoped install command.
- `project-video` is such an exception only when the user approves its isolated pinned `ffmpeg-static` installation. The helper writes a package lock and renderer manifest, verifies npm integrity metadata and the binary SHA-256 digest, and never adds the renderer to the application dependency graph.
- The optional local project-video voice is another isolated exception. It requires separate network, GPL-3.0-or-later, and public-domain model-provenance approvals; pins Piper, its complete runtime dependency graph including protobuf `6.33.5`, and the LJSpeech model; verifies the official Piper wheel, requirements digest, exact installed package set, all resolved wheel hashes, platform and architecture, and model files; and does not install Python or packages globally.
- Any future dependency requires a lockfile update, license review, vulnerability review, provenance review, and component-governance evidence. Dependabot monitors npm lockfile and GitHub Actions changes.

## Required Operating Practice

1. Obtain the orchestrator from a trusted release and verify its published checksum and provenance. Until signed releases and provenance are published, treat source snapshots as development builds.
2. Run `npm run check` in the orchestrator repository before use. Do not adopt from a failed or modified distribution.
3. Run adoption as the repository owner without elevation. Never use Administrator, `sudo`, or a privileged service account.
4. Run dry-run first and review every proposed path, conflict, profile, platform, and approval requirement. Apply requires the explicit `--apply` flag or interactive confirmation.
5. Preserve a separate repository backup and use version control. The transaction journal is recovery evidence, not a replacement for organizational backup policy.
6. Do not remove an adoption lock manually. Use `recover` only after verifying the recorded process is no longer active.
7. Review installed skills as executable instructions. Keep destructive, external, privileged, irreversible, deployment, commit, and push actions approval-gated.

Project video generation adds opt-in trust boundaries. Every run checks Azure discovery first. When discovery is unavailable, the user may decline discovery and select a zero-install browser preview; generated HTML uses escaped plan data, prefers a local English voice when available, and records that browser or operating-system processing may use an online service. It is never labeled rendered audio or MP4 media. Before Azure narration, read-only discovery records only Speech-capable account count, kinds, and regions; it never retrieves keys or persists account names or resource identifiers. Voice auditions and neural narration send only approved text to the discovered Azure Speech regional endpoint; credentials remain process environment values and are never written to reports. The offline MP4 fallback downloads a GPL Piper wheel, pinned Python dependencies, and a public-domain LJSpeech model once, then synthesizes locally in an isolated environment. Rendering executes an approved local FFmpeg binary without shell command construction and writes only to skill-owned paths.

Inspection and planning must not execute commands discovered in the target repository. Managed paths must remain inside the canonical repository root; symbolic links, traversal, reserved device names, stale destination hashes, and concurrent adoption are rejected.

`clone-setup` accepts only credential-free GitHub HTTPS and SSH locations. It requires a previously absent destination, clones into a unique sibling staging directory, applies the same journaled adoption and verification controls there, and publishes the final folder only after verification passes. It does not initialize submodules or execute repository-provided setup commands. Private-repository credentials must be entered through Git Credential Manager or SSH directly, never embedded in the URL or passed through agent-visible input.

Framework adoption may manage skill packages, schemas, orchestrator configuration and manifests, generated reports, `.github/copilot-instructions.md`, root `AGENTS.md`, `.vscode/extensions.json`, and `.vscode/settings.json`. Existing Copilot and agent instruction text is preserved and orchestration guidance is appended only when absent. Existing `config/skills-orchestrator.json` and VS Code support files are preserved byte-for-byte; defaults are created only when those files do not exist. Recovery accepts only these exact support paths and rejects other root or `.vscode` targets.

Clarification is read-only and must not request secrets through agent-visible input. A configured question limit is only a per-round ceiling and never permits bypassing unresolved security, compatibility, cost, or other material ambiguity. When `blockOnMaterialAmbiguity` is enabled, planning and mutation remain blocked until the material decision is resolved.

## Installation Risk Acceptance

Before any project creation or adoption writes begin, the person running Skills Orchestrator must explicitly acknowledge the versioned security and risk notice. Interactive use requires the exact phrase `I ACCEPT`; non-interactive use requires `--accept-risk`. The accepted notice version, timestamp, and acceptance method are recorded in the project manifest and adoption transaction journal.

Acceptance confirms understanding that the product is intended to reduce and avoid defects and security issues, but cannot guarantee detection or prevention of every bug, vulnerability, incompatibility, configuration error, data-loss scenario, or unintended result. The user accepts responsibility for maintaining backups, reviewing planned and actual changes, testing in a non-production environment, obtaining required approvals, and determining whether resulting changes are suitable for production.

Risk acceptance does not bypass any security control, validation failure, approval gate, lock, rollback requirement, or release gate.

## Release Gates

Public or production release is blocked until all applicable evidence is current:

- Security requirements and [threat model](docs/THREAT-MODEL.md) reviewed for the release.
- `npm run check` passes on supported Windows, Linux, and macOS runners.
- Static analysis, credential/secret scanning, configuration validation, and dependency/component governance pass.
- Path, parser, configuration, journal, and recovery inputs have negative and fuzz-test coverage.
- Release artifacts have checksums, signatures, provenance attestations, and an SBOM; CI actions are pinned to reviewed commit digests.
- Forced-termination recovery, read-only paths, symbolic links, dirty worktrees, non-Git targets, and byte preservation outside managed regions pass fixtures.
- An engineer who did not author the change completes an independent security review and records approval.
- Critical and high findings are fixed. Any accepted lower risk has an owner, expiry, and documented approval.

## Vulnerability Reporting

Do not disclose a suspected vulnerability in a public issue. Use the repository host's private security-advisory channel and include the affected version, reproduction steps, impact, and suggested containment. Maintainers must preserve evidence, assess severity, publish remediation guidance, and revoke compromised artifacts when required.

## Security Response

For a suspected compromise, stop adoption, preserve journals and package hashes, isolate the affected artifact, rotate any exposed credentials outside this tool, and validate restoration from a known-good version. A security fix requires regression coverage and the same release gates as other changes.