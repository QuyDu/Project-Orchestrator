#!/usr/bin/env node

import { createHash, randomUUID } from "node:crypto";
import { existsSync } from "node:fs";
import { lstat, mkdir, open, readFile, readdir, realpath, rename, rm, stat, writeFile } from "node:fs/promises";
import path from "node:path";
import process from "node:process";
import { fileURLToPath } from "node:url";

const SCRIPT_ROOT = path.dirname(fileURLToPath(import.meta.url));
const DEFAULT_ROOT = path.resolve(SCRIPT_ROOT, "..", "..", "..", "..");
const JSON_OUTPUT = "reports/project-understanding.json";
const MARKDOWN_OUTPUT = "reports/project-understanding.md";
const EXCLUDED_DIRECTORIES = new Set([".git", ".skills-orchestrator", "node_modules", "dist", "build", "out", "bin", "obj", "coverage", "vendor", "venv", ".venv", "__pycache__"]);
const EXCLUDED_FILES = new Set([JSON_OUTPUT, MARKDOWN_OUTPUT, "docs/PROJECT-GUIDE.md", "reports/project-guide.json"]);
const DOWNSTREAM_ATTESTATIONS = new Set([
  "reports/audit-remediation-execution.json", "reports/audit-remediation-execution.md",
  "reports/current-execution-state.json", "reports/current-execution-state.md",
  "reports/execution-log.jsonl", "reports/project-handoff.json", "reports/project-handoff.md",
  "reports/current-work-state.json", "reports/change-review.json", "reports/change-review.md",
  "reports/policy-evaluation.json", "reports/policy-evaluation.md", "reports/policy-decision-log.jsonl",
  "reports/coordination-state.json", "reports/coordination-state.md",
  "reports/regression-test-result.json", "reports/regression-test-result.md", "reports/gitleaks-scan.json"
]);
const SENSITIVE_FILE_PATTERNS = [".env and .env.*", "private key and certificate files", "credential and secret manifests", "SSH private keys"];
const TEXT_EXTENSIONS = new Set([".md", ".json", ".jsonc", ".yaml", ".yml", ".toml", ".xml", ".txt", ".mjs", ".js", ".ts", ".tsx", ".jsx", ".py", ".ps1", ".bicep", ".tf", ".cs", ".java", ".go", ".rs", ".rb", ".php", ".sh"]);
const MAX_TEXT_BYTES = 1024 * 1024;
const MAX_FILES = 30000;

function parseArguments(argv) {
  const [command = "help", ...rest] = argv;
  const options = {};
  for (let index = 0; index < rest.length; index += 1) {
    const item = rest[index];
    if (!item.startsWith("--")) throw new Error(`Unexpected argument: ${item}`);
    const next = rest[index + 1];
    if (!next || next.startsWith("--")) options[item.slice(2)] = true;
    else { options[item.slice(2)] = next; index += 1; }
  }
  return { command, options };
}

function normalizeName(value) {
  return String(value || "project").toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "").slice(0, 64) || "project";
}

function safeRelative(value) {
  return typeof value === "string" && value.length > 0 && !path.isAbsolute(value) && !value.includes("\\") && !value.split("/").includes("..");
}

function sha256(value) { return createHash("sha256").update(value).digest("hex"); }

function isSensitiveFile(relative) {
  const basename = path.posix.basename(relative).toLowerCase();
  if (basename === ".env" || basename.startsWith(".env.")) return !/\.(?:example|sample|template)$/.test(basename);
  if (/\.(?:pem|pfx|p12|key|jks|keystore)$/.test(basename)) return true;
  if (/^(?:id_rsa|id_dsa|id_ecdsa|id_ed25519)$/.test(basename)) return true;
  return /^(?:credentials?|secrets?)(?:\.[^.]+)?\.json$/.test(basename);
}

async function digestFile(file) {
  return sha256(await readFile(file));
}

export async function validateCurrentSources(root, report) {
  const records = report?.scan?.files;
  if (!Array.isArray(records) || records.length !== report.scan.fileCount
      || records.some((record) => !record || !safeRelative(record.path) || !/^[a-f0-9]{64}$/.test(record.sha256)
        || !Number.isSafeInteger(record.bytes) || record.bytes < 0)) {
    throw new Error("Project Understanding source evidence is invalid; run project-understanding scan");
  }
  const expected = new Map(records.map((record) => [record.path, record]));
  const paths = await walk(root);
  if (expected.size !== records.length || paths.length !== records.length || paths.some((relative) => !expected.has(relative))) {
    throw new Error("Project Understanding source file set changed; run project-understanding scan");
  }
  for (const relative of paths) {
    const file = path.join(root, relative);
    const details = await lstat(file);
    const recorded = expected.get(relative);
    if (!details.isFile() || details.isSymbolicLink() || details.size !== recorded.bytes || await digestFile(file) !== recorded.sha256) {
      throw new Error("Project Understanding source content is stale; run project-understanding scan");
    }
  }
  const digest = sha256(records.map((record) => `${record.path}\0${record.bytes}\0${record.sha256}`).join("\n"));
  if (digest !== report.scan.repositoryDigestSha256) throw new Error("Project Understanding source digest is invalid; run project-understanding scan");
}

async function walk(root, relative = "", files = []) {
  const entries = await readdir(path.join(root, relative), { withFileTypes: true });
  entries.sort((left, right) => left.name.localeCompare(right.name));
  for (const entry of entries) {
    const child = path.join(relative, entry.name);
    const portable = child.replaceAll("\\", "/");
    if (entry.isSymbolicLink()) throw new Error(`Repository scan refuses symbolic links: ${portable}`);
    if (entry.isDirectory()) {
      if (!EXCLUDED_DIRECTORIES.has(entry.name)) await walk(root, child, files);
    } else if (entry.isFile() && !EXCLUDED_FILES.has(portable) && !DOWNSTREAM_ATTESTATIONS.has(portable) && !isSensitiveFile(portable)) {
      if (files.length >= MAX_FILES) throw new Error(`Repository scan exceeded ${MAX_FILES} files`);
      files.push(portable);
    }
  }
  return files;
}

async function readText(root, relative) {
  const file = path.join(root, relative);
  if (!existsSync(file)) return "";
  const details = await stat(file);
  if (details.size > MAX_TEXT_BYTES || !TEXT_EXTENSIONS.has(path.extname(relative).toLowerCase())) return "";
  return readFile(file, "utf8");
}

function firstPurpose(readme, fallback) {
  const lines = readme.split(/\r?\n/);
  const paragraphs = [];
  let current = [];
  for (const line of lines.slice(1)) {
    if (/^#/.test(line)) { if (current.length) break; continue; }
    if (!line.trim()) { if (current.length) { paragraphs.push(current.join(" ")); break; } }
    else current.push(line.trim());
  }
  return (paragraphs[0] || fallback || "Purpose is not explicitly documented.").slice(0, 2000);
}

function frontmatter(source) {
  const match = source.match(/^---\r?\n([\s\S]*?)\r?\n---/);
  if (!match) return {};
  return Object.fromEntries(match[1].split(/\r?\n/).map((line) => {
    const separator = line.indexOf(":");
    return separator > 0 ? [line.slice(0, separator).trim(), line.slice(separator + 1).trim()] : [line.trim(), ""];
  }));
}

function item(name, description, evidence, extra = {}) {
  return { name: String(name).slice(0, 200), description: String(description || "Verified project artifact").slice(0, 2000), evidence: [...new Set(evidence)].filter(safeRelative), status: "verified", ...extra };
}

function commandItems(packageJson) {
  return Object.entries(packageJson?.scripts || {}).sort(([a], [b]) => a.localeCompare(b)).map(([name, value]) => item(`npm run ${name}`, String(value), ["package.json"]));
}

function markdownList(items, empty = "No verified items were found.") {
  if (!items.length) return empty;
  return items.map((entry) => `- **${entry.name}** — ${entry.description}\n  Evidence: ${entry.evidence.map((value) => `\`${value}\``).join(", ")}`).join("\n");
}

function markdown(report) {
  return `# Project Understanding: ${report.project.displayName}\n\nGenerated by a complete repository scan at ${report.generatedAt}.\n\n## Purpose\n\n${report.project.purpose}\n\n## Architecture and Components\n\n${markdownList(report.architecture)}\n\n## Technology Stack\n\n${markdownList(report.technology)}\n\n## Setup and Usage\n\n${markdownList(report.usage)}\n\n## Key Features\n\n${markdownList(report.features)}\n\n## Workflows\n\n${markdownList(report.workflows)}\n\n## Skills\n\n${markdownList(report.customizations.skills)}\n\n## Prompts\n\n${markdownList(report.customizations.prompts)}\n\n## Agents\n\n${markdownList(report.customizations.agents)}\n\n## Schemas\n\n${markdownList(report.customizations.schemas)}\n\n## Validation\n\n${markdownList(report.validation)}\n\n## Limitations and Safety Boundaries\n\n${report.limitations.length ? report.limitations.map((value) => `- ${value}`).join("\n") : "- No explicit limitations were discovered."}\n\n## Scan Provenance\n\n- Repository digest: \`${report.scan.repositoryDigestSha256}\`\n- Files scanned: ${report.scan.fileCount}\n- Source files: ${report.scan.sourceFileCount}\n- Tests: ${report.scan.testFileCount}\n- Skills: ${report.customizations.skills.length}\n- Prompts: ${report.customizations.prompts.length}\n- Schemas: ${report.customizations.schemas.length}\n- Complete rebuild: yes\n`;
}

async function publishPair(root, report) {
  const jsonFile = path.join(root, JSON_OUTPUT);
  const markdownFile = path.join(root, MARKDOWN_OUTPUT);
  const transaction = randomUUID();
  const jsonPartial = `${jsonFile}.${transaction}.partial`;
  const markdownPartial = `${markdownFile}.${transaction}.partial`;
  const jsonBackup = `${jsonFile}.${transaction}.backup`;
  const markdownBackup = `${markdownFile}.${transaction}.backup`;
  await mkdir(path.dirname(jsonFile), { recursive: true });
  report.markdownSha256 = sha256(markdown(report));
  const json = `${JSON.stringify(report, null, 2)}\n`;
  const md = markdown(report);
  const outputs = [
    { file: jsonFile, partial: jsonPartial, backup: jsonBackup, content: json },
    { file: markdownFile, partial: markdownPartial, backup: markdownBackup, content: md }
  ];
  let committed = false;
  let publicationError;
  const recoveryErrors = [];
  try {
    for (const output of outputs) {
      const handle = await open(output.partial, "wx", 0o600);
      output.staged = true;
      try { await handle.writeFile(output.content, "utf8"); }
      finally { await handle.close(); }
    }
    for (const output of outputs) {
      if (existsSync(output.file)) {
        await rename(output.file, output.backup);
        output.backedUp = true;
      }
    }
    for (const output of outputs) {
      await rename(output.partial, output.file);
      output.published = true;
    }
    committed = true;
  } catch (error) {
    publicationError = error;
    for (const output of outputs) {
      try {
        if (output.published) await rm(output.file, { force: true });
        if (output.backedUp) await rename(output.backup, output.file);
      } catch (recoveryError) {
        recoveryErrors.push(recoveryError);
      }
    }
  }
  if (recoveryErrors.length) throw new AggregateError([publicationError, ...recoveryErrors], "Project Understanding publication failed; recovery required. Preserve remaining backup and partial artifacts.");
  const cleanup = await Promise.allSettled(outputs.flatMap((output) => [
    ...(output.staged ? [rm(output.partial, { force: true })] : []),
    ...(committed && output.backedUp ? [rm(output.backup, { force: true })] : [])
  ]));
  const cleanupErrors = cleanup.filter((result) => result.status === "rejected").map((result) => result.reason);
  if (cleanupErrors.length) throw new AggregateError([...(publicationError ? [publicationError] : []), ...cleanupErrors], committed
    ? "Project Understanding publication committed, but backup cleanup failed. Preserve remaining recovery artifacts."
    : "Project Understanding publication failed; recovery required for remaining partial artifacts.");
  if (publicationError) throw publicationError;
}

async function buildReport(root) {
  const files = await walk(root);
  const fileRecords = [];
  for (const relative of files) {
    const file = path.join(root, relative);
    const details = await lstat(file);
    fileRecords.push({ path: relative, bytes: details.size, sha256: await digestFile(file) });
  }
  const repositoryDigestSha256 = sha256(fileRecords.map((record) => `${record.path}\0${record.bytes}\0${record.sha256}`).join("\n"));
  const packageSource = await readText(root, "package.json");
  let packageJson = {};
  try { packageJson = packageSource ? JSON.parse(packageSource) : {}; } catch { packageJson = {}; }
  const readme = await readText(root, "README.md");
  const heading = readme.match(/^#\s+(.+)$/m)?.[1]?.trim();
  const projectName = normalizeName(packageJson.name || heading || path.basename(root));
  const purpose = firstPurpose(readme, packageJson.description);
  const skillPaths = files.filter((value) => /^\.github\/skills\/[^/]+\/SKILL\.md$/.test(value));
  const promptPaths = files.filter((value) => /^\.github\/prompts\/[^/]+\.prompt\.md$/.test(value));
  const agentPaths = files.filter((value) => /^\.github\/agents\/[^/]+\.agent\.md$/.test(value));
  const schemaPaths = files.filter((value) => /^schemas\/[^/]+\.schema\.json$/.test(value));
  const skills = [];
  for (const relative of skillPaths) { const meta = frontmatter(await readText(root, relative)); skills.push(item(meta.name || path.basename(path.dirname(relative)), meta.description || "Project skill", [relative], { invocation: `/${meta.name || path.basename(path.dirname(relative))}` })); }
  const prompts = [];
  for (const relative of promptPaths) { const meta = frontmatter(await readText(root, relative)); const name = meta.name || path.basename(relative, ".prompt.md"); prompts.push(item(name, meta.description || "Reusable project prompt", [relative], { invocation: `/${name}` })); }
  const agents = [];
  for (const relative of agentPaths) { const meta = frontmatter(await readText(root, relative)); agents.push(item(meta.name || path.basename(relative, ".agent.md"), meta.description || "Specialized project agent", [relative])); }
  const schemas = schemaPaths.map((relative) => item(path.basename(relative), "Machine-readable contract for a governed project artifact.", [relative]));
  const topDirectories = [...new Set(files.filter((value) => value.includes("/")).map((value) => value.split("/")[0]))].sort();
  const architecture = topDirectories.slice(0, 20).map((directory) => item(directory, `Top-level project boundary containing ${files.filter((value) => value.startsWith(`${directory}/`)).length} scanned files.`, [files.find((value) => value.startsWith(`${directory}/`))]));
  const extensionCounts = new Map();
  for (const relative of files) { const extension = path.extname(relative).toLowerCase(); if (extension) extensionCounts.set(extension, (extensionCounts.get(extension) || 0) + 1); }
  const technology = [...extensionCounts.entries()].sort((a, b) => b[1] - a[1]).slice(0, 12).map(([extension, count]) => item(extension, `${count} scanned files use this extension.`, [files.find((value) => path.extname(value).toLowerCase() === extension)]));
  const commands = commandItems(packageJson);
  const validation = commands.filter((entry) => /test|check|lint|verify|security|build/i.test(entry.name));
  const usage = commands.filter((entry) => /start|dev|run|create|adopt|deploy|inventory|help/i.test(`${entry.name} ${entry.description}`));
  if (!usage.length && existsSync(path.join(root, "README.md"))) usage.push(item("Read the project guide", "Follow the verified setup and usage instructions in the repository README.", ["README.md"]));
  const features = [];
  if (skills.length) features.push(item("Governed skill workflows", `${skills.length} installed skills provide bounded project actions.`, skillPaths.slice(0, 5)));
  if (promptPaths.length) features.push(item("Reusable prompt workflows", `${promptPaths.length} prompt files provide user-invoked workflows.`, promptPaths.slice(0, 5)));
  if (files.some((value) => value.startsWith("schemas/"))) features.push(item("Machine-readable contracts", "Schemas validate governed plans, reports, and runtime evidence.", [files.find((value) => value.startsWith("schemas/"))]));
  if (files.some((value) => /^tests?\//.test(value))) features.push(item("Automated validation", "Repository tests protect contracts and implementation behavior.", [files.find((value) => /^tests?\//.test(value))]));
  const workflows = commands.map((entry) => item(entry.name, entry.description, entry.evidence)).slice(0, 20);
  const sourceFiles = files.filter((value) => /\.(?:mjs|js|ts|tsx|py|ps1|cs|java|go|rs|rb|php|bicep|tf)$/.test(value) && !value.startsWith("tests/") && !value.startsWith(".github/skills/"));
  const testFiles = files.filter((value) => /(^|\/)(?:tests?|specs?)(\/|$)|\.(?:test|spec)\./.test(value));
  const limitations = [];
  limitations.push(`Current-code provenance excludes downstream operational attestations to avoid publication cycles: ${[...DOWNSTREAM_ATTESTATIONS].join(", ")}. Read those authoritative reports directly for live workflow/verification state; secret scanning still covers them.`);
  if (!readme) limitations.push("No README was found; purpose and usage require confirmation.");
  if (!sourceFiles.length) limitations.push("No application source files were found outside framework skills and tests.");
  if (!validation.length) limitations.push("No automated validation command was discovered in the primary package manifest.");
  const status = purpose.startsWith("Purpose is not") || (!sourceFiles.length && !skills.length) ? "blocked" : "complete";
  return {
    schemaVersion: "1.0.0", status, generatedAt: new Date().toISOString(), generator: "project-understanding",
    project: { name: projectName, displayName: heading || packageJson.name || path.basename(root), purpose, evidence: [readme ? "README.md" : packageSource ? "package.json" : fileRecords[0]?.path].filter(Boolean) },
    scan: { mode: "full-rebuild", repositoryDigestSha256, fileCount: files.length, sourceFileCount: sourceFiles.length, testFileCount: testFiles.length, excludedDirectories: [...EXCLUDED_DIRECTORIES].sort(), excludedSensitivePatterns: SENSITIVE_FILE_PATTERNS, files: fileRecords },
    architecture, technology, usage, features, workflows,
    customizations: { skills: skills.sort((a, b) => a.name.localeCompare(b.name)), prompts: prompts.sort((a, b) => a.name.localeCompare(b.name)), agents: agents.sort((a, b) => a.name.localeCompare(b.name)), schemas: schemas.sort((a, b) => a.name.localeCompare(b.name)) },
    validation, limitations, markdown: MARKDOWN_OUTPUT, markdownSha256: ""
  };
}

function validate(report) {
  const errors = [];
  if (report?.schemaVersion !== "1.0.0") errors.push("schemaVersion must be 1.0.0");
  if (!new Set(["complete", "blocked"]).has(report?.status)) errors.push("status must be complete or blocked");
  if (report?.scan?.mode !== "full-rebuild") errors.push("scan.mode must be full-rebuild");
  if (!/^[a-f0-9]{64}$/.test(report?.scan?.repositoryDigestSha256 || "")) errors.push("scan.repositoryDigestSha256 is invalid");
  if (!Array.isArray(report?.scan?.files) || report.scan.files.length !== report.scan.fileCount) errors.push("scan.files must match scan.fileCount");
  if (!Array.isArray(report?.scan?.excludedSensitivePatterns) || !report.scan.excludedSensitivePatterns.length) errors.push("scan.excludedSensitivePatterns must describe secret exclusions");
  for (const section of ["architecture", "technology", "usage", "features", "workflows", "validation"]) if (!Array.isArray(report?.[section])) errors.push(`${section} must be an array`);
  for (const kind of ["skills", "prompts", "agents", "schemas"]) if (!Array.isArray(report?.customizations?.[kind])) errors.push(`customizations.${kind} must be an array`);
  const scannedPaths = new Set(report?.scan?.files?.map((record) => record.path));
  const evidenceItems = [...(report?.architecture || []), ...(report?.technology || []), ...(report?.usage || []), ...(report?.features || []), ...(report?.workflows || []), ...(report?.validation || []), ...Object.values(report?.customizations || {}).flat()];
  for (const entry of evidenceItems) {
    if (entry?.status !== "verified") errors.push(`${entry?.name || "item"} must record verified status`);
    if (!Array.isArray(entry?.evidence) || !entry.evidence.length || entry.evidence.some((value) => !safeRelative(value) || !scannedPaths.has(value))) errors.push(`${entry?.name || "item"} has invalid evidence`);
  }
  if (report?.markdown !== MARKDOWN_OUTPUT) errors.push(`markdown must be ${MARKDOWN_OUTPUT}`);
  return errors;
}

async function scan(root) {
  const report = await buildReport(root);
  const errors = validate(report);
  if (errors.length) throw new Error(`Project understanding is invalid:\n- ${errors.join("\n- ")}`);
  await publishPair(root, report);
  console.log(`Project understanding: ${report.status}`);
  console.log(`Files scanned: ${report.scan.fileCount}`);
  console.log(`Repository digest: ${report.scan.repositoryDigestSha256}`);
  return report.status === "complete" ? 0 : 2;
}

async function validateExisting(root) {
  const jsonFile = path.join(root, JSON_OUTPUT);
  const markdownFile = path.join(root, MARKDOWN_OUTPUT);
  if (!existsSync(jsonFile) || !existsSync(markdownFile)) throw new Error("Project understanding outputs are missing; run scan");
  const report = JSON.parse(await readFile(jsonFile, "utf8"));
  const errors = validate(report);
  const md = await readFile(markdownFile, "utf8");
  if (sha256(md) !== report.markdownSha256) errors.push("Markdown digest does not match project-understanding.json");
  if (errors.length) throw new Error(`Project understanding is invalid:\n- ${errors.join("\n- ")}`);
  console.log(`Valid project understanding: ${JSON_OUTPUT}`);
  return report.status === "complete" ? 0 : 2;
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const { command, options } = parseArguments(process.argv.slice(2));
  const requestedRoot = path.resolve(String(options.root || DEFAULT_ROOT));
  try {
    if (!existsSync(requestedRoot)) throw new Error(`Project root does not exist: ${requestedRoot}`);
    const root = await realpath(requestedRoot);
    if (command === "scan") process.exitCode = await scan(root);
    else if (command === "validate") process.exitCode = await validateExisting(root);
    else if (command === "help" || command === "--help") console.log("Project understanding helper\n\nCommands:\n  scan [--root PATH]\n  validate [--root PATH]");
    else throw new Error(`Unknown command: ${command}`);
  } catch (error) {
    console.error(error.message);
    process.exitCode = 1;
  }
}
