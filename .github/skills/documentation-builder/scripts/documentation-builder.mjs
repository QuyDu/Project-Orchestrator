#!/usr/bin/env node

import { createHash } from "node:crypto";
import { existsSync } from "node:fs";
import { mkdir, readFile, realpath, writeFile } from "node:fs/promises";
import path from "node:path";
import process from "node:process";
import { fileURLToPath } from "node:url";
import { validateCurrentSources } from "../../project-understanding/scripts/project-understanding.mjs";

const SCRIPT_ROOT = path.dirname(fileURLToPath(import.meta.url));
const DEFAULT_ROOT = path.resolve(SCRIPT_ROOT, "..", "..", "..", "..");
const UNDERSTANDING_JSON = "reports/project-understanding.json";
const UNDERSTANDING_MARKDOWN = "reports/project-understanding.md";
const GUIDE = "docs/PROJECT-GUIDE.md";
const GUIDE_REPORT = "reports/project-guide.json";

function sha256(value) { return createHash("sha256").update(value).digest("hex"); }

function parseArguments(argv) {
  const [command = "help", ...rest] = argv;
  const options = {};
  for (let index = 0; index < rest.length; index += 1) {
    const option = rest[index];
    if (!option.startsWith("--")) throw new Error(`Unexpected argument: ${option}`);
    const value = rest[index + 1];
    if (!value || value.startsWith("--")) options[option.slice(2)] = true;
    else { options[option.slice(2)] = value; index += 1; }
  }
  return { command, options };
}

function safeEvidence(value, files) {
  return typeof value === "string" && value.length > 0 && !path.isAbsolute(value) && !value.includes("\\") && !value.split("/").includes("..") && files.has(value);
}

function claimStatus(status) {
  if (status === "verified" || status === "planned") return status;
  if (status === "inferred" || status === "unknown") return "unavailable";
  throw new Error("Project Understanding contains an unsupported claim classification");
}

function claim(id, topic, statement, evidence, status) {
  return { id: `claim-${id}`, topic, status: claimStatus(status), statement, evidence };
}

function list(items, fallback) {
  return items.length ? items.map((item) => {
    const status = claimStatus(item.status);
    const label = status === "verified" ? "" : status === "planned" ? " [planned]" : ` [${item.status}; unverified]`;
    return `- **${item.name}**${label}: ${item.description}`;
  }).join("\n") : `- ${fallback}`;
}

function guide(report, claims) {
  const understanding = report.understanding;
  return `# ${understanding.project.displayName} Project Guide

Generated from a complete repository scan. This guide describes the project in which the generator runs.

## Purpose

${understanding.project.purpose}

## Architecture

${list(understanding.architecture, "No architecture boundaries were verified.")}

## Technology

${list(understanding.technology, "No technology stack was verified.")}

## Setup And Usage

${list(understanding.usage, "Consult the project README for verified usage.")}

## Capabilities

${list(understanding.features, "No capabilities were discovered.")}

## Validation

${list(understanding.validation, "No automated validation command was discovered.")}

## Limitations

${understanding.limitations.length ? understanding.limitations.map((item) => `- ${item}`).join("\n") : "- No explicit limitations were discovered by Project Understanding."}

## Evidence

The companion report at \`${GUIDE_REPORT}\` contains ${claims.length} claims bound to the Project Understanding digests used for this guide.
`;
}

function build(understanding) {
  const files = new Set(understanding.scan.files.map((file) => file.path));
  const allItems = [
    ...understanding.architecture,
    ...understanding.technology,
    ...understanding.usage,
    ...understanding.features,
    ...understanding.validation
  ];
  const claims = allItems.slice(0, 60).map((item, index) => claim(
    `${String(index + 1).padStart(2, "0")}-${item.name.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "") || "item"}`,
    "project-understanding",
    item.description,
    item.evidence.filter((value) => safeEvidence(value, files)),
    item.status
  )).filter((item) => item.evidence.length);
  if (!claims.length) throw new Error("Project Understanding contains no evidence-backed guide claims");
  const report = {
    schemaVersion: "1.0.0",
    generatedAt: new Date().toISOString(),
    projectUnderstanding: {
      json: UNDERSTANDING_JSON,
      jsonSha256: sha256(JSON.stringify(understanding)),
      markdown: UNDERSTANDING_MARKDOWN,
      markdownSha256: understanding.markdownSha256
    },
    guide: GUIDE,
    guideSha256: "",
    claims
  };
  const markdown = guide({ understanding }, claims);
  report.guideSha256 = sha256(markdown);
  return { report, markdown };
}

function validate(report, guideSource, understanding, understandingSource, understandingMarkdown) {
  const errors = [];
  if (report?.schemaVersion !== "1.0.0") errors.push("schemaVersion must be 1.0.0");
  if (report?.guide !== GUIDE) errors.push(`guide must be ${GUIDE}`);
  if (report?.projectUnderstanding?.json !== UNDERSTANDING_JSON || report?.projectUnderstanding?.markdown !== UNDERSTANDING_MARKDOWN) errors.push("Project Understanding paths are invalid");
  if (report?.projectUnderstanding?.jsonSha256 !== sha256(JSON.stringify(understanding))) errors.push("Project Understanding JSON digest is stale");
  if (report?.projectUnderstanding?.markdownSha256 !== understanding.markdownSha256) errors.push("Project Understanding Markdown digest is stale");
  if (typeof understandingMarkdown !== "string" || sha256(understandingMarkdown) !== understanding.markdownSha256) errors.push("Project Understanding Markdown content is stale");
  if (report?.guideSha256 !== sha256(guideSource)) errors.push("Project guide content is stale");
  if (!Array.isArray(report?.claims) || !report.claims.length) errors.push("claims must be non-empty");
  const files = new Set(understanding?.scan?.files?.map((file) => file.path));
  for (const item of report?.claims || []) {
    if (!/^claim-[a-z0-9-]+$/.test(item.id || "")) errors.push("claim ID is invalid");
    if (!["verified", "planned", "unavailable"].includes(item.status)) errors.push(`${item.id || "claim"} has an invalid classification`);
    if (!Array.isArray(item.evidence) || !item.evidence.length || item.evidence.some((value) => !safeEvidence(value, files))) errors.push(`${item.id || "claim"} has invalid evidence`);
  }
  const expectedClaims = build(understanding).report.claims;
  if (JSON.stringify(report?.claims) !== JSON.stringify(expectedClaims)) errors.push("Guide claims do not preserve the current Project Understanding classifications and evidence");
  if (!guideSource.startsWith(`# ${understanding?.project?.displayName || ""} Project Guide`)) errors.push("Guide title does not match Project Understanding");
  if (understandingSource && report?.projectUnderstanding?.jsonSha256 !== sha256(JSON.stringify(JSON.parse(understandingSource)))) errors.push("Project Understanding source is stale");
  return errors;
}

async function loadUnderstanding(root) {
  const jsonFile = path.join(root, UNDERSTANDING_JSON);
  const markdownFile = path.join(root, UNDERSTANDING_MARKDOWN);
  if (!existsSync(jsonFile) || !existsSync(markdownFile)) throw new Error("Project Understanding outputs are missing; run project-understanding scan first");
  const source = await readFile(jsonFile, "utf8");
  const report = JSON.parse(source);
  await validateCurrentSources(root, report);
  return { report, source, markdown: await readFile(markdownFile, "utf8") };
}

async function generate(root) {
  const understanding = await loadUnderstanding(root);
  if (understanding.report.status !== "complete") throw new Error("Project Understanding is not complete");
  if (sha256(understanding.markdown) !== understanding.report.markdownSha256) throw new Error("Project Understanding Markdown digest is stale");
  const output = build(understanding.report);
  const errors = validate(output.report, output.markdown, understanding.report, understanding.source, understanding.markdown);
  if (errors.length) throw new Error(`Project guide is invalid:\n- ${errors.join("\n- ")}`);
  await mkdir(path.join(root, "docs"), { recursive: true });
  await mkdir(path.join(root, "reports"), { recursive: true });
  await writeFile(path.join(root, GUIDE), output.markdown, "utf8");
  await writeFile(path.join(root, GUIDE_REPORT), `${JSON.stringify(output.report, null, 2)}\n`, "utf8");
  console.log(`Project guide: ${GUIDE}`);
  console.log(`Claims: ${output.report.claims.length}`);
}

async function validateExisting(root) {
  const understanding = await loadUnderstanding(root);
  const guideFile = path.join(root, GUIDE);
  const reportFile = path.join(root, GUIDE_REPORT);
  if (!existsSync(guideFile) || !existsSync(reportFile)) throw new Error("Project guide outputs are missing; run build");
  const report = JSON.parse(await readFile(reportFile, "utf8"));
  const errors = validate(report, await readFile(guideFile, "utf8"), understanding.report, understanding.source, understanding.markdown);
  if (errors.length) throw new Error(`Project guide is invalid:\n- ${errors.join("\n- ")}`);
  console.log(`Valid project guide: ${GUIDE}`);
}

const { command, options } = parseArguments(process.argv.slice(2));
try {
  const root = await realpath(path.resolve(String(options.root || DEFAULT_ROOT)));
  if (command === "build") await generate(root);
  else if (command === "validate") await validateExisting(root);
  else if (command === "help" || command === "--help") console.log("Documentation builder helper\n\nCommands:\n  build [--root PATH]\n  validate [--root PATH]");
  else throw new Error(`Unknown command: ${command}`);
} catch (error) {
  console.error(error.message);
  process.exitCode = 1;
}