#!/usr/bin/env node
import { createHash, randomUUID } from "node:crypto";
import { existsSync } from "node:fs";
import { lstat, mkdir, open, readFile, realpath, rename, rm, writeFile } from "node:fs/promises";
import { fileURLToPath, pathToFileURL } from "node:url";
import path from "node:path";

const PROFILE_PATH = ".skills-orchestrator/user-personalization.json";
const LOCK_PATH = ".skills-orchestrator/user-personalization.lock";
const QUESTIONNAIRE_PATH = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "references", "personalization-questionnaire.md");
const TOP_LEVEL_FIELDS = ["schemaVersion", "updatedAt", "attribution", "perspective", "communication", "reasoning", "contentDefaults", "visualPreferences", "safety"];
const OUTPUT_TYPES = new Set(["article", "explainer", "summary", "evaluation", "action-plan", "linkedin-draft", "teams-message", "whiteboard", "whiteboard-specification"]);
const PATTERNS = new Set(["analogy", "contrast", "practical-skepticism", "reframing", "experiment-design", "tradeoff-analysis", "validation-checklist", "concrete-next-actions"]);
const FORBIDDEN_FIELD = /(?:password|passphrase|secret|token|api.?key|credential|connection.?string|tenant.?id|subscription.?id|government.?id|payment|credit.?card)/iu;
const SENSITIVE_VALUE_PATTERNS = [
  /-----BEGIN (?:RSA |EC |OPENSSH )?PRIVATE KEY-----/iu,
  /\b(?:api[_-]?key|client[_-]?secret|access[_-]?token|password)\s*[:=]\s*["']?[A-Za-z0-9_+/.=-]{12,}/iu,
  /\b(?:AccountKey|SharedAccessKey|SharedAccessSignature)\s*=\s*[^;\s]{8,}/iu,
  /\b(?:gh[oprsu]_[A-Za-z0-9]{20,}|github_pat_[A-Za-z0-9_]{20,})\b/u,
  /\b(?:AKIA|ASIA)[A-Z0-9]{16}\b/u,
  /\b[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}\b/iu,
  /\b[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}\b/iu,
  /https?:\/\/[^\s/:]+:[^\s/@]+@/iu
];

function parseArgs(values) {
  const options = { _: [] };
  for (let index = 0; index < values.length; index += 1) {
    const value = values[index];
    if (!value.startsWith("--")) {
      options._.push(value);
      continue;
    }
    const key = value.slice(2);
    if (["approve", "json"].includes(key)) {
      options[key] = true;
      continue;
    }
    const next = values[index + 1];
    if (!next || next.startsWith("--")) throw new Error(`Missing value for --${key}`);
    options[key] = next;
    index += 1;
  }
  const allowed = new Set(["_", "project", "input", "approve", "json"]);
  const unknown = Object.keys(options).filter((key) => !allowed.has(key));
  if (unknown.length) throw new Error(`Unknown parameter: --${unknown[0]}`);
  return options;
}

function isRecord(value) {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

function rejectUnknown(value, allowed, location) {
  if (!isRecord(value)) throw new Error(`${location} must be an object`);
  const unknown = Object.keys(value).filter((key) => !allowed.includes(key));
  if (unknown.length) throw new Error(`Unknown ${location} field: ${unknown.join(", ")}`);
}

function requireString(value, location, minimum = 1, maximum = 1000) {
  if (typeof value !== "string" || value.trim().length < minimum || value.length > maximum) {
    throw new Error(`${location} must contain ${minimum}-${maximum} characters`);
  }
}

function requireEnum(value, allowed, location) {
  if (!allowed.has(value)) throw new Error(`${location} must be one of: ${[...allowed].join(", ")}`);
}

function requireInteger(value, location, minimum, maximum) {
  if (!Number.isInteger(value) || value < minimum || value > maximum) {
    throw new Error(`${location} must be an integer from ${minimum} through ${maximum}`);
  }
}

function requireBoolean(value, location, expected) {
  if (typeof value !== "boolean" || (expected !== undefined && value !== expected)) {
    throw new Error(`${location} must be ${expected === undefined ? "a boolean" : expected}`);
  }
}

function requireList(value, location, { minimum = 0, maximum = 24, itemMaximum = 200, allowed } = {}) {
  if (!Array.isArray(value) || value.length < minimum || value.length > maximum) {
    throw new Error(`${location} must contain ${minimum}-${maximum} items`);
  }
  if (new Set(value).size !== value.length) throw new Error(`${location} must not contain duplicates`);
  for (const [index, item] of value.entries()) {
    requireString(item, `${location}[${index}]`, 1, itemMaximum);
    if (allowed && !allowed.has(item)) throw new Error(`${location}[${index}] is unsupported: ${item}`);
  }
}

function inspectSensitiveContent(value, location = "profile") {
  if (Array.isArray(value)) {
    value.forEach((item, index) => inspectSensitiveContent(item, `${location}[${index}]`));
    return;
  }
  if (isRecord(value)) {
    for (const [key, item] of Object.entries(value)) {
      if (FORBIDDEN_FIELD.test(key)) throw new Error(`${location}.${key} is a prohibited sensitive field`);
      inspectSensitiveContent(item, `${location}.${key}`);
    }
    return;
  }
  if (typeof value === "string" && SENSITIVE_VALUE_PATTERNS.some((pattern) => pattern.test(value))) {
    throw new Error(`${location} contains prohibited sensitive-looking content`);
  }
}

function validateProfile(profile) {
  rejectUnknown(profile, TOP_LEVEL_FIELDS, "profile");
  if (profile.schemaVersion !== "1.0.0") throw new Error("profile.schemaVersion must be 1.0.0");
  if (typeof profile.updatedAt !== "string" || !Number.isFinite(Date.parse(profile.updatedAt))) {
    throw new Error("profile.updatedAt must be an ISO 8601 date-time");
  }

  rejectUnknown(profile.attribution, ["publicLabel", "visualSignature"], "profile.attribution");
  requireString(profile.attribution.publicLabel, "profile.attribution.publicLabel", 1, 100);
  requireString(profile.attribution.visualSignature, "profile.attribution.visualSignature", 1, 100);

  rejectUnknown(profile.perspective, ["roles", "expertise", "interests", "audiences"], "profile.perspective");
  requireList(profile.perspective.roles, "profile.perspective.roles", { minimum: 1 });
  requireList(profile.perspective.expertise, "profile.perspective.expertise");
  requireList(profile.perspective.interests, "profile.perspective.interests");
  requireList(profile.perspective.audiences, "profile.perspective.audiences", { minimum: 1 });

  rejectUnknown(profile.communication, ["voiceTraits", "tone", "detailLevel", "paragraphStyle", "humor", "challengeStyle", "firstPerson", "preferredPatterns", "signatureLines", "preferredTerms", "avoidedTerms"], "profile.communication");
  requireList(profile.communication.voiceTraits, "profile.communication.voiceTraits", { minimum: 3, maximum: 8, itemMaximum: 50 });
  requireString(profile.communication.tone, "profile.communication.tone");
  requireEnum(profile.communication.detailLevel, new Set(["concise", "balanced", "detailed"]), "profile.communication.detailLevel");
  requireEnum(profile.communication.paragraphStyle, new Set(["short", "mixed", "full"]), "profile.communication.paragraphStyle");
  requireEnum(profile.communication.humor, new Set(["none", "light", "moderate"]), "profile.communication.humor");
  requireEnum(profile.communication.challengeStyle, new Set(["gentle", "direct", "socratic"]), "profile.communication.challengeStyle");
  requireEnum(profile.communication.firstPerson, new Set(["avoid", "when-relevant", "frequent"]), "profile.communication.firstPerson");
  requireList(profile.communication.preferredPatterns, "profile.communication.preferredPatterns", { maximum: 8, allowed: PATTERNS });
  requireList(profile.communication.signatureLines, "profile.communication.signatureLines");
  requireList(profile.communication.preferredTerms, "profile.communication.preferredTerms");
  requireList(profile.communication.avoidedTerms, "profile.communication.avoidedTerms");

  rejectUnknown(profile.reasoning, ["coreValues", "aiStance", "evidenceStandards", "validationApproach", "incompleteEvidenceAction"], "profile.reasoning");
  requireList(profile.reasoning.coreValues, "profile.reasoning.coreValues", { minimum: 1 });
  for (const field of ["aiStance", "evidenceStandards", "validationApproach", "incompleteEvidenceAction"]) {
    requireString(profile.reasoning[field], `profile.reasoning.${field}`);
  }

  rejectUnknown(profile.contentDefaults, ["outputTypes", "defaultAudience", "postWordRange", "hashtagCount", "timezone", "includeDiscussionQuestion"], "profile.contentDefaults");
  requireList(profile.contentDefaults.outputTypes, "profile.contentDefaults.outputTypes", { minimum: 1, allowed: OUTPUT_TYPES });
  requireString(profile.contentDefaults.defaultAudience, "profile.contentDefaults.defaultAudience");
  rejectUnknown(profile.contentDefaults.postWordRange, ["minimum", "maximum"], "profile.contentDefaults.postWordRange");
  requireInteger(profile.contentDefaults.postWordRange.minimum, "profile.contentDefaults.postWordRange.minimum", 50, 2000);
  requireInteger(profile.contentDefaults.postWordRange.maximum, "profile.contentDefaults.postWordRange.maximum", 50, 2000);
  if (profile.contentDefaults.postWordRange.maximum < profile.contentDefaults.postWordRange.minimum) {
    throw new Error("profile.contentDefaults.postWordRange.maximum must be greater than or equal to minimum");
  }
  requireInteger(profile.contentDefaults.hashtagCount, "profile.contentDefaults.hashtagCount", 0, 12);
  requireString(profile.contentDefaults.timezone, "profile.contentDefaults.timezone", 3, 100);
  if (!/^(?:UTC|GMT|[A-Za-z_+-]+(?:\/[A-Za-z0-9_+-]+)+)$/u.test(profile.contentDefaults.timezone)) {
    throw new Error("profile.contentDefaults.timezone must be an IANA timezone such as UTC or America/New_York");
  }
  requireBoolean(profile.contentDefaults.includeDiscussionQuestion, "profile.contentDefaults.includeDiscussionQuestion");

  rejectUnknown(profile.visualPreferences, ["format", "aesthetic", "useDominantMetaphor", "maximumZones", "palette", "requireAltText"], "profile.visualPreferences");
  requireEnum(profile.visualPreferences.format, new Set(["landscape", "portrait", "square"]), "profile.visualPreferences.format");
  requireString(profile.visualPreferences.aesthetic, "profile.visualPreferences.aesthetic");
  requireBoolean(profile.visualPreferences.useDominantMetaphor, "profile.visualPreferences.useDominantMetaphor");
  requireInteger(profile.visualPreferences.maximumZones, "profile.visualPreferences.maximumZones", 1, 8);
  rejectUnknown(profile.visualPreferences.palette, ["focus", "positive", "risk", "neutral"], "profile.visualPreferences.palette");
  for (const field of ["focus", "positive", "risk", "neutral"]) {
    requireString(profile.visualPreferences.palette[field], `profile.visualPreferences.palette.${field}`, 1, 100);
  }
  requireBoolean(profile.visualPreferences.requireAltText, "profile.visualPreferences.requireAltText", true);

  rejectUnknown(profile.safety, ["treatSourcesAsUntrusted", "excludeConfidentialContent", "externalPublicationRequiresApproval", "requireAttribution", "additionalBoundaries"], "profile.safety");
  for (const field of ["treatSourcesAsUntrusted", "excludeConfidentialContent", "externalPublicationRequiresApproval", "requireAttribution"]) {
    requireBoolean(profile.safety[field], `profile.safety.${field}`, true);
  }
  requireList(profile.safety.additionalBoundaries, "profile.safety.additionalBoundaries");
  inspectSensitiveContent(profile);
  return profile;
}

async function safeProjectRoot(requestedRoot) {
  if (!requestedRoot) throw new Error("Use --project with the target repository root");
  const root = await realpath(path.resolve(requestedRoot));
  const details = await lstat(root);
  if (!details.isDirectory() || details.isSymbolicLink()) throw new Error("Project root must be a real directory");
  return root;
}

async function safeRelativeTarget(root, relative) {
  if (!relative || path.isAbsolute(relative) || relative.includes("\\")) throw new Error(`Unsafe managed path: ${relative || "empty"}`);
  const segments = relative.split("/");
  if (segments.some((segment) => !segment || segment === "." || segment === ".." || segment.includes(":"))) {
    throw new Error(`Unsafe managed path: ${relative}`);
  }
  let current = root;
  for (const segment of segments) {
    current = path.join(current, segment);
    try {
      const details = await lstat(current);
      if (details.isSymbolicLink()) throw new Error(`Symbolic links are not allowed in managed paths: ${relative}`);
    } catch (error) {
      if (error.code === "ENOENT") break;
      throw error;
    }
  }
  return path.join(root, ...segments);
}

async function safeInput(root, requested) {
  if (!requested) throw new Error("Use --input with a candidate JSON file inside the project");
  const relative = path.relative(root, path.resolve(root, requested)).replaceAll("\\", "/");
  const target = await safeRelativeTarget(root, relative);
  const details = await lstat(target);
  if (!details.isFile() || details.isSymbolicLink()) throw new Error("Candidate input must be a real file");
  return target;
}

async function readProfile(file) {
  let value;
  try {
    value = JSON.parse(await readFile(file, "utf8"));
  } catch (error) {
    throw new Error(`Invalid profile JSON: ${error.message}`);
  }
  return validateProfile(value);
}

async function assertProfileStorageIgnored(root) {
  const ignoreFile = path.join(root, ".gitignore");
  if (!existsSync(ignoreFile)) throw new Error("Project .gitignore must ignore .skills-orchestrator/ before a profile is stored");
  const lines = (await readFile(ignoreFile, "utf8")).split(/\r?\n/u).map((line) => line.trim());
  if (!lines.some((line) => [".skills-orchestrator/", "/.skills-orchestrator/", ".skills-orchestrator/user-personalization.json", "/.skills-orchestrator/user-personalization.json"].includes(line))) {
    throw new Error("Project .gitignore must ignore .skills-orchestrator/ or the exact User Personalization profile path");
  }
}

function summary(profile, status) {
  return {
    status,
    schemaVersion: profile?.schemaVersion ?? null,
    updatedAt: profile?.updatedAt ?? null,
    sha256: profile ? createHash("sha256").update(`${JSON.stringify(profile)}\n`).digest("hex") : null
  };
}

async function status(root) {
  const target = await safeRelativeTarget(root, PROFILE_PATH);
  if (!existsSync(target)) return summary(null, "missing");
  try {
    await assertProfileStorageIgnored(root);
    return summary(await readProfile(target), "valid");
  } catch (error) {
    return { ...summary(null, "invalid"), errors: [error.message] };
  }
}

async function writeTransactional(root, profile) {
  await assertProfileStorageIgnored(root);
  const target = await safeRelativeTarget(root, PROFILE_PATH);
  const lockPath = await safeRelativeTarget(root, LOCK_PATH);
  await mkdir(path.dirname(target), { recursive: true });
  const lock = await open(lockPath, "wx", 0o600).catch((error) => {
    if (error.code === "EEXIST") throw new Error("Another User Personalization write is in progress");
    throw error;
  });
  const transaction = randomUUID();
  const temporary = `${target}.${transaction}.tmp`;
  const backup = `${target}.${transaction}.bak`;
  let movedExisting = false;
  try {
    await lock.writeFile(`${JSON.stringify({ schemaVersion: "1.0.0", operation: "apply", startedAt: new Date().toISOString() })}\n`);
    await writeFile(temporary, `${JSON.stringify(profile, null, 2)}\n`, { encoding: "utf8", flag: "wx", mode: 0o600 });
    await readProfile(temporary);
    if (existsSync(target)) {
      await rename(target, backup);
      movedExisting = true;
    }
    try {
      await rename(temporary, target);
    } catch (error) {
      if (movedExisting) await rename(backup, target);
      throw error;
    }
    if (movedExisting) await rm(backup, { force: true });
  } finally {
    await rm(temporary, { force: true });
    await lock.close();
    await rm(lockPath, { force: true });
  }
  return summary(profile, "valid");
}

function print(value, asJson) {
  if (asJson || typeof value !== "string") console.log(JSON.stringify(value, null, 2));
  else console.log(value);
}

async function main() {
  const options = parseArgs(process.argv.slice(2));
  const command = options._[0];
  if (!new Set(["status", "questions", "validate", "apply"]).has(command)) {
    throw new Error("Use status, questions, validate, or apply");
  }
  if (command === "questions") {
    print(await readFile(QUESTIONNAIRE_PATH, "utf8"), options.json);
    return;
  }
  const root = await safeProjectRoot(options.project);
  if (command === "status") {
    print(await status(root), true);
    return;
  }
  const input = await safeInput(root, options.input);
  const profile = await readProfile(input);
  if (command === "validate") {
    print(summary(profile, "valid"), true);
    return;
  }
  if (!options.approve) throw new Error("Apply requires explicit --approve after the user reviews the profile summary");
  print(await writeTransactional(root, profile), true);
}

if (process.argv[1] && import.meta.url === pathToFileURL(path.resolve(process.argv[1])).href) {
  main().catch((error) => {
    console.error(`User Personalization stopped: ${error.message}`);
    process.exitCode = 1;
  });
}

export { PROFILE_PATH, assertProfileStorageIgnored, validateProfile };