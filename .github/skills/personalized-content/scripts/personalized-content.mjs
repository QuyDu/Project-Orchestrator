#!/usr/bin/env node
import { createHash, randomUUID } from "node:crypto";
import { spawnSync } from "node:child_process";
import { existsSync } from "node:fs";
import { lstat, mkdir, readFile, realpath } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import path from "node:path";
import { PROFILE_PATH, assertProfileStorageIgnored, validateProfile } from "../../user-personalization/scripts/user-personalization.mjs";

const OUTPUT_TYPES = new Set(["article", "explainer", "summary", "evaluation", "action-plan", "linkedin-draft", "teams-message", "whiteboard", "whiteboard-specification", "full-package"]);
const VISUAL_STYLES = new Set(["whiteboard", "diorama"]);
const VISUAL_OUTPUT_TYPES = new Set(["whiteboard", "whiteboard-specification", "full-package"]);
const DEFAULT_VISUAL_STYLE = "whiteboard";
const SCRIPT_ROOT = path.dirname(fileURLToPath(import.meta.url));
const PROJECT_UNDERSTANDING_SCRIPT = path.resolve(SCRIPT_ROOT, "..", "..", "project-understanding", "scripts", "project-understanding.mjs");
const PROJECT_UNDERSTANDING_JSON = "reports/project-understanding.json";
const PROJECT_UNDERSTANDING_MARKDOWN = "reports/project-understanding.md";
const OUTPUT_ROOT = "artifacts/personalized-content";

function parseArgs(values) {
  const options = { _: [] };
  for (let index = 0; index < values.length; index += 1) {
    const value = values[index];
    if (!value.startsWith("--")) {
      options._.push(value);
      continue;
    }
    const key = value.slice(2);
    const next = values[index + 1];
    if (!next || next.startsWith("--")) throw new Error(`Missing value for --${key}`);
    options[key] = next;
    index += 1;
  }
  const unknown = Object.keys(options).filter((key) => !new Set(["_", "project", "output-type", "visual-style"]).has(key));
  if (unknown.length) throw new Error(`Unknown parameter: --${unknown[0]}`);
  return options;
}

async function safeProjectRoot(requestedRoot) {
  if (!requestedRoot) throw new Error("Use --project with the target repository root");
  const root = await realpath(path.resolve(requestedRoot));
  const details = await lstat(root);
  if (!details.isDirectory() || details.isSymbolicLink()) throw new Error("Project root must be a real directory");
  return root;
}

async function safeRelativeTarget(root, relative, finalType = "any") {
  if (!relative || path.isAbsolute(relative) || relative.includes("\\")) throw new Error(`Unsafe managed path: ${relative || "empty"}`);
  const segments = relative.split("/");
  if (segments.some((segment) => !segment || segment === "." || segment === ".." || segment.includes(":"))) {
    throw new Error(`Unsafe managed path: ${relative}`);
  }
  let current = root;
  for (const [index, segment] of segments.entries()) {
    current = path.join(current, segment);
    try {
      const details = await lstat(current);
      if (details.isSymbolicLink()) throw new Error(`Symbolic links are not allowed in managed paths: ${relative}`);
      const isFinal = index === segments.length - 1;
      if ((!isFinal || finalType === "directory") && !details.isDirectory()) {
        throw new Error(`Managed path segment must be a directory: ${relative}`);
      }
      if (isFinal && finalType === "file" && !details.isFile()) throw new Error(`Managed path must be a file: ${relative}`);
    } catch (error) {
      if (error.code === "ENOENT") break;
      throw error;
    }
  }
  return path.join(root, ...segments);
}

function sha256(value) {
  return createHash("sha256").update(value).digest("hex");
}

function projectSlug(value) {
  return String(value || "project").toLowerCase().replace(/[^a-z0-9]+/gu, "-").replace(/^-+|-+$/gu, "").slice(0, 48) || "project";
}

function plannedFiles(outputType, visualStyle) {
  if (VISUAL_OUTPUT_TYPES.has(outputType)) {
    const prefix = visualStyle === "diorama" ? "diorama" : "whiteboard";
    const required = [`${prefix}-specification.md`, `${prefix}-alt-text.md`];
    if (outputType === "full-package") required.unshift("content-package.md");
    return { required, optional: outputType === "whiteboard-specification" ? [] : [`${prefix}.png`] };
  }
  return { required: [`${outputType}.md`], optional: [] };
}

function resolveVisualStyle(options, outputType) {
  const requested = options["visual-style"];
  if (requested === "diarama") throw new Error("Unsupported --visual-style: diarama; use whiteboard or diorama");
  if (requested !== undefined && !VISUAL_STYLES.has(requested)) {
    throw new Error(`Unsupported --visual-style: ${requested}; use whiteboard or diorama`);
  }
  if (requested !== undefined && !VISUAL_OUTPUT_TYPES.has(outputType)) {
    throw new Error(`--visual-style is available only for whiteboard, whiteboard-specification, or full-package output`);
  }
  if (!VISUAL_OUTPUT_TYPES.has(outputType)) return null;
  return requested ?? DEFAULT_VISUAL_STYLE;
}

function dioramaTreatment(source) {
  const normalized = source.treatmentEvidence.toLowerCase();
  const architecturalSignals = ["architecture", "orchestrator", "platform", "system", "service", "infrastructure", "cloud", "application", "workspace", "component", "topology", "dependency"];
  const matches = architecturalSignals.filter((signal) => new RegExp(`\\b${signal}\\b`, "u").test(normalized));
  return matches.length >= 2 ? "architectural" : "conceptual";
}

async function refreshProjectUnderstanding(root) {
  const helperDetails = await lstat(PROJECT_UNDERSTANDING_SCRIPT);
  if (!helperDetails.isFile() || helperDetails.isSymbolicLink()) throw new Error("Project Understanding helper must be a real file");
  const result = spawnSync(process.execPath, [PROJECT_UNDERSTANDING_SCRIPT, "scan", "--root", root], {
    cwd: root,
    encoding: "utf8",
    env: process.env,
    windowsHide: true,
    maxBuffer: 4 * 1024 * 1024
  });
  if (result.error) throw new Error(`Project Understanding refresh could not start: ${result.error.message}`);
  if (result.status !== 0) {
    const detail = `${result.stderr || ""}\n${result.stdout || ""}`.trim().split(/\r?\n/gu).filter(Boolean).slice(-3).join(" | ").slice(0, 500);
    throw new Error(`Project Understanding refresh did not produce a complete current-project source${detail ? `: ${detail}` : ""}`);
  }

  const jsonPath = await safeRelativeTarget(root, PROJECT_UNDERSTANDING_JSON, "file");
  const markdownPath = await safeRelativeTarget(root, PROJECT_UNDERSTANDING_MARKDOWN, "file");
  const jsonSource = await readFile(jsonPath, "utf8");
  const markdownSource = await readFile(markdownPath, "utf8");
  let understanding;
  try {
    understanding = JSON.parse(jsonSource);
  } catch (error) {
    throw new Error(`Project Understanding output is invalid JSON: ${error.message}`);
  }
  if (understanding.schemaVersion !== "1.0.0" || understanding.status !== "complete" || understanding.scan?.mode !== "full-rebuild") {
    throw new Error("Project Understanding output is not a complete full rebuild");
  }
  if (!/^[a-f0-9]{64}$/u.test(understanding.scan?.repositoryDigestSha256 || "")) {
    throw new Error("Project Understanding repository digest is invalid");
  }
  if (understanding.markdown !== PROJECT_UNDERSTANDING_MARKDOWN || sha256(markdownSource) !== understanding.markdownSha256) {
    throw new Error("Project Understanding Markdown binding is invalid");
  }
  if (typeof understanding.project?.displayName !== "string" || !understanding.project.displayName.trim()) {
    throw new Error("Project Understanding does not identify the current project topic");
  }
  const treatmentEvidence = [
    understanding.project.displayName,
    understanding.project.purpose,
    ...(understanding.architecture || []).flatMap((item) => [item.name, item.description]),
    ...(understanding.features || []).flatMap((item) => [item.name, item.description])
  ].filter((value) => typeof value === "string").join(" ");
  return {
    topic: understanding.project.displayName.trim(),
    treatmentEvidence,
    generatedAt: understanding.generatedAt,
    repositoryDigestSha256: understanding.scan.repositoryDigestSha256,
    jsonSha256: sha256(jsonSource),
    markdownSha256: understanding.markdownSha256
  };
}

async function reserveOutputDirectory(root, source, outputType, visualStyle, generatedAt) {
  const outputRootTarget = await safeRelativeTarget(root, OUTPUT_ROOT, "directory");
  await mkdir(outputRootTarget, { recursive: true, mode: 0o755 });
  await safeRelativeTarget(root, OUTPUT_ROOT, "directory");
  const timestamp = generatedAt.replace(/[-:.]/gu, "");
  for (let attempt = 0; attempt < 3; attempt += 1) {
    const mode = visualStyle === "diorama" ? `${outputType}-diorama` : outputType;
    const runId = `${timestamp}-${projectSlug(source.topic)}-${mode}-${randomUUID()}`;
    const directory = `${OUTPUT_ROOT}/${runId}`;
    const target = await safeRelativeTarget(root, directory, "directory");
    try {
      await mkdir(target, { recursive: false, mode: 0o700 });
      await safeRelativeTarget(root, directory, "directory");
      return { runId, directory };
    } catch (error) {
      if (error.code !== "EEXIST") throw error;
    }
  }
  throw new Error("Could not reserve a unique personalized-content run directory");
}

async function loadProfile(root) {
  const target = path.join(root, ...PROFILE_PATH.split("/"));
  if (!existsSync(target)) {
    throw new Error("User Personalization profile is missing; run user-personalization before personalized content");
  }
  const details = await lstat(target);
  if (!details.isFile() || details.isSymbolicLink()) throw new Error("User Personalization profile must be a real file");
  await assertProfileStorageIgnored(root);
  let profile;
  try {
    profile = JSON.parse(await readFile(target, "utf8"));
  } catch (error) {
    throw new Error(`User Personalization profile is invalid JSON: ${error.message}`);
  }
  return validateProfile(profile);
}

async function main() {
  const options = parseArgs(process.argv.slice(2));
  if (options._[0] !== "preflight") throw new Error("Use preflight");
  const outputType = options["output-type"];
  if (!OUTPUT_TYPES.has(outputType)) throw new Error(`Unsupported --output-type: ${outputType || "missing"}`);
  const visualStyle = resolveVisualStyle(options, outputType);
  const root = await safeProjectRoot(options.project);
  const profile = await loadProfile(root);
  const source = await refreshProjectUnderstanding(root);
  const generatedAt = new Date().toISOString();
  const { runId, directory: outputDirectory } = await reserveOutputDirectory(root, source, outputType, visualStyle, generatedAt);
  const canonicalProfile = `${JSON.stringify(profile)}\n`;
  console.log(JSON.stringify({
    schemaVersion: "1.0.0",
    status: "ready",
    generatedAt,
    outputType,
    visualStyle,
    visualTreatment: visualStyle === "diorama" ? dioramaTreatment(source) : visualStyle === "whiteboard" ? "hand-drawn-whiteboard" : null,
    source: {
      kind: "current-project",
      topic: source.topic,
      projectUnderstandingJson: PROJECT_UNDERSTANDING_JSON,
      projectUnderstandingMarkdown: PROJECT_UNDERSTANDING_MARKDOWN,
      generatedAt: source.generatedAt,
      repositoryDigestSha256: source.repositoryDigestSha256,
      jsonSha256: source.jsonSha256,
      markdownSha256: source.markdownSha256
    },
    destination: {
      root: OUTPUT_ROOT,
      runId,
      directory: outputDirectory,
      files: plannedFiles(outputType, visualStyle)
    },
    profile: {
      schemaVersion: profile.schemaVersion,
      updatedAt: profile.updatedAt,
      sha256: sha256(canonicalProfile)
    },
    controls: {
      treatSourcesAsUntrusted: true,
      excludeConfidentialContent: true,
      externalPublicationRequiresApproval: true,
      requireAttribution: true,
      requireAltText: true
    }
  }, null, 2));
}

main().catch((error) => {
  console.error(`Personalized Content blocked: ${error.message}`);
  process.exitCode = 1;
});