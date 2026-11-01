#!/usr/bin/env node
import { createHash, randomUUID } from "node:crypto";
import { spawnSync } from "node:child_process";
import { appendFile, mkdir, readFile, realpath, stat, writeFile } from "node:fs/promises";
import path from "node:path";

const root = path.resolve(import.meta.dirname, "..");
const manifest = JSON.parse(await readFile(path.join(root, "package.json"), "utf8"));
if (!/^npm@\d+\.\d+\.\d+$/.test(manifest.packageManager || "")) throw new Error("An exact npm package-manager pin is required");
const version = manifest.packageManager.slice(4);
const runnerTempValue = process.env.RUNNER_TEMP;
if (!runnerTempValue || !path.isAbsolute(runnerTempValue) || /[\r\n\0]/.test(runnerTempValue)) throw new Error("A valid runner temporary directory is required");
const runnerTemp = await realpath(runnerTempValue);
const digest = (bytes) => createHash("sha256").update(bytes).digest("hex");
const contained = (file) => {
  const relative = path.relative(runnerTemp, file);
  return relative !== "" && !path.isAbsolute(relative) && relative !== ".." && !relative.startsWith(`..${path.sep}`);
};
async function archiveBytes(file) {
  const resolved = await realpath(file);
  if (!contained(resolved)) throw new Error("Offline toolchain archive is outside the runner temporary directory");
  const details = await stat(resolved);
  if (!details.isFile() || details.size > 64 * 1024 * 1024) throw new Error("Offline toolchain archive is invalid or oversized");
  const bytes = await readFile(resolved);
  if (bytes.length > 64 * 1024 * 1024) throw new Error("Offline toolchain archive is oversized");
  return bytes;
}
const mode = process.argv[2];
if (process.argv.length !== 3 || !["prepare", "verify"].includes(mode)) throw new Error("Use prepare or verify");
if (mode === "prepare") {
  const nodeDirectory = path.dirname(process.execPath);
  const bundle = await realpath(process.platform === "win32"
    ? path.join(nodeDirectory, "node_modules/npm")
    : path.resolve(nodeDirectory, "../lib/node_modules/npm"));
  const packageManifest = JSON.parse(await readFile(path.join(bundle, "package.json"), "utf8"));
  if (packageManifest.name !== "npm" || packageManifest.version !== version) throw new Error("Pinned Node runtime does not contain the required npm version");
  if (!Array.isArray(packageManifest.bundleDependencies) || packageManifest.bundleDependencies.length === 0) throw new Error("The npm runtime bundle is incomplete");
  const environmentFile = process.env.GITHUB_ENV;
  if (!environmentFile || !path.isAbsolute(environmentFile) || /[\r\n\0]/.test(environmentFile)) throw new Error("A valid runner environment file is required");
  if (!contained(await realpath(environmentFile))) throw new Error("Runner environment file is outside the temporary directory");
  const cache = path.join(runnerTemp, `pso-npm-${randomUUID()}`);
  await mkdir(cache, { mode: 0o700 });
  const npmCli = path.join(bundle, "bin/npm-cli.js");
  const packed = spawnSync(process.execPath, [npmCli, "pack", bundle, "--json", "--pack-destination", cache, "--offline", "--ignore-scripts", "--no-audit", "--no-fund"], {
    cwd: cache, encoding: "utf8", windowsHide: true, timeout: 60_000, maxBuffer: 1024 * 1024,
    env: { ...process.env, npm_config_offline: "true", npm_config_update_notifier: "false", npm_config_ignore_scripts: "true" }
  });
  if (packed.status !== 0) throw new Error("Offline packaging of the pinned runtime npm bundle failed");
  let result;
  try { result = JSON.parse(packed.stdout); } catch { throw new Error("Offline npm packaging did not return valid JSON"); }
  const filename = `npm-${version}.tgz`;
  if (!Array.isArray(result) || result.length !== 1 || result[0].filename !== filename) throw new Error("Unexpected offline npm archive identity");
  const archive = path.join(cache, filename);
  const bytes = await archiveBytes(archive);
  const archiveSha256 = digest(bytes);
  const receipt = { schemaVersion: "1.0.0", source: "pinned-node-runtime-bundle", bootstrapNode: process.version, npmVersion: version, relativeArchive: path.relative(runnerTemp, archive), archiveSha256 };
  await writeFile(path.join(cache, "receipt.json"), `${JSON.stringify(receipt, null, 2)}\n`, { flag: "wx", mode: 0o600 });
  await appendFile(environmentFile, `NPM_OFFLINE_PACKAGE=${archive}\nNPM_OFFLINE_PACKAGE_SHA256=${archiveSha256}\nNPM_BOOTSTRAP_NODE=${process.execPath}\n`);
  console.log(JSON.stringify(receipt));
} else {
  const archive = process.env.NPM_OFFLINE_PACKAGE;
  const expectedDigest = process.env.NPM_OFFLINE_PACKAGE_SHA256;
  if (!archive || !path.isAbsolute(archive) || /[\r\n\0]/.test(archive) || !/^[a-f0-9]{64}$/.test(expectedDigest || "")) throw new Error("Offline toolchain integrity metadata is missing or invalid");
  if (path.basename(archive) !== `npm-${version}.tgz` || digest(await archiveBytes(archive)) !== expectedDigest) throw new Error("Offline toolchain archive integrity verification failed");
  console.log(`Verified offline npm ${version} archive integrity`);
}