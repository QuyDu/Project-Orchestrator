# Demo Day Runbook

## 60-minute presenter plan

The PowerPoint speaker notes are the detailed presenter guide. Rehearse to these targets; they total 60 minutes and reserve 15 minutes for the live project workflow.

| Slide | Topic | Target |
| --- | --- | ---: |
| 1 | Opening and the establish-orchestrate-prove story | 4 minutes |
| 2 | Why repositories need an operating model | 4 minutes |
| 3 | Evidence-grounded project video | 5 minutes |
| 4 | Repository-local control-plane architecture | 5 minutes |
| 5 | New, existing, and remote adoption | 4 minutes |
| 6 | Routing, composition, and audit lineage | 5 minutes |
| 7 | Least-privilege Agent Builder | 5 minutes |
| 8 | Governed publication handoff | 4 minutes |
| 9 | Autonomy with mandatory consent | 4 minutes |
| 10 | Live project creation and build | 15 minutes |
| 11 | Evidence, limitations, closing, and Q&A | 5 minutes |

Each notes page expands the exact content visible on its slide through four layers: `WALK THE SLIDE` explains what to point to, `CORE STORY` provides the primary narrative, `PROJECT DEPTH` connects the visual to current architecture and implementation, and `EVIDENCE TO REFERENCE` identifies concrete files, reports, schemas, tests, or commands. Audience prompts, transitions, and optional material support pacing without replacing the slide's subject.

Deliver the opening, visual walkthrough, and core story first. Use project-depth material selectively based on the room, and use the evidence references when someone asks how a claim is implemented or verified. This keeps the prepared route within 60 minutes while providing enough grounded detail to answer technical follow-ups. Slide 10 also contains stage narration, deployment stop conditions, and recovery paths. Treat a blocked consequential action as a successful demonstration of governance, not as a reason to rush or bypass the gate.

## Before the audience arrives

1. Open `Demo/Project-Orchestrator-Demo.pptx` and confirm all 11 slides render correctly. This is an archived, internally synchronized version 1.1.1 deck; current source version and validation evidence are recorded in `README.md` and `reports/current-work-state.json`.
2. On slide 3, test **Watch: Built by Project Orchestrator** and confirm it opens `dist/project-video/skills-orchestrator-1-1-0.html`. If PowerPoint blocks the local link or the repository moved, open that repository-relative path manually and return to slide 4 after playback.
3. Open `Demo/project-skills-orchestrator-animation.html` locally as the animated companion and fallback. Confirm every scene, caption, navigation control, and responsive layout works.
4. Optionally open the pre-created `dist/project-video/skills-orchestrator-1-1-0.mp4` as an alternate short baseline. Its `reports/project-video/project-video-manifest.json` records the media checksum, duration, and Azure Speech narration provenance, but the older video does not replace the current PowerPoint or HTML decks.
5. Confirm Node.js and Visual Studio Code are available for the local project-creation flow. Use `/demo-create-project --Test` during rehearsal so the test workspace remains available for inspection.
6. Before Act 3's deployment decision, confirm Azure CLI is already signed in to the intended Azure US Government subscription. Do not project credentials, device codes, tokens, keys, tenant identifiers, or subscription identifiers.
7. Confirm the audience can see the slides, terminal, editor, and browser. Keep the generated-app browser tab ready to show the `?mode=test` view and the three `?at=` phase overrides.
8. Keep the latest successful `npm run check` evidence visible and confirm all 47 skills were verified. The candidate remains unsigned and P4 release assurance remains blocked.

## Act 1: introduce the governed foundation

Use the PowerPoint deck as an archived version 1.1.1 product story, not as evidence of the current source version or current test counts. Use slides 1 and 2 to introduce yourself, Project Orchestrator, its purpose, and the problem it solves. Then use slide 3 to launch **Watch: Built by Project Orchestrator** and explain that the project generated this evidence-grounded walkthrough from its own repository. After playback, return to slide 4 and continue the architecture story.

Use the animated browser deck when motion or narration serves the room better, or as the local fallback. The browser deck falls back to the browser's default English voice when a matching narration file is absent. The pre-created, manifest-verified MP4 remains an alternate version 1.1.0 baseline rather than the primary opener.

## Act 2: show the Agent Builder milestone

Use the Agent Builder scenes to make this boundary explicit:

```text
Agent Builder
	-> governed local agent definition
	-> reviewed publication plan
	-> explicit approval
	-> platform-specific publishing workflow
```

Explain that `guided` mode works from supplied requirements while `autonomous-research` gathers bounded evidence before proposing a blueprint. Both modes validate a least-privilege `.agent.md`, preserve the six mandatory approval gates, and install transactionally only after review.

Show that publication intent is planning data, not an instruction to publish. Blueprint schema 2.2 and plan schema 1.1 distinguish three handoffs: a Microsoft Foundry managed endpoint, Microsoft 365 Copilot and Teams distribution, and an indirect ChatGPT Custom GPT HTTPS/OpenAPI Action. Agent Builder does not create or mutate any of those external resources.

Close the act with three controls:

1. Updated CLI, schemas, runtime, and tests propagate through the packaged framework into newly created projects.
2. Purchase, booking, messaging, account-security changes, sensitive disclosure, and destructive actions always require approval.
3. Azure Government publication readiness fails closed wherever current service, channel, authorization, or data-boundary evidence is unknown.

Do not describe the release as production-ready. The candidate remains unsigned, independent review and revocation evidence are incomplete, and P4 release assurance is blocked.

## Act 3: build a new project

Run `/demo-create-project` from this repository. It creates a separate governed TypeScript project, verifies its installed skills and Azure Government scaffold, copies the bounded build prompt into that new project, and opens its own VS Code workspace. The Project Orchestrator source repository is immutable after the handoff. Do not invoke project video while the project is still an empty governed baseline.

In the new workspace, switch Chat to Agent mode and run `/demo-web-app`. Its first stage runs `/azure-discovery -Gov` for `usgovarizona`, initializes or reuses the generated project's ignored Azure environment profile, requires current evidence for an existing Speech-capable resource, binds the nonsecret Speech cloud and region environment values, and runs the packaged Project Video `azure-preflight`. Let the generated project build and test its own application only after the preflight reports `credentialConfigured: true`.

### Deployment checkpoint

The generated-app prompt confirms Azure CLI availability, an authenticated `AzureUSGovernment` context, the selected subscription, reusable Speech capability, matching region, and a configured Speech credential during its initial read-only discovery stage. If any prerequisite is missing, it stops before application implementation. Complete authentication and set `AZURE_SPEECH_KEY` directly in the terminal before the live presentation whenever possible; never paste or project the key. The recorded interactive login flow may start during discovery when the session is stale.

When the prompt explains the billable resource group and public endpoint, pause for explicit approval. Only after approval may it create `rg-skillsdemo`, run the deployment preview, inspect the preview, and deploy. A preview with unexpected changes is a stop condition.

When the webapp has meaningful source, tests, and documentation, ask:

```text
/project-video --proceed
```

Use the following sequence only when a project-specific follow-up video is part of the presentation. It is not required for the pre-created Act 1 video or for the generated application's Azure deployment:

1. Run `/project-understanding --proceed` as a complete rescan and rebuild the authoritative JSON and Markdown project guide.
2. Build the presentation pages and dialogue from that guide, then reject unsupported narration claims.
3. Run `discovery-status`. When discovery is missing or unusable, ask whether to invoke `/azure-discovery -Gov`.
4. Confirm the read-only discovery query found an existing Speech-capable resource and recorded only its kind and region, never its name, identifier, or key.
5. Run the packaged `azure-preflight` command. Prefer the configured region; require approval before using another compatible region in the same Azure cloud.
6. Explain that Azure Speech supplies the neural narration and local FFmpeg renders the MP4. There is no Azure video API or Azure resource deployment in this workflow.
7. Create the digest-bound project-video plan, present the external-processing and cost boundary, and wait for approval before auditioning voices.
8. Generate the A/B/C audition, let the presenter choose a voice, present the full narration, and wait for synthesis approval.
9. Wait for render approval, generate the MP4 under `dist/project-video/`, and verify its audio, video, dimensions, duration, and digest.

The direct preflight command is:

```powershell
node .\.github\skills\project-video\scripts\project-video.mjs azure-preflight
```

If discovery or cross-region processing is declined, generate the same pages and dialogue as a browser-default-voice presentation and report its HTML output. Offer Piper only when the presenter explicitly requires a narrated offline MP4. Never create an Azure resource for video narration or silently relabel browser speech.