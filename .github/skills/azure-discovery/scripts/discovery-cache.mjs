#!/usr/bin/env node
import { createHash, randomUUID } from "node:crypto";
import { spawnSync } from "node:child_process";
import * as fs from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

export const MAX_DISCOVERY_AGE_DAYS = 30;
const MAX_AGE_MS = MAX_DISCOVERY_AGE_DAYS * 86_400_000;
const MAX_BYTES = 1_048_576;
const DEFAULT_ROOT = fileURLToPath(new URL("../../../../", import.meta.url));
const schema = JSON.parse(await fs.readFile(new URL("../../../../schemas/azure-discovery.schema.json", import.meta.url), "utf8"));
const pending = new Map();
const schemaKeywords = new Set([
  "$schema", "$id", "$defs", "$ref", "title", "description", "type", "const", "enum",
  "properties", "required", "additionalProperties", "minLength", "maxLength", "pattern",
  "format", "minimum", "maximum", "minItems", "maxItems", "uniqueItems", "items",
  "allOf", "if", "then", "else", "not"
]);

function checkSchemaVocabulary(rule) {
  if (!rule || typeof rule !== "object" || Array.isArray(rule)) throw new Error("Unsupported discovery schema node");
  for (const key of Object.keys(rule)) if (!schemaKeywords.has(key)) throw new Error(`Unsupported discovery schema keyword: ${key}`);
  if (rule.format && rule.format !== "date-time") throw new Error("Unsupported discovery schema format");
  if (rule.additionalProperties !== undefined && typeof rule.additionalProperties !== "boolean") throw new Error("Unsupported discovery additionalProperties schema");
  for (const child of [...Object.values(rule.properties ?? {}), ...Object.values(rule.$defs ?? {}), ...(rule.allOf ?? [])]) checkSchemaVocabulary(child);
  for (const key of ["items", "if", "then", "else", "not"]) if (rule[key] !== undefined) checkSchemaVocabulary(rule[key]);
}

checkSchemaVocabulary(schema);

function utcTimestamp(value) {
  if (typeof value !== "string" || !/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d{1,7})?Z$/.test(value)) return NaN;
  const time = Date.parse(value);
  return Number.isFinite(time) && new Date(time).toISOString().slice(0, 19) === value.slice(0, 19) ? time : NaN;
}

function schemaErrors(value, rule, label = "discovery") {
  const errors = [];
  if (rule.$ref) {
    if (!rule.$ref.startsWith("#/$defs/") || !schema.$defs[rule.$ref.slice(8)]) throw new Error("Unsupported discovery schema reference");
    errors.push(...schemaErrors(value, schema.$defs[rule.$ref.slice(8)], label));
  }
  const type = value === null ? "null" : Array.isArray(value) ? "array" : typeof value;
  if (rule.type && ![rule.type].flat().some((expected) => expected === type || expected === "integer" && Number.isInteger(value))) {
    return [...errors, `${label} has an invalid type`];
  }
  if (Object.hasOwn(rule, "const") && value !== rule.const) errors.push(`${label} has an invalid constant`);
  if (rule.enum && !rule.enum.includes(value)) errors.push(`${label} has an unsupported value`);
  if (type === "object") {
    for (const key of rule.required ?? []) if (!Object.hasOwn(value, key)) errors.push(`${label}.${key} is required`);
    for (const [key, child] of Object.entries(value)) {
      if (rule.properties && Object.hasOwn(rule.properties, key)) errors.push(...schemaErrors(child, rule.properties[key], `${label}.${key}`));
      else if (rule.additionalProperties === false) errors.push(`${label} contains an unsupported field`);
    }
  }
  if (type === "string") {
    const length = [...value].length;
    if (rule.minLength !== undefined && length < rule.minLength || rule.maxLength !== undefined && length > rule.maxLength) errors.push(`${label} has an invalid length`);
    if (rule.pattern && !new RegExp(rule.pattern).test(value)) errors.push(`${label} has an invalid format`);
    if (rule.format === "date-time" && !Number.isFinite(utcTimestamp(value))) errors.push(`${label} must be a valid UTC timestamp`);
  }
  if (type === "number") {
    if (!Number.isFinite(value) || rule.minimum !== undefined && value < rule.minimum || rule.maximum !== undefined && value > rule.maximum) errors.push(`${label} is outside its bounds`);
  }
  if (type === "array") {
    if (rule.minItems !== undefined && value.length < rule.minItems || rule.maxItems !== undefined && value.length > rule.maxItems) errors.push(`${label} has an invalid item count`);
    if (rule.uniqueItems && new Set(value.map((item) => JSON.stringify(item))).size !== value.length) errors.push(`${label} contains duplicates`);
    if (rule.items) for (const [index, child] of value.entries()) errors.push(...schemaErrors(child, rule.items, `${label}[${index}]`));
  }
  for (const child of rule.allOf ?? []) errors.push(...schemaErrors(value, child, label));
  if (rule.not && !schemaErrors(value, rule.not, label).length) errors.push(`${label} violates an exclusion`);
  if (rule.if) {
    const branch = schemaErrors(value, rule.if, label).length ? rule.else : rule.then;
    if (branch) errors.push(...schemaErrors(value, branch, label));
  }
  return errors;
}

export function validateDiscovery(report) {
  return schemaErrors(report, schema);
}

function context(profile, options) {
  if (profile?.schemaVersion !== "1.0.0") throw new Error("Azure environment profile version is missing or unsupported");
  const cloud = options.cloud ?? profile?.cloud;
  if (!["AzureCloud", "AzureUSGovernment"].includes(cloud)) throw new Error("A valid Azure cloud is required");
  const location = options.location ?? (cloud === profile?.cloud ? profile.location : cloud === "AzureUSGovernment" ? "usgovvirginia" : "eastus");
  if (typeof location !== "string" || !/^[a-z0-9-]+$/.test(location)) throw new Error("A lowercase Azure region is required");
  const identities = ["tenantId", "subscriptionId"].map((key) => {
    const value = profile?.subscription?.[key];
    if (typeof value !== "string" || !value.trim() || value.length > 100 || /[\u0000-\u0020\u007f]/.test(value)) throw new Error(`Azure profile ${key} is missing or invalid`);
    return value.toLowerCase();
  });
  const preferModel = options.preferModel ?? "";
  if (typeof preferModel !== "string" || !/^(?:[A-Za-z0-9][A-Za-z0-9._-]{0,119})?$/.test(preferModel)) throw new Error("Preferred model must be a bounded model name");
  return { cloud, location, identities, preferModel: preferModel.toLowerCase() };
}

export function contextFingerprint(profile, options = {}) {
  const resolved = context(profile, options);
  return createHash("sha256").update(JSON.stringify(["azure-discovery-context-v1", resolved.cloud, ...resolved.identities, resolved.location, resolved.preferModel])).digest("hex");
}

export function inspectDiscovery(report, profile, options = {}) {
  const fingerprint = contextFingerprint(profile, options);
  const now = options.now ?? Date.now();
  if (!Number.isFinite(now)) throw new Error("The discovery clock must be finite");
  const required = (reason, errors = []) => ({ status: "refresh-required", reason, errors });
  if (report === null || report === undefined) return required("missing");
  const errors = validateDiscovery(report);
  if (errors.length) return required("invalid", errors);
  if (!report.contextSha256 || !report.expiresAt) return required("unbound");
  const resolved = context(profile, options);
  if (report.contextSha256 !== fingerprint || report.cloud !== resolved.cloud || report.location !== resolved.location) return required("context-mismatch");
  const discoveredAt = utcTimestamp(report.discoveredAt);
  if (discoveredAt > now) return required("future-dated");
  if (utcTimestamp(report.expiresAt) !== discoveredAt + MAX_AGE_MS) return required("invalid-expiry");
  if (now - discoveredAt > MAX_AGE_MS) return required("expired");
  return { status: "fresh", reason: "current", report };
}

export function bindDiscovery(report, profile, options = {}) {
  const errors = validateDiscovery(report);
  if (errors.length) throw new Error(`Invalid discovery report: ${errors.join("; ")}`);
  if (!report.imageGeneration) throw new Error("New discovery reports require imageGeneration");
  const contextSha256 = contextFingerprint(profile, options);
  if (report.contextSha256 && report.contextSha256 !== contextSha256) throw new Error("Cannot rebind existing discovery evidence to a different context");
  const expiresAt = new Date(utcTimestamp(report.discoveredAt) + MAX_AGE_MS).toISOString();
  if (report.expiresAt && report.expiresAt !== expiresAt) throw new Error("Cannot extend an existing discovery expiry");
  const bound = { ...report, expiresAt, contextSha256 };
  const state = inspectDiscovery(bound, profile, options);
  if (state.status !== "fresh") throw new Error(`Cannot publish discovery: ${state.reason}`);
  return bound;
}

async function checkedPath(root, relative, operations = fs) {
  const target = path.resolve(root, relative);
  const local = path.relative(root, target);
  if (!local || local === ".." || local.startsWith(`..${path.sep}`) || path.isAbsolute(local)) throw new Error("Discovery paths must remain inside the project");
  let current = root;
  for (const part of local.split(path.sep)) {
    current = path.join(current, part);
    let entry;
    try { entry = await operations.lstat(current); } catch (error) { if (error.code === "ENOENT") break; throw error; }
    if (entry.isSymbolicLink()) throw new Error("Discovery paths cannot contain symbolic links");
    if (current !== target && !entry.isDirectory() || current === target && !entry.isFile()) throw new Error("Discovery paths must reference regular files");
  }
  return target;
}

async function paths(root, options, operations = fs) {
  root = await operations.realpath(root);
  const json = await checkedPath(root, options.outputPath ?? path.join("reports", "azure-discovery.json"), operations);
  if (!json.endsWith(".json")) throw new Error("Discovery output must have a .json extension");
  const relative = path.relative(path.join(root, "reports"), json);
  if (relative === ".." || relative.startsWith(`..${path.sep}`) || path.isAbsolute(relative)) throw new Error("Discovery output must remain inside the project's reports directory");
  const markdown = await checkedPath(root, `${json.slice(0, -5)}.md`, operations);
  const lock = await checkedPath(root, `${json}.lock`, operations);
  const profile = await checkedPath(root, path.join(".azure", "environment.json"), operations);
  return { root, json, markdown, lock, profile };
}

async function optionalText(file, operations = fs) {
  try {
    if ((await operations.stat(file)).size > MAX_BYTES) throw new Error("Discovery input exceeds one MiB");
    return (await operations.readFile(file, "utf8")).replace(/^\uFEFF/, "");
  } catch (error) {
    if (error.code === "ENOENT") return null;
    throw error;
  }
}

async function loadProfile(file, operations = fs) {
  const source = await optionalText(file, operations);
  if (source === null) throw new Error("Azure environment profile is missing; initialize azure-discovery first");
  try { return JSON.parse(source); } catch (error) {
    if (!(error instanceof SyntaxError)) throw error;
    throw new Error("Azure environment profile contains invalid JSON");
  }
}

function markdown(report) {
  return `# Azure Discovery\n\n- Discovered at (UTC): ${report.discoveredAt}\n- Expires at (UTC): ${report.expiresAt}\n- Cloud: ${report.cloud}\n- Location: ${report.location}\n- Context fingerprint: ${report.contextSha256}\n- Cache lifetime: ${MAX_DISCOVERY_AGE_DAYS} days, inclusive\n\n## Sanitized discovery details\n\n\`\`\`json\n${JSON.stringify(report, null, 2)}\n\`\`\`\n\nSubscription details remain in the ignored local Azure environment profile. Discovery does not authorize deployment or inference.\n`;
}

export async function inspectCachedDiscovery(root, options = {}) {
  const files = await paths(root, options);
  if (await optionalText(files.lock) !== null) throw new Error("Discovery publication is in progress; retry after it completes");
  const profile = await loadProfile(files.profile);
  contextFingerprint(profile, options);
  const source = await optionalText(files.json);
  if (source === null) return { status: "refresh-required", reason: "missing" };
  let report;
  try { report = JSON.parse(source); } catch (error) {
    if (!(error instanceof SyntaxError)) throw error;
    return { status: "refresh-required", reason: "malformed" };
  }
  const state = inspectDiscovery(report, profile, options);
  if (state.status !== "fresh") return state;
  const readable = await optionalText(files.markdown);
  if (readable?.replaceAll("\r\n", "\n") !== markdown(report)) return { status: "refresh-required", reason: "incomplete" };
  return state;
}

export async function publishDiscovery(root, report, options = {}, operations = fs) {
  const files = await paths(root, options, operations);
  const bound = bindDiscovery(report, await loadProfile(files.profile, operations), options);
  const transaction = randomUUID();
  const entries = [
    { file: files.markdown, content: markdown(bound) },
    { file: files.json, content: `${JSON.stringify(bound, null, 2)}\n` }
  ].map((entry) => ({ ...entry, partial: `${entry.file}.${transaction}.partial`, backup: `${entry.file}.${transaction}.backup`, backedUp: false, published: false }));
  if (entries.some((entry) => Buffer.byteLength(entry.content) > MAX_BYTES)) throw new Error("Discovery output exceeds one MiB");
  await operations.mkdir(path.dirname(files.json), { recursive: true });
  await paths(root, options, operations);
  let lock;
  try { lock = await operations.open(files.lock, "wx"); } catch (error) {
    if (error.code === "EEXIST") throw new Error("Discovery publication is in progress; no report was replaced");
    throw error;
  }
  let committed = false;
  try {
    for (const entry of entries) await operations.writeFile(entry.partial, entry.content, { encoding: "utf8", flag: "wx" });
    for (const entry of entries) {
      if (await optionalText(entry.file, operations) !== null) {
        await operations.rename(entry.file, entry.backup);
        entry.backedUp = true;
      }
      await operations.rename(entry.partial, entry.file);
      entry.published = true;
    }
    committed = true;
  } catch (error) {
    const failures = [error];
    for (const entry of entries.toReversed()) {
      try {
        if (entry.published) await operations.rm(entry.file);
        if (entry.backedUp) await operations.rename(entry.backup, entry.file);
      } catch (rollbackError) { failures.push(rollbackError); }
    }
    if (failures.length > 1) throw new AggregateError(failures, "Discovery publication and rollback failed; retain the transaction backups");
    throw error;
  } finally {
    try {
      for (const entry of entries) {
        await operations.rm(entry.partial, { force: true });
        if (committed && entry.backedUp) await operations.rm(entry.backup);
      }
    } finally {
      await lock.close();
      await operations.rm(files.lock);
    }
  }
  return bound;
}

function refreshWithPowerShell(root, options) {
  const request = { root, cloud: options.cloud ?? null, location: options.location ?? null, preferModel: options.preferModel ?? null, outputPath: options.outputPath ?? null };
  const script = `
$ErrorActionPreference = 'Stop'
$request = $env:PSO_DISCOVERY_REQUEST | ConvertFrom-Json
. (Join-Path $request.root '.github\\skills\\azure-discovery\\scripts\\azure-discovery.ps1')
$parameters = @{ Refresh = $true }
if ($request.cloud -eq 'AzureUSGovernment') { $parameters.Gov = $true }
if ($request.cloud -eq 'AzureCloud') { $parameters.Commercial = $true }
if ($request.location) { $parameters.Location = $request.location }
if ($request.preferModel) { $parameters.PreferModel = $request.preferModel }
if ($request.outputPath) { $parameters.DiscoveryOutputPath = $request.outputPath }
Invoke-AzureDiscovery @parameters | Out-Null
`;
  const result = spawnSync(process.platform === "win32" ? "powershell.exe" : "pwsh", [
    "-NoProfile", "-NonInteractive", "-EncodedCommand", Buffer.from(script, "utf16le").toString("base64")
  ], { cwd: root, stdio: ["inherit", 2, 2], timeout: 300_000, windowsHide: true, env: { ...process.env, PSO_DISCOVERY_REQUEST: JSON.stringify(request) } });
  if (result.error) throw new Error(`Azure discovery refresh could not run: ${result.error.message}`);
  if (result.status !== 0) throw new Error(`Azure discovery refresh failed (exit ${result.status ?? "unknown"})`);
}

export async function ensureDiscovery(root, options = {}, refresh = refreshWithPowerShell) {
  root = await fs.realpath(root);
  const key = JSON.stringify([root, options.outputPath ?? "", options.cloud ?? "", options.location ?? "", options.preferModel ?? "", options.now ?? null]);
  if (pending.has(key)) return pending.get(key);
  const operation = (async () => {
    const current = await inspectCachedDiscovery(root, options);
    if (current.status === "fresh") return current.report;
    await refresh(root, options);
    const updated = await inspectCachedDiscovery(root, options);
    if (updated.status !== "fresh") throw new Error(`Azure discovery refresh did not produce reusable evidence: ${updated.reason}`);
    return updated.report;
  })().finally(() => pending.delete(key));
  pending.set(key, operation);
  return operation;
}

async function main() {
  const [command, ...args] = process.argv.slice(2);
  if (!["inspect", "ensure", "publish"].includes(command)) throw new Error("Use inspect, ensure, or publish with --root PATH, optional --output PATH, --cloud CLOUD, --location REGION, and --prefer-model NAME");
  const names = { "--root": "root", "--output": "outputPath", "--cloud": "cloud", "--location": "location", "--prefer-model": "preferModel" };
  const options = {};
  for (let index = 0; index < args.length; index += 2) {
    const key = names[args[index]];
    if (!key || Object.hasOwn(options, key) || args[index + 1] === undefined || args[index + 1].startsWith("--")) throw new Error("Invalid discovery cache arguments");
    options[key] = args[index + 1];
  }
  const root = options.root ?? DEFAULT_ROOT;
  let result;
  if (command === "inspect") result = await inspectCachedDiscovery(root, options);
  else if (command === "ensure") result = await ensureDiscovery(root, options);
  else {
    let input = "";
    process.stdin.setEncoding("utf8");
    for await (const chunk of process.stdin) {
      input += chunk;
      if (Buffer.byteLength(input) > MAX_BYTES) throw new Error("Discovery input exceeds one MiB");
    }
    let report;
    try { report = JSON.parse(input.replace(/^\uFEFF/, "")); } catch (error) {
      if (!(error instanceof SyntaxError)) throw error;
      throw new Error("Discovery publication input contains invalid JSON");
    }
    result = await publishDiscovery(root, report, options);
  }
  console.log(JSON.stringify(result));
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  main().catch((error) => { console.error(error.message); process.exitCode = 1; });
}
