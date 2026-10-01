#!/usr/bin/env node
import { createHash, randomUUID } from "node:crypto";
import { createReadStream, existsSync } from "node:fs";
import { lstat, mkdir, open, readFile, readdir, rename, rm, writeFile } from "node:fs/promises";
import path from "node:path";
import { spawn, spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import { gunzipSync, inflateRawSync } from "node:zlib";
import { assertSafeRelativePath } from "./safe-path.mjs";

const VERSION = "8.30.1";
const CHECKSUMS_SHA256 = "061476c21adaf5441516f96f185c1a4706a83cd6329b9b38762271b3d4a52fae";
const RELEASE = `https://github.com/gitleaks/gitleaks/releases/download/v${VERSION}`;
const ASSETS = {
  "darwin-arm64": ["darwin_arm64.tar.gz", "b40ab0ae55c505963e365f271a8d3846efbc170aa17f2607f13df610a9aeb6a5"],
  "darwin-x64": ["darwin_x64.tar.gz", "dfe101a4db2255fc85120ac7f3d25e4342c3c20cf749f2c20a18081af1952709"],
  "linux-arm64": ["linux_arm64.tar.gz", "e4a487ee7ccd7d3a7f7ec08657610aa3606637dab924210b3aee62570fb4b080"],
  "linux-x64": ["linux_x64.tar.gz", "551f6fc83ea457d62a0d98237cbad105af8d557003051f41f3e7ca7b3f2470eb"],
  "win32-arm64": ["windows_arm64.zip", "b95f5e4f5c425cedca7ee203d9afd29597e692c4924a12ed42f970537c72cc0f"],
  "win32-x64": ["windows_x64.zip", "d29144deff3a68aa93ced33dddf84b7fdc26070add4aa0f4513094c8332afc4e"]
};
const scriptRoot = path.dirname(fileURLToPath(import.meta.url));
const skillRoot = path.resolve(scriptRoot, "..");
const frameworkRoot = path.resolve(skillRoot, "..", "..", "..");

function sha256(bytes) {
  return createHash("sha256").update(bytes).digest("hex");
}

function platformKey() {
  const key = `${process.platform}-${process.arch}`;
  if (!ASSETS[key]) throw new Error(`Unsupported Gitleaks platform: ${key}`);
  return key;
}

function metadata() {
  const key = platformKey();
  return {
    name: "gitleaks",
    version: VERSION,
    releaseUrl: `${RELEASE}/`,
    platform: key,
    archiveSha256: ASSETS[key][1],
    checksumsSha256: CHECKSUMS_SHA256
  };
}

function toolPaths(root) {
  const key = platformKey();
  const directory = path.join(root, ".skills-orchestrator", "tools", "audit-code", "gitleaks", VERSION, key);
  return { directory, binary: path.join(directory, process.platform === "win32" ? "gitleaks.exe" : "gitleaks") };
}

function run(binary, args, options = {}) {
  const result = spawnSync(binary, args, { cwd: options.cwd, encoding: "utf8", windowsHide: true, shell: false, env: { ...process.env, GIT_NO_LAZY_FETCH: "1" } });
  if (result.error || result.status !== 0) {
    throw new Error(`${path.basename(binary)} failed (${result.error?.code || result.signal || `exit ${result.status}`}); subprocess output withheld`);
  }
  return result.stdout.trim();
}

async function verifiedDownload(url, destination, expectedSha256) {
  let bytes = existsSync(destination) ? await readFile(destination) : null;
  if (!bytes || sha256(bytes) !== expectedSha256) {
    const response = await fetch(url, { redirect: "follow", signal: AbortSignal.timeout(60_000) });
    if (!response.ok) throw new Error(`Gitleaks download failed: HTTP ${response.status}`);
    bytes = Buffer.from(await response.arrayBuffer());
    const actual = sha256(bytes);
    if (actual !== expectedSha256) throw new Error(`Gitleaks download digest mismatch: ${actual}`);
    await writeFile(destination, bytes, { flag: "w" });
  }
  return bytes;
}

async function install(root) {
  const key = platformKey();
  const [suffix, expectedArchiveSha256] = ASSETS[key];
  const archiveName = `gitleaks_${VERSION}_${suffix}`;
  const checksumsName = `gitleaks_${VERSION}_checksums.txt`;
  const { directory, binary } = toolPaths(root);
  await mkdir(directory, { recursive: true });
  const checksumsPath = path.join(directory, checksumsName);
  const checksums = await verifiedDownload(`${RELEASE}/${checksumsName}`, checksumsPath, CHECKSUMS_SHA256);
  const escapedName = archiveName.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const manifestEntry = new RegExp(`^([a-f0-9]{64})\\s+\\*?${escapedName}$`, "mi").exec(checksums.toString("utf8"));
  if (!manifestEntry || manifestEntry[1].toLowerCase() !== expectedArchiveSha256) {
    throw new Error(`Gitleaks checksum manifest does not authenticate ${archiveName}`);
  }
  const archive = path.join(directory, archiveName);
  await verifiedDownload(`${RELEASE}/${archiveName}`, archive, expectedArchiveSha256);
  if (process.platform === "win32") {
    run("pwsh", ["-NoProfile", "-NonInteractive", "-Command", `Expand-Archive -LiteralPath '${archive.replaceAll("'", "''")}' -DestinationPath '${directory.replaceAll("'", "''")}' -Force`], { cwd: root });
  } else {
    run("tar", ["-xzf", archive, "-C", directory], { cwd: root });
  }
  const actualVersion = run(binary, ["version"], { cwd: root });
  if (actualVersion !== VERSION) throw new Error(`Expected Gitleaks ${VERSION}, found ${actualVersion}`);
  return { binary, key, archiveSha256: expectedArchiveSha256 };
}

function archiveExecutable(archive, name) {
  const limit = 64 * 1024 * 1024;
  if (process.platform !== "win32") {
    const tar = gunzipSync(archive, { maxOutputLength: limit });
    for (let offset = 0; offset + 512 <= tar.length;) {
      const header = tar.subarray(offset, offset + 512);
      const archiveName = header.subarray(0, 100).toString("utf8").split("\0")[0];
      const filename = archiveName.replace(/^\.\//, "");
      const sizeText = header.subarray(124, 136).toString("ascii").replace(/\0.*$/, "").trim();
      if (!archiveName) break;
      if (!/^[0-7]+$/.test(sizeText)) throw new Error("Invalid cached Gitleaks archive entry");
      const size = Number.parseInt(sizeText, 8);
      if (size > limit || offset + 512 + size > tar.length) throw new Error("Invalid cached Gitleaks archive size");
      if (filename === name && [0, 48].includes(header[156])) return tar.subarray(offset + 512, offset + 512 + size);
      offset += 512 + Math.ceil(size / 512) * 512;
    }
  } else {
    let end = archive.length - 22;
    while (end >= Math.max(0, archive.length - 65_557) && archive.readUInt32LE(end) !== 0x06054b50) end--;
    if (end < Math.max(0, archive.length - 65_557)) throw new Error("Invalid cached Gitleaks ZIP directory");
    const entries = archive.readUInt16LE(end + 10);
    let offset = archive.readUInt32LE(end + 16);
    for (let index = 0; index < entries; index++) {
      if (offset + 46 > archive.length || archive.readUInt32LE(offset) !== 0x02014b50) throw new Error("Invalid cached Gitleaks ZIP entry");
      const flags = archive.readUInt16LE(offset + 8);
      const method = archive.readUInt16LE(offset + 10);
      const compressedSize = archive.readUInt32LE(offset + 20);
      const expandedSize = archive.readUInt32LE(offset + 24);
      const nameLength = archive.readUInt16LE(offset + 28);
      const extraLength = archive.readUInt16LE(offset + 30);
      const commentLength = archive.readUInt16LE(offset + 32);
      const local = archive.readUInt32LE(offset + 42);
      const filename = archive.subarray(offset + 46, offset + 46 + nameLength).toString("utf8");
      if (filename === name) {
        if ((flags & 1) || expandedSize > limit || local + 30 > archive.length || archive.readUInt32LE(local) !== 0x04034b50) throw new Error("Unsupported cached Gitleaks ZIP executable");
        const start = local + 30 + archive.readUInt16LE(local + 26) + archive.readUInt16LE(local + 28);
        if (start + compressedSize > archive.length) throw new Error("Invalid cached Gitleaks ZIP size");
        const compressed = archive.subarray(start, start + compressedSize);
        const bytes = method === 0 ? compressed : method === 8 ? inflateRawSync(compressed, { maxOutputLength: limit }) : null;
        if (!bytes || bytes.length !== expandedSize) throw new Error("Invalid cached Gitleaks executable size");
        return bytes;
      }
      offset += 46 + nameLength + extraLength + commentLength;
    }
  }
  throw new Error("Authenticated Gitleaks archive does not contain the expected executable");
}

async function cachedTool(root) {
  if (!existsSync(root)) throw new Error("Verified cached Gitleaks is unavailable; explicit approved install is required (scan never downloads or installs)");
  const key = platformKey();
  const [suffix, archiveSha256] = ASSETS[key];
  const { directory, binary } = toolPaths(root);
  const archiveName = `gitleaks_${VERSION}_${suffix}`;
  const names = [`gitleaks_${VERSION}_checksums.txt`, archiveName, path.basename(binary)];
  const bytes = [];
  for (const name of names) {
    const relative = path.relative(root, path.join(directory, name));
    const file = await assertSafeRelativePath(root, relative);
    if (!existsSync(file)) throw new Error("Verified cached Gitleaks is unavailable; explicit approved install is required (scan never downloads or installs)");
    const details = await lstat(file);
    if (!details.isFile() || details.nlink !== 1 || details.size > 64 * 1024 * 1024) {
      throw new Error("Cached Gitleaks inputs must be regular unlinked files no larger than 64 MiB");
    }
    bytes.push(await readFile(file));
  }
  if (sha256(bytes[0]) !== CHECKSUMS_SHA256 || sha256(bytes[1]) !== archiveSha256) {
    throw new Error("Cached Gitleaks checksum manifest or archive does not match its pinned digest");
  }
  const escapedName = archiveName.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const entry = new RegExp(`^([a-f0-9]{64})\\s+\\*?${escapedName}$`, "mi").exec(bytes[0].toString("utf8"));
  if (entry?.[1].toLowerCase() !== archiveSha256 || !archiveExecutable(bytes[1], path.basename(binary)).equals(bytes[2])) {
    throw new Error("Cached Gitleaks executable does not match the authenticated archive");
  }
  if (run(binary, ["version"], { cwd: root }) !== VERSION) throw new Error("Cached Gitleaks version does not match the pinned version");
  return { binary, key, archiveSha256 };
}

function sanitized(findings, root) {
  return findings.map((finding) => ({
    ruleId: finding.RuleID,
    path: (() => {
      const candidate = String(finding.File ?? "");
      const resolved = path.resolve(root, candidate);
      const relative = path.relative(root, resolved);
      return relative.startsWith("..") || path.isAbsolute(relative) ? "<outside-root>" : relative.replaceAll("\\", "/");
    })(),
    commit: finding.Commit || null,
    startLine: finding.StartLine ?? null
  }));
}

function tomlLiteral(value) {
  if (value.includes("'''")) throw new Error("Gitleaks allowlist values cannot contain triple quotes");
  return `'''${value}'''`;
}

function configurationPath(root, projectPath, fallbackPath) {
  const projectConfig = path.join(root, projectPath);
  return existsSync(projectConfig) ? projectConfig : path.join(skillRoot, "config", fallbackPath);
}

async function gitStateDigest(root, args) {
  const digest = createHash("sha256");
  const child = spawn("git", args, { cwd: root, windowsHide: true, shell: false, stdio: ["ignore", "pipe", "ignore"], env: { ...process.env, GIT_NO_LAZY_FETCH: "1" } });
  let failure;
  child.on("error", (error) => { failure ??= error; });
  const closed = new Promise((resolve) => child.once("close", (status, signal) => resolve({ status, signal })));
  try {
    for await (const chunk of child.stdout) digest.update(chunk);
  } catch (error) {
    failure ??= error;
    child.stdout?.destroy();
    if (child.pid && child.exitCode === null && child.signalCode === null) child.kill();
  }
  const result = await closed;
  child.stdout?.destroy();
  if (failure || result.status !== 0) throw new Error(`Git ${args[0]} input inspection failed; output withheld`);
  return digest.digest("hex");
}

async function scanInputs(root) {
  const configuration = await renderScannerConfig(root);
  const probe = spawnSync("git", ["rev-parse", "--is-inside-work-tree"], {
    cwd: root, encoding: "utf8", windowsHide: true, shell: false, stdio: ["ignore", "pipe", "ignore"], env: { ...process.env, GIT_NO_LAZY_FETCH: "1" }
  });
  if (probe.error) throw new Error("Git is unavailable for scan input inspection");
  const inRepository = probe.status === 0 && probe.stdout.trim() === "true";
  const localRefsDigest = inRepository ? await gitStateDigest(root, ["for-each-ref", "--format=%(refname)%00%(objectname)%00%(objecttype)"]) : null;
  const indexDigest = inRepository ? await gitStateDigest(root, ["ls-files", "--stage", "-z"]) : null;
  const historyDigest = inRepository ? await gitStateDigest(root, [
    "rev-list", "--all", "--full-history", "--topo-order", "--parents", "--boundary", "--objects", "--no-object-names"
  ]) : null;
  const digest = createHash("sha256").update("audit-scan-input-v3\0").update(configuration.sha256).update("\0")
    .update(localRefsDigest ?? "not-a-git-worktree").update("\0").update(indexDigest ?? "").update("\0").update(historyDigest ?? "").update("\0");
  const excludedDirectories = new Set([".git", ".skills-orchestrator", "node_modules"]);
  async function walk(directory, relative = "") {
    const entries = (await readdir(directory, { withFileTypes: true })).sort((left, right) => left.name.localeCompare(right.name));
    for (const entry of entries) {
      const childRelative = path.join(relative, entry.name).replaceAll("\\", "/");
      if (entry.isDirectory() && excludedDirectories.has(entry.name)) continue;
      if (childRelative === "reports/gitleaks-scan.json") continue;
      const child = path.join(directory, entry.name);
      const details = await lstat(child);
      if (details.isSymbolicLink()) {
        throw new Error(`Gitleaks scan input cannot contain symbolic links: ${childRelative}`);
      } else if (details.isDirectory()) {
        await walk(child, childRelative);
      } else if (details.isFile()) {
        digest.update(childRelative).update("\0");
        digest.update("file\0");
        for await (const chunk of createReadStream(child)) digest.update(chunk);
        digest.update("\0");
      } else {
        digest.update(childRelative).update("\0");
        digest.update(`other:${details.mode}\0`);
      }
    }
  }
  await walk(root);
  return {
    scanInputDigest: digest.digest("hex"), configurationSha256: configuration.sha256,
    allowlistCount: configuration.allowlistCount, localRefsDigest, indexDigest, historyDigest
  };
}

async function renderScannerConfig(root) {
  const base = await readFile(configurationPath(root, ".gitleaks.toml", "gitleaks.toml"), "utf8");
  const policyPath = configurationPath(root, path.join("config", "gitleaks-allowlist.json"), "gitleaks-allowlist.json");
  let policy;
  try { policy = JSON.parse(await readFile(policyPath, "utf8")); } catch { throw new Error("Gitleaks allowlist policy is missing or invalid JSON"); }
  if (policy?.schemaVersion !== "1.0.0" || !Array.isArray(policy.entries)) throw new Error("Invalid Gitleaks allowlist policy");
  const sections = [];
  const ids = new Set();
  const broadPatterns = new Set([".*", "^.*$", "^.+$", "(?:^|/).*$"]);
  for (const entry of policy.entries) {
    const expiry = Date.parse(entry.expiresAt ?? "");
    const reviewedAt = Date.parse(entry.reviewedAt ?? "");
    if (!entry.id || !entry.description || !entry.owner || !entry.reviewedBy || !Number.isFinite(reviewedAt) || !Number.isFinite(expiry)) {
      throw new Error("Every Gitleaks allowlist requires ID, description, owner, reviewer, review date, and valid expiry");
    }
    if (ids.has(entry.id)) throw new Error(`Duplicate Gitleaks allowlist ID: ${entry.id}`);
    ids.add(entry.id);
    if (reviewedAt > Date.now() || expiry <= reviewedAt || expiry - reviewedAt > 366 * 24 * 60 * 60 * 1000) {
      throw new Error(`Gitleaks allowlist '${entry.id}' has an invalid review window`);
    }
    if (expiry <= Date.now()) throw new Error(`Gitleaks allowlist '${entry.id}' expired`);
    if (!entry.targetRules?.length || !entry.paths?.length || !entry.regexes?.length || !["match", "line"].includes(entry.regexTarget)) {
      throw new Error(`Gitleaks allowlist '${entry.id}' is not narrowly scoped`);
    }
    if (entry.paths.some((value) => broadPatterns.has(value) || !value.endsWith("$")) || entry.regexes.some((value) => broadPatterns.has(value) || !value.startsWith("^") || !value.endsWith("$"))) {
      throw new Error(`Gitleaks allowlist '${entry.id}' must use bounded path and regex patterns`);
    }
    sections.push([
      "[[allowlists]]",
      `description = ${tomlLiteral(`${entry.description}; owner=${entry.owner}; reviewedBy=${entry.reviewedBy}; reviewedAt=${entry.reviewedAt}; expires=${entry.expiresAt}`)}`,
      `targetRules = [${entry.targetRules.map(tomlLiteral).join(", ")}]`,
      'condition = "AND"',
      `regexTarget = ${tomlLiteral(entry.regexTarget)}`,
      `paths = [${entry.paths.map(tomlLiteral).join(", ")}]`,
      `regexes = [${entry.regexes.map(tomlLiteral).join(", ")}]`
    ].join("\n"));
  }
  const content = `${base.trimEnd()}\n\n${sections.join("\n\n")}\n`;
  return { content, sha256: sha256(Buffer.from(content)), allowlistCount: policy.entries.length };
}

function checkpoint(root) {
  const validator = path.join(scriptRoot, "audit-validate.mjs");
  let value;
  try { value = JSON.parse(run(process.execPath, [validator, "checkpoint", root], { cwd: root })); }
  catch { throw new Error("Audit checkpoint helper failed or returned invalid JSON; output withheld"); }
  if (value?.status !== "valid" || value.command !== "checkpoint"
    || !/^[a-f0-9]{40,64}$/.test(value?.repositoryRevision ?? "") || !/^[a-f0-9]{64}$/.test(value?.worktreeDigest ?? "")) {
    throw new Error("Audit checkpoint output is missing a valid revision or worktree digest (successful checkpoint status is required)");
  }
  return value;
}

async function readFindings(reportPath) {
  if (!existsSync(reportPath)) throw new Error("Gitleaks did not produce every required scan report");
  const details = await lstat(reportPath);
  if (!details.isFile() || details.isSymbolicLink() || details.nlink !== 1) throw new Error("Gitleaks scan reports must be regular files without links");
  let value;
  try { value = JSON.parse(await readFile(reportPath, "utf8")); } catch { throw new Error("Gitleaks produced invalid report JSON"); }
  if (!Array.isArray(value) || value.some((finding) => !finding || typeof finding.RuleID !== "string" || typeof finding.File !== "string")) {
    throw new Error("Gitleaks produced an invalid findings array");
  }
  return value;
}

async function scan(root, toolRoot, auditRunId, jsonOutput) {
  const { binary, key, archiveSha256 } = await cachedTool(toolRoot);
  const { directory } = toolPaths(toolRoot);
  const generated = await renderScannerConfig(root);
  const prefix = `scan-${randomUUID()}`;
  generated.config = path.join(directory, `${prefix}.gitleaks.toml`);
  const worktreeReport = path.join(directory, `${prefix}-worktree.json`);
  const stagedReport = path.join(directory, `${prefix}-staged.json`);
  const historyReport = path.join(directory, `${prefix}-history.json`);
  const common = ["--config", generated.config, "--report-format", "json", "--redact=100", "--exit-code", "0", "--no-banner", "--no-color", "--timeout", "300"];
  const owned = new Set();
  const recovery = new Set();
  const createOutput = async (file, content = "", owners = owned, flush = false) => {
    const handle = await open(file, "wx", 0o600);
    owners.add(file);
    try {
      await handle.writeFile(content, "utf8");
      if (flush) await handle.sync();
    }
    finally { await handle.close(); }
  };
  const requireRegular = async (file) => {
    const details = await lstat(file);
    if (!details.isFile() || details.isSymbolicLink() || details.nlink !== 1) throw new Error("Gitleaks certificate must be a regular file without links");
  };
  const code = (error) => /^[A-Z][A-Z0-9_]*$/.test(error?.code ?? "") ? error.code : "FAILED";
  let outcome;
  let summary;
  let output;
  let previous;
  let candidate;
  let candidateRelative;
  let reportBytes;
  let failure;
  let phase = "scan";
  try {
    await createOutput(generated.config, generated.content);
    for (const file of [worktreeReport, stagedReport, historyReport]) await createOutput(file);
    const before = checkpoint(root);
    const beforeInputs = await scanInputs(root);
    if (!beforeInputs.localRefsDigest || !beforeInputs.indexDigest || !beforeInputs.historyDigest || generated.sha256 !== beforeInputs.configurationSha256) {
      throw new Error("Scanner configuration or repository inputs changed before scanning");
    }
    run(binary, ["dir", root, ...common, "--report-path", worktreeReport], { cwd: root });
    run(binary, ["git", "--staged", root, ...common, "--report-path", stagedReport], { cwd: root });
    run(binary, ["git", root, "--log-opts=--all --full-history", ...common, "--report-path", historyReport], { cwd: root });
    const worktree = await readFindings(worktreeReport);
    const staged = await readFindings(stagedReport);
    const history = await readFindings(historyReport);
    const after = checkpoint(root);
    const afterInputs = await scanInputs(root);
    if (before.repositoryRevision !== after.repositoryRevision || before.worktreeDigest !== after.worktreeDigest || beforeInputs.scanInputDigest !== afterInputs.scanInputDigest) {
      throw new Error("Repository changed during Gitleaks scan; discard stale evidence and retry");
    }
    const report = {
      schemaVersion: "1.1.0",
      auditRunId,
      generatedAt: new Date().toISOString(),
      scanner: { name: "gitleaks", version: VERSION, releaseUrl: `${RELEASE}/`, platform: key, archiveSha256, checksumsSha256: CHECKSUMS_SHA256 },
      configurationSha256: generated.sha256,
      allowlistCount: generated.allowlistCount,
      repositoryRevision: after.repositoryRevision,
      worktreeDigest: after.worktreeDigest,
      scanInputDigest: afterInputs.scanInputDigest,
      scopes: ["worktree", "staged", "untracked-distributable", "tracked-reports", "all-local-refs", "reachable-history"],
      commands: [
        { scope: "worktree", command: "gitleaks dir <repository> --redact=100 --report-format=json", exitCode: 0 },
        { scope: "staged", command: "gitleaks git --staged <repository> --redact=100 --report-format=json", exitCode: 0 },
        { scope: "history", command: "gitleaks git <repository> --log-opts='--all --full-history' --redact=100 --report-format=json", exitCode: 0 }
      ],
      status: worktree.length || staged.length || history.length ? "failed" : "passed",
      findings: {
        worktree: sanitized(worktree, root),
        staged: sanitized(staged, root),
        history: sanitized(history, root)
      },
      limitations: [
        "Remote-only refs and unreachable or pruned objects were not scanned.",
        "The newly issued reports/gitleaks-scan.json is a certificate output, not an input scanned before its publication; retain the exact SHA256 receipt."
      ]
    };
    phase = "candidate-prepare";
    output = await assertSafeRelativePath(root, "reports/gitleaks-scan.json");
    await mkdir(path.dirname(output), { recursive: true });
    if (existsSync(output)) {
      await requireRegular(output);
      previous = await readFile(output);
    } else {
      previous = null;
    }
    reportBytes = Buffer.from(`${JSON.stringify(report, null, 2)}\n`);
    candidateRelative = `reports/.gitleaks-${prefix}.candidate.json`;
    candidate = await assertSafeRelativePath(root, candidateRelative);
    phase = "candidate-write";
    await createOutput(candidate, reportBytes, recovery, true);
    phase = "candidate-verify";
    await requireRegular(candidate);
    if (!(await readFile(candidate)).equals(reportBytes)) {
      throw new Error("Gitleaks candidate failed byte verification");
    }
    outcome = {
      status: report.status, command: "scan", auditRunId,
      certificate: { path: "reports/gitleaks-scan.json", sha256: sha256(reportBytes) }
    };
    summary = report.status === "failed"
      ? `Gitleaks found ${worktree.length} worktree, ${staged.length} staged, and ${history.length} reachable-history finding(s); values are fully redacted.`
      : `Gitleaks ${VERSION} passed: worktree, staged index, reports, all local refs, and reachable history scanned.`;
  } catch (error) {
    failure = error;
  }
  const cleanup = await Promise.allSettled([...owned].map(async (file) => rm(file, { force: true })));
  const cleanupFailures = cleanup.filter((result) => result.status === "rejected").map((result) => code(result.reason));
  if (failure || cleanupFailures.length) {
    if (failure && !recovery.size && !cleanupFailures.length) throw failure;
    const details = [
      ...(failure ? [`${phase} (${code(failure)})`] : []),
      ...cleanupFailures.map((value) => `owned-output cleanup (${value})`)
    ].join("; ");
    const retained = recovery.size ? `; uncommitted candidate retained at ${candidateRelative}` : "; no candidate was created";
    throw new Error(`Gitleaks publication failed before commit: ${details}; canonical certificate unchanged${retained}. Resolve retained evidence before an explicit retry.`);
  }
  try {
    await assertSafeRelativePath(root, candidateRelative);
    await requireRegular(candidate);
    if (!(await readFile(candidate)).equals(reportBytes)) throw new Error("Candidate changed before commit");
    await assertSafeRelativePath(root, "reports/gitleaks-scan.json");
    if (existsSync(output)) {
      await requireRegular(output);
      if (previous === null || !(await readFile(output)).equals(previous)) throw new Error("Canonical certificate changed before commit");
    } else if (previous !== null) {
      throw new Error("Canonical certificate disappeared before commit");
    }
    // The same-directory rename is the commit point; no fallible file cleanup follows it.
    await rename(candidate, output);
  } catch (error) {
    throw new Error(`Gitleaks publication commit failed (${code(error)}); canonical certificate unchanged; uncommitted candidate retained at ${candidateRelative}. Resolve retained evidence before an explicit retry.`);
  }
  if (outcome.status === "failed") {
    console.error(summary);
    process.exitCode = 1;
  } else if (!jsonOutput) console.log(summary);
  if (jsonOutput) console.log(JSON.stringify(outcome));
}

function option(args, name, fallback) {
  const index = args.indexOf(name);
  if (index < 0) return fallback;
  if (!args[index + 1]) throw new Error(`${name} requires a path`);
  return path.resolve(args[index + 1]);
}

function valueOption(args, name, fallback) {
  const index = args.indexOf(name);
  if (index < 0) return fallback;
  if (!args[index + 1]) throw new Error(`${name} requires a value`);
  return args[index + 1];
}

function resolveAuditRunId(args) {
  const value = valueOption(args, "--audit-run-id", randomUUID());
  if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value)) throw new Error("--audit-run-id must be a UUID");
  return value;
}

const [command, ...args] = process.argv.slice(2);
if (command === "metadata") {
  console.log(JSON.stringify(metadata()));
} else if (command === "digest") {
  const root = option(args, "--root", frameworkRoot);
  console.log(JSON.stringify(await scanInputs(root)));
} else if (command === "install" || command === "scan") {
  const root = option(args, "--root", frameworkRoot);
  const toolRoot = option(args, "--tool-root", frameworkRoot);
  if (command === "install") console.log(JSON.stringify(await install(toolRoot)));
  else await scan(root, toolRoot, resolveAuditRunId(args), args.includes("--json"));
} else {
  throw new Error("Use metadata|digest|install|scan [--root PATH] [--tool-root PATH] [--audit-run-id UUID]; scan is cache-only and supports --offline --json");
}