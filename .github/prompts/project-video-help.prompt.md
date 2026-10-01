---
mode: agent
description: Help for the project-video skill.
---

# project-video Help

Analyze a new or existing project with meaningful verified content and produce an evidence-grounded browser preview or narrated MP4 entirely from VS Code using optional Azure OpenAI, Speech, Speech Avatar, local Piper, and FFmpeg stages. Do not use for empty baselines, generic documentation, live recording, or publication.

Explain this contract as help only. Do not execute its procedures or treat examples as action approval.
Read the complete contract at .github/skills/project-video/SKILL.md before using this skill.

## Purpose

Create a factual, project-specific animated walkthrough from the current repository, but only when the user explicitly invokes `/project-video`. On invocation, rescan the project after its implementation work is complete and document the actual project state. Select the smallest valid production path: preferably a polished Azure-narrated MP4 plus a self-contained narrated HTML preview, or an explicitly selected browser-only preview. The entire production workflow remains executable from VS Code.

## Preconditions

- Run `project-understanding` as a complete rebuild and read `reports/project-understanding.json` plus its bound Markdown view before drafting narration.
- Require enough verified project content to explain purpose, architecture or stack, setup, primary workflows, and safety or operational constraints.
- Run from the target project root using the packaged helper at `.github/skills/project-video/scripts/project-video.mjs`.
- For selected `azure-neural` work, use the `azure-discovery` owner's cache API and canonical schema. Reuse the matching JSON/Markdown pair for 30 days inclusive only when it is bound to the complete saved `.azure/environment.json` profile. Future-dated, legacy/unbound, malformed, expired, or context-mismatched evidence requires an owner refresh, never consumer-side rebinding. Require a successful existing Speech-resource query. When the project uses Azure AI Foundry, reuse its project-scoped `AIServices` Speech capability instead of requiring or provisioning a duplicate standalone `SpeechServices` resource.
- Missing or invalid Azure profiles require explicit initialization through `azure-discovery`; do not infer or silently change the cloud, subscription, or region. Diagnostics, plan/audio verification, rendering, and browser/local modes never refresh discovery or contact Azure.
- Resolve `AzureSpeechKey` from the project Key Vault through the authenticated Azure CLI identity. Copy it only into the synthesis process environment when required; never request, print, or persist it in project artifacts.
- Treat browser-default speech and visuals as a zero-install interactive HTML preview only; they never constitute rendered audio or a narrated MP4. When approved Azure scene audio already exists, the interactive HTML preview may embed and play that audio directly from disk.
- Start every invocation with `discovery-status`, then inspect the repository. A newly provisioned but still empty baseline is blocked and must never be narrated as a completed application.
- Before selecting `azure-openai`, verify an existing compatible deployment and record its actual deployment and model identifiers. Never assume a deployment is named `GPT-5`.
- Before selecting `azure-speech-avatar`, verify that the configured Speech resource and region support avatar generation.

## Inputs

- A newly rebuilt, complete `reports/project-understanding.json` and `reports/project-understanding.md`, including their repository and content digests.
- A current `docs/PROJECT-GUIDE.md` and `reports/project-guide.json` produced by `documentation-builder`; these are the shared narrative source for management, users, and presentation output.
- Verified repository evidence such as `README.md`, `docs/PROJECT-BLUEPRINT.json`, manifests, source boundaries, configuration, tests, and current project reports.
- Fresh Azure discovery evidence containing the selected cloud and nonsecret existing Speech resource kinds and regions when `azure-neural` is selected.
- An explicitly selected Azure production stage or `azure-preflight` readiness request when discovery needs refreshing. Reuse or refresh automatically through the owner for that selected Azure work; offer `browser-preview` as an explicit alternative, never a silent fallback on failure.
- Audience, target duration, aspect ratio, visual direction, narration provider and voice profile, and output name confirmed through clarification.
- The persisted `.azure/environment.json` cloud and subscription profile, plus project Key Vault access, when approved neural narration is generated.
- An approved Python 3.10 through 3.13 runtime when the pinned local Piper fallback is selected.
- A supported local Piper host: Windows x64, Linux x64 or arm64, or macOS x64 or arm64.
- An existing FFmpeg executable or approval to install the pinned isolated renderer dependency.
- The npm CLI bundled with the approved Node.js runtime, or its absolute `NPM_CLI_JS` path, when renderer installation is approved.
- For schema `1.1.0` or later plans, an evidence-grounded claims ledger, approved script, explicit production-path providers, discovered capability records, preflight results, approvals, selected voice and avatar profiles, and asset/output paths.

## Approved Tools and Resources

- Use read-only repository inspection to derive project facts and reject unsupported claims.
- Use the packaged Node.js helper to validate plans, generate Azure neural or local Piper narration, install isolated dependencies, render MP4 output, and verify media integrity. Use `browser-preview --with-audio` when approved Azure narration should also be included in the self-contained HTML preview.
- Use `discovery-status` at the start of every invocation; it inspects local evidence only and reports when a refresh is required. Use `browser-preview` to generate project-specific HTML with browser speech and completion-driven visual scenes only when that path is selected.
- Use `azure-preflight` as an explicit Azure readiness request: it may refresh missing or unusable discovery once through the target project's packaged PowerShell discovery owner before checking cloud, region, and existing resource readiness. Keep readiness JSON on stdout and owner refresh logs plus setup guidance on stderr. It does not fetch Speech credentials or authorize synthesis. Approved Azure auditions and narration use the same owner refresh after checking current-invocation approval. Azure provides narration only; final video rendering remains local FFmpeg work.
- Use `production-preflight` to verify that every selected Azure stage has an exact `ready` capability record. Azure OpenAI requires actual deployment and model identifiers; Speech and Avatar require their configured region and resource identifier.
- Use the current agent for evidence-grounded scripts by default. Select `azure-openai` only for an explicitly requested executive-demo path or after the user chooses it following successful preflight and separately approves Azure processing and cost.
- Contact only the configured Azure Speech regional endpoint after the user approves the narration text, external processing, and expected cost.
- Download only the complete pinned Piper runtime set after the separate download, GPL, and model-provenance approvals: Piper `1.7.0`, ONNX Runtime `1.23.2`, pathvalidate `3.3.1`, coloredlogs `15.0.1`, humanfriendly `10.0`, flatbuffers `25.9.23`, NumPy `2.2.6`, packaging `25.0`, protobuf `6.33.5`, SymPy `1.14.0`, mpmath `1.3.0`, Windows-only pyreadline3 `3.5.4`, and the `en_US-ljspeech-high` model.
- Install only the renderer version pinned by the packaged helper, only after explicit approval, and only under `.skills-orchestrator/tools/project-video/`.

## Read and Write Boundaries

- Read project source, manifests, configuration, documentation, tests, and reports needed to establish verifiable facts.
- Write planning and evidence only under `reports/project-video/`.
- Write final media only under `dist/project-video/`.
- Write disposable renderer and local voice dependencies only under `.skills-orchestrator/tools/project-video/` after approval and temporary render data only under `.skills-orchestrator/cache/project-video/`.
- Delegate discovery publication to `azure-discovery`; only that owner writes the canonical discovery pair and manages its profile binding. Never rewrite discovery from this consumer or extend an existing audio manifest's discovery binding.
- Do not modify application source, project manifests, lockfiles, CI workflows, infrastructure, instruction files, or existing media outside these owned paths.

## Procedure

1. Dispatch `project-understanding` to perform a complete repository rescan and atomically rebuild its JSON and Markdown outputs. Stop when it is blocked or invalid.
2. Dispatch `documentation-builder` to refresh the canonical project guide from that scan. Stop when the guide is missing, stale, or blocked.
3. Read the current project guide and classify every proposed statement as verified, inferred, planned, mock, unverified-runtime, or unsupported. Omit unsupported claims and label every non-verified statement.
4. Run `node .github/skills/project-video/scripts/project-video.mjs discovery-status`. This check is local and read-only.
5. When status is `missing` or `unusable`, keep diagnostics read-only. For an explicitly selected Azure stage, reuse or refresh through the discovery owner without a repeated discovery question; `azure-preflight` explicitly requests that readiness check and may refresh on demand. Audition and narration must have current-invocation `--approve-external` before any refresh or credential retrieval. Stop with initialization instructions when the saved profile is missing or invalid. Offer `browser-preview` as an explicit alternative without Azure, Piper, FFmpeg, or package installation; never switch to it silently after an Azure error.
6. Stop as `blocked` when a newly provisioned project still contains only the empty governed baseline; explain which blueprint or implementation evidence is missing.
7. Confirm audience, duration, aspect ratio, visual direction, output name, and whether existing owned output may be replaced.
8. Run `plan-from-understanding` to create the evidence-bound presentation baseline. It produces eight project-specific pages covering purpose, architecture, technology, features, use, customizations, workflows, and validation or limits.
9. Prefer Azure Speech when a compatible resource exists in the configured region and the user approves processing and cost. If unavailable there, present discovered compatible regions in the same cloud and require explicit cross-region approval. For a no-cost portable demo, prefer the approved local Piper path when its one-time local installation is present; otherwise offer the same pages and dialogue in an explicitly selected `browser-preview` and explain that it is not a portable MP4.
10. Recommend and record the smallest valid production path: `zero-install-preview` uses agent-grounded script, browser speech/visuals, and interactive HTML; `narrated-mp4` uses agent-grounded or explicitly selected Azure OpenAI script, approved Azure Speech or local Piper narration, and local FFmpeg; `executive-demo` uses approved Azure OpenAI, Azure Speech, optional short Speech Avatar presenter segments, and local FFmpeg assembly. Availability is never authorization to activate a stage.
11. Build `reports/project-video/claims-ledger.json` before drafting narration. Trace every feature, workflow, architecture statement, and outcome to verified evidence; Azure OpenAI may improve verified prose but must not invent capabilities, readiness, outcomes, metrics, security claims, or benchmarks. Save the reviewable script under `reports/project-video/` and obtain script approval before narration or avatar work.
12. Create schema `1.2.0` `reports/project-video/project-video-plan.json` plus its Markdown view. Bind both understanding artifacts and their digests, and record providers, capabilities, approvals, profiles, assets, validation, and final-output paths. Legacy `1.0.0` and `1.1.0` plans remain compatible.
13. Validate the plan and run `production-preflight`; resolve every defect before any selected Azure stage. These local checks do not refresh discovery.
14. For `browser-preview`, state that voice processing is browser/OS controlled and may use an online service. Run `browser-preview`; report interactive HTML only. Scene advancement waits for `onend`; never claim MP3, WAV, or MP4.
15. For `azure-neural`, run `azure-preflight`. Use only a discovered project-scoped Speech capability in the configured or explicitly approved same-cloud region. Treat a Foundry `AIServices` resource as the Speech provider when that is the established project architecture. Azure supplies narration; local FFmpeg renders MP4. Present the shared audition, require explicit A/B/C selection, and recommend Ava Dragon HD with restrained, friendly styling when available, but never manipulate pitch or select silently. Require audition approval and record the selected voice profile.
16. For `local-piper`, disclose runtime, download, license, provenance, and install path; obtain all separate approvals before installation or synthesis. This is the standard no-cost, offline narration option for a portable MP4; its voice is less natural than Azure Speech but has no Azure usage charge.
17. For `azure-speech-avatar`, prefer short intro, chapter-break, or closing presenter segments unless full-time presentation is explicitly requested. Confirm capability, character, voice, language, layout, background, and segments; then obtain separate synthetic-presenter and billable-generation approvals. Record generated assets as presenter clips, never final video.
18. For MP4 narration, present the full approved script and settings, obtain synthesis approval, and bind per-scene audio and digests to the narration manifest. A refreshed discovery digest invalidates existing audio binding; require replacement approval and regenerate rather than relabeling old audio. Detect FFmpeg and obtain separate install and render approvals as needed before producing and verifying a local MP4.
19. Assemble all approved visual, narration, caption, branding, and optional Avatar assets with local FFmpeg. For selected Avatar scenes, map one generated presenter asset to each segment and composite it as the approved picture-in-picture or full-frame layout while using the approved narration track. Independently verify the resulting portable MP4 under `dist/project-video/`, distinguish it from presenter clips, and preserve all evidence without publishing or uploading.

## Validation

- Every narration claim cites at least one repository-relative evidence path in the plan.
- Parse the plan and calculate its SHA-256 from the same read of the original bytes. A later file edit must never be hashed as though its content was consumed by the current operation.
- Narration is written for listening with natural transitions, no spoken bullet lists, and no sentence longer than 36 words.
- New plans use schema `1.2.0`, validate against `schemas/project-video-plan.schema.json`, bind the current Project Understanding JSON and Markdown digests, contain six to ten scenes, and explicitly distinguish every production provider, delivery kind, capability, approval, selected profile, and owned path. Existing `1.0.0` and `1.1.0` plans remain valid for backward compatibility.
- `production-preflight` fails closed unless selected Azure capabilities are exact and ready. Azure OpenAI records deployment/model IDs; Speech and Avatar record resource/region evidence.
- Browser preview evidence validates against `schemas/project-video-browser-preview-manifest.schema.json`, identifies `browser-preview`, records either browser-only speech or explicitly embedded Azure scene audio, never claims portable media, and binds every scene narration digest to the plan.
- The final manifest validates against `schemas/project-video-manifest.schema.json` and identifies the actual renderer source and binary digest.
- Verify the pinned FFmpeg package/version, binary SHA-256, and stable regular-file identity before any executable invocation, including the version probe. An explicit `--ffmpeg` or `FFMPEG_PATH` selection fails closed when unavailable or invalid; never silently substitute another renderer.
- Browser preview publication stages its HTML and manifest together. A failed replacement restores each prior artifact independently; incomplete rollback retains surviving backups and reports recovery required. Backup-cleanup failure after commitment preserves the new pair and reports that publication succeeded but cleanup is incomplete.
- MP4 publication stages the video, source directory, and manifest as one generation. A publication lock serializes replacement; a flushed preparation journal records all target, candidate, and backup paths. The committed record is written only after every installed artifact matches the staged hashes. Precommit failure restores prior existence and bytes; incomplete rollback retains the journal, original backups, and replacement candidates. Postcommit cleanup failure preserves the new coherent generation and reports incomplete cleanup.
- Azure output records the auditioned, explicitly selected profile and delivery settings. Local installation evidence validates against `schemas/project-video-local-voice-manifest.schema.json` and records the verified Piper engine, complete dependency lock, model provenance, platform, architecture, and approvals.
- Azure discovery validates through the owner's canonical `schemas/azure-discovery.schema.json`, including full producer `imageGeneration` fields, matching Markdown, context binding, and its inclusive 30-day lifetime. Newly generated Azure audition, narration, and final-video evidence records its timestamp and SHA-256 digest.
- `discovery-status`, local plan/audio verification, browser/local modes, and rendering never refresh discovery or retrieve Azure credentials. Selected Azure work refreshes at most once through the target project's packaged owner; auditions and narration check current-invocation approval first. Missing/invalid profiles and refresh failures fail closed without synthesis or provider changes.
- Audition evidence validates against `schemas/project-video-voice-samples.schema.json`, selection against `schemas/project-video-voice-selection.schema.json`, and synthesized audio evidence against `schemas/project-video-narration-manifest.schema.json`.
- Current A/B/C profiles are `ava-hd-warm`, `aria-hd-warm`, and `jenny-professional`; all emitted audition, selection, narration, and final-video records must satisfy their actual schemas. Historical `aria-professional` records remain schema-readable with their original voice identity, never renamed to Jenny. New selection or synthesis from legacy profile evidence requires re-audition and explicit reselection before any provider work or output change.
- Read Speech responses incrementally and bound actual audio bytes to 1,024 through 20,971,520 inclusive, independently of `Content-Length`. Reject overflow before copying or allocating for the excess chunk; do not buffer the complete response first or retain an object per tiny chunk. Cancel failed responses and release every acquired reader, surfacing cancellation or release errors without claiming successful synthesis.
- Provider-matching audio exists for every MP4 scene. Browser speech is never represented as rendered audio, and local Piper output is labeled `local-piper` rather than neural Azure output.
- The MP4 decodes without errors, includes both video and audio, matches the requested dimensions, and has a recorded SHA-256 digest.
- Creation and adoption verification confirm that the canonical skill package, helper, and schemas are installed in the target repository without a duplicate prompt command.
- Executive-demo plans select `ffmpeg` assembly and `portable-mp4` delivery; validation rejects external editor providers and handoff-only outputs.

## Outputs

- `reports/project-video/project-evidence.json`
- `reports/project-video/project-video-plan.json`
- `reports/project-video/project-video-plan.md`
- `reports/project-video/claims-ledger.json`
- `reports/project-video/script.md`
- `reports/project-video/project-video-manifest.json`
- `reports/project-video/browser-preview-manifest.json` when browser preview is explicitly selected
- `reports/project-video/voice-samples/voice-samples.json`
- `reports/project-video/voice-samples/index.html`
- `reports/project-video/voice-samples/`
- `reports/project-video/voice-selection.json`
- `reports/project-video/audio/narration-manifest.json`
- `reports/project-video/audio/`
- `reports/project-video/source/`
- `.skills-orchestrator/tools/project-video/local-voice/local-voice-manifest.json` when local narration is approved and installed
- `dist/project-video/`

## Failure Behavior

- Missing or unusable discovery is reported without Azure access by diagnostics. Explicitly selected Azure work reuses or refreshes through the owner; missing/invalid profiles require initialization, and a failed refresh blocks that work while preserving prior evidence. A browser preview remains an explicit alternative, not an automatic error fallback.
- Return `blocked` when project evidence, clarification, selected provider evidence, or required MP4 approvals are missing.
- Delete only invocation-owned incomplete `.partial` media and preserve the last valid plan and diagnostics. Retain browser-preview transaction backups when rollback is incomplete; do not roll back committed output merely because backup cleanup failed.
- Never change narration providers silently, fabricate project facts, install tools without approval, label browser speech as final audio, or claim success from an unverified MP4.
- Never label the browser preview as a rendered video, portable media file, or narrated MP4.
- Never label Avatar presenter clips as final video.
- Preserve existing owned output unless replacement was explicitly approved.
- A retained `.skills-orchestrator/cache/project-video/publication.lock` blocks another render before executable use. Inspect its referenced `publication.json` and optional `publication-committed.json` before separately approved manual recovery: restore the prior generation when uncommitted, or verify the committed generation before removing remaining backups and the lock. Never discard recovery artifacts or force a rerender to conceal an incomplete transaction.

## Approval Gates

- Require current-invocation `--approve-external` after explicit approval of narration text, Azure processing, and cost before audition/narration discovery refresh, credential retrieval, or synthesis. Require explicit approval for a non-default Azure region. An explicit `azure-preflight` may refresh discovery for readiness only and grants no synthesis authority.
- Require separate approval before contacting Azure OpenAI and before sending verified claims/script content to it.
- Require separate approvals before Azure Speech Avatar generation and its billable synthetic-presenter step.
- Require explicit approval before generating audition samples and separate explicit selection before generating full narration.
- Require separate explicit approvals for local network downloads, Piper's GPL-3.0-or-later license, and the LJSpeech model provenance, plus narration approval before local synthesis.
- Require explicit approval before downloading or installing the pinned renderer and its lifecycle scripts.
- Require explicit approval before replacing existing project-video output.
- Browser playback is user-initiated. Before reporting the preview, disclose that its default voice may be processed by the browser, operating system, or a managed online service.
- Require explicit approval before executing FFmpeg and writing final render output.
- Publication, upload, deployment, commit, and push remain separate approval-gated actions and are never performed by this skill.

## Composition and Dependencies

- clarify-the-ask
- project-understanding
- documentation-builder
- azure-discovery

## Examples

- Analyze a newly built API project after its blueprint and implementation exist, then create a two-minute onboarding MP4 explaining setup, architecture, and validation.
- Show a prebuilt project video, create and implement a demo webapp, then invoke `/project-video`; it refreshes Azure discovery when needed, verifies an existing Speech resource, and uses local FFmpeg for the new app's MP4.
- Analyze an adopted application from its existing README, manifests, source, tests, and operations docs, then create a factual project-specific MP4 without changing application files.
- Run `/project-video`, explicitly select the browser-only alternative, and receive a project-specific interactive HTML walkthrough using the browser's default English voice and completion-driven visual scenes without contacting Azure.
- Prepare an executive-demo plan that records an actual compatible Azure OpenAI deployment/model, approved Azure narration, optional short Avatar segments, and deterministic local FFmpeg assembly into a verified portable MP4.

## Related commands

- Run the skill with /project-video.
- Open this help with /project-video-help.
- Inspect the full contract with @.github/skills/project-video/SKILL.md.
