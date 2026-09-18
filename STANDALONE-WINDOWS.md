# Registry-Free Windows Setup

The core setup requires a maintained Node.js 22, 24, or 26 release but does not use npm or a package registry. The optional project-video renderer and local voice are isolated, approval-gated dependency exceptions.

## Guided setup

Run:

```powershell
node .\pso.mjs
```

The wizard asks whether the project is new, existing locally, or hosted remotely on GitHub.

- New: asks for project name, parent destination, and conformance profile.
- Existing: asks for the repository location and profile, shows a dry-run adoption plan, and asks for confirmation before adding missing files.
- Remote: asks for a GitHub HTTPS or SSH location, optional local destination, and profile, then clones, provisions, and verifies the project before publishing the local folder.

## Verify

```powershell
node .\pso.mjs verify
```

Expected result:

```text
Verified registry-free distribution: 47 skills
```

## Create a project

```powershell
node .\pso.mjs create-project `
  --name "PSO Test Project" `
  --destination "C:\repos" `
  --profile durable `
  --color "#004578" `
  --accept-risk
```

Or use the PowerShell launcher:

```powershell
.\pso.ps1 create-project `
  --name "PSO Test Project" `
  --destination "C:\repos" `
  --profile durable `
  --color "#004578" `
  --accept-risk
```

If PowerShell script execution is restricted, use the `node .\pso.mjs` form.

The new project is created under `C:\repos\pso-test-project`. Open its `.code-workspace` file in Visual Studio Code. The optional `--color` value must use `#RRGGBB`; when omitted it defaults to `#004578`. The title and status colors are written to both `.vscode/settings.json` and the generated workspace file used by **Preferences: Open Workspace Settings (JSON)**.

## Clone and provision a GitHub project

```powershell
node .\pso.mjs clone-setup `
  --repository "https://github.com/owner/project.git" `
  --destination "C:\repos\project" `
  --profile durable `
  --accept-risk
```

Omit `--destination` to use the repository name under the current directory. The destination must not exist. Use Git Credential Manager or SSH for private repositories; do not place credentials in the URL. Repository-provided setup commands are not executed automatically. Run `development-environment-readiness` from the provisioned project before restoring dependencies or beginning implementation.

## Adopt into an existing project

Interactive:

```powershell
node .\pso.mjs
```

Non-interactive dry run:

```powershell
node .\pso.mjs adopt --project "C:\repos\ExistingProject" --profile core --dry-run
```

Apply only after reviewing the dry run:

```powershell
node .\pso.mjs adopt --project "C:\repos\ExistingProject" --profile core --apply --accept-risk
```

Before changing project files, Skills Orchestrator displays its security and risk acknowledgment. Interactive setup requires the exact phrase `I ACCEPT`; automated installation requires `--accept-risk`. Proceeding acknowledges that secure engineering reduces but cannot eliminate all defects, vulnerabilities, compatibility problems, or unintended outcomes. The user remains responsible for backups, review, validation, and non-production testing before any production use.

The command is safe to rerun. Dry run identifies new or changed complete skill packages, schemas, profiles, wiring files, and legacy or duplicate skill directories. Apply mode journals every changed framework asset under `.skills-orchestrator/transactions/`, synchronizes the current distribution, preserves unrelated project skills and custom Copilot instruction text, and verifies inventory, dependencies, ownership, versions, configuration paths, profile selection, and orchestration routing. Invalid manifests or failed post-apply verification trigger automatic rollback with persistent recovery evidence.

## Update the Launch Pad and standalone projects

Update this Launch Pad checkout with normal Git operations. After explicit approval for the network
action, run `git fetch origin`, inspect the trusted target with `git log`, `git diff`, and
`git show origin/main:release/release-manifest.json`, then integrate through the protected branch or
pull-request workflow. `pso update` never fetches, merges, resets, rebases, commits, pushes, or
publishes the Launch Pad. Run `npm ci` only when the inspected diff changes `package.json` or
`package-lock.json`, then run `npm run check`.

Update each generated or adopted project separately. Planning is the default; mutation requires both
`--apply` and `--accept-risk`:

```powershell
# Safe-all plan; this is not force-all.
node .\pso.mjs update --project "C:\repos\ExistingProject" --mode all --dry-run

# Add only absent selected content, including required skill dependencies.
node .\pso.mjs update --project "C:\repos\ExistingProject" --mode additive --skills "workflow-planner"

# Select exact skills/assets, or use a digest-bound selection file for policy and conflict decisions.
node .\pso.mjs update --project "C:\repos\ExistingProject" --mode select --skills "workflow-planner" --json
node .\pso.mjs update --project "C:\repos\ExistingProject" --mode select --selection-file ".\update-selection.json" --apply --accept-risk
```

`all`, `additive`, and `select` preserve unmanaged project files. Managed conflicts require an exact
`keep`, `replace`, `fork`, or eligible upstream-removed `remove` decision; persistent policies are
`track`, `pin`, and `fork`. Exact force is never global: the selection file must name one exact
selected asset in both `exactForcePaths` and a `replace` resolution, and risk acceptance remains
required. Stale plan, target, lock, selection, and destination checks fail before writes.

Apply backs up every mutation target under `.skills-orchestrator\transactions\`, verifies the result,
and writes `reports\update-verification.json`. The first verified legacy update migrates manifest 1.0
to manifest 1.1 with lock 1.0; do not downgrade that pair in place. Restore the complete matching
pre-migration backup before using an older runtime. If interrupted, recover before replanning:

```powershell
node .\pso.mjs recover --project "C:\repos\ExistingProject" --transaction TRANSACTION_ID
```

See [README.md](README.md#update-a-generated-or-adopted-project) for the selection-file shape,
report fields, project-owned preservation rules, and conflict troubleshooting.

## Project video without Azure Speech

Every created or adopted project includes the self-contained `project-video` helper. It checks `reports/azure-discovery.json` first and asks whether to run discovery when the report is missing or unusable. Declining generates a project-specific interactive HTML walkthrough using the default English browser voice and browser visuals:

```powershell
node .\.github\skills\project-video\scripts\project-video.mjs discovery-status
node .\.github\skills\project-video\scripts\project-video.mjs browser-preview
```

The HTML preview is not a narrated MP4 and its voice may be processed by Windows or the browser's managed service. To create a final offline MP4 on Windows x64, explicitly select and install the pinned Piper fallback into the project's isolated tools directory. Python 3.10 through 3.13 must already be installed; this command does not install or alter Python globally. Windows ARM64 is not supported by the pinned Piper release used here.

```powershell
node .\.github\skills\project-video\scripts\project-video.mjs install-local-voice `
  --accept-download `
  --accept-gpl `
  --accept-model-provenance

node .\.github\skills\project-video\scripts\project-video.mjs narrate --approve-local
```

Review the network transfer, Piper GPL-3.0-or-later license, public-domain LJSpeech provenance, and isolated storage before supplying those flags. Use `--python "C:\Path\To\python.exe"` when the approved runtime is not on `PATH`. The generated narration and final manifest are labeled `local-piper`; Azure neural narration remains available later through an explicit plan-provider change and voice audition.

For an interrupted transaction after confirming its recorded process is no longer active:

```powershell
node .\pso.mjs recover --project "C:\repos\ExistingProject" --transaction TRANSACTION_ID
```
