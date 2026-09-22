import { spawn, spawnSync } from "node:child_process";
import { existsSync, lstatSync } from "node:fs";
import { lstat, readdir } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { inflateRawSync } from "node:zlib";
import { digest, DeploymentError, rejectSecrets, safeError, stop } from "../contracts.mjs";
import { checkedPath, immutableFile, makeDirectory, projectRoot, readBytes, relativePath } from "../files.mjs";

const bridge = path.join(path.dirname(fileURLToPath(import.meta.url)), "enterprise-cli.ps1");
const maxOutput = 1_048_576;
const maxArchive = 33_554_432;
const maxExpanded = 67_108_864;
const unsafeArgument = /[^a-zA-Z0-9._:/\\ -]/;
const guid = /^[a-f0-9]{8}-(?:[a-f0-9]{4}-){3}[a-f0-9]{12}$/i;
const versionPattern = /^[0-9]+\.[0-9]+\.[0-9]+(?:[-+][a-zA-Z0-9.-]+)?$/;
const privatePath = /(?:^|\/)(?:\.git|\.ssh|\.azure|\.aws|\.env(?:\.[^/]*)?|\.npmrc|\.pypirc|\.netrc|credentials(?:\.json)?|node_modules)(?:\/|$)|\.(?:pem|pfx|p12|key)$/i;
const shapes = {
  pac: [
    ["--version"], ["auth", "who"], ["auth", "list"],
    ["copilot", "pack", "--publisher-prefix", "*", "--project-dir", "*", "--output-path", "*", "--solution-name", "*"],
    ["solution", "import", "--path", "*", "--environment", "*"],
    ["solution", "import", "--path", "*", "--environment", "*", "--settings-file", "*"],
    ["copilot", "publish", "--bot", "*", "--environment", "*"],
    ["copilot", "status", "--bot-id", "*", "--environment", "*"],
    ["solution", "export", "--name", "*", "--environment", "*", "--managed", "--path", "*"]
  ],
  atk: [
    ["--version"], ["auth", "list"], ["launchinfo", "--manifest-id", "*"],
    ["provision", "--env", "*", "--folder", "*", "--ignore-env-file", "-i", "false"],
    ["deploy", "--env", "*", "--folder", "*", "--config-file-path", "*", "--ignore-env-file", "-i", "false"],
    ...["package", "publish", "update"].map((operation) => [
      operation, "--env", "*", ...(operation === "package" ? ["--manifest-file", "*"] : ["--package-file", "*"]),
      "--output-folder", "*", "--output-package-file", "*", "--folder", "*", "-i", "false"
    ])
  ]
};

export const shaSchema = { type: "string", pattern: "^[a-f0-9]{64}$" };
export const pathSchema = { type: "string", minLength: 1, maxLength: 512, pattern: "^[a-zA-Z0-9._ /\\\\-]+$" };
export const fileSchema = {
  type: "object", additionalProperties: false, required: ["path", "sha256"],
  properties: { path: pathSchema, sha256: shaSchema }
};
export const filesSchema = { type: "array", minItems: 1, maxItems: 2048, uniqueItems: true, items: fileSchema };
export const cliVersionSchema = { type: "string", maxLength: 128, pattern: versionPattern.source };
export const guidSchema = { type: "string", pattern: "^[a-fA-F0-9]{8}-(?:[a-fA-F0-9]{4}-){3}[a-fA-F0-9]{12}$" };
export const identitySchema = {
  type: "object", additionalProperties: false, required: ["sha256"],
  properties: { sha256: shaSchema }
};
export const zipNameSchema = { type: "string", maxLength: 100, pattern: "^[a-zA-Z0-9][a-zA-Z0-9._-]*\\.zip$" };

export function guardedProvider(provider) {
  return Object.fromEntries(["probe", "execute", "verify", "rollback"].map((name) => [name, async (...args) => {
    try { return await provider[name](...args); }
    catch (error) { throw safeError(error); }
  }]));
}

function commandShape(tool, args) {
  if (!Object.hasOwn(shapes, tool) || !Array.isArray(args) || args.length > 20 || args.some((value) => typeof value !== "string")) {
    stop("CLI_OPERATION_REJECTED", "Only reviewed PAC and Toolkit operations are executable.");
  }
  if (args.some((value) => !value || value.length > 2048 || unsafeArgument.test(value))) {
    stop("CLI_ARGUMENT_REJECTED", "CLI arguments contain unsupported characters or exceed their boundary.");
  }
  if (!shapes[tool].some((shape) => shape.length === args.length && shape.every((value, index) => value === "*" ? !args[index].startsWith("-") : value === args[index]))) {
    stop("CLI_OPERATION_REJECTED", "Only fixed reviewed CLI flags and operations are executable.");
  }
}

function regularLauncher(candidate, systemBinary = false) {
  if (!path.isAbsolute(candidate) || unsafeArgument.test(candidate)) stop("CLI_LAUNCHER_PATH", "An installed trusted launcher with an unambiguous path is required.");
  let current = path.parse(candidate).root;
  for (const part of path.relative(current, candidate).split(path.sep)) {
    current = path.join(current, part);
    const stat = lstatSync(current);
    if (stat.isSymbolicLink()) stop("CLI_LAUNCHER_PATH", "Linked launchers or launcher ancestors are not trusted.");
  }
  const stat = lstatSync(candidate);
  // Windows system binaries legitimately have servicing hard links in WinSxS.
  if (!stat.isFile() || (!systemBinary && stat.nlink !== 1)) stop("CLI_LAUNCHER_PATH", "A regular installed CLI launcher is required.");
  return candidate;
}

function resolveLauncher(tool, env) {
  const pathKey = Object.keys(env).find((key) => key.toUpperCase() === "PATH");
  const names = process.platform === "win32" ? [`${tool}.exe`, `${tool}.cmd`] : [tool];
  for (const raw of String(env[pathKey] ?? "").split(path.delimiter)) {
    const directory = raw.replace(/^"|"$/g, "");
    if (!path.isAbsolute(directory)) continue;
    for (const name of names) {
      const candidate = path.join(directory, name);
      if (existsSync(candidate)) {
        try { return regularLauncher(candidate); }
        catch (error) {
          if (error instanceof DeploymentError) throw error;
          stop("CLI_LAUNCHER_PATH", "Installed CLI launcher inspection failed.");
        }
      }
    }
  }
  stop("CLI_REQUIRED", "Install and authenticate the reviewed vendor CLI outside this operation; no installation or login was attempted.");
}

function cleanEnvironment(env, cwd) {
  const allowed = /^(?:PATH|PATHEXT|SYSTEMDRIVE|PROGRAMFILES(?:\(X86\))?|COMMONPROGRAMFILES(?:\(X86\))?|PROCESSOR_ARCHITECTURE|USERPROFILE|APPDATA|LOCALAPPDATA|HOME)$/i;
  const result = {};
  for (const [key, value] of Object.entries(env)) {
    if (allowed.test(key) && value !== undefined && !Object.keys(result).some((existing) => existing.toUpperCase() === key.toUpperCase())) result[key] = value;
  }
  if (process.platform === "win32") {
    const systemRoot = process.env.SystemRoot ?? process.env.SYSTEMROOT;
    Object.assign(result, { SystemRoot: systemRoot, WINDIR: systemRoot, COMSPEC: path.join(systemRoot, "System32", "cmd.exe") });
  }
  // Do not inherit NODE_OPTIONS, arbitrary lifecycle variables, or token environment variables.
  return { ...result, TEMP: cwd, TMP: cwd, CI: "true", NO_COLOR: "1", TERM: "dumb" };
}

export function buildEnterpriseCliInvocation(tool, args, options = {}, dependencies = {}) {
  commandShape(tool, args);
  const env = dependencies.env ?? process.env;
  const cwd = options.cwd;
  if (typeof cwd !== "string" || !path.isAbsolute(cwd) || unsafeArgument.test(cwd)) {
    stop("CLI_WORKSPACE", "A checked absolute target workspace is required.");
  }
  const launcher = resolveLauncher(tool, env);
  if (process.platform !== "win32") return { command: launcher, args: [...args], env: cleanEnvironment(env, cwd), cwd };
  const systemRoot = process.env.SystemRoot ?? process.env.SYSTEMROOT;
  if (!systemRoot || !path.isAbsolute(systemRoot)) stop("POWERSHELL_REQUIRED", "System Windows PowerShell is required; no installation was attempted.");
  const powershell = regularLauncher(path.join(systemRoot, "System32", "WindowsPowerShell", "v1.0", "powershell.exe"), true);
  regularLauncher(bridge);
  return {
    command: powershell,
    args: ["-NoLogo", "-NoProfile", "-NonInteractive", "-File", bridge, "-Tool", tool,
      "-LauncherPath", launcher, "-ArgumentsBase64", Buffer.from(JSON.stringify(args)).toString("base64")],
    env: cleanEnvironment(env, cwd), cwd
  };
}

export async function runEnterpriseCli(tool, args, options = {}, dependencies = {}) {
  const invocation = buildEnterpriseCliInvocation(tool, args, options, dependencies);
  const timeoutMs = options.timeoutMs ?? 30_000;
  if (!Number.isSafeInteger(timeoutMs) || timeoutMs < 100 || timeoutMs > 300_000) stop("CLI_TIMEOUT_BOUNDARY", "CLI timeout must remain within the fixed execution limit.");
  const launch = dependencies.spawn ?? spawn;
  return new Promise((resolve, reject) => {
    let child;
    let done = false;
    let timer;
    let outputSize = 0;
    const stdout = [];
    const stderr = [];
    const fail = (code) => {
      if (done) return;
      done = true;
      clearTimeout(timer);
      if (child?.pid && child.exitCode === null && child.signalCode === null) {
        if (process.platform === "win32") {
          // Kill only this child and its descendants, including the .cmd child of the bridge.
          const systemRoot = process.env.SystemRoot ?? process.env.SYSTEMROOT;
          spawnSync(path.join(systemRoot, "System32", "taskkill.exe"), ["/PID", String(child.pid), "/T", "/F"], {
            shell: false, windowsHide: true, timeout: 5000, stdio: "ignore"
          });
        }
        child.kill();
        child.stdout?.destroy();
        child.stderr?.destroy();
      }
      reject(new DeploymentError(code, "CLI execution failed, timed out, or exceeded its output bound; details redacted. Reconcile the operation before any retry."));
    };
    try {
      child = launch(invocation.command, invocation.args, {
        cwd: invocation.cwd, env: invocation.env, shell: false, windowsHide: true,
        stdio: ["ignore", "pipe", "pipe"]
      });
    } catch { fail("CLI_EXECUTION_UNCERTAIN"); return; }
    timer = setTimeout(() => fail("CLI_TIMEOUT"), timeoutMs);
    for (const [stream, chunks] of [[child.stdout, stdout], [child.stderr, stderr]]) {
      stream.on("data", (value) => {
        const bytes = Buffer.from(value);
        outputSize += bytes.length;
        if (outputSize > maxOutput) { fail("CLI_OUTPUT_LIMIT"); return; }
        chunks.push(bytes);
      });
      stream.on("error", () => fail("CLI_EXECUTION_UNCERTAIN"));
    }
    child.on("error", () => fail("CLI_EXECUTION_UNCERTAIN"));
    child.on("close", (exitCode, signal) => {
      if (done) return;
      if (exitCode !== 0 || signal) { fail("CLI_EXECUTION_UNCERTAIN"); return; }
      done = true;
      clearTimeout(timer);
      resolve({ exitCode, stdout: Buffer.concat(stdout).toString("utf8"), stderr: Buffer.concat(stderr).toString("utf8") });
    });
  });
}

export async function invokeCli(tool, args, options, dependencies) {
  commandShape(tool, args);
  let result;
  try { result = await (dependencies.runCli ?? runEnterpriseCli)(tool, args, options, dependencies.cli ?? {}); }
  catch (error) {
    if (error instanceof DeploymentError) throw error;
    stop("CLI_EXECUTION_UNCERTAIN", "The CLI operation could not be completed; reconcile before retrying. Details redacted.");
  }
  if (!result || result.exitCode !== 0 || typeof result.stdout !== "string" || typeof result.stderr !== "string"
      || Buffer.byteLength(result.stdout) + Buffer.byteLength(result.stderr) > maxOutput) {
    stop("CLI_EXECUTION_UNCERTAIN", "The CLI rejected the operation or returned unbounded evidence; reconcile before retrying. Details redacted.");
  }
  return { stdout: result.stdout, stderr: result.stderr };
}

function normalizedEvidence(value) {
  if (typeof value !== "string" || Buffer.byteLength(value) > maxOutput || /\u0000/.test(value)) stop("CLI_EVIDENCE_INVALID", "CLI evidence is absent or unsupported; review the authenticated session outside this operation.");
  return value.replace(/\u001b\[[0-9;]*m/g, "").replaceAll("\r\n", "\n").replaceAll("\r", "\n")
    .split("\n").map((line) => line.trimEnd()).join("\n").trim();
}

export function identityEvidenceDigest(tool, binding, observations) {
  if (!["pac", "atk"].includes(tool) || !guid.test(binding?.tenantId ?? "") || binding.cloud !== "AzureCloud"
      || typeof binding.environment !== "string" || !["individual", "tenant", "private"].includes(binding.audience)) {
    stop("IDENTITY_EVIDENCE_INVALID", "Explicit reviewed Commercial tenant, environment and audience evidence is required.");
  }
  const evidence = {};
  for (const name of tool === "pac" ? ["who", "list"] : ["list"]) {
    const value = observations?.[name];
    const stdout = normalizedEvidence(value?.stdout);
    const stderr = normalizedEvidence(value?.stderr);
    if (!stdout) stop("IDENTITY_EVIDENCE_INVALID", "CLI authentication evidence is empty; authenticate and review it outside this operation.");
    evidence[name] = { stdout, stderr };
  }
  // No localized tenant parsing and no guessed removal of timestamp-bearing identity lines.
  // Operators review these complete normalized observations bound to the explicit target.
  return digest({ tool, binding, evidence });
}

export async function cliPreflight(tool, config, context, cwd, dependencies, offline = false) {
  const result = await invokeCli(tool, ["--version"], { cwd, timeoutMs: 30_000 }, dependencies);
  const text = normalizedEvidence(result.stdout);
  const match = /^(?:(?:Microsoft PowerPlatform CLI|Microsoft 365 Agents Toolkit(?: CLI)?)\s*\n)?(?:Version:\s*)?([0-9]+\.[0-9]+\.[0-9]+(?:[-+][a-zA-Z0-9.-]+)?)$/i.exec(text);
  if (!match || match[1] !== config.expectedCliVersion) stop("CLI_VERSION_MISMATCH", "The installed CLI version does not exactly match the reviewed version; no update was attempted.");
  if (offline) return { cliVersion: match[1], identitySha256: digest({ tool, authentication: "not-required" }) };
  const observations = {};
  for (const name of tool === "pac" ? ["who", "list"] : ["list"]) observations[name] = await invokeCli(tool, ["auth", name], { cwd, timeoutMs: 30_000 }, dependencies);
  const identitySha256 = identityEvidenceDigest(tool, {
    tenantId: context.profile.subscription.tenantId, environment: config.environment,
    audience: context.request.audience, cloud: context.request.cloud
  }, observations);
  if (identitySha256 !== config.identityEvidence.sha256) {
    stop("CLI_IDENTITY_MISMATCH", "Current CLI authentication evidence differs from the operator-reviewed tenant and target binding. Re-review the session; no login or profile selection was attempted.");
  }
  return { cliVersion: match[1], identitySha256 };
}

export async function checkedContext(context, dependencies, tool, offline) {
  const expectedTarget = tool === "pac" ? "copilot-studio" : "microsoft-365-agents-toolkit";
  if (context.request?.target !== expectedTarget || !["individual", "tenant", "private"].includes(context.request?.audience)) {
    stop("PLATFORM_TARGET_MISMATCH", "The reviewed platform and audience do not match this adapter.");
  }
  if (!["none", "AzureCloud"].includes(context.request.cloud) || (!offline && (context.request.cloud !== "AzureCloud" || context.profile?.cloud !== "AzureCloud"))) {
    stop("CLOUD_UNVERIFIED", "Only explicitly reviewed Commercial platform routing is supported; Government and inferred routing are blocked.");
  }
  if (!offline && !guid.test(context.profile?.subscription?.tenantId ?? "")) {
    stop("CLI_TENANT_REQUIRED", "The target profile must identify the tenant used for the operator-reviewed identity evidence binding; no account switching was attempted.");
  }
  const root = await projectRoot(context.root, dependencies);
  if ((context.workDirectory === undefined || context.workDirectory === null) && !/^[a-f0-9]{64}$/.test(context.packageSha256 ?? "")) {
    stop("WORKSPACE_REQUIRED", "Provide a checked workspace or a reviewed package digest for an owned platform run path.");
  }
  const workDirectory = relativePath(context.workDirectory ?? `reports/agent-deployment/platform-work/${tool}/${context.packageSha256}`);
  const work = await checkedPath(root, workDirectory, { directory: true });
  return { ...context, root, workDirectory, work };
}

export function isWithin(parent, child) {
  const relative = path.relative(parent, child);
  return relative === "" || (!relative.startsWith(`..${path.sep}`) && relative !== ".." && !path.isAbsolute(relative));
}

export function rejectPrivateFile(relative) {
  if (privatePath.test(relative.replaceAll("\\", "/"))) stop("PRIVATE_INPUT_REJECTED", "Credential files, environment files, repository metadata and dependency-install directories are not approved deployment inputs.");
}

export function inspectContent(relative, bytes) {
  rejectPrivateFile(relative);
  if (/\.(?:json|ya?ml|xml|txt|md|js|mjs|cjs|ts|ps1|sh|cmd|bat|bicep|config|properties|ini|env|http|html|css)$/i.test(relative) || !bytes.includes(0)) {
    const text = bytes.toString("utf8");
    rejectSecrets(text);
    if (/\.json$/i.test(relative)) {
      let parsed;
      try { parsed = JSON.parse(text); } catch { stop("INPUT_INVALID", "A reviewed JSON input is invalid."); }
      rejectSecrets(parsed);
    }
  }
}

export async function reviewedFile(root, reference, maximum = maxArchive) {
  relativePath(reference.path);
  rejectPrivateFile(reference.path);
  const bytes = await readBytes(root, reference.path, { maximum });
  if (digest(bytes) !== reference.sha256) stop("INPUT_DRIFT", "Reviewed platform input bytes have changed.");
  inspectContent(reference.path, bytes);
  return bytes;
}

export async function sourceTree(context, directory, references) {
  const normalized = relativePath(directory);
  const absolute = await checkedPath(context.root, normalized, { directory: true });
  if (isWithin(absolute, context.work) || isWithin(context.work, absolute)) stop("WORKSPACE_OVERLAP", "Reviewed source and generated workspace must be disjoint.");
  const expected = new Map();
  for (const ref of references) {
    const name = relativePath(ref.path);
    const absoluteFile = await checkedPath(context.root, name);
    if (!isWithin(absolute, absoluteFile) || absoluteFile === absolute || expected.has(name.toLowerCase())) stop("SOURCE_TREE_INVALID", "Every source file must be unique and contained in the reviewed source directory.");
    expected.set(name.toLowerCase(), ref);
  }
  const actual = [];
  async function visit(relative) {
    const current = await checkedPath(context.root, relative, { directory: true });
    let entries;
    try { entries = await readdir(current, { withFileTypes: true }); }
    catch { stop("SOURCE_TREE_MISSING", "The reviewed source directory is missing or unreadable."); }
    for (const entry of entries) {
      const name = `${relative}/${entry.name}`;
      relativePath(name);
      rejectPrivateFile(name);
      if (entry.isSymbolicLink()) stop("SYMLINK_REJECTED", "Linked deployment sources are prohibited.");
      if (entry.isDirectory()) {
        if (![...expected.keys()].some((file) => file.startsWith(`${name.toLowerCase()}/`))) stop("SOURCE_TREE_DRIFT", "An unreviewed directory appeared in the frozen source tree.");
        await visit(name);
      }
      else if (entry.isFile()) actual.push(name);
      else stop("SOURCE_TREE_INVALID", "Deployment sources must be regular reviewed files.");
      if (actual.length > 2048) stop("SOURCE_TREE_LIMIT", "The reviewed source tree exceeds its bounded file limit.");
    }
  }
  await visit(normalized);
  if (actual.length !== expected.size || actual.some((name) => !expected.has(name.toLowerCase()))) stop("SOURCE_TREE_DRIFT", "The reviewed source file set has changed; freeze and review every consumed file.");
  const files = new Map();
  let total = 0;
  for (const name of actual.sort()) {
    const bytes = await reviewedFile(context.root, expected.get(name.toLowerCase()));
    total += bytes.length;
    if (total > maxExpanded) stop("SOURCE_TREE_LIMIT", "The reviewed source tree exceeds its bounded byte limit.");
    files.set(name, bytes);
  }
  return { directory: normalized, files, sha256: digest([...files].map(([name, bytes]) => ({ path: name, sha256: digest(bytes) }))) };
}

export async function stageSource(context, tree, tool) {
  const folder = `${context.workDirectory}/${tool}-source`;
  await makeDirectory(context.root, folder);
  for (const [name, bytes] of tree.files) {
    const relative = path.posix.relative(tree.directory, name);
    await immutableFile(context.root, `${folder}/${relative}`, bytes);
  }
  const refs = [...tree.files].map(([name, bytes]) => ({
    path: `${folder}/${path.posix.relative(tree.directory, name)}`, sha256: digest(bytes)
  }));
  const result = await verifyStaged(context, folder, refs);
  return { folder, absolute: result, references: refs };
}

export async function verifyStaged(context, folder, refs) {
  const absolute = await checkedPath(context.root, folder, { directory: true });
  const expected = new Set(refs.map((ref) => relativePath(ref.path).toLowerCase()));
  let count = 0;
  async function visit(relative) {
    for (const entry of await readdir(await checkedPath(context.root, relative, { directory: true }), { withFileTypes: true })) {
      const name = relativePath(`${relative}/${entry.name}`);
      if (entry.isSymbolicLink()) stop("SYMLINK_REJECTED", "Linked staged sources are prohibited.");
      if (entry.isDirectory()) {
        if (![...expected].some((file) => file.startsWith(`${name.toLowerCase()}/`))) stop("SOURCE_TREE_DRIFT", "An unreviewed directory appeared in isolated staging.");
        await visit(name);
      }
      else if (!entry.isFile() || !expected.has(name.toLowerCase())) stop("SOURCE_TREE_DRIFT", "The isolated staging file set differs from reviewed bytes.");
      else count++;
    }
  }
  await visit(folder);
  if (count !== refs.length) stop("SOURCE_TREE_DRIFT", "The isolated staging file set differs from reviewed bytes.");
  for (const ref of refs) await reviewedFile(context.root, ref);
  return absolute;
}

export async function outputPath(context, relative, { fresh = false, directory = false } = {}) {
  const result = await checkedPath(context.root, relative, { directory });
  if (result === context.work || !isWithin(context.work, result)) stop("OUTPUT_BOUNDARY", "Generated artifacts must remain in a child of the checked run workspace.");
  if (fresh) {
    try { await lstat(result); }
    catch (error) {
      if (error.code === "ENOENT") return result;
      throw error;
    }
    stop("OUTPUT_EXISTS", "The reviewed output already exists; use a new reviewed run path rather than overwriting it.");
  }
  return result;
}

function crc32(bytes) {
  let crc = 0xffffffff;
  for (const byte of bytes) {
    crc ^= byte;
    for (let bit = 0; bit < 8; bit++) crc = (crc >>> 1) ^ ((crc & 1) ? 0xedb88320 : 0);
  }
  return (crc ^ 0xffffffff) >>> 0;
}

export function inspectZip(bytes) {
  function invalid() { stop("ZIP_INVALID", "The solution or application ZIP is empty, malformed, unsupported, or exceeds integrity bounds."); }
  function extraFields(from, length) {
    const until = from + length;
    for (let cursor = from; cursor < until;) {
      if (cursor + 4 > until) invalid();
      const kind = bytes.readUInt16LE(cursor);
      const size = bytes.readUInt16LE(cursor + 2);
      // Timestamp and Unix UID metadata cannot override the reviewed entry path.
      if (![0x000a, 0x5455, 0x7875].includes(kind) || cursor + 4 + size > until) invalid();
      cursor += 4 + size;
    }
  }
  try {
    if (!Buffer.isBuffer(bytes) || bytes.length < 22 || bytes.length > maxArchive) invalid();
    let end = -1;
    for (let offset = bytes.length - 22; offset >= Math.max(0, bytes.length - 65_557); offset--) {
      if (bytes.readUInt32LE(offset) === 0x06054b50 && offset + 22 + bytes.readUInt16LE(offset + 20) === bytes.length) { end = offset; break; }
    }
    if (end < 0 || bytes.readUInt16LE(end + 4) || bytes.readUInt16LE(end + 6)) invalid();
    const count = bytes.readUInt16LE(end + 10);
    const size = bytes.readUInt32LE(end + 12);
    const start = bytes.readUInt32LE(end + 16);
    if (!count || count > 2048 || bytes.readUInt16LE(end + 8) !== count || start + size !== end) invalid();
    const files = new Map();
    const names = new Set();
    const ranges = [];
    let cursor = start;
    let total = 0;
    for (let index = 0; index < count; index++) {
      if (cursor + 46 > end || bytes.readUInt32LE(cursor) !== 0x02014b50) invalid();
      const flags = bytes.readUInt16LE(cursor + 8);
      const method = bytes.readUInt16LE(cursor + 10);
      const checksum = bytes.readUInt32LE(cursor + 16);
      const compressed = bytes.readUInt32LE(cursor + 20);
      const expanded = bytes.readUInt32LE(cursor + 24);
      const nameLength = bytes.readUInt16LE(cursor + 28);
      const extraLength = bytes.readUInt16LE(cursor + 30);
      const commentLength = bytes.readUInt16LE(cursor + 32);
      const attributes = bytes.readUInt32LE(cursor + 38);
      const local = bytes.readUInt32LE(cursor + 42);
      const next = cursor + 46 + nameLength + extraLength + commentLength;
      const fileType = (attributes >>> 16) & 0xf000;
      if (next > end || flags & ~0x080e || (method === 0 && (flags & 6)) || ![0, 8].includes(method) || bytes.readUInt16LE(cursor + 34)
          || compressed === 0xffffffff || expanded > 16_777_216 || ![0, 0x4000, 0x8000].includes(fileType)
          || (attributes & 0x0440)) invalid();
      const rawName = bytes.subarray(cursor + 46, cursor + 46 + nameLength);
      const name = rawName.toString("utf8");
      if (!name || !/^[a-zA-Z0-9._/ \[\]-]+$/.test(name) || name.startsWith("/") || name.includes("//")
          || name.split("/").some((part, i, parts) => (part === "" && i !== parts.length - 1) || [".", ".."].includes(part)
            || /[. ]$/.test(part) || /^(?:con|prn|aux|nul|com[0-9]|lpt[0-9])(?:\.|$)/i.test(part))
          || names.has(name.toLowerCase())) invalid();
      names.add(name.toLowerCase());
      rejectPrivateFile(name);
      extraFields(cursor + 46 + nameLength, extraLength);
      if (local + 30 > start || bytes.readUInt32LE(local) !== 0x04034b50 || bytes.readUInt16LE(local + 6) !== flags || bytes.readUInt16LE(local + 8) !== method) invalid();
      const localNameLength = bytes.readUInt16LE(local + 26);
      const localExtraLength = bytes.readUInt16LE(local + 28);
      const data = local + 30 + localNameLength + localExtraLength;
      if (!rawName.equals(bytes.subarray(local + 30, local + 30 + localNameLength)) || data + compressed > start) invalid();
      extraFields(local + 30 + localNameLength, localExtraLength);
      if (!(flags & 8) && (bytes.readUInt32LE(local + 14) !== checksum || bytes.readUInt32LE(local + 18) !== compressed || bytes.readUInt32LE(local + 22) !== expanded)) invalid();
      let endOfEntry = data + compressed;
      if (flags & 8) {
        const descriptor = bytes.readUInt32LE(endOfEntry) === 0x08074b50 ? endOfEntry + 4 : endOfEntry;
        if (descriptor + 12 > start || bytes.readUInt32LE(descriptor) !== checksum || bytes.readUInt32LE(descriptor + 4) !== compressed || bytes.readUInt32LE(descriptor + 8) !== expanded) invalid();
        endOfEntry = descriptor + 12;
      }
      if (ranges.some(([from, to]) => local < to && endOfEntry > from)) invalid();
      ranges.push([local, endOfEntry]);
      total += expanded;
      if (total > maxExpanded) invalid();
      const compressedBytes = bytes.subarray(data, data + compressed);
      const inflated = method === 8 ? inflateRawSync(compressedBytes, { maxOutputLength: Math.max(expanded, 1), info: true }) : null;
      if (inflated && inflated.engine.bytesWritten !== compressed) invalid();
      const content = inflated ? inflated.buffer : compressedBytes;
      if (content.length !== expanded || crc32(content) !== checksum) invalid();
      if (name.endsWith("/")) { if (expanded) invalid(); }
      else { inspectContent(name, content); files.set(name, content); }
      cursor = next;
    }
    ranges.sort((a, b) => a[0] - b[0]);
    if (cursor !== end || !files.size || ranges[0][0] !== 0 || ranges.at(-1)[1] !== start || ranges.some((range, i) => i && ranges[i - 1][1] !== range[0])) invalid();
    return { files, sha256: digest(bytes) };
  } catch (error) {
    if (error instanceof DeploymentError) throw error;
    invalid();
  }
}
