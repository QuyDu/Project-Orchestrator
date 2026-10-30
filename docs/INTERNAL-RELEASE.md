# Internal Release Process

Skills Orchestrator is licensed and configured for authorized internal use only. Public registry publication and third-party distribution are prohibited without new legal, security, and owner approval.

## Preconditions

- Work from a committed revision with a clean worktree.
- Use a maintained Node.js 22, 24, or 26 release without elevation.
- Run the pinned GitHub workflows for the exact release commit.
- Download `cross-platform-ci-evidence.json` from the successful security-validation workflow into `reports/`.
- Download the `codeql-sarif-COMMIT` artifact from the successful CodeQL workflow and preserve it with review evidence. Private repositories without GitHub Code Security retain SARIF as a workflow artifact instead of uploading it to code scanning.
- Provision an organization-controlled signing identity outside this repository.
- Appoint a qualified reviewer who did not author the release changes.

Compare the active toolchain with the declared package-manager pin before qualification. The [verified local toolchain snapshot](../README.md#verified-local-toolchain), observed October 30, 2026, records Node.js `26.13.0`, npm `11.20.0`, Git for Windows `2.56.0.windows.3`, PowerShell `7.6.9`, and VS Code `1.144.0`. The selected offline toolchain pins `npm@11.20.0`, matching the installed CLI; release packaging verifies that exact version before creating output. The npm `11.21.1` update remains deferred, not installed or production-qualified.

Use the dated [core-tool update report](../reports/environment-update.md) to review official-source availability, actual outcomes, and compatibility limits. Organizationally blocked package URLs must not be retried through alternate routes or bypassed by disabling TLS verification. Use an organization-approved source or pre-provisioned offline cache for future updates; do not silently change registry configuration.

## Build And Candidate Verification

```powershell
npm --offline --update-notifier=false run check
npm --offline --update-notifier=false run release
npm --offline --update-notifier=false run release:verify:candidate
```

The candidate is written under `dist/project-skills-orchestrator-VERSION/` and contains the standalone distribution, restricted package, payload checksums, final checksums, CycloneDX SBOM, SLSA-format provenance statement, and release contract. Candidate verification rejects stale source bytes, links, missing files, unexpected files, and checksum mismatches.

The security-validation workflow also disables npm registry access and update notifications. It verifies the declared npm version before the frozen dependency check and fails closed if a runner lacks that version; provision it through an approved offline cache before claiming matrix qualification. Release branches are covered by both security workflows. File-level test concurrency is bounded at two without changing individual test timeouts or assertions.

## Evidence Validation

Refresh the built-in source scan after source changes, then verify its saved evidence without rewriting it:

```powershell
node scripts/security-check.mjs
node scripts/security-check.mjs --verify-report
```

Read-only verification reruns the existing local checks and requires the saved report to match the current source digest, scanner identity/version, file and dependency counts, empty findings, and the producer's canonical UTC timestamp. Evidence must not be future-dated or older than 24 hours. The regular root coordination file `.pso-release.lock` is excluded from this source digest because its contents change with each operation; symbolic links remain rejected. This built-in check does not replace the pinned specialist secret-history scan or hosted security analysis.

CI recording must run on the operating system and Node major it claims to qualify. The aggregator requires exactly nine unique supported OS/Node records, all bound to the selected commit, with the declared fields and valid nonfuture completion times. Invalid inputs leave prior published evidence unchanged; valid output is replaced through a same-directory temporary file and rename. Schema and commit checks do not authenticate a CI artifact's origin: retrieve evidence from the approved workflow for the exact release commit.

Readiness also validates the operational report's candidate digest, exact owner/signal fields, seven unique signals, nonempty evidence, matching revocation owner, and fresh, ordered timestamps. Optional evidence and checksum reads are bounded and reject links before reads. Missing, malformed, oversized, stale, or inconsistent evidence produces a blocked result rather than reusing an old success report.

## Signing

Sign the exact bytes of `SHA256SUMS` with the approved organizational signing service. Store detached evidence as `release-signature.json` using `schemas/release-signature.schema.json`. Configure the independently distributed SHA-256 fingerprint of the trusted public key as `PSO_TRUSTED_SIGNING_KEY_SHA256` when verifying. Never place a private key, certificate password, token, or HSM credential in this repository, command history, logs, or release directory.

The signature evidence identifies the signer, algorithm, signing time, public verification key, signed artifact, and base64 signature. Key provisioning, custody, rotation, revocation, and authorization remain organization-owned controls.

For a signing diagnostic, the following verifies the checksummed artifact and its signature against the configured external trust anchor:

```powershell
node scripts/verify-release.mjs --signature-only
```

This diagnostic does not approve independent review or production distribution. Unknown or conflicting verifier modes are rejected. Default production verification still requires both the trusted signature and the signed independent review.

## Independent Review

The independent reviewer must inspect the exact candidate bound by the SHA-256 digest of `SHA256SUMS`, review security scan and the commit-bound CodeQL SARIF artifact, confirm the threat model, exercise recovery and package installation, and resolve all critical/high findings. Record and sign the decision in `independent-review.json` using `schemas/independent-review.schema.json`. Configure the independently distributed reviewer public-key fingerprint as `PSO_TRUSTED_REVIEW_KEY_SHA256` when verifying.

Authorship and review must be performed by different people. A generated or self-approved review does not satisfy this gate.

## Final Verification

```powershell
npm run release:verify
npm run release:status
```

Both commands must exit successfully. `release:status` writes `reports/release-readiness.json`. Distribution is prohibited unless its status is `production-ready` and every check is `passed` for the same committed revision and candidate digest.

## Resolving Blocked Results

- Use a clean checkout of the intended release commit; do not discard pending source changes to make the cleanliness check pass.
- Refresh a stale source scan through its producer. The read-only verifier never refreshes evidence itself.
- Rebuild a stale candidate and obtain current-commit CI artifacts from the approved workflow. Do not repair provenance by editing a commit field or timestamp.
- Obtain real organizational signing and an independent human review. File presence or a configured fingerprint alone does not pass attestation gates; readiness verifies their cryptographic evidence.
- Configure the approved internal destination and monitoring, then exercise the owner-approved revocation route and record its actual result. Local synthetic tests are not operational evidence.
- Rerun final verification only after the underlying conditions are satisfied. Local validation does not promote draft skills, qualify untested live integrations, or authorize distribution.

## Internal Distribution

Publish only to the approved restricted internal package registry or internal artifact store. Preserve checksums, SBOM, provenance, signature, review evidence, CI evidence, source revision, and readiness report for the organization's required retention period. Apply least-privilege access and prevent anonymous or public reads.

## Operational Ownership And Monitoring

- Assign concrete `@identity` values for the **Release owner**, **Security response owner**, and **Internal artifact repository owner** in `reports/release-operations.json`; role labels or placeholders do not pass readiness.
- The Release owner verifies the exact candidate, records distribution time and destination, and checks GitHub Security Validation and CodeQL before promotion.
- The Security response owner reviews secret-scanning, Dependabot, CodeQL, and private vulnerability reports before each release and at least weekly while a version remains supported.
- The Internal artifact repository owner monitors installation failures and access anomalies, confirms artifact availability, and owns immediate revocation.
- Record every required signal in `reports/release-operations.json` with current status, check time, and evidence bound to the candidate digest. Missing, stale, failed, or inaccessible evidence blocks promotion and triggers review of already distributed artifacts.
- Test revocation against the selected internal artifact destination and record the owner, time, and result. A declared but untested revocation route does not pass readiness.
- Any checksum, signature, provenance, independent-review, installation-health, or security-alert failure stops distribution immediately. Record the affected version and digest, preserve evidence, notify all three owner roles, and begin revocation.

## Revocation

For a suspected compromise or material defect, the Release owner stops distribution, the Internal artifact repository owner revokes the artifact and verifies it is no longer downloadable, and the Security response owner preserves evidence and coordinates containment. Rotate compromised signing credentials outside this repository. Record revocation status with the release digest and notify known consumers. Publish a replacement only after completing the full release process again.
