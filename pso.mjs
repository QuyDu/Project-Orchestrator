#!/usr/bin/env node
import { appendFile, cp, lstat, mkdir, open, readFile, readdir, realpath, rename, rm, rmdir, stat, writeFile } from "node:fs/promises";
import { existsSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { createInterface } from "node:readline/promises";
import { createHash, randomUUID } from "node:crypto";
import { spawn, spawnSync } from "node:child_process";
import { setTimeout as delay } from "node:timers/promises";

const VERSION = "1.1.2";
const FRAMEWORK_VERSION = "9.0.0";
const RISK_ACCEPTANCE_VERSION = "1.0.0";
const DIGEST_ALGORITHM = "sha256-normalized-text-v1";
const PROJECT_MANIFEST_SCHEMA_VERSION = "1.1.0";
const PROJECT_LOCK_SCHEMA_VERSION = "1.0.0";
const PROJECT_LOCK_PATH = "project-orchestrator.lock.json";
const PROJECT_UPDATE_PLAN_SCHEMA_VERSION = "1.0.0";
const PROJECT_UPDATE_SELECTION_SCHEMA_VERSION = "1.0.0";
const SCRIPT_ROOT = path.dirname(fileURLToPath(import.meta.url));
const SUPPORTED_NODE_MAJORS = new Set([22, 24, 26]);
const PROFILES = new Set(["core", "durable", "distributed", "advanced"]);
// Newly provisioned projects default to durable so continuity and audit-azure-environment are required, not merely installed.
const DEFAULT_PROJECT_PROFILE = "durable";
const DEFAULT_WORKSPACE_COLOR = "#004578";
const CONFIGURATION_PATH = path.join("config", "skills-orchestrator.json");
const TEMPLATE_ROOT_RELATIVE = "templates/project";
const BRIEF_RELATIVE_PATH = "docs/PROJECT-BRIEF.md";
const SCAFFOLD_MANIFEST_RELATIVE = "templates/scaffold-manifest.json";
const STACK_TAGS = new Set([
  "typescript", "javascript", "csharp", "python", "powershell", "bicep",
  "terraform", "java", "ruby", "php", "go", "rust", "swift", "tests"
]);
const STACK_FILE_MARKERS = new Map([
  ["package.json", ["javascript"]],
  ["tsconfig.json", ["typescript"]],
  ["pyproject.toml", ["python"]],
  ["requirements.txt", ["python"]],
  ["setup.py", ["python"]],
  ["cargo.toml", ["rust"]],
  ["go.mod", ["go"]],
  ["go.work", ["go"]],
  ["pom.xml", ["java"]],
  ["build.gradle", ["java"]],
  ["build.gradle.kts", ["java"]],
  ["settings.gradle", ["java"]],
  ["settings.gradle.kts", ["java"]],
  ["gemfile", ["ruby"]],
  ["composer.json", ["php"]],
  ["package.swift", ["swift"]]
]);
const STACK_EXTENSION_MARKERS = new Map([
  [".ts", ["typescript"]], [".tsx", ["typescript"]],
  [".js", ["javascript"]], [".mjs", ["javascript"]], [".cjs", ["javascript"]],
  [".cs", ["csharp"]], [".csproj", ["csharp"]], [".fsproj", ["csharp"]], [".vbproj", ["csharp"]], [".sln", ["csharp"]],
  [".py", ["python"]],
  [".ps1", ["powershell"]], [".psm1", ["powershell"]], [".psd1", ["powershell"]],
  [".bicep", ["bicep"]], [".bicepparam", ["bicep"]],
  [".tf", ["terraform"]], [".tfvars", ["terraform"]],
  [".java", ["java"]], [".kt", ["java"]],
  [".rb", ["ruby"]],
  [".php", ["php"]],
  [".go", ["go"]],
  [".rs", ["rust"]],
  [".swift", ["swift"]]
]);
const PROJECT_MARKER_FILES = new Set([
  ".git", "project-orchestrator.json", "package.json", "pyproject.toml", "requirements.txt",
  "setup.py", "cargo.toml", "go.mod", "go.work", "pom.xml", "build.gradle", "build.gradle.kts",
  "settings.gradle", "settings.gradle.kts", "gemfile", "composer.json", "package.swift",
  "cmakelists.txt", "makefile", "dockerfile"
]);
const PROJECT_MARKER_SUFFIXES = [".sln", ".csproj", ".fsproj", ".vbproj", ".tf", ".bicep", ".ps1", ".ipynb"];
const SCAN_EXCLUDED_DIRECTORIES = new Set([
  "node_modules", "dist", "bin", "obj", "out", "build", "target", "vendor",
  "venv", "__pycache__", "packages", "coverage", "reports"
]);
const SCAN_MAX_DEPTH = 5;
const SCAN_MAX_ENTRIES = 20000;
const EQUIVALENCE_STOP_WORDS = new Set(["and", "the", "for", "with", "github", "copilot", "file", "files"]);
// Adoption never imports a CI workflow, docs index, or repository instruction file into a project that already has its own.
const ADOPTION_TEMPLATE_EXCLUSIONS = new Set([".github/copilot-instructions.md", "docs/README.md"]);
const DEFAULT_CONFIGURATION = Object.freeze({
  schemaVersion: "1.0.0",
  profile: "core",
  platforms: { agent: "github-copilot", ci: "auto" },
  packs: ["core"],
  routing: { precedence: ["project-domain", "framework"] },
  clarification: {
    enabled: true,
    maxQuestionsPerRound: 5,
    blockOnMaterialAmbiguity: true,
    askEveryPrompt: true,
    questionsPerPrompt: 3,
    confirmPlanBeforeExecution: true
  },
  policy: {
    requireApprovalFor: ["external", "privileged", "destructive", "irreversible", "production-data-mutation", "commit", "push"]
  }
});
const APPROVAL_CLASSES = new Set(["external", "privileged", "destructive", "irreversible", "production-data-mutation", "commit", "push"]);
const MUTATING_ADOPTION_ACTIONS = new Set(["create", "update-skill", "update-skill-references", "update-framework-file", "update-wiring-file", "replace-duplicate", "remove-duplicate-command"]);
const ADOPTION_REPORT_PATHS = [
  "reports/adoption-plan.json",
  "reports/adoption-plan.md",
  "reports/adoption-verification.json",
  "reports/artifact-ownership.json",
  "reports/skill-details.json",
  "reports/skill-details.md",
  "reports/skill-inventory.json",
  "reports/skill-inventory.md"
];
const UPDATE_REPORT_PATHS = [
  "reports/project-update-plan.json",
  "reports/project-update-plan.md",
  "reports/update-verification.json",
  "reports/artifact-ownership.json",
  "reports/skill-details.json",
  "reports/skill-details.md",
  "reports/skill-inventory.json",
  "reports/skill-inventory.md"
];
const RUNTIME_OWNED_ARTIFACTS = [
  "project-orchestrator.json",
  PROJECT_LOCK_PATH,
  "reports/project-update-plan.json",
  "reports/project-update-plan.md",
  "reports/update-verification.json"
];
const LEGACY_SKILL_IDS = new Map([
  ["create-skill", "skill-create"],
  ["personalized-content", "project-visual-storytelling"],
  ["plan-audit-remediation", "audit-plan-remediation"],
  ["review-audit-findings", "audit-review-findings"]
]);
const DEPRECATED_DUPLICATE_PROMPTS = new Set([
  "azure-cleanup",
  "azure-discovery",
  "environment-update",
  "linkedin-post",
  "project-video",
  "security-review"
]);

function normalizeManagedText(buffer) {
  const withoutBom = buffer.length >= 3 && buffer[0] === 0xef && buffer[1] === 0xbb && buffer[2] === 0xbf
    ? buffer.subarray(3)
    : buffer;
  return Buffer.from(withoutBom.toString("utf8").replace(/\r\n?/g, "\n"), "utf8");
}

function managedBufferKind(buffer) {
  if (buffer.includes(0)) return "binary";
  try {
    new TextDecoder("utf-8", { fatal: true }).decode(buffer);
    return "text";
  } catch {
    return "binary";
  }
}

export function digestManagedBuffer(buffer, { kind = "auto" } = {}) {
  const bytes = Buffer.isBuffer(buffer) ? buffer : Buffer.from(buffer);
  const resolvedKind = kind === "auto" ? managedBufferKind(bytes) : kind;
  if (!new Set(["text", "binary"]).has(resolvedKind)) throw new Error(`Unsupported managed digest kind: ${kind}`);
  const canonical = resolvedKind === "text" ? normalizeManagedText(bytes) : bytes;
  return createHash("sha256").update(canonical).digest("hex");
}

function normalizedRelativePath(relative) {
  return relative.replaceAll("\\", "/").normalize("NFC");
}

export async function digestManagedPath(target, { scope = "whole-file" } = {}) {
  const details = await lstat(target);
  if (details.isSymbolicLink()) throw new Error(`Symbolic links are not allowed in managed digest paths: ${target}`);
  if (details.isFile()) return digestManagedBuffer(await readFile(target));
  if (!details.isDirectory()) throw new Error(`Unsupported managed digest path: ${target}`);
  const hash = createHash("sha256");
  hash.update(`scope:${scope}\0`);
  const files = (await walkFiles(target)).map(normalizedRelativePath).sort((left, right) => left < right ? -1 : left > right ? 1 : 0);
  for (const relative of files) {
    const bytes = await readFile(path.join(target, relative));
    const kind = managedBufferKind(bytes);
    hash.update(relative);
    hash.update("\0");
    hash.update(kind);
    hash.update("\0");
    hash.update(kind === "text" ? normalizeManagedText(bytes) : bytes);
    hash.update("\0");
  }
  return hash.digest("hex");
}

export function classifyThreeWayAsset({ baseDigest = null, localDigest = null, upstreamDigest = null }) {
  if (baseDigest === null) {
    if (localDigest === null && upstreamDigest !== null) return "new-upstream";
    if (localDigest === null || upstreamDigest === null) return "project-local";
    return localDigest === upstreamDigest ? "legacy-equivalent" : "legacy-unknown";
  }
  if (localDigest === null && upstreamDigest === null) return "removed-both-sides";
  if (localDigest === null) return "locally-deleted";
  if (upstreamDigest === null) return "upstream-removed";
  if (localDigest === baseDigest && upstreamDigest === baseDigest) return "current";
  if (localDigest === baseDigest) return "upstream-only";
  if (upstreamDigest === baseDigest) return "local-only";
  if (localDigest === upstreamDigest) return "converged";
  return "diverged";
}

function canonicalJson(value) {
  if (Array.isArray(value)) return `[${value.map(canonicalJson).join(",")}]`;
  if (isRecord(value)) {
    return `{${Object.keys(value).sort().map((key) => `${JSON.stringify(key)}:${canonicalJson(value[key])}`).join(",")}}`;
  }
  return JSON.stringify(value);
}

function canonicalDigest(value) {
  return createHash("sha256").update(canonicalJson(value)).digest("hex");
}

function compareSemanticVersions(left, right) {
  const leftParts = left.split(".").map(Number);
  const rightParts = right.split(".").map(Number);
  for (let index = 0; index < 3; index += 1) {
    if (leftParts[index] !== rightParts[index]) return leftParts[index] < rightParts[index] ? -1 : 1;
  }
  return 0;
}
const COPILOT_INSTRUCTION = "Use `.github/skills/project-skills-orchestrator/SKILL.md` for project orchestration. Audit existing project state, inventory available skills, plan before execution, preserve repository-owned skills, and stop at approval gates.";
const ORCHESTRATION_ROUTE = ".github/skills/project-skills-orchestrator/SKILL.md";
const CLARIFICATION_PROTOCOL_HEADING = "## Engagement protocol (mandatory, highest precedence)";
const CLARIFICATION_PROTOCOL = `${CLARIFICATION_PROTOCOL_HEADING}

Apply this to every new user prompt, without exception, before any analysis, tool use, file change, or answer.

1. Run \`clarify-the-ask\`.
2. Ask one question round only: ask three questions for an ordinary request, and up to five only when the request is complex, confusing, high-impact, or potentially damaging to the current project.
3. Wait for the user's answers. Do not begin work while a question is unanswered.
4. After the answers arrive, do not ask any more clarification questions for this prompt. State the objective, concrete steps, files or systems touched, and risks, then continue.

- This runs once for every new prompt, including follow-ups later in the same session. Answers close clarification for that prompt; the next prompt starts a new round.
- Ground the three questions in repository evidence; ask about intent, scope, constraints, and acceptance criteria rather than facts the repository already answers.
- Never treat your own plan description as approval.
- Do not ask filler questions. Three is the normal round size; use four or five only when additional decisions are genuinely material. Unresolved material ambiguity still blocks.
- The only exception is an explicit instruction in the current prompt to skip clarification, including the exact \`--proceed\` or \`--Proceed\` token. Treat the token case-insensitively.`;
const COPILOT_ORCHESTRATION_INSTRUCTION = `## Orchestration

${COPILOT_INSTRUCTION}`;
const AGENT_INSTRUCTION = `## Project Orchestrator

- Read \`${ORCHESTRATION_ROUTE}\` before multi-skill work.
- Automatically use an existing skill when its trigger and ownership match the request; continue with normal engineering work only when no available skill fits. Prefer reuse over duplicating an existing skill, script, workflow, report, or capability.
- Before authoring a new skill, invoke \`/skill-create\` to inventory and compare current skills. Notify the user and obtain explicit approval when no existing skill fits before creating the new skill.
- Treat the current repository as the target project. Create application code, tests, documentation, project-specific prompts, deployment configuration, and validation artifacts inside this repository when the user asks to implement this project's app or operations.
- Treat machine-readable artifacts under \`reports/\` as authoritative.
- Plan and validate before modifying files.
- Require approval for destructive, external, privileged, or irreversible actions.`;
const AZURE_ENVIRONMENT_INSTRUCTION = `## Azure environment automation

- Read \`.azure/environment.json\` before Azure work. Explicit \`-Gov\` or \`-Commercial\` overrides the saved cloud; otherwise use the saved profile, then Azure Commercial as the default.
- If the profile is missing, collect its nonsecret environment choices once and persist them. Never repeat cloud, subscription, MCP, or login questions while the profile remains valid.
- Select the recorded Azure CLI cloud and subscription automatically. If authentication is absent or stale, start the recorded login flow instead of asking whether to log in.
- Azure MCP is opt-in. Do not invoke it when disabled, and never invoke \`foundryextensions\` unless the profile already enables it with a client ID.`;
const CLARIFICATION_ANCHOR = "Ask one question round only";
const COPILOT_INSTRUCTION_BLOCKS = [
  { id: "clarification-protocol", version: 1, content: CLARIFICATION_PROTOCOL, anchor: CLARIFICATION_ANCHOR },
  { id: "orchestration-routing", version: 1, content: COPILOT_ORCHESTRATION_INSTRUCTION, anchor: ORCHESTRATION_ROUTE },
  { id: "azure-environment-automation", version: 1, content: AZURE_ENVIRONMENT_INSTRUCTION, anchor: ".azure/environment.json" }
];
const AGENT_INSTRUCTION_BLOCKS = [
  { id: "clarification-protocol", version: 1, content: CLARIFICATION_PROTOCOL, anchor: CLARIFICATION_ANCHOR },
  { id: "agent-orchestration-routing", version: 1, content: AGENT_INSTRUCTION, anchor: ORCHESTRATION_ROUTE },
  { id: "azure-environment-automation", version: 1, content: AZURE_ENVIRONMENT_INSTRUCTION, anchor: ".azure/environment.json" }
];
const RISK_ACCEPTANCE_NOTICE = `SECURITY AND RISK ACKNOWLEDGMENT

Skills Orchestrator is designed and tested with the intent to reduce defects, security weaknesses, data loss, and unintended changes. Reasonable efforts and secure engineering practices are used to avoid introducing problems into new or existing projects. However, no software or automated modification process can identify, prevent, or eliminate every possible bug, vulnerability, compatibility issue, configuration error, or other adverse outcome.

Before proceeding, verify the proposed changes, maintain an independent backup, and test the result in a non-production environment. Do not use unverified changes with production code, systems, data, credentials, or deployments.

By proceeding, you acknowledge these limitations, accept the risks associated with running Skills Orchestrator against the selected project, and accept responsibility for reviewing, testing, approving, and operating the resulting changes.`;
let testInterruptionTriggered = false;

function fail(message, code = 1) {
  console.error(`Error: ${message}`);
  process.exitCode = code;
}

function assertSupportedRuntime() {
  const major = Number.parseInt(process.versions.node.split(".")[0], 10);
  if (!SUPPORTED_NODE_MAJORS.has(major)) {
    throw new Error(`Unsupported Node.js ${process.versions.node}. Use a maintained Node.js 22, 24, or 26 release.`);
  }
}

function interruptAfterFirstWriteForTest() {
  if (!testInterruptionTriggered && process.env.NODE_ENV === "test" && process.env.PSO_TEST_INTERRUPT_AFTER_FIRST_WRITE === "1") {
    testInterruptionTriggered = true;
    process.exit(86);
  }
}

function failBeforeManifestWriteForTest() {
  if (process.env.NODE_ENV === "test" && process.env.PSO_TEST_FAIL_BEFORE_MANIFEST_WRITE === "1") {
    throw new Error("Injected failure before manifest write");
  }
}

function acknowledgeRisk(accepted, method) {
  console.log(`\n${RISK_ACCEPTANCE_NOTICE}\n`);
  if (!accepted) {
    throw new Error("Installation stopped. You must explicitly acknowledge and accept these risks before any project files are changed. Review the notice and rerun with --accept-risk.");
  }
  console.log("Risk acknowledgment accepted. Proceeding with the requested installation.\n");
  return { noticeVersion: RISK_ACCEPTANCE_VERSION, acceptedAt: new Date().toISOString(), method };
}

async function promptRiskAcceptance(terminal) {
  console.log(`\n${RISK_ACCEPTANCE_NOTICE}\n`);
  const response = (await terminal.question('Type "I ACCEPT" to acknowledge the risks and continue: ')).trim();
  if (response !== "I ACCEPT") throw new Error("Installation stopped because risk acceptance was not provided");
  console.log("Risk acknowledgment accepted. Proceeding with the requested installation.\n");
  return { noticeVersion: RISK_ACCEPTANCE_VERSION, acceptedAt: new Date().toISOString(), method: "interactive" };
}

function normalizeName(value) {
  const normalized = value.trim().toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
  if (!normalized || normalized.length > 64) {
    throw new Error("Project name must contain 1-64 letters, numbers, spaces, or hyphens");
  }
  return normalized;
}

function normalizeWorkspaceColor(value) {
  const color = String(value ?? "").trim() || DEFAULT_WORKSPACE_COLOR;
  if (!/^#[0-9a-f]{6}$/i.test(color)) throw new Error("Workspace color must use #RRGGBB format");
  return color.toUpperCase();
}

function workspaceForeground(color) {
  const channels = color.slice(1).match(/.{2}/g)
    .map((channel) => Number.parseInt(channel, 16) / 255)
    .map((channel) => channel <= 0.04045 ? channel / 12.92 : ((channel + 0.055) / 1.055) ** 2.4);
  const luminance = 0.2126 * channels[0] + 0.7152 * channels[1] + 0.0722 * channels[2];
  return luminance > 0.179 ? "#000000" : "#FFFFFF";
}

// Appends only the framework blocks that are absent so project-authored instruction text survives every rerun.
function managedRegionPattern(id) {
  return new RegExp(`<!-- pso:begin id=${id} version=\\d+ -->[\\s\\S]*?<!-- pso:end id=${id} -->`, "g");
}

function wrapManagedRegion(block) {
  return `<!-- pso:begin id=${block.id} version=${block.version} -->\n${block.content}\n<!-- pso:end id=${block.id} -->`;
}

// Replaces the whole markdown section that contains the anchor, so a renamed heading still migrates instead of duplicating.
function replaceSectionContaining(source, anchor, replacement) {
  const index = source.indexOf(anchor);
  if (index === -1) return null;
  const headingIndex = source.lastIndexOf("\n## ", index);
  if (headingIndex === -1 && !source.startsWith("## ")) return null;
  const start = headingIndex === -1 ? 0 : headingIndex + 1;
  const nextIndex = source.indexOf("\n## ", index);
  const end = nextIndex === -1 ? source.length : nextIndex + 1;
  const tail = source.slice(end).trimStart();
  return `${source.slice(0, start)}${replacement}${tail ? `\n\n${tail}` : ""}`;
}

// Idempotence is keyed on the region identifier, so editing the surrounding prose or the block heading never duplicates it.
function mergeInstructionBlocks(current, blocks) {
  let merged = current.trimEnd();
  const conflicts = [];
  const migrations = [];
  for (const block of blocks) {
    const region = wrapManagedRegion(block);
    const existing = merged.match(managedRegionPattern(block.id));
    if (existing) {
      if (existing.length > 1) conflicts.push(`${block.id} appears ${existing.length} times`);
      if (existing[0] !== region) merged = merged.replace(managedRegionPattern(block.id), () => region);
      continue;
    }
    if (merged.includes(block.content)) {
      merged = merged.replace(block.content, () => region);
      migrations.push(block.id);
      continue;
    }
    if (merged.includes(block.anchor)) {
      const replaced = replaceSectionContaining(merged, block.anchor, region);
      if (replaced === null) {
        conflicts.push(`${block.id} exists in a modified form that could not be located for migration`);
        continue;
      }
      merged = replaced.trimEnd();
      migrations.push(block.id);
      continue;
    }
    merged = merged ? `${merged}\n\n${region}` : region;
  }
  return { content: `${merged}\n`, conflicts, migrations };
}

function mergedInstructionContent(current, blocks) {
  return mergeInstructionBlocks(current, blocks).content;
}

function mergeProjectOrchestratorConfiguration(current, baseline) {
  const frameworkSections = new Set(["frameworkVersion", "runtimeVersion", "profile", "paths", "runtime", "project"]);
  const lines = current.split(/\r?\n/);
  const projectSectionIndex = lines.findIndex((line) => {
    const match = line.match(/^([A-Za-z][A-Za-z0-9_-]*):/);
    return match && !frameworkSections.has(match[1]);
  });
  if (projectSectionIndex === -1) return baseline;
  const projectSections = lines.slice(projectSectionIndex).join("\n").trim();
  return `${baseline.trimEnd()}\n${projectSections}\n`;
}


function validateGitHubRepository(value) {
  const repository = value?.trim();
  if (!repository) throw new Error("Use --repository with a GitHub repository URL");
  let owner;
  let name;
  const scpMatch = repository.match(/^git@github\.com:([A-Za-z0-9_.-]+)\/([A-Za-z0-9_.-]+)$/);
  if (scpMatch) {
    [, owner, name] = scpMatch;
  } else {
    let parsed;
    try {
      parsed = new URL(repository);
    } catch {
      throw new Error("Repository must be a GitHub HTTPS or SSH URL");
    }
    if (!["https:", "ssh:"].includes(parsed.protocol) || parsed.hostname.toLowerCase() !== "github.com"
      || parsed.port || parsed.search || parsed.hash || parsed.password
      || (parsed.protocol === "https:" && parsed.username)
      || (parsed.protocol === "ssh:" && parsed.username !== "git")) {
      throw new Error("Repository must be a credential-free GitHub HTTPS or SSH URL");
    }
    const match = parsed.pathname.match(/^\/([A-Za-z0-9_.-]+)\/([A-Za-z0-9_.-]+)\/?$/);
    if (!match) throw new Error("Repository URL must identify exactly one GitHub owner and repository");
    [, owner, name] = match;
  }
  name = name.replace(/\.git$/i, "");
  if ([owner, name].some((segment) => !segment || segment === "." || segment === "..")) {
    throw new Error("Repository URL contains an invalid owner or repository name");
  }
  return { repository, name };
}

function validateRelativePath(relative) {
  if (!relative || path.isAbsolute(relative)) throw new Error(`Unsafe managed path: ${relative || "empty"}`);
  const segments = relative.replaceAll("\\", "/").split("/");
  const reserved = /^(con|prn|aux|nul|com[1-9]|lpt[1-9])(?:\..*)?$/i;
  if (segments.some((segment) => !segment || segment === "." || segment === ".." || segment.endsWith(".")
    || segment.endsWith(" ") || segment.includes(":") || reserved.test(segment))) {
    throw new Error(`Unsafe managed path: ${relative}`);
  }
  return segments;
}

async function assertSafeManagedPath(root, relative) {
  const segments = validateRelativePath(relative);
  let current = root;
  for (let index = 0; index < segments.length; index += 1) {
    current = path.join(current, segments[index]);
    let details;
    try {
      details = await lstat(current);
    } catch (error) {
      if (error.code === "ENOENT") return;
      throw error;
    }
    if (details.isSymbolicLink()) {
      throw new Error(`Unsafe symbolic link in managed path: ${segments.slice(0, index + 1).join("/")}`);
    }
    if (index < segments.length - 1 && !details.isDirectory()) {
      throw new Error(`Managed path parent is not a directory: ${segments.slice(0, index + 1).join("/")}`);
    }
  }
}

async function assertSafeAdoptionPaths(root, actions = []) {
  const managedRoots = [".github", ".github/skills", ".skills-orchestrator", "config", "schemas", "reports", "project-orchestrator.json"];
  for (const relative of new Set([...managedRoots, ...actions.map((item) => item.path)])) {
    await assertSafeManagedPath(root, relative);
  }
}

async function managedPathState(root, relative) {
  await assertSafeManagedPath(root, relative);
  const target = path.join(root, relative);
  let handle;
  try {
    handle = await open(target, "r");
  } catch (error) {
    if (error.code === "ENOENT") return "missing";
    throw error;
  }
  try {
    const openedDetails = await handle.stat();
    const pathDetails = await lstat(target);
    if (pathDetails.isSymbolicLink() || openedDetails.dev !== pathDetails.dev || openedDetails.ino !== pathDetails.ino) {
      throw new Error(`Managed path changed while opening: ${relative}`);
    }
    if (openedDetails.isFile()) {
      return `file:sha256:${createHash("sha256").update(await handle.readFile()).digest("hex")}`;
    }
    if (openedDetails.isDirectory()) return `directory:sha256:${await directoryHash(target)}`;
    throw new Error(`Unsupported managed path type: ${relative}`);
  } finally {
    await handle.close();
  }
}

function assertManagedTransactionPath(relative) {
  const normalized = relative.replaceAll("\\", "/");
  const allowed = normalized === "project-orchestrator.json"
    || normalized === PROJECT_LOCK_PATH
    || normalized === "AGENTS.md"
    || normalized === ".github/copilot-instructions.md"
    || normalized === ".editorconfig"
    || normalized === ".gitattributes"
    || normalized === ".vscode/extensions.json"
    || normalized === ".vscode/settings.json"
    || normalized === ".vscode/mcp.json"
    || normalized === ".vscode/tasks.json"
    || normalized === ".vscode/launch.json"
    || normalized.startsWith(".github/agents/")
    || normalized.startsWith(".github/instructions/")
    || normalized.startsWith(".github/prompts/")
    || normalized.startsWith(".github/skills/")
    || normalized.startsWith("docs/adr/")
    || normalized.startsWith("config/")
    || normalized.startsWith("schemas/")
    || ADOPTION_REPORT_PATHS.includes(normalized)
    || UPDATE_REPORT_PATHS.includes(normalized);
  if (!allowed) throw new Error(`Recovery journal targets an unmanaged path: ${relative}`);
}

async function preflightAdoptionRollback(plan, transaction) {
  const seen = new Set();
  for (const entry of transaction.journal.entries) {
    validateRelativePath(entry.path);
    assertManagedTransactionPath(entry.path);
    if (seen.has(entry.path)) throw new Error(`Duplicate recovery journal path: ${entry.path}`);
    seen.add(entry.path);
    await assertSafeManagedPath(plan.projectRoot, entry.path);
    if (entry.originalState === "missing") {
      if (entry.backup !== null) throw new Error(`Unexpected backup for originally missing path: ${entry.path}`);
      continue;
    }
    if (!/^(file|directory):sha256:[a-f0-9]{64}$/.test(entry.originalState) || !entry.backup) {
      throw new Error(`Invalid original state for recovery path: ${entry.path}`);
    }
    validateRelativePath(entry.backup);
    if (!entry.backup.replaceAll("\\", "/").startsWith("backup/")) throw new Error(`Unsafe transaction backup path: ${entry.backup}`);
    await assertSafeManagedPath(transaction.directory, entry.backup);
    const backupState = await managedPathState(transaction.directory, entry.backup);
    if (backupState !== entry.originalState) throw new Error(`Recovery backup integrity check failed: ${entry.path}`);
  }
}

async function writeJsonAtomic(target, value) {
  const temporary = `${target}.${randomUUID()}.tmp`;
  await writeFile(temporary, `${JSON.stringify(value, null, 2)}\n`, { encoding: "utf8", flag: "wx", mode: 0o600 });
  try {
    await rename(temporary, target);
  } catch (error) {
    await rm(temporary, { force: true });
    throw error;
  }
}

async function writeTextAtomic(target, content) {
  const temporary = `${target}.${randomUUID()}.tmp`;
  await writeFile(temporary, content, { encoding: "utf8", flag: "wx", mode: 0o600 });
  try {
    await rename(temporary, target);
  } catch (error) {
    await rm(temporary, { force: true });
    throw error;
  }
}

async function writeBufferAtomic(target, content) {
  const temporary = `${target}.${randomUUID()}.tmp`;
  await writeFile(temporary, content, { flag: "wx", mode: 0o600 });
  try {
    await rename(temporary, target);
  } catch (error) {
    await rm(temporary, { force: true });
    throw error;
  }
}

async function prepareAdoptionTransaction(plan, transactionId, riskAcceptance, additionalPaths = []) {
  const directory = path.join(plan.projectRoot, ".skills-orchestrator", "transactions", transactionId);
  const backupRoot = path.join(directory, "backup");
  await mkdir(backupRoot, { recursive: true });
  const paths = [...new Set([
    ...plan.actions.filter((item) => MUTATING_ADOPTION_ACTIONS.has(item.action)).map((item) => item.path),
    ...ADOPTION_REPORT_PATHS,
    ...additionalPaths
  ])];
  const entries = [];
  for (const relative of paths) {
    await assertSafeManagedPath(plan.projectRoot, relative);
    const state = await managedPathState(plan.projectRoot, relative);
    const backup = path.join(backupRoot, relative);
    if (state !== "missing") {
      await mkdir(path.dirname(backup), { recursive: true });
      await cp(path.join(plan.projectRoot, relative), backup, { recursive: state.startsWith("directory:") });
    }
    entries.push({ path: relative, originalState: state, backup: state === "missing" ? null : path.relative(directory, backup).replaceAll("\\", "/") });
  }
  const journal = {
    schemaVersion: "1.0.0",
    transactionId,
    status: "prepared",
    projectRoot: plan.projectRoot,
    riskAcceptance,
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
    entries
  };
  const journalPath = path.join(directory, "journal.json");
  await writeJsonAtomic(journalPath, journal);
  return { directory, journalPath, journal };
}

async function updateTransaction(transaction, status, details = {}) {
  transaction.journal = { ...transaction.journal, ...details, status, updatedAt: new Date().toISOString() };
  await writeJsonAtomic(transaction.journalPath, transaction.journal);
}

async function removeEmptyParents(root, relative) {
  let current = path.dirname(path.join(root, relative));
  while (current !== root && current.startsWith(`${root}${path.sep}`)) {
    if (path.basename(current) === ".skills-orchestrator") return;
    try {
      await rmdir(current);
    } catch (error) {
      if (["ENOTEMPTY", "EEXIST", "ENOENT"].includes(error.code)) return;
      throw error;
    }
    current = path.dirname(current);
  }
}

async function rollbackAdoptionTransaction(plan, transaction, cause) {
  try {
    await preflightAdoptionRollback(plan, transaction);
    for (const entry of [...transaction.journal.entries].reverse()) {
      const destination = path.join(plan.projectRoot, entry.path);
      await rm(destination, { recursive: true, force: true });
      if (entry.backup) {
        const backup = path.join(transaction.directory, entry.backup);
        await mkdir(path.dirname(destination), { recursive: true });
        await cp(backup, destination, { recursive: entry.originalState.startsWith("directory:") });
      } else {
        await removeEmptyParents(plan.projectRoot, entry.path);
      }
      const restoredState = await managedPathState(plan.projectRoot, entry.path);
      if (restoredState !== entry.originalState) throw new Error(`Restored state does not match the journal digest: ${entry.path}`);
    }
    await updateTransaction(transaction, "rolled-back", { failure: cause.message, rolledBackAt: new Date().toISOString() });
  } catch (rollbackError) {
    await updateTransaction(transaction, "recovery-required", { failure: cause.message, rollbackFailure: rollbackError.message });
    throw new Error(`Adoption failed and automatic rollback was incomplete. Preserve ${path.relative(plan.projectRoot, transaction.journalPath)} for recovery. Cause: ${cause.message}; rollback: ${rollbackError.message}`);
  }
}

function processIsAlive(processId) {
  if (!Number.isSafeInteger(processId) || processId <= 0) return true;
  try {
    process.kill(processId, 0);
    return true;
  } catch (error) {
    return error.code !== "ESRCH";
  }
}

async function recoverAdoption(projectRoot, requestedTransactionId) {
  const requestedRoot = path.resolve(projectRoot);
  if (!existsSync(requestedRoot)) throw new Error(`Repository path does not exist: ${requestedRoot}`);
  const root = await realpath(requestedRoot);
  await assertSafeAdoptionPaths(root);
  const transactionsRoot = path.join(root, ".skills-orchestrator", "transactions");
  if (!existsSync(transactionsRoot)) throw new Error("No adoption transactions are available for recovery");

  const candidates = [];
  for (const entry of await readdir(transactionsRoot, { withFileTypes: true })) {
    if (entry.isSymbolicLink()) throw new Error(`Unsafe symbolic link in transaction directory: ${entry.name}`);
    if (!entry.isDirectory() || (requestedTransactionId && entry.name !== requestedTransactionId)) continue;
    const journalPath = path.join(transactionsRoot, entry.name, "journal.json");
    if (!existsSync(journalPath)) continue;
    await assertSafeManagedPath(root, path.relative(root, journalPath));
    let journal;
    try {
      journal = JSON.parse(await readFile(journalPath, "utf8"));
    } catch (error) {
      throw new Error(`Invalid recovery journal ${entry.name}: ${error.message}`);
    }
    if (journal.schemaVersion !== "1.0.0" || journal.transactionId !== entry.name || journal.projectRoot !== root
      || !Array.isArray(journal.entries)) {
      throw new Error(`Invalid recovery journal contract: ${entry.name}`);
    }
    for (const item of journal.entries) {
      if (!item || typeof item.path !== "string" || typeof item.originalState !== "string"
        || (item.backup !== null && typeof item.backup !== "string")) {
        throw new Error(`Invalid recovery journal entry: ${entry.name}`);
      }
      validateRelativePath(item.path);
    }
    if (["prepared", "applying", "recovery-required"].includes(journal.status)) {
      candidates.push({ directory: path.dirname(journalPath), journalPath, journal });
    }
  }
  if (!candidates.length) throw new Error(requestedTransactionId
    ? `Transaction is not recoverable: ${requestedTransactionId}`
    : "No interrupted adoption transaction requires recovery");
  candidates.sort((left, right) => right.journal.updatedAt.localeCompare(left.journal.updatedAt));
  const transaction = candidates[0];

  const lockPath = path.join(root, ".skills-orchestrator", "adoption.lock");
  let staleLockPath;
  const claimedLockPath = `${lockPath}.stale-${randomUUID()}`;
  try {
    await rename(lockPath, claimedLockPath);
    staleLockPath = claimedLockPath;
  } catch (error) {
    if (error.code !== "ENOENT") throw error;
  }
  if (staleLockPath) {
    let lock;
    try {
      lock = JSON.parse(await readFile(staleLockPath, "utf8"));
    } catch (error) {
      await rename(staleLockPath, lockPath);
      throw new Error(`Adoption lock is invalid; inspect it manually before recovery: ${error.message}`);
    }
    if (processIsAlive(lock.processId)) {
      await rename(staleLockPath, lockPath);
      throw new Error(`Adoption process ${lock.processId} may still be active; recovery refused`);
    }
  }
  try {
    await writeFile(lockPath, `${JSON.stringify({ transactionId: transaction.journal.transactionId, processId: process.pid, recovery: true, startedAt: new Date().toISOString() }, null, 2)}\n`, {
      encoding: "utf8",
      flag: "wx",
      mode: 0o600
    });
  } catch (error) {
    if (staleLockPath && existsSync(staleLockPath) && !existsSync(lockPath)) await rename(staleLockPath, lockPath);
    throw error;
  }
  try {
    await rollbackAdoptionTransaction({ projectRoot: root }, transaction, new Error("Interrupted adoption recovered by explicit request"));
  } finally {
    await rm(lockPath, { force: true });
    if (staleLockPath) await rm(staleLockPath, { force: true });
  }
  console.log(`Recovered adoption transaction: ${transaction.journal.transactionId}`);
}

function parseArgs(args) {
  const result = { _: [] };
  for (let index = 0; index < args.length; index += 1) {
    const value = args[index];
    if (!value.startsWith("--")) {
      result._.push(value);
      continue;
    }
    const key = value.slice(2);
    if (["help", "version", "dry-run", "apply", "accept-risk", "force-templates", "force-adopt", "open", "json"].includes(key)) {
      result[key] = true;
      continue;
    }
    const next = args[index + 1];
    if (!next || next.startsWith("--")) throw new Error(`Missing value for --${key}`);
    result[key] = next;
    index += 1;
  }
  return result;
}

function validateUpdateOptions(options) {
  const valued = new Set(["project", "mode", "skills", "assets", "selection-file"]);
  const flags = new Set(["dry-run", "apply", "accept-risk", "json"]);
  const unknown = Object.keys(options).filter((key) => key !== "_" && !valued.has(key) && !flags.has(key));
  if (unknown.length) throw new Error(`Unknown update option: ${unknown.map((key) => `--${key}`).join(", ")}`);
  if (options._.length !== 1) throw new Error(`Unexpected update argument: ${options._.slice(1).join(", ")}`);
  for (const key of valued) {
    if (options[key] !== undefined && typeof options[key] !== "string") throw new Error(`Update option --${key} requires a value`);
  }
  for (const key of flags) {
    if (options[key] !== undefined && options[key] !== true) throw new Error(`Update option --${key} is a flag`);
  }
}

function rejectUnknownFields(value, allowed, location) {
  const unknown = Object.keys(value).filter((key) => !allowed.includes(key));
  if (unknown.length) throw new Error(`Unknown ${location} field: ${unknown.join(", ")}`);
}

function isRecord(value) {
  return value !== null && !Array.isArray(value) && typeof value === "object";
}

async function resolveConfiguration(projectRoot, profileOverride) {
  const configurationPath = path.join(projectRoot, CONFIGURATION_PATH);
  let projectConfiguration = {};
  if (existsSync(configurationPath)) {
    try {
      projectConfiguration = JSON.parse(await readFile(configurationPath, "utf8"));
    } catch (error) {
      throw new Error(`Invalid ${CONFIGURATION_PATH}: ${error.message}`);
    }
    if (!isRecord(projectConfiguration)) {
      throw new Error(`Invalid ${CONFIGURATION_PATH}: expected a JSON object`);
    }
    rejectUnknownFields(projectConfiguration, ["schemaVersion", "profile", "platforms", "packs", "routing", "clarification", "policy"], "configuration");
    if (projectConfiguration.schemaVersion !== "1.0.0") {
      throw new Error(`Unsupported configuration schemaVersion: ${projectConfiguration.schemaVersion ?? "missing"}`);
    }
    for (const [key, allowed] of [
      ["platforms", ["agent", "ci"]],
      ["routing", ["precedence"]],
      ["clarification", ["enabled", "maxQuestionsPerRound", "blockOnMaterialAmbiguity", "askEveryPrompt", "questionsPerPrompt", "confirmPlanBeforeExecution"]],
      ["policy", ["requireApprovalFor"]]
    ]) {
      if (projectConfiguration[key] !== undefined) {
        if (!isRecord(projectConfiguration[key])) throw new Error(`Invalid configuration field ${key}: expected an object`);
        rejectUnknownFields(projectConfiguration[key], allowed, key);
      }
    }
  }

  const resolved = {
    ...DEFAULT_CONFIGURATION,
    ...projectConfiguration,
    platforms: { ...DEFAULT_CONFIGURATION.platforms, ...projectConfiguration.platforms },
    routing: { ...DEFAULT_CONFIGURATION.routing, ...projectConfiguration.routing },
    clarification: { ...DEFAULT_CONFIGURATION.clarification, ...projectConfiguration.clarification },
    policy: { ...DEFAULT_CONFIGURATION.policy, ...projectConfiguration.policy },
    profile: profileOverride ?? projectConfiguration.profile ?? DEFAULT_CONFIGURATION.profile
  };
  if (!PROFILES.has(resolved.profile)) throw new Error(`Unsupported profile: ${resolved.profile}`);
  if (!resolved.platforms || !["github-copilot", "agents-md"].includes(resolved.platforms.agent)) {
    throw new Error(`Unsupported agent platform: ${resolved.platforms?.agent ?? "missing"}`);
  }
  if (!["auto", "manual", "github-actions", "azure-devops", "gitlab-ci"].includes(resolved.platforms.ci)) {
    throw new Error(`Unsupported CI platform: ${resolved.platforms.ci ?? "missing"}`);
  }
  if (!Array.isArray(resolved.packs) || resolved.packs.length === 0 || new Set(resolved.packs).size !== resolved.packs.length
    || resolved.packs.some((pack) => !PROFILES.has(pack))) {
    throw new Error("Packs must be an array containing core, durable, distributed, or advanced");
  }
  const precedence = resolved.routing?.precedence;
  if (!Array.isArray(precedence) || precedence.length !== 2 || new Set(precedence).size !== 2
    || precedence.some((route) => !["project-domain", "framework"].includes(route))) {
    throw new Error("Routing precedence must contain project-domain and framework exactly once");
  }
  const clarification = resolved.clarification;
  if (!clarification || typeof clarification.enabled !== "boolean"
    || !Number.isInteger(clarification.maxQuestionsPerRound)
    || clarification.maxQuestionsPerRound < 1 || clarification.maxQuestionsPerRound > 10
    || typeof clarification.blockOnMaterialAmbiguity !== "boolean") {
    throw new Error("clarification must define enabled, maxQuestionsPerRound from 1 to 10, and blockOnMaterialAmbiguity");
  }
  const approvalClasses = resolved.policy?.requireApprovalFor;
  if (!Array.isArray(approvalClasses) || new Set(approvalClasses).size !== approvalClasses.length
    || approvalClasses.some((approvalClass) => !APPROVAL_CLASSES.has(approvalClass))) {
    throw new Error("policy.requireApprovalFor contains an unsupported or duplicate approval class");
  }
  return resolved;
}

async function isMeaningfulProject(root) {
  if (await hasProjectMarker(root)) return true;
  const entries = await readdir(root, { withFileTypes: true }).catch(() => []);
  for (const entry of entries) {
    if (!entry.isDirectory() || entry.isSymbolicLink()) continue;
    const name = entry.name.toLowerCase();
    if (name.startsWith(".") || SCAN_EXCLUDED_DIRECTORIES.has(name)) continue;
    if (await hasProjectMarker(path.join(root, entry.name))) return true;
  }
  return false;
}

async function hasProjectMarker(directory) {
  const entries = await readdir(directory, { withFileTypes: true }).catch(() => []);
  return entries.some((entry) => {
    const name = entry.name.toLowerCase();
    if (PROJECT_MARKER_FILES.has(name)) return true;
    return entry.isFile() && PROJECT_MARKER_SUFFIXES.some((suffix) => name.endsWith(suffix));
  });
}

// Bounded breadth-first scan; large repositories stop at the entry cap rather than walking every file.
async function detectProjectStack(root) {
  const tags = new Set();
  let visited = 0;
  let truncated = false;
  async function scan(directory, depth) {
    if (depth > SCAN_MAX_DEPTH) {
      truncated = true;
      return;
    }
    if (visited >= SCAN_MAX_ENTRIES) {
      truncated = true;
      return;
    }
    const entries = await readdir(directory, { withFileTypes: true }).catch(() => []);
    for (const entry of entries) {
      if (visited >= SCAN_MAX_ENTRIES) {
        truncated = true;
        return;
      }
      visited += 1;
      if (entry.isSymbolicLink()) continue;
      const name = entry.name.toLowerCase();
      if (entry.isDirectory()) {
        if (SCAN_EXCLUDED_DIRECTORIES.has(name) || name.startsWith(".")) continue;
        if (name === "test" || name === "tests" || name === "spec") tags.add("tests");
        await scan(path.join(directory, entry.name), depth + 1);
        continue;
      }
      if (!entry.isFile()) continue;
      for (const tag of STACK_FILE_MARKERS.get(name) ?? []) tags.add(tag);
      for (const tag of STACK_EXTENSION_MARKERS.get(path.extname(name)) ?? []) tags.add(tag);
      if (/\.(test|spec)\./.test(name) || /tests?\.cs$/.test(name)) tags.add("tests");
    }
  }
  await scan(root, 0);
  if (tags.has("typescript")) tags.add("javascript");
  return { tags, truncated };
}

function parseStackOption(value) {
  const tags = new Set(String(value).split(",").map((item) => item.trim().toLowerCase()).filter(Boolean));
  const unknown = [...tags].filter((tag) => !STACK_TAGS.has(tag));
  if (unknown.length) throw new Error(`Unknown --stack value: ${unknown.join(", ")}. Supported: ${[...STACK_TAGS].sort().join(", ")}`);
  if (tags.has("typescript")) tags.add("javascript");
  return tags;
}

async function loadScaffoldManifest() {
  await assertSafeManagedPath(SCRIPT_ROOT, SCAFFOLD_MANIFEST_RELATIVE);
  const manifest = JSON.parse(await readFile(path.join(SCRIPT_ROOT, SCAFFOLD_MANIFEST_RELATIVE), "utf8"));
  if (manifest.schemaVersion !== "1.0.0") throw new Error(`Unsupported scaffold manifest version: ${manifest.schemaVersion}`);
  const shipped = new Set(await walkFiles(path.join(SCRIPT_ROOT, TEMPLATE_ROOT_RELATIVE)));
  for (const template of manifest.templates) {
    if (!shipped.has(template.path)) throw new Error(`Scaffold manifest references a missing template: ${template.path}`);
  }
  for (const relative of shipped) {
    if (!manifest.templates.some((template) => template.path === relative)) {
      throw new Error(`Shipped template is not declared in the scaffold manifest: ${relative}`);
    }
  }
  return manifest.templates;
}

function templateApplies(template, stack) {
  return template.requires === "always" || template.requires.some((tag) => stack.has(tag));
}

// Only actions with a verified commit SHA are emitted; every other stack uses tooling preinstalled on GitHub-hosted runners.
const CHECKOUT_ACTION = "actions/checkout@3d3c42e5aac5ba805825da76410c181273ba90b1";
const SETUP_NODE_ACTION = "actions/setup-node@820762786026740c76f36085b0efc47a31fe5020";
const SETUP_PYTHON_ACTION = "actions/setup-python@ece7cb06caefa5fff74198d8649806c4678c61a1";
const SETUP_DOTNET_ACTION = "actions/setup-dotnet@a98b56852c35b8e3190ac28c8c2271da59106c68";
const SETUP_JAVA_ACTION = "actions/setup-java@b6effb05e454b25005698d916606bdc6ffcbf961";
const SETUP_GO_ACTION = "actions/setup-go@924ae3a1cded613372ab5595356fb5720e22ba16";
const SETUP_RUST_ACTION = "dtolnay/rust-toolchain@6c977a6ca4077a0ceb28ffbe03f59d46e9ac8772";
const SETUP_RUBY_ACTION = "ruby/setup-ruby@95ef2b042f9d7a56d8268cba8559e2842e2ad01b";
const SETUP_PHP_ACTION = "shivammathur/setup-php@df2faad913c2a040778bb075f5472db69131ed11";
const SETUP_TERRAFORM_ACTION = "hashicorp/setup-terraform@b9cd54a3c349d3f38e8881555d616ced269862dd";
const CI_STACK_STEPS = new Map([
  ["javascript", `      - name: Set up Node.js
        uses: ${SETUP_NODE_ACTION}
        with:
          node-version: 22
      - name: Install dependencies
        run: npm ci
      - name: Test
        run: npm test`],
  ["python", `      - name: Set up Python
        uses: ${SETUP_PYTHON_ACTION}
        with:
          python-version: '3.12'
      - name: Install Python dependencies
        run: |
          python -m pip install --upgrade pip
          if [ -f requirements.txt ]; then pip install -r requirements.txt; fi
          if [ -f pyproject.toml ]; then pip install .; fi
      - name: Test
        run: python -m pytest`],
  ["csharp", `      - name: Set up .NET
        uses: ${SETUP_DOTNET_ACTION}
        with:
          dotnet-version: '8.0.x'
      - name: Restore
        run: dotnet restore
      - name: Build
        run: dotnet build --no-restore --configuration Release
      - name: Test
        run: dotnet test --no-build --configuration Release`],
  ["java", `      - name: Set up Java
        uses: ${SETUP_JAVA_ACTION}
        with:
          distribution: temurin
          java-version: '21'
      - name: Build and test
        run: |
          if [ -f pom.xml ]; then mvn -B --no-transfer-progress verify; else ./gradlew build; fi`],
  ["go", `      - name: Set up Go
        uses: ${SETUP_GO_ACTION}
        with:
          go-version: '1.23.x'
      - name: Build
        run: go build ./...
      - name: Test
        run: go test ./...`],
  ["rust", `      - name: Set up Rust
        uses: ${SETUP_RUST_ACTION}
        with:
          toolchain: '1.86.0'
      - name: Build
        run: cargo build --locked
      - name: Test
        run: cargo test --locked`],
  ["ruby", `      - name: Set up Ruby
        uses: ${SETUP_RUBY_ACTION}
        with:
          ruby-version: '3.3'
      - name: Install dependencies
        run: bundle install
      - name: Test
        run: bundle exec rake`],
  ["php", `      - name: Set up PHP
        uses: ${SETUP_PHP_ACTION}
        with:
          php-version: '8.3'
      - name: Install dependencies
        run: composer install --no-interaction --prefer-dist
      - name: Test
        run: vendor/bin/phpunit`],
  ["powershell", `      - name: Analyze PowerShell
        shell: pwsh
        run: |
          Install-Module PSScriptAnalyzer -RequiredVersion 1.24.0 -Force -Scope CurrentUser -ErrorAction Stop
          Invoke-ScriptAnalyzer -Path . -Recurse -EnableExit`],
  ["bicep", `      - name: Build Bicep
        run: |
          find . -name '*.bicep' -print0 | xargs -0 -r -n1 az bicep build --file`],
  ["terraform", `      - name: Set up Terraform
        uses: ${SETUP_TERRAFORM_ACTION}
        with:
          terraform_version: '1.9.x'
      - name: Validate Terraform
        run: |
          terraform fmt -check -recursive
          terraform init -backend=false
          terraform validate`]
]);

// An unconfigured pipeline fails rather than reporting a green check that verified nothing.
const CI_UNCONFIGURED_STEP = `      - name: Configure build and test
        run: |
          echo "No build or test command is configured for this project."
          echo "Edit .github/workflows/ci.yml and replace this step, or rerun setup with --stack."
          exit 1`;

function continuousIntegrationWorkflow(stack) {
  const steps = [...CI_STACK_STEPS.keys()].filter((tag) => stack.has(tag)).map((tag) => CI_STACK_STEPS.get(tag));
  const body = steps.length ? steps.join("\n") : CI_UNCONFIGURED_STEP;
  return `name: CI

on:
  push:
    branches: [main]
  pull_request:
    branches: [main]

permissions:
  contents: read

concurrency:
  group: ci-\${{ github.ref }}
  cancel-in-progress: true

jobs:
  build:
    runs-on: ubuntu-latest
    steps:
      - name: Checkout
        uses: ${CHECKOUT_ACTION}
        with:
          persist-credentials: false
${body}
`;
}

// Dependency installation only. Copilot cloud agent and Copilot code review run these before the agent starts.
// Every step is guarded on its manifest so a governance-only repository does not fail the setup job.
const COPILOT_SETUP_STEPS = new Map([
  ["javascript", `      - name: Set up Node.js
        uses: ${SETUP_NODE_ACTION}
        with:
          node-version: 22
      - name: Install JavaScript dependencies
        run: |
          if [ -f package-lock.json ]; then npm ci; elif [ -f package.json ]; then npm install; fi`],
  ["python", `      - name: Install Python dependencies
        run: |
          python -m pip install --upgrade pip
          if [ -f requirements.txt ]; then pip install -r requirements.txt; fi
          if [ -f pyproject.toml ]; then pip install -e .; fi`],
  ["csharp", `      - name: Restore .NET dependencies
        run: |
          if find . -name '*.sln' -o -name '*.csproj' | grep -q .; then dotnet restore; fi`],
  ["java", `      - name: Resolve Java dependencies
        run: |
          if [ -f pom.xml ]; then mvn -B --no-transfer-progress dependency:go-offline; elif [ -f gradlew ]; then ./gradlew dependencies; fi`],
  ["go", `      - name: Download Go modules
        run: |
          if [ -f go.mod ]; then go mod download; fi`],
  ["rust", `      - name: Fetch Rust crates
        run: |
          if [ -f Cargo.toml ]; then cargo fetch; fi`],
  ["ruby", `      - name: Install Ruby gems
        run: |
          if [ -f Gemfile ]; then bundle install; fi`],
  ["php", `      - name: Install PHP packages
        run: |
          if [ -f composer.json ]; then composer install --no-interaction --prefer-dist; fi`],
  ["powershell", `      - name: Install PowerShell analyzer
        shell: pwsh
        run: Install-Module PSScriptAnalyzer -Force -Scope CurrentUser -ErrorAction Stop`],
  ["bicep", `      - name: Install the Bicep CLI
        run: az bicep install`],
  ["terraform", `      - name: Initialize Terraform
        run: |
          if ls *.tf >/dev/null 2>&1; then terraform init -backend=false; fi`]
]);

// https://docs.github.com/en/copilot/how-tos/use-copilot-agents/coding-agent/customize-the-agent-environment
function copilotSetupStepsWorkflow(stack) {
  const steps = [...COPILOT_SETUP_STEPS.keys()].filter((tag) => stack.has(tag)).map((tag) => COPILOT_SETUP_STEPS.get(tag));
  if (!steps.length) return null;
  return `name: "Copilot Setup Steps"

# Preinstalls dependencies in the ephemeral environment used by Copilot cloud agent
# and Copilot code review, so the agent does not have to discover them by trial and error.

on:
  workflow_dispatch:
  push:
    paths:
      - .github/workflows/copilot-setup-steps.yml
  pull_request:
    paths:
      - .github/workflows/copilot-setup-steps.yml

jobs:
  # The job name must stay copilot-setup-steps or Copilot will not pick it up.
  copilot-setup-steps:
    runs-on: ubuntu-latest
    timeout-minutes: 30
    permissions:
      contents: read
    steps:
      - name: Checkout
        uses: ${CHECKOUT_ACTION}
        with:
          persist-credentials: false
${steps.join("\n")}
`;
}

const BASE_EXTENSIONS = ["github.copilot", "github.copilot-chat", "bierner.markdown-mermaid", "editorconfig.editorconfig"];
const STACK_EXTENSIONS = new Map([
  ["javascript", ["dbaeumer.vscode-eslint"]],
  ["typescript", ["dbaeumer.vscode-eslint"]],
  ["csharp", ["ms-dotnettools.csdevkit", "ms-dotnettools.csharp"]],
  ["python", ["ms-python.python", "ms-python.vscode-pylance"]],
  ["powershell", ["ms-vscode.powershell"]],
  ["bicep", ["ms-azuretools.vscode-bicep"]],
  ["terraform", ["hashicorp.terraform"]],
  ["java", ["vscjava.vscode-java-pack"]],
  ["go", ["golang.go"]],
  ["rust", ["rust-lang.rust-analyzer"]],
  ["ruby", ["shopify.ruby-lsp"]],
  ["php", ["bmewburn.vscode-intelephense-client"]],
  ["swift", ["swiftlang.swift-vscode"]]
]);

function workspaceExtensions(stack) {
  const recommendations = new Set(BASE_EXTENSIONS);
  for (const tag of [...STACK_EXTENSIONS.keys()].filter((item) => stack.has(item))) {
    for (const id of STACK_EXTENSIONS.get(tag)) recommendations.add(id);
  }
  return `${JSON.stringify({ recommendations: [...recommendations] }, null, 2)}\n`;
}

// The first matching language decides the default build and test tasks; infrastructure tags only add validation.
const PRIMARY_LANGUAGE_ORDER = ["csharp", "java", "go", "rust", "python", "typescript", "javascript", "ruby", "php", "swift"];
const STACK_TASKS = new Map([
  ["csharp", { build: "dotnet build", test: "dotnet test" }],
  ["java", { build: "mvn -B --no-transfer-progress compile", test: "mvn -B --no-transfer-progress test" }],
  ["go", { build: "go build ./...", test: "go test ./..." }],
  ["rust", { build: "cargo build", test: "cargo test" }],
  ["python", { build: "python -m compileall -q src", test: "python -m pytest" }],
  ["typescript", { build: "npm run build --if-present", test: "npm test" }],
  ["javascript", { build: "npm run build --if-present", test: "npm test" }],
  ["ruby", { build: "bundle install", test: "bundle exec rake" }],
  ["php", { build: "composer install --no-interaction", test: "vendor/bin/phpunit" }],
  ["swift", { build: "swift build", test: "swift test" }]
]);
const VALIDATION_TASKS = new Map([
  ["bicep", { label: "validate: bicep", command: "az bicep build --file main.bicep" }],
  ["terraform", { label: "validate: terraform", command: "terraform fmt -check -recursive && terraform validate" }],
  ["powershell", { label: "analyze: powershell", command: "Invoke-ScriptAnalyzer -Path . -Recurse -EnableExit" }]
]);

function primaryLanguage(stack) {
  return PRIMARY_LANGUAGE_ORDER.find((tag) => stack.has(tag)) ?? null;
}

function workspaceTasks(stack) {
  const tasks = [];
  const language = primaryLanguage(stack);
  if (language) {
    const commands = STACK_TASKS.get(language);
    tasks.push({
      label: "build",
      type: "shell",
      command: commands.build,
      group: { kind: "build", isDefault: true },
      problemMatcher: []
    });
    tasks.push({
      label: "test",
      type: "shell",
      command: commands.test,
      group: { kind: "test", isDefault: true },
      problemMatcher: []
    });
  }
  for (const tag of [...VALIDATION_TASKS.keys()].filter((item) => stack.has(item))) {
    const validation = VALIDATION_TASKS.get(tag);
    tasks.push({
      label: validation.label,
      type: "shell",
      command: validation.command,
      ...(tag === "powershell" ? { options: { shell: { executable: "pwsh", args: ["-NoProfile", "-Command"] } } } : {}),
      problemMatcher: []
    });
  }
  return tasks.length ? `${JSON.stringify({ version: "2.0.0", tasks }, null, 2)}\n` : null;
}

// Configurations that need an entry point carry an obvious placeholder rather than a guess.
const STACK_LAUNCH = new Map([
  ["python", () => ({ name: "Debug current Python file", type: "debugpy", request: "launch", program: "${file}", console: "integratedTerminal" })],
  ["go", () => ({ name: "Debug Go package", type: "go", request: "launch", mode: "auto", program: "${workspaceFolder}" })],
  ["powershell", () => ({ name: "Debug current PowerShell file", type: "PowerShell", request: "launch", script: "${file}" })],
  ["php", () => ({ name: "Listen for Xdebug", type: "php", request: "launch", port: 9003 })],
  ["csharp", () => ({ name: "Debug .NET app", type: "coreclr", request: "launch", preLaunchTask: "build", program: "${workspaceFolder}/src/REPLACE_WITH_PROJECT/bin/Debug/REPLACE_WITH_TARGET_FRAMEWORK/REPLACE_WITH_ASSEMBLY.dll", cwd: "${workspaceFolder}", console: "integratedTerminal" })],
  ["typescript", () => ({ name: "Debug Node entry point", type: "node", request: "launch", program: "${workspaceFolder}/src/REPLACE_WITH_ENTRY_POINT", skipFiles: ["<node_internals>/**"] })],
  ["javascript", () => ({ name: "Debug Node entry point", type: "node", request: "launch", program: "${workspaceFolder}/src/REPLACE_WITH_ENTRY_POINT", skipFiles: ["<node_internals>/**"] })],
  ["java", () => ({ name: "Debug Java main class", type: "java", request: "launch", mainClass: "REPLACE_WITH_MAIN_CLASS" })],
  ["rust", () => ({ name: "Debug Rust binary", type: "lldb", request: "launch", preLaunchTask: "build", program: "${workspaceFolder}/target/debug/REPLACE_WITH_BINARY", args: [], cwd: "${workspaceFolder}" })]
]);

function workspaceLaunch(stack) {
  const configurations = [...STACK_LAUNCH.keys()]
    .filter((tag) => stack.has(tag))
    .map((tag) => STACK_LAUNCH.get(tag)());
  const unique = configurations.filter((item, index) => configurations.findIndex((candidate) => candidate.name === item.name) === index);
  return unique.length ? `${JSON.stringify({ version: "0.2.0", configurations: unique }, null, 2)}\n` : null;
}

// Folder-scoped settings also support projects opened directly instead of through the generated workspace file.
const WORKSPACE_SETTINGS = Object.freeze({
  "files.trimTrailingWhitespace": true,
  "editor.formatOnSave": true,
  "chat.useAgentsMdFile": true,
  "chat.includeApplyingInstructions": true,
  "chat.includeReferencedInstructions": true,
  "chat.promptFilesRecommendations": true,
  "chat.mcp.serverSampling": {
    "Azure MCP Server Provider: Azure MCP": {
      "allowedDuringChat": false
    }
  }
});

function workspaceIdentitySettings({ displayName, color }) {
  const normalizedColor = normalizeWorkspaceColor(color);
  const foreground = workspaceForeground(normalizedColor);
  return {
    "window.title": `\u{1F680} ${displayName} \u2022 \${rootName}`,
    "workbench.colorCustomizations": {
      "titleBar.activeBackground": normalizedColor,
      "titleBar.activeForeground": foreground,
      "statusBar.background": normalizedColor,
      "statusBar.foreground": foreground
    }
  };
}

function workspaceSettings(identity) {
  return `${JSON.stringify({ ...WORKSPACE_SETTINGS, ...(identity ? workspaceIdentitySettings(identity) : {}) }, null, 2)}\n`;
}

function projectBrief({ displayName, profile, declaredStack, createdAt, intent }) {
  const stackRow = declaredStack.size ? [...declaredStack].sort().join(", ") : "not declared";
  return `# Project brief

| Field | Value |
| --- | --- |
| Project | ${displayName} |
| Profile | ${profile} |
| Stack | ${stackRow} |
| Created | ${createdAt} |
| Provisioned by | Project Orchestrator ${VERSION} |

## Requested outcome

${intent}

## How to treat this brief

This brief records the outcome requested when the project was created. It is a request, not an
approved plan, and it does not authorize any change on its own.

Resolve every relative or partial time in the requested outcome against the creation timestamp
above. Do not assume a date or time zone that the requested outcome does not state.

Read \`.github/copilot-instructions.md\` before acting. The mandatory clarification protocol applies
to this brief exactly as it applies to any other prompt: ask three clarifying questions, state the
objective, steps, affected files, and risks, then wait for explicit approval.
`;
}

function projectBlueprint({ name, displayName, declaredStack, createdAt, intent }) {
  const languages = [...declaredStack].filter((tag) => tag !== "tests").sort();
  const frameworks = [];
  const infrastructure = declaredStack.has("bicep") || declaredStack.has("terraform");
  const blueprint = {
    schemaVersion: "1.0.0",
    project: {
      name,
      purpose: intent || `Build the ${displayName} project.`,
      type: infrastructure ? "infrastructure" : "other"
    },
    stack: {
      languages: languages.length ? languages : ["undecided"],
      frameworks
    },
    delivery: {
      target: infrastructure ? "azure" : "local",
      environment: "development",
      ...(infrastructure ? { cloud: "AzureCloud" } : {})
    },
    quality: {
      testing: ["automated tests"],
      security: ["secret scanning", "dependency review"],
      observability: ["health and error reporting"]
    },
    assumptions: ["This initial blueprint is derived from create-project inputs and requires review before implementation."],
    acceptanceCriteria: ["The project builds and its automated tests pass in the declared development environment."],
    generatedAt: createdAt
  };
  delete blueprint.generatedAt;
  return `${JSON.stringify(blueprint, null, 2)}\n`;
}

function projectBlueprintMarkdown({ displayName, createdAt }) {
  return `# Project Blueprint

This initial blueprint was generated for **${displayName}** at ${createdAt}. Review and refine
it with \`/project-blueprint\` before beginning application implementation.

The machine-readable source is \`docs/PROJECT-BLUEPRINT.json\`. It records confirmed decisions,
assumptions, quality requirements, and acceptance criteria without storing credentials or secret
values.
`;
}

// Kept pure so the composed handover text can be asserted without launching an editor.
function kickoffPrompt({ createdAt, intent }) {
  return [
    `This project was created by Project Orchestrator at ${createdAt}.`,
    "Read docs/PROJECT-BRIEF.md and .github/copilot-instructions.md before proposing anything.",
    `Requested outcome: ${intent}`,
    "Resolve relative times against the creation timestamp in the brief.",
    "Follow the repository engagement protocol: ask three clarifying questions, state the plan, and wait for explicit approval."
  ].join(" ");
}

// VS Code ships a .cmd launcher on Windows, which Node refuses to spawn without a shell, so the real executable is resolved instead.
async function resolveEditorLauncher() {
  const directories = (process.env.PATH ?? "").split(path.delimiter).filter(Boolean);
  const candidates = process.platform === "win32"
    ? [["code.cmd", "Code.exe"], ["code-insiders.cmd", "Code - Insiders.exe"]]
    : [["code", null], ["code-insiders", null]];
  for (const [launcher, windowsExecutable] of candidates) {
    for (const directory of directories) {
      const launcherPath = path.join(directory, launcher);
      if (!existsSync(launcherPath)) continue;
      if (!windowsExecutable) {
        const details = await lstat(launcherPath).catch(() => null);
        if (details?.isFile()) return { launcherPath, executable: launcherPath };
        continue;
      }
      const executable = path.normalize(path.join(path.dirname(launcherPath), "..", windowsExecutable));
      if (existsSync(executable)) return { launcherPath, executable };
    }
  }
  return null;
}

async function resolveEditorExecutable() {
  const resolved = await resolveEditorLauncher();
  return resolved ? resolved.executable : null;
}

// Subcommands such as `chat` live in cli.js, not in the Electron binary: passing one straight to
// Code.exe opens a window and silently discards it. An install can also stage a newer versioned
// cli.js beside the active one, so the launcher script is the only authoritative record of which
// copy belongs to the running build.
async function resolveEditorCli() {
  const resolved = await resolveEditorLauncher();
  if (!resolved) return null;
  if (process.platform !== "win32") return { executable: resolved.executable, cliPath: null };
  const script = await readFile(resolved.launcherPath, "utf8").catch(() => "");
  const referenced = script.match(/%~dp0([^"]*?cli\.js)/i);
  if (!referenced) return null;
  const cliPath = path.normalize(path.join(path.dirname(resolved.launcherPath), referenced[1]));
  return existsSync(cliPath) ? { executable: resolved.executable, cliPath } : null;
}

async function openInEditor(targets) {
  if (process.env.PSO_SUPPRESS_EDITOR_LAUNCH === "1") {
    return { opened: false, reason: "Editor launch suppressed by PSO_SUPPRESS_EDITOR_LAUNCH" };
  }
  const executable = await resolveEditorExecutable();
  if (!executable) return { opened: false, reason: "The Visual Studio Code command line was not found on PATH" };
  try {
    const child = spawn(executable, targets, { detached: true, stdio: "ignore" });
    child.unref();
    return { opened: true, executable };
  } catch (error) {
    return { opened: false, reason: error.message };
  }
}

// Opens the project and seeds the handover prompt in one invocation; launching the workspace
// separately would race the chat call, which could target whichever window was active first.
async function openWithKickoff(root, briefRelativePath, prompt) {
  if (process.env.PSO_SUPPRESS_EDITOR_LAUNCH === "1") {
    return { opened: false, seeded: false, reason: "Editor launch suppressed by PSO_SUPPRESS_EDITOR_LAUNCH" };
  }
  const resolved = await resolveEditorCli();
  if (!resolved) return { opened: false, seeded: false, reason: "The Visual Studio Code command line was not found on PATH" };
  const { executable, cliPath } = resolved;
  // The prompt is a discrete argument and never reaches a shell, so its content cannot be interpreted as a command.
  const args = ["chat", "--mode", "ask", "--add-file", briefRelativePath, prompt];
  const environment = { ...process.env };
  if (cliPath) {
    args.unshift(cliPath);
    environment.ELECTRON_RUN_AS_NODE = "1";
  }
  try {
    const child = spawn(executable, args, { cwd: root, detached: true, stdio: "ignore", env: environment });
    child.unref();
    return { opened: true, seeded: true, executable };
  } catch (error) {
    return { opened: false, seeded: false, reason: error.message };
  }
}

function significantTokens(value) {
  return new Set(String(value).toLowerCase().split(/[^a-z0-9]+/)
    .filter((token) => token.length > 2 && !EQUIVALENCE_STOP_WORDS.has(token)));
}

function globSet(value) {
  return new Set(String(value ?? "").split(",").map((item) => item.trim()).filter(Boolean));
}

// Reads project-authored customization assets so adoption can report existing coverage instead of installing a second copy.
async function discoverCustomizationAssets(root) {
  const assets = [];
  const sources = [
    ["scoped-instructions", path.join(root, ".github", "instructions"), /\.instructions\.md$/],
    ["prompt", path.join(root, ".github", "prompts"), /\.prompt\.md$/],
    ["agent", path.join(root, ".github", "agents"), /\.agent\.md$/]
  ];
  for (const [kind, directory, pattern] of sources) {
    if (!existsSync(directory)) continue;
    const entries = await readdir(directory, { withFileTypes: true }).catch(() => []);
    for (const entry of entries) {
      if (!entry.isFile() || entry.isSymbolicLink() || !pattern.test(entry.name)) continue;
      const relative = path.relative(root, path.join(directory, entry.name)).replaceAll("\\", "/");
      await assertSafeManagedPath(root, relative);
      const source = await readFile(path.join(directory, entry.name), "utf8").catch(() => "");
      const details = metadata(source);
      assets.push({
        kind,
        path: relative,
        applyTo: globSet(details.applyTo),
        tokens: new Set([...significantTokens(entry.name.replace(pattern, "")), ...significantTokens(details.description ?? "")]),
        sourceLength: source.length
      });
    }
  }
  return assets;
}

function findEquivalentAsset(template, assets) {
  const templateTokens = significantTokens(template.purpose);
  const templateGlobs = globSet(template.applyTo);
  for (const asset of assets) {
    if (asset.kind !== template.kind) continue;
    if (asset.path === template.path) continue;
    const sharedTokens = [...templateTokens].filter((token) => asset.tokens.has(token)).length;
    if (template.kind === "scoped-instructions") {
      const sharedGlobs = [...templateGlobs].some((glob) => asset.applyTo.has(glob));
      if (sharedGlobs && sharedTokens >= 1 && asset.sourceLength >= 80) return asset;
      continue;
    }
    if (sharedTokens >= 2) return asset;
  }
  return null;
}

function findOverlappingAsset(template, assets) {
  const templateTokens = significantTokens(template.purpose);
  const templateGlobs = globSet(template.applyTo);
  for (const asset of assets) {
    if (asset.kind !== template.kind || asset.path === template.path) continue;
    const sharedTokens = [...templateTokens].filter((token) => asset.tokens.has(token)).length;
    if (template.kind !== "scoped-instructions" || sharedTokens < 1) continue;
    const sharedGlobs = [...templateGlobs].some((glob) => asset.applyTo.has(glob));
    if (sharedGlobs && asset.sourceLength < 80) return asset;
  }
  return null;
}

async function ensureEmptyTarget(root) {
  if (!existsSync(root)) return;
  const details = await lstat(root);
  if (details.isSymbolicLink()) throw new Error(`Target cannot be a symbolic link: ${root}`);
  if (details.isFile()) throw new Error(`Target is a file: ${root}`);
  if (!details.isDirectory()) throw new Error(`Target is not a directory: ${root}`);
  if ((await readdir(root)).length > 0) throw new Error(`Target exists and is not empty: ${root}`);
}

async function createProject({ name: enteredName, destination, profile = DEFAULT_PROJECT_PROFILE, stack = "", color = DEFAULT_WORKSPACE_COLOR, open = false, intent = "", riskAcceptance }) {
  if (!riskAcceptance) throw new Error("Risk acceptance is required before project creation");
  if (!PROFILES.has(profile)) throw new Error(`Unsupported profile: ${profile}`);
  const declaredStack = stack ? parseStackOption(stack) : new Set();
  const requestedOutcome = String(intent ?? "").trim();
  const createdAt = new Date().toISOString();
  const displayName = enteredName.trim();
  const name = normalizeName(displayName);
  const workspaceColor = normalizeWorkspaceColor(color);
  const parent = await realpath(path.resolve(destination));
  const root = path.join(parent, name);
  await ensureEmptyTarget(root);
  for (const relative of [".github/skills", "schemas", "config/profiles.yaml", TEMPLATE_ROOT_RELATIVE]) {
    await assertSafeManagedPath(SCRIPT_ROOT, relative);
  }
  await walkFiles(path.join(SCRIPT_ROOT, ".github", "skills"));
  await walkFiles(path.join(SCRIPT_ROOT, "schemas"));
  const scaffoldTemplates = await loadScaffoldManifest();

  const staging = path.join(parent, `.pso-${name}-${randomUUID()}`);
  await mkdir(staging, { recursive: true });
  try {
    const directories = [".github", ".vscode", "config", "schemas", "reports", "src", "tests", "docs"];
    await Promise.all(directories.map((directory) => mkdir(path.join(staging, directory), { recursive: true })));
    await cp(path.join(SCRIPT_ROOT, ".github", "skills"), path.join(staging, ".github", "skills"), { recursive: true });
    await cp(path.join(SCRIPT_ROOT, "schemas"), path.join(staging, "schemas"), { recursive: true });
    await cp(path.join(SCRIPT_ROOT, "config", "profiles.yaml"), path.join(staging, "config", "profiles.yaml"));
    const installedTemplates = scaffoldTemplates.filter((template) => templateApplies(template, declaredStack));
    for (const template of installedTemplates) {
      const target = path.join(staging, template.path);
      await mkdir(path.dirname(target), { recursive: true });
      await cp(path.join(SCRIPT_ROOT, TEMPLATE_ROOT_RELATIVE, template.path), target, { errorOnExist: true });
    }

    const workspaceIdentity = { displayName, color: workspaceColor };
    const workspace = {
      folders: [{ path: "." }],
      settings: {
        "editor.formatOnSave": true,
        "files.exclude": { "**/dist": true },
        ...workspaceIdentitySettings(workspaceIdentity)
      }
    };
    const installedSource = await installedSourceIdentity();
    const manifest = {
      ...manifestUpdateFields(installedSource),
      projectName: name,
      displayName,
      frameworkVersion: FRAMEWORK_VERSION,
      runtimeVersion: VERSION,
      conformanceProfile: profile,
      declaredStack: [...declaredStack].sort(),
      workspaceColor,
      riskAcceptance,
      createdAt,
      status: "initialized",
      nextAction: "Run development-environment-readiness before the first implementation objective"
    };
    const files = new Map([
      ["README.md", `# ${displayName}\n\nProvisioned with Project Orchestrator ${VERSION} using the ${profile} profile${declaredStack.size ? ` for the ${[...declaredStack].sort().join(", ")} stack` : ""}.\n\n## What this repository currently contains\n\nThis is a governed development baseline: agent instructions, scoped standards, reusable prompts, specialist agents, the skill catalog, editor configuration, and a continuous-integration workflow. **It does not yet contain application code.** Add your application under \`src/\` and its tests under \`tests/\`.\n\n## First steps\n\n1. Open \`${name}.code-workspace\` in Visual Studio Code.\n2. Select **Yes, I trust the authors** when Visual Studio Code asks about workspace trust. Tasks, debugging, and MCP servers stay disabled until you do.\n3. Select **Install** when Visual Studio Code offers the recommended extensions.\n4. Read \`.github/copilot-instructions.md\`. Every agent prompt in this project begins with the mandatory clarification protocol defined there.\n5. Open GitHub Copilot Chat in Agent mode and run \`/development-environment-readiness\` to validate tools, runtimes, authentication, debugging, and security gates.\n\nThe agent customization layer needs no configuration. Visual Studio Code discovers it automatically:\n\n| Location | What it provides |\n| --- | --- |\n| \`.github/copilot-instructions.md\` and \`AGENTS.md\` | Always-on project instructions |\n| \`.github/instructions/\` | Standards applied by file pattern |\n| \`.github/prompts/\` | Slash commands such as \`/create-adr\` and \`/security-review\` |\n| \`.github/agents/\` | Specialist agents in the agent picker |\n| \`.github/skills/\` | The governed skill catalog |\n\n${declaredStack.size ? "## Build, test, and debug\n\n`Ctrl+Shift+B` runs the build task and the Test Explorer runs the test task, both defined in `.vscode/tasks.json`. Debug configurations are in `.vscode/launch.json`; any value containing `REPLACE_WITH_` is a placeholder that needs your entry point before `F5` will work.\n\nThe continuous-integration workflow runs real build and test commands for the declared stack. Confirm they match this project before relying on the result.\n\n## Copilot cloud agent\n\n`.github/workflows/copilot-setup-steps.yml` preinstalls this project's dependencies in the ephemeral environment used by Copilot cloud agent and Copilot code review, so the agent can build and test instead of guessing at dependencies. It only takes effect once it is on the default branch." : "## Build, test, and debug\n\nNo stack was declared, so no build task, debug configuration, Copilot setup steps, or continuous-integration command was generated. The pipeline in `.github/workflows/ci.yml` fails until you configure one. That is deliberate: a pipeline that passes without testing anything is worse than no pipeline.\n\nRerun setup with `--stack` to generate tasks, debug configurations, Copilot cloud agent setup steps, and real CI commands."}\n`],
      ["AGENTS.md", mergedInstructionContent("# Project Agent Instructions", AGENT_INSTRUCTION_BLOCKS)],
      [".gitignore", "dist/\nnode_modules/\n.env\n.azure/environment.json\n.skills-orchestrator/\n"],
      [".github/workflows/ci.yml", continuousIntegrationWorkflow(declaredStack)],
      [".vscode/extensions.json", workspaceExtensions(declaredStack)],
      [".vscode/settings.json", workspaceSettings(workspaceIdentity)],
      [`${name}.code-workspace`, `${JSON.stringify(workspace, null, 2)}\n`],
      ["docs/PROJECT-BLUEPRINT.json", projectBlueprint({ name, displayName, declaredStack, createdAt, intent: requestedOutcome })],
      ["docs/PROJECT-BLUEPRINT.md", projectBlueprintMarkdown({ displayName, createdAt })],
      ["reports/project-handoff.json", `${JSON.stringify({ schemaVersion: "1.0.0", generatedAt: createdAt, project: { name, version: VERSION, branch: "uninitialized", commit: "uninitialized" }, status: "initialized", milestone: { name: "Project initialization", status: "awaiting-first-work", objective: "Establish the project foundation and confirm the first implementation objective." }, lastCompletedWork: { summary: "Created a fresh governed project foundation. No application implementation has been completed yet.", completedAt: createdAt, evidence: ["project-orchestrator.json", "docs/PROJECT-BLUEPRINT.json"] }, decisions: [], validation: [], worktree: { clean: true, unmergedPaths: 0, otherChangesPresent: false, attribution: "Fresh handoff generated for this project; it does not inherit the source repository handoff." }, blockers: [], pendingApprovals: [], limitations: ["Application code and project-specific validation do not exist yet."], nextAction: { skill: "development-environment-readiness", status: "recommended", action: "Validate the development environment before the first implementation objective." } }, null, 2)}\n`],
      ["reports/project-handoff.md", `# Project Handoff\n\nGenerated: ${createdAt}  \nProject: ${displayName} ${VERSION}  \nStatus: **Initialized**\n\n## Current State\n\nThis is a fresh handoff generated for this project. It does not inherit the source repository's handoff, commit history, milestones, blockers, or Azure decisions. Application implementation has not started.\n\n## Next Action\n\nRun /development-environment-readiness, then begin the first implementation objective from the project blueprint.\n`],
      [CONFIGURATION_PATH, `${JSON.stringify({ ...DEFAULT_CONFIGURATION, profile }, null, 2)}\n`],
      ["config/orchestrator.yaml", `frameworkVersion: ${FRAMEWORK_VERSION}\nruntimeVersion: ${VERSION}\nprofile: ${profile}\npaths:\n  skills: .github/skills\n  reports: reports\n  schemas: schemas\nruntime:\n  eventStream: reports/execution-log.jsonl\n  stateSnapshot: reports/current-execution-state.json\n  appendOnly: true\nproject:\n  name: ${name}\n  initialized: true\n`],
      ["reports/.gitkeep", ""],
      ["src/.gitkeep", ""],
      ["tests/.gitkeep", ""]
    ]);
    const frameworkSkills = await discoverSkills(SCRIPT_ROOT);
    for (const skill of frameworkSkills) {
      files.set(`.github/prompts/${skill.name}-help.prompt.md`, skillHelpPrompt(skill));
    }
    const workspaceTaskContent = workspaceTasks(declaredStack);
    if (workspaceTaskContent) files.set(".vscode/tasks.json", workspaceTaskContent);
    const workspaceLaunchContent = workspaceLaunch(declaredStack);
    if (workspaceLaunchContent) files.set(".vscode/launch.json", workspaceLaunchContent);
    const copilotSetupContent = copilotSetupStepsWorkflow(declaredStack);
    if (copilotSetupContent) files.set(".github/workflows/copilot-setup-steps.yml", copilotSetupContent);
    if (requestedOutcome) {
      files.set(BRIEF_RELATIVE_PATH, projectBrief({
        displayName, profile, declaredStack, createdAt, intent: requestedOutcome
      }));
    }
    for (const [relative, content] of files) {
      const target = path.join(staging, relative);
      await mkdir(path.dirname(target), { recursive: true });
      await writeFile(target, content, { encoding: "utf8", flag: "wx" });
    }
    await inventory(staging);
    const baselineLock = await buildBaselineLock(staging, createdAt, installedSource);
    await writeFile(path.join(staging, PROJECT_LOCK_PATH), `${JSON.stringify(baselineLock, null, 2)}\n`, { encoding: "utf8", flag: "wx" });
    await writeFile(path.join(staging, "project-orchestrator.json"), `${JSON.stringify(manifest, null, 2)}\n`, { encoding: "utf8", flag: "wx" });
    await verifyInstallation({ projectRoot: staging, profile }, "installation-verification.json");
    await publishStagedProject(staging, root);
  } catch (error) {
    throw new Error(`Project creation stopped. Staging path preserved for recovery: ${staging}\n${error.message}`);
  }
  const workspace = path.join(root, `${name}.code-workspace`);
  const prompt = requestedOutcome ? kickoffPrompt({ createdAt, intent: requestedOutcome }) : null;
  let launch = null;
  if (open && prompt) launch = await openWithKickoff(root, BRIEF_RELATIVE_PATH, prompt);
  else if (open) launch = await openInEditor([workspace, path.join(root, "README.md")]);
  return { name, root, workspace, profile, launch, prompt, brief: prompt ? path.join(root, BRIEF_RELATIVE_PATH) : null };
}

async function sameFile(left, right) {
  if (!existsSync(left) || !existsSync(right)) return false;
  return (await readFile(left)).equals(await readFile(right));
}

async function walkFiles(root, relative = "") {
  const current = path.join(root, relative);
  const entries = await readdir(current, { withFileTypes: true });
  const files = [];
  for (const entry of entries) {
    const child = path.join(relative, entry.name);
    if (entry.isSymbolicLink()) throw new Error(`Symbolic links are not allowed in managed package assets: ${child.replaceAll("\\", "/")}`);
    if (entry.isDirectory()) files.push(...await walkFiles(root, child));
    else if (entry.isFile()) files.push(child.replaceAll("\\", "/"));
    else throw new Error(`Unsupported managed package asset: ${child.replaceAll("\\", "/")}`);
  }
  return files;
}

async function directoryHash(root) {
  return digestManagedPath(root, { scope: "managed-directory" });
}

function metadata(source) {
  const match = source.match(/^---\r?\n([\s\S]*?)\r?\n---/);
  const data = {};
  if (!match) return data;
  const lines = match[1].split(/\r?\n/);
  for (let index = 0; index < lines.length; index += 1) {
    const separator = lines[index].indexOf(":");
    if (separator <= 0) continue;
    const key = lines[index].slice(0, separator).trim();
    const value = lines[index].slice(separator + 1).trim();
    if (value === ">" || value === ">-" || value === "|" || value === "|-") {
      const continuation = [];
      while (index + 1 < lines.length && /^\s+/.test(lines[index + 1])) {
        continuation.push(lines[index + 1].trim());
        index += 1;
      }
      data[key] = continuation.join(value.startsWith(">") ? " " : "\n");
    } else {
      data[key] = value.replace(/^(["'])(.*)\1$/, "$2");
    }
  }
  return data;
}

function sectionItems(source, heading) {
  const escaped = heading.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const headingMatch = new RegExp(`^## ${escaped}\\s*$`, "m").exec(source);
  if (!headingMatch) return [];
  const contentStart = headingMatch.index + headingMatch[0].length;
  const remainder = source.slice(contentStart);
  const nextHeading = /^## /m.exec(remainder);
  const content = nextHeading ? remainder.slice(0, nextHeading.index) : remainder;
  return [...content.matchAll(/^\s*-\s+`?([^`\r\n]+?)`?\s*$/gm)]
    .map((item) => item[1].trim())
    .filter((item) => item.toLowerCase() !== "none" && !item.toLowerCase().startsWith("no dedicated"));
}

function dependencyItems(source) {
  const section = source.match(/^## Composition and Dependencies\s*$([\s\S]*?)(?=^## |(?![\s\S]))/m)?.[1] ?? "";
  const prerequisites = section.match(/^### Prerequisite Dependencies\s*$([\s\S]*?)(?=^### |(?![\s\S]))/m)?.[1];
  const content = prerequisites ?? section;
  return [...content.matchAll(/^\s*-\s+`?([^`\r\n]+?)`?\s*$/gm)]
    .map((item) => item[1].trim())
    .filter((item) => item.toLowerCase() !== "none");
}

async function discoverSkills(root) {
  const skillsRoot = path.join(root, ".github", "skills");
  if (!existsSync(skillsRoot)) return [];
  const entries = await readdir(skillsRoot, { withFileTypes: true });
  const skills = [];
  for (const entry of entries.filter((item) => item.isDirectory())) {
    const directoryPath = path.join(skillsRoot, entry.name);
    const skillFile = path.join(directoryPath, "SKILL.md");
    if (!existsSync(skillFile)) continue;
    await assertSafeManagedPath(root, path.relative(root, skillFile));
    const source = await readFile(skillFile, "utf8");
    const details = metadata(source);
    skills.push({
      directory: entry.name,
      directoryPath,
      file: skillFile,
      name: details.name || entry.name,
      description: details.description || "",
      source,
      hash: await directoryHash(directoryPath)
    });
  }
  return skills;
}

function skillHelpPrompt(skill) {
  const sections = ["Purpose", "Preconditions", "Inputs", "Approved Tools and Resources", "Read and Write Boundaries", "Procedure", "Validation", "Outputs", "Failure Behavior", "Approval Gates", "Composition and Dependencies", "Examples"];
  const details = sections.map((heading) => {
    const items = sectionItems(skill.source, heading);
    return items.length ? `\n### ${heading}\n${items.map((item) => `- ${item}`).join("\n")}` : "";
  }).join("");
  return `---\nmode: agent\ndescription: Help for the ${skill.name} skill.\n---\n\n# ${skill.name} Help\n\n${skill.description}\n\nRead the complete contract at .github/skills/${skill.name}/SKILL.md before using this skill.${details}\n\n## Related commands\n\n- Run the skill with /${skill.name}.\n- Open this help with /${skill.name}-help.\n- Inspect the full contract with @.github/skills/${skill.name}/SKILL.md.\n`;
}

async function installedSourceIdentity() {
  return {
    framework: {
      version: FRAMEWORK_VERSION,
      digest: await digestManagedPath(path.join(SCRIPT_ROOT, ".github", "skills"), { scope: "framework-skills" })
    },
    runtime: {
      version: VERSION,
      digest: await digestManagedPath(path.join(SCRIPT_ROOT, "pso.mjs"), { scope: "runtime" })
    }
  };
}

function managedRegionContent(source, blocks) {
  return blocks.map((block) => source.match(managedRegionPattern(block.id))?.[0] ?? "").join("\n");
}

async function buildBaselineLock(projectRoot, baselineAt, installedSource) {
  const entries = new Map();
  const addFile = async (relative, { scope = "whole-file", dependencies = [], generatedCompanions = [], content } = {}) => {
    const normalized = normalizedRelativePath(relative);
    if (entries.has(normalized)) return;
    const target = path.join(projectRoot, normalized);
    if (content === undefined && !existsSync(target)) return;
    const digest = content === undefined
      ? await digestManagedPath(target, { scope })
      : digestManagedBuffer(Buffer.from(content, "utf8"), { kind: "text" });
    entries.set(normalized, {
      assetId: `managed:${normalized}`,
      path: normalized,
      scope,
      ownership: "framework",
      policy: "track",
      normalizedBaseDigest: digest,
      dependencies,
      generatedCompanions
    });
  };

  const frameworkSkills = await discoverSkills(SCRIPT_ROOT);
  const skillId = (name) => `managed:.github/skills/${name}/SKILL.md`;
  for (const skill of frameworkSkills) {
    const skillRoot = path.join(SCRIPT_ROOT, ".github", "skills", skill.directory);
    for (const child of await walkFiles(skillRoot)) {
      const relative = `.github/skills/${skill.directory}/${child}`;
      const isContract = child === "SKILL.md";
      await addFile(relative, {
        scope: `skill:${skill.name}`,
        dependencies: isContract ? dependencyItems(skill.source).map(skillId).sort() : [],
        generatedCompanions: isContract ? [`managed:.github/prompts/${skill.name}-help.prompt.md`] : []
      });
    }
    await addFile(`.github/prompts/${skill.name}-help.prompt.md`, { scope: `skill-help:${skill.name}` });
  }

  for (const child of await walkFiles(path.join(SCRIPT_ROOT, "schemas"))) {
    await addFile(`schemas/${child}`, { scope: "framework-schema" });
  }
  await addFile("config/profiles.yaml", { scope: "framework-configuration" });

  const scaffoldTemplates = await loadScaffoldManifest();
  for (const template of scaffoldTemplates) {
    const source = path.join(SCRIPT_ROOT, TEMPLATE_ROOT_RELATIVE, template.path);
    const destination = path.join(projectRoot, template.path);
    if (existsSync(destination) && await sameFile(source, destination)) {
      await addFile(template.path, { scope: `scaffold:${template.kind}` });
    }
  }

  for (const [relative, blocks] of [
    [".github/copilot-instructions.md", COPILOT_INSTRUCTION_BLOCKS],
    ["AGENTS.md", AGENT_INSTRUCTION_BLOCKS]
  ]) {
    const target = path.join(projectRoot, relative);
    if (existsSync(target)) {
      const source = await readFile(target, "utf8");
      await addFile(relative, { scope: "managed-regions", content: managedRegionContent(source, blocks) });
    }
  }
  await addFile("config/orchestrator.yaml", { scope: "orchestrator-configuration" });

  const sortedEntries = [...entries.values()].sort((left, right) => left.path < right.path ? -1 : left.path > right.path ? 1 : 0);
  const ids = new Set(sortedEntries.map((entry) => entry.assetId));
  for (const entry of sortedEntries) {
    for (const reference of [...entry.dependencies, ...entry.generatedCompanions]) {
      if (!ids.has(reference)) throw new Error(`Managed lock reference does not resolve: ${entry.assetId} -> ${reference}`);
    }
  }
  return {
    schemaVersion: PROJECT_LOCK_SCHEMA_VERSION,
    digestAlgorithm: DIGEST_ALGORITHM,
    baselineAt,
    installedSource,
    entries: sortedEntries
  };
}

function manifestUpdateFields(installedSource) {
  return {
    schemaVersion: PROJECT_MANIFEST_SCHEMA_VERSION,
    lockPath: PROJECT_LOCK_PATH,
    lockSchemaVersion: PROJECT_LOCK_SCHEMA_VERSION,
    digestAlgorithm: DIGEST_ALGORITHM,
    installedSource,
    minimumUpdaterRuntimeVersion: VERSION
  };
}

async function printSkillHelp(skillName) {
  const requested = skillName?.trim().toLowerCase();
  if (!requested) return false;
  const skill = (await discoverSkills(SCRIPT_ROOT)).find((item) => item.name === requested);
  if (!skill) throw new Error(`Unknown skill: ${skillName}. Run node .\\pso.mjs help to see general usage, or inspect .github\\skills.`);
  console.log(skillHelpPrompt(skill));
  return true;
}

async function buildAdoptionPlan(projectRoot, profileOverride, projectNameOverride, { forceTemplates = false, forceAdopt = false, stackOverride = "" } = {}) {
  const requestedRoot = path.resolve(projectRoot);
  if (!existsSync(requestedRoot)) throw new Error(`Repository path does not exist: ${requestedRoot}`);
  const root = await realpath(requestedRoot);
  if (!(await stat(root)).isDirectory()) throw new Error(`Repository path is not a directory: ${root}`);
  if (!forceAdopt && !(await isMeaningfulProject(root))) {
    throw new Error(`No recognizable project marker was found at ${root}. Confirm this is the intended repository and rerun with --force-adopt to proceed anyway.`);
  }
  await assertSafeAdoptionPaths(root);
  const resolvedConfiguration = await resolveConfiguration(root, profileOverride);
  const profile = resolvedConfiguration.profile;
  const projectName = projectNameOverride ?? path.basename(root);

  const actions = [];
  const frameworkSkills = await discoverSkills(SCRIPT_ROOT);
  const projectSkills = await discoverSkills(root);
  const projectSkillsByName = new Map();
  for (const skill of projectSkills) {
    const matches = projectSkillsByName.get(skill.name) ?? [];
    matches.push(skill);
    projectSkillsByName.set(skill.name, matches);
  }
  for (const frameworkSkill of frameworkSkills) {
    const destination = path.join(root, ".github", "skills", frameworkSkill.directory);
    const projectRelative = path.relative(root, destination).replaceAll("\\", "/");
    const legacyNames = [...LEGACY_SKILL_IDS.entries()]
      .filter(([, replacement]) => replacement === frameworkSkill.name)
      .map(([legacy]) => legacy);
    const matches = [
      ...(projectSkillsByName.get(frameworkSkill.name) ?? []),
      ...legacyNames.flatMap((legacy) => projectSkillsByName.get(legacy) ?? [])
    ];
    const canonical = matches.find((skill) => path.resolve(skill.directoryPath) === path.resolve(destination));
    if (canonical?.hash === frameworkSkill.hash) {
      actions.push({ action: "already-current", kind: "skill", path: projectRelative });
    } else if (canonical || matches.length > 0 || existsSync(destination)) {
      actions.push({
        action: "update-skill",
        kind: "skill",
        path: projectRelative,
        source: frameworkSkill.directoryPath,
        reason: `Replace the existing ${frameworkSkill.name} contract with the current framework contract`
      });
    } else {
      actions.push({ action: "create", kind: "skill", path: projectRelative, source: frameworkSkill.directoryPath });
    }
    for (const duplicate of matches.filter((skill) => skill !== canonical && path.resolve(skill.directoryPath) !== path.resolve(destination))) {
      actions.push({
        action: "replace-duplicate",
        kind: "skill",
        path: path.relative(root, path.dirname(duplicate.file)).replaceAll("\\", "/"),
        canonicalPath: projectRelative,
        reason: LEGACY_SKILL_IDS.get(duplicate.name) === frameworkSkill.name
          ? `Migrate legacy skill ID ${duplicate.name} to ${frameworkSkill.name}`
          : `Duplicate skill identity: ${frameworkSkill.name}`
      });
    }
  }
  const frameworkNames = new Set(frameworkSkills.map((skill) => skill.name));
  for (const projectSkill of projectSkills) {
    if (frameworkNames.has(projectSkill.name) || LEGACY_SKILL_IDS.has(projectSkill.name)) continue;
    let migratedSource = projectSkill.source;
    const migrations = [];
    for (const [legacyName, replacement] of LEGACY_SKILL_IDS) {
      if (!migratedSource.includes(legacyName)) continue;
      migratedSource = migratedSource.replaceAll(legacyName, replacement);
      migrations.push({ from: legacyName, to: replacement });
    }
    if (migrations.length) {
      actions.push({
        action: "update-skill-references",
        kind: "skill-reference",
        path: path.relative(root, projectSkill.file).replaceAll("\\", "/"),
        migrations,
        reason: `Migrate framework skill references: ${migrations.map((migration) => `${migration.from} -> ${migration.to}`).join(", ")}`
      });
    }
  }

  for (const relative of await walkFiles(path.join(SCRIPT_ROOT, "schemas"))) {
    const source = path.join(SCRIPT_ROOT, "schemas", relative);
    const destination = path.join(root, "schemas", relative);
    const projectRelative = path.relative(root, destination).replaceAll("\\", "/");
    if (!existsSync(destination)) actions.push({ action: "create", kind: "schema", path: projectRelative, source });
    else if (await sameFile(source, destination)) actions.push({ action: "already-current", kind: "schema", path: projectRelative });
    else actions.push({ action: "update-framework-file", kind: "schema", path: projectRelative, source, reason: "Synchronize the installed framework schema" });
  }

  const standaloneFiles = [
    {
      path: "config/profiles.yaml",
      source: path.join(SCRIPT_ROOT, "config", "profiles.yaml"),
      kind: "configuration"
    }
  ];
  for (const item of standaloneFiles) {
    const destination = path.join(root, item.path);
    if (!existsSync(destination)) actions.push({ action: "create", ...item });
    else if (await sameFile(item.source, destination)) actions.push({ action: "already-current", ...item });
    else actions.push({ action: "update-framework-file", ...item, reason: "Synchronize the installed framework configuration" });
  }

  for (const skill of frameworkSkills) {
    const helpPath = `.github/prompts/${skill.name}-help.prompt.md`;
    const destination = path.join(root, helpPath);
    const content = skillHelpPrompt(skill);
    if (!existsSync(destination)) actions.push({ action: "create", kind: "help", path: helpPath, content });
    else if (await readFile(destination, "utf8") === content) actions.push({ action: "already-current", kind: "help", path: helpPath });
    else actions.push({ action: "update-wiring-file", kind: "help", path: helpPath, content, reason: "Regenerate help from the current skill contract" });
  }

  for (const [legacyName, replacement] of LEGACY_SKILL_IDS) {
    const helpPath = `.github/prompts/${legacyName}-help.prompt.md`;
    const destination = path.join(root, helpPath);
    if (!existsSync(destination)) continue;
    const source = await readFile(destination, "utf8");
    if (source.includes(`.github/skills/${legacyName}/SKILL.md`)) {
      actions.push({
        action: "remove-duplicate-command",
        kind: "help",
        path: helpPath,
        canonicalPath: `.github/prompts/${replacement}-help.prompt.md`,
        reason: `Remove legacy ${legacyName} help after migration to ${replacement}`
      });
    } else {
      actions.push({
        action: "conflict",
        kind: "help",
        path: helpPath,
        reason: `Legacy help path ${helpPath} is not recognized as framework-owned`
      });
    }
  }

  for (const skillName of DEPRECATED_DUPLICATE_PROMPTS) {
    const promptPath = `.github/prompts/${skillName}.prompt.md`;
    const destination = path.join(root, promptPath);
    if (!existsSync(destination)) continue;
    const source = await readFile(destination, "utf8");
    if (source.includes(`Run the \`${skillName}\` skill`)) {
      actions.push({
        action: "remove-duplicate-command",
        kind: "prompt",
        path: promptPath,
        canonicalPath: `.github/skills/${skillName}/SKILL.md`,
        reason: `Remove obsolete prompt command that duplicates the ${skillName} skill`
      });
    } else {
      actions.push({
        action: "conflict",
        kind: "prompt",
        path: promptPath,
        reason: `Prompt name duplicates the ${skillName} skill but is not recognized as framework-owned`
      });
    }
  }

  const scaffoldTemplates = await loadScaffoldManifest();
  const detectedResult = await detectProjectStack(root);
  const detectedStack = detectedResult.tags;
  const explicitStack = stackOverride ? parseStackOption(stackOverride) : new Set();
  for (const tag of explicitStack) detectedStack.add(tag);
  const customizationAssets = await discoverCustomizationAssets(root);
  for (const template of scaffoldTemplates) {
    if (template.createOnly || ADOPTION_TEMPLATE_EXCLUSIONS.has(template.path)) continue;
    const destination = path.join(root, template.path);
    const projectRelative = path.relative(root, destination).replaceAll("\\", "/");
    if (existsSync(destination)) {
      actions.push({ action: "already-current", kind: "scaffold", path: projectRelative });
      continue;
    }
    if (!templateApplies(template, detectedStack)) {
      actions.push({
        action: "skipped",
        kind: "scaffold",
        path: projectRelative,
        reason: `No detected stack matches ${template.requires.join(", ")}`
      });
      continue;
    }
    const equivalent = template.mandatory || forceTemplates ? null : findEquivalentAsset(template, customizationAssets);
    if (equivalent) {
      actions.push({
        action: "covered",
        kind: "scaffold",
        path: projectRelative,
        coveredBy: equivalent.path,
        reason: `Existing ${template.kind} already covers ${template.purpose}; use --force-templates to install anyway`
      });
      continue;
    }
    const overlap = template.mandatory || forceTemplates ? null : findOverlappingAsset(template, customizationAssets);
    if (overlap) {
      actions.push({
        action: "overlap",
        kind: "scaffold",
        path: projectRelative,
        overlapsWith: overlap.path,
        reason: `Existing ${template.kind} overlaps ${template.purpose} but is too small to suppress the framework standard`
      });
    }
    actions.push({
      action: "create",
      kind: "scaffold",
      path: projectRelative,
      source: path.join(SCRIPT_ROOT, TEMPLATE_ROOT_RELATIVE, template.path)
    });
  }

  const manifestPath = path.join(root, "project-orchestrator.json");
  let existingManifest = {};
  const now = new Date().toISOString();
  if (existsSync(manifestPath)) {
    try {
      existingManifest = JSON.parse(await readFile(manifestPath, "utf8"));
    } catch (error) {
      actions.push({ action: "conflict", kind: "manifest", path: "project-orchestrator.json", reason: `Existing manifest is invalid JSON: ${error.message}` });
    }
  }
  const manifestFields = {
    ...existingManifest,
    ...manifestUpdateFields(await installedSourceIdentity()),
    projectName: existingManifest.projectName || projectName,
    frameworkVersion: FRAMEWORK_VERSION,
    runtimeVersion: VERSION,
    conformanceProfile: profile,
    resolvedConfiguration,
    adoptedAt: existingManifest.adoptedAt || now,
    status: "adopted",
    nextAction: "Run development-environment-readiness before the next implementation objective"
  };
  const manifestChanged = Object.entries(manifestFields)
    .some(([key, value]) => key !== "updatedAt" && JSON.stringify(existingManifest[key]) !== JSON.stringify(value));
  const manifest = {
    ...manifestFields,
    updatedAt: manifestChanged ? now : existingManifest.updatedAt || existingManifest.adoptedAt || now
  };
  const orchestratorPath = path.join(root, "config", "orchestrator.yaml");
  const currentOrchestrator = existsSync(orchestratorPath) ? await readFile(orchestratorPath, "utf8") : "";
  const orchestratorContent = mergeProjectOrchestratorConfiguration(
    currentOrchestrator,
    `frameworkVersion: ${FRAMEWORK_VERSION}\nruntimeVersion: ${VERSION}\nprofile: ${profile}\npaths:\n  skills: .github/skills\n  reports: reports\n  schemas: schemas\nruntime:\n  eventStream: reports/execution-log.jsonl\n  stateSnapshot: reports/current-execution-state.json\n  appendOnly: true\nproject:\n  name: ${projectName}\n  adopted: true\n`
  );
  const instructionPath = path.join(root, ".github", "copilot-instructions.md");
  const currentInstructions = existsSync(instructionPath) ? await readFile(instructionPath, "utf8") : "";
  const mergedInstructions = mergeInstructionBlocks(currentInstructions, COPILOT_INSTRUCTION_BLOCKS);
  const instructionContent = mergedInstructions.content;
  const agentPath = path.join(root, "AGENTS.md");
  const currentAgentInstructions = existsSync(agentPath) ? await readFile(agentPath, "utf8") : "";
  const mergedAgentInstructions = mergeInstructionBlocks(currentAgentInstructions, AGENT_INSTRUCTION_BLOCKS);
  const agentContent = mergedAgentInstructions.content;
  for (const [relative, merge] of [[".github/copilot-instructions.md", mergedInstructions], ["AGENTS.md", mergedAgentInstructions]]) {
    for (const reason of merge.conflicts) {
      actions.push({ action: "conflict", kind: "instructions", path: relative, reason });
    }
  }
  const generated = [
    {
      path: "project-orchestrator.json",
      kind: "manifest",
      content: `${JSON.stringify(manifest, null, 2)}\n`
    },
    {
      path: "config/orchestrator.yaml",
      kind: "configuration",
      content: orchestratorContent
    },
    {
      path: CONFIGURATION_PATH.replaceAll("\\", "/"),
      kind: "configuration",
      content: `${JSON.stringify(resolvedConfiguration, null, 2)}\n`,
      preserveExisting: true
    },
    {
      path: ".github/copilot-instructions.md",
      kind: "instructions",
      content: instructionContent
    },
    {
      path: "AGENTS.md",
      kind: "instructions",
      content: agentContent
    },
    {
      path: ".vscode/extensions.json",
      kind: "workspace-support",
      content: workspaceExtensions(detectedStack),
      preserveExisting: true
    },
    {
      path: ".vscode/settings.json",
      kind: "workspace-support",
      content: workspaceSettings(),
      preserveExisting: true
    }
  ];
  const detectedTaskContent = workspaceTasks(detectedStack);
  if (detectedTaskContent) {
    generated.push({ path: ".vscode/tasks.json", kind: "workspace-support", content: detectedTaskContent, preserveExisting: true });
  }
  const detectedLaunchContent = workspaceLaunch(detectedStack);
  if (detectedLaunchContent) {
    generated.push({ path: ".vscode/launch.json", kind: "workspace-support", content: detectedLaunchContent, preserveExisting: true });
  }
  for (const item of generated) {
    const destination = path.join(root, item.path);
    if (!existsSync(destination)) actions.push({ action: "create", ...item });
    else if (item.preserveExisting) {
      actions.push({ action: "already-current", ...item });
    } else {
      const current = await readFile(destination, "utf8");
      actions.push(current === item.content
        ? { action: "already-current", ...item }
        : { action: "update-wiring-file", ...item, reason: "Synchronize required project orchestration wiring while preserving a backup" });
    }
  }

  const counts = Object.fromEntries(
    ["create", "update-skill", "update-skill-references", "update-framework-file", "update-wiring-file", "replace-duplicate", "remove-duplicate-command", "already-current", "skipped", "covered", "overlap", "conflict"]
      .map((action) => [action, actions.filter((item) => item.action === action).length])
  );
  await assertSafeAdoptionPaths(root, actions);
  for (const action of actions.filter((item) => MUTATING_ADOPTION_ACTIONS.has(item.action))) {
    action.expectedDestinationState = await managedPathState(root, action.path);
  }
  return {
    schemaVersion: "1.0.0",
    runtimeVersion: VERSION,
    generatedAt: new Date().toISOString(),
    projectRoot: root,
    projectName,
    profile,
    resolvedConfiguration,
    mode: "existing-project-adoption",
    detectedStack: [...detectedStack].sort(),
    stackScanTruncated: detectedResult.truncated,
    actions,
    counts,
    canApply: counts.conflict === 0
  };
}

function printAdoptionPlan(plan) {
  console.log(`\nExisting project: ${plan.projectRoot}`);
  console.log(`Profile: ${plan.profile}`);
  console.log(`Detected stack: ${plan.detectedStack.length ? plan.detectedStack.join(", ") : "none detected"}`);
  if (plan.stackScanTruncated) console.log("Warning: stack detection reached its scan limit; use --stack to declare any missed stacks.");
  console.log(`Files to create: ${plan.counts.create}`);
  console.log(`Existing skills to update: ${plan.counts["update-skill"]}`);
  console.log(`Project skill references to migrate: ${plan.counts["update-skill-references"]}`);
  console.log(`Framework files to update: ${plan.counts["update-framework-file"]}`);
  console.log(`Wiring files to update: ${plan.counts["update-wiring-file"]}`);
  console.log(`Duplicate skills to replace: ${plan.counts["replace-duplicate"]}`);
  console.log(`Duplicate prompt commands to remove: ${plan.counts["remove-duplicate-command"]}`);
  console.log(`Templates skipped as not applicable: ${plan.counts.skipped}`);
  console.log(`Templates covered by existing files: ${plan.counts.covered}`);
  console.log(`Templates overlapping existing files: ${plan.counts.overlap}`);
  console.log(`Already current: ${plan.counts["already-current"]}`);
  console.log(`Blocking conflicts: ${plan.counts.conflict}`);
  for (const item of plan.actions.filter((action) => action.action === "covered")) {
    console.log(`  covered: ${item.path} by ${item.coveredBy}`);
  }
  for (const item of plan.actions.filter((action) => action.action === "overlap")) {
    console.log(`  overlap: ${item.path} with ${item.overlapsWith}`);
  }
  if (plan.counts.conflict) {
    console.log("\nConflicts:");
    for (const item of plan.actions.filter((action) => action.action === "conflict")) {
      console.log(`  - ${item.path}${item.reason ? `: ${item.reason}` : ""}`);
    }
  }
}

function portableAdoptionPlan(plan) {
  const { projectRoot, ...portablePlan } = plan;
  return {
    ...portablePlan,
    project: { name: plan.projectName ?? path.basename(projectRoot) },
    actions: plan.actions.map(({ source, content, ...action }) => action)
  };
}

async function baselineEntryDigest(projectRoot, entry) {
  const target = path.join(projectRoot, entry.path);
  if (entry.scope !== "managed-regions") return digestManagedPath(target, { scope: entry.scope });
  const blocks = entry.path === "AGENTS.md" ? AGENT_INSTRUCTION_BLOCKS : COPILOT_INSTRUCTION_BLOCKS;
  return digestManagedBuffer(Buffer.from(managedRegionContent(await readFile(target, "utf8"), blocks), "utf8"), { kind: "text" });
}

async function validateBaselineLock(projectRoot, manifest) {
  if (manifest.schemaVersion !== PROJECT_MANIFEST_SCHEMA_VERSION) throw new Error(`Unsupported manifest schemaVersion: ${manifest.schemaVersion ?? "missing"}`);
  if (manifest.lockPath !== PROJECT_LOCK_PATH || manifest.lockSchemaVersion !== PROJECT_LOCK_SCHEMA_VERSION) {
    throw new Error("Manifest lock metadata is not current");
  }
  if (manifest.digestAlgorithm !== DIGEST_ALGORITHM || manifest.minimumUpdaterRuntimeVersion !== VERSION) {
    throw new Error("Manifest digest or updater compatibility metadata is not current");
  }
  const lock = JSON.parse(await readFile(path.join(projectRoot, manifest.lockPath), "utf8"));
  if (lock.schemaVersion !== PROJECT_LOCK_SCHEMA_VERSION || lock.digestAlgorithm !== DIGEST_ALGORITHM) {
    throw new Error("Baseline lock schema or digest algorithm is not current");
  }
  if (JSON.stringify(lock.installedSource) !== JSON.stringify(manifest.installedSource)) {
    throw new Error("Manifest and baseline lock source identities do not agree");
  }
  const paths = lock.entries.map((entry) => entry.path);
  const assetIds = lock.entries.map((entry) => entry.assetId);
  if (new Set(paths).size !== paths.length || new Set(assetIds).size !== assetIds.length) {
    throw new Error("Baseline lock contains duplicate paths or asset IDs");
  }
  const sortedPaths = [...paths].sort((left, right) => left < right ? -1 : left > right ? 1 : 0);
  if (JSON.stringify(paths) !== JSON.stringify(sortedPaths)) throw new Error("Baseline lock entries are not path-sorted");
  const knownIds = new Set(assetIds);
  for (const entry of lock.entries) {
    if (path.isAbsolute(entry.path) || normalizedRelativePath(entry.path) !== entry.path || entry.path.split("/").includes("..")) {
      throw new Error(`Baseline lock contains an unsafe path: ${entry.path}`);
    }
    if (entry.assetId !== `managed:${entry.path}`) throw new Error(`Baseline lock asset ID is not stable for ${entry.path}`);
    for (const reference of [...entry.dependencies, ...entry.generatedCompanions]) {
      if (!knownIds.has(reference)) throw new Error(`Baseline lock reference does not resolve: ${entry.assetId} -> ${reference}`);
    }
    if (await baselineEntryDigest(projectRoot, entry) !== entry.normalizedBaseDigest) {
      throw new Error(`Baseline lock digest does not match ${entry.path}`);
    }
  }
  return lock;
}

function assertUniquePortablePaths(paths, label) {
  const exact = new Set();
  const folded = new Map();
  for (const candidate of paths) {
    validateRelativePath(candidate);
    const normalized = normalizedRelativePath(candidate);
    if (normalized !== candidate) throw new Error(`${label} path is not canonical: ${candidate}`);
    if (exact.has(candidate)) throw new Error(`Duplicate ${label} path: ${candidate}`);
    exact.add(candidate);
    const key = candidate.toLowerCase();
    if (folded.has(key)) throw new Error(`Case-collision ${label} paths: ${folded.get(key)} and ${candidate}`);
    folded.set(key, candidate);
  }
}

function validateExactAssetPath(candidate, label) {
  validateRelativePath(candidate);
  const normalized = normalizedRelativePath(candidate);
  if (normalized !== candidate) throw new Error(`${label} path is not canonical: ${candidate}`);
  if (candidate.endsWith("/") || /[*?\[\]{}!]/.test(candidate)) {
    throw new Error(`${label} must be an exact asset path: ${candidate}`);
  }
}

function splitSelectors(value, label) {
  if (value === undefined) return [];
  const values = String(value).split(",").map((item) => item.trim()).filter(Boolean);
  if (new Set(values).size !== values.length) throw new Error(`Duplicate ${label} selector`);
  return values;
}

function validateSelectionItems(items, label, allowedFields, valueField) {
  if (!Array.isArray(items)) throw new Error(`${label} must be an array`);
  const seen = new Set();
  for (const item of items) {
    if (!isRecord(item)) throw new Error(`${label} entries must be objects`);
    rejectUnknownFields(item, allowedFields, label);
    const asset = item.asset;
    if (typeof asset !== "string") throw new Error(`${label} asset must be a string`);
    validateExactAssetPath(asset, label);
    const key = asset.toLowerCase();
    if (seen.has(key)) throw new Error(`Duplicate ${label} disposition for ${asset}`);
    seen.add(key);
    if (!valueField.values.includes(item[valueField.name])) throw new Error(`Unsupported ${label} ${valueField.name}: ${item[valueField.name] ?? "missing"}`);
    const isFork = item[valueField.name] === "fork";
    if (isFork && typeof item.forkSkillId !== "string") throw new Error(`${label} fork requires forkSkillId`);
    if (!isFork && item.forkSkillId !== undefined) throw new Error(`${label} forkSkillId is only valid for fork`);
    if (item.forkSkillId !== undefined && !/^[a-z][a-z0-9]*(?:-[a-z0-9]+)*$/.test(item.forkSkillId)) {
      throw new Error(`Invalid ${label} forkSkillId: ${item.forkSkillId}`);
    }
  }
  return items;
}

async function readUpdateSelection(options) {
  const cliSkills = splitSelectors(options.skills, "skill");
  const cliAssets = splitSelectors(options.assets, "asset");
  let fileSelection = null;
  let selectionFileDigest = null;
  if (options["selection-file"]) {
    try {
      const selectionContent = await readFile(path.resolve(options["selection-file"]), "utf8");
      selectionFileDigest = createHash("sha256").update(selectionContent).digest("hex");
      fileSelection = JSON.parse(selectionContent);
    } catch (error) {
      throw new Error(`Invalid update selection file: ${error.message}`);
    }
    if (!isRecord(fileSelection)) throw new Error("Invalid update selection file: expected an object");
    rejectUnknownFields(fileSelection, ["schemaVersion", "expectedPlanDigest", "target", "selectors", "policyChanges", "resolutions", "exactForcePaths"], "selection");
    if (fileSelection.schemaVersion !== PROJECT_UPDATE_SELECTION_SCHEMA_VERSION) {
      throw new Error(`Unsupported update selection schemaVersion: ${fileSelection.schemaVersion ?? "missing"}`);
    }
    if (!/^[a-f0-9]{64}$/.test(fileSelection.expectedPlanDigest ?? "")) throw new Error("Selection expectedPlanDigest must be SHA-256");
    if (!isRecord(fileSelection.target)) throw new Error("Selection target must be an object");
    rejectUnknownFields(fileSelection.target, ["projectName", "frameworkVersion", "runtimeVersion", "installedSource"], "selection target");
    if (!isRecord(fileSelection.selectors)) throw new Error("Selection selectors must be an object");
    rejectUnknownFields(fileSelection.selectors, ["skills", "assets"], "selection selectors");
    if (!Array.isArray(fileSelection.selectors.skills) || !Array.isArray(fileSelection.selectors.assets)) {
      throw new Error("Selection selectors must contain skills and assets arrays");
    }
  }
  const fileSkills = fileSelection?.selectors.skills ?? [];
  const fileAssets = fileSelection?.selectors.assets ?? [];
  const skills = [...cliSkills, ...fileSkills];
  const assets = [...cliAssets, ...fileAssets];
  if (skills.some((skill) => typeof skill !== "string" || !/^[a-z][a-z0-9]*(?:-[a-z0-9]+)*$/.test(skill))) {
    throw new Error("Skill selectors must be canonical skill IDs");
  }
  if (new Set(skills).size !== skills.length) throw new Error("Duplicate skill selector");
  if (assets.some((asset) => typeof asset !== "string")) throw new Error("Asset selectors must be strings");
  assertUniquePortablePaths(assets, "asset selector");
  for (const asset of assets) validateExactAssetPath(asset, "asset selector");
  const policyChanges = validateSelectionItems(fileSelection?.policyChanges ?? [], "policy change", ["asset", "policy", "forkSkillId"], {
    name: "policy", values: ["track", "pin", "fork"]
  });
  const resolutions = validateSelectionItems(fileSelection?.resolutions ?? [], "resolution", ["asset", "disposition", "forkSkillId"], {
    name: "disposition", values: ["keep", "replace", "fork", "remove"]
  });
  const exactForcePaths = fileSelection?.exactForcePaths ?? [];
  if (!Array.isArray(exactForcePaths) || exactForcePaths.some((asset) => typeof asset !== "string")) {
    throw new Error("exactForcePaths must be an array of paths");
  }
  assertUniquePortablePaths(exactForcePaths, "exact force");
  for (const asset of exactForcePaths) validateExactAssetPath(asset, "exact force");
  if (exactForcePaths.length > 0 && options["accept-risk"] !== true) {
    throw new Error("Exact force replacement requires --accept-risk");
  }
  return {
    selectionFileDigest,
    expectedPlanDigest: fileSelection?.expectedPlanDigest ?? null,
    expectedTarget: fileSelection?.target ?? null,
    selectors: { skills: skills.sort(), assets: assets.sort() },
    policyChanges,
    resolutions,
    exactForcePaths: [...exactForcePaths].sort()
  };
}

function validateSourceIdentity(source, label) {
  if (!isRecord(source)) throw new Error(`Invalid update baseline: ${label} must be an object`);
  rejectUnknownFields(source, ["framework", "runtime"], label);
  for (const componentName of ["framework", "runtime"]) {
    const component = source[componentName];
    if (!isRecord(component)) throw new Error(`Invalid update baseline: ${label}.${componentName} must be an object`);
    rejectUnknownFields(component, ["version", "digest"], `${label}.${componentName}`);
    if (!/^\d+\.\d+\.\d+$/.test(component.version ?? "") || !/^[a-f0-9]{64}$/.test(component.digest ?? "")) {
      throw new Error(`Invalid update baseline: ${label}.${componentName} requires a semantic version and SHA-256 digest`);
    }
  }
}

async function validBaselineScope(entry) {
  const skill = /^skill:([a-z][a-z0-9]*(?:-[a-z0-9]+)*)$/.exec(entry.scope);
  if (skill) return entry.path.startsWith(`.github/skills/${skill[1]}/`);
  const skillHelp = /^skill-help:([a-z][a-z0-9]*(?:-[a-z0-9]+)*)$/.exec(entry.scope);
  if (skillHelp) return entry.path === `.github/prompts/${skillHelp[1]}-help.prompt.md`;
  const legacyDuplicate = /^legacy-duplicate:([a-z][a-z0-9]*(?:-[a-z0-9]+)*)$/.exec(entry.scope);
  if (legacyDuplicate) return [...LEGACY_SKILL_IDS].some(([legacyName, replacement]) => replacement === legacyDuplicate[1]
    && entry.path === `.github/skills/${legacyName}`);
  const legacyHelp = /^legacy-help:([a-z][a-z0-9]*(?:-[a-z0-9]+)*)$/.exec(entry.scope);
  if (legacyHelp) return [...LEGACY_SKILL_IDS].some(([legacyName, replacement]) => replacement === legacyHelp[1]
    && entry.path === `.github/prompts/${legacyName}-help.prompt.md`);
  if (entry.scope === "framework-schema") return entry.path.startsWith("schemas/");
  if (entry.scope === "framework-configuration") return entry.path === "config/profiles.yaml";
  if (entry.scope === "managed-regions") return new Set([".github/copilot-instructions.md", "AGENTS.md"]).has(entry.path);
  if (entry.scope === "orchestrator-configuration") return entry.path === "config/orchestrator.yaml";
  const scaffold = /^scaffold:(workspace-support|documentation|instructions|scoped-instructions|prompt|deployment|agent)$/.exec(entry.scope);
  if (!scaffold) return false;
  return (await loadScaffoldManifest()).some((template) => template.path === entry.path && template.kind === scaffold[1]);
}

async function validateUpdateLock(projectRoot, lock, manifest) {
  rejectUnknownFields(lock, ["schemaVersion", "digestAlgorithm", "baselineAt", "installedSource", "entries"], "baseline lock");
  if (lock.schemaVersion !== PROJECT_LOCK_SCHEMA_VERSION) {
    throw new Error(`Unsupported lock schemaVersion: ${lock.schemaVersion ?? "missing"}. Use a compatible updater or restore the prior manifest and lock pair from backup.`);
  }
  if (lock.digestAlgorithm !== DIGEST_ALGORITHM || !Array.isArray(lock.entries)) {
    throw new Error("Invalid update baseline: lock digest algorithm and entries are required");
  }
  if (typeof lock.baselineAt !== "string" || !/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/.test(lock.baselineAt)
    || Number.isNaN(Date.parse(lock.baselineAt))) {
    throw new Error("Invalid update baseline: lock baselineAt must be an ISO date-time");
  }
  validateSourceIdentity(lock.installedSource, "baseline lock installedSource");
  if (canonicalJson(lock.installedSource) !== canonicalJson(manifest.installedSource)) {
    throw new Error("Invalid update baseline: manifest and lock metadata do not agree");
  }
  const paths = lock.entries.map((entry) => entry?.path);
  assertUniquePortablePaths(paths, "baseline");
  const assetIds = lock.entries.map((entry) => entry?.assetId);
  const ids = new Set(assetIds);
  if (ids.size !== lock.entries.length) throw new Error("Invalid update baseline: duplicate asset IDs");
  for (const entry of lock.entries) {
    if (!isRecord(entry)) throw new Error("Invalid update baseline entry: expected an object");
    rejectUnknownFields(entry, ["assetId", "path", "scope", "ownership", "policy", "forkSkillId", "normalizedBaseDigest", "dependencies", "generatedCompanions"], "baseline lock entry");
    if (entry.assetId !== `managed:${entry.path}` || !/^[a-f0-9]{64}$/.test(entry.normalizedBaseDigest ?? "")) {
      throw new Error(`Invalid update baseline entry: ${entry.path}`);
    }
    await assertSafeManagedPath(projectRoot, entry.path);
    if (typeof entry.scope !== "string" || !await validBaselineScope(entry)) throw new Error(`Invalid update baseline scope: ${entry.path}`);
    if (!new Set(["framework", "project-owned"]).has(entry.ownership)) throw new Error(`Invalid update baseline ownership: ${entry.path}`);
    if (!new Set(["track", "pin", "fork"]).has(entry.policy)) throw new Error(`Invalid update baseline policy: ${entry.path}`);
    if (entry.ownership === "project-owned" && entry.policy !== "pin") {
      throw new Error(`Invalid update baseline ownership and policy: ${entry.path}`);
    }
    const hasValidForkId = typeof entry.forkSkillId === "string" && /^[a-z][a-z0-9]*(?:-[a-z0-9]+)*$/.test(entry.forkSkillId);
    if ((entry.policy === "fork") !== hasValidForkId) throw new Error(`Invalid update baseline fork policy: ${entry.path}`);
    if (entry.policy === "fork" && !skillContractIdentity(entry)) throw new Error(`Invalid update baseline fork policy requires a skill contract: ${entry.path}`);
    if (entry.policy === "fork") {
      const forkContract = `.github/skills/${entry.forkSkillId}/SKILL.md`;
      await assertSafeManagedPath(projectRoot, forkContract);
      const forkName = existsSync(path.join(projectRoot, forkContract))
        ? metadata(await readFile(path.join(projectRoot, forkContract), "utf8")).name
        : null;
      const managedFork = lock.entries.some((candidate) => candidate.scope === `skill:${entry.forkSkillId}`
        && candidate.path.startsWith(`.github/skills/${entry.forkSkillId}/`));
      if (forkName !== entry.forkSkillId || managedFork) {
        throw new Error(`Invalid update baseline fork reference has no valid project-owned skill: ${entry.path}`);
      }
    }
    for (const field of ["dependencies", "generatedCompanions"]) {
      const references = entry[field];
      if (!Array.isArray(references) || references.some((reference) => typeof reference !== "string" || !reference.startsWith("managed:"))) {
        throw new Error(`Invalid update baseline ${field}: ${entry.path}`);
      }
      if (new Set(references).size !== references.length) throw new Error(`Invalid update baseline duplicate ${field}: ${entry.path}`);
      for (const reference of references) {
        if (reference === entry.assetId || !ids.has(reference)) throw new Error(`Invalid update baseline reference does not resolve: ${entry.assetId} -> ${reference}`);
      }
    }
  }
}

async function loadUpdateBaseline(projectRoot) {
  const manifestPath = path.join(projectRoot, "project-orchestrator.json");
  if (!existsSync(manifestPath)) throw new Error("Update requires project-orchestrator.json from creation or adoption");
  let manifest;
  try {
    manifest = JSON.parse(await readFile(manifestPath, "utf8"));
  } catch (error) {
    throw new Error(`Invalid update manifest: ${error.message}`);
  }
  if (!isRecord(manifest)) throw new Error("Invalid update manifest: expected an object");
  if (!new Set(["1.0.0", PROJECT_MANIFEST_SCHEMA_VERSION]).has(manifest.schemaVersion)) {
    throw new Error(`Unsupported manifest schemaVersion: ${manifest.schemaVersion ?? "missing"}. Use a compatible updater or restore the prior manifest and lock pair from backup.`);
  }
  if (typeof manifest.projectName !== "string" || !manifest.projectName || !/^\d+\.\d+\.\d+$/.test(manifest.frameworkVersion ?? "")
    || !/^\d+\.\d+\.\d+$/.test(manifest.runtimeVersion ?? "") || !PROFILES.has(manifest.conformanceProfile)) {
    throw new Error("Invalid update manifest: project identity, versions, and conformanceProfile are required");
  }
  if (manifest.schemaVersion === "1.0.0") {
    if (existsSync(path.join(projectRoot, PROJECT_LOCK_PATH))) {
      throw new Error("Invalid legacy baseline: manifest 1.0 must not have a 1.1 baseline lock. Restore the matching pre-migration pair from backup before retrying.");
    }
    const installedSource = await installedSourceIdentity();
    return {
      manifest,
      legacy: true,
      lock: {
        schemaVersion: PROJECT_LOCK_SCHEMA_VERSION,
        digestAlgorithm: DIGEST_ALGORITHM,
        baselineAt: manifest.updatedAt ?? manifest.adoptedAt ?? manifest.createdAt ?? "1970-01-01T00:00:00.000Z",
        installedSource,
        entries: []
      }
    };
  }
  if (manifest.lockPath !== PROJECT_LOCK_PATH || manifest.lockSchemaVersion !== PROJECT_LOCK_SCHEMA_VERSION
    || manifest.digestAlgorithm !== DIGEST_ALGORITHM || !isRecord(manifest.installedSource)) {
    throw new Error("Invalid update baseline: manifest 1.1 requires a valid lock 1.0 and matching digest metadata. Restore both files from backup or use the prior runtime to downgrade.");
  }
  if (!/^\d+\.\d+\.\d+$/.test(manifest.minimumUpdaterRuntimeVersion ?? "")) {
    throw new Error("Invalid update baseline: manifest 1.1 requires a valid minimumUpdaterRuntimeVersion");
  }
  if (compareSemanticVersions(VERSION, manifest.minimumUpdaterRuntimeVersion) < 0) {
    throw new Error(`Updater runtime ${VERSION} is older than required minimum ${manifest.minimumUpdaterRuntimeVersion}. Use a compatible updater or restore the complete pre-migration backup before downgrade use.`);
  }
  await assertSafeManagedPath(projectRoot, manifest.lockPath);
  let lock;
  try {
    lock = JSON.parse(await readFile(path.join(projectRoot, manifest.lockPath), "utf8"));
  } catch (error) {
    throw new Error(`Invalid update baseline: manifest 1.1 requires a valid lock 1.0 (${error.message}). Restore both files from backup or use the prior runtime to downgrade.`);
  }
  if (!isRecord(lock)) throw new Error("Invalid update baseline: lock must be an object");
  await validateUpdateLock(projectRoot, lock, manifest);
  return { manifest, lock, legacy: false };
}

async function addLegacyOwnershipEvidence(projectRoot, catalog, lock) {
  const addCatalog = (entry) => catalog.set(entry.assetId, entry);
  const addBaseline = (entry) => lock.entries.push(entry);
  const frameworkSkills = new Map((await discoverSkills(SCRIPT_ROOT)).map((skill) => [skill.name, skill]));
  for (const [legacyName, replacement] of LEGACY_SKILL_IDS) {
    const frameworkSkill = frameworkSkills.get(replacement);
    if (!frameworkSkill) continue;
    const legacyDirectory = `.github/skills/${legacyName}`;
    const legacyTarget = path.join(projectRoot, legacyDirectory);
    if (existsSync(legacyTarget)) {
      await assertSafeManagedPath(projectRoot, legacyDirectory);
      const expectedFiles = await walkFiles(frameworkSkill.directoryPath);
      const localFiles = await walkFiles(legacyTarget);
      let exact = canonicalJson(localFiles) === canonicalJson(expectedFiles);
      if (exact) {
        for (const child of expectedFiles) {
          const canonical = await readFile(path.join(frameworkSkill.directoryPath, child));
          const expected = child === "SKILL.md"
            ? Buffer.from(canonical.toString("utf8").replace(new RegExp(`^name: ${replacement}$`, "m"), `name: ${legacyName}`), "utf8")
            : canonical;
          if (!existsSync(path.join(legacyTarget, child)) || digestManagedBuffer(await readFile(path.join(legacyTarget, child))) !== digestManagedBuffer(expected)) {
            exact = false;
            break;
          }
        }
      }
      const assetId = `managed:${legacyDirectory}`;
      const scope = `legacy-duplicate:${replacement}`;
      if (exact) {
        addBaseline({ assetId, path: legacyDirectory, scope, ownership: "framework", policy: "track", normalizedBaseDigest: await digestManagedPath(legacyTarget, { scope }), dependencies: [], generatedCompanions: [] });
      } else {
        addCatalog({ assetId, path: legacyDirectory, scope, policy: "track", dependencies: [], generatedCompanions: [], upstreamDigest: await digestManagedPath(frameworkSkill.directoryPath, { scope }) });
      }
    }
    const legacyHelp = `.github/prompts/${legacyName}-help.prompt.md`;
    const helpTarget = path.join(projectRoot, legacyHelp);
    if (existsSync(helpTarget)) {
      await assertSafeManagedPath(projectRoot, legacyHelp);
      const expected = Buffer.from(skillHelpPrompt(frameworkSkill).replaceAll(replacement, legacyName), "utf8");
      const localDigest = digestManagedBuffer(await readFile(helpTarget));
      const expectedDigest = digestManagedBuffer(expected);
      const entry = { assetId: `managed:${legacyHelp}`, path: legacyHelp, scope: `legacy-help:${replacement}`, policy: "track", dependencies: [], generatedCompanions: [] };
      if (localDigest === expectedDigest) addBaseline({ ...entry, ownership: "framework", normalizedBaseDigest: localDigest });
      else addCatalog({ ...entry, upstreamDigest: expectedDigest });
    }
  }
  lock.entries.sort((left, right) => left.path < right.path ? -1 : left.path > right.path ? 1 : 0);
}

async function buildUpstreamCatalog(projectRoot, manifest, lock) {
  const catalog = new Map();
  const add = (entry) => catalog.set(entry.assetId, {
    assetId: entry.assetId,
    path: entry.path,
    scope: entry.scope,
    policy: entry.policy ?? "track",
    dependencies: [...(entry.dependencies ?? [])].sort(),
    generatedCompanions: [...(entry.generatedCompanions ?? [])].sort(),
    upstreamDigest: entry.upstreamDigest
  });
  const addSourceFile = async (relative, details) => add({
    assetId: `managed:${relative}`,
    path: relative,
    ...details,
    upstreamDigest: await digestManagedPath(details.source, { scope: details.scope })
  });
  const skills = await discoverSkills(SCRIPT_ROOT);
  const skillId = (name) => `managed:.github/skills/${name}/SKILL.md`;
  for (const skill of skills) {
    for (const child of await walkFiles(skill.directoryPath)) {
      const relative = `.github/skills/${skill.directory}/${child}`;
      const contract = child === "SKILL.md";
      await addSourceFile(relative, {
        source: path.join(skill.directoryPath, child),
        scope: `skill:${skill.name}`,
        dependencies: contract ? dependencyItems(skill.source).map(skillId) : [],
        generatedCompanions: contract ? [`managed:.github/prompts/${skill.name}-help.prompt.md`] : []
      });
    }
    const helpPath = `.github/prompts/${skill.name}-help.prompt.md`;
    add({
      assetId: `managed:${helpPath}`,
      path: helpPath,
      scope: `skill-help:${skill.name}`,
      policy: "track",
      dependencies: [],
      generatedCompanions: [],
      upstreamDigest: digestManagedBuffer(Buffer.from(skillHelpPrompt(skill), "utf8"), { kind: "text" })
    });
  }
  for (const child of await walkFiles(path.join(SCRIPT_ROOT, "schemas"))) {
    const relative = `schemas/${child}`;
    await addSourceFile(relative, { source: path.join(SCRIPT_ROOT, relative), scope: "framework-schema", dependencies: [], generatedCompanions: [] });
  }
  await addSourceFile("config/profiles.yaml", {
    source: path.join(SCRIPT_ROOT, "config", "profiles.yaml"), scope: "framework-configuration", dependencies: [], generatedCompanions: []
  });
  const detectedStack = (await detectProjectStack(projectRoot)).tags;
  for (const template of await loadScaffoldManifest()) {
    const alreadyTracked = lock.entries.some((entry) => entry.path === template.path);
    if (!alreadyTracked && (template.createOnly || ADOPTION_TEMPLATE_EXCLUSIONS.has(template.path) || !templateApplies(template, detectedStack))) continue;
    await addSourceFile(template.path, {
      source: path.join(SCRIPT_ROOT, TEMPLATE_ROOT_RELATIVE, template.path),
      scope: `scaffold:${template.kind}`,
      dependencies: [],
      generatedCompanions: []
    });
  }
  const managedRegionEntries = lock.entries.filter((item) => item.scope === "managed-regions");
  if (manifest.schemaVersion === "1.0.0") {
    for (const relative of [".github/copilot-instructions.md", "AGENTS.md"]) {
      if (existsSync(path.join(projectRoot, relative))) managedRegionEntries.push({ assetId: `managed:${relative}`, path: relative, scope: "managed-regions", policy: "track", dependencies: [], generatedCompanions: [] });
    }
  }
  for (const entry of managedRegionEntries) {
    const blocks = entry.path === "AGENTS.md" ? AGENT_INSTRUCTION_BLOCKS : COPILOT_INSTRUCTION_BLOCKS;
    const content = blocks.map(wrapManagedRegion).join("\n");
    add({ ...entry, upstreamDigest: digestManagedBuffer(Buffer.from(content, "utf8"), { kind: "text" }) });
  }
  const orchestratorEntry = lock.entries.find((entry) => entry.path === "config/orchestrator.yaml")
    ?? (manifest.schemaVersion === "1.0.0" && existsSync(path.join(projectRoot, "config/orchestrator.yaml"))
      ? { assetId: "managed:config/orchestrator.yaml", path: "config/orchestrator.yaml", scope: "orchestrator-configuration", policy: "track", dependencies: [], generatedCompanions: [] }
      : null);
  if (orchestratorEntry) {
    const current = existsSync(path.join(projectRoot, orchestratorEntry.path)) ? await readFile(path.join(projectRoot, orchestratorEntry.path), "utf8") : "";
    const projectState = manifest.status === "initialized" && !manifest.adoptedAt ? "initialized: true" : "adopted: true";
    const baseline = `frameworkVersion: ${FRAMEWORK_VERSION}\nruntimeVersion: ${VERSION}\nprofile: ${manifest.conformanceProfile}\npaths:\n  skills: .github/skills\n  reports: reports\n  schemas: schemas\nruntime:\n  eventStream: reports/execution-log.jsonl\n  stateSnapshot: reports/current-execution-state.json\n  appendOnly: true\nproject:\n  name: ${manifest.projectName}\n  ${projectState}\n`;
    const content = mergeProjectOrchestratorConfiguration(current, baseline);
    add({ ...orchestratorEntry, upstreamDigest: digestManagedBuffer(Buffer.from(content, "utf8"), { kind: "text" }) });
  }
  assertUniquePortablePaths([...catalog.values()].map((entry) => entry.path), "upstream");
  return catalog;
}

async function localUpdateState(projectRoot, entry) {
  const target = path.join(projectRoot, entry.path);
  await assertSafeManagedPath(projectRoot, entry.path);
  if (!existsSync(target)) return { digest: null, malformedRegions: false, precondition: "missing" };
  if (entry.scope !== "managed-regions") {
    return {
      digest: await digestManagedPath(target, { scope: entry.scope }),
      malformedRegions: false,
      precondition: await managedPathState(projectRoot, entry.path)
    };
  }
  const source = await readFile(target, "utf8");
  const blocks = entry.path === "AGENTS.md" ? AGENT_INSTRUCTION_BLOCKS : COPILOT_INSTRUCTION_BLOCKS;
  const malformedRegions = blocks.some((block) => (source.match(managedRegionPattern(block.id)) ?? []).length !== 1);
  return {
    digest: digestManagedBuffer(Buffer.from(managedRegionContent(source, blocks), "utf8"), { kind: "text" }),
    malformedRegions,
    precondition: await managedPathState(projectRoot, entry.path)
  };
}

function proposedUpdateAction(classification) {
  if (["current", "local-only", "converged", "project-local", "legacy-equivalent", "removed-both-sides"].includes(classification)) return "none";
  if (classification === "new-upstream") return "create";
  if (classification === "upstream-only") return "replace";
  if (classification === "upstream-removed") return "resolve";
  if (["diverged", "legacy-unknown", "locally-deleted", "malformed-region-state"].includes(classification)) return "resolve";
  return "blocked";
}

function baselineActionFor(proposedAction) {
  if (["replace", "fork"].includes(proposedAction)) return "advance-after-verification";
  if (proposedAction === "create") return "establish-after-verification";
  if (proposedAction === "delete") return "remove-after-verification";
  return "preserve";
}

function skillContractIdentity(entry) {
  const match = /^\.github\/skills\/([a-z][a-z0-9]*(?:-[a-z0-9]+)*)\/SKILL\.md$/.exec(entry.path);
  if (!match || entry.scope !== `skill:${match[1]}`) return null;
  return match[1];
}

async function buildForkDisposition(projectRoot, entry, forkSkillId, catalog) {
  const sourceSkillId = skillContractIdentity(entry);
  if (!sourceSkillId) throw new Error(`Fork is supported only for exact skill package contracts: ${entry.path}`);
  const skillRoot = path.join(projectRoot, ".github", "skills");
  const existing = existsSync(skillRoot) ? await readdir(skillRoot, { withFileTypes: true }) : [];
  const occupied = new Map(existing.filter((item) => item.isDirectory()).map((item) => [item.name.toLowerCase(), item.name]));
  for (const candidate of catalog.values()) {
    const candidateSkill = skillContractIdentity(candidate);
    if (candidateSkill) occupied.set(candidateSkill.toLowerCase(), candidateSkill);
  }
  const collision = occupied.get(forkSkillId.toLowerCase());
  if (collision) throw new Error(`Fork skill ID collides with existing skill ${collision}: ${forkSkillId}`);
  const sourcePath = `.github/skills/${sourceSkillId}`;
  const localAssets = await walkFiles(path.join(projectRoot, sourcePath));
  if (!localAssets.includes("SKILL.md")) throw new Error(`Fork source package is incomplete: ${sourcePath}`);
  return {
    sourceSkillId,
    forkSkillId,
    sourcePath,
    destinationPath: `.github/skills/${forkSkillId}`,
    localAssets
  };
}

function closeSkillSelection(catalog, selectors) {
  const explicitIds = new Set();
  const selectedIds = new Set();
  const explicitSkills = new Set(selectors.skills);
  const implicitSkills = new Set();
  const visiting = new Set();
  const skillContract = (name) => `managed:.github/skills/${name}/SKILL.md`;
  const includeSkill = (name, explicit = false) => {
    const contractId = skillContract(name);
    const contract = catalog.get(contractId);
    if (!contract) throw new Error(`Unknown skill selector: ${name}`);
    if (explicit) {
      explicitSkills.add(name);
      implicitSkills.delete(name);
      for (const entry of catalog.values()) {
        if (entry.scope === `skill:${name}`) explicitIds.add(entry.assetId);
      }
    }
    else if (!explicitSkills.has(name)) implicitSkills.add(name);
    if (visiting.has(name)) return;
    visiting.add(name);
    for (const entry of catalog.values()) {
      if (entry.scope === `skill:${name}`) {
        selectedIds.add(entry.assetId);
        if (explicit) explicitIds.add(entry.assetId);
      }
    }
    for (const companion of contract.generatedCompanions) selectedIds.add(companion);
    for (const dependency of contract.dependencies) {
      const dependencyEntry = catalog.get(dependency);
      if (!dependencyEntry) throw new Error(`Unprovable dependency: ${contract.assetId} -> ${dependency}`);
      includeSkill(dependencyEntry.scope.replace(/^skill:/, ""), false);
    }
  };
  for (const skill of selectors.skills) includeSkill(skill, true);
  for (const asset of selectors.assets) {
    const entry = [...catalog.values()].find((candidate) => candidate.path === asset);
    if (!entry) throw new Error(`Unknown managed asset selector: ${asset}`);
    selectedIds.add(entry.assetId);
    explicitIds.add(entry.assetId);
  }
  return { explicitIds, selectedIds, explicitSkills, implicitSkills };
}

async function loadEffectiveProfileRequirements(profileName) {
  const source = await readFile(path.join(SCRIPT_ROOT, "config", "profiles.yaml"), "utf8");
  const blocks = [...source.matchAll(/^ {2}([a-z]+):\r?\n([\s\S]*?)(?=^ {2}[a-z]+:|(?![\s\S]))/gm)];
  const profiles = new Map(blocks.map(([, name, block]) => [name, {
    parent: block.match(/^ {4}extends: ([a-z]+)\r?$/m)?.[1] ?? null,
    required: [...block.matchAll(/^ {6}- ([a-z0-9-]+)\r?$/gm)].map((match) => match[1])
  }]));
  const visiting = new Set();
  const resolve = (name) => {
    const profile = profiles.get(name);
    if (!profile) throw new Error(`Unknown conformance profile: ${name}`);
    if (visiting.has(name)) throw new Error(`Conformance profile inheritance cycle: ${[...visiting, name].join(" -> ")}`);
    visiting.add(name);
    const required = new Set([...(profile.parent ? resolve(profile.parent) : []), ...profile.required]);
    visiting.delete(name);
    return required;
  };
  return resolve(profileName);
}

export async function buildUpdatePlan(projectRoot, requestedMode = "all", selectionInput = {}) {
  if (!new Set(["all", "additive", "select"]).has(requestedMode)) throw new Error(`Unsupported update mode: ${requestedMode}`);
  const requestedRoot = path.resolve(projectRoot);
  if (!existsSync(requestedRoot)) throw new Error(`Repository path does not exist: ${requestedRoot}`);
  const root = await realpath(requestedRoot);
  await assertSafeAdoptionPaths(root);
  const { manifest, lock, legacy } = await loadUpdateBaseline(root);
  const upstream = await buildUpstreamCatalog(root, manifest, lock);
  if (legacy) await addLegacyOwnershipEvidence(root, upstream, lock);
  const base = new Map(lock.entries.map((entry) => [entry.assetId, entry]));
  const combined = new Map([...base, ...upstream].map(([assetId, entry]) => [assetId, { ...base.get(assetId), ...entry }]));
  const selectors = selectionInput.selectors ?? { skills: [], assets: [] };
  let closure = closeSkillSelection(combined, selectors);
  if (requestedMode === "all" || (requestedMode === "additive" && selectors.skills.length === 0 && selectors.assets.length === 0)) {
    closure = { explicitIds: new Set(), selectedIds: new Set(combined.keys()), explicitSkills: new Set(), implicitSkills: new Set() };
  }
  if (requestedMode === "select" && closure.selectedIds.size === 0) throw new Error("Select mode requires --skills, --assets, or --selection-file selectors");
  if (requestedMode === "additive" && selectors.skills.length > 0) {
    for (const entry of combined.values()) {
      if (entry.scope === "framework-schema") closure.selectedIds.add(entry.assetId);
    }
  }
  const classified = [];
  const conflicts = [];
  const warnings = [];
  if (legacy) warnings.push({ code: "LEGACY_BASELINE", message: "Manifest 1.0 is planned read-only. Equivalent managed assets can establish a synthetic baseline only after a successful transaction; unknown assets remain preserved until keep, replace, or fork is selected." });
  const policyChanges = new Map((selectionInput.policyChanges ?? []).map((item) => [item.asset, item]));
  const resolutions = new Map((selectionInput.resolutions ?? []).map((item) => [item.asset, item]));
  const exactForcePaths = new Set(selectionInput.exactForcePaths ?? []);
  for (const assetId of [...closure.selectedIds].sort()) {
    const entry = combined.get(assetId);
    if (!entry) throw new Error(`Selected managed asset is not in the base or upstream catalog: ${assetId}`);
    const local = await localUpdateState(root, entry);
    let classification = classifyThreeWayAsset({
      baseDigest: base.get(assetId)?.normalizedBaseDigest ?? null,
      localDigest: local.digest,
      upstreamDigest: upstream.get(assetId)?.upstreamDigest ?? null
    });
    if (legacy && classification === "new-upstream" && !entry.scope.startsWith("scaffold:")) classification = "locally-deleted";
    if (local.malformedRegions) classification = "malformed-region-state";
    if (requestedMode === "additive" && local.digest === null && upstream.get(assetId)?.upstreamDigest) classification = "new-upstream";
    if (requestedMode === "additive" && local.digest !== null) {
      if (!closure.explicitIds.has(assetId) && !["current", "converged", "legacy-equivalent"].includes(classification)) {
        conflicts.push({ code: "INCOMPATIBLE_DEPENDENCY", asset: entry.path, message: `Existing dependency cannot be proven compatible: ${entry.path} (${classification})` });
      }
      continue;
    }
    const policyChange = policyChanges.get(entry.path) ?? null;
    const resolution = resolutions.get(entry.path) ?? null;
    if (policyChange && resolution) {
      const compatible = (policyChange.policy === "pin" && resolution.disposition === "keep")
        || (policyChange.policy === "track" && resolution.disposition === "replace")
        || (policyChange.policy === "fork" && resolution.disposition === "fork" && policyChange.forkSkillId === resolution.forkSkillId);
      if (!compatible) throw new Error(`Conflicting policy and resolution for ${entry.path}`);
    }
    let policy = policyChange?.policy ?? base.get(assetId)?.policy ?? entry.policy ?? "track";
    if (resolution?.disposition === "keep") policy = "pin";
    if (resolution?.disposition === "replace") policy = "track";
    if (resolution?.disposition === "fork") policy = "fork";
    let action = proposedUpdateAction(classification);
    let fork = null;
    const forkSkillId = resolution?.forkSkillId ?? policyChange?.forkSkillId ?? base.get(assetId)?.forkSkillId;
    if (policy === "pin") action = "none";
    if (policy === "fork" && (resolution?.disposition === "fork" || policyChange?.policy === "fork")) {
      fork = await buildForkDisposition(root, entry, forkSkillId, combined);
      action = "fork";
    }
    if (resolution?.disposition === "replace") {
      if (!upstream.get(assetId)?.upstreamDigest) throw new Error(`Replace resolution has no upstream asset: ${entry.path}`);
      action = "replace";
    }
    if (resolution?.disposition === "remove") {
      if (classification !== "upstream-removed" || upstream.get(assetId)?.upstreamDigest !== undefined) {
        throw new Error(`Remove resolution is allowed only for an exact upstream-removed managed asset: ${entry.path}`);
      }
      if (!selectors.assets.includes(entry.path)) throw new Error(`Remove resolution requires an explicit exact asset selector: ${entry.path}`);
      action = "delete";
    }
    const force = exactForcePaths.has(entry.path);
    if (force && resolution?.disposition !== "replace") {
      throw new Error(`Exact force path requires a matching replace resolution: ${entry.path}`);
    }
    if (policy === "pin" && base.get(assetId)?.normalizedBaseDigest !== upstream.get(assetId)?.upstreamDigest) {
      warnings.push({ code: "PINNED_UPSTREAM_AVAILABLE", asset: entry.path, message: `Pinned asset has different upstream content available: ${entry.path}` });
    }
    classified.push({
      assetId,
      path: entry.path,
      scope: entry.scope,
      baseDigest: base.get(assetId)?.normalizedBaseDigest ?? null,
      localDigest: local.digest,
      upstreamDigest: upstream.get(assetId)?.upstreamDigest ?? null,
      classification,
      currentPolicy: base.get(assetId)?.policy ?? entry.policy ?? "track",
      policy,
      proposedAction: action,
      baselineAction: baselineActionFor(action),
      ownershipDisposition: resolution?.disposition === "keep" ? "project-owned" : "framework",
      resolution,
      fork,
      force,
      destinationPrecondition: local.precondition,
      selection: closure.explicitIds.has(assetId) ? "explicit" : "implicit",
      dependencies: [...(entry.dependencies ?? [])].sort(),
      generatedCompanions: [...(entry.generatedCompanions ?? [])].sort()
    });
  }
  const forkCoveredAssets = new Set();
  for (const contract of classified.filter((entry) => entry.proposedAction === "fork")) {
    const companionIds = new Set(contract.generatedCompanions);
    for (const asset of classified) {
      if (asset.assetId === contract.assetId) continue;
      if (asset.scope !== contract.scope && !companionIds.has(asset.assetId)) continue;
      forkCoveredAssets.add(asset.assetId);
      asset.currentPolicy = base.get(asset.assetId)?.policy ?? asset.currentPolicy;
      asset.policy = "track";
      asset.proposedAction = asset.upstreamDigest === null ? "delete" : "replace";
      asset.baselineAction = baselineActionFor(asset.proposedAction);
      asset.ownershipDisposition = "framework";
    }
  }
  const catalogPaths = new Set([...combined.values()].map((entry) => entry.path));
  for (const item of [...(selectionInput.policyChanges ?? []), ...(selectionInput.resolutions ?? [])]) {
    if (!catalogPaths.has(item.asset)) throw new Error(`Unknown managed asset disposition: ${item.asset}`);
  }
  for (const forcePath of selectionInput.exactForcePaths ?? []) {
    if (!catalogPaths.has(forcePath)) throw new Error(`Unknown exact force path: ${forcePath}`);
  }
  const selectedPaths = new Set(classified.map((entry) => entry.path));
  const plannedForkDestinations = new Map();
  for (const asset of classified.filter((entry) => entry.fork)) {
    const key = asset.fork.destinationPath.toLowerCase();
    const previous = plannedForkDestinations.get(key);
    if (previous) throw new Error(`Fork destination collision: ${previous} and ${asset.path} target ${asset.fork.destinationPath}`);
    plannedForkDestinations.set(key, asset.path);
  }
  for (const item of [...(selectionInput.policyChanges ?? []), ...(selectionInput.resolutions ?? [])]) {
    if (!selectedPaths.has(item.asset)) throw new Error(`Disposition asset must be selected exactly: ${item.asset}`);
  }
  for (const forcePath of selectionInput.exactForcePaths ?? []) {
    if (!selectors.assets.includes(forcePath)) throw new Error(`Exact force path must be an explicit exact asset selector: ${forcePath}`);
  }
  const unresolvedClassifications = new Set(["diverged", "legacy-unknown", "locally-deleted", "upstream-removed", "malformed-region-state"]);
  for (const asset of classified) {
    const policyResolvesConflict = ["pin", "fork"].includes(asset.policy);
    if (unresolvedClassifications.has(asset.classification) && !asset.resolution && !policyResolvesConflict && !forkCoveredAssets.has(asset.assetId)) {
      conflicts.push({ code: "UNRESOLVED_ASSET", asset: asset.path, message: `${asset.path} requires an explicit disposition (${asset.classification})` });
    }
    if (asset.policy === "pin" && (asset.localDigest === null || asset.classification === "malformed-region-state")) {
      conflicts.push({ code: "INCOMPATIBLE_PIN", asset: asset.path, message: `Pinned asset cannot satisfy compatibility requirements: ${asset.path} (${asset.classification})` });
    }
  }
  const selectedById = new Map(classified.map((entry) => [entry.assetId, entry]));
  for (const asset of classified.filter((entry) => entry.policy === "pin" && entry.upstreamDigest !== entry.baseDigest)) {
    const requiredBy = classified.filter((candidate) => candidate.policy === "track" && candidate.dependencies.includes(asset.assetId));
    if (requiredBy.length > 0) {
      conflicts.push({ code: "INCOMPATIBLE_PIN", asset: asset.path, message: `Pinned asset has changed upstream and is required by selected tracked assets: ${requiredBy.map((item) => item.path).join(", ")}` });
    }
    for (const dependency of asset.dependencies) {
      if (!selectedById.has(dependency) && !base.has(dependency)) {
        conflicts.push({ code: "INCOMPATIBLE_PIN", asset: asset.path, message: `Pinned asset dependency is unavailable: ${dependency}` });
      }
    }
  }
  const profileRequirements = await loadEffectiveProfileRequirements(manifest.conformanceProfile);
  for (const skillName of profileRequirements) {
    const assetId = `managed:.github/skills/${skillName}/SKILL.md`;
    const entry = combined.get(assetId);
    if (!entry) {
      conflicts.push({ code: "INCOMPATIBLE_PROFILE", asset: `.github/skills/${skillName}/SKILL.md`, message: `Profile ${manifest.conformanceProfile} requires an unknown skill: ${skillName}` });
      continue;
    }
    for (const dependency of entry.dependencies) {
      const dependencyName = combined.get(dependency)?.scope.replace(/^skill:/, "");
      if (!dependencyName || !profileRequirements.has(dependencyName)) {
        conflicts.push({ code: "INCOMPATIBLE_PROFILE", asset: entry.path, message: `Profile ${manifest.conformanceProfile} omits required dependency ${dependency}` });
      }
    }
    const selected = selectedById.get(assetId);
    const localDigest = selected?.localDigest ?? (await localUpdateState(root, entry)).digest;
    const baseline = base.get(assetId);
    const policy = selected?.policy ?? baseline?.policy ?? entry.policy ?? "track";
    if (localDigest === null) {
      conflicts.push({ code: "INCOMPATIBLE_PROFILE", asset: entry.path, message: `Profile ${manifest.conformanceProfile} requires missing skill contract ${entry.path}` });
      continue;
    }
    if (policy === "fork") {
      const forkSkillId = selected?.fork?.forkSkillId ?? baseline?.forkSkillId;
      const plannedFork = selected?.proposedAction === "fork" && selected.fork?.forkSkillId === forkSkillId;
      const forkContract = !plannedFork && forkSkillId ? path.join(root, ".github", "skills", forkSkillId, "SKILL.md") : null;
      const forkName = forkContract && existsSync(forkContract) ? metadata(await readFile(forkContract, "utf8")).name : null;
      if (!plannedFork && (!forkSkillId || forkName !== forkSkillId)) {
        conflicts.push({ code: "INCOMPATIBLE_PROFILE", asset: entry.path, message: `Fork policy for profile ${manifest.conformanceProfile} has no valid project-owned skill ${forkSkillId ?? "(missing)"}` });
      }
    }
  }
  if (requestedMode === "additive" && classified.length === 0) warnings.push({ code: "NO_MISSING_ASSETS", message: "No selected upstream assets are absent from the project" });
  const targetSource = await installedSourceIdentity();
  const target = { projectName: manifest.projectName, frameworkVersion: FRAMEWORK_VERSION, runtimeVersion: VERSION, installedSource: targetSource };
  const selection = {
    explicit: { skills: [...closure.explicitSkills].sort(), assets: [...selectors.assets].sort() },
    implicit: {
      skills: [...closure.implicitSkills].sort(),
      assets: classified.filter((asset) => asset.selection === "implicit").map((asset) => asset.path).sort()
    },
    policyChanges: selectionInput.policyChanges ?? [],
    resolutions: selectionInput.resolutions ?? [],
    exactForcePaths: selectionInput.exactForcePaths ?? []
  };
  const normalizedSelectors = { skills: [...selectors.skills].sort(), assets: [...selectors.assets].sort() };
  const counts = Object.fromEntries(["none", "create", "replace", "fork", "delete", "resolve", "blocked"].map((action) => [action, classified.filter((asset) => asset.proposedAction === action).length]));
  counts.conflicts = conflicts.length;
  const plan = {
    schemaVersion: PROJECT_UPDATE_PLAN_SCHEMA_VERSION,
    generatedAt: new Date().toISOString(),
    requestedMode,
    source: {
      frameworkVersion: manifest.frameworkVersion,
      runtimeVersion: manifest.runtimeVersion,
      installedSource: manifest.installedSource,
      lockDigest: canonicalDigest(lock)
    },
    target,
    selectors: normalizedSelectors,
    selectionDigest: canonicalDigest({ requestedMode, selectors: normalizedSelectors, policyChanges: selection.policyChanges, resolutions: selection.resolutions, exactForcePaths: selection.exactForcePaths }),
    selection,
    assets: classified.sort((left, right) => left.path < right.path ? -1 : left.path > right.path ? 1 : 0),
    conflicts,
    warnings,
    counts,
    canApply: conflicts.length === 0,
    planDigest: ""
  };
  const { generatedAt, planDigest, ...stablePlan } = plan;
  plan.planDigest = canonicalDigest(stablePlan);
  return plan;
}

function updatePlanMarkdown(plan) {
  return `# Project Update Plan\n\n- Project: \`${plan.target.projectName}\`\n- Mode: \`${plan.requestedMode}\`\n- Plan digest: \`${plan.planDigest}\`\n- Selected assets: ${plan.assets.length}\n- Implicit skills: ${plan.selection.implicit.skills.length}\n- Conflicts: ${plan.conflicts.length}\n- Can apply: **${plan.canApply ? "yes" : "no"}**\n\nPlanning is mutation-free. Apply requires an accepted exact plan, risk acknowledgement, transaction backup, and successful verification before manifest or lock migration is retained.\n`;
}

async function writeUpdatePlanReports(projectRoot, plan) {
  await assertSafeManagedPath(projectRoot, "reports");
  const reports = path.join(projectRoot, "reports");
  await mkdir(reports, { recursive: true });
  await writeJsonAtomic(path.join(reports, "project-update-plan.json"), plan);
  await writeTextAtomic(path.join(reports, "project-update-plan.md"), updatePlanMarkdown(plan));
}

function orderedUpdateAssets(assets) {
  const byId = new Map(assets.map((asset) => [asset.assetId, asset]));
  const ordered = [];
  const visited = new Set();
  const visiting = new Set();
  const visit = (asset) => {
    if (visited.has(asset.assetId)) return;
    if (visiting.has(asset.assetId)) throw new Error(`Update dependency cycle includes ${asset.path}`);
    visiting.add(asset.assetId);
    for (const dependency of asset.dependencies) {
      if (byId.has(dependency)) visit(byId.get(dependency));
    }
    visiting.delete(asset.assetId);
    visited.add(asset.assetId);
    ordered.push(asset);
  };
  for (const asset of assets) visit(asset);
  return ordered;
}

async function upstreamAssetContent(projectRoot, asset) {
  if (asset.scope.startsWith("skill-help:")) {
    const skillId = asset.scope.slice("skill-help:".length);
    const skill = (await discoverSkills(SCRIPT_ROOT)).find((candidate) => candidate.name === skillId);
    if (!skill) throw new Error(`Upstream help source is missing: ${skillId}`);
    return Buffer.from(skillHelpPrompt(skill), "utf8");
  }
  if (asset.scope === "managed-regions") {
    const target = path.join(projectRoot, asset.path);
    const current = existsSync(target) ? await readFile(target, "utf8") : "";
    const blocks = asset.path === "AGENTS.md" ? AGENT_INSTRUCTION_BLOCKS : COPILOT_INSTRUCTION_BLOCKS;
    return Buffer.from(mergedInstructionContent(current, blocks), "utf8");
  }
  if (asset.path === "config/orchestrator.yaml") {
    const target = path.join(projectRoot, asset.path);
    const current = existsSync(target) ? await readFile(target, "utf8") : "";
    const manifest = JSON.parse(await readFile(path.join(projectRoot, "project-orchestrator.json"), "utf8"));
    const projectState = manifest.status === "initialized" && !manifest.adoptedAt ? "initialized: true" : "adopted: true";
    const baseline = `frameworkVersion: ${FRAMEWORK_VERSION}\nruntimeVersion: ${VERSION}\nprofile: ${manifest.conformanceProfile}\npaths:\n  skills: .github/skills\n  reports: reports\n  schemas: schemas\nruntime:\n  eventStream: reports/execution-log.jsonl\n  stateSnapshot: reports/current-execution-state.json\n  appendOnly: true\nproject:\n  name: ${manifest.projectName}\n  ${projectState}\n`;
    return Buffer.from(mergeProjectOrchestratorConfiguration(current, baseline), "utf8");
  }
  const frameworkPath = path.join(SCRIPT_ROOT, asset.path);
  const templatePath = path.join(SCRIPT_ROOT, TEMPLATE_ROOT_RELATIVE, asset.path);
  const source = existsSync(frameworkPath) ? frameworkPath : templatePath;
  if (!existsSync(source)) throw new Error(`Upstream asset source is missing: ${asset.path}`);
  return readFile(source);
}

async function writeUpstreamAsset(projectRoot, asset) {
  const destination = path.join(projectRoot, asset.path);
  await mkdir(path.dirname(destination), { recursive: true });
  await writeBufferAtomic(destination, await upstreamAssetContent(projectRoot, asset));
  const state = await localUpdateState(projectRoot, asset);
  if (state.digest !== asset.upstreamDigest) throw new Error(`Written upstream digest does not match ${asset.path}`);
}

async function copyForkPackage(projectRoot, asset) {
  const source = path.join(projectRoot, asset.fork.sourcePath);
  const destination = path.join(projectRoot, asset.fork.destinationPath);
  const temporary = `${destination}.${randomUUID()}.tmp`;
  if (existsSync(destination)) throw new Error(`Fork destination is no longer unused: ${asset.fork.destinationPath}`);
  await mkdir(path.dirname(destination), { recursive: true });
  await cp(source, temporary, { recursive: true, errorOnExist: true });
  if (await directoryHash(source) !== await directoryHash(temporary)) throw new Error(`Fork copy verification failed: ${asset.fork.destinationPath}`);
  const contractPath = path.join(temporary, "SKILL.md");
  const contract = await readFile(contractPath, "utf8");
  const renamed = contract.replace(/^(name:\s*).+$/m, `$1${asset.fork.forkSkillId}`);
  if (renamed === contract) throw new Error(`Fork contract has no rewritable name: ${asset.fork.sourcePath}/SKILL.md`);
  await writeTextAtomic(contractPath, renamed);
  await rename(temporary, destination);
  const installed = (await discoverSkills(projectRoot)).find((skill) => skill.name === asset.fork.forkSkillId);
  if (!installed || installed.directory !== asset.fork.forkSkillId) throw new Error(`Fork package verification failed: ${asset.fork.destinationPath}`);
  const helpPath = path.join(projectRoot, ".github", "prompts", `${asset.fork.forkSkillId}-help.prompt.md`);
  await writeTextAtomic(helpPath, skillHelpPrompt(installed));
}

function buildCandidateUpdateLock(plan, currentLock, completedAt) {
  const entries = new Map(currentLock.entries.map((entry) => [entry.assetId, { ...entry }]));
  for (const asset of plan.assets) {
    if (asset.proposedAction === "delete") {
      entries.delete(asset.assetId);
      continue;
    }
    const previous = entries.get(asset.assetId);
    if (!previous && asset.proposedAction === "none" && !["legacy-equivalent", "legacy-unknown"].includes(asset.classification)) continue;
    const advancing = ["create", "replace", "fork"].includes(asset.proposedAction);
    const entry = {
      assetId: asset.assetId,
      path: asset.path,
      scope: asset.scope,
      ownership: asset.ownershipDisposition === "project-owned" ? "project-owned" : "framework",
      policy: asset.policy,
      normalizedBaseDigest: advancing ? asset.upstreamDigest : asset.baseDigest ?? asset.localDigest,
      dependencies: [...asset.dependencies],
      generatedCompanions: [...asset.generatedCompanions]
    };
    if (asset.policy === "fork") entry.forkSkillId = asset.fork?.forkSkillId ?? previous?.forkSkillId;
    if (!entry.normalizedBaseDigest) throw new Error(`Candidate lock has no baseline digest for ${asset.path}`);
    entries.set(asset.assetId, entry);
  }
  const sortedEntries = [...entries.values()].sort((left, right) => left.path < right.path ? -1 : left.path > right.path ? 1 : 0);
  const ids = new Set(sortedEntries.map((entry) => entry.assetId));
  for (const entry of sortedEntries) {
    for (const reference of [...entry.dependencies, ...entry.generatedCompanions]) {
      if (!ids.has(reference)) throw new Error(`Candidate lock reference does not resolve: ${entry.assetId} -> ${reference}`);
    }
  }
  return {
    schemaVersion: PROJECT_LOCK_SCHEMA_VERSION,
    digestAlgorithm: DIGEST_ALGORITHM,
    baselineAt: completedAt,
    installedSource: plan.target.installedSource,
    entries: sortedEntries
  };
}

function projectOwnedForkSkillIds(...locks) {
  return new Set(locks.flatMap((lock) => lock.entries
    .filter((entry) => entry.policy === "fork" && entry.ownership === "framework")
    .map((entry) => entry.forkSkillId)));
}

async function verifyUpdateCandidate(projectRoot, plan, candidateLock) {
  const failures = [];
  const candidateById = new Map(candidateLock.entries.map((entry) => [entry.assetId, entry]));
  for (const asset of plan.assets) {
    const entry = candidateById.get(asset.assetId);
    if (asset.proposedAction === "delete") continue;
    if (!entry) {
      failures.push(`Candidate lock omits ${asset.path}`);
      continue;
    }
    const local = await localUpdateState(projectRoot, asset);
    if (asset.policy === "pin") {
      if (local.digest === null || entry.normalizedBaseDigest !== (asset.baseDigest ?? asset.localDigest)) failures.push(`Pinned baseline changed for ${asset.path}`);
    } else if (local.digest !== asset.upstreamDigest || entry.normalizedBaseDigest !== asset.upstreamDigest) {
      failures.push(`Tracked content does not match upstream for ${asset.path}`);
    }
    if (asset.proposedAction === "fork" && !existsSync(path.join(projectRoot, asset.fork.destinationPath))) {
      failures.push(`Fork destination is missing: ${asset.fork.destinationPath}`);
    }
  }
  for (const legacyName of LEGACY_SKILL_IDS.keys()) {
    const legacyPath = `.github/skills/${legacyName}`;
    const retained = plan.assets.some((asset) => asset.path === legacyPath && asset.policy === "pin" && asset.ownershipDisposition === "project-owned");
    if (existsSync(path.join(projectRoot, legacyPath)) && !retained) failures.push(`Legacy skill ID remains installed without an explicit keep decision: ${legacyName}`);
  }
  const profile = JSON.parse(await readFile(path.join(projectRoot, "project-orchestrator.json"), "utf8")).conformanceProfile;
  if (!PROFILES.has(profile)) failures.push(`Unknown conformance profile: ${profile}`);
  else {
    const requirements = await loadEffectiveProfileRequirements(profile);
    for (const skillName of requirements) {
      const contractPath = `.github/skills/${skillName}/SKILL.md`;
      const entry = candidateById.get(`managed:${contractPath}`);
      if (!entry || !existsSync(path.join(projectRoot, contractPath))) failures.push(`Profile ${profile} requires missing skill contract ${contractPath}`);
      if (entry?.policy === "fork") {
        const forkContract = entry.forkSkillId ? path.join(projectRoot, ".github", "skills", entry.forkSkillId, "SKILL.md") : null;
        const forkName = forkContract && existsSync(forkContract) ? metadata(await readFile(forkContract, "utf8")).name : null;
        if (!entry.forkSkillId || forkName !== entry.forkSkillId) failures.push(`Profile ${profile} has invalid fork policy for ${contractPath}`);
      }
    }
  }
  if (failures.length) throw new Error(`Update candidate verification failed: ${failures.join("; ")}`);
}

async function verifyPersistedUpdate(projectRoot, plan, candidateLock, manifest) {
  const persistedLock = JSON.parse(await readFile(path.join(projectRoot, PROJECT_LOCK_PATH), "utf8"));
  const persistedManifest = JSON.parse(await readFile(path.join(projectRoot, "project-orchestrator.json"), "utf8"));
  const lockDigest = canonicalDigest(persistedLock);
  if (canonicalJson(persistedLock) !== canonicalJson(candidateLock)) throw new Error("Persisted update lock differs from the verified candidate");
  if (canonicalJson(persistedManifest) !== canonicalJson(manifest)) throw new Error("Persisted update manifest differs from the verified candidate");
  if (canonicalJson(persistedManifest.installedSource) !== canonicalJson(persistedLock.installedSource)
    || persistedManifest.lastSuccessfulReconciliation?.lockDigest !== lockDigest) {
    throw new Error("Persisted update manifest and lock do not agree");
  }
  await verifyUpdateCandidate(projectRoot, plan, persistedLock);
  return lockDigest;
}

function updateTransactionPaths(plan) {
  const paths = new Set(["project-orchestrator.json", PROJECT_LOCK_PATH, ...UPDATE_REPORT_PATHS]);
  const replacedPackageRoots = new Set(plan.assets.filter((asset) => asset.fork).map((asset) => asset.fork.sourcePath));
  for (const asset of plan.assets) {
    if (asset.proposedAction !== "none") paths.add(asset.path);
    for (const companion of asset.generatedCompanions) paths.add(companion.replace(/^managed:/, ""));
    if (asset.fork) {
      paths.add(asset.fork.destinationPath);
      paths.add(`.github/prompts/${asset.fork.forkSkillId}-help.prompt.md`);
    }
  }
  for (const packageRoot of replacedPackageRoots) paths.add(packageRoot);
  return [...paths].filter((relative) => ![...replacedPackageRoots].some((packageRoot) => relative.startsWith(`${packageRoot}/`)));
}

async function applyUpdate(projectRoot, mode, initialSelection, initialPlan, options, riskAcceptance) {
  if (!riskAcceptance) throw new Error("Risk acceptance is required before update apply");
  const transactionRoot = path.join(projectRoot, ".skills-orchestrator");
  const lockPath = path.join(transactionRoot, "adoption.lock");
  const transactionId = `${initialPlan.generatedAt.replaceAll(":", "-")}-${randomUUID()}`;
  await mkdir(transactionRoot, { recursive: true });
  try {
    await writeFile(lockPath, `${JSON.stringify({ transactionId, processId: process.pid, operation: "update", startedAt: new Date().toISOString() }, null, 2)}\n`, {
      encoding: "utf8", flag: "wx", mode: 0o600
    });
  } catch (error) {
    if (error.code === "EEXIST") throw new Error(`Another adoption, update, or recovery transaction holds ${path.relative(projectRoot, lockPath)}; verify the owner before recovery`);
    throw error;
  }
  let transaction;
  try {
    const lockedSelection = await readUpdateSelection(options);
    if (lockedSelection.selectionFileDigest !== initialSelection.selectionFileDigest) throw new Error("Update selection file changed before the project lock was acquired");
    const freshnessInput = { ...lockedSelection, policyChanges: [], resolutions: [], exactForcePaths: [] };
    const freshnessPlan = lockedSelection.expectedPlanDigest ? await buildUpdatePlan(projectRoot, mode, freshnessInput) : null;
    if (lockedSelection.expectedPlanDigest && lockedSelection.expectedPlanDigest !== freshnessPlan.planDigest) {
      throw new Error(`Selection file has a stale plan digest; expected ${lockedSelection.expectedPlanDigest}, current ${freshnessPlan.planDigest}`);
    }
    const plan = await buildUpdatePlan(projectRoot, mode, lockedSelection);
    if (plan.planDigest !== initialPlan.planDigest) throw new Error("Update plan or destination changed before the project lock was acquired");
    if (!plan.canApply) throw new Error("Update cannot be applied until blocking conflicts are resolved");
    if (lockedSelection.expectedTarget && canonicalJson(lockedSelection.expectedTarget) !== canonicalJson(plan.target)) {
      throw new Error("Selection target does not match the current project and framework/runtime target");
    }
    for (const asset of plan.assets) {
      if (await managedPathState(projectRoot, asset.path) !== asset.destinationPrecondition) {
        throw new Error(`Update plan is stale for ${asset.path}; generate a new plan before apply`);
      }
    }
    const { manifest, lock, legacy } = await loadUpdateBaseline(projectRoot);
    if (canonicalDigest(lock) !== plan.source.lockDigest) throw new Error("Update baseline lock changed before apply");
    transaction = await prepareAdoptionTransaction({ projectRoot, actions: [] }, transactionId, riskAcceptance, updateTransactionPaths(plan));
    await updateTransaction(transaction, "applying", { operation: "update", planDigest: plan.planDigest });
    await writeUpdatePlanReports(projectRoot, plan);
    try {
      for (const asset of plan.assets.filter((entry) => entry.fork)) {
        await copyForkPackage(projectRoot, asset);
        await rm(path.join(projectRoot, asset.fork.sourcePath), { recursive: true, force: true });
      }
      for (const asset of orderedUpdateAssets(plan.assets)) {
        if (asset.proposedAction === "none") continue;
        if (["create", "replace", "fork"].includes(asset.proposedAction)) await writeUpstreamAsset(projectRoot, asset);
        else if (asset.proposedAction === "delete") await rm(path.join(projectRoot, asset.path), { recursive: true, force: true });
        else throw new Error(`Unsupported update action for apply: ${asset.proposedAction} (${asset.path})`);
        interruptAfterFirstWriteForTest();
      }
      const completedAt = new Date().toISOString();
      const candidateLock = buildCandidateUpdateLock(plan, lock, completedAt);
      const projectOwnedSkillIds = projectOwnedForkSkillIds(lock, candidateLock);
      await inventory(projectRoot, { projectOwnedSkillIds });
      await verifyUpdateCandidate(projectRoot, plan, candidateLock);
      const candidateLockDigest = canonicalDigest(candidateLock);
      const finalManifest = {
        ...manifest,
        ...manifestUpdateFields(plan.target.installedSource),
        frameworkVersion: plan.target.frameworkVersion,
        runtimeVersion: plan.target.runtimeVersion,
        updatedAt: completedAt,
        riskAcceptance,
        lastSuccessfulReconciliation: { completedAt, runtimeVersion: VERSION, lockDigest: candidateLockDigest }
      };
      await writeJsonAtomic(path.join(projectRoot, PROJECT_LOCK_PATH), candidateLock);
      failBeforeManifestWriteForTest();
      await writeJsonAtomic(path.join(projectRoot, "project-orchestrator.json"), finalManifest);
      const lockDigest = await verifyPersistedUpdate(projectRoot, plan, candidateLock, finalManifest);
      const verification = {
        schemaVersion: "1.0.0",
        verifiedAt: new Date().toISOString(),
        status: "passed",
        mode: plan.requestedMode,
        planDigest: plan.planDigest,
        selectionDigest: plan.selectionDigest,
        lockDigest,
        checks: {
          selectedAssets: plan.assets.length,
          dependenciesOrdered: true,
          pinsCompatible: true,
          forksVerified: true,
          manifestLockConsistent: true,
          legacySkillsRemoved: ![...LEGACY_SKILL_IDS.keys()].some((legacyName) => existsSync(path.join(projectRoot, ".github", "skills", legacyName))),
          legacyMigrated: legacy,
          projectFilesPreserved: true
        }
      };
      await writeJsonAtomic(path.join(projectRoot, "reports", "update-verification.json"), verification);
      await updateTransaction(transaction, "completed", { completedAt: new Date().toISOString(), verification: "reports/update-verification.json" });
      console.log(`Update completed and verified: ${projectRoot} (${plan.assets.length} selected assets)`);
      return verification;
    } catch (error) {
      await rollbackAdoptionTransaction({ projectRoot }, transaction, error);
      throw new Error(`Update failed and was rolled back: ${error.message}`);
    }
  } finally {
    await rm(lockPath, { force: true });
  }
}

async function verifyInstallation(plan, reportName = "adoption-verification.json") {
  const failures = [];
  const frameworkSkills = await discoverSkills(SCRIPT_ROOT);
  const installedSkills = await discoverSkills(plan.projectRoot);
  const installedByName = new Map(installedSkills.map((skill) => [skill.name, skill]));
  for (const frameworkSkill of frameworkSkills) {
    const installed = installedByName.get(frameworkSkill.name);
    if (!installed) failures.push(`Missing framework skill: ${frameworkSkill.name}`);
    else if (installed.hash !== frameworkSkill.hash) failures.push(`Outdated framework skill: ${frameworkSkill.name}`);
  }
  for (const legacyName of LEGACY_SKILL_IDS.keys()) {
    if (installedByName.has(legacyName)) failures.push(`Legacy skill ID remains installed: ${legacyName}`);
    for (const installed of installedSkills) {
      if (installed.source.includes(legacyName)) failures.push(`${installed.name} still references legacy skill ID: ${legacyName}`);
    }
  }

  for (const relative of await walkFiles(path.join(SCRIPT_ROOT, "schemas"))) {
    const source = path.join(SCRIPT_ROOT, "schemas", relative);
    const installed = path.join(plan.projectRoot, "schemas", relative);
    if (!(await sameFile(source, installed))) failures.push(`Missing or outdated schema: ${relative}`);
  }
  if (!(await sameFile(path.join(SCRIPT_ROOT, "config", "profiles.yaml"), path.join(plan.projectRoot, "config", "profiles.yaml")))) {
    failures.push("Installed profiles configuration is not current");
  }
  try {
    const installedConfiguration = await resolveConfiguration(plan.projectRoot);
    const expectedConfiguration = plan.resolvedConfiguration ?? { ...DEFAULT_CONFIGURATION, profile: plan.profile };
    if (JSON.stringify(installedConfiguration.clarification) !== JSON.stringify(expectedConfiguration.clarification)) {
      failures.push("Installed clarification configuration does not match the resolved project configuration");
    }
  } catch (error) {
    failures.push(`Project configuration validation failed: ${error.message}`);
  }

  const inventoryPath = path.join(plan.projectRoot, "reports", "skill-inventory.json");
  try {
    const installedInventory = JSON.parse(await readFile(inventoryPath, "utf8"));
    const inventoriedNames = new Set(installedInventory.skills.map((skill) => skill.name));
    for (const frameworkSkill of frameworkSkills) {
      if (!inventoriedNames.has(frameworkSkill.name)) failures.push(`Inventory omits framework skill: ${frameworkSkill.name}`);
    }
  } catch (error) {
    failures.push(`Skill inventory validation failed: ${error.message}`);
  }

  const manifestPath = path.join(plan.projectRoot, "project-orchestrator.json");
  try {
    const manifest = JSON.parse(await readFile(manifestPath, "utf8"));
    if (manifest.frameworkVersion !== FRAMEWORK_VERSION) failures.push("Manifest frameworkVersion is not current");
    if (manifest.runtimeVersion !== VERSION) failures.push("Manifest runtimeVersion is not current");
    if (manifest.conformanceProfile !== plan.profile) failures.push("Manifest conformance profile does not match the adoption plan");
    await validateBaselineLock(plan.projectRoot, manifest);
  } catch (error) {
    failures.push(`Manifest validation failed: ${error.message}`);
  }

  const orchestratorPath = path.join(plan.projectRoot, "config", "orchestrator.yaml");
  const orchestrator = existsSync(orchestratorPath) ? await readFile(orchestratorPath, "utf8") : "";
  const requiredConfiguration = [
    `frameworkVersion: ${FRAMEWORK_VERSION}`,
    `runtimeVersion: ${VERSION}`,
    `profile: ${plan.profile}`,
    "skills: .github/skills",
    "reports: reports",
    "schemas: schemas"
  ];
  for (const required of requiredConfiguration) {
    if (!orchestrator.includes(required)) failures.push(`Orchestrator configuration is missing '${required}'`);
  }

  const instructionPath = path.join(plan.projectRoot, ".github", "copilot-instructions.md");
  const instructions = existsSync(instructionPath) ? await readFile(instructionPath, "utf8") : "";
  const agentsPath = path.join(plan.projectRoot, "AGENTS.md");
  const agentInstructions = existsSync(agentsPath) ? await readFile(agentsPath, "utf8") : "";
  if (!instructions.includes(".github/skills/project-skills-orchestrator/SKILL.md")) {
    failures.push("Copilot instructions do not route multi-skill work through project-skills-orchestrator");
  }
  if (!agentInstructions.includes(".github/skills/project-skills-orchestrator/SKILL.md")) {
    failures.push("AGENTS.md does not route multi-skill work through project-skills-orchestrator");
  }
  for (const [relative, source, blocks] of [
    [".github/copilot-instructions.md", instructions, COPILOT_INSTRUCTION_BLOCKS],
    ["AGENTS.md", agentInstructions, AGENT_INSTRUCTION_BLOCKS]
  ]) {
    for (const block of blocks) {
      const found = source.match(managedRegionPattern(block.id)) ?? [];
      if (found.length === 0) failures.push(`${relative} is missing the managed ${block.id} region`);
      if (found.length > 1) failures.push(`${relative} contains ${found.length} copies of the managed ${block.id} region`);
    }
  }
  for (const relative of [".vscode/extensions.json", ".vscode/settings.json"]) {
    if (!existsSync(path.join(plan.projectRoot, relative))) failures.push(`Missing workspace support file: ${relative}`);
  }
  for (const relative of [".github/instructions/clarification.instructions.md", ".github/prompts", ".github/agents", ".vscode/mcp.json"]) {
    if (!existsSync(path.join(plan.projectRoot, relative))) failures.push(`Missing customization asset: ${relative}`);
  }
  if (failures.length) throw new Error(`Installation verification failed: ${failures.join("; ")}`);

  const report = {
    schemaVersion: "1.0.0",
    verifiedAt: new Date().toISOString(),
    frameworkVersion: FRAMEWORK_VERSION,
    runtimeVersion: VERSION,
    profile: plan.profile,
    mode: reportName === "installation-verification.json" ? "new-project-creation" : "existing-project-adoption",
    status: "passed",
    checks: {
      frameworkSkills: frameworkSkills.length,
      schemas: (await walkFiles(path.join(SCRIPT_ROOT, "schemas"))).length,
      profilesCurrent: true,
      inventoryCurrent: true,
      manifestCurrent: true,
      baselineLockCurrent: true,
      orchestratorConfigured: true,
      clarificationConfigured: true,
      clarificationProtocolPresent: true,
      customizationAssetsPresent: true,
      copilotRouted: true,
      agentInstructionsRouted: true,
      workspaceSupportPresent: true,
      legacySkillsRemoved: true
    }
  };
  await writeFile(path.join(plan.projectRoot, "reports", reportName), `${JSON.stringify(report, null, 2)}\n`, "utf8");
  return report;
}

async function applyAdoption(plan, riskAcceptance) {
  if (!riskAcceptance) throw new Error("Risk acceptance is required before adoption");
  if (!plan.canApply) throw new Error("Adoption cannot be applied until blocking conflicts are resolved");
  await assertSafeAdoptionPaths(plan.projectRoot, plan.actions);
  const transactionRoot = path.join(plan.projectRoot, ".skills-orchestrator");
  const lockPath = path.join(transactionRoot, "adoption.lock");
  const transactionId = `${plan.generatedAt.replaceAll(":", "-")}-${randomUUID()}`;
  await mkdir(transactionRoot, { recursive: true });
  try {
    await writeFile(lockPath, `${JSON.stringify({ transactionId, processId: process.pid, startedAt: new Date().toISOString() }, null, 2)}\n`, {
      encoding: "utf8",
      flag: "wx",
      mode: 0o600
    });
  } catch (error) {
    if (error.code === "EEXIST") throw new Error(`Another adoption transaction holds ${path.relative(plan.projectRoot, lockPath)}; verify the owner before recovery`);
    throw error;
  }
  let transaction;
  try {
    for (const action of plan.actions.filter((item) => MUTATING_ADOPTION_ACTIONS.has(item.action))) {
      const actualState = await managedPathState(plan.projectRoot, action.path);
      if (actualState !== action.expectedDestinationState) {
        throw new Error(`Adoption plan is stale for ${action.path}; run a new dry-run before apply`);
      }
    }
    const manifestAction = plan.actions.find((item) => item.path === "project-orchestrator.json" && typeof item.content === "string");
    if (manifestAction) {
      const manifest = JSON.parse(manifestAction.content);
      manifest.riskAcceptance = riskAcceptance;
      manifestAction.content = `${JSON.stringify(manifest, null, 2)}\n`;
    }
    transaction = await prepareAdoptionTransaction(plan, transactionId, riskAcceptance);
    await updateTransaction(transaction, "applying");
    try {
      const result = await applyAdoptionLocked(plan);
      await updateTransaction(transaction, "completed", { completedAt: new Date().toISOString() });
      return result;
    } catch (error) {
      await rollbackAdoptionTransaction(plan, transaction, error);
      throw new Error(`Adoption failed and was rolled back: ${error.message}`);
    }
  } finally {
    await rm(lockPath, { force: true });
  }
}

async function updateProject(projectRoot, options) {
  if (options.json && options.apply) throw new Error("Use --json only with an update dry run");
  const mode = options.mode ?? "all";
  const selectionInput = await readUpdateSelection(options);
  if (mode === "select" && selectionInput.selectors.skills.length === 0 && selectionInput.selectors.assets.length === 0 && process.stdin.isTTY) {
    const terminal = createInterface({ input: process.stdin, output: process.stdout });
    try {
      selectionInput.selectors.skills = splitSelectors(await terminal.question("Skill IDs (comma-separated, optional): "), "skill").sort();
      selectionInput.selectors.assets = splitSelectors(await terminal.question("Exact managed asset paths (comma-separated, optional): "), "asset").sort();
    } finally {
      terminal.close();
    }
  }
  const freshnessInput = {
    ...selectionInput,
    policyChanges: [],
    resolutions: [],
    exactForcePaths: []
  };
  const freshnessPlan = selectionInput.expectedPlanDigest ? await buildUpdatePlan(projectRoot, mode, freshnessInput) : null;
  if (selectionInput.expectedPlanDigest && selectionInput.expectedPlanDigest !== freshnessPlan.planDigest) {
    throw new Error(`Selection file has a stale plan digest; expected ${selectionInput.expectedPlanDigest}, current ${freshnessPlan.planDigest}`);
  }
  const plan = await buildUpdatePlan(projectRoot, mode, selectionInput);
  if (selectionInput.expectedTarget) {
    const expected = selectionInput.expectedTarget;
    const identityMatches = expected.projectName === plan.target.projectName
      && expected.frameworkVersion === plan.target.frameworkVersion
      && expected.runtimeVersion === plan.target.runtimeVersion
      && (expected.installedSource === undefined || canonicalJson(expected.installedSource) === canonicalJson(plan.target.installedSource));
    if (!identityMatches) throw new Error("Selection target does not match the current project and framework/runtime target");
  }
  if (options.apply) {
    const riskAcceptance = acknowledgeRisk(options["accept-risk"] === true, "cli-flag");
    return applyUpdate(path.resolve(projectRoot), mode, selectionInput, plan, options, riskAcceptance);
  }
  await writeUpdatePlanReports(path.resolve(projectRoot), plan);
  if (options.json) return console.log(JSON.stringify(plan, null, 2));
  console.log(`Project update plan: ${plan.target.projectName}`);
  console.log(`Mode: ${plan.requestedMode}`);
  console.log(`Assets: ${plan.assets.length}; conflicts: ${plan.conflicts.length}; can apply: ${plan.canApply}`);
  console.log("Reports: reports/project-update-plan.json and reports/project-update-plan.md");
  console.log("Planning only. No managed project assets were changed.");
}

async function applyAdoptionLocked(plan) {
  for (const item of plan.actions.filter((action) => action.action === "remove-duplicate-command")) {
    await rm(path.join(plan.projectRoot, item.path), { force: true });
  }
  for (const item of plan.actions.filter((action) => action.action === "replace-duplicate")) {
    await rm(path.join(plan.projectRoot, item.path), { recursive: true, force: true });
  }
  for (const item of plan.actions.filter((action) => action.action === "update-skill")) {
    const destination = path.join(plan.projectRoot, item.path);
    await mkdir(path.dirname(destination), { recursive: true });
    await rm(destination, { recursive: true, force: true });
    await cp(item.source, destination, { recursive: true });
  }
  for (const item of plan.actions.filter((action) => action.action === "update-skill-references")) {
    const target = path.join(plan.projectRoot, item.path);
    let source = await readFile(target, "utf8");
    for (const migration of item.migrations) source = source.replaceAll(migration.from, migration.to);
    await writeFile(target, source, "utf8");
  }
  for (const item of plan.actions.filter((action) => ["update-framework-file", "update-wiring-file"].includes(action.action))) {
    const destination = path.join(plan.projectRoot, item.path);
    await mkdir(path.dirname(destination), { recursive: true });
    if (item.source) await cp(item.source, destination, { force: true });
    else await writeFile(destination, item.content, "utf8");
  }
  for (const item of plan.actions.filter((action) => action.action === "create" && action.path !== "project-orchestrator.json")) {
    const destination = path.join(plan.projectRoot, item.path);
    await mkdir(path.dirname(destination), { recursive: true });
    if (item.source) await cp(item.source, destination, { recursive: item.kind === "skill", errorOnExist: true });
    else await writeFile(destination, item.content, { encoding: "utf8", flag: "wx" });
    interruptAfterFirstWriteForTest();
  }
  const reports = path.join(plan.projectRoot, "reports");
  await mkdir(reports, { recursive: true });
  const reportPlan = portableAdoptionPlan(plan);
  await writeFile(path.join(reports, "adoption-plan.json"), `${JSON.stringify(reportPlan, null, 2)}\n`, "utf8");
  const markdown = `# Project Orchestrator Adoption

- Project: \`${plan.projectName ?? path.basename(plan.projectRoot)}\`
- Profile: \`${plan.profile}\`
- Runtime: \`${VERSION}\`
- Created: ${plan.counts.create}
- Existing skills updated: ${plan.counts["update-skill"]}
- Project skill references migrated: ${plan.counts["update-skill-references"]}
- Framework files updated: ${plan.counts["update-framework-file"]}
- Wiring files updated: ${plan.counts["update-wiring-file"]}
- Duplicate skills replaced: ${plan.counts["replace-duplicate"]}
- Conflicts: ${plan.counts.conflict}

Updated framework assets, generated reports, and duplicate skills were journaled and backed up under \`.skills-orchestrator/transactions/\` before replacement. Unrelated project skills and custom Copilot instruction text were preserved.
`;
  await writeFile(path.join(reports, "adoption-plan.md"), markdown, "utf8");
  await inventory(plan.projectRoot);
  const manifestAction = plan.actions.find((item) => item.path === "project-orchestrator.json" && typeof item.content === "string");
  if (!manifestAction) throw new Error("Adoption plan is missing the project manifest");
  const manifest = JSON.parse(manifestAction.content);
  const baselineLock = await buildBaselineLock(plan.projectRoot, manifest.updatedAt ?? manifest.adoptedAt, manifest.installedSource);
  await writeFile(path.join(plan.projectRoot, PROJECT_LOCK_PATH), `${JSON.stringify(baselineLock, null, 2)}\n`, "utf8");
  await writeFile(path.join(plan.projectRoot, "project-orchestrator.json"), manifestAction.content, "utf8");
  const verification = await verifyInstallation(plan);
  console.log(`Adoption completed and verified: ${plan.projectRoot} (${verification.checks.frameworkSkills} framework skills)`);
}

async function inventory(requestedRoot, { projectOwnedSkillIds = new Set() } = {}) {
  const root = await realpath(path.resolve(requestedRoot));
  await assertSafeManagedPath(root, "reports");
  const discovered = await discoverSkills(root);
  const names = new Set(discovered.map((skill) => skill.name));
  const lifecycles = new Set(["draft", "tested", "validated", "production", "deprecated", "retired"]);
  const confidenceLevels = new Set(["low", "medium", "high"]);
  const requiredSections = ["Purpose", "Preconditions", "Inputs", "Approved Tools and Resources", "Read and Write Boundaries", "Procedure", "Validation", "Outputs", "Failure Behavior", "Approval Gates", "Composition and Dependencies", "Examples"];
  const details = discovered.map((skill) => {
    const frontmatter = metadata(skill.source);
    const lifecycle = frontmatter.lifecycle || "draft";
    const confidence = frontmatter.confidence || "low";
    if (!lifecycles.has(lifecycle)) throw new Error(`Invalid lifecycle '${lifecycle}' in ${skill.name}`);
    if (!confidenceLevels.has(confidence)) throw new Error(`Invalid confidence '${confidence}' in ${skill.name}`);
    const dependencies = dependencyItems(skill.source);
    const reports = sectionItems(skill.source, "Outputs").filter((item) => /^(reports|artifacts)\//.test(item));
    const missingSections = requiredSections.filter((heading) => !new RegExp(`^## ${heading.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}\\s*$`, "m").test(skill.source));
    const findings = [];
    if (!/^[a-z][a-z0-9]*(?:-[a-z0-9]+)*$/.test(skill.name)) findings.push(`Name '${skill.name}' is not lowercase kebab-case`);
    if (skill.directory !== skill.name) findings.push(`Directory '${skill.directory}' does not match skill name '${skill.name}'`);
    if (!skill.description) findings.push("Frontmatter description is missing");
    if (missingSections.length) findings.push(`Missing required sections: ${missingSections.join(", ")}`);
    const missingDependencies = dependencies.filter((dependency) => !names.has(dependency));
    if (missingDependencies.length) findings.push(`Unknown dependencies: ${missingDependencies.join(", ")}`);
    return {
      name: skill.name,
      path: path.relative(root, skill.file).replaceAll("\\", "/"),
      description: skill.description,
      lifecycle,
      confidence,
      dependencies,
      reports,
      sha256: skill.hash,
      audit: {
        status: findings.length ? "findings" : "passed",
        checkedAt: new Date().toISOString(),
        findings
      }
    };
  }).sort((left, right) => left.name.localeCompare(right.name));
  const duplicates = details.filter((skill, index) => details.findIndex((candidate) => candidate.name === skill.name) !== index);
  if (duplicates.length) throw new Error(`Duplicate skill names found: ${[...new Set(duplicates.map((skill) => skill.name))].join(", ")}`);
  const contractFindings = details.filter((skill) => skill.audit.status === "findings");
  if (contractFindings.length) {
    throw new Error(`Skill contract findings: ${contractFindings.map((skill) => `${skill.name}: ${skill.audit.findings.join("; ")}`).join(" | ")}`);
  }

  const visiting = new Set();
  const visited = new Set();
  const graph = new Map(details.map((skill) => [skill.name, skill.dependencies]));
  function visit(name, trail = []) {
    if (visiting.has(name)) throw new Error(`Dependency cycle: ${[...trail, name].join(" -> ")}`);
    if (visited.has(name)) return;
    visiting.add(name);
    for (const dependency of graph.get(name) ?? []) visit(dependency, [...trail, name]);
    visiting.delete(name);
    visited.add(name);
  }
  for (const name of graph.keys()) visit(name);

  const schemaRoot = path.join(root, "schemas");
  const schemaFiles = existsSync(schemaRoot)
    ? (await walkFiles(schemaRoot)).filter((file) => file.endsWith(".schema.json"))
    : [];
  for (const relative of schemaFiles) {
    const schemaPath = path.join(schemaRoot, relative);
    let schema;
    try {
      schema = JSON.parse(await readFile(schemaPath, "utf8"));
    } catch (error) {
      throw new Error(`Invalid JSON schema ${relative}: ${error.message}`);
    }
    const serialized = JSON.stringify(schema);
    for (const match of serialized.matchAll(/"\$ref":"([^"#]+\.schema\.json)(?:#[^"]*)?"/g)) {
      if (!existsSync(path.resolve(path.dirname(schemaPath), match[1]))) {
        throw new Error(`Schema ${relative} references missing schema ${match[1]}`);
      }
    }
  }
  for (const skill of discovered) {
    for (const match of skill.source.matchAll(/`(schemas\/[a-z0-9.-]+\.schema\.json)`/g)) {
      if (!existsSync(path.join(root, match[1]))) throw new Error(`${skill.name} references missing ${match[1]}`);
    }
  }

  const profilesPath = path.join(root, "config", "profiles.yaml");
  if (existsSync(profilesPath)) {
    const profileSource = await readFile(profilesPath, "utf8");
    const requiredSkills = [...profileSource.matchAll(/^\s{6}-\s+([a-z0-9-]+)\s*$/gm)].map((match) => match[1]);
    const missingProfileSkills = requiredSkills.filter((name) => !names.has(name));
    if (missingProfileSkills.length) throw new Error(`Profiles reference missing skills: ${[...new Set(missingProfileSkills)].join(", ")}`);
  }

  const pipeline = new Map(details.map((skill) => [skill.name, skill]));
  const pipelineRequirements = [
    ["audit-code", "reports/code-audit-findings.json", "schemas/code-audit-findings.schema.json"],
    ["audit-review-findings", "reports/code-audit-review.json", "schemas/audit-findings-review.schema.json"],
    ["audit-plan-remediation", "reports/audit-remediation-plan.json", "schemas/audit-remediation-plan.schema.json"],
    ["audit-remediation", "reports/audit-remediation-execution.json", "schemas/audit-remediation-execution.schema.json"]
  ];
  for (const [skillName, report, schema] of pipelineRequirements) {
    const skill = pipeline.get(skillName);
    if (!skill?.reports.includes(report)) throw new Error(`${skillName} must own ${report}`);
    if (!existsSync(path.join(root, schema))) throw new Error(`${skillName} requires missing ${schema}`);
  }
  if (!pipeline.get("audit-review-findings")?.dependencies.includes("audit-code")) throw new Error("audit-review-findings must depend on audit-code");
  if (!pipeline.get("audit-plan-remediation")?.dependencies.includes("audit-review-findings")) throw new Error("audit-plan-remediation must depend on audit-review-findings");
  if (!pipeline.get("audit-remediation")?.dependencies.includes("audit-plan-remediation")) throw new Error("audit-remediation must depend on audit-plan-remediation");
  if (!pipeline.get("audit-remediation")?.dependencies.includes("workflow-state-manager")) throw new Error("audit-remediation must depend on workflow-state-manager");
  if (!pipeline.get("audit-remediation")?.dependencies.includes("project-handoff")) throw new Error("audit-remediation must depend on project-handoff");
  const reports = path.join(root, "reports");
  await assertSafeManagedPath(root, "reports");
  await mkdir(reports, { recursive: true });
  const generatedAt = new Date().toISOString();
  const skills = details.map(({ sha256, audit, ...skill }) => skill);
  const output = { schemaVersion: "1.0.0", runtimeVersion: VERSION, generatedAt, skills };
  await writeTextAtomic(path.join(reports, "skill-inventory.json"), `${JSON.stringify(output, null, 2)}\n`);
  const inventoryMarkdown = [
    "# Skill Inventory",
    "",
    `Generated: ${generatedAt}`,
    "",
    "| Skill | Description |",
    "| --- | --- |",
    ...skills.map((skill) => `| ${skill.name} | ${skill.description.replaceAll("|", "\\|")} |`),
    ""
  ].join("\n");
  await writeTextAtomic(path.join(reports, "skill-inventory.md"), inventoryMarkdown);
  await writeTextAtomic(path.join(reports, "skill-details.json"), `${JSON.stringify({ schemaVersion: "1.0.0", runtimeVersion: VERSION, generatedAt, skills: details }, null, 2)}\n`);
  const ownership = details
    .filter((skill) => !projectOwnedSkillIds.has(skill.name))
    .flatMap((skill) => skill.reports.map((report) => ({ report, producer: skill.name })))
    .concat(RUNTIME_OWNED_ARTIFACTS.map((report) => ({ report, producer: "pso-runtime" })))
    .sort((left, right) => left.report < right.report ? -1 : left.report > right.report ? 1 : 0);
  const duplicateReports = ownership.filter((item, index) => ownership.findIndex((candidate) => candidate.report === item.report) !== index);
  if (duplicateReports.length) throw new Error(`Reports have multiple producers: ${[...new Set(duplicateReports.map((item) => item.report))].join(", ")}`);
  await writeTextAtomic(path.join(reports, "artifact-ownership.json"), `${JSON.stringify({ schemaVersion: "1.0.0", generatedAt, artifacts: ownership }, null, 2)}\n`);
  const markdown = [
    "# Skill Details",
    "",
    `Generated: ${generatedAt}`,
    "",
    "| Skill | Lifecycle | Confidence | Audit | Dependencies |",
    "| --- | --- | --- | --- | --- |",
    ...details.map((skill) => `| ${skill.name} | ${skill.lifecycle} | ${skill.confidence} | ${skill.audit.status} | ${skill.dependencies.join(", ") || "None"} |`),
    ""
  ].join("\n");
  await writeTextAtomic(path.join(reports, "skill-details.md"), markdown);
  console.log(`Inventoried ${skills.length} skills`);
  console.log(`Audited ${details.length} skills (${details.filter((skill) => skill.audit.status === "passed").length} passed)`);
}

function requireWorkflowString(value, label) {
  if (typeof value !== "string" || !value.trim()) throw new Error(`Invalid workflow plan: ${label} must be a non-empty string`);
}

function validateWorkflowPlanShape(workflow) {
  if (!workflow || typeof workflow !== "object" || Array.isArray(workflow)) throw new Error("Invalid workflow plan: root must be an object");
  if (workflow.schemaVersion === "1.0.0") {
    for (const field of ["workflowId", "runId", "intent", "createdAt"]) requireWorkflowString(workflow[field], field);
    if (workflow.status !== "planned") throw new Error("Invalid workflow plan: status must be planned");
    if (!Array.isArray(workflow.steps) || !workflow.steps.length) throw new Error("Invalid workflow plan: steps must not be empty");
    return;
  }
  if (workflow.schemaVersion !== "1.1.0") throw new Error(`Invalid workflow plan: unsupported schemaVersion ${workflow.schemaVersion ?? "missing"}`);
  const topFields = new Set(["schemaVersion", "workflowId", "runId", "intent", "status", "createdAt", "terminalStepId", "steps"]);
  const stepFields = new Set(["id", "owner", "action", "status", "inputs", "outputs", "requiresApproval", "approvalClasses", "prerequisites", "completionCriteria", "checkpoint", "rollback", "recovery", "onBlocked", "onFailed"]);
  const ownerFields = new Set(["type", "id"]);
  const approvalClasses = new Set(["external", "privileged", "destructive", "irreversible", "production-data-mutation", "commit", "push", "phase", "signing", "publication", "release"]);
  const unexpectedTopFields = Object.keys(workflow).filter((field) => !topFields.has(field));
  if (unexpectedTopFields.length) throw new Error(`Invalid workflow plan: unexpected fields ${unexpectedTopFields.join(", ")}`);
  for (const field of ["workflowId", "runId", "intent", "createdAt", "terminalStepId"]) requireWorkflowString(workflow[field], field);
  if (Number.isNaN(Date.parse(workflow.createdAt))) throw new Error("Invalid workflow plan: createdAt must be a date-time");
  if (!/^STEP-[0-9]{3,}$/.test(workflow.terminalStepId)) throw new Error("Invalid workflow plan: terminalStepId has an invalid format");
  if (workflow.status !== "planned") throw new Error("Invalid workflow plan: status must be planned");
  if (!Array.isArray(workflow.steps) || !workflow.steps.length) throw new Error("Invalid workflow plan: steps must not be empty");
  for (const step of workflow.steps) {
    if (!step || typeof step !== "object" || Array.isArray(step)) throw new Error("Invalid workflow plan: every step must be an object");
    const unexpectedStepFields = Object.keys(step).filter((field) => !stepFields.has(field));
    if (unexpectedStepFields.length) throw new Error(`Invalid workflow plan: unexpected step fields ${unexpectedStepFields.join(", ")}`);
    for (const field of ["id", "action", "checkpoint", "rollback", "recovery", "onBlocked", "onFailed"]) requireWorkflowString(step[field], `${step.id ?? "step"}.${field}`);
    if (!/^STEP-[0-9]{3,}$/.test(step.id)) throw new Error(`Invalid workflow plan: step ID ${step.id} has an invalid format`);
    if (!/^CP-[A-Z0-9-]+$/.test(step.checkpoint)) throw new Error(`Invalid workflow plan: checkpoint ${step.checkpoint} has an invalid format`);
    if (!step.owner || typeof step.owner !== "object" || Array.isArray(step.owner)) throw new Error(`Invalid workflow plan: ${step.id}.owner must be an object`);
    const unexpectedOwnerFields = Object.keys(step.owner).filter((field) => !ownerFields.has(field));
    if (unexpectedOwnerFields.length) throw new Error(`Invalid workflow plan: unexpected owner fields ${unexpectedOwnerFields.join(", ")}`);
    if (!new Set(["skill", "operator"]).has(step.owner.type)) throw new Error(`Invalid workflow plan: ${step.id}.owner.type must be skill or operator`);
    requireWorkflowString(step.owner.id, `${step.id}.owner.id`);
    if (!new Set(["planned", "ready", "blocked", "completed", "failed", "skipped"]).has(step.status)) throw new Error(`Invalid workflow plan: unsupported status for ${step.id}`);
    for (const field of ["inputs", "outputs", "approvalClasses", "prerequisites", "completionCriteria"]) {
      if (!Array.isArray(step[field])) throw new Error(`Invalid workflow plan: ${step.id}.${field} must be an array`);
      if (field === "completionCriteria" && !step[field].length) throw new Error(`Invalid workflow plan: ${step.id}.completionCriteria must not be empty`);
      if (new Set(step[field]).size !== step[field].length) throw new Error(`Invalid workflow plan: ${step.id}.${field} contains duplicates`);
      for (const item of step[field]) requireWorkflowString(item, `${step.id}.${field}`);
    }
    if (typeof step.requiresApproval !== "boolean") throw new Error(`Invalid workflow plan: ${step.id}.requiresApproval must be boolean`);
    const unsupportedApprovals = step.approvalClasses.filter((approvalClass) => !approvalClasses.has(approvalClass));
    if (unsupportedApprovals.length) throw new Error(`Invalid workflow plan: ${step.id} has unsupported approval classes ${unsupportedApprovals.join(", ")}`);
    if (step.requiresApproval !== (step.approvalClasses.length > 0)) throw new Error(`Invalid workflow plan: ${step.id} approval declaration is inconsistent`);
    if (step.owner.type === "operator" && !step.requiresApproval) throw new Error(`Invalid workflow plan: operator step ${step.id} must require approval`);
  }
}

async function validateWorkflowPlan(workflow, root) {
  validateWorkflowPlanShape(workflow);
  if (workflow.schemaVersion === "1.0.0") return workflow;
  const ids = workflow.steps.map((step) => step.id);
  if (new Set(ids).size !== ids.length) throw new Error("Invalid workflow plan: step IDs must be unique");
  const byId = new Map(workflow.steps.map((step) => [step.id, step]));
  if (!byId.has(workflow.terminalStepId)) throw new Error(`Invalid workflow plan: terminal step ${workflow.terminalStepId} does not exist`);
  const terminal = byId.get(workflow.terminalStepId);
  if (terminal.owner.type !== "skill" || terminal.owner.id !== "project-handoff") throw new Error("Invalid workflow plan: terminal step must be owned by project-handoff");
  const skillNames = new Set((await discoverSkills(root)).map((skill) => skill.name));
  for (const step of workflow.steps) {
    if (step.owner.type === "skill" && !skillNames.has(step.owner.id)) throw new Error(`Invalid workflow plan: unknown skill owner ${step.owner.id}`);
    for (const reference of [...step.prerequisites, step.onBlocked, step.onFailed]) {
      if (!byId.has(reference)) throw new Error(`Invalid workflow plan: ${step.id} references unknown step ${reference}`);
    }
  }
  const visiting = new Set();
  const visited = new Set();
  function visitPrerequisites(id, trail = []) {
    if (visiting.has(id)) throw new Error(`Invalid workflow plan: prerequisite cycle ${[...trail, id].join(" -> ")}`);
    if (visited.has(id)) return;
    visiting.add(id);
    for (const prerequisite of byId.get(id).prerequisites) visitPrerequisites(prerequisite, [...trail, id]);
    visiting.delete(id);
    visited.add(id);
  }
  for (const id of ids) visitPrerequisites(id);
  const ready = workflow.steps.filter((step) => step.status === "ready");
  if (ready.length !== 1 || ready[0].prerequisites.length) throw new Error("Invalid workflow plan: exactly one prerequisite-free step must be ready");
  function reachesTerminal(start, route) {
    const seen = new Set();
    let current = start;
    while (current !== workflow.terminalStepId) {
      if (seen.has(current)) return false;
      seen.add(current);
      current = byId.get(current)[route];
    }
    return true;
  }
  for (const step of workflow.steps) {
    if (step.id === workflow.terminalStepId) continue;
    if (!reachesTerminal(step.id, "onBlocked")) throw new Error(`Invalid workflow plan: ${step.id} blocked route cannot reach terminal handoff`);
    if (!reachesTerminal(step.id, "onFailed")) throw new Error(`Invalid workflow plan: ${step.id} failed route cannot reach terminal handoff`);
  }
  return workflow;
}

function workflowPlanMarkdown(workflow) {
  return [
    "# Workflow Plan", "", `Generated: ${workflow.createdAt}`, "", `Intent: ${workflow.intent}`, "",
    "| Step | Owner | Status | Action | Approval |", "| --- | --- | --- | --- | --- |",
    ...workflow.steps.map((step) => `| ${step.id} | ${step.owner.type}:${step.owner.id} | ${step.status} | ${step.action.replaceAll("|", "\\|")} | ${step.approvalClasses.join(", ") || "None"} |`),
    "", `Terminal handoff: ${workflow.terminalStepId}`, ""
  ].join("\n");
}

function workflowStateMarkdown(state) {
  return [
    "# Current Execution State", "", `- Workflow: \`${state.workflowId}\``, `- Run: \`${state.runId}\``,
    `- Status: ${state.status}`, `- Current step: ${state.currentStep} of ${state.totalSteps}`,
    `- Active owner: \`${state.activeSkill}\``, `- Last sequence: ${state.lastSequence}`, ""
  ].join("\n");
}

async function validateWorkflowPlanFile(requestedRoot, requestedFile) {
  const root = await realpath(path.resolve(requestedRoot));
  const target = requestedFile ? path.resolve(root, requestedFile) : path.join(root, "reports", "workflow-plan.json");
  const relative = path.relative(root, target);
  validateRelativePath(relative);
  await assertSafeManagedPath(root, relative);
  const workflow = JSON.parse(await readFile(target, "utf8"));
  await validateWorkflowPlan(workflow, root);
  console.log(`Validated workflow plan: ${workflow.workflowId}`);
}

async function plan(requestedRoot, intent) {
  if (!intent) throw new Error("Use --intent to describe the requested outcome");
  const root = await realpath(path.resolve(requestedRoot));
  await assertSafeManagedPath(root, "reports");
  const reports = path.join(root, "reports");
  await mkdir(reports, { recursive: true });
  const lockPath = path.join(reports, "workflow-plan.lock");
  try {
    await writeFile(lockPath, `${JSON.stringify({ processId: process.pid, startedAt: new Date().toISOString() })}\n`, {
      encoding: "utf8",
      flag: "wx",
      mode: 0o600
    });
  } catch (error) {
    if (error.code === "EEXIST") throw new Error("Another workflow planner holds reports/workflow-plan.lock");
    throw error;
  }
  try {
    const workflowId = `WF-${randomUUID()}`;
    const runId = `RUN-${randomUUID()}`;
    const now = new Date().toISOString();
    const workflow = {
      schemaVersion: "1.1.0", workflowId, runId, intent,
      status: "planned", createdAt: now, terminalStepId: "STEP-002",
      steps: [
        {
          id: "STEP-001", owner: { type: "skill", id: "project-skills-orchestrator" }, action: "Route clarified intent", status: "ready",
          inputs: ["Clarified user intent"], outputs: ["Routed workflow outcome"], requiresApproval: false, approvalClasses: [], prerequisites: [],
          completionCriteria: ["Intent is routed to exactly one owning skill per executable step."], checkpoint: "CP-ROUTED",
          rollback: "Preserve the prior valid plan.", recovery: "Correct unresolved ownership and replan.", onBlocked: "STEP-002", onFailed: "STEP-002"
        },
        {
          id: "STEP-002", owner: { type: "skill", id: "project-handoff" }, action: "Publish terminal workflow continuity", status: "planned",
          inputs: ["STEP-001 outcome"], outputs: ["reports/project-handoff.json", "reports/project-handoff.md", "reports/current-work-state.json"], requiresApproval: false, approvalClasses: [], prerequisites: ["STEP-001"],
          completionCriteria: ["The handoff records completed, blocked, failed, and pending work with one next action."], checkpoint: "CP-HANDOFF",
          rollback: "Preserve the prior valid handoff.", recovery: "Regenerate synchronized continuity from the latest valid outcome.", onBlocked: "STEP-002", onFailed: "STEP-002"
        }
      ]
    };
    await validateWorkflowPlan(workflow, root);
    const eventFile = path.join(reports, "execution-log.jsonl");
    await assertSafeManagedPath(root, "reports/execution-log.jsonl");
    let sequence = 1;
    try {
      const content = await readFile(eventFile, "utf8");
      sequence = content.split(/\r?\n/).filter(Boolean).length + 1;
    } catch (error) {
      if (error.code !== "ENOENT") throw error;
    }
    const event = {
      schemaVersion: "1.0.0", sequence, timestamp: now, workflowId, runId,
      event: "workflow-planned", actor: "pso-standalone", intent, totalSteps: workflow.steps.length
    };
    const state = {
      schemaVersion: "1.0.0", workflowId, runId, status: "planned", currentStep: 1,
      totalSteps: workflow.steps.length, activeSkill: workflow.steps[0].owner.id,
      lastCompletedStep: 0, resumeFromStep: 1, lastSequence: sequence, updatedAt: now
    };
    await appendFile(eventFile, `${JSON.stringify(event)}\n`, "utf8");
    await writeTextAtomic(path.join(reports, "workflow-plan.json"), `${JSON.stringify(workflow, null, 2)}\n`);
    await writeTextAtomic(path.join(reports, "workflow-plan.md"), workflowPlanMarkdown(workflow));
    await writeTextAtomic(path.join(reports, "current-execution-state.json"), `${JSON.stringify(state, null, 2)}\n`);
    await writeTextAtomic(path.join(reports, "current-execution-state.md"), workflowStateMarkdown(state));
    console.log(`Created workflow ${workflowId}`);
  } finally {
    await rm(lockPath, { force: true });
  }
}

async function guidedCreate() {
  const terminal = createInterface({ input: process.stdin, output: process.stdout });
  try {
    const name = await terminal.question("Project name: ");
    const destination = await terminal.question(`Destination folder [${process.cwd()}]: `);
    const stack = await terminal.question(`Stack, comma separated, blank for none [${[...STACK_TAGS].sort().join(", ")}]: `);
    const color = await terminal.question(`Workspace accent color [${DEFAULT_WORKSPACE_COLOR}]: `);
    const intent = await terminal.question("What should be built first? Blank to skip: ");
    const openAnswer = await terminal.question("Open in Visual Studio Code when finished? [Y/n]: ");
    const riskAcceptance = await promptRiskAcceptance(terminal);
    const result = await createProject({
      name,
      destination: destination.trim() || process.cwd(),
      stack: stack.trim(),
      color: color.trim() || DEFAULT_WORKSPACE_COLOR,
      intent: intent.trim(),
      open: !openAnswer.trim().toLowerCase().startsWith("n"),
      riskAcceptance
    });
    console.log(`Created project: ${result.root}`);
    console.log(`Open workspace: ${result.workspace}`);
    reportLaunch(result);
  } finally {
    terminal.close();
  }
}

function reportLaunch({ launch, prompt, brief }) {
  if (brief) console.log(`Project brief: ${brief}`);
  if (!launch) {
    if (prompt) console.log("Rerun with --open to launch Visual Studio Code and hand the requested outcome to the agent.");
    else console.log("Rerun with --open to launch Visual Studio Code automatically.");
    return;
  }
  if (launch.opened) {
    console.log("Opening Visual Studio Code. Accept the workspace trust prompt and the recommended extensions to enable tasks, debugging, and MCP servers.");
    if (launch.seeded) {
      console.log("The requested outcome was handed to chat in ask mode, so the first turn can plan and ask questions but cannot change files. Switch to Agent mode once you approve the plan.");
    }
    return;
  }
  console.log(`Could not open Visual Studio Code automatically: ${launch.reason}. Open the workspace file listed above manually.`);
  if (prompt) console.log(`Paste this into Copilot Chat in the new project:\n\n${prompt}\n`);
}

function runAgentBuilder(options) {
  const action = options._[1];
  if (!action) throw new Error("Use agent build, agent validate, agent plan, or agent apply");
  const script = path.join(SCRIPT_ROOT, ".github", "skills", "agent-builder", "scripts", "agent-builder.mjs");
  if (!existsSync(script)) throw new Error("Distribution is missing the Agent Builder engine");
  const args = [script, action];
  const valueOptions = [
    "project", "blueprint", "plan", "agent", "type", "id", "name", "description", "purpose", "risk", "capabilities",
    "user-invocable", "model-invocable", "autonomy", "web-safety", "constraints", "approach", "output-format", "subagents", "handoffs-file",
    "azure-required", "cloud", "location", "environment-name", "authentication-method", "subscription-id",
    "publication-targets", "version-policy", "microsoft365-audience", "chatgpt-visibility"
  ];
  const flagOptions = ["accept-risk", "json"];
  for (const key of Object.keys(options).filter((item) => item !== "_")) {
    if (/^(?:password|client-secret|secret|token|api-key|access-key|connection-string)$/i.test(key)) {
      throw new Error(`Credential parameter --${key} is prohibited; authenticate directly through the Azure CLI session`);
    }
    if (![...valueOptions, ...flagOptions].includes(key)) throw new Error(`Unknown Agent Builder parameter: --${key}`);
  }
  for (const key of valueOptions) {
    if (options[key] !== undefined) args.push(`--${key}`, String(options[key]));
  }
  for (const key of flagOptions) {
    if (options[key] === true) args.push(`--${key}`);
  }
  const result = spawnSync(process.execPath, args, { cwd: process.cwd(), stdio: "inherit", windowsHide: true });
  if (result.error) throw new Error(`Agent Builder could not start: ${result.error.message}`);
  if (result.status !== 0) throw new Error(`Agent Builder failed with exit code ${result.status}`);
}

// Windows can refuse a directory rename while an indexer or scanner still holds a handle in the staging tree.
async function publishStagedProject(staging, destination) {
  const transientCodes = new Set(["EACCES", "EBUSY", "EPERM"]);
  for (let attempt = 0; attempt < 8; attempt += 1) {
    try {
      await rename(staging, destination);
      return;
    } catch (error) {
      if (!transientCodes.has(error.code) || existsSync(destination)) throw error;
      if (attempt === 7) {
        await cp(staging, destination, { recursive: true });
        await rm(staging, { recursive: true, force: true });
        return;
      }
      await delay(Math.min(50 * (2 ** attempt), 500));
    }
  }
}

async function cloneAndSetup({ repository: enteredRepository, destination, profile = DEFAULT_PROJECT_PROFILE, riskAcceptance }) {
  if (!riskAcceptance) throw new Error("Risk acceptance is required before cloning and provisioning a repository");
  if (!PROFILES.has(profile)) throw new Error(`Unsupported profile: ${profile}`);
  const { repository, name } = validateGitHubRepository(enteredRepository);
  const requestedRoot = path.resolve(destination || path.join(process.cwd(), name));
  if (existsSync(requestedRoot)) throw new Error(`Clone destination must not already exist: ${requestedRoot}`);
  const parent = await realpath(path.dirname(requestedRoot));
  const projectName = path.basename(requestedRoot);
  validateRelativePath(projectName);
  if (!/^[A-Za-z0-9._ -]{1,128}$/.test(projectName)) {
    throw new Error("Clone destination folder name must contain only letters, numbers, spaces, dots, underscores, or hyphens");
  }
  const root = path.join(parent, projectName);
  const staging = path.join(parent, `.pso-clone-${normalizeName(projectName)}-${randomUUID()}`);
  const clone = spawnSync("git", ["clone", "--", repository, staging], {
    cwd: parent,
    stdio: "inherit",
    windowsHide: true
  });
  if (clone.error) {
    await rm(staging, { recursive: true, force: true });
    throw new Error(`Git clone could not start: ${clone.error.message}`);
  }
  if (clone.status !== 0) {
    await rm(staging, { recursive: true, force: true });
    throw new Error(`Git clone failed with exit code ${clone.status}`);
  }
  try {
    const plan = await buildAdoptionPlan(staging, profile, projectName);
    if (!plan.canApply) throw new Error("Cloned repository has blocking adoption conflicts");
    const verification = await applyAdoption(plan, riskAcceptance);
    await publishStagedProject(staging, root);
    return { root, repository, verification };
  } catch (error) {
    throw new Error(`Repository provisioning failed. Staging path preserved for recovery: ${staging}\n${error.message}`);
  }
}

async function guidedSetup() {
  const terminal = createInterface({ input: process.stdin, output: process.stdout });
  try {
    console.log("Project Orchestrator Setup\n");
    const projectType = (await terminal.question("Is this a (N)ew project, (E)xisting local project, or (R)emote GitHub repository? [N/E/R]: ")).trim().toLowerCase();
    if (projectType === "n" || projectType === "new") {
      const name = await terminal.question("Project name: ");
      const destination = await terminal.question(`Parent destination folder [${process.cwd()}]: `);
      const enteredProfile = await terminal.question(`Conformance profile [${DEFAULT_PROJECT_PROFILE}]: `);
      const color = await terminal.question(`Workspace accent color [${DEFAULT_WORKSPACE_COLOR}]: `);
      const riskAcceptance = await promptRiskAcceptance(terminal);
      const result = await createProject({
        name,
        destination: destination.trim() || process.cwd(),
        profile: enteredProfile.trim().toLowerCase() || DEFAULT_PROJECT_PROFILE,
        color: color.trim() || DEFAULT_WORKSPACE_COLOR,
        riskAcceptance
      });
      console.log(`\nCreated project: ${result.root}`);
      console.log(`Open workspace: ${result.workspace}`);
      return;
    }
    if (projectType === "e" || projectType === "existing") {
      const project = await terminal.question("Where is the existing repository saved? ");
      const enteredProfile = await terminal.question(`Conformance profile [${DEFAULT_PROJECT_PROFILE}]: `);
      const plan = await buildAdoptionPlan(project, enteredProfile.trim().toLowerCase() || DEFAULT_PROJECT_PROFILE);
      printAdoptionPlan(plan);
      if (!plan.canApply) {
        console.log("\nNo files were changed. Resolve the listed conflicts and run setup again.");
        return;
      }
      const confirmation = (await terminal.question("\nApply this adoption plan? [y/N]: ")).trim().toLowerCase();
      if (confirmation !== "y" && confirmation !== "yes") {
        console.log("No files were changed.");
        return;
      }
      const riskAcceptance = await promptRiskAcceptance(terminal);
      await applyAdoption(plan, riskAcceptance);
      return;
    }
    if (projectType === "r" || projectType === "remote") {
      const repository = await terminal.question("GitHub repository URL: ");
      const repositoryDetails = validateGitHubRepository(repository);
      const defaultDestination = path.join(process.cwd(), repositoryDetails.name);
      const destination = await terminal.question(`Local destination path [${defaultDestination}]: `);
      const enteredProfile = await terminal.question(`Conformance profile [${DEFAULT_PROJECT_PROFILE}]: `);
      const riskAcceptance = await promptRiskAcceptance(terminal);
      const result = await cloneAndSetup({
        repository,
        destination: destination.trim() || defaultDestination,
        profile: enteredProfile.trim().toLowerCase() || DEFAULT_PROJECT_PROFILE,
        riskAcceptance
      });
      console.log(`\nCloned and provisioned project: ${result.root}`);
      return;
    }
    throw new Error("Choose N for a new project, E for an existing local project, or R for a remote GitHub repository");
  } finally {
    terminal.close();
  }
}

function help() {
  console.log(`Project Orchestrator ${VERSION}

Usage:
  node .\\pso.mjs
  node .\pso.mjs create-project --name "My Project" --destination "C:\repos" --profile durable --stack typescript --color "#004578" --open --accept-risk
  node .\\pso.mjs clone-setup --repository "https://github.com/owner/project.git" [--destination "C:\\repos\\project"] --profile durable --accept-risk
  node .\\pso.mjs adopt --project "C:\\repos\\existing" --profile core --dry-run
  node .\\pso.mjs adopt --project "C:\\repos\\existing" --profile core --apply --accept-risk
  node .\\pso.mjs recover --project "C:\\repos\\existing" [--transaction ID]
  node .\\pso.mjs inventory [--root "C:\\repos\\my-project"]
  node .\\pso.mjs plan --intent "Build a customer portal" [--root PATH]
  node .\\pso.mjs plan validate [--root PATH] [--file reports/workflow-plan.json]
  node .\\pso.mjs agent build --project "C:\\repos\\my-project" [agent parameters]
  node .\\pso.mjs agent validate --project "C:\\repos\\my-project" --blueprint agent.json
  node .\\pso.mjs agent plan --project "C:\\repos\\my-project" --blueprint agent.json
  node .\\pso.mjs agent apply --project "C:\\repos\\my-project" --blueprint agent.json --plan reports/agent-builder-plan.json --accept-risk
  node .\\pso.mjs verify
  node .\\pso.mjs --version

New project:
  --profile selects the conformance profile. The default is ${DEFAULT_PROJECT_PROFILE}.
  Supported values: ${[...PROFILES].join(", ")}
  --stack is optional and accepts a comma-separated list. It selects the scoped
  instruction files, the build and test tasks, the debug configurations, and the
  continuous-integration commands. Without it none of those are generated.
  Supported values: ${[...STACK_TAGS].sort().join(", ")}
  --color sets the new workspace accent using #RRGGBB. The default is ${DEFAULT_WORKSPACE_COLOR}.
  --open launches Visual Studio Code on the generated workspace when the editor
  is installed. Accept the workspace trust prompt to enable tasks, debugging,
  and MCP servers.
  --intent records the outcome you want built first. It is written to
  docs/PROJECT-BRIEF.md, and with --open it is handed to Copilot Chat in ask
  mode so the first turn can plan and ask questions but cannot change files.
  Describe the application only; the project itself already exists by then.

Agent Builder:
  agent build accepts --type, --id, --name, --description, --purpose, --risk,
  --capabilities, --user-invocable, --model-invocable, --autonomy, --web-safety,
  --constraints, --approach, --output-format, --subagents, and --handoffs-file.
  Missing values are requested. Autonomous research is limited to read-only
  read, search, and web capabilities.
  Foundry publication planning accepts --publication-targets, --version-policy,
  --microsoft365-audience, and --chatgpt-visibility. It records a review handoff
  but does not deploy, configure endpoints, publish channels, or create a GPT.
  Foundry types or --azure-required true also resolve --cloud, --location,
  --environment-name, --authentication-method, and optional --subscription-id.
  Azure CLI authentication starts only when required. Credential values are never accepted.

Adoption:
  --force-templates installs framework templates even where an equivalent exists.
  --force-adopt proceeds against a directory with no recognized project marker.
  --json emits a portable dry-run plan to standard output without changing the project.

Update:
  node .\\pso.mjs update --project "C:\\repos\\existing" [--mode all] [--dry-run]
  node .\\pso.mjs update --project "C:\\repos\\existing" --mode select --selection-file FILE --apply --accept-risk
  node .\\pso.mjs update --project "C:\\repos\\existing" --mode additive [--skills IDs] [--assets PATHS]
  node .\\pso.mjs update --project "C:\\repos\\existing" --mode select (--skills IDs | --assets PATHS | --selection-file FILE)
  Builds a portable plan in reports/project-update-plan.json and .md. Update remains
  plan-only unless both --apply and --accept-risk are provided.
  Bare update and --mode all are safe-all aliases. Selectors are comma-separated;
  selection files bind selectors and optional deferred dispositions to an exact plan digest and target.

Clone setup:
  --destination is optional; the default is .\\<repository-name>
  Use a credential-free GitHub HTTPS URL or git@github.com SSH location.
  The destination must not already exist.
`);
}

async function main() {
  assertSupportedRuntime();
  const options = parseArgs(process.argv.slice(2));
  const command = options._[0];
  if (options.version) return console.log(VERSION);
  if (options.help || command === "help") {
    if (await printSkillHelp(options._[options.help ? 0 : 1])) return;
    return help();
  }
  if (command === "verify") {
    const required = [".github/skills", "schemas", "config/profiles.yaml", TEMPLATE_ROOT_RELATIVE, SCAFFOLD_MANIFEST_RELATIVE];
    const missing = required.filter((item) => !existsSync(path.join(SCRIPT_ROOT, item)));
    if (missing.length) throw new Error(`Distribution is incomplete: ${missing.join(", ")}`);
    const entries = await readdir(path.join(SCRIPT_ROOT, ".github", "skills"), { withFileTypes: true });
    const incomplete = entries.filter((entry) => entry.isDirectory() && !existsSync(path.join(SCRIPT_ROOT, ".github", "skills", entry.name, "SKILL.md")));
    if (incomplete.length) throw new Error(`Skill packages are missing SKILL.md: ${incomplete.map((entry) => entry.name).join(", ")}`);
    const count = entries.filter((entry) => entry.isDirectory()).length;
    if (!count) throw new Error("Distribution contains no skill packages");
    await loadScaffoldManifest();
    await inventory(SCRIPT_ROOT);
    return console.log(`Verified registry-free distribution: ${count} skills, schemas, profiles, dependencies, ownership, and audit pipeline`);
  }
  if (command === "create-project") {
    if (!options.name || !options.destination) return guidedCreate();
    const riskAcceptance = acknowledgeRisk(options["accept-risk"] === true, "cli-flag");
    const result = await createProject({
      name: options.name,
      destination: options.destination,
      profile: options.profile ?? DEFAULT_PROJECT_PROFILE,
      stack: options.stack ?? "",
      color: options.color ?? DEFAULT_WORKSPACE_COLOR,
      intent: options.intent ?? "",
      open: options.open === true,
      riskAcceptance
    });
    console.log(`Created project: ${result.root}`);
    console.log(`Open workspace: ${result.workspace}`);
    return reportLaunch(result);
  }
  if (command === "clone-setup") {
    if (!options.repository) throw new Error("Use --repository with a GitHub URL");
    const riskAcceptance = acknowledgeRisk(options["accept-risk"] === true, "cli-flag");
    const result = await cloneAndSetup({
      repository: options.repository,
      destination: options.destination,
      profile: options.profile ?? DEFAULT_PROJECT_PROFILE,
      riskAcceptance
    });
    return console.log(`Cloned and provisioned project: ${result.root}`);
  }
  if (command === "adopt") {
    if (!options.project) throw new Error("Use --project with the existing repository path");
    if (options.json && options.apply) throw new Error("Use --json only with an adoption dry run");
    const plan = await buildAdoptionPlan(options.project, options.profile, undefined, {
      forceTemplates: options["force-templates"] === true,
      forceAdopt: options["force-adopt"] === true,
      stackOverride: options.stack ?? ""
    });
    if (options.json) return console.log(JSON.stringify(portableAdoptionPlan(plan), null, 2));
    printAdoptionPlan(plan);
    if (options.apply) {
      const riskAcceptance = acknowledgeRisk(options["accept-risk"] === true, "cli-flag");
      return applyAdoption(plan, riskAcceptance);
    }
    console.log("\nDry run only. No project files were changed.");
    return;
  }
  if (command === "update") {
    validateUpdateOptions(options);
    if (!options.project) throw new Error("Use --project with the standalone project path");
    return updateProject(options.project, options);
  }
  if (command === "recover") {
    if (!options.project) throw new Error("Use --project with the repository path to recover");
    return recoverAdoption(options.project, options.transaction);
  }
  if (command === "agent") return runAgentBuilder(options);
  if (command === "inventory") return inventory(path.resolve(options.root ?? process.cwd()));
  if (command === "plan" && options._[1] === "validate") return validateWorkflowPlanFile(path.resolve(options.root ?? process.cwd()), options.file);
  if (command === "plan") return plan(path.resolve(options.root ?? process.cwd()), options.intent);
  if (!command) return guidedSetup();
  throw new Error(`Unknown command: ${command}`);
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  main().catch((error) => fail(error.message));
}
