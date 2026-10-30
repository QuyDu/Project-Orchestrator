#!/usr/bin/env node
import { createHash, randomUUID } from "node:crypto";
import { spawnSync } from "node:child_process";
import { cp, mkdir, readFile, readdir, rename, rm, stat, writeFile } from "node:fs/promises";
import { existsSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { acquireReleaseLock } from "./release-lock.mjs";
import { resolveReleaseMetadata } from "./release-metadata.mjs";
import { assertSafeRelativePath } from "./safe-path.mjs";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const packageManifest = JSON.parse(await readFile(path.join(root, "package.json"), "utf8"));
const npmCli = process.env.npm_execpath;
if (!/^npm@\d+\.\d+\.\d+$/.test(packageManifest.packageManager || "")) throw new Error("Release blocked: exact npm packageManager pin is required");
if (!npmCli || !existsSync(npmCli)) throw new Error("Release blocked: npm CLI path is unavailable");
const npmVersionResult = spawnSync(process.execPath, [npmCli, "--version"], {
  cwd: root,
  encoding: "utf8",
  windowsHide: true,
  timeout: 15_000,
  maxBuffer: 64 * 1024
});
const npmVersion = npmVersionResult.stdout?.trim();
if (npmVersionResult.status !== 0 || !/^\d+\.\d+\.\d+$/.test(npmVersion || "")) throw new Error("Release blocked: npm CLI version could not be verified");
if (`npm@${npmVersion}` !== packageManifest.packageManager) throw new Error(`Release blocked: npm ${npmVersion} does not match packageManager ${packageManifest.packageManager}`);
const releaseLock = await acquireReleaseLock(root, "build-release");
const releaseContract = JSON.parse(await readFile(path.join(root, "release", "release-manifest.json"), "utf8"));
const shipped = [".github/skills", "config", "docs", "schemas", "templates", "DISCLAIMER.md", "LICENSE", "README.md", "SECURITY.md", "STANDALONE-WINDOWS.md", "package.json", "pso.mjs", "pso.ps1"];
for (const relative of shipped) {
  const source = path.join(root, relative);
  if (!existsSync(source)) throw new Error(`Release blocked: required source is missing: ${relative}`);
}
if (releaseContract.distribution !== "private-internal-package" || releaseContract.publicDistributionAllowed !== false) {
  throw new Error("Release blocked: internal distribution policy is missing or invalid");
}
if (!packageManifest.private || packageManifest.publishConfig?.access !== "restricted") {
  throw new Error("Release blocked: package must remain private with restricted access");
}

async function walk(directory, relative = "") {
  const entries = await readdir(path.join(directory, relative), { withFileTypes: true });
  const files = [];
  for (const entry of entries) {
    const child = path.join(relative, entry.name);
    if (entry.isSymbolicLink()) throw new Error(`Release blocked: symbolic link in artifact: ${child}`);
    if (entry.isDirectory()) files.push(...await walk(directory, child));
    else if (entry.isFile()) files.push(child.replaceAll("\\", "/"));
  }
  return files;
}

for (const relative of shipped) {
  const source = path.join(root, relative);
  if ((await stat(source)).isDirectory()) await walk(source);
}

const distRoot = path.join(root, "dist");
await assertSafeRelativePath(root, "dist");
const outputRoot = path.join(distRoot, `${packageManifest.name}-${packageManifest.version}`);
const stagingRoot = path.join(distRoot, `.staging-${randomUUID()}`);
const previousRoot = path.join(distRoot, `.previous-${randomUUID()}`);
await mkdir(distRoot, { recursive: true });
await mkdir(stagingRoot, { recursive: true });

async function renameWithTransientLockRetry(source, destination) {
  const retryable = new Set(["EBUSY", "EPERM"]);
  for (let attempt = 0; ; attempt += 1) {
    try {
      await rename(source, destination);
      return;
    } catch (error) {
      if (process.platform !== "win32" || !retryable.has(error.code) || attempt >= 7) throw error;
      await new Promise((resolve) => setTimeout(resolve, 100 * (attempt + 1)));
    }
  }
}

try {
  for (const relative of shipped) {
    const source = path.join(root, relative);
    await cp(source, path.join(stagingRoot, relative), { recursive: (await stat(source)).isDirectory() });
  }
  const packageResult = spawnSync(process.execPath, [npmCli, "pack", "--pack-destination", stagingRoot, "--ignore-scripts"], {
    cwd: root,
    encoding: "utf8",
    windowsHide: true
  });
  if (packageResult.status !== 0) {
    throw new Error(`Release blocked: private package creation failed: ${packageResult.error?.message || packageResult.stderr || packageResult.stdout || "unknown npm failure"}`);
  }
  const packageName = packageResult.stdout.trim().split(/\r?\n/).at(-1);
  if (!packageName || !existsSync(path.join(stagingRoot, packageName))) throw new Error("Release blocked: private package output was not created");

  const payloadFiles = (await walk(stagingRoot)).sort();
  const components = [];
  const payloadChecksums = [];
  for (const relative of payloadFiles) {
    const content = await readFile(path.join(stagingRoot, relative));
    const digest = createHash("sha256").update(content).digest("hex");
    payloadChecksums.push(`${digest}  ${relative}`);
    components.push({ type: "file", name: relative, hashes: [{ alg: "SHA-256", content: digest }] });
  }
  const payloadManifest = `${payloadChecksums.join("\n")}\n`;
  const payloadDigest = createHash("sha256").update(payloadManifest).digest("hex");
  const { sourceRevision, generatedAt } = resolveReleaseMetadata(root);
  const sbom = {
    bomFormat: "CycloneDX",
    specVersion: "1.6",
    serialNumber: `urn:uuid:${payloadDigest.slice(0, 8)}-${payloadDigest.slice(8, 12)}-4${payloadDigest.slice(13, 16)}-a${payloadDigest.slice(17, 20)}-${payloadDigest.slice(20, 32)}`,
    version: 1,
    metadata: { timestamp: generatedAt, component: { type: "application", name: packageManifest.name, version: packageManifest.version } },
    components
  };
  const provenance = {
    _type: "https://in-toto.io/Statement/v1",
    subject: [{ name: "PAYLOAD-SHA256SUMS", digest: { sha256: payloadDigest } }],
    predicateType: "https://slsa.dev/provenance/v1",
    predicate: {
      buildDefinition: { buildType: "https://skills-orchestrator.dev/build/standalone/v1", externalParameters: { version: packageManifest.version, sourceRevision }, internalParameters: {}, resolvedDependencies: [] },
      runDetails: { builder: { id: "https://skills-orchestrator.dev/builders/local-release-candidate/v1" }, metadata: { invocationId: `urn:sha256:${payloadDigest}`, startedOn: generatedAt, finishedOn: generatedAt } }
    }
  };
  await writeFile(path.join(stagingRoot, "PAYLOAD-SHA256SUMS"), payloadManifest, "utf8");
  await writeFile(path.join(stagingRoot, "sbom.cdx.json"), `${JSON.stringify(sbom, null, 2)}\n`, "utf8");
  await writeFile(path.join(stagingRoot, "provenance.intoto.json"), `${JSON.stringify(provenance, null, 2)}\n`, "utf8");
  await writeFile(path.join(stagingRoot, "release-contract.json"), `${JSON.stringify(releaseContract, null, 2)}\n`, "utf8");

  const finalChecksums = [];
  for (const relative of (await walk(stagingRoot)).sort()) {
    const digest = createHash("sha256").update(await readFile(path.join(stagingRoot, relative))).digest("hex");
    finalChecksums.push(`${digest}  ${relative}`);
  }
  await writeFile(path.join(stagingRoot, "SHA256SUMS"), `${finalChecksums.join("\n")}\n`, "utf8");

  let replacedExisting = false;
  await assertSafeRelativePath(root, "dist");
  await assertSafeRelativePath(root, path.relative(root, stagingRoot));
  if (existsSync(outputRoot)) {
    await assertSafeRelativePath(root, path.relative(root, outputRoot));
    await renameWithTransientLockRetry(outputRoot, previousRoot);
    replacedExisting = true;
  }
  try {
    await renameWithTransientLockRetry(stagingRoot, outputRoot);
    if (replacedExisting) await rm(previousRoot, { recursive: true, force: true });
  } catch (error) {
    if (replacedExisting && !existsSync(outputRoot)) await renameWithTransientLockRetry(previousRoot, outputRoot);
    throw error;
  }
  console.log(`Built unsigned release candidate: ${outputRoot}`);
  console.log("Release remains blocked until signature and independent-review evidence are attached and verified.");
  await releaseLock();
} catch (error) {
  await rm(stagingRoot, { recursive: true, force: true });
  throw error;
}
