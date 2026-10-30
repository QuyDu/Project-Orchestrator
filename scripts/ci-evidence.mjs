#!/usr/bin/env node
import { randomUUID } from "node:crypto";
import { mkdir, readFile, readdir, rename, rm, stat, writeFile } from "node:fs/promises";
import path from "node:path";

const command = process.argv[2];
const allowed = command === "record" ? ["--os", "--node", "--commit", "--output"] : command === "aggregate" ? ["--input", "--output", "--commit"] : [];
const args = process.argv.slice(3);
const options = new Map();
if (!allowed.length || args.length !== allowed.length * 2) throw new Error("Use record or aggregate with their required options");
for (let index = 0; index < args.length; index += 2) {
  if (!allowed.includes(args[index]) || options.has(args[index]) || !args[index + 1] || args[index + 1].startsWith("--")) throw new Error("Invalid CI evidence options");
  options.set(args[index], args[index + 1]);
}

function option(name) {
  const value = options.get(`--${name}`);
  if (!value) throw new Error(`Missing --${name}`);
  return value;
}

function validCompletion(value) {
  if (typeof value !== "string" || !/^\d{4}-\d{2}-\d{2}T(?:[01]\d|2[0-3]):[0-5]\d:[0-5]\d(?:\.\d+)?(?:Z|[+-](?:[01]\d|2[0-3]):[0-5]\d)$/.test(value)) return false;
  const timestamp = Date.parse(value);
  const date = new Date(`${value.slice(0, 10)}T00:00:00.000Z`);
  return Number.isFinite(timestamp) && timestamp <= Date.now() && Number.isFinite(date.getTime()) && date.toISOString().slice(0, 10) === value.slice(0, 10);
}

async function writeEvidence(output, value) {
  await mkdir(path.dirname(output), { recursive: true });
  const temporary = `${output}.${randomUUID()}.tmp`;
  try {
    await writeFile(temporary, `${JSON.stringify(value, null, 2)}\n`, { flag: "wx", mode: 0o600 });
    await rename(temporary, output);
  } catch (error) {
    await rm(temporary, { force: true });
    throw error;
  }
}

if (command === "record") {
  const os = option("os").toLowerCase();
  const nodeValue = option("node");
  const node = Number(nodeValue);
  const commit = option("commit");
  const output = path.resolve(option("output"));
  const runtimeOs = { win32: "windows", linux: "linux", darwin: "macos" }[process.platform];
  if (os !== runtimeOs || !["22", "24", "26"].includes(nodeValue) || node !== Number(process.versions.node.split(".")[0]) || !/^[a-f0-9]{40}$/.test(commit)) {
    throw new Error("Invalid CI evidence values");
  }
  await writeEvidence(output, { schemaVersion: "1.0.0", os, node, commit, status: "passed", completedAt: new Date().toISOString() });
  console.log(`Recorded ${os}-${node} evidence for ${commit}`);
} else if (command === "aggregate") {
  const input = path.resolve(option("input"));
  const output = path.resolve(option("output"));
  const commit = option("commit");
  if (!/^[a-f0-9]{40}$/.test(commit)) throw new Error("Invalid aggregate commit");
  const runs = [];
  for (const entry of await readdir(input, { withFileTypes: true })) {
    if (!entry.isFile() || !entry.name.endsWith(".json")) continue;
    let run;
    try {
      const file = path.join(input, entry.name);
      const details = await stat(file);
      if (details.size > 64 * 1024) throw new Error("CI run exceeds its input bound");
      const bytes = await readFile(file);
      if (bytes.length > 64 * 1024) throw new Error("CI run exceeds its input bound");
      run = JSON.parse(bytes.toString("utf8"));
    } catch { throw new Error("CI run evidence is unreadable, malformed, or oversized"); }
    const fields = ["schemaVersion", "os", "node", "commit", "status", "completedAt"];
    if (!run || typeof run !== "object" || Array.isArray(run) || Object.keys(run).length !== fields.length || !fields.every((field) => Object.hasOwn(run, field))
      || run.schemaVersion !== "1.0.0" || run.commit !== commit || run.status !== "passed"
      || !["windows", "linux", "macos"].includes(run.os) || ![22, 24, 26].includes(run.node) || !validCompletion(run.completedAt)) {
      throw new Error("Invalid CI run evidence contract or provenance");
    }
    runs.push(run);
  }
  const identities = new Set(runs.map((run) => `${run.os}-${run.node}`));
  const required = ["windows-22", "windows-24", "windows-26", "linux-22", "linux-24", "linux-26", "macos-22", "macos-24", "macos-26"];
  if (runs.length !== required.length || !required.every((identity) => identities.has(identity))) {
    throw new Error(`Incomplete CI evidence: expected ${required.length} unique runs, found ${identities.size}`);
  }
  runs.sort((left, right) => `${left.os}-${left.node}`.localeCompare(`${right.os}-${right.node}`));
  await writeEvidence(output, { schemaVersion: "1.0.0", commit, generatedAt: new Date().toISOString(), runs });
  console.log(`Aggregated ${runs.length} CI runs for ${commit}`);
} else {
  throw new Error("Use record or aggregate");
}
