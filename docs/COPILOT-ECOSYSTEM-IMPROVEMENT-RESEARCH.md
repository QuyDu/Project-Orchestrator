# Copilot Ecosystem Improvement Design Research

> Status: research proposal, not an approved roadmap or implementation plan
>
> Assessment date: 2026-09-14
>
> Scope: Project Orchestrator runtime, governed skills, prompts, workflows, project templates, and Agent Builder. This research covers GitHub Copilot in Visual Studio Code, GitHub.com cloud agent, GitHub Copilot CLI, and relevant Visual Studio compatibility.

## Executive conclusion

Project Orchestrator already has a strong governance model: repository-owned instructions, 47 bounded skills, dependency-aware profiles, schema-backed reports, approval gates, transactional adoption, recovery, and an Agent Builder that produces least-privilege local agent definitions.

The highest-value improvements are now compatibility and quality improvements rather than rapid catalog growth:

1. Migrate prompt-owned workflows toward Agent Skills because prompt files are deprecated for VS Code Agent Host sessions.
2. Add a cross-surface compatibility contract for VS Code, Visual Studio, GitHub.com cloud agent, and Copilot CLI.
3. Expand Agent Builder to model current custom-agent fields, exact tool sources, host differences, hooks, models, and plugin packaging.
4. Add behavioral evaluation for skills, prompts, instructions, and agents instead of relying mainly on structural contract tests.
5. Add opt-in deterministic hooks for controls that must run regardless of model behavior.
6. Measure context size, tool count, cache reuse, latency, errors, and AI credit use so orchestration decisions can be evidence-based.
7. Improve developer-facing workflows by extending existing owners before creating overlapping skills.

The central design principle should be:

> Use instructions for durable guidance, skills for portable workflows, agents for roles and tool boundaries, tools or MCP for capabilities, hooks for deterministic enforcement, and plugins for governed distribution.

## Research method

This experiment compared current repository evidence with official documentation and maintained public examples.

Local evidence included:

- `reports/skill-inventory.json` and `reports/skill-details.json`
- `config/profiles.yaml`
- `.github/skills/`
- `.github/prompts/`
- generated-agent support in Agent Builder, its schemas and tests; the source repository does not currently contain a `.github/agents/` directory
- `templates/project/`
- `schemas/agent-blueprint.schema.json`
- `.github/skills/agent-builder/scripts/agent-builder.mjs`
- `tests/agent-builder.test.mjs` and `tests/skill-contracts.test.mjs`
- `docs/SKILL-ECOSYSTEM-AUDIT.md`
- `docs/THREAT-MODEL.md`

External evidence was read-only and access-dated 2026-09-14. Preview and experimental capabilities are identified as such and must not become required framework dependencies without separate review.

## Current strengths to preserve

- Registry-free Node.js runtime with no third-party runtime package graph.
- Repository-local source of truth for instructions, skills, schemas, reports, and workflow state.
- Single-owner routing and dependency-cycle checks.
- Explicit clarification, policy, approval, recovery, and handoff boundaries.
- Transactional project creation and adoption with canonical paths, backups, rollback, and rerun evidence.
- Structured Agent Builder blueprint, deterministic rendering, destination-drift checks, and atomic apply.
- Azure Government fail-closed behavior and opt-in MCP policy.
- Current test, security, release-candidate, and skill-contract gates.

Current lifecycle evidence is materially less mature than the structural catalog: 10 of 47 skills are `tested` with `medium` confidence, while 37 remain `draft` with `low` confidence. This makes behavioral evaluation a prerequisite for broad catalog expansion.

After this research was drafted, remote commit `10593c0` added `user-personalization` and the capability now named `project-visual-storytelling`, and expanded `linkedin-post`. These are delivered draft capabilities, not research candidates. They establish a local, Git-ignored profile of user-approved public-facing preferences and create project-grounded whiteboards or dioramas without publishing them. Future improvement planning should evaluate and promote these skills through CEI-004 rather than proposing a second personalization or visual-storytelling owner.

## Priority model

- **P0**: compatibility, safety, or quality foundation needed before broad feature expansion.
- **P1**: high developer value after P0 contracts exist.
- **P2**: useful specialization or scale feature that should be validated through demand and evaluation.
- **Extend**: enhance an existing owning skill or runtime surface.
- **Candidate new skill**: no exact current owner; must go through `skill-create`, duplicate analysis, and explicit approval before authoring.
- **Artifact or runtime feature**: belongs in templates, schemas, runtime, hooks, or packaging rather than a new skill.

## Capability status and adoption posture

| Capability | Observed status on 2026-09-14 | Recommended posture |
| --- | --- | --- |
| Agent Skills | Open, portable standard across VS Code, cloud agent, code review, Copilot CLI, and additional supported IDEs | Core investment; validate exact frontmatter and host support |
| Prompt files | Supported by VS Code Local and Visual Studio; deprecated and not loaded in VS Code Agent Host | Classify individually; migrate portable workflows to skills while retaining justified compatibility launchers |
| Forked skill context | Experimental in VS Code | Evaluate for long audits and research; do not require it |
| VS Code hooks | Preview; agent-scoped hooks are also Preview | Opt in behind versioned adapters and independent security review |
| GitHub cloud-agent and CLI hooks | Documented capability with a format that differs from VS Code naming and fields | Support only through a normalized model plus target-specific renderers |
| Agent Plugins 1.0 | Published open packaging standard; client-specific components remain namespaced | Prototype as an additional distribution path, not a replacement for transactional adoption |
| Agent Host and AHP | Available but explicitly under active development | Add compatibility and correlation first; avoid coupling authoritative state to unstable internals |
| Customization Evaluations and Waza integration | Separate VS Code extension in Preview | Optional evaluation adapter; no core runtime dependency |
| Copilot Memory | Public Preview | Advisory input only; repository evidence retains precedence |
| Agent sandboxing | Preview on macOS, Linux, and WSL2; not equivalent to native Windows coverage | Recommend where supported and preserve approval controls everywhere |
| Copilot automations | Available for eligible private/internal repositories; private to creator and not stored in Git | Plan-only integration until ownership, cost, visibility, and workflow-as-code controls are resolved |
| Visual Studio customizations | Instructions, prompts, agents, skills, MCP, planning, and approvals are supported; hooks and subagents are not | Generate a declared compatibility target with serial fallbacks and no false parity claims |

## Prioritized improvement portfolio

| ID | Priority | Improvement | Primary benefit | Recommended ownership |
| --- | --- | --- | --- | --- |
| CEI-001 | P0 | Prompt-to-skill migration and compatibility analyzer | Keeps workflows available in Agent Host, cloud agent, and CLI instead of depending on Local-agent prompt files | Extend `artifact-upgrade`, `framework-health-check`, and project templates |
| CEI-002 | P0 | Cross-surface capability matrix | Prevents generated customizations from silently losing fields, tools, or behavior between VS Code, Visual Studio, GitHub.com, and CLI | Extend `framework-health-check` and Agent Builder |
| CEI-003 | P0 | Agent Builder schema evolution | Supports current models, targets, argument hints, scoped hooks, host capabilities, tool names, and handoff differences without ad hoc rendering | Extend `agent-builder` through `skill-update` |
| CEI-004 | P0 | Customization behavioral evaluation lab | Measures whether instructions, skills, prompts, and agents produce the intended behavior, not merely valid files | Candidate new skill after `skill-create` duplicate review, plus tests |
| CEI-005 | P0 | Deterministic hook framework | Enforces security checks, validation, state capture, and audit logging even when the model forgets an instruction | Artifact/runtime feature integrated with `policy-engine` and templates |
| CEI-006 | P0 | Tool provenance and permission planner | Makes least privilege concrete by recording exact tools, source, host support, approval mode, and data boundary | Extend Agent Builder and `policy-engine` |
| CEI-007 | P0 | Context and cost telemetry | Reduces latency, AI credit use, and context dilution using measured token, cache, tool, and retry evidence | Extend `workflow-telemetry` |
| CEI-008 | P0 | Copilot cloud-agent environment readiness | Lets cloud agents build and test deterministically instead of discovering setup through trial and error | Extend `development-environment-readiness` and project templates |
| CEI-009 | P1 | Agent Plugin 1.0 packaging path | Makes governed skills portable and installable as a versioned bundle across VS Code and Copilot CLI | Extend `skill-registry`, release tooling, and Agent Builder |
| CEI-010 | P1 | Customization diagnostics command | Quickly explains why an instruction, skill, agent, prompt, tool, hook, or MCP server was skipped or ignored | Extend `framework-health-check` |
| CEI-011 | P1 | Agent Host and persistent-session integration | Aligns Project Orchestrator state with long-running, reconnectable, local or remote Agent Host sessions | Extend `workflow-state-manager` and `workflow-recovery` |
| CEI-012 | P1 | Governed coordinator-and-worker agent teams | Uses isolated specialist contexts and narrower tools while preventing unbounded fan-out and ownership collisions | Extend Agent Builder and `multi-agent-coordinator` |
| CEI-013 | P1 | Evidence-based model routing | Selects the least expensive model that consistently meets quality requirements for each bounded role | Extend Agent Builder and `workflow-scheduler` |
| CEI-014 | P1 | Adaptive clarification policy experiment | Reduces repetitive friction and credit use for low-risk prompts while preserving mandatory clarification for material ambiguity and consequential actions | Evaluate before any change to `clarify-the-ask` |
| CEI-015 | P1 | Context curator and freshness checker | Keeps instructions concise, detects contradictions, and prevents stale architecture or commands from polluting every request | Extend `project-understanding`, `documentation-builder`, and health checks |
| CEI-016 | P1 | Copilot Memory governance bridge | Reconciles cited Copilot memories with repository evidence without allowing memory to override current instructions or source | Extend `project-memory` |
| CEI-017 | P1 | MCP governance and portability matrix | Preserves opt-in MCP while validating allowlists, tool annotations, auth, host support, version pins, and capability changes | Extend environment readiness, policy, and security review |
| CEI-018 | P1 | Issue readiness and implementation brief workflow | Produces bounded tasks with acceptance criteria, affected areas, validation, and risk before delegation | Extend `clarify-the-ask` and `workflow-planner`; avoid a duplicate generic planner |
| CEI-019 | P1 | Developer code-tour mode | Speeds onboarding and feature investigation with audience-specific, source-linked tours rather than generic repository summaries | Extend `project-understanding` or consider a narrowly scoped new skill |
| CEI-020 | P1 | Refactor planning mode | Exposes hidden coupling, contract order, verification checkpoints, and rollback before multi-file refactoring | Extend `workflow-planner` |
| CEI-021 | P1 | Test strategy and quality matrix | Finds behavioral, abuse, accessibility, integration, and negative-test gaps before writing individual regression tests | Extend `regression-test-development`; consider a planning mode |
| CEI-022 | P1 | Browser acceptance and accessibility workflow | Verifies actual user journeys, responsive states, keyboard use, and console errors instead of relying on source inspection | Candidate new skill or web-profile extension after duplicate analysis |
| CEI-023 | P2 | Prompt and instruction optimizer | Converts vague requests into bounded, testable prompts and identifies contradictory or overloaded instructions | Candidate new skill only if evaluation shows existing clarification and health checks are insufficient |
| CEI-024 | P2 | Session-to-skill knowledge extraction | Turns repeated successful procedures into reviewed skill candidates while requiring provenance, confidence, and duplicate checks | Extend `project-knowledge-capture` and `skill-create` |
| CEI-025 | P2 | PR feedback convergence workflow | Batches review feedback, classifies fix-versus-decline decisions, reruns focused validation, and prevents endless review loops | Extend `change-review`, `prepare-commit`, and `ci-failure-triage` |
| CEI-026 | P2 | Safe Copilot automation planner | Designs scheduled or event-driven cloud-agent work with least-privilege tools, untrusted-event filtering, budget, and review gates | Candidate new planning skill; no automation creation in the planning skill |
| CEI-027 | P2 | Visual Studio compatibility profile | Gives .NET and Windows teams an explicit subset for Visual Studio agent mode, skills, prompts, instructions, MCP, and planning differences | Extend `project-setup` and `development-environment-readiness` |
| CEI-028 | P2 | Curated external skill intake | Imports only reviewed, pinned, licensed, nonduplicative external skills with provenance, security scanning, and local behavioral tests | Extend `skill-registry`, `dependency-maintenance`, and `skill-create` |

## Delivery sizing and maintenance risk

These are planning estimates, not commitments. A small item is usually one existing owner and one contract surface; medium affects several related artifacts; large changes runtime or cross-surface contracts and requires migration evidence.

| Size and risk | Candidates | Main cost driver |
| --- | --- | --- |
| Small / low-to-medium | CEI-010, CEI-018, CEI-019, CEI-020, CEI-021, CEI-023 | Focused skill modes, diagnostics, fixtures, and documentation |
| Medium / medium | CEI-001, CEI-002, CEI-007, CEI-008, CEI-014, CEI-015, CEI-016, CEI-024, CEI-025, CEI-027 | Cross-artifact validation, templates, evaluation data, and compatibility maintenance |
| Large / medium-to-high | CEI-003, CEI-004, CEI-005, CEI-006, CEI-009, CEI-011, CEI-012, CEI-013, CEI-017, CEI-022, CEI-026, CEI-028 | Schema evolution, host adapters, executable controls, external trust, multi-agent behavior, or new ownership |

## Planning mode ownership matrix

| User intent | Owner or mode | Required output | Must not overlap |
| --- | --- | --- | --- |
| General multi-step feature or change | `workflow-planner` default | Executable workflow plan with owners, gates, validation, and recovery | Issue formatting, audit remediation, or schema migration |
| Delegation-ready issue or brief | Proposed issue-readiness mode | Concise requirements, acceptance criteria, affected areas, risk, and verification | Full execution sequencing |
| Behavior-preserving structural change | Proposed refactor mode | Coupling map, compatibility stages, callers, tests, cleanup, and rollback | New feature design or artifact version migration |
| Coverage design before tests are written | Proposed test-strategy mode | Requirement/risk-to-test matrix and test-layer plan | Implementing a specific regression test |
| Known defect or requested behavior needs a durable test | `regression-test-development` | Red-green test evidence | General coverage planning |
| Schema or artifact version changes | `artifact-upgrade` | Migration, compatibility, backup, validation, and rollback plan | Generic refactor mode |
| Confirmed audit findings | `audit-plan-remediation` | Prioritized remediation plan bound to reviewed findings | Generic workflow planning from raw findings |

## Detailed findings and benefits

### CEI-001: Prompt-to-skill migration and compatibility analyzer

**Problem:** Project Orchestrator and its generated projects still ship important `.prompt.md` workflows. Current VS Code guidance states that prompt files are deprecated for Agent Host sessions and are not loaded there. Skills remain available across VS Code, cloud agent, and Copilot CLI.

As of 2026-09-14, the official [VS Code prompt-file documentation](https://code.visualstudio.com/docs/agent-customization/prompt-files) states that prompt files are deprecated for Agent Host sessions, are not loaded by Agent Host, and should be converted to Agent Skills for continued availability. This is a host-compatibility warning, not a claim that prompt files have no current value in the Local agent or Visual Studio.

The current source repository contains 10 active prompt files, and the generated-project template contains eight. CEI-001 must classify each one individually. Until that analysis is approved and completed, these prompts remain current Local-agent or Visual Studio conveniences rather than deprecated files to delete automatically.

**Improvement:** Inventory every prompt and classify it as one of:

- a portable workflow that should become a skill;
- a thin Local-agent launcher for an existing skill;
- a UI convenience that remains a prompt with an explicit compatibility warning;
- obsolete duplication that should be removed after migration.

Provide dry-run migration, frontmatter-loss warnings, duplicate detection, and parity tests. Keep compatibility launchers only where they add real Local-agent value.

**Benefits:**

- Prevents workflows from disappearing when developers move to Agent Host.
- Increases portability to Copilot cloud agent and CLI.
- Reduces duplicated prompt and skill content.
- Makes progressive loading available for long workflows.
- Clarifies whether slash commands are stable capabilities or client-specific conveniences.

**Acceptance evidence:** Every shipped prompt has a declared compatibility class; migrated workflows have behavior-parity fixtures; generated projects do not rely on a prompt file for an Agent Host-critical capability.

### CEI-002: Cross-surface capability matrix

**Problem:** Copilot surfaces support different features. For example, VS Code supports subagents and preview hooks, Visual Studio supports skills but not subagents or hooks, GitHub.com ignores VS Code handoff and argument-hint fields, and MCP behavior differs by host.

**Improvement:** Add a versioned matrix for VS Code Local, VS Code Agent Host, Visual Studio, GitHub.com cloud agent, Copilot code review, and Copilot CLI. Validate every generated instruction, skill, agent, prompt, hook, and MCP configuration against its declared targets.

**Benefits:**

- Prevents silent field loss and false portability claims.
- Lets Agent Builder warn before a selected target ignores handoffs, tools, or metadata.
- Makes platform-specific fallbacks reviewable.
- Gives enterprise adopters a clear support contract.
- Reduces support incidents caused by surface-specific behavior.

**Acceptance evidence:** A deterministic validator reports supported, ignored, preview, unsupported, and fallback behavior for every customization field and target surface.

### CEI-003: Agent Builder schema evolution

**Problem:** Agent Builder already supports least-privilege capability aliases, user/model invocation flags, subagent allowlists, reviewed handoffs, autonomy policy, Azure context, and publication intent. Schema 2.2 does not currently contain a model field, execution-surface target, argument hint, agent-scoped hooks, host-specific MCP declaration, exact tool or tool-set declaration, or handoff model selection. `agentType` describes `copilot`, `foundry-prompt`, or `foundry-hosted`; it is not a VS Code, Visual Studio, GitHub.com, or CLI compatibility target.

**Improvement:** Design a backward-compatible Agent Blueprint revision with explicit portable and host-specific sections. Candidate fields should model an optional `argumentHint`, a surface `targets` array, a model policy containing selection mode and ordered fallbacks, exact tool references plus portable aliases, optional host-scoped hooks and MCP references, and an optional handoff model. Keep `send: false` as the safe default and require a stronger policy decision before any auto-submitted handoff. Render only fields supported by the selected target.

**Benefits:**

- Produces agents that match current Copilot capabilities.
- Avoids manual edits after Agent Builder apply.
- Preserves least privilege with exact tool selection.
- Makes model cost and fallback policy reviewable.
- Prevents unsupported metadata from being mistaken for enforced behavior.

**Acceptance evidence:** Round-trip tests cover VS Code, GitHub.com, CLI, and Visual Studio target profiles; unknown or ignored fields generate explicit warnings; legacy blueprint versions remain readable.

### CEI-004: Customization behavioral evaluation lab

**Problem:** Current tests are strong on structure, schemas, packaging, paths, and governance contracts. They do not systematically test whether a skill is selected for the right request, whether instructions change behavior as intended, whether an agent stays in role, or whether a prompt produces the expected result across representative runs.

**Improvement:** Add versioned evaluation cases for routing, refusal, tool use, output shape, error paths, and cross-customization conflicts. Integrate deterministic fixtures first, then optionally support the preview Chat Customizations Evaluations extension and Waza without making either a required runtime dependency.

**Benefits:**

- Converts lifecycle promotion from opinion into evidence.
- Detects trigger collisions and instructions that are valid but ineffective.
- Measures regressions when models or VS Code behavior change.
- Supports confidence scores grounded in repeated outcomes.
- Enables safe optimization of prompts, tools, and models.

**Acceptance evidence:** Every promoted skill has positive, negative, neighboring-trigger, blocked-path, and output-contract cases with recorded pass rates and environment metadata.

**Current urgency:** 37 of 47 skills remain `draft` with `low` confidence. CEI-004 is therefore a release-quality foundation, not an optional test enhancement.

### CEI-005: Deterministic hook framework

**Problem:** Instructions ask the model to follow required behavior. Hooks can enforce behavior outside model reasoning at session, prompt, tool, compaction, subagent, and stop events.

**Improvement:** Add opt-in, reviewed hook templates for:

- `PreToolUse`: canonical path, protected file, dangerous command, and policy checks;
- `PostToolUse`: focused validation and redacted evidence capture;
- `PreCompact`: preserve workflow ID, decisions, blockers, and next action;
- `SubagentStart` and `SubagentStop`: lease and evidence correlation;
- `Stop`: verify terminal state and produce a concise handoff.

Hook scripts must validate untrusted JSON input, avoid shell interpolation, redact secrets, run quickly, and remain protected from agent edits.

**Benefits:**

- Turns critical guidance into deterministic enforcement.
- Closes gaps when a model forgets a step.
- Improves auditability of tool and subagent activity.
- Preserves state before context compaction.
- Creates a clean bridge between VS Code lifecycle events and Project Orchestrator policy/state artifacts.

**Acceptance evidence:** Hooks are disabled by default, independently reviewed, cross-platform where supported, time-bounded, injection-tested, and covered by deny/ask/allow fixtures. Unsupported hosts receive no false enforcement claim.

### CEI-006: Tool provenance and permission planner

**Problem:** Agent Builder models seven portable capability aliases. Current Copilot supports built-in tools, exact MCP tools, MCP server wildcards, extension tools, and tool sets. Tool availability and approval are separate, and unrecognized tools may be ignored.

**Improvement:** Record exact tool identity, provider, transport, data boundary, read/write classification, host support, approval eligibility, secret requirements, and fallback behavior. Resolve aliases only at render time for the selected host.

**Benefits:**

- Makes least privilege verifiable instead of descriptive.
- Detects ignored or unavailable tools before runtime.
- Prevents a broad MCP server wildcard when one read-only tool is sufficient.
- Improves threat modeling for external tool results and prompt injection.
- Helps administrators compare local, extension, and cloud tool boundaries.

**Acceptance evidence:** Plans show the resolved tool set per host; every external tool has provenance and approval metadata; missing tools fail closed or use an explicitly reviewed fallback.

### CEI-007: Context and cost telemetry

**Problem:** The framework records workflow telemetry but does not currently optimize Copilot context, cache reuse, tool count, retries, duration, and AI credit consumption as one feedback loop.

**Improvement:** Add optional ingestion of redacted Agent Debug Log summaries and OpenTelemetry exports. Measure representative tasks before and after changing instructions, models, tool sets, or delegation. Never collect prompt/source payloads by default.

**Benefits:**

- Finds oversized always-on instructions and noisy context.
- Identifies tool catalogs that harm selection or cache stability.
- Routes simple tasks to lower-cost models without sacrificing quality.
- Quantifies whether subagent isolation saves or wastes credits.
- Gives teams a defensible cost and latency story.

**Acceptance evidence:** Metrics include quality outcome, reliability, duration, credits, tokens, tool calls, retries, errors, and cache reuse; sensitive fields are excluded; optimization retains only changes that preserve the quality threshold.

### CEI-008: Copilot cloud-agent environment readiness

**Problem:** Generated projects configure local VS Code development well but do not ship a governed `copilot-setup-steps.yml` path for GitHub cloud agent. Cloud agents otherwise discover setup through nondeterministic trial and error.

**Improvement:** Let development-environment-readiness generate or assess an optional pinned, least-privilege cloud-agent setup workflow. Validate runner, runtime, dependency install, timeout, firewall, secrets/variables boundary, and code-review environment behavior.

**Benefits:**

- Improves cloud-agent build and test success.
- Reduces wasted session time and retries.
- Makes runner and network assumptions explicit.
- Supports Windows-specific projects without pretending the default Ubuntu environment is equivalent.
- Provides reproducible evidence before delegating issues.

**Acceptance evidence:** Setup runs successfully as an ordinary workflow, uses pinned actions, minimal permissions, no embedded secrets, and a timeout no greater than the cloud-agent maximum.

### CEI-009: Agent Plugin 1.0 packaging

**Problem:** Project Orchestrator currently installs its framework directly into repositories. Agent Plugins 1.0 provides a portable package for skills and MCP servers, with Copilot-specific agents and hooks under a client namespace.

**Improvement:** Prototype a signed or digest-pinned plugin package without replacing transactional project adoption. Treat plugins as an additional distribution mode with provenance, license, version, integrity, compatibility, enable/disable, and rollback evidence.

**Benefits:**

- Simplifies discovery and optional capability installation.
- Makes curated subsets easier to distribute.
- Supports VS Code and Copilot CLI from one package.
- Separates portable skills from Copilot-specific agents and hooks.
- Creates a standards-based path toward a governed internal marketplace.

**Acceptance evidence:** Reproducible plugin build, schema validation, content manifest, source pin, signature plan, collision analysis, uninstall/rollback test, and no implicit MCP or hook trust.

### CEI-010: Customization diagnostics command

**Problem:** Developers need to know whether a customization was found, applied, ignored, shadowed, unsupported, stale, or contradictory. Current framework verification does not consume VS Code customization diagnostics or Agent Debug discovery events.

**Improvement:** Add a read-only doctor that combines local file validation with optional exported diagnostics. It should explain precedence, glob mismatches, name/directory mismatches, deprecated locations, prompt incompatibility, tool absence, and host-specific ignored fields.

**Benefits:**

- Shortens time spent debugging ignored instructions and skills.
- Makes precedence and source visible.
- Detects silent skill-load failures caused by invalid names.
- Helps support VS Code, Visual Studio, cloud agent, and CLI from one report.
- Improves confidence before rollout.

**Acceptance evidence:** Fixtures reproduce each failure class and the doctor returns one actionable cause with evidence rather than generic troubleshooting advice.

### CEI-011: Agent Host and persistent-session integration

**Problem:** VS Code Agent Host owns reconnectable local or remote sessions, multiple chats, worktree changes, and immutable action streams. Project Orchestrator owns workflow IDs, events, checkpoints, and recovery, but does not map these models explicitly.

**Improvement:** Define a nonbinding correlation contract between Agent Host session/chat IDs and Project Orchestrator workflow/run/step IDs. Use hooks or exported metadata where available; never depend on unstable transcript formats.

**Benefits:**

- Improves pause, resume, and cross-window continuity.
- Makes session-level work easier to reconcile with repository-level evidence.
- Supports remote execution without losing ownership boundaries.
- Reduces duplicate work after compaction or reconnect.
- Enables safer multi-session coordination.

**Acceptance evidence:** A resumed session can locate the correct workflow state without fuzzy matching; stale or mismatched worktrees block; deleting or archiving a session does not silently delete authoritative project evidence.

### CEI-012: Governed coordinator-and-worker agent teams

**Problem:** Agent Builder can declare subagents, and the framework includes draft scheduler/coordinator skills, but it does not yet generate a complete least-privilege coordinator/worker set using current invocation controls and model routing.

**Improvement:** Add a reviewed team blueprint with hidden worker agents, explicit `agents` allowlists, maximum depth/fan-out, file ownership leases, per-role tools, budget, convergence criteria, and independent review. Default to one coordinator layer; nested subagents remain opt-in.

**Benefits:**

- Keeps research, implementation, and review contexts focused.
- Enables parallel independent analysis without mixing edits.
- Uses cheaper models for bounded worker tasks.
- Prevents accidental invocation of similarly named agents.
- Strengthens independent review and conflict control.

**Acceptance evidence:** Tests cover allowed and denied delegation, depth and burst limits, ownership conflicts, worker failure, budget exhaustion, and deterministic synthesis.

### CEI-013: Evidence-based model routing

**Problem:** Current Agent Builder does not model preferred models or fallbacks. Official guidance recommends comparing representative tasks because the cheapest model can become more expensive through retries and rework.

**Improvement:** Add model policy to agent blueprints and evaluation records. Support auto selection, ordered fallback, quality threshold, cost tier, and task class without hardcoding transient model names into core policy.

**Benefits:**

- Matches reasoning models to planning and debugging.
- Uses faster models for repetitive bounded work.
- Survives model retirement through reviewed fallbacks.
- Makes cost-quality trade-offs measurable.
- Prevents workers from silently selecting a model above the parent cost tier.

**Acceptance evidence:** Repeated representative evaluations record completion, quality, reliability, duration, and credits; routing chooses the lowest-cost option meeting the required threshold.

### CEI-014: Adaptive clarification policy experiment

**Problem:** The repository currently requires a fixed clarification round for every prompt. This is highly explicit but creates friction for trivial questions and follow-ups, and can increase context and credit use.

**Improvement:** Do not immediately remove the current rule. First evaluate three modes: mandatory, ambiguity-triggered, and risk-tiered. Define low risk as a read-only or locally reversible request with a concrete target, no external access, no security or privacy consequence, no cost, and no cross-system mutation. Preserve mandatory questions for unclear, consequential, external, destructive, security-sensitive, cost-bearing, or cross-system work.

**Benefits:**

- Reduces unnecessary interruption for low-risk requests.
- Preserves strong controls where mistakes matter.
- Lowers repetitive context and latency.
- Produces evidence for whether the current strict policy improves outcomes.
- Makes clarification proportional without turning ambiguity into permission to guess.

**Acceptance evidence:** A representative suite compares misunderstanding rate, correction turns, blocked unsafe actions, user-rated usefulness, completion time, rework, and credits. Reduced questioning is acceptable only when misunderstanding and rework do not increase and every consequential-action gate remains effective. Any policy change requires separate approval because this is a repository-wide behavioral contract.

### CEI-015: Context curator and freshness checker

**Problem:** Instructions, project guides, handoffs, reports, and memory can overlap. Excessive always-on context dilutes focus and reduces cache stability; stale context causes incorrect decisions.

**Improvement:** Produce a concise context manifest that classifies facts by scope, authority, freshness, and activation. Detect contradictions and recommend moving task-specific material from always-on instructions into scoped instructions or skills.

**Benefits:**

- Gives agents critical facts without context dumping.
- Reduces repeated repository exploration.
- Improves prompt caching and response relevance.
- Makes stale commands and architecture claims visible.
- Clarifies which artifact wins when sources conflict.

**Acceptance evidence:** Every always-on statement has a reason to be global; volatile facts include freshness; contradictions are reported; no authoritative machine report is copied into a second competing source.

### CEI-016: Copilot Memory governance bridge

**Problem:** Copilot Memory can store cited repository facts and user preferences, while Project Orchestrator has its own project-memory contract and stricter precedence. The two can drift or duplicate one another.

**Improvement:** Add a read-only reconciliation mode that classifies Copilot Memory as advisory external context. Require current repository citations before promoting a fact into project-owned knowledge. Never copy user preferences across users or billing entities.

**Benefits:**

- Reuses validated discoveries without surrendering repository authority.
- Prevents stale memory from overriding current code or instructions.
- Preserves privacy and ownership boundaries.
- Reduces repeated onboarding work.
- Gives users a deletion and conflict-resolution path.

**Acceptance evidence:** Source and expiry are recorded; repository evidence always outranks memory; unsupported, user-private, or stale memories are rejected.

### CEI-017: MCP governance and portability matrix

**Problem:** MCP is optional in Project Orchestrator, which should remain true. When enabled, local IDE, Agent Host, Visual Studio, cloud agent, code review, and CLI use different files, auth behavior, approval semantics, and feature subsets.

**Improvement:** Validate MCP configuration per surface. Require exact tool allowlists, read-only annotations for code review, version or commit pins, trust-change detection, secret references, transport and auth support, and target-cloud boundaries. Never auto-install a server from research alone.

**Benefits:**

- Preserves least privilege across different hosts.
- Prevents local success from being mistaken for cloud-agent compatibility.
- Reduces supply-chain and rug-pull risk.
- Makes prompt-injection and external-data review explicit.
- Maintains the user's opt-in policy while improving readiness when MCP is actually requested.

**Acceptance evidence:** Each server has provenance, pin, owner, tools, annotations, secret boundary, supported hosts, and revocation path; unsupported OAuth or prompts/resources are reported per surface.

### CEI-018: Issue readiness and implementation brief workflow

**Problem:** Cloud agents work best from bounded issues with acceptance criteria, affected areas, and validation. Workflow Planner can plan known intent but does not expose a concise issue-readiness artifact optimized for delegation.

**Improvement:** Add a planner mode that turns clarified intent into an implementation brief with observable acceptance criteria, exclusions, likely files, test commands, risk, dependencies, and the right execution surface.

**Benefits:**

- Improves first-pass implementation quality.
- Reduces broad or ambiguous cloud-agent tasks.
- Makes issue descriptions reusable as prompts.
- Supports human and agent implementers equally.
- Prevents unnecessary plans for trivial work through risk sizing.

**Acceptance evidence:** Briefs pass completeness checks and are tested against representative tasks for lower correction rate and higher validation success.

**Routing constraint:** Issue-readiness mode applies only when the requested output is a delegation-ready issue or implementation brief. It must not activate for a full executable workflow plan, audit remediation plan, refactor migration plan, or test strategy.

### CEI-019: Developer code-tour mode

**Problem:** Project Understanding creates a complete repository guide. Developers also need short, task-specific tours: new joiner, feature explainer, bug fixer, reviewer, or operator.

**Improvement:** Add a bounded tour mode that references symbols, entry points, call paths, tests, configuration, and extension points without rewriting the full guide.

**Benefits:**

- Accelerates onboarding.
- Helps developers find the correct change surface.
- Improves review quality through explicit invariants and risk areas.
- Reuses authoritative understanding while avoiding a competing project guide.
- Provides a natural entry point for Live Chat Interaction later.

**Acceptance evidence:** Tours are audience-specific, source-linked, short, current-revision bound, and contain no unsupported architecture claim.

### CEI-020: Refactor planning mode

**Problem:** Generic workflow planning can miss hidden coupling and migration ordering specific to refactors.

**Improvement:** Add a refactor mode that maps contracts and types, implementations, callers, tests, compatibility shims, cleanup, and rollback in that order. Require a focused check between phases.

**Benefits:**

- Reduces large-bang refactors.
- Exposes behavioral compatibility and migration hazards.
- Keeps refactoring separate from unrelated cleanup.
- Makes rollback practical.
- Produces reviewable slices for parallel work.

**Acceptance evidence:** Plans identify affected contracts and callers, intermediate compatible states, validation per phase, and explicit removal criteria for temporary shims.

**Routing constraint:** Refactor mode applies only when preserving behavior while changing structure across multiple files or modules. New feature design remains generic workflow planning; schema or artifact version changes remain owned by `artifact-upgrade`.

### CEI-021: Test strategy and quality matrix

**Problem:** Regression Test Development is strong for a known behavior or defect. It is not a full test-planning owner for identifying which unit, integration, contract, browser, accessibility, abuse, failure, and recovery tests a feature needs.

**Improvement:** Add a planning mode that maps risks and acceptance criteria to test layers, data, environments, oracles, and failure evidence before individual tests are written.

**Benefits:**

- Prevents coverage theater.
- Finds missing negative and abuse paths.
- Avoids over-mocking the behavior being claimed.
- Clarifies which tests belong locally, in CI, or in a deployed environment.
- Produces a clean handoff to regression-test-development.

**Acceptance evidence:** Every test maps to a requirement or risk, names the observable result, and distinguishes deterministic local evidence from environment-dependent validation.

**Routing constraint:** Test-strategy mode plans coverage before tests exist. Reproducing a known defect or implementing a specific durable test remains owned by `regression-test-development`; executing an existing suite alone is not a planning workflow.

### CEI-022: Browser acceptance and accessibility workflow

**Problem:** The current catalog lacks a dedicated browser acceptance owner. Modern VS Code browser tools can exercise user flows, capture screenshots and console logs, and verify responsive behavior.

**Improvement:** Evaluate a web-profile skill that runs a defined journey across desktop and mobile sizes, checks keyboard and screen-reader-relevant behavior, captures failures, and reruns after repair. Use built-in browser tools where available; provide an explicit unsupported fallback elsewhere.

**Benefits:**

- Validates the application users actually experience.
- Detects visual overlap, broken navigation, console failures, and inaccessible controls.
- Produces reproducible evidence for frontend work.
- Complements source-level review and unit tests.
- Improves demo reliability.

**Acceptance evidence:** Stable user-centered locators, deterministic test data, representative viewports, accessibility checks, screenshot evidence, and no claim of full accessibility conformance from automation alone.

### CEI-023: Prompt and instruction optimizer

**Problem:** Vague prompts, overloaded instructions, contradictions, and duplicated context reduce response quality. Existing clarification resolves user intent but does not evaluate customization quality as a product artifact.

**Improvement:** First incorporate these checks into CEI-004 and CEI-010. Create a separate skill only if repeated demand remains. Analyze specificity, inputs, expected output, examples, validation, ambiguity, conflicts, activation scope, and context cost.

**Benefits:**

- Improves reusable prompt quality.
- Reduces corrective turns.
- Detects instructions that should be deterministic hooks.
- Encourages examples and observable acceptance criteria.
- Avoids creating another generic planning owner.

**Acceptance evidence:** Before-and-after evaluation demonstrates improved task completion without increasing unsafe autonomy or instruction size disproportionately.

### CEI-024: Session-to-skill knowledge extraction

**Problem:** Useful procedures discovered in sessions can disappear, while automatic extraction can preserve mistakes or create duplicates.

**Improvement:** Let project-knowledge-capture propose a candidate from successful, validated sessions. Route every candidate through inventory, duplicate analysis, provenance review, confidence labeling, and `skill-create` approval.

**Benefits:**

- Converts proven team practices into reusable workflows.
- Reduces repeated problem solving.
- Retains validation evidence and known failure modes.
- Prevents unreviewed chat content from becoming policy.
- Keeps the skill catalog demand-driven.

**Acceptance evidence:** A candidate requires multiple successful examples or equivalent strong evidence, cites its source sessions and validations, and cannot install itself.

### CEI-025: PR feedback convergence workflow

**Problem:** Agent-created pull requests often require several review cycles. Processing comments one at a time wastes sessions and can create conflicting fixes.

**Improvement:** Batch feedback, classify each item as fix, clarify, decline with rationale, or defer, then apply one bounded iteration and rerun the relevant checks. Set time, iteration, and unresolved-finding limits.

**Benefits:**

- Reduces noisy review loops.
- Preserves reviewer intent across related comments.
- Prevents endless autonomous retries.
- Makes declined recommendations explicit.
- Improves time to a reviewable change set.

**Acceptance evidence:** Every comment receives a disposition and evidence; iteration limits stop safely; new failures return to triage rather than being hidden.

### CEI-026: Safe Copilot automation planner

**Problem:** Copilot automations can run on schedules or repository events, but their configuration is not versioned with the repository, is private to the creator, incurs Actions and AI credit cost, and introduces prompt-injection risk.

**Improvement:** Create a plan-only capability that produces a review checklist and proposed automation configuration without creating the automation. Include trigger trust, tool allowlist, cost budget, attribution, review path, stop conditions, and replacement with versioned agentic workflows where appropriate.

**Benefits:**

- Makes unattended work reviewable before activation.
- Prevents overbroad tools and untrusted triggers.
- Clarifies cost ownership.
- Preserves human review of generated pull requests.
- Provides a path to auditable workflow-as-code alternatives.

**Acceptance evidence:** No automation is created by the planner; high-risk triggers fail closed; proposed tools are minimal; budget and owner are explicit.

### CEI-027: Visual Studio compatibility profile

**Problem:** The framework is optimized for VS Code. Visual Studio supports custom instructions, prompt files, custom agents, Agent Skills, MCP, planning, tool approval, and checkpoints, but lacks VS Code subagents and hooks and has solution-specific tooling.

**Improvement:** Add an explicit Visual Studio compatibility target for .NET and Windows projects, rather than immediately adding another conformance profile to `config/profiles.yaml`. Generate only supported artifacts, document Visual Studio and version prerequisites, use `.mcp.json` compatibility carefully, and preserve a VS Code target for richer orchestration. Where VS Code would use subagents, Visual Studio should use a serial plan, implementation, and review handoff until equivalent subagent support is verified. Where VS Code would use hooks, Visual Studio should report the control as unavailable and rely on normal tool approvals and repository validation rather than claiming deterministic enforcement.

**Benefits:**

- Expands value to Visual Studio teams without false parity claims.
- Uses language-aware `find_symbol`, debugger, profiler, and test capabilities.
- Avoids shipping hooks or subagent workflows that Visual Studio ignores.
- Supports solution-scoped approval and review practices.
- Improves .NET developer onboarding.

**Acceptance evidence:** Matrix-tested on declared Visual Studio versions; unsupported features have a documented alternative; no VS Code-only setting is presented as enforced in Visual Studio.

### CEI-028: Curated external skill intake

**Problem:** Public catalogs provide valuable patterns, but copying skills directly can introduce duplicate ownership, unsafe scripts, licensing issues, stale dependencies, or hidden tool assumptions.

**Improvement:** Add an intake path that inventories the candidate, verifies license and provenance, pins a commit, scans scripts and dependencies, compares triggers and outputs, runs local evaluation, and chooses reject, adapt, extend, or install.

**Benefits:**

- Reuses proven community work safely.
- Avoids catalog duplication.
- Preserves attribution and license obligations.
- Prevents silent supply-chain expansion.
- Makes upgrades and revocation manageable.

**Acceptance evidence:** Every imported artifact has source SHA, license, owner, review record, local tests, dependency impact, and rollback/revocation path.

## Recommended roadmap

### Phase 0: Compatibility and measurement

1. CEI-001 prompt-to-skill migration analysis.
2. CEI-002 cross-surface capability matrix.
3. CEI-004 behavioral evaluation foundation.
4. CEI-010 customization diagnostics.
5. CEI-007 baseline context and cost measurements.

**Why first:** These changes establish what currently works, where it works, and how quality is measured. They reduce the risk of building new features on deprecated or untested assumptions.

### Phase 1: Agent Builder modernization

1. CEI-003 Agent Builder schema revision.
2. CEI-006 exact tool and permission planning.
3. CEI-013 evidence-based model routing.
4. CEI-012 coordinator-and-worker blueprints.
5. CEI-017 MCP governance matrix.

**Why second:** Agent Builder should model the current Copilot surface before it expands publication or multi-agent features.

### Phase 2: Deterministic and portable execution

1. CEI-005 opt-in hook framework.
2. CEI-008 cloud-agent environment readiness.
3. CEI-009 Agent Plugin 1.0 packaging prototype.
4. CEI-011 Agent Host state correlation.
5. CEI-028 curated external skill intake.

**Why third:** Hooks, plugins, remote sessions, and cloud execution increase reach and risk. They should consume the compatibility, policy, and evaluation work from earlier phases.

### Phase 3: Developer workflow improvements

1. CEI-018 issue readiness.
2. CEI-019 developer code tours.
3. CEI-020 refactor planning.
4. CEI-021 test strategy.
5. CEI-022 browser acceptance and accessibility.
6. CEI-025 PR feedback convergence.

**Why fourth:** These provide direct developer value while mostly extending existing owners. Each can be evaluated against real tasks before a new skill ID is introduced.

### Phase 4: Learning and scale experiments

1. CEI-014 adaptive clarification experiment.
2. CEI-015 context curator.
3. CEI-016 Copilot Memory bridge.
4. CEI-023 prompt optimizer decision.
5. CEI-024 session-to-skill extraction.
6. CEI-026 automation planner.
7. CEI-027 Visual Studio profile.

**Why last:** These depend on reliable measurements, clear precedence, privacy controls, or demonstrated user demand.

## Best first experiment

Run a bounded compatibility and evaluation spike, not a broad implementation:

1. Select five representative current workflows: project start, systematic debugging, change review, audit planning, and Agent Builder.
2. Test each in VS Code Local, VS Code Agent Host, and one cloud-agent or CLI surface where authorized.
3. Record discovery, selected skill, loaded instructions, available tools, completion quality, duration, tool calls, errors, context tokens, cache reuse, and credits.
4. Identify which prompt files disappear, which agent fields are ignored, and which skills need invocation controls or forked context.
5. Use those results to scope CEI-001 through CEI-004.

This spike should produce evidence before any schema migration or new skill is approved.

## Useful developer workflow candidates

The following are useful, but should be implemented by extending existing owners where possible:

- **Issue readiness:** turn vague work into bounded, testable delegation.
- **Code tour:** explain a feature, call path, or subsystem to a specific audience.
- **Refactor plan:** map coupling, compatibility, phases, and rollback before edits.
- **Test strategy:** map requirements and risks to the correct test layers.
- **Browser acceptance:** verify user journeys, responsive behavior, and accessibility evidence.
- **PR convergence:** batch review feedback and stop bounded fix/review loops.
- **Customization doctor:** explain why an instruction, agent, skill, hook, prompt, or tool did not apply.
- **Customization evaluator:** measure routing, behavior, tool use, errors, and output quality.
- **Context curator:** keep always-on context concise, authoritative, and fresh.
- **External skill intake:** safely review, adapt, pin, and test shared skills.

## Immediately useful developer prompt patterns

These examples are usable today with existing skills. Tool names differ by Copilot surface, so prompts describe capabilities rather than assuming one exact client tool ID.

| Goal | Prompt pattern | Existing owner | Benefit |
| --- | --- | --- | --- |
| Understand a feature | `Trace how [user action] flows through the repository. Name entry points, state changes, external calls, tests, failure paths, and extension points. Do not edit files.` | `project-understanding` for full scans; ordinary read-only exploration for a bounded feature | Replaces broad code dumping with a task-specific mental model |
| Prepare an implementation plan | `/workflow-planner --proceed Plan [outcome]. Include scope, owners, dependencies, acceptance criteria, focused validation, approvals, rollback, and recovery. Do not implement.` | `workflow-planner` | Aligns approach before code is written |
| Debug a failure | `/systematic-debugging --proceed Reproduce [failure], isolate one falsifiable root-cause hypothesis, make the smallest repair, and rerun the focused check.` | `systematic-debugging` | Prevents speculative patching and broad unrelated edits |
| Add regression coverage | `/regression-test-development --proceed Reproduce [behavior] with the narrowest durable automated test, capture red-green evidence, and preserve existing test semantics.` | `regression-test-development` | Proves the defect and protects the fix |
| Review current changes | `/change-review --proceed Review the exact working-tree diff for correctness, security, requirement gaps, and missing tests. Findings first; do not edit.` | `change-review` | Gives a bounded, severity-ranked pre-merge review |
| Plan a refactor | `/workflow-planner --proceed Plan a behavior-preserving refactor of [surface]. Map contracts, implementations, callers, tests, compatible intermediate states, cleanup, and rollback.` | Current generic planner; proposed CEI-020 mode | Exposes hidden coupling before multi-file changes |
| Design a test strategy | `/workflow-planner --proceed Map [feature] requirements and risks to unit, integration, contract, browser, accessibility, abuse, and recovery tests. Name observable pass criteria.` | Current generic planner; proposed CEI-021 mode | Prevents shallow coverage and over-mocking |
| Triage hosted CI | `/ci-failure-triage --proceed Analyze [run or PR], identify the first actionable failure, reproduce locally when possible, repair only that cause, and rerun the narrow check.` | `ci-failure-triage` | Reduces symptom-driven CI changes |
| Maintain dependencies | `/dependency-maintenance --proceed Assess [package or scope] for advisories, provenance, compatibility, lockfile effects, and tests. Present the update boundary before mutation.` | `dependency-maintenance` | Balances security updates with compatibility and supply-chain evidence |
| Review architecture | `/architecture-review --proceed Assess the repository-defined architecture for reliability, security, cost, operations, and performance. Cite evidence and trade-offs; do not query live resources.` | `architecture-review` | Produces design-time findings without confusing them with deployed posture |
| Build a custom agent | `Use agent-builder to design a [role]. First decide whether an instruction, skill, prompt, agent, hook, or tool is the narrowest primitive. Use the smallest tool set and stop before apply.` | `agent-builder` | Avoids overpowered agents and wrong customization types |
| Prepare a commit decision | `/prepare-commit --proceed Review the bounded change evidence, validation, exclusions, and residual risk. Produce a commit summary but do not commit or push.` | `prepare-commit` | Creates a clean human decision point before source mutation |

## Recommended least-privilege tool bundles

| Workflow | Capabilities to enable | Keep disabled unless required | Benefit |
| --- | --- | --- | --- |
| Planning and architecture | Repository read, semantic/text search, symbol usages, optional approved web fetch, todo | Edit, execute, external mutation | Prevents planning from silently becoming implementation |
| Debugging | Problems/diagnostics, test-failure context, read/search/usages, terminal for focused reproduction | Broad web and unrelated external tools | Grounds fixes in runtime and language evidence |
| Code review | Diff/change context, read/search/usages, diagnostics, test-result reads | Edit and execute by default | Preserves reviewer independence |
| Web acceptance | Terminal for the local server, integrated browser or approved Playwright tools, screenshots, page text, console logs | Production endpoints and unrestricted network | Verifies observable user behavior safely |
| GitHub issue or PR work | Exact read-only GitHub issue, PR, checks, and code-search tools | Repository administration, secrets, releases, merges, and broad `github/*` | Limits hosted access to the task |
| Agent creation | Read/search, schemas, deterministic Agent Builder validator and renderer | MCP installation, deployment, publication | Keeps agent design local and reviewable |
| Isolated research | Subagent or forked skill context, read/search, approved web tools | Edit and recursive delegation by default | Protects parent context and limits fan-out |
| Deterministic enforcement | Reviewed hook scripts with narrow event input and short timeout | Editable hook scripts, shell interpolation, unrestricted network | Runs mandatory checks outside model discretion |
| Visual Studio investigation | `find_symbol`, debugger, profiler, test tools, read-only MCP as needed | Unsupported VS Code hooks and subagent assumptions | Uses solution-aware language and runtime evidence |

Tool availability never implies approval. External URLs, MCP results, repository content, issue text, and browser content remain untrusted inputs. Prefer exact tools over server-wide wildcards, and preserve manual approval for consequential actions.

## Agent Builder-specific shortlist

The most valuable Agent Builder updates are:

1. Add target-surface profiles and ignored-field warnings.
2. Add model and ordered fallback policy.
3. Add exact tool, tool-set, MCP, and extension-tool resolution.
4. Add optional agent-scoped hooks with a separate security review.
5. Add `argument-hint` and target-aware rendering.
6. Model user-only, model-only, and coordinator-allowlisted invocation explicitly.
7. Add coordinator/worker team blueprints with depth, fan-out, lease, and budget limits.
8. Add behavioral evaluation before lifecycle promotion.
9. Add Plugin 1.0 packaging and provenance planning.
10. Add a primitive-selection wizard that recommends instruction, skill, agent, tool/MCP, hook, or plugin before building anything.

## Ideas not recommended as immediate new skills

- A second generic planning skill. Extend Workflow Planner with issue, refactor, and test-strategy modes.
- A generic agent-team skill that duplicates the scheduler, coordinator, policy, and state owners.
- Automatic MCP installation. Preserve explicit opt-in and separate trust approval.
- Automatic plugin marketplace installation. Require provenance and review first.
- Automatic extraction of every successful chat into a skill. Require repeated evidence and duplicate checks.
- Replacing deterministic reports with Copilot Memory. Memory remains advisory.
- Making preview hooks mandatory. Unsupported hosts and changing schemas require opt-in adoption.
- Enabling Autopilot or global tool approval by default. Session-scoped manual permissions remain the safe baseline.
- Assuming VS Code, Visual Studio, GitHub.com, and CLI implement identical fields or approval semantics.

## Cross-cutting safeguards

- **Activation conflicts:** CEI-004 must test neighboring triggers, while CEI-010 explains which customization won and why.
- **Silent skips and warnings:** CEI-002 and CEI-010 report unsupported fields, invalid names, deprecated locations, glob mismatches, and unavailable tools.
- **Prompt injection and tool misuse:** CEI-005, CEI-006, and CEI-017 validate tool inputs, separate URL request and response trust, and preserve explicit external-action approval.
- **Cross-skill context leakage:** CEI-001, CEI-002, and CEI-015 minimize always-on material, use progressive loading, and isolate long research where supported.
- **Runaway delegation:** CEI-012 limits depth, fan-out, budgets, and ownership, and keeps one synthesis owner.
- **Quality regression:** CEI-004 evaluates behavior before lifecycle promotion and after model, host, schema, or instruction changes.

## Deprecation, rollback, and revocation

Every accepted improvement should include an exit path before rollout:

1. Mark the capability experimental or draft and keep it out of required profiles until evidence supports promotion.
2. Record the replacement, migration command, compatibility period, owner, and removal criteria before deprecating an artifact.
3. During migration, read legacy formats but write only the current format; reject ambiguous dual-authority state.
4. Remove deprecated skills from profile activation before deleting their source, and preserve historical report/schema readers where audit evidence requires them.
5. Use `skill-registry` for lifecycle promotion, deprecation, retirement, and revocation proposals; use `artifact-upgrade` for schema and record migration.
6. For Agent Builder, retain the reviewed plan, destination hash, and backup so a failed apply restores the prior agent definition.
7. For plugins, disable first, verify dependent workflows, then uninstall; retain source pin, manifest, and revocation reason.
8. For MCP, disable the server and revoke credentials independently; reset approvals when capabilities or tool lists change.
9. For hooks, disable configuration before removing scripts and verify that no policy claim still depends on the hook.
10. If a promoted skill regresses, lower its lifecycle/confidence, remove it from required conformance, preserve the finding, and restore the last validated version through the normal update transaction.

## Risks and controls

| Risk | Control |
| --- | --- |
| Preview APIs change | Version capability evidence, isolate adapters, and keep preview features opt-in |
| Catalog expansion creates duplicate owners | Run skill inventory and trigger/output comparison before every new skill |
| Hooks execute unsafe code | Review scripts, validate JSON input, protect hook files, avoid interpolation, set short timeouts |
| MCP or plugins expand supply-chain trust | Require source pins, provenance, licenses, tool allowlists, scanning, and revocation |
| Model routing optimizes cost over correctness | Define quality thresholds first and compare repeated representative runs |
| Telemetry leaks prompts or source | Collect redacted aggregate metrics by default; review exports before sharing |
| Multi-agent work conflicts | Use worktree isolation, ownership leases, bounded fan-out, and one synthesis owner |
| Memory or context becomes stale | Require citations, freshness, precedence, and deletion paths |
| Cloud automation acts on untrusted events | Default to trusted actors, minimal tools, draft outputs, and human review |
| Cross-IDE claims become misleading | Validate each artifact against an access-dated support matrix |

## Research limitations

- No preview extension, Waza binary, plugin, MCP server, hook, cloud agent, automation, or external skill was installed or executed.
- No Azure resource or service was queried. Azure Government support remains subject to current discovery evidence when an Azure-dependent implementation is later considered.
- Public examples were used as patterns, not trusted dependencies or proof of quality.
- Official pages and preview behavior can change after the assessment date.
- No recommendation authorizes implementation, skill creation, schema migration, deployment, publication, commit, push, purchase, or external mutation.
- The existing `docs/SKILL-ECOSYSTEM-AUDIT.md` remains useful historical evidence but predates Agent Host prompt deprecation, Agent Plugins 1.0, current hooks, current session orchestration, and customization evaluation guidance.

## Sources

Official sources accessed 2026-09-14:

- https://code.visualstudio.com/docs/agents/concepts/customization
- https://code.visualstudio.com/docs/agent-customization/overview
- https://code.visualstudio.com/docs/agent-customization/custom-instructions
- https://code.visualstudio.com/docs/agent-customization/prompt-files
- https://code.visualstudio.com/docs/agent-customization/custom-agents
- https://code.visualstudio.com/docs/agent-customization/agent-skills
- https://code.visualstudio.com/docs/agent-customization/hooks
- https://code.visualstudio.com/docs/agent-customization/agent-plugins
- https://code.visualstudio.com/docs/agents/concepts/agent-host
- https://code.visualstudio.com/docs/agents/run/tools
- https://code.visualstudio.com/docs/agents/run/approvals
- https://code.visualstudio.com/docs/agents/run/subagents
- https://code.visualstudio.com/docs/agents/run/sessions/manage-sessions
- https://code.visualstudio.com/docs/agents/run/planning
- https://code.visualstudio.com/docs/agents/run/security
- https://code.visualstudio.com/docs/agents/guides/context-engineering-guide
- https://code.visualstudio.com/docs/agents/guides/optimize-usage
- https://code.visualstudio.com/docs/agents/agent-troubleshooting/chat-debug-view
- https://code.visualstudio.com/docs/agents/agent-troubleshooting/cache-explorer
- https://docs.github.com/en/copilot/reference/customization-cheat-sheet
- https://docs.github.com/en/copilot/reference/custom-agents-configuration
- https://docs.github.com/en/copilot/concepts/agents/about-agent-skills
- https://docs.github.com/en/copilot/concepts/agents/hooks
- https://docs.github.com/en/copilot/concepts/agents/copilot-memory
- https://docs.github.com/en/copilot/concepts/agents/cloud-agent/about-cloud-agent
- https://docs.github.com/en/copilot/concepts/agents/cloud-agent/about-automations
- https://docs.github.com/en/copilot/how-tos/copilot-on-github/customize-copilot/customize-cloud-agent/customize-the-agent-environment
- https://docs.github.com/en/copilot/how-tos/copilot-on-github/customize-copilot/configure-mcp-servers
- https://docs.github.com/en/copilot/reference/copilot-cli-reference/cli-plugin-reference
- https://learn.microsoft.com/en-us/visualstudio/ide/copilot-agent-mode?view=visualstudio
- https://learn.microsoft.com/en-us/visualstudio/ide/copilot-chat-context?view=visualstudio
- https://learn.microsoft.com/en-us/visualstudio/ide/mcp-servers?view=visualstudio

Public pattern sources accessed 2026-09-14:

- https://github.com/github/awesome-copilot
- https://github.com/agentskills/agentskills
- https://github.com/agentplugins/agent-plugins-spec

Public examples inform candidate selection only. Any imported content requires independent license, provenance, security, duplication, and behavior review.
