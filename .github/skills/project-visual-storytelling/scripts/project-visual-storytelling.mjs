#!/usr/bin/env node
import { createHash, randomUUID } from "node:crypto";
import { spawnSync } from "node:child_process";
import { existsSync } from "node:fs";
import { lstat, mkdir, readFile, realpath, rm, writeFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import path from "node:path";
import { PROFILE_PATH, assertProfileStorageIgnored, validateProfile } from "../../user-personalization/scripts/user-personalization.mjs";
import { generateMaiImage, inspectMaiImage } from "./mai-image-render.mjs";

const OUTPUT_TYPES = new Set(["whiteboard", "whiteboard-specification", "diorama", "diorama-specification"]);
const DIAGRAM_TYPES = new Set(["architecture", "component", "deployment", "data-flow", "sequence", "process", "agent-topology", "executive-overview"]);
const DIAGRAM_AUDIENCES = new Set(["executive", "business", "technical", "developer", "operations", "security"]);
const DIAGRAM_STATES = new Set(["current", "future", "comparison"]);
const DIAGRAM_DETAILS = new Set(["low", "medium", "high"]);
const DIAGRAM_FORMATS = new Set(["mmd", "spec"]);
const SCRIPT_ROOT = path.dirname(fileURLToPath(import.meta.url));
const PROJECT_UNDERSTANDING_SCRIPT = path.resolve(SCRIPT_ROOT, "..", "..", "project-understanding", "scripts", "project-understanding.mjs");
const PROJECT_UNDERSTANDING_JSON = "reports/project-understanding.json";
const PROJECT_UNDERSTANDING_MARKDOWN = "reports/project-understanding.md";
const OUTPUT_ROOT = "artifacts/project-visual-storytelling";
const BLENDER_RENDER_SCRIPT = path.resolve(SCRIPT_ROOT, "blender-render.py");
const RENDER_CONTEXT_FILE = "render-context.json";
const RENDER_PLAN_FILE = "render-plan.json";
const RENDER_REPORT_FILE = "renderer-qualification.json";
const SHA256_PATTERN = /^[a-f0-9]{64}$/u;
const RUN_ID_PATTERN = /^[A-Za-z0-9-]{20,180}$/u;
const COLOR_PATTERN = /^#[0-9a-fA-F]{6}$/u;

function blenderDoctor() {
  const executable = process.env.BLENDER_EXECUTABLE || "blender";
  const result = spawnSync(executable, ["--version"], {
    encoding: "utf8",
    env: process.env,
    windowsHide: true,
    timeout: 15_000
  });
  if (result.error?.code === "ENOENT") {
    return { available: false, rendererClass: "physically-based-3d", executable, reason: "Blender is not installed or is not on PATH" };
  }
  if (result.error) {
    return { available: false, rendererClass: "physically-based-3d", executable, reason: result.error.message };
  }
  if (result.status !== 0) {
    return { available: false, rendererClass: "physically-based-3d", executable, reason: (result.stderr || result.stdout || `Blender exited with status ${result.status}`).trim().slice(0, 500) };
  }
  const version = (result.stdout || "").split(/\r?\n/u).find((line) => /^Blender\s/u.test(line))?.trim() || "unknown";
  return { available: true, rendererClass: "physically-based-3d", executable, version, engine: "CYCLES" };
}

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
  const unknown = Object.keys(options).filter((key) => !new Set(["_", "project", "output-type", "visual-style", "run-id", "external-processing-approved", "type", "audience", "state", "detail", "format"]).has(key));
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

function assertObject(value, label) {
  if (!value || typeof value !== "object" || Array.isArray(value)) throw new Error(`${label} must be an object`);
  return value;
}

function assertExactKeys(value, required, optional, label) {
  const keys = Object.keys(value);
  const allowed = new Set([...required, ...optional]);
  const missing = required.filter((key) => !keys.includes(key));
  const unknown = keys.filter((key) => !allowed.has(key));
  if (missing.length) throw new Error(`${label} is missing ${missing[0]}`);
  if (unknown.length) throw new Error(`${label} contains unsupported property ${unknown[0]}`);
}

function assertString(value, label, maximum = 200) {
  if (typeof value !== "string" || !value.trim() || value.length > maximum || /[\u0000-\u001f\u007f]/u.test(value)) {
    throw new Error(`${label} must be printable text between 1 and ${maximum} characters`);
  }
  return value;
}

function assertVector(value, label, minimum, maximum) {
  if (!Array.isArray(value) || value.length !== 3 || value.some((item) => typeof item !== "number" || !Number.isFinite(item) || item < minimum || item > maximum)) {
    throw new Error(`${label} must contain three numbers from ${minimum} through ${maximum}`);
  }
  return value;
}

function validateRenderPlan(plan, context, profile) {
  assertObject(plan, "Render plan");
  assertExactKeys(plan, ["schemaVersion", "visualType", "source", "canvas", "renderer", "title", "signature", "creationDate", "palette", "elements"], [], "Render plan");
  if (plan.schemaVersion !== "1.0.0") throw new Error("Render plan schemaVersion must be 1.0.0");
  if (plan.visualType !== context.visualStyle) throw new Error("Render plan visualType does not match preflight");

  assertObject(plan.source, "Render plan source");
  assertExactKeys(plan.source, ["repositoryDigestSha256"], [], "Render plan source");
  if (!SHA256_PATTERN.test(plan.source.repositoryDigestSha256) || plan.source.repositoryDigestSha256 !== context.source.repositoryDigestSha256) {
    throw new Error("Render plan source digest does not match preflight");
  }

  assertObject(plan.canvas, "Render plan canvas");
  assertExactKeys(plan.canvas, ["width", "height", "samples"], [], "Render plan canvas");
  if (![[1200, 800], [1280, 720], [1920, 1080]].some(([width, height]) => plan.canvas.width === width && plan.canvas.height === height)) {
    throw new Error("Render plan canvas must be 1200x800, 1280x720, or 1920x1080");
  }
  if (![32, 64, 128].includes(plan.canvas.samples)) throw new Error("Render plan samples must be 32, 64, or 128");

  assertObject(plan.renderer, "Render plan renderer");
  assertExactKeys(plan.renderer, ["preference", "prompt"], [], "Render plan renderer");
  if (!["auto", "mai-image", "blender-cycles"].includes(plan.renderer.preference)) throw new Error("Render plan renderer.preference is unsupported");
  assertString(plan.renderer.prompt, "Render plan renderer.prompt", 4000);

  assertString(plan.title, "Render plan title", 80);
  assertString(plan.signature, "Render plan signature", 160);
  if (plan.signature !== profile.attribution.visualSignature) throw new Error("Render plan signature does not match User Personalization");
  if (!/^\d{4}-\d{2}-\d{2}$/u.test(plan.creationDate)) throw new Error("Render plan creationDate must use YYYY-MM-DD");

  assertObject(plan.palette, "Render plan palette");
  assertExactKeys(plan.palette, ["focus", "positive", "risk", "neutral"], [], "Render plan palette");
  for (const [key, color] of Object.entries(plan.palette)) {
    if (!COLOR_PATTERN.test(color)) throw new Error(`Render plan palette.${key} must be a six-digit hex color`);
  }

  if (!Array.isArray(plan.elements) || plan.elements.length < 1 || plan.elements.length > 12) {
    throw new Error("Render plan elements must contain between 1 and 12 entries");
  }
  const ids = new Set();
  for (const [index, element] of plan.elements.entries()) {
    const label = `Render plan elements[${index}]`;
    assertObject(element, label);
    assertExactKeys(element, ["id", "label", "evidencePath", "semanticRole", "shape", "position", "size"], [], label);
    if (typeof element.id !== "string" || !/^[a-z][a-z0-9-]{0,39}$/u.test(element.id) || ids.has(element.id)) throw new Error(`${label}.id must be unique kebab-case`);
    ids.add(element.id);
    assertString(element.label, `${label}.label`, 80);
    assertString(element.evidencePath, `${label}.evidencePath`, 300);
    if (path.isAbsolute(element.evidencePath) || element.evidencePath.includes("\\") || element.evidencePath.split("/").includes("..")) throw new Error(`${label}.evidencePath must be repository-relative`);
    if (!["focus", "positive", "risk", "neutral"].includes(element.semanticRole)) throw new Error(`${label}.semanticRole is unsupported`);
    if (!["box", "cylinder", "sphere", "panel", "path", "figure"].includes(element.shape)) throw new Error(`${label}.shape is unsupported`);
    assertVector(element.position, `${label}.position`, -10, 10);
    assertVector(element.size, `${label}.size`, 0.05, 10);
  }
  return plan;
}

function currentDateInTimezone(timezone) {
  const parts = new Intl.DateTimeFormat("en-CA", { timeZone: timezone, year: "numeric", month: "2-digit", day: "2-digit" }).formatToParts(new Date());
  const values = Object.fromEntries(parts.map((part) => [part.type, part.value]));
  return `${values.year}-${values.month}-${values.day}`;
}

async function loadRun(root, runId) {
  if (!RUN_ID_PATTERN.test(runId || "")) throw new Error("Use --run-id with a preflight-assigned run ID");
  const relativeDirectory = `${OUTPUT_ROOT}/${runId}`;
  const directory = await safeRelativeTarget(root, relativeDirectory, "directory");
  const contextPath = await safeRelativeTarget(root, `${relativeDirectory}/${RENDER_CONTEXT_FILE}`, "file");
  const context = JSON.parse(await readFile(contextPath, "utf8"));
  if (context.schemaVersion !== "1.0.0" || context.destination?.runId !== runId || context.destination?.directory !== relativeDirectory) {
    throw new Error("Render context is invalid or does not match the assigned run ID");
  }
  return { directory, relativeDirectory, context };
}

function readPngDimensions(source) {
  const signature = Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]);
  if (source.length < 24 || !source.subarray(0, 8).equals(signature) || source.toString("ascii", 12, 16) !== "IHDR") throw new Error("Rendered artifact is not a valid PNG");
  return { width: source.readUInt32BE(16), height: source.readUInt32BE(20) };
}

async function verifyRender(root, runId) {
  const { directory, relativeDirectory, context } = await loadRun(root, runId);
  const planPath = await safeRelativeTarget(root, `${relativeDirectory}/${RENDER_PLAN_FILE}`, "file");
  const reportPath = await safeRelativeTarget(root, `${relativeDirectory}/${RENDER_REPORT_FILE}`, "file");
  const profile = await loadProfile(root);
  const plan = validateRenderPlan(JSON.parse(await readFile(planPath, "utf8")), context, profile);
  const report = JSON.parse(await readFile(reportPath, "utf8"));
  const imageName = report.rendererClass === "bitmap-generation" ? `${context.visualStyle}-mai-candidate.png` : `${context.visualStyle}.png`;
  const imagePath = await safeRelativeTarget(root, `${relativeDirectory}/${imageName}`, "file");
  const dimensions = readPngDimensions(await readFile(imagePath));
  if (dimensions.width !== plan.canvas.width || dimensions.height !== plan.canvas.height) throw new Error("Rendered PNG dimensions do not match the render plan");
  if (report.status !== "rendered" || !["bitmap-generation", "physically-based-3d"].includes(report.rendererClass)) throw new Error("Renderer qualification report is incomplete");
  const planDigest = sha256(await readFile(planPath, "utf8"));
  if (report.renderPlanSha256 !== planDigest) throw new Error("Render plan binding failed qualification");
  if (report.rendererClass === "physically-based-3d") {
    if (report.engine !== "CYCLES" || report.geometryCount < 3 || report.materialCount < 3 || report.lightCount < 2 || report.cameraType !== "PERSP") throw new Error("Renderer qualification does not prove a physically based 3D scene");
    if (report.pixelVariation < 0.01) throw new Error("Rendered pixels failed qualification");
    const expectedText = [plan.title, ...plan.elements.map((element) => element.label), plan.signature, plan.creationDate];
    if (JSON.stringify(report.renderedText) !== JSON.stringify(expectedText)) throw new Error("Renderer text record does not match the render plan");
  } else if (report.provider !== "mai-image" || report.processingBoundary !== "AzureUSGovernment" || report.referencePixelsSupplied !== false || report.webGrounding !== false) {
    throw new Error("MAI-Image qualification does not prove the approved Government processing boundary");
  }
  return {
    schemaVersion: "1.0.0",
    status: "requires-review",
    rendererClass: report.rendererClass,
    provider: report.provider || "blender-cycles",
    engine: report.engine || null,
    artifact: `${relativeDirectory}/${imageName}`,
    dimensions,
    pixelVariation: report.pixelVariation ?? null,
    sourceDigestSha256: context.source.repositoryDigestSha256,
    renderPlanSha256: report.renderPlanSha256,
    manualChecks: report.rendererClass === "bitmap-generation"
      ? ["photorealistic fidelity and coherent physical structure", "no invented project claims", "remove the candidate unless required text is corrected and verified", "signature and date are not yet qualified", "evidence mapping coverage"]
      : ["physical depth and material fidelity", "cast and contact shadows", "label legibility and exact text", "signature appears exactly once", "evidence mapping coverage"]
  };
}

async function renderRun(root, runId, externalProcessingApproved) {
  const { directory, relativeDirectory, context } = await loadRun(root, runId);
  if (context.outputType.endsWith("-specification")) throw new Error("Specification-only runs cannot invoke a renderer");
  const planPath = await safeRelativeTarget(root, `${relativeDirectory}/${RENDER_PLAN_FILE}`, "file");
  const profile = await loadProfile(root);
  const planSource = await readFile(planPath, "utf8");
  const plan = validateRenderPlan(JSON.parse(planSource), context, profile);
  if (plan.creationDate !== currentDateInTimezone(profile.contentDefaults.timezone)) throw new Error("Render plan creationDate is not current in the configured timezone");
  const mai = await inspectMaiImage(root);
  const useMai = plan.renderer.preference !== "blender-cycles" && mai.available;
  if (plan.renderer.preference === "mai-image" && !mai.available) throw new Error(mai.reason);
  if (useMai) {
    if (externalProcessingApproved !== "true") throw new Error("MAI-Image rendering requires --external-processing-approved true for this run");
    const imagePath = path.join(directory, `${context.visualStyle}-mai-candidate.png`);
    const reportPath = path.join(directory, RENDER_REPORT_FILE);
    try {
      const report = await generateMaiImage({
        capability: mai,
        prompt: plan.renderer.prompt,
        width: plan.canvas.width,
        height: plan.canvas.height,
        outputPath: imagePath,
        renderPlanSha256: sha256(planSource)
      });
      await writeFile(reportPath, `${JSON.stringify(report, null, 2)}\n`, { encoding: "utf8", mode: 0o600, flag: "wx" });
      return verifyRender(root, runId);
    } catch (error) {
      await Promise.all([rm(imagePath, { force: true }), rm(reportPath, { force: true })]);
      throw error;
    }
  }
  const doctor = blenderDoctor();
  if (!doctor.available) throw new Error(doctor.reason);
  const imagePath = path.join(directory, `${context.visualStyle}.png`);
  const reportPath = path.join(directory, RENDER_REPORT_FILE);
  const blenderArguments = ["--background", "--factory-startup"];
  if (path.basename(doctor.executable).toLowerCase() === "blender-launcher.exe") {
    const scriptLiteral = JSON.stringify(BLENDER_RENDER_SCRIPT);
    blenderArguments.push("--python-expr", `import runpy; runpy.run_path(${scriptLiteral}, run_name="__main__")`);
  } else {
    blenderArguments.push("--python", BLENDER_RENDER_SCRIPT);
  }
  blenderArguments.push("--", "--plan", planPath, "--output", imagePath, "--report", reportPath, "--plan-sha256", sha256(planSource));
  const result = spawnSync(doctor.executable, blenderArguments, {
    cwd: root,
    encoding: "utf8",
    env: process.env,
    windowsHide: true,
    timeout: 15 * 60_000,
    maxBuffer: 4 * 1024 * 1024
  });
  if (result.error || result.status !== 0) {
    await Promise.all([rm(imagePath, { force: true }), rm(reportPath, { force: true })]);
    const detail = result.error?.message || `${result.stderr || ""}\n${result.stdout || ""}`.trim().split(/\r?\n/gu).filter(Boolean).slice(-4).join(" | ").slice(0, 800);
    throw new Error(`Blender render failed${detail ? `: ${detail}` : ""}`);
  }
  return verifyRender(root, runId);
}

function projectSlug(value) {
  return String(value || "project").toLowerCase().replace(/[^a-z0-9]+/gu, "-").replace(/^-+|-+$/gu, "").slice(0, 48) || "project";
}

function plannedFiles(outputType) {
  const prefix = outputType.startsWith("diorama") ? "diorama" : "whiteboard";
  const specificationOnly = outputType.endsWith("-specification");
  return {
    required: [`${prefix}-specification.md`, `${prefix}-alt-text.md`],
    optional: specificationOnly ? [] : [`${prefix}.png`]
  };
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
    markdownSha256: understanding.markdownSha256,
    architecture: Array.isArray(understanding.architecture) ? understanding.architecture : [],
    features: Array.isArray(understanding.features) ? understanding.features : [],
    workflows: Array.isArray(understanding.workflows) ? understanding.workflows : []
  };
}

function mermaidId(value, index) {
  return `n${index}-${projectSlug(value).replace(/-/gu, "") || "item"}`;
}

function mermaidLabel(value) {
  return String(value).replace(/[\[\]"`]/gu, "").replace(/\s+/gu, " ").trim().slice(0, 80) || "Project evidence";
}

function diagramEvidence(source) {
  const entries = [...source.architecture, ...source.features, ...source.workflows].slice(0, 12);
  return entries.length ? entries : [{ name: source.topic, description: "Current project", evidence: [PROJECT_UNDERSTANDING_JSON] }];
}

function diagramMermaid(source, type, state) {
  const entries = diagramEvidence(source);
  const nodes = entries.map((entry, index) => ({ id: mermaidId(entry.name, index + 1), entry }));
  const lines = ["flowchart LR", `  project[\"${mermaidLabel(source.topic)}\"]`];
  for (const node of nodes) {
    lines.push(`  ${node.id}[\"${mermaidLabel(node.entry.name)}\"]`);
    lines.push(`  project --> ${node.id}`);
  }
  lines.push(`  %% type: ${type}; state: ${state}; evidence is recorded in evidence-map.md`);
  return `${lines.join("\n")}\n`;
}

function diagramSpecification(source, visual) {
  return [
    `# ${source.topic} ${visual.type} diagram`,
    "",
    `Audience: ${visual.audience}`,
    `State: ${visual.state}`,
    `Detail: ${visual.detail}`,
    "",
    "## Scope",
    "",
    "This deterministic Mermaid source is derived only from the fresh Project Understanding record bound to this run. It shows current verified repository evidence; it does not infer unverified services, providers, deployment boundaries, or future-state components.",
    "",
    "## Renderer",
    "",
    "Mermaid source is emitted as an editable technical-diagram representation. SVG and PNG are intentionally not claimed unless a separately qualified local renderer validates them.",
    ""
  ].join("\n");
}

function diagramEvidenceMap(source) {
  const lines = ["# Evidence Map", "", "| Label | Classification | Evidence |", "| --- | --- | --- |"];
  for (const entry of diagramEvidence(source)) {
    lines.push(`| ${mermaidLabel(entry.name)} | ${entry.status || "verified"} | ${(entry.evidence || [PROJECT_UNDERSTANDING_JSON]).join(", ")} |`);
  }
  return `${lines.join("\n")}\n`;
}

async function createDiagram(root, options) {
  const type = options.type;
  const audience = options.audience ?? "technical";
  const state = options.state ?? "current";
  const detail = options.detail ?? "medium";
  const formats = (options.format ?? "mmd,spec").split(",").map((item) => item.trim()).filter(Boolean);
  if (!DIAGRAM_TYPES.has(type)) throw new Error(`Unsupported --type: ${type || "missing"}`);
  if (!DIAGRAM_AUDIENCES.has(audience) || !DIAGRAM_STATES.has(state) || !DIAGRAM_DETAILS.has(detail)) throw new Error("Diagram audience, state, or detail is unsupported");
  if (!formats.length || formats.some((format) => !DIAGRAM_FORMATS.has(format))) throw new Error("Diagram format must use mmd and/or spec");
  const source = await refreshProjectUnderstanding(root);
  const generatedAt = new Date().toISOString();
  const { runId, directory } = await reserveOutputDirectory(root, source, type, generatedAt);
  const visual = { type, audience, state, detail, formats: [...new Set(formats)] };
  const request = {
    schemaVersion: "1.0.0", runId,
    source: { kind: "current-project", repositoryDigestSha256: source.repositoryDigestSha256, projectUnderstandingDigestSha256: source.jsonSha256 },
    visual,
    destination: { directory },
    rendering: { allowedClasses: ["deterministic-source"] }
  };
  const artifacts = [];
  const writeArtifact = async (name, mediaType, content) => {
    await writeFile(path.join(root, ...directory.split("/"), name), content, { encoding: "utf8", mode: 0o600, flag: "wx" });
    artifacts.push({ path: name, mediaType, sha256: sha256(content), validated: true });
  };
  await writeArtifact("request.json", "application/json", `${JSON.stringify(request, null, 2)}\n`);
  await writeArtifact("diagram.mmd", "text/vnd.mermaid", diagramMermaid(source, type, state));
  await writeArtifact("visual-specification.md", "text/markdown", diagramSpecification(source, visual));
  await writeArtifact("evidence-map.md", "text/markdown", diagramEvidenceMap(source));
  await writeArtifact("alt-text.md", "text/markdown", `${source.topic} ${type} diagram showing verified current-project architecture, features, and workflows.\n`);
  const result = {
    schemaVersion: "1.0.0", runId, status: "partial",
    source: { repositoryDigestSha256: source.repositoryDigestSha256, projectUnderstandingDigestSha256: source.jsonSha256 },
    renderer: { class: "deterministic-source", name: "mermaid-source" }, artifacts,
    warnings: [], limitations: ["No local SVG or PNG renderer is qualified for this technical diagram run."]
  };
  await writeArtifact("result.json", "application/json", `${JSON.stringify(result, null, 2)}\n`);
  return result;
}

async function reserveOutputDirectory(root, source, outputType, generatedAt) {
  const outputRootTarget = await safeRelativeTarget(root, OUTPUT_ROOT, "directory");
  await mkdir(outputRootTarget, { recursive: true, mode: 0o755 });
  await safeRelativeTarget(root, OUTPUT_ROOT, "directory");
  const timestamp = generatedAt.replace(/[-:.]/gu, "");
  for (let attempt = 0; attempt < 3; attempt += 1) {
    const runId = `${timestamp}-${projectSlug(source.topic)}-${outputType}-${randomUUID()}`;
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
  throw new Error("Could not reserve a unique project-visual-storytelling run directory");
}

async function loadProfile(root) {
  const target = path.join(root, ...PROFILE_PATH.split("/"));
  if (!existsSync(target)) {
    throw new Error("User Personalization profile is missing; run user-personalization before project visual storytelling");
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
  const command = options._[0];
  const root = await safeProjectRoot(options.project);
  if (command === "doctor") {
    const blender = blenderDoctor();
    const maiImage = await inspectMaiImage(root);
    console.log(JSON.stringify({ schemaVersion: "1.0.0", command, renderer: blender, renderers: { maiImage, blender } }, null, 2));
    return;
  }
  if (command === "render") {
    console.log(JSON.stringify(await renderRun(root, options["run-id"], options["external-processing-approved"]), null, 2));
    return;
  }
  if (command === "verify") {
    console.log(JSON.stringify(await verifyRender(root, options["run-id"]), null, 2));
    return;
  }
  if (command === "diagram") {
    console.log(JSON.stringify(await createDiagram(root, options), null, 2));
    return;
  }
  if (command !== "preflight") throw new Error("Use doctor, preflight, render, or verify");
  const outputType = options["output-type"];
  if (outputType === "diarama" || outputType === "diarama-specification") {
    throw new Error(`Unsupported --output-type: ${outputType}; use diorama or diorama-specification`);
  }
  if (!OUTPUT_TYPES.has(outputType)) throw new Error(`Unsupported --output-type: ${outputType || "missing"}`);
  if (options["visual-style"] !== undefined) {
    throw new Error("--visual-style is no longer supported; choose --output-type whiteboard or diorama");
  }
  const profile = await loadProfile(root);
  const source = await refreshProjectUnderstanding(root);
  const generatedAt = new Date().toISOString();
  const { runId, directory: outputDirectory } = await reserveOutputDirectory(root, source, outputType, generatedAt);
  const visualStyle = outputType.startsWith("diorama") ? "diorama" : "whiteboard";
  const canonicalProfile = `${JSON.stringify(profile)}\n`;
  const result = {
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
      files: plannedFiles(outputType)
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
  };
  await writeFile(path.join(root, ...outputDirectory.split("/"), RENDER_CONTEXT_FILE), `${JSON.stringify(result, null, 2)}\n`, { encoding: "utf8", mode: 0o600, flag: "wx" });
  console.log(JSON.stringify(result, null, 2));
}

main().catch((error) => {
  console.error(`Project Visual Storytelling blocked: ${error.message}`);
  process.exitCode = 1;
});