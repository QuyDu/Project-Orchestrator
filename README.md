# Project Orchestrator

Turn any repository into a governed GitHub Copilot workspace: agent instructions, scoped standards, reusable prompts, specialist agents, and 47 governed skills — installed consistently, verified after every run, and safe to rerun.

| Item | Value |
| --- | --- |
| Runtime version | `1.1.2` |
| Source version date | September 12, 2026 |
| Framework version | `9.0.0` |
| Skill catalog | 47 governed skills |
| Supported Node.js | 22, 24, 26 |
| Dependencies | None |
| Distribution | Authorized internal use only |

> **Name compatibility.** The product is now **Project Orchestrator**. The `pso` command,
> `project-skills-orchestrator` package and skill identifiers, repository URL, schema IDs, and
> `.skills-orchestrator` state directory remain stable compatibility interfaces for existing
> projects and automation.

> **Release status.** Version `1.1.2` is a source update dated September 12, 2026. No GitHub Release or package is published. The formal release remains blocked by trusted signing, independent review, and operational readiness evidence tracked in [release/release-manifest.json](release/release-manifest.json). See [SECURITY.md](SECURITY.md) and [docs/THREAT-MODEL.md](docs/THREAT-MODEL.md).

> **Security and use notice.** Reasonable security efforts do not eliminate all risk. Before using this software, read [DISCLAIMER.md](DISCLAIMER.md), perform independent checks appropriate to your environment, and comply with the internal-use terms in [LICENSE](LICENSE).

## Repository Resources

- [GitHub repository](https://github.com/QuyDu/Skills-Orchestrator)
- [README](https://github.com/QuyDu/Skills-Orchestrator#readme-ov-file)
- [License](https://github.com/QuyDu/Skills-Orchestrator#license-1-ov-file)
- [Security policy](https://github.com/QuyDu/Skills-Orchestrator#security-ov-file)
- [Activity](https://github.com/QuyDu/Skills-Orchestrator/activity)

---

## What this is

GitHub Copilot reads instruction files, prompt files, agent files, and skills from your repository. Setting those up well is slow, and keeping them consistent across many repositories is slower. This tool does it for you.

It has two halves.

**A command-line installer** (`pso.mjs`) that creates a new project or adopts an existing one. It runs entirely on Node.js built-ins — no packages to install, no registry access — and every change it makes is planned, journaled, and verified.

**A catalog of 47 skills** installed into `.github/skills/`, invoked from GitHub Copilot Chat in Agent mode. Each skill is a bounded contract: what it owns, what it reads, what it writes, when it must stop and ask you.

### What makes it different

- **Every prompt gets one bounded clarification round.** Provisioned projects normally receive three useful questions; complex, confusing, high-impact, or potentially damaging requests may receive up to five. After the answers, the agent asks no more clarification questions for that prompt.
- **It adapts to your repository.** A Python repo does not get C# standards. Detection drives what gets installed.
- **It will not duplicate your work.** If your repo already has a security instruction file, it reports that coverage instead of adding a second one.
- **Everything is reversible.** Every mutation is journaled under `.skills-orchestrator/transactions/` before it happens, with automatic rollback and manual recovery.
- **Reports are machine-readable and authoritative.** JSON under `reports/`, validated against schemas in `schemas/`. Markdown views are derived.

### What it does not do

It does **not** generate application code. `create-project` produces a governed baseline — instructions, standards, skills, CI wiring — with empty `src/` and `tests/`. You bring the application.

---

## Requirements

- Node.js 22, 24, or 26 on `PATH`
- Git on `PATH` (only for `clone-setup`)
- Visual Studio Code with GitHub Copilot and Copilot Chat, to use the installed skills

## Install

```powershell
git clone https://github.com/QuyDu/Skills-Orchestrator.git
cd Skills-Orchestrator
node .\pso.mjs verify
```

`verify` confirms the distribution is complete and every skill contract, schema, dependency, and ownership claim is valid. Do not provision another project if it fails.

To run the full conformance gate — security scan, release build, verification, and the complete test suite:

```powershell
npm run check
```

No dependencies are installed. `npm run check` needs no network access.

### Before you run it against anything

This tool modifies repositories. Back up your work, review the dry run, and test the result somewhere safe first. Interactive runs require you to type `I ACCEPT`; non-interactive runs require `--accept-risk`. Accepting acknowledges residual risk — it does not replace your own review.

---

## Use it

### Guided setup

```powershell
node .\pso.mjs
```

Asks whether your target is new, already local, or a remote GitHub repository, then collects the destination, profile, stack, and workspace accent color.

### Create a new project

```powershell
node .\pso.mjs create-project `
  --name "My Project" `
  --destination "C:\Projects" `
  --profile durable `
  --stack typescript `
  --color "#004578" `
  --open `
  --accept-risk
```

`--profile` is optional and defaults to `durable`, which requires the continuity skills and `audit-azure-environment` in addition to the `core` set. Pass `--profile core` for a smaller required set that excludes the deployed-environment Azure audit.

`--stack` is optional and accepts a comma-separated list. It decides which scoped instruction files are installed, what the build and test tasks run, which debug configurations are written, and what the generated CI workflow actually executes.

Supported values: `typescript`, `javascript`, `csharp`, `python`, `powershell`, `bicep`, `terraform`, `java`, `ruby`, `php`, `go`, `rust`, `swift`, `tests`.

`--color` is optional and accepts a six-digit hexadecimal color. It defaults to `#004578`. New projects use it for the active title bar and status bar, set the window title to `🚀 <project name> • ${rootName}`, and choose black or white foreground text automatically for contrast. The values are written to `.vscode/settings.json` for direct-folder use and to the generated `.code-workspace` file used by **Preferences: Open Workspace Settings (JSON)**. The guided prompts accept the same value.

`--open` launches Visual Studio Code on the generated workspace with the README showing. Without it the workspace path is printed for you to open manually.

Every generated project is standalone: it receives its own copy of the complete governed skill
catalog, schemas, workflows, prompts, agents, blueprint contract, and Azure discovery scaffold.
The lifecycle entry points are `/project-start`, `/project-blueprint`, `/project-validate`, and
`/project-status`; stack-specific editor tasks, launch configurations, and extensions remain
conditional so a Python project does not show misleading .NET or Terraform commands.

Start a new project with `/project-start`, which uses `/project-blueprint` before implementation. It records the confirmed
purpose, project type, stack, delivery target, Azure cloud and region, quality requirements,
assumptions, and acceptance criteria in a versioned blueprint that can be handed to setup,
architecture review, and workflow planning.

The generated project is a development foundation rather than a business application: it provides
the governed workspace and empty `src/` and `tests/` boundaries for the user to build within. Use
`/project-validate` to check the foundation and `/project-status` to identify authoritative blocked,
stale, or pending work.

Use `/linkedin-post` to analyze a project and prepare an evidence-grounded, profile-aware short-form
draft for Microsoft employees and the technical community. It enforces a focused why-care opening,
readable bullets, a discussion prompt, a 3,000-character limit, three to five final hashtags, and an
approved-media readiness check. Without approved media, it includes a media brief and returns `Not ready`.
Use `/linkedin-post --update` to compare against `reports/linkedin-post-history.md` and describe only
verified changes. Drafts are saved to `reports/linkedin-post-draft.md`; publication always remains a
user-approved external action.

To refresh a standalone project from a newer Skills Orchestrator checkout, preview the update first:

```powershell
node .\pso.mjs update --project "C:\Projects\my-project" --dry-run
node .\pso.mjs update --project "C:\Projects\my-project" --accept-risk
```

The updater refreshes orchestrator-owned skills, schemas, configuration, and missing framework
assets. It preserves application code, reports, and project-owned instruction customizations.

Without `--stack`, you get the universal standards and a CI workflow that **fails until you configure it**. That is deliberate — a pipeline that passes without testing anything is worse than no pipeline.

The destination must be absent or empty. The project is published only after installation verification passes.

### Get help for any skill

The source repository and every generated project expose a deterministic help route for each
skill. In Copilot Chat, run `/<skill-name>-help` or start with `/skills-help`. From the CLI,
print the same contract-based guide with:

```powershell
node .\pso.mjs help azure-discovery
node .\pso.mjs --help azure-cleanup
```

The guide includes the skill's purpose, inputs, boundaries, validation, approval gates, and
composition dependencies. Help is read-only; it never authorizes deployment, cleanup, commits,
pushes, or other gated actions.

### Build a governed custom agent

`/agent-builder` turns a focused role into a reviewable, least-privilege VS Code and GitHub Copilot
custom agent. Unlike a basic `.agent.md` generator, it uses a strict JSON blueprint, portable tool
aliases, deterministic rendering, destination-drift detection, explicit approval, atomic writes,
and transaction backups. It does not install extensions or MCP servers, pin models, or deploy a
hosted agent.

Create a blueprint such as `accessibility-reviewer.json`:

```json
{
  "schemaVersion": "1.0.0",
  "id": "accessibility-reviewer",
  "name": "Accessibility Reviewer",
  "description": "Use when reviewing interfaces for accessibility defects and actionable WCAG improvements.",
  "purpose": "Review repository evidence and report accessibility defects without changing project files.",
  "risk": "read-only",
  "capabilities": ["read", "search"],
  "invocation": { "userInvocable": true, "modelInvocable": true },
  "instructions": {
    "constraints": ["Do not modify files or execute commands during accessibility review."],
    "approach": [
      "Inspect interface source and existing accessibility test evidence.",
      "Report concrete findings with locations, impact, and suggested remediation."
    ],
    "outputFormat": "Return severity-ordered findings followed by unassessed scope and validation gaps."
  },
  "subagents": [],
  "handoffs": []
}
```

Validate and review before applying:

```powershell
node .\pso.mjs agent build --project C:\repos\my-project `
  --type copilot `
  --id accessibility-reviewer `
  --name "Accessibility Reviewer" `
  --description "Use when reviewing interfaces for accessibility defects and actionable WCAG improvements." `
  --purpose "Review repository evidence and report accessibility defects without changing project files." `
  --risk read-only `
  --capabilities read,search `
  --user-invocable true `
  --model-invocable true `
  --constraints "Do not modify files or execute commands during accessibility review." `
  --approach "Inspect interface source and tests.|Report findings with locations and remediation." `
  --output-format "Return severity-ordered findings and validation gaps." `
  --subagents none `
  --handoffs-file none

node .\pso.mjs agent validate --project C:\repos\my-project `
  --blueprint C:\repos\my-project\reports\agent-blueprints\accessibility-reviewer.json
node .\pso.mjs agent plan --project C:\repos\my-project `
  --blueprint C:\repos\my-project\reports\agent-blueprints\accessibility-reviewer.json
# Review reports/agent-builder-plan.md before accepting the write.
node .\pso.mjs agent apply --project C:\repos\my-project `
  --blueprint C:\repos\my-project\reports\agent-blueprints\accessibility-reviewer.json `
  --plan C:\repos\my-project\reports\agent-builder-plan.json --accept-risk
```

The first release intentionally supports only portable capabilities: `read`, `search`, `web`,
`edit`, `execute`, `agent`, and `todo`. Environment-specific extension tools, hooks, MCP servers,
and hosted Foundry agents require separate design and approval rather than being emitted silently.

`agent build` accepts `copilot`, `foundry-prompt`, and `foundry-hosted` as design types. Omitted
parameters are requested interactively; supplied values are not requested again. Foundry types,
or `--azure-required true`, resolve `--cloud`, `--location`, `--environment-name`,
`--authentication-method`, and optional `--subscription-id` from explicit input or the ignored
`.azure/environment.json` profile. The matching Azure CLI login starts only when required.
Passwords, secrets, tokens, keys, and connection strings are prohibited as parameters. A
Foundry-aware blueprint records sanitized environment metadata but does not create or deploy a
hosted agent; that remains a separate Microsoft Foundry workflow and approval boundary.

### Demo prompt

Run `/demo-create-project` for the normal reusable demo workspace. Use `/demo-create-project --Test`
to create the same prepared demo under `C:\repos\skills-orchestrator-demo-test` without deleting
it after the run. An optional `--demo-date YYYY-MM-DD` records the scheduled event, for example
`/demo-create-project --demo-date 2026-09-17`. The date is metadata only and does not authorize
deployment, cleanup, publication, commits, or pushes.

### Hand the first task over with `--intent`

`--intent` records what you want built first, so the new workspace opens with the work already in front of the agent.

```powershell
node .\pso.mjs create-project `
  --name "Skills Orchestrator Demo" `
  --destination "C:\repos" `
  --stack typescript `
  --intent "Demo started 10:30 am and runs for 1 hour. Build a web app that explains the demo and counts down to the end." `
  --open `
  --accept-risk
```

Describe the **application** only. The project itself already exists by the time the agent reads this, so an intent that says "create a new project" tells the agent to create something it is already sitting inside.

Two things happen:

- `docs/PROJECT-BRIEF.md` is written into the project, recording the requested outcome verbatim alongside an ISO 8601 creation timestamp. The brief is the durable copy; it survives closing the window.
- With `--open`, the outcome is handed to Copilot Chat **in ask mode**, with the brief attached as context.

Ask mode is deliberate. A newly created folder has not been trusted yet, and the text arrived over a command-line argument that a script could just as easily have supplied. The first turn therefore reads the brief, asks its three clarifying questions, and proposes a plan — it cannot write files. Switch to Agent mode once you approve.

Relative times are left alone. `--intent` is never parsed for dates; the agent resolves "10:30 am" against the recorded creation timestamp and asks if that is ambiguous.

If Visual Studio Code cannot be launched, project creation still succeeds and the composed prompt is printed for you to paste.

### First run in Visual Studio Code

Two prompts appear the first time, and both are expected:

1. **Workspace trust** — select *Yes, I trust the authors*. Tasks, debugging, and MCP servers stay disabled until you do. This cannot be pre-approved from inside a workspace, by design.
2. **Recommended extensions** — select *Install* to get the language extensions for your stack.

Everything else is discovered automatically. Instructions, prompts, agents, and skills all live in the locations Visual Studio Code searches by default, so there is nothing to configure:

| Location | Discovered as |
| --- | --- |
| `.github/copilot-instructions.md`, `AGENTS.md` | Always-on instructions |
| `.github/instructions/` | Pattern-scoped instructions |
| `.github/prompts/` | Slash commands, surfaced as recommendations in a new chat |
| `.github/agents/` | Entries in the agent picker |
| `.github/skills/` | The governed skill catalog |

Open Copilot Chat in Agent mode and your first prompt triggers the three-question clarification protocol.

### Copilot cloud agent and code review

The same customization files carry beyond the IDE. Per the [GitHub Copilot features](https://docs.github.com/en/copilot/get-started/features) documentation, `.github/copilot-instructions.md`, `AGENTS.md`, `.github/agents/`, and `.github/skills/` are read by Copilot cloud agent on GitHub.com, in IDEs, and in Copilot CLI — not only by VS Code.

A project created with `--stack` also gets `.github/workflows/copilot-setup-steps.yml`, which preinstalls dependencies in the ephemeral environment Copilot cloud agent and Copilot code review use. Without it the agent has to discover dependencies by trial and error, which the GitHub documentation warns is slow, unreliable, and sometimes impossible for private packages.

Two caveats, stated plainly:

- The setup steps workflow only takes effect once it is on your default branch.
- MCP servers are configured for VS Code in `.vscode/mcp.json`. Cloud agent and CLI read MCP configuration from the `mcp-servers` property of an agent profile instead, which these templates do not set.

### Adopt an existing project

Always preview first:

```powershell
node .\pso.mjs adopt --project "C:\repos\ExistingProject" --profile core --dry-run
```

The plan tells you exactly what will happen:

```text
Detected stack: python, tests
Files to create: 24
Existing skills to update: 0
Templates skipped as not applicable: 4
Templates covered by existing files: 1
  covered: .github/instructions/security.instructions.md by .github/instructions/appsec.instructions.md
Blocking conflicts: 0
```

Apply the reviewed plan:

```powershell
node .\pso.mjs adopt --project "C:\repos\ExistingProject" --profile core --apply --accept-risk
```

Rerun it any time. A rerun adds new skills, synchronizes changed ones, migrates legacy skill IDs, and reports zero changes when nothing moved.

**What adoption will never do:** overwrite your instruction text, replace a skill you wrote, install a second copy of a standard you already have, or add a CI workflow to a repository that has its own.

Useful flags:

| Flag | Effect |
| --- | --- |
| `--force-templates` | Install framework templates even where an equivalent already exists |
| `--force-adopt` | Proceed against a directory with no recognized project marker |
| `--profile` | `core`, `durable`, `distributed`, or `advanced`. Adoption keeps the profile the project already declares; new projects default to `durable` |

### Clone and provision in one step

```powershell
node .\pso.mjs clone-setup `
  --repository "https://github.com/owner/project.git" `
  --destination "C:\repos\project" `
  --accept-risk
```

Clones into an isolated staging directory, provisions, verifies, and only then publishes to your destination. Credential-bearing URLs are rejected; use Git Credential Manager or SSH. No script from the cloned repository is ever executed.

---

## What a provisioned project receives

| Path | Contents |
| --- | --- |
| `.github/copilot-instructions.md` | Repository constitution: engagement protocol, orchestration, purpose, architecture, coding, naming, Azure, security, testing, documentation |
| `.github/instructions/` | Scoped standards applied by glob — only the ones your stack needs |
| `.github/prompts/` | Prompt-only commands such as `/create-adr`, `/project-blueprint`, `/review-architecture`, `/executive-summary`, and `/new-component`, plus skill help prompts; skill-owned names are not duplicated here |
| `.github/agents/` | Azure Architect, Security Reviewer, Documentation Writer |
| `.github/skills/` | The 47-skill catalog |
| `.github/workflows/ci.yml` | Stack-aware pipeline, SHA-pinned actions (new projects only) |
| `.github/workflows/copilot-setup-steps.yml` | Preinstalls dependencies for Copilot cloud agent and Copilot code review (new projects with a stack) |
| `.vscode/tasks.json` | Build and test tasks for the stack — `Ctrl+Shift+B` and Test Explorer work immediately |
| `.vscode/launch.json` | Debug configurations for the stack |
| `.vscode/extensions.json` | Copilot, EditorConfig, plus the language extensions your stack needs |
| `.vscode/mcp.json` | GitHub and Microsoft Learn MCP servers; registry-dependent servers documented but disabled |
| `.azure/environment.json` | Ignored local Azure cloud, subscription, authentication-method, region, and MCP preferences created on first Azure use |
| `.editorconfig` / `.gitattributes` | Shared formatting and line-ending normalization |
| `docs/adr/` | Architecture Decision Record template |
| `schemas/` | Report contracts |
| `reports/` | Authoritative machine-readable evidence, tracked in source control |

### Build, test, and debug

Declare a stack and the workspace is wired for it. A `--stack csharp,bicep` project gets:

- **Extensions**: C# Dev Kit, C#, Bicep — and not Python or Go
- **Tasks**: `dotnet build` as the default build task, `dotnet test` as the default test task, plus `validate: bicep`
- **Debug**: a `coreclr` configuration with `build` as its `preLaunchTask`

Configurations that genuinely cannot be inferred — a .NET assembly path, a Node entry point, a Java main class — carry an explicit `REPLACE_WITH_` placeholder. Python, Go, PowerShell, and PHP configurations work with no edit at all.

**Declare no stack and none of this is generated.** No task file, no launch file, and a CI workflow that fails until you configure it. The tool will not invent a build command it cannot stand behind.

### The clarification protocol

Every provisioned project carries one non-negotiable rule. For **every** new prompt, the agent must:

1. Run `clarify-the-ask`
2. Ask one round of three clarifying questions, or up to five when complexity or risk genuinely requires it
3. Wait for your answers
4. State the objective, the steps, the files it will touch, and the risks
5. Continue without another clarification round; separate approval gates still apply

It is installed in four places — `.github/copilot-instructions.md`, `.github/instructions/clarification.instructions.md`, `AGENTS.md`, and `config/skills-orchestrator.json` — and enforced in code: installation verification fails if the managed region is missing or duplicated.

Tune it in `config/skills-orchestrator.json`:

```json
{
  "clarification": {
    "enabled": true,
    "askEveryPrompt": true,
    "questionsPerPrompt": 3,
    "maxQuestionsPerRound": 5,
    "blockOnMaterialAmbiguity": true,
    "confirmPlanBeforeExecution": true
  }
}
```

Set `askEveryPrompt` to `false` for evidence-driven clarification, where zero questions is valid when the repository already answers them.

### Managed regions

Framework-owned sections of your instruction files are wrapped in markers:

```markdown
<!-- pso:begin id=clarification-protocol version=1 -->
...
<!-- pso:end id=clarification-protocol -->
```

Edit anything outside them freely. Updates replace the region in place. Rename a heading or delete the markers and the next run migrates it back — it never appends a second copy.

---

## Using the skills

Open the project in VS Code, start Copilot Chat in **Agent** mode, and invoke a skill:

```text
/project-setup            Establish the baseline for this application
/audit-code               Audit, analyze findings, and build a remediation plan
/audit-remediation        Execute an approved audit plan by scope or checkpoint
/security-review          Exploitable weaknesses, secrets, authorization defects
/architecture-review      Well-Architected assessment of the defined architecture
/deployment-review        Is this release candidate deployable, and how do we roll back
/documentation-builder    Build the canonical project guide and supporting documentation
/user-personalization     Build the local reusable voice, perspective, visual, and safety profile
/personalized-content     Turn the current project into locally saved content, whiteboards, or dioramas
/skill-create             Create a skill after duplicate, reuse, and wiring analysis
/skill-update             Resolve and update one existing skill after explicit approval
/project-status           Check lifecycle, Azure resource health, sync freshness, and deployment currency
/project-understanding    Completely rescan and rebuild the current project guide
/project-video            Create a project-specific animated MP4 with approved narration
/systematic-debugging     Reproduce, isolate root cause, verify the smallest fix
/change-review            Review this diff before commit
/project-handoff          Record continuity before you stop
```

### Local User Personalization

`personalized-content` requires a valid `.skills-orchestrator/user-personalization.json`. When the file is missing or invalid, `user-personalization` asks a bounded, reusable questionnaire before content work continues. The profile stores only user-approved public-facing preferences and professional context, remains ignored by Git, and is never copied into reports or generated documentation.

Every `/personalized-content` run performs a fresh Project Understanding scan and uses the current repository as its sole topic and source. Preflight binds the run to that repository digest and assigns a unique local destination under `artifacts/personalized-content/<run-id>/`; external source and output-path overrides are rejected.

Visual runs default to a hand-drawn whiteboard. Use `--visual-style diorama` with `whiteboard`, `whiteboard-specification`, or `full-package` output to create an evidence-bound miniature scene instead:

```text
/personalized-content --output-type whiteboard --visual-style diorama
```

Diorama preflight automatically selects an architectural treatment for verified components, topology, platforms, services, or boundaries; otherwise it uses a conceptual treatment. The visual standard is a photographed handcrafted miniature exhibit: tactile cardboard, foam, clay, wood, paper, warm studio lighting, physical depth, real shadows, one central sculpted metaphor, supporting shadow-box panels, and fewer larger labels. Reference images guide those medium-level traits only; their text, characters, branding, signatures, and exact composition are never copied.

A final `diorama.png` requires an approved bitmap image generator or a genuine physically based 3D renderer. HTML/CSS/SVG screenshots and flat faux-isometric compositions do not qualify. When no qualified renderer is available, the run produces only `diorama-specification.md` and `diorama-alt-text.md` and states that no finished image was produced. Every rendered visual uses only the validated User Personalization signature and current profile timezone date. The canonical spelling is `diorama`.

The profile owner requires explicit approval before creation or replacement. Other skills may read the validated file but cannot modify it. Creating a repository-local run also requires approval, and personalized content remains a draft until reviewed; posting, sending, uploading, or other external publication is outside the skill and requires separate approval.

`/audit-code` automatically runs the complete read-only analysis pipeline, and each stage validates the one before it:

```text
/audit-code
  -> reports/code-audit-findings.json
  -> reports/code-audit-review.json
  -> reports/audit-remediation-plan.json
  -> approval-wait
```

Remediation is always a separate, explicitly approved invocation. Use `/audit-remediation -All` for every eligible phase, `-Phase <milestone-id>` for one phase and its prerequisites, `-Finding <AUD-id>` for one finding and its prerequisites, or `-Resume` from the last valid checkpoint. Every phase validates its changes, records execution state, and refreshes project handoff with completed and remaining audit work. Destructive, external, deployment, commit, push, publication, credential, and risk-acceptance actions retain separate point-of-action approvals.

### Conformance profiles

| Profile | Adds |
| --- | --- |
| `core` | Orchestration, clarification, planning, policy, setup, audit pipeline, security and architecture review, documentation, deployment review, debugging, testing, CI triage, dependencies, commit preparation |
| `durable` | Handoff, knowledge capture, memory, recovery, audit remediation execution, artifact upgrade, Azure cleanup |
| `distributed` | Scheduler, multi-agent coordination, telemetry |
| `advanced` | Workflow simulation, skill registry |

Every profile is dependency-closed and enforced by tests.

### Project video

Every created or adopted project receives `/project-understanding`, `/documentation-builder`, `/project-video`, their schemas, and self-contained Node.js helpers. Project Understanding performs a complete rescan on every run and atomically rebuilds `reports/project-understanding.json` and its Markdown view. When a user explicitly invokes `/documentation-builder`, it builds the canonical `docs/PROJECT-GUIDE.md` and evidence-bound `reports/project-guide.json`. `/project-video`, `/linkedin-post`, and future presentation workflows consume that guide and verify it against current code and reports. These workflows do not run automatically after project creation or during unrelated skills.

After rebuilding Project Understanding, every invocation runs `discovery-status`. When Azure discovery is missing or unusable, the skill asks whether to run `/azure-discovery`. A yes refreshes discovery and continues through `azure-preflight`. A no explicitly selects `browser-preview` and generates project-specific HTML with browser-default English speech, responsive visuals, manual controls, and scene advancement on utterance completion. The browser or operating system controls voice processing, which may use an online service. This fallback preserves the same pages and dialogue but is not rendered audio, portable video, or an MP4.

The preferred quality path uses an approved existing Azure Speech resource configured through process environment variables and produces both a polished local MP4 and a self-contained narrated HTML preview. For a free portable demo, the standard fallback is local Piper narration plus local FFmpeg; its voice is more robotic but requires no Azure account, credential, network call, or usage charge after the one-time approved voice installation. If local Piper is not installed, the final fallback is browser-preview HTML, which is interactive but not a portable MP4. The configured Azure region is preferred; another compatible region in the same Azure cloud requires explicit cross-region approval. Discovery records only Speech account counts, kinds, and regions, never names, identifiers, or keys. Before Azure synthesis, the skill generates the same short passage with Ava Neural, Aria Neural, and Jenny professional narration so the user can listen and explicitly choose.

The packaged helper enforces that sequence:

```powershell
node .\.github\skills\project-video\scripts\project-video.mjs plan-from-understanding
node .\.github\skills\project-video\scripts\project-video.mjs discovery-status
node .\.github\skills\project-video\scripts\project-video.mjs azure-preflight
node .\.github\skills\project-video\scripts\project-video.mjs audition --approve-external
# Open reports/project-video/voice-samples/index.html and listen to A, B, and C.
node .\.github\skills\project-video\scripts\project-video.mjs select-voice --profile ava-hd-warm --approve-selection
node .\.github\skills\project-video\scripts\project-video.mjs narrate --approve-external
```

The preflight fails closed when accepted discovery is incompatible, stale, uncertain, cloud-mismatched, or lacks an existing Speech resource in `AZURE_SPEECH_REGION`. It reports required environment variable names but never obtains or prints a key. Declining discovery avoids this Azure path and runs `browser-preview` instead. The selection command updates and revalidates Azure plans with canonical profile settings. Discovery, selected profile, style intensity, rate, sentence pause, sample digest, and narration digests remain bound to the final media manifest.

Azure is not required for a preview or for an offline fallback MP4. A browser-preview plan uses this voice contract and an HTML output path:

```json
"voice": {
  "provider": "browser-preview",
  "name": "default-English",
  "locale": "en-US"
},
"output": {
  "file": "dist/project-video/my-project.html"
}
```

Run `node .\.github\skills\project-video\scripts\project-video.mjs browser-preview` to generate it. Its strict manifest is written to `reports/project-video/browser-preview-manifest.json`. Browser speech is never recorded as final audio evidence; browser and operating-system voice services control whether speech remains on-device.

For final offline narration, set the plan's voice provider to `local-piper` with the pinned `en_US-ljspeech-high` settings. Piper `1.7.0` requires an existing Python 3.10 through 3.13 runtime and supports Windows x64, Linux x64 or arm64, and macOS x64 or arm64 in this workflow. Its GPL-3.0-or-later engine, complete exact runtime dependency set, and 114 MB LJSpeech model are installed only under `.skills-orchestrator/tools/project-video/local-voice/` after separate approvals. The lock includes non-vulnerable protobuf `6.33.5`; the platform-bound installation manifest records and verifies every expected package, wheel, model file, approval, and requirements digest. The LJSpeech dataset provenance is public domain.

```json
"voice": {
  "provider": "local-piper",
  "name": "en_US-ljspeech-high",
  "locale": "en-US",
  "lengthScale": 1,
  "sentenceSilenceSeconds": 0.18
}
```

```powershell
node .\.github\skills\project-video\scripts\project-video.mjs install-local-voice `
  --accept-download --accept-gpl --accept-model-provenance
node .\.github\skills\project-video\scripts\project-video.mjs narrate --approve-local
```

The installer does not install Python globally or modify the application dependency graph. It verifies the official Piper wheel digest for the current platform, retains and hashes the resolved wheel set, verifies the pinned model, and records an installation manifest. Local WAV narration and the final MP4 are labeled `local-piper`; switching later to Azure requires an explicit plan change and the normal Azure audition workflow.

For the bundled animation under `Demo/`, generate its matching audition set and final Ava Neural narration with:

```powershell
.\scripts\generate-demo-narration.ps1 -Audition -ApproveExternal
# Listen at Demo/audio/narration/voice-samples/index.html.
.\scripts\generate-demo-narration.ps1 -VoiceProfile ava-hd-warm -ApproveExternal -Force
```

Use [Demo/DEMO-DAY.md](Demo/DEMO-DAY.md) for the presentation sequence: show the existing guide, create and implement the new webapp, then invoke `/project-video` so fresh Azure discovery and `azure-preflight` gate the new narration before local FFmpeg rendering.

The skill will not persist credentials or silently change narration providers. MP4 rendering uses an existing FFmpeg executable or, after explicit approval, installs the pinned `ffmpeg-static@5.3.0` dependency only under `.skills-orchestrator/tools/project-video/`. Azure processing, local engine/model downloads and licenses, narration, renderer downloads, lifecycle scripts, replacement, and publication remain approval-gated.

---

## Command reference

| Command | Purpose |
| --- | --- |
| `node .\pso.mjs` | Guided setup |
| `node .\pso.mjs verify` | Verify this distribution |
| `node .\pso.mjs create-project ... --accept-risk` | Create a new governed project |
| `node .\pso.mjs clone-setup ... --accept-risk` | Clone a GitHub repository and provision it |
| `node .\pso.mjs adopt ... --dry-run` | Preview changes to an existing project |
| `node .\pso.mjs adopt ... --dry-run --json` | Emit the portable plan as JSON without changing the project |
| `node .\pso.mjs adopt ... --apply --accept-risk` | Apply the reviewed plan |
| `node .\pso.mjs recover --project PATH` | Restore an interrupted adoption |
| `node .\pso.mjs inventory --root PATH` | Regenerate and validate the skill inventory |
| `node .\pso.mjs plan --root PATH --intent TEXT` | Create a workflow plan |
| `node .\pso.mjs agent build --project PATH [parameters]` | Ask for missing fields, conditionally establish Azure context, and generate a v2.1 agent blueprint and review plan |
| `node .\pso.mjs agent validate --project PATH --blueprint FILE` | Validate a governed agent blueprint |
| `node .\pso.mjs agent plan --project PATH --blueprint FILE` | Render a reviewable agent plan without changing the agent |
| `node .\pso.mjs agent apply --project PATH --blueprint FILE --plan FILE --accept-risk` | Apply a current reviewed agent plan transactionally |
| `npm run evidence:adoption` | Regenerate disposable-fixture adoption and no-op evidence |
| `npm run check` | Full conformance gate |

Use `--autonomy autonomous-research --web-safety threat-informed` to let a read-only `read,search,web` agent continue research without conversational approval pauses. VS Code tool and URL confirmations remain controlled by the session permission level; do not use Bypass Approvals or Autopilot with agents that expose mutating tools.

## Reports

| Report | Meaning |
| --- | --- |
| `reports/installation-verification.json` | Proof a new project is complete and correctly wired |
| `reports/adoption-verification.json` | Proof an adopted project is current |
| `reports/adoption-plan.json` | Exact actions applied by the last adoption of a target project, including skipped and covered decisions |
| `reports/adoption-rerun-evidence.json` | Reproducible before/apply/no-op evidence from a disposable project fixture |
| `reports/adoption-rerun-evidence.md` | Concise presentation view derived from the rerun evidence |
| `reports/skill-inventory.json` | Installed skills, dependencies, lifecycle, outputs |
| `reports/artifact-ownership.json` | The declared producer of every skill-owned report |
| `reports/execution-log.jsonl` | Append-only workflow event stream |

An adoption dry run never writes into the target repository, so it does not create `reports/adoption-plan.json`. Use `--json` to capture that portable plan from standard output. The target report is persisted only after an approved apply. The source repository's rerun evidence is generated separately with `npm run evidence:adoption` against a disposable local fixture.

## Recovery

If adoption is interrupted, the journal under `.skills-orchestrator/transactions/` holds a backup of every file touched. A `rolled-back` journal means restoration already completed. Otherwise:

```powershell
node .\pso.mjs recover --project "C:\repos\ExistingProject"
```

Recovery refuses to replace a lock whose owning process may still be running.

## Security

- Zero runtime dependencies; committed lock file; `ignore-scripts` enforced
- Every GitHub Action pinned to a full commit SHA, enforced by [scripts/security-check.mjs](scripts/security-check.mjs)
- Shipped templates may not resolve unpinned packages at runtime (`SEC-SUPPLY-006`)
- Symbolic links rejected on every managed path; all writes confined to the project root
- Credential-bearing repository URLs rejected
- No dynamic code execution, no shell interpretation

Report vulnerabilities per [SECURITY.md](SECURITY.md). Threat boundaries and residual risks are in [docs/THREAT-MODEL.md](docs/THREAT-MODEL.md). No software eliminates every defect — do not treat any build as security-assured without current evidence for all documented release gates.

## Contributing

`config/profiles.yaml`, `schemas/`, `templates/`, and the skill catalog are contract surfaces. Changing any of them requires updating [tests/skill-contracts.test.mjs](tests/skill-contracts.test.mjs). Run `npm run check` before proposing a change.

## License

See [LICENSE](LICENSE). Restricted to authorized internal use; see [docs/INTERNAL-RELEASE.md](docs/INTERNAL-RELEASE.md).
