---
applyTo: "**/*.ps1,**/*.psm1,**/*.psd1"
description: "PowerShell scripting, error handling, ShouldProcess, credential safety, and analyzer standards."
---

# PowerShell Instructions

Reviewed: 2026-10-28

## Authoring and Compatibility

- Prefer a supported PowerShell 7 release for new scripts. Preserve explicitly supported Windows PowerShell compatibility and test it separately; do not infer compatibility from successful parsing on a newer host.
- Use the project's strict-mode and terminating-error policy, normally `Set-StrictMode -Version Latest` and `$ErrorActionPreference = 'Stop'` in entry scripts. Do not unexpectedly change caller-wide preferences from reusable modules.
- Use approved verbs, `Verb-Noun` names, full cmdlet names, and named parameters. Prefer idiomatic cmdlets; optimize measured hot paths rather than replacing readable code speculatively.
- Use `[CmdletBinding()]`, typed/validated parameters, and comment-based help for reusable commands. Expose inputs as parameters instead of embedding interactive prompts in automation paths.
- Quote paths, use `Join-Path`, and use `-LiteralPath` for literal user-supplied paths. Emit objects on the success stream; leave presentation formatting to the caller.

## Safety and Errors

- For state-changing commands, implement `SupportsShouldProcess` and call `$PSCmdlet.ShouldProcess` immediately around each mutation. Merely declaring the attribute is insufficient. Verify `-WhatIf` propagation across module boundaries and test that previews make no changes.
- Respect explicit approvals and `-Confirm`. Do not use `-Force`, preference changes, or suppressed prompts to bypass a required decision.
- Catch failures at a useful boundary, preserve actionable sanitized errors, and release owned resources in `finally`. Native executable failures require checking `$LASTEXITCODE`; `$ErrorActionPreference` alone does not reliably cover them across supported hosts.
- Use secret stores and supported identity flows; use `[pscredential]` for credential parameters when appropriate. Never place secrets in source, command arguments, transcripts, or chat. Secure wrapper types are not a substitute for safe storage and transport.
- Never use `Invoke-Expression` on generated or untrusted text. Pass structured arguments to executables and avoid unattended elevation prompts.

## Verification

Run configured PSScriptAnalyzer and Pester checks when installed/approved, plus the project's supported-host tests. Test failure handling, native nonzero exit codes, cancellation/cleanup, and non-mutating `-WhatIf`. Report absent tools instead of installing them silently or claiming analyzer compliance.

## References

- [Microsoft PSScriptAnalyzer guidance](https://learn.microsoft.com/en-us/powershell/utility-modules/psscriptanalyzer/overview)
- [Microsoft ShouldProcess guidance](https://learn.microsoft.com/en-us/powershell/scripting/learn/deep-dives/everything-about-shouldprocess)
- [PowerShell authoring and performance tradeoffs](https://learn.microsoft.com/en-us/powershell/scripting/dev-cross-plat/performance/script-authoring-considerations)
