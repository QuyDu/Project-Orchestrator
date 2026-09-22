$ErrorActionPreference = 'Stop'

$source = Join-Path $PSScriptRoot '..\Demo\Project-Orchestrator-Demo.pptx'
$candidate = Join-Path $env:TEMP "Project-Orchestrator-Demo-notes-$([guid]::NewGuid()).pptx"

$notes = @{
    1 = @'
TIME TARGET: 4 minutes

OPENING
Good afternoon, everyone. I'm Anthony Marsiglia, a Principal Cloud Solution Architect. Thank you for joining me.

Let me start with a question: What if every repository had its own governed way of working?

WALK THE SLIDE
Start with the headline, then move across the three colored blocks. Establish is the repository foundation. Orchestrate is how intent becomes an ordered workflow. Prove is how the project earns a completion claim. The footer summarizes the engineering posture behind those verbs: a broad skill catalog, no third-party runtime packages, schema-backed evidence, and maintained Node.js release lines.

CORE STORY
That question started the conversation behind Project Orchestrator. We wanted GitHub Copilot to do more than generate code. We wanted it to understand the project's instructions, route work to bounded skills, pause for approval at consequential moments, and leave evidence that people and automation can inspect.

The three verbs on this slide are the story for the hour. Establish means giving a repository instructions, standards, profiles, and a shared operating model. Orchestrate means routing an outcome to the right bounded workflow instead of relying on one giant prompt. Prove means validating the result and retaining evidence after the chat is gone.

This deck is a synchronized version 1.1.1 presentation artifact. The current source version is documented separately in the repository. I will use the deck to explain the operating model, then show the current workflow live.

PROJECT DEPTH
Establish is implemented by the create-project, adopt, and clone-setup paths in pso.mjs. They install repository instructions, profile-selected skills, schemas, editor configuration, and evidence surfaces. Orchestrate is owned by .github/skills/project-skills-orchestrator/SKILL.md and the dependency declarations in the skill contracts. Prove is visible in schema-validated JSON under reports/, append-only execution records, and the npm run check gate.

The repository is the unit of governance. Instructions and workflows travel with branches and pull requests, can be reviewed as diffs, and remain available when the original chat session is gone. The runtime itself uses Node.js built-ins, supports Node.js 22, 24, and 26, and does not depend on an npm runtime package graph.

EVIDENCE TO REFERENCE
README.md states the current product scope and release limitations. package.json records the current runtime version, supported Node.js majors, and the full check command. config/profiles.yaml shows which skills each profile installs. reports/skill-inventory.json is the current catalog evidence.

AUDIENCE PROMPT
As you listen, think about one repository where Copilot is useful today but the team's expectations, approvals, or evidence still live mostly in people's heads.

TRANSITION
To understand why this matters, let's look at the gap between a fast agent and a controlled project.

IF YOU NEED MORE TIME
Briefly introduce your role and why governance matters in customer environments. Explain that governance here is not about slowing developers down; it is about making good behavior repeatable, visible, and recoverable.
'@
    2 = @'
TIME TARGET: 4 minutes

OPENING
Agents move fast. The project still has to carry the consequences after the conversation ends.

WALK THE SLIDE
Read the slide as a before-and-after comparison. On the left, each weakness is a missing project control: no explicit scope, inconsistent review, invisible authorization, and no durable record. On the right, each heading names the corresponding control surface: boundaries, gates, composition, and memory.
reports/skill-inventory.json records the current skill catalog. SECURITY.md defines the support and reporting posture. README.md states that no formal GitHub Release or package is published.
CORE STORY
The left side is what happens when a team adopts AI one prompt at a time. Scope gets guessed. Review quality depends on who happens to be present. Approval is implied instead of recorded. Useful context and evidence disappear in chat history.

The right side is the repository-owned operating model. Boundaries answer: which workflow owns this action, what may it read, and what may it change? Gates make clarification, risk acceptance, and consequential approvals explicit. Composition orders prerequisites so downstream work cannot claim success before required evidence exists. Memory means machine-readable reports, decisions, and handoffs survive beyond one session.

The key idea is that Project Orchestrator is not another chatbot. It is the layer around Copilot that gives a repository a durable way of working. The model can change. The team can change. The repository still carries the contract.

PROJECT DEPTH
Boundaries are concrete. Repository instructions establish global rules; each SKILL.md declares purpose, inputs, tools, read/write limits, procedure, validation, outputs, failures, approvals, and dependencies. A workflow that needs a capability outside its contract must stop or hand off to the owner.

Gates are also evidence, not conversational courtesy. Clarification records the resolved request. Policy evaluation records whether an action is allowed, denied, or waiting for approval. Workflow state distinguishes running, blocked, approval-wait, failed, and completed. Completion is therefore a state supported by validation, not a reassuring sentence from the model.

Composition means one skill owns each decision. For example, audit-code discovers findings, audit-review-findings corroborates them, audit-plan-remediation orders confirmed work, and audit-remediation performs only an approved plan. Memory is carried by reports/current-execution-state.json, reports/execution-log.jsonl, policy decision records, and reports/project-handoff.json.

EVIDENCE TO REFERENCE
.github/copilot-instructions.md contains the repository engagement rules. Any SKILL.md demonstrates the contract structure. reports/current-execution-state.json and reports/project-handoff.json show how state survives beyond chat. schemas/clarification-result.schema.json shows that even the initial scope decision has a machine-readable contract.

AUDIENCE PROMPT
Ask: Where does your team currently store the rules for what an AI assistant may do? Pause for one or two answers. If nobody answers, offer examples: a wiki, tribal knowledge, pull-request habits, or nowhere explicit.

TRANSITION
Rather than only tell you that the repository can carry this operating model, the next slide lets the project explain itself from its own evidence.

IF YOU NEED MORE TIME
Contrast policy documents with executable controls. A policy says what should happen. A governed workflow also records ownership, stop conditions, validation, and the evidence needed to claim completion.
'@
    3 = @'
TIME TARGET: 5 minutes

OPENING
This is a useful test of the idea: can the project use its own evidence to explain what it does?

WALK THE SLIDE
The slide intentionally contains one action and one provenance statement. “Watch” is the user experience. “Built from verified project evidence” is the trust claim that must be explained. The local-playback labels show that this artifact can be demonstrated without making publication or hosted-service claims.

DEMO ACTION
Select “Watch: Built by Project Orchestrator.” The linked presentation is generated from repository evidence. Let it play without talking over the main narration.

BEFORE PLAYBACK
Explain that the artifact is self-contained and intended for local playback. Its claims are grounded in project reports rather than improvised marketing copy. The project-video workflow separates planning, evidence, narration approval, rendering, and final verification.

AFTER PLAYBACK
Call out what the audience just saw: not only a visual asset, but a governed chain from project understanding to claims, narration, media, and checksums. The exact media is historical evidence, so current version and test claims come from the live repository rather than being silently relabeled.

PROJECT DEPTH
The project-video workflow begins by rebuilding project understanding and the canonical project guide. It classifies proposed statements as verified, inferred, planned, mock, unverified-runtime, or unsupported. A claims ledger ties narration to repository-relative evidence before any voice or rendering stage is allowed.

Production paths are deliberately separate. A browser preview can use browser speech but cannot be called a rendered video. Azure Speech can produce approved narration only after current discovery and preflight evidence. Local Piper is an explicitly approved offline alternative. FFmpeg performs final local assembly. Each provider, approval, asset, digest, and output is recorded so the result can be verified later.

The media linked from this archived deck is an earlier version and must remain labeled that way. That is a feature of the evidence model: a polished artifact does not become current merely because it still plays.

EVIDENCE TO REFERENCE
.github/skills/project-video/SKILL.md defines the claims ledger, provider boundaries, approval stages, and output verification. reports/project-understanding.json supplies source facts. reports/project-video/ contains plans and manifests. Demo/project-skills-orchestrator-animation.html is the local fallback.

AUDIENCE PROMPT
Ask: What would you need to trust an automatically generated project update or executive summary? Listen for source links, dates, owners, checks, and explicit limitations.

TRANSITION
Now that we have seen the outcome, let's open the hood and look at the control plane that lives with the code.

IF PLAYBACK IS SLOW
Explain the fallback hierarchy: prebuilt local media first, the animated HTML companion second, and verbal walkthrough third. Do not troubleshoot on stage for more than about 30 seconds. Continue with: “The important point is the evidence chain, and we can inspect that directly.”

IF YOU NEED MORE TIME
Discuss why generated media should preserve provenance. A polished video can become misleading when the code changes; versioned manifests and archived labels prevent an old asset from masquerading as current proof.
'@
    4 = @'
TIME TARGET: 5 minutes

OPENING
Project Orchestrator is a control plane that lives with the code, not a separate portal the team has to keep synchronized.

WALK THE SLIDE
Move through the five boxes from left to right and name the artifact at each handoff. Intent is the request. Router selects ownership. Workflow supplies ordered execution. Policy decides whether work may continue. Evidence determines what can truthfully be claimed. The small labels below each box show the mechanism, not a separate product tier.

CORE STORY
Walk left to right. Intent enters as natural language or a slash command. The router uses clear skill descriptions and ownership boundaries to select the right workflow. The workflow executes bounded skills and declared dependencies. Policy pauses for clarification, risk acceptance, or approval. Evidence lands in reports validated by schemas.

Emphasize the separation of concerns. Routing is not execution. Planning is not approval. Approval is not validation. A successful command is not automatically evidence that the intended outcome is correct.

The repository contains the instructions, skill contracts, profiles, schemas, workflow state, and reports. That makes the behavior reviewable in the same place as the code. Teams can diff a policy change, test a schema, review a workflow, and preserve a handoff.

PROJECT DEPTH
The router is description-driven and ownership-aware. It uses the trigger language in skill metadata to choose one owner, then follows declared dependencies rather than asking one general agent to improvise the sequence. Profiles in config/profiles.yaml are dependency-closed, and tests reject cycles or missing prerequisites.

Policy and state are separate because permission and progress answer different questions. policy-engine evaluates authorization, risk, and escalation. workflow-state-manager maintains deterministic state transitions, checkpoints, pause/resume behavior, and terminal outcomes. This separation makes denied approval different from execution failure and makes interrupted work recoverable.

Evidence is schema-backed. JSON is authoritative because automation can validate it; Markdown is the human-readable view. Accepted event-stream records are append-only. A report with missing required fields or stale lineage cannot support a success claim.

TECHNICAL DEPTH
The runtime is registry-free and built on Node.js built-ins. Managed writes use canonical path checks, symbolic-link rejection, destination-state hashes, locks, transaction journals, backups, rollback, and recovery. Current supported Node majors are 22, 24, and 26.

EVIDENCE TO REFERENCE
.github/skills/project-skills-orchestrator/SKILL.md owns routing. .github/skills/policy-engine/SKILL.md owns decisions. .github/skills/workflow-state-manager/SKILL.md owns live state. config/profiles.yaml defines profile composition. schemas/ and reports/ show the machine contract and its current evidence.

AUDIENCE PROMPT
Ask the architects: Which box is usually missing in your current AI-assisted development flow? Give them a moment to choose intent, routing, workflow, policy, or evidence.

TRANSITION
A control plane becomes real when it can enter an empty, existing, or remote repository safely. That is the adoption story.

IF YOU NEED MORE TIME
Explain why repository ownership matters: project rules travel with branches, pull requests, code review, and local development instead of depending on one administrator's memory or one external dashboard.
'@
    5 = @'
TIME TARGET: 4 minutes

OPENING
There are three entry points, but they converge on one governed baseline.

WALK THE SLIDE
Compare the three columns before following the arrow along the bottom. New starts from an empty destination. Existing starts from project-owned content that must be preserved. Remote adds an untrusted clone and staging boundary. The common five-step footer is the invariant across all three paths.

CORE STORY
For a new project, create-project establishes the workspace, selected stack, profile, editor support, CI wiring, skills, schemas, and reports. It deliberately leaves the application boundaries empty; the team builds the application inside the governed foundation.

For an existing project, adopt begins with a dry run. It detects what already exists, identifies equivalent coverage, preserves project-owned instructions, and proposes only missing framework assets. Rerunning should become a no-op when nothing changed.

For a remote repository, clone-setup uses isolated staging. It clones, provisions, validates, and only then publishes the destination. Credential-bearing URLs are rejected, and repository-provided setup commands are not executed during inspection.

Follow the bottom sequence: verify source, resolve profile, apply transaction, validate installation, hand off. Every mutating path is designed to be transactional and rerunnable.

PROJECT DEPTH
Create-project establishes the governed workspace but intentionally does not invent the business application. It creates empty source and test boundaries so subsequent work happens inside an installed operating model.

Adopt is preservation-first. Its dry run inventories existing instructions, workflows, editor configuration, and stack signals, then proposes only the missing managed assets. Before apply, canonical path and symbolic-link checks prevent writes from escaping the project root. Destination hashes detect drift between plan and execution.

Clone-setup adds isolated staging because remote repository content is untrusted. It rejects credential-bearing URLs, does not execute repository-provided setup commands during inspection, applies the framework in staging, validates it, and only then publishes the destination. Failed validation leaves the intended destination unpublished.

Transactions use an exclusive lock, a pre-write journal, backups, atomic replacement, rollback, and a recovery path. Rerunning against an unchanged governed project should produce no unnecessary mutation.

EVIDENCE TO REFERENCE
pso.mjs implements create-project, adopt, clone-setup, locking, journaling, and rollback. config/profiles.yaml defines core, durable, distributed, and advanced composition. reports/adoption-rerun-evidence.json demonstrates rerunnable behavior. tests/adoption-rerun.test.mjs protects it.

AUDIENCE PROMPT
Ask: Which entry point would your team use first: a new project, an existing repository, or a remote onboarding flow? Use the answer to give one concrete example.

TRANSITION
Once the baseline exists, users should ask for outcomes instead of manually sequencing every governance step. That is where routing and composition take over.

IF YOU NEED MORE TIME
Describe the durable profile: it adds continuity, recovery, audit remediation, artifact upgrade, and Azure cleanup capabilities on top of the core profile. Profiles are dependency-closed, so selecting a capability also includes its prerequisites.
'@
    6 = @'
TIME TARGET: 5 minutes

OPENING
The user asks for the outcome. The graph determines the governed path.

WALK THE SLIDE
Read the sentence in the request box, then pause at every arrow. Each colored stage has a different responsibility and a different output. The three labels at the bottom are graph-level guarantees: no cycles, no missing prerequisites, and no success when a required stage is blocked.

CORE STORY
Use the example on screen: “Audit this repo and give me a remediation plan.” That is not one opaque action. The request is clarified, audited, reviewed, and converted into sequenced remediation work. Each stage has a different owner and artifact.

Clarification resolves material ambiguity once. Audit performs read-only evidence collection. Review corroborates findings without softening evidence. Planning orders confirmed work by prerequisites, containment, severity, impact, confidence, and complexity. Remediation is a later, separately approved workflow.

Explain the three guarantees at the bottom. Acyclic means dependency declarations cannot form circular chains. Dependency-closed means every profile includes the prerequisites of its selected skills. Fail-closed means missing evidence, denied approval, stale state, or failed validation cannot be reported as success.

TECHNICAL DEPTH
The audit chain binds immutable evidence, findings, review, remediation planning, and execution to one audit run identifier and content digests. Historical schemas remain readable, while current assurance requires the stronger contract.

PROJECT DEPTH
The selected audit-code skill does far more than run a scanner. It establishes local Git scope, captures immutable evidence, runs the pinned specialist secret scanner over required scopes, selects language-specific checks, builds a standards applicability matrix, and records completed, partial, blocked, failed, or not-applicable coverage.

Findings are one-per-root-cause and carry stable AUD identifiers, reproducible evidence, impact, likelihood, confidence, resolution direction, and verification criteria. Security severity is kept separate from maintainability or quality concerns. The skill cannot mutate source and cannot claim universal security.

Review then checks that every finding is preserved and explained. Planning can consume only the validated review, not raw findings. The same auditRunId and content digests bind evidence, findings, review, and remediation plan. If an artifact changes or a finding disappears, audit-validate rejects the chain.

EVIDENCE TO REFERENCE
.github/skills/audit-code/SKILL.md defines the full audit floor and read-only boundary. Its audit-evidence.mjs and gitleaks-scan.mjs helpers create deterministic evidence. reports/code-audit-findings.json, reports/code-audit-review.json, and reports/audit-remediation-plan.json show the current chain. audit-validate.mjs checks lineage.

AUDIENCE PROMPT
Ask: In your current process, who verifies that a remediation plan still corresponds to the exact findings that were reviewed? Explain that digest and run binding make that relationship machine-checkable.

TRANSITION
The same principles apply not only to workflows, but also to creating specialized agents. Let's look at Agent Builder.

IF YOU NEED MORE TIME
Walk through a failure case: if review omits a finding, planning must stop; if a prerequisite fails, dependent remediation remains incomplete; if the worktree drifts during resume, recovery analysis is required.
'@
    7 = @'
TIME TARGET: 5 minutes

OPENING
Agent Builder gives us two ways to design an agent, but only one governed installation path.

WALK THE SLIDE
Compare the two top paths, then converge on the four numbered stages. Guided changes where requirements come from; autonomous-research changes how evidence is gathered. Neither changes the validation, approval, or transactional-install requirements shown at the bottom.

CORE STORY
Guided mode starts from known requirements: role, purpose, scope, tools, instructions, and approval policy. Autonomous-research mode gathers bounded read-only evidence first, then proposes a blueprint. Research does not expand permissions and does not authorize publication.

Follow the numbered flow. Define the role and scope. Ground it in requirements or evidence. Validate least privilege and references. Install transactionally only after the reviewed plan is accepted.

The blueprint and plan are strict data contracts. Tool capabilities are portable and intentionally limited. Destination drift is checked before and during apply. Existing agents receive transaction backups. Invocation graphs are checked for cycles. Credentials are rejected as parameters.

The important design choice is that the agent definition is reviewable before installation. We can see what tools it has, what it is supposed to do, when it must stop, and which handoffs it may request.

PROJECT DEPTH
Agent Builder first decides whether an agent is even the correct primitive. A reusable procedure may belong in a skill; a repeatable invocation may belong in a prompt; a broad repository rule may belong in instructions. An agent is appropriate when the work needs a distinct role and tool boundary.

The blueprint declares agent type, focused role, triggers, constraints, output contract, capabilities, invocation policy, subagents, handoffs, autonomy policy, and optional publication intent. Portable capabilities are intentionally coarse: read, search, web, edit, execute, agent, and todo. Autonomous-research agents are restricted to read, search, and web.

Rendering and installation are separate. The plan exposes the complete rendered agent, hashes, destination state, warnings, and publication intent. Apply revalidates those inputs immediately before an atomic write. Existing destinations are backed up, and post-write validation must match the reviewed rendered hash.

This capability is still marked draft with low confidence. Present it as a governed preview with tested contracts, not as a generally available publishing product.

EVIDENCE TO REFERENCE
.github/skills/agent-builder/SKILL.md is the owning contract. schemas/agent-blueprint.schema.json and schemas/agent-builder-plan.schema.json define the data model. .github/skills/agent-builder/scripts/agent-builder.mjs implements validate, render, plan, and apply. tests/agent-builder.test.mjs covers least privilege, paths, drift, and rollback behavior.

AUDIENCE PROMPT
Ask: What is the smallest tool set an accessibility reviewer, security reviewer, or documentation agent actually needs? Use the answer to reinforce least privilege.

TRANSITION
Creating the local agent is one boundary. Publishing or connecting it to an external platform is another boundary entirely.

IF YOU NEED MORE TIME
Explain the distinction between an agent instruction file and a hosted agent runtime. Agent Builder can prepare a governed local definition and publication intent, but platform-specific workflows own external creation, identity, networking, and deployment.
'@
    8 = @'
TIME TARGET: 4 minutes

OPENING
Publication intent is planning data. It is never permission to publish.

WALK THE SLIDE
Treat each destination column as a different trust boundary, not as three buttons offered by Agent Builder. The repeated “hand off after approval” wording is the point. The footer states the ownership limit: Agent Builder records intent and readiness but creates no external resource.

CORE STORY
Walk through the three destinations. Microsoft Foundry can own a managed endpoint through its dedicated workflow. Microsoft 365 Copilot and Teams require separate Activity Protocol, Bot Service, tenant, and distribution work. A ChatGPT integration is indirect: a separately governed Custom GPT calls an HTTPS/OpenAPI Action.

Agent Builder records the intended destination, prerequisites, readiness gaps, and handoff. It creates no external resource. This separation prevents a local design command from silently creating endpoints, changing tenant settings, or sharing an agent.

Highlight “Hand off after approval.” Approval belongs at the mutation boundary, after scope, cost, identity, data handling, and rollback are visible.

AZURE GOVERNMENT CONTEXT
Government-cloud readiness fails closed when service availability, channel support, authorization, region, or data-boundary evidence is unknown. Commercial availability is not evidence of Azure Government availability.

PROJECT DEPTH
For a Foundry endpoint, the publishing workflow must select an active latest or pinned agent version and configure Microsoft Entra authorization; Agent Builder does not activate or deploy it. For Microsoft 365 Copilot and Teams, the direct Foundry publication path adds Activity Protocol, Azure Bot Service, audience scope, provider readiness, permissions, and tenant approval. For ChatGPT, the integration is indirect through a separately governed Custom GPT and HTTPS/OpenAPI Action.

Those distinctions matter because identity, data flow, administrative authority, rollback, and public exposure differ by platform. A reviewed local agent definition proves none of those external conditions. Publication planning can identify what is missing without contacting or mutating the destination.

In Azure Government, azure-discovery must establish current cloud-specific availability before recommending a target. A successful discovery is still only evidence of availability. It does not authorize resource creation, deployment, tenant configuration, sharing, or cost.

EVIDENCE TO REFERENCE
The publication section of .github/skills/agent-builder/SKILL.md defines the three exact targets and handoffs. schemas/agent-blueprint.schema.json records publication intent. .github/skills/azure-discovery/SKILL.md owns current cloud and regional evidence. docs/THREAT-MODEL.md describes external trust boundaries.

AUDIENCE PROMPT
Ask: Which facts would you require before allowing an agent to move from a local definition to an externally reachable endpoint? Capture identity, audience, data classification, network exposure, monitoring, and rollback.

TRANSITION
Publication is one consequential action. The broader autonomy model keeps six classes of decisions under direct consent.

IF YOU NEED MORE TIME
Explain why planning can be autonomous while mutation remains gated. The system can research options and produce a reviewable proposal without purchasing, messaging, changing access, disclosing data, or deleting anything.
'@
    9 = @'
TIME TARGET: 4 minutes

OPENING
Autonomy is useful only when it remains bounded by consent.

WALK THE SLIDE
Move through all six numbered blocks and give one concrete example for each. Then point to the two statements below them: publication metadata is deliberately excluded from runtime instructions, and Azure Government readiness fails closed. Together they show that both agent behavior and deployment context have boundaries.

CORE STORY
Walk through the six mandatory gates with short examples. Purchases include paid services or orders. Bookings include reserving travel, time, or capacity. Messages include sending email or posting externally. Account security covers identity, permissions, credentials, and access controls. Sensitive disclosure covers protected or private information. Destructive actions include deletion, revocation, overwrite, and irreversible migration.

These gates remain mandatory in guided and autonomous-research modes. They also survive handoffs. A workflow cannot delegate to another agent to bypass a restriction.

Clarify that ordinary local reversible edits may be covered by an approved phase, but external, destructive, credential, deployment, publication, commit, and push actions still require their own point-of-action authorization when policy says so.

The Azure Government statement is intentionally strict. Unknown service, channel, authorization, or data-boundary evidence produces a blocked state, not a commercial-cloud fallback.

PROJECT DEPTH
Approval is evaluated at the consequential boundary, after the system can show the proposed action, target, affected data or identity, cost, and recovery implications. This avoids both extremes: asking for permission before useful planning exists, or treating broad project approval as permission for every later action.

The six classes are embedded in Agent Builder's schema 2.1 and 2.2 autonomy policy. Guided agents and autonomous-research agents preserve them. Autonomous research has an additional structural limit: it may use only read, search, and web capabilities. A handoff cannot erase the originating restrictions.

Publication metadata remains outside the rendered agent body so a planning record cannot become a runtime instruction to publish. Cloud evidence is similarly separated from authorization: discovering that a service exists does not grant permission to use it.

EVIDENCE TO REFERENCE
.github/skills/agent-builder/SKILL.md lists and validates the six classes. .github/skills/policy-engine/SKILL.md defines centralized decisions and escalation. schemas/agent-blueprint.schema.json encodes the autonomy policy. tests/agent-builder.test.mjs and tests/production-gates.test.mjs exercise the boundaries.

AUDIENCE PROMPT
Ask: Which of these six gates would your organization add to or subdivide? Mention production-data changes and legal or records-management review as common organization-specific additions.

TRANSITION
We have covered the operating model. Now we will use two prompts to create a governed project and build inside it.

IF YOU NEED MORE TIME
Use a concrete scenario: an agent may compare travel options autonomously, but booking is gated; it may draft an email, but sending is gated; it may propose role changes, but applying them is gated.
'@
    10 = @'
TIME TARGET: 15 minutes

OPENING
The live demo compresses the number of prompts, not the governance. Watch where the system verifies, hands off, and stops.

WALK THE SLIDE
Use the two large panels as the demo agenda. The dark panel establishes the operating model in a separate project. The light panel builds inside it. The arrow is the ownership handoff between source framework and generated application. The final sentence is the product boundary: Project Orchestrator starts the project; Copilot and the team create the application.

PRE-DEMO CHECK
Confirm `C:\repos\skills-orchestrator-demo` does not already exist. Keep credentials, tenant IDs, subscription IDs, tokens, keys, and device codes off screen. If the normal destination exists, do not delete it on stage; use the prepared test path or explain the preserved-project safety rule.

PROMPT 1: ESTABLISH
In Copilot Chat Agent mode in the Project Orchestrator source workspace, run:
`/demo-create-project --demo-date 2026-09-17`

WHILE IT RUNS
Explain that the source framework is creating a separate durable TypeScript/test project. It verifies installation, confirms 47 skills, includes Azure discovery and infrastructure scaffolding, copies the bounded build prompt, and opens a fresh temporary workspace identity so old browser tabs are not restored.

PROJECT DEPTH: PROMPT 1
The prompt resolves the date and destination, refuses to overwrite an existing folder, and calls the registry-free runtime with the durable profile. That profile includes the core lifecycle plus continuity, recovery, remediation, project memory, knowledge capture, and cleanup capabilities. Verification runs before the new window opens. The temporary .code-workspace file has a unique identity so VS Code does not restore stale tabs from an older demo while its window title remains recognizable.

WHEN THE NEW WINDOW OPENS
Accept Workspace Trust if prompted. Switch Chat to Agent mode. Point out that all application work now belongs to the new project; the source repository is no longer the mutation target.

PROMPT 2: BUILD
Run:
`/demo-web-app`

WHILE DISCOVERY OR BUILD RUNS
Narrate the stage instead of waiting silently. The workflow verifies it is in a generated project, checks installation evidence, establishes AzureUSGovernment context through discovery, validates the selected region, then builds and tests the application locally. Discovery is read-only and does not authorize deployment.

PROJECT DEPTH: PROMPT 2
The second prompt begins by checking the generated-project marker and authoritative installation evidence. Azure discovery resolves the AzureUSGovernment cloud and current regional capabilities without creating resources. Speech preflight requires a compatible existing resource and a credential available only to the process environment; credentials never enter the project reports or browser.

The application phase remains inside the generated repository. Source, tests, documentation, and local run evidence belong there, not in the Project Orchestrator launch pad. This ownership boundary is what lets the source framework remain stable while every generated application evolves independently.

SHOW THE APP
Use test mode first so the countdown is visibly moving. Then show the live schedule and the `?at=` override for before, during, and after phases. Mention that time formatting uses `America/Chicago` and phase logic is pure and unit tested. On the thank-you state, show the locally generated QR codes and readable contact links.

DEPLOYMENT GATE
When the workflow reaches Azure mutation, stop and read the proposed resource group, region, SKU, public endpoint, and expected cost boundary. Do not approve deployment unless this demo explicitly includes that approved step. A clean stop at approval is a successful governance demonstration.

EVIDENCE TO REFERENCE
.github/prompts/demo-create-project.prompt.md defines the first prompt and workspace handoff. The generated project receives demo-web-app.prompt.md for the second prompt. Demo/DEMO-DAY.md is the operational runbook. In the generated workspace, use its installation report, test output, and Azure discovery report as the authoritative evidence.

AUDIENCE PROMPT
Ask the room to identify where ownership moved from source framework to generated project, and where read-only work became a billable mutation.

RECOVERY IF SOMETHING FAILS
If authentication is unavailable, explain the fail-closed result and continue with the already-built local app or screenshots. If the server is not ready, do not open localhost early; wait for the listening confirmation. If a prompt stalls, summarize the expected artifact and continue to the next prepared checkpoint. Never troubleshoot credentials on screen.

TRANSITION
The final slide separates what landed and passed from what still needs evidence. That distinction is the point of the demo.
'@
    11 = @'
TIME TARGET: 5 minutes

OPENING
The last slide is about disciplined claims: what lands, what passed for this synchronized deck, and what remains blocked.

WALK THE SLIDE
Read the three columns as three different questions. What lands describes the product payload. What passed describes bounded validation at a specific point in time. What remains describes release evidence that tests cannot supply. The footer summarizes the standard applied to every claim: repository ownership, transactional change, explicit approval, and evidence before assertion.

CORE STORY
Start with what lands in the repository: instructions and skills, editor build and debug support, authoritative reports, and machine-readable schemas. These are the durable operating model.

Next, explain the validation column as historical evidence for this version 1.1.1 deck. Do not present these numbers as the current source count. Current source evidence is in the repository README and work-state reports. The important behavior is that the project records exact counts, versions, dates, and limitations instead of saying “everything is secure.”

Finish with the blockers. A passing local suite is not a production release. Trusted signing, an independent reviewer, artifact health and revocation evidence, and production verification remain separate gates. The repository currently publishes source, not a formal GitHub Release or package.

PROJECT DEPTH
The full npm run check gate is a composition of checks, not one test command. It syntax-checks pso.mjs, runs the repository security check, builds release artifacts, verifies the candidate, executes the focused Node.js test suites, and finishes with pso verify. A failure in any stage blocks the aggregate command.

The release manifest makes requirements independent of local success. It requires a trusted signature, independent review, Windows/Linux/macOS evidence, supported Node lines, SBOM and provenance artifacts, and operational roles for release, security response, and revocation. Its current releaseStatus remains blocked.

That separation protects the audience from a common category error. Unit and contract tests can demonstrate implemented behavior under tested conditions. They cannot provide independent assurance, establish a signing authority, prove operational adoption, or validate revocation in production.

EVIDENCE TO REFERENCE
package.json shows the exact npm run check composition. release/release-manifest.json records required artifacts, platforms, roles, and blockers. reports/skill-inventory.json records the current 45-skill catalog. SECURITY.md defines the support and reporting posture. README.md states that no formal GitHub Release or package is published.

SUMMARY
Project Orchestrator establishes a repository-owned baseline, routes outcomes through bounded workflows, preserves consent around consequential actions, validates the result, and leaves evidence that survives the conversation.

AUDIENCE PROMPT AND Q&A
Invite questions in three categories: adoption into an existing repository, building or publishing agents, and governance or security controls. If the room is quiet, use these starters:
- How does this preserve project-owned instructions?
- What happens when a workflow is interrupted?
- How are Azure Government assumptions handled?
- How would a team add its own approval class?
- What is the difference between source readiness and release readiness?

CLOSING
Thank the audience. Invite them to inspect the repository resources, run the verifier, and begin with a disposable or non-production project.

TRANSITION
Move from the formal presentation into open Q&A or the scheduled follow-up conversation.

IF YOU NEED MORE TIME
Return to one audience answer from slide 2 and map it to establish, orchestrate, or prove. Discuss the planned Live Chat Interaction concept as future planning-only work: a grounded voice/text guide that explains capabilities without silently taking actions.
'@
}

function Get-VisibleText($presentation) {
    $result = @()
    foreach ($slide in $presentation.Slides) {
        $parts = @()
        foreach ($shape in $slide.Shapes) {
            try {
                if ($shape.HasTextFrame -and $shape.TextFrame.HasText) {
                    $parts += $shape.TextFrame.TextRange.Text
                }
            } catch {}
        }
        $result += ($parts -join '|')
    }
    return $result
}

Copy-Item -LiteralPath $source -Destination $candidate
$application = $null
$presentation = $null
try {
    $application = New-Object -ComObject PowerPoint.Application
    $presentation = $application.Presentations.Open($candidate, $false, $false, $false)
    if ($presentation.Slides.Count -ne 11) { throw "Expected 11 slides, found $($presentation.Slides.Count)" }
    $visibleBefore = Get-VisibleText $presentation

    foreach ($number in 1..11) {
        $notesShape = $null
        foreach ($shape in $presentation.Slides.Item($number).NotesPage.Shapes) {
            try {
                if ($shape.PlaceholderFormat.Type -eq 2) {
                    $notesShape = $shape
                    break
                }
            } catch {}
        }
        if (-not $notesShape) { throw "Slide $number has no speaker-notes body placeholder" }
        $notesShape.TextFrame.TextRange.Text = $notes[$number].Trim()
    }

    $visibleAfter = Get-VisibleText $presentation
    if (Compare-Object $visibleBefore $visibleAfter) { throw 'Visible slide text changed while writing notes' }
    $presentation.Save()
    $presentation.Close()
    $presentation = $null
} finally {
    if ($presentation) { $presentation.Close() }
    if ($application) { $application.Quit() }
    [GC]::Collect()
    [GC]::WaitForPendingFinalizers()
}

$validationApp = $null
$validationDeck = $null
try {
    $validationApp = New-Object -ComObject PowerPoint.Application
    $validationDeck = $validationApp.Presentations.Open($candidate, $true, $true, $false)
    if ($validationDeck.Slides.Count -ne 11) { throw 'Saved candidate slide count changed' }
    foreach ($number in 1..11) {
        $body = $null
        foreach ($shape in $validationDeck.Slides.Item($number).NotesPage.Shapes) {
            try {
                if ($shape.PlaceholderFormat.Type -eq 2) {
                    $body = $shape.TextFrame.TextRange.Text
                    break
                }
            } catch {}
        }
        if (-not $body -or $body -notmatch 'TIME TARGET:' -or $body -notmatch 'TRANSITION') {
            throw "Slide $number notes are incomplete"
        }
    }
} finally {
    if ($validationDeck) { $validationDeck.Close() }
    if ($validationApp) { $validationApp.Quit() }
    [GC]::Collect()
    [GC]::WaitForPendingFinalizers()
}

Copy-Item -LiteralPath $candidate -Destination $source -Force
Remove-Item -LiteralPath $candidate -Force
Write-Output "Updated speaker notes for slides 1-11: $source"
