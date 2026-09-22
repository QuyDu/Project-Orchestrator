import { constants } from "node:fs";
import { lstat, mkdir, open, readFile, readdir, realpath, rename, rm } from "node:fs/promises";
import { randomUUID } from "node:crypto";
import path from "node:path";
import { frameworkRoot, jsonBytes, stop } from "./contracts.mjs";

const noFollow = constants.O_NOFOLLOW ?? 0;
const reserved = /^(?:con|prn|aux|nul|com[0-9]|lpt[0-9])(?:\.|$)/i;

function within(parent, child) {
  const relative = path.relative(parent, child);
  return relative === "" || (!relative.startsWith(`..${path.sep}`) && relative !== ".." && !path.isAbsolute(relative));
}

export function relativePath(value) {
  if (typeof value !== "string" || value.length < 1 || value.length > 512 || !/^[a-zA-Z0-9._ /\\-]+$/.test(value) || path.isAbsolute(value) || /^[\\/]/.test(value)) {
    stop("UNSAFE_PATH", "Use a safe target-project-relative path.");
  }
  const segments = value.replaceAll("\\", "/").split("/");
  if (segments.some((segment) => !segment || [".", ".."].includes(segment) || /[. ]$/.test(segment) || reserved.test(segment))) {
    stop("UNSAFE_PATH", "Path traversal, device names, and ambiguous path segments are prohibited.");
  }
  return segments.join("/");
}

async function checkAncestors(absolute) {
  const volume = path.parse(absolute).root;
  let current = volume;
  for (const segment of path.relative(volume, absolute).split(path.sep).filter(Boolean)) {
    current = path.join(current, segment);
    let stat;
    try { stat = await lstat(current); } catch (error) {
      if (error.code === "ENOENT") return;
      stop("FILESYSTEM_UNAVAILABLE", "Project filesystem could not be inspected.");
    }
    if (stat.isSymbolicLink()) stop("SYMLINK_REJECTED", "Symbolic links and junctions are prohibited in deployment paths.");
  }
}

export async function projectRoot(project, dependencies = {}) {
  if (!project || typeof project !== "string") stop("PROJECT_REQUIRED", "Specify --project with an existing target project.");
  const absolute = path.resolve(project);
  await checkAncestors(absolute);
  let root;
  try {
    if (!(await lstat(absolute)).isDirectory()) stop("PROJECT_REQUIRED", "Target project must be an existing directory.");
    root = await realpath(absolute);
  } catch (error) {
    if (error.code === "PROJECT_REQUIRED") throw error;
    stop("PROJECT_REQUIRED", "Target project must be an existing directory.");
  }
  // Dependency injection is an in-process test seam, never an input or CLI option.
  const launchPad = path.resolve(dependencies.frameworkRoot ?? frameworkRoot);
  let sourceFramework = false;
  try {
    const manifest = JSON.parse(await readFile(path.join(launchPad, "package.json"), "utf8"));
    sourceFramework = manifest.name === "project-skills-orchestrator"
      && (await lstat(path.join(launchPad, "templates", "project"))).isDirectory();
  } catch { /* An installed target project is not the source launch pad. */ }
  if (sourceFramework && within(launchPad, root)) stop("LAUNCH_PAD_BOUNDARY", "Launch-pad output is prohibited; select a separate target project.");
  return root;
}

export async function checkedPath(root, relative, { directory = false } = {}) {
  const normalized = relativePath(relative);
  const target = path.join(root, ...normalized.split("/"));
  if (!within(root, target)) stop("UNSAFE_PATH", "Deployment path escaped the target project.");
  await checkAncestors(target);
  try {
    const stat = await lstat(target);
    if (directory ? !stat.isDirectory() : (!stat.isFile() || stat.nlink !== 1)) {
      stop("UNSAFE_PATH_TYPE", "Deployment paths must be regular files or directories without hard links.");
    }
  } catch (error) {
    if (error.code !== "ENOENT") throw error;
  }
  return target;
}

export async function makeDirectory(root, relative) {
  const target = await checkedPath(root, relative, { directory: true });
  await mkdir(target, { recursive: true });
  await checkedPath(root, relative, { directory: true });
  return target;
}

export async function readBytes(root, relative, { optional = false, maximum = 1_048_576 } = {}) {
  const target = await checkedPath(root, relative);
  let handle;
  try {
    handle = await open(target, constants.O_RDONLY | noFollow);
    const stat = await handle.stat();
    if (!stat.isFile() || stat.nlink !== 1 || stat.size > maximum) stop("FILE_BOUNDARY", "Deployment file is not regular or exceeds the size limit.");
    return await handle.readFile();
  } catch (error) {
    if (error.code === "ENOENT" && optional) return null;
    if (error.code === "ENOENT") stop("FILE_MISSING", "A required target-project input is missing.");
    throw error;
  } finally { await handle?.close(); }
}

export async function readJson(root, relative, options) {
  const bytes = await readBytes(root, relative, options);
  if (bytes === null) return null;
  try { return { bytes, value: JSON.parse(bytes.toString("utf8")) }; }
  catch { stop("JSON_INVALID", "Deployment input is not valid JSON."); }
}

export async function writeAtomic(root, relative, content) {
  const normalized = relativePath(relative);
  const parent = path.posix.dirname(normalized);
  if (parent !== ".") await makeDirectory(root, parent);
  const target = await checkedPath(root, normalized);
  const stagingRelative = `${normalized}.pending-${randomUUID()}`;
  const staging = await checkedPath(root, stagingRelative);
  let handle;
  try {
    handle = await open(staging, constants.O_WRONLY | constants.O_CREAT | constants.O_EXCL | noFollow, 0o600);
    await handle.writeFile(content);
    await handle.sync();
    await handle.close();
    handle = null;
    await checkedPath(root, normalized);
    await rename(staging, target);
  } finally {
    await handle?.close();
    await rm(staging, { force: true }).catch(() => {});
  }
}

export async function immutableFile(root, relative, content) {
  const bytes = Buffer.from(content);
  const previous = await readBytes(root, relative, { optional: true, maximum: bytes.length });
  if (previous !== null) {
    if (!previous.equals(bytes)) stop("ARTIFACT_DRIFT", "Immutable package or run evidence has changed.");
    return;
  }
  const parent = path.posix.dirname(relativePath(relative));
  if (parent !== ".") await makeDirectory(root, parent);
  const target = await checkedPath(root, relative);
  const handle = await open(target, constants.O_WRONLY | constants.O_CREAT | constants.O_EXCL | noFollow, 0o600);
  try {
    await handle.writeFile(bytes);
    await handle.sync();
  } finally { await handle.close(); }
}

export async function verifyDirectory(root, relative, expected) {
  const directory = await checkedPath(root, relative, { directory: true });
  let entries;
  try { entries = await readdir(directory, { withFileTypes: true }); }
  catch { stop("PACKAGE_MISSING", "Reviewed package is missing."); }
  if (entries.some((entry) => !entry.isFile()) || entries.map((entry) => entry.name).sort().join("\n") !== [...expected].sort().join("\n")) {
    stop("PACKAGE_DRIFT", "Reviewed package file set has changed.");
  }
}

export async function appendRecord(root, relative, entry) {
  const target = await checkedPath(root, relative);
  const handle = await open(target, constants.O_APPEND | constants.O_CREAT | constants.O_WRONLY | noFollow, 0o600);
  try {
    const stat = await handle.stat();
    if (!stat.isFile() || stat.nlink !== 1 || stat.size > 1_048_576) stop("JOURNAL_INVALID", "Deployment journal is not safe to append.");
    await handle.writeFile(`${JSON.stringify(entry)}\n`);
    await handle.sync();
  } finally { await handle.close(); }
}

export async function withProjectLock(root, action) {
  await makeDirectory(root, "reports/agent-deployment");
  const lock = await checkedPath(root, "reports/agent-deployment/.lock");
  let handle;
  try { handle = await open(lock, constants.O_WRONLY | constants.O_CREAT | constants.O_EXCL | noFollow, 0o600); }
  catch { stop("DEPLOYMENT_LOCKED", "Another deployment or interrupted run owns the project lock; reconcile it before continuing."); }
  try {
    await handle.writeFile(jsonBytes({ owner: randomUUID(), pid: process.pid }));
    await handle.sync();
    return await action();
  } finally {
    await handle.close();
    await rm(lock, { force: true });
  }
}
