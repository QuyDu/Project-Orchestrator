import assert from "node:assert/strict";
import { mkdir, mkdtemp, readFile, readdir, rename, rm, symlink, writeFile } from "node:fs/promises";
import { existsSync } from "node:fs";
import { createHash, generateKeyPairSync, randomUUID, sign } from "node:crypto";
import path from "node:path";
import os from "node:os";
import { pathToFileURL } from "node:url";
import { spawnSync } from "node:child_process";
import test from "node:test";
import { assertSafeRelativePath } from "../scripts/safe-path.mjs";
import { releaseSourceStatus } from "../scripts/release-worktree.mjs";
import { resolveReleaseMetadata } from "../scripts/release-metadata.mjs";
import { canonicalReviewPayload, publicKeyFingerprint, requireTrustedPublicKey } from "../scripts/trust.mjs";

const root = path.resolve(import.meta.dirname, "..");

test("production scripts and release metadata are present", async () => {
  const manifest = JSON.parse(await readFile(path.join(root, "package.json"), "utf8"));
  const version = spawnSync(process.execPath, [path.join(root, "pso.mjs"), "--version"], { cwd: root, encoding: "utf8" });
  assert.equal(version.status, 0, version.stderr);
  assert.equal(version.stdout.trim(), manifest.version);
  const orchestrator = await readFile(path.join(root, "config", "orchestrator.yaml"), "utf8");
  const frameworkVersion = orchestrator.match(/^frameworkVersion: (\d+\.\d+\.\d+)$/m)?.[1];
  assert.ok(frameworkVersion);
  assert.equal(orchestrator.match(/^runtimeVersion: (\d+\.\d+\.\d+)$/m)?.[1], manifest.version);
  const runtimeSource = await readFile(path.join(root, "pso.mjs"), "utf8");
  assert.equal(runtimeSource.match(/const FRAMEWORK_VERSION = "([^"]+)";/)?.[1], frameworkVersion);
  const readme = await readFile(path.join(root, "README.md"), "utf8");
  const overview = await readFile(path.join(root, "docs", "PROJECT-OVERVIEW.md"), "utf8");
  const sourceDate = readme.match(/^\| Source version date \| ([^|]+) \|$/m)?.[1];
  assert.ok(sourceDate && Number.isFinite(Date.parse(sourceDate)));
  for (const document of [readme, overview]) {
    assert.ok(document.includes(`| Runtime version | \`${manifest.version}\` |`));
    assert.ok(document.includes(`| Framework version | \`${frameworkVersion}\` |`));
    assert.ok(document.includes(`| Source version date | ${sourceDate} |`));
  }
  const securityPolicy = await readFile(path.join(root, "SECURITY.md"), "utf8");
  assert.ok(securityPolicy.includes(`| \`${manifest.version}\` | ${sourceDate} |`), "The supported source-version table must match current version/date metadata");
  const help = spawnSync(process.execPath, [path.join(root, "pso.mjs"), "--help"], { cwd: root, encoding: "utf8" });
  assert.equal(help.status, 0, help.stderr);
  assert.match(help.stdout, /^Project Orchestrator /);
  assert.doesNotMatch(help.stdout, /Project Skills Orchestrator/);
  assert.ok(help.stdout.includes("node .\\pso.mjs clone-setup"));
  assert.ok(help.stdout.includes("C:\\repos\\project"));
  assert.ok(help.stdout.includes("--destination is optional"));
  assert.ok(help.stdout.includes("credential-free GitHub HTTPS URL"));
  assert.ok(help.stdout.includes("destination must not already exist"));
  assert.ok(help.stdout.includes("--json emits a portable dry-run plan"));
  assert.ok(help.stdout.includes("--color sets the new workspace accent"));
  assert.ok(help.stdout.includes("node .\\pso.mjs agent plan"));
  assert.equal(manifest.scripts.security, "node scripts/security-check.mjs");
  assert.equal(manifest.scripts.release, "node scripts/build-release.mjs");
  assert.equal(manifest.scripts["release:verify:candidate"], "node scripts/verify-release.mjs --candidate");
  assert.equal(manifest.scripts["release:verify"], "node scripts/verify-release.mjs");
  assert.equal(manifest.scripts["release:status"], "node scripts/release-status.mjs");
  assert.equal(manifest.scripts["evidence:adoption"], "node scripts/adoption-evidence.mjs");
  assert.match(manifest.scripts.check, /npm run security/);
  assert.match(manifest.scripts.check, /production-gates\.test\.mjs/);
  assert.match(manifest.scripts.check, /agent-builder\.test\.mjs/);
  assert.match(manifest.scripts.check, /security-fuzz\.test\.mjs/);
  assert.match(manifest.scripts.check, /package-install\.test\.mjs/);
  assert.match(manifest.scripts.check, /project-video\.test\.mjs/);
  assert.match(manifest.scripts.check, /release:verify:candidate/);
  assert.ok(existsSync(path.join(root, "scripts", "security-check.mjs")));
  assert.ok(existsSync(path.join(root, "scripts", "build-release.mjs")));
  assert.ok(existsSync(path.join(root, "scripts", "verify-release.mjs")));
  assert.ok(existsSync(path.join(root, "scripts", "release-status.mjs")));
  assert.ok(existsSync(path.join(root, "scripts", "adoption-evidence.mjs")));
  assert.ok(existsSync(path.join(root, "release", "release-manifest.json")));
  assert.ok(existsSync(path.join(root, ".github", "workflows", "codeql.yml")));

  const codeql = await readFile(path.join(root, ".github", "workflows", "codeql.yml"), "utf8");
  assert.match(codeql, /actions: read/);
  assert.match(codeql, /security-events: write/);
  assert.match(codeql, /github\/codeql-action\/init@bce182f857edf1feab116e9795a3393d21977282/);
  assert.match(codeql, /github\/codeql-action\/analyze@bce182f857edf1feab116e9795a3393d21977282/);
  assert.match(codeql, /upload: always/);
  assert.match(codeql, /upload-database: false/);
  assert.match(codeql, /actions\/upload-artifact@043fb46d1a93c77aae656e7c1c64a875d1fc6a0a/);
  assert.match(codeql, /codeql-results\/\*\.sarif/);
});

test("release manifest declares required supply-chain outputs", async () => {
  const release = JSON.parse(await readFile(path.join(root, "release", "release-manifest.json"), "utf8"));
  assert.equal(release.schemaVersion, "1.0.0");
  assert.equal(release.product, "project-skills-orchestrator");
  assert.equal(release.distribution, "private-internal-package");
  assert.equal(release.publicDistributionAllowed, false);
  assert.deepEqual(release.requiredArtifacts.sort(), ["checksums", "private-package", "provenance", "sbom", "standalone"].sort());
  assert.equal(release.requireSignature, true);
  assert.equal(release.requireIndependentReview, true);
  assert.deepEqual(release.requiredOperationalRoles.sort(), ["artifactRevocation", "release", "securityResponse"]);
  assert.deepEqual(release.monitoringSignals.sort(), ["artifact-revocation-status", "github-codeql", "github-dependabot-alerts", "github-secret-scanning", "github-security-validation", "internal-artifact-install-health", "private-vulnerability-reports"].sort());
  assert.equal(existsSync(path.join(root, "DISCLAIMER.md")), true);
  assert.equal(existsSync(path.join(root, "LICENSE")), true);
  const packageManifest = JSON.parse(await readFile(path.join(root, "package.json"), "utf8"));
  assert.ok(packageManifest.files.includes("DISCLAIMER.md"));
  const releaseBuilder = await readFile(path.join(root, "scripts", "build-release.mjs"), "utf8");
  assert.match(releaseBuilder, /"DISCLAIMER\.md"/);
  const standaloneSources = JSON.parse(releaseBuilder.match(/^const shipped = (\[[^\r\n]+\]);$/m)[1]);
  assert.deepEqual(standaloneSources.sort(), [...new Set([...packageManifest.files, "package.json"])].sort(),
    "Standalone and package metadata must describe the same shipped source roots");
  for (const schema of [
    "release-manifest.schema.json",
    "release-signature.schema.json",
    "independent-review.schema.json",
    "cross-platform-ci-evidence.schema.json",
    "release-readiness.schema.json",
    "release-operations.schema.json",
    "security-check.schema.json"
  ]) {
    const contract = JSON.parse(await readFile(path.join(root, "schemas", schema), "utf8"));
    assert.equal(contract.$schema, "https://json-schema.org/draft/2020-12/schema");
    assert.equal(contract.additionalProperties, false);
  }
  assert.deepEqual(release.blockers.sort(), ["independent-review", "operational-readiness", "trusted-signature"]);
  const releaseStatus = await readFile(path.join(root, "scripts", "release-status.mjs"), "utf8");
  assert.match(releaseStatus, /operations\?\.candidateSha256 === candidateSha256/);
  assert.match(releaseStatus, /signals\.get\(id\)\?\.status === "passing"/);
  assert.match(releaseStatus, /revocation\?\.status === "ready"/);
});

test("release metadata is deterministic for a source revision", async () => {
  const first = resolveReleaseMetadata(root, {});
  const second = resolveReleaseMetadata(root, {});
  assert.deepEqual(second, first);
  assert.match(first.sourceRevision, /^[a-f0-9]{40}$/);
  assert.equal(resolveReleaseMetadata(root, { SOURCE_DATE_EPOCH: "0" }).generatedAt, "1970-01-01T00:00:00.000Z");
  assert.throws(() => resolveReleaseMetadata(root, { SOURCE_DATE_EPOCH: "invalid" }), /whole epoch seconds/);
  const releaseBuilder = await readFile(path.join(root, "scripts", "build-release.mjs"), "utf8");
  assert.match(releaseBuilder, /invocationId: `urn:sha256:\$\{payloadDigest\}`/);
  assert.doesNotMatch(releaseBuilder, /GITHUB_RUN_ID/);
});

test("npm supply-chain policy is reproducible and automated", async () => {
  const manifest = JSON.parse(await readFile(path.join(root, "package.json"), "utf8"));
  assert.match(manifest.packageManager, /^npm@\d+\.\d+\.\d+$/);

  const lock = JSON.parse(await readFile(path.join(root, "package-lock.json"), "utf8"));
  assert.equal(lock.lockfileVersion, 3);
  assert.equal(lock.version, manifest.version);
  assert.equal(lock.packages[""].name, manifest.name);
  assert.equal(lock.packages[""].version, manifest.version);
  assert.equal(lock.packages[""].engines.node, manifest.engines.node);

  const npmConfig = await readFile(path.join(root, ".npmrc"), "utf8");
  assert.match(npmConfig, /^ignore-scripts=true$/m);
  assert.match(npmConfig, /^package-lock=true$/m);
  assert.match(npmConfig, /^save-exact=true$/m);
  assert.match(npmConfig, /^audit=true$/m);

  const dependabot = await readFile(path.join(root, ".github", "dependabot.yml"), "utf8");
  assert.match(dependabot, /package-ecosystem: "npm"/);
  assert.match(dependabot, /versioning-strategy: lockfile-only/);
  assert.match(dependabot, /package-ecosystem: "github-actions"/);

  const workflow = await readFile(path.join(root, ".github", "workflows", "security-validation.yml"), "utf8");
  assert.match(workflow, /npm ci --ignore-scripts --no-audit --no-fund/);
});

test("a clean clone has every input the conformance gate reads", async (context) => {
  const git = spawnSync("git", ["--version"], { encoding: "utf8" });
  if (git.status !== 0) return context.skip("Git is required to verify tracked inputs");
  const listed = spawnSync("git", ["ls-files"], { cwd: root, encoding: "utf8" });
  assert.equal(listed.status, 0, listed.stderr);
  const tracked = new Set(listed.stdout.split(/\r?\n/).filter(Boolean));
  const required = [
    "package.json",
    "package-lock.json",
    ".npmrc",
    ".gitignore",
    ".github/dependabot.yml",
    ".github/workflows/codeql.yml",
    ".github/workflows/security-validation.yml",
    "release/release-manifest.json",
    "templates/scaffold-manifest.json",
    "config/profiles.yaml",
    "pso.mjs",
    "SECURITY.md",
    "docs/THREAT-MODEL.md"
  ];
  for (const relative of required) {
    assert.ok(tracked.has(relative), `${relative} must be tracked so a clean clone can run npm run check`);
  }
  assert.ok([...tracked].some((item) => item.startsWith("templates/project/")), "project templates must be tracked");
  assert.ok([...tracked].some((item) => item.startsWith(".github/skills/")), "skill packages must be tracked");
});

test("authoritative reports are not excluded from source control", async () => {
  const ignore = await readFile(path.join(root, ".gitignore"), "utf8");
  const rules = ignore.split(/\r?\n/).map((line) => line.trim()).filter((line) => line && !line.startsWith("#"));
  assert.ok(!rules.some((rule) => /^!?reports\//.test(rule)), "reports/ must remain tracked because the framework declares it authoritative");
});

test("release cleanliness excludes reports but blocks source changes", async (context) => {
  const git = spawnSync("git", ["--version"], { encoding: "utf8" });
  if (git.status !== 0) return context.skip("Git is required to verify release-source cleanliness");
  const project = await mkdtemp(path.join(os.tmpdir(), "pso-release-source-"));
  try {
    spawnSync("git", ["init", "--quiet"], { cwd: project });
    spawnSync("git", ["config", "user.name", "Release Test"], { cwd: project });
    spawnSync("git", ["config", "user.email", "release@example.invalid"], { cwd: project });
    await writeFile(path.join(project, "source.txt"), "clean\n", "utf8");
    spawnSync("git", ["add", "source.txt"], { cwd: project });
    spawnSync("git", ["commit", "--quiet", "-m", "baseline"], { cwd: project });
    await mkdir(path.join(project, "reports"));
    await writeFile(path.join(project, "reports", "evidence.json"), "{}\n", "utf8");
    const reportsOnly = releaseSourceStatus(project);
    assert.equal(reportsOnly.status, 0, reportsOnly.stderr);
    assert.equal(reportsOnly.stdout.trim(), "");
    await writeFile(path.join(project, "source.txt"), "changed\n", "utf8");
    const sourceChanged = releaseSourceStatus(project);
    assert.equal(sourceChanged.status, 0, sourceChanged.stderr);
    assert.match(sourceChanged.stdout, /source\.txt/);
  } finally {
    await rm(project, { recursive: true, force: true });
  }
});

async function createSecurityScanFixture(prefix) {
  const fixtureRoot = await mkdtemp(path.join(os.tmpdir(), prefix));
  for (const relative of ["package.json", "package-lock.json", ".npmrc"]) {
    await writeFile(path.join(fixtureRoot, relative), await readFile(path.join(root, relative)));
  }
  return fixtureRoot;
}

test("shipped templates may not resolve unpinned components at runtime", async () => {
  const fixtureRoot = await createSecurityScanFixture("pso-unpinned-template-");
  const fixture = path.join(fixtureRoot, "templates", "project", "unpinned-fixture.json");
  try {
    await mkdir(path.dirname(fixture), { recursive: true });
    await writeFile(fixture, `${JSON.stringify({ servers: { demo: { command: "npx", args: ["-y", "@example/server@latest"] } } }, null, 2)}\n`, "utf8");
    const result = spawnSync(process.execPath, [path.join(root, "scripts", "security-check.mjs"), "--root", fixtureRoot], { cwd: root, encoding: "utf8" });
    assert.notEqual(result.status, 0);
    assert.match(`${result.stdout}${result.stderr}`, /SEC-SUPPLY-006/);
  } finally {
    await rm(fixtureRoot, { recursive: true, force: true });
  }
});

test("security scanner detects secrets regardless of file extension", async () => {
  const fixtureRoot = await createSecurityScanFixture("pso-secret-scan-");
  const fixture = path.join(fixtureRoot, "security-secret-fixture.pem");
  try {
    const marker = ["-----BEGIN ", "PRIVATE KEY-----"].join("");
    await writeFile(fixture, Buffer.concat([Buffer.from([0]), Buffer.from(`${marker}\nnot-a-real-key\n-----END PRIVATE KEY-----\n`, "utf8")]));
    const result = spawnSync(process.execPath, [path.join(root, "scripts", "security-check.mjs"), "--root", fixtureRoot], { cwd: root, encoding: "utf8" });
    assert.notEqual(result.status, 0);
    assert.match(`${result.stdout}${result.stderr}`, /SEC-SECRET-001/);
  } finally {
    await rm(fixtureRoot, { recursive: true, force: true });
  }
});

test("security output paths reject symbolic links", async () => {
  const project = await mkdtemp(path.join(os.tmpdir(), "pso-safe-output-"));
  const outside = await mkdtemp(path.join(os.tmpdir(), "pso-safe-output-outside-"));
  try {
    await symlink(outside, path.join(project, "reports"), process.platform === "win32" ? "junction" : "dir");
    await assert.rejects(assertSafeRelativePath(project, "reports/security-check.json"), /Unsafe symbolic link in output path: reports/);
  } finally {
    await rm(project, { recursive: true, force: true });
    await rm(outside, { recursive: true, force: true });
  }
});

const releaseDigest = (content) => createHash("sha256").update(content).digest("hex");

async function writeFixtureChecksums(artifact) {
  const excluded = new Set(["SHA256SUMS", "release-signature.json", "independent-review.json"]);
  const files = [];
  const collect = async (relative = "") => {
    for (const entry of await readdir(path.join(artifact, relative), { withFileTypes: true })) {
      if (!relative && excluded.has(entry.name)) continue;
      assert.equal(entry.isSymbolicLink(), false);
      const child = path.join(relative, entry.name);
      if (entry.isDirectory()) await collect(child);
      else files.push(child.replaceAll("\\", "/"));
    }
  };
  await collect();
  const entries = [];
  for (const name of files.sort()) {
    entries.push(`${releaseDigest(await readFile(path.join(artifact, name)))}  ${name}`);
  }
  await writeFile(path.join(artifact, "SHA256SUMS"), `${entries.join("\n")}\n`, "utf8");
}

async function withReleaseFixture(action) {
  const directory = await mkdtemp(path.join(os.tmpdir(), "pso-release-checksums-"));
  const source = path.join(directory, "source");
  const artifact = path.join(source, "dist", "release-fixture-1.0.0");
  try {
    await mkdir(path.join(source, "scripts"), { recursive: true });
    await mkdir(artifact, { recursive: true });
    for (const file of ["verify-release.mjs", "safe-path.mjs", "trust.mjs"]) {
      await writeFile(path.join(source, "scripts", file), await readFile(path.join(root, "scripts", file)));
    }
    const payload = new Map([
      ["package.json", "{\"name\":\"release-fixture\",\"version\":\"1.0.0\",\"files\":[\"fixture.txt\",\"schemas\",\"templates\"]}\n"],
      ["fixture.txt", "Synthetic release payload.\n"],
      ["schemas/base.schema.json", "{\"type\":\"object\"}\n"],
      ["templates/base.txt", "Synthetic shipped template.\n"]
    ]);
    for (const [name, content] of payload) {
      await mkdir(path.dirname(path.join(source, name)), { recursive: true });
      await mkdir(path.dirname(path.join(artifact, name)), { recursive: true });
      await writeFile(path.join(source, name), content, "utf8");
      await writeFile(path.join(artifact, name), content, "utf8");
    }
    const payloadManifest = `${[...payload].map(([name, content]) => `${releaseDigest(content)}  ${name}`).join("\n")}\n`;
    await writeFile(path.join(artifact, "PAYLOAD-SHA256SUMS"), payloadManifest, "utf8");
    await writeFile(path.join(artifact, "provenance.intoto.json"), JSON.stringify({
      subject: [{ name: "PAYLOAD-SHA256SUMS", digest: { sha256: releaseDigest(payloadManifest) } }]
    }), "utf8");
    await writeFile(path.join(artifact, "sbom.cdx.json"), JSON.stringify({ bomFormat: "CycloneDX", specVersion: "1.6" }), "utf8");
    await writeFixtureChecksums(artifact);
    const run = ({ candidate = true, hook, env = {} } = {}) => spawnSync(process.execPath, [
      ...(hook ? ["--import", pathToFileURL(hook).href] : []),
      path.join(source, "scripts", "verify-release.mjs"),
      ...(candidate ? ["--candidate"] : [])
    ], { cwd: source, encoding: "utf8", env: { ...process.env, ...env } });
    await action({ directory, source, artifact, run });
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
}

async function checksumReadObserver(fixture, modeledLink = false) {
  const hook = path.join(fixture.directory, "checksum-read-observer.mjs");
  const marker = path.join(fixture.directory, "checksum-read-attempted.json");
  const checksum = path.join(fixture.artifact, "SHA256SUMS");
  await writeFile(hook, `
import fs from "node:fs/promises";
import path from "node:path";
import { syncBuiltinESMExports } from "node:module";
const read = fs.readFile;
const write = fs.writeFile;
const lstat = fs.lstat;
const target = ${JSON.stringify(checksum)};
fs.readFile = async (file, ...options) => {
  if (path.resolve(String(file)) === target) await write(${JSON.stringify(marker)}, "true\\n", "utf8");
  return read(file, ...options);
};
fs.lstat = async (file, ...options) => {
  const details = await lstat(file, ...options);
  if (${modeledLink} && path.resolve(String(file)) === target) details.isSymbolicLink = () => true;
  return details;
};
syncBuiltinESMExports();
`, "utf8");
  return { hook, marker };
}

test("release checksum links are rejected before target reads", async (context) => {
  for (const boundary of ["checksum leaf", "artifact parent"]) {
    await context.test(boundary, async (subtest) => withReleaseFixture(async (fixture) => {
      const canary = `sensitive-fixture-${randomUUID()}`;
      const observer = await checksumReadObserver(fixture);
      if (boundary === "checksum leaf") {
        const outside = path.join(fixture.directory, "private-fixture.txt");
        await writeFile(outside, `${canary}\n`, "utf8");
        await rm(path.join(fixture.artifact, "SHA256SUMS"));
        try {
          await symlink(outside, path.join(fixture.artifact, "SHA256SUMS"), "file");
        } catch (error) {
          if (process.platform === "win32" && ["EPERM", "EACCES", "ENOTSUP"].includes(error.code)) {
            subtest.skip("Physical file symlinks unavailable without elevation; the modeled pre-read boundary runs separately.");
            return;
          }
          throw error;
        }
      } else {
        const outside = path.join(fixture.directory, "relocated-artifact");
        await rename(fixture.artifact, outside);
        await symlink(outside, fixture.artifact, process.platform === "win32" ? "junction" : "dir");
      }
      for (const candidate of [true, false]) {
        const result = fixture.run({ candidate, hook: observer.hook });
        assert.equal(result.status, 1);
        assert.equal(existsSync(observer.marker), false, "Checksum target must not be read through a linked path");
        assert.equal(`${result.stdout}${result.stderr}`.includes(canary), false, "Failure must not disclose fixture contents");
        assert.equal(/symbolic link/i.test(result.stderr), true, "Failure must identify the unsafe link");
      }
    }));
  }
});

test("release checksum modeled links enforce the pre-read boundary without OS privileges", async () => {
  await withReleaseFixture(async (fixture) => {
    const canary = `sensitive-fixture-${randomUUID()}`;
    await writeFile(path.join(fixture.artifact, "SHA256SUMS"), `${canary}\n`, "utf8");
    const observer = await checksumReadObserver(fixture, true);
    for (const candidate of [true, false]) {
      const result = fixture.run({ candidate, hook: observer.hook });
      assert.equal(result.status, 1);
      assert.equal(existsSync(observer.marker), false, "Modeled lstat link must be rejected before readFile");
      assert.equal(`${result.stdout}${result.stderr}`.includes(canary), false, "Modeled-link failure must not disclose contents");
    }
  });
});

test("release checksum diagnostics report physical line numbers without values", async (context) => {
  for (const input of ["invalid checksum", "duplicate checksum", "invalid payload"]) {
    await context.test(input, async () => withReleaseFixture(async (fixture) => {
      const canary = `sensitive-fixture-${randomUUID()}`;
      const name = input === "invalid payload" ? "PAYLOAD-SHA256SUMS" : "SHA256SUMS";
      const file = path.join(fixture.artifact, name);
      const first = input === "duplicate checksum"
        ? `${"0".repeat(64)}  ${canary}`
        : (await readFile(file, "utf8")).split(/\r?\n/)[0];
      await writeFile(file, `\r\n${first}\r\n${input === "duplicate checksum" ? first : canary}\r\n`, "utf8");
      if (input === "invalid payload") await writeFixtureChecksums(fixture.artifact);
      const diagnostic = `${input === "duplicate checksum" ? "Duplicate" : "Invalid"} ${name} entry at line 3`;
      for (const candidate of [true, false]) {
        const result = fixture.run({ candidate });
        assert.equal(result.status, 1);
        const output = `${result.stdout}${result.stderr}`;
        assert.equal(output.includes(canary), false, "Checksum diagnostic must not echo input values");
        assert.equal(output.includes(diagnostic), true, "Checksum diagnostic must retain the physical line number");
      }
    }));
  }
});

test("release verification preserves candidate and signed synthetic fixture checks", async () => {
  await withReleaseFixture(async (fixture) => {
    const candidate = fixture.run();
    assert.equal(candidate.status, 0);
    assert.equal(candidate.stdout.includes("Verified unsigned release candidate"), true);
    const unsigned = fixture.run({ candidate: false });
    assert.equal(unsigned.status, 1);
    assert.equal(unsigned.stderr.includes("release-signature.json is missing"), true);

    const signingKeys = generateKeyPairSync("rsa", { modulusLength: 2048 });
    const reviewerKeys = generateKeyPairSync("rsa", { modulusLength: 2048 });
    const publicKeyPem = signingKeys.publicKey.export({ type: "spki", format: "pem" });
    const reviewerPublicKeyPem = reviewerKeys.publicKey.export({ type: "spki", format: "pem" });
    const checksums = await readFile(path.join(fixture.artifact, "SHA256SUMS"));
    await writeFile(path.join(fixture.artifact, "release-signature.json"), JSON.stringify({
      schemaVersion: "1.0.0", algorithm: "RSA-SHA256", signedArtifact: "SHA256SUMS",
      publicKeyPem, signature: sign("RSA-SHA256", checksums, signingKeys.privateKey).toString("base64")
    }), "utf8");
    const review = {
      schemaVersion: "1.0.0", algorithm: "RSA-SHA256", status: "approved", reviewer: "synthetic-reviewer",
      reviewedSha256: releaseDigest(checksums), approvedAt: new Date().toISOString(),
      scope: ["source", "security-scan", "codeql", "threat-model", "recovery", "package-installation"],
      findings: [], reviewerPublicKeyPem
    };
    review.signature = sign("RSA-SHA256", Buffer.from(canonicalReviewPayload(review)), reviewerKeys.privateKey).toString("base64");
    await writeFile(path.join(fixture.artifact, "independent-review.json"), JSON.stringify(review), "utf8");
    const env = {
      PSO_TRUSTED_SIGNING_KEY_SHA256: publicKeyFingerprint(publicKeyPem),
      PSO_TRUSTED_REVIEW_KEY_SHA256: publicKeyFingerprint(reviewerPublicKeyPem)
    };
    const signed = fixture.run({ candidate: false, env });
    assert.equal(signed.status, 0);
    assert.equal(signed.stdout.includes("Verified production release"), true);
    await writeFile(path.join(fixture.artifact, "fixture.txt"), "tampered payload\n", "utf8");
    for (const candidate of [true, false]) {
      const tampered = fixture.run({ candidate, env });
      assert.equal(tampered.status, 1);
      assert.equal(tampered.stderr.includes("Checksum mismatch"), true);
    }
  });
});

test("release candidate freshness compares the current shipped file set", async (context) => {
  for (const change of ["added schema", "deleted schema", "added template", "deleted template", "nonshipped outputs", "generated private package"]) {
    await context.test(change, async () => withReleaseFixture(async (fixture) => {
      if (change === "added schema" || change === "added template") {
        const relative = change === "added schema" ? "schemas/nested/added.schema.json" : "templates/nested/added.txt";
        await mkdir(path.dirname(path.join(fixture.source, relative)), { recursive: true });
        await writeFile(path.join(fixture.source, relative), "new shipped content\n", "utf8");
      } else if (change === "deleted schema" || change === "deleted template") {
        await rm(path.join(fixture.source, change === "deleted schema" ? "schemas/base.schema.json" : "templates/base.txt"));
      } else if (change === "nonshipped outputs") {
        for (const relative of ["reports/local-output.json", "dist/local-output.json", "node_modules/example/index.js"]) {
          await mkdir(path.dirname(path.join(fixture.source, relative)), { recursive: true });
          await writeFile(path.join(fixture.source, relative), "nonshipped output\n", "utf8");
        }
      } else {
        const name = "release-fixture-1.0.0.tgz";
        const content = "Synthetic generated private-package bytes, not a real archive.\n";
        await writeFile(path.join(fixture.artifact, name), content, "utf8");
        const payloadPath = path.join(fixture.artifact, "PAYLOAD-SHA256SUMS");
        const payload = `${await readFile(payloadPath, "utf8")}${releaseDigest(content)}  ${name}\n`;
        await writeFile(payloadPath, payload, "utf8");
        await writeFile(path.join(fixture.artifact, "provenance.intoto.json"), JSON.stringify({
          subject: [{ name: "PAYLOAD-SHA256SUMS", digest: { sha256: releaseDigest(payload) } }]
        }), "utf8");
        await writeFixtureChecksums(fixture.artifact);
      }
      const result = fixture.run();
      const shouldReject = change.startsWith("added") || change.startsWith("deleted");
      assert.equal(result.status, shouldReject ? 1 : 0, shouldReject
        ? "A source-file-set change beneath a shipped root must invalidate the candidate"
        : "Nonshipped outputs and the generated package must not invalidate a current candidate");
      if (shouldReject) assert.equal(/stale relative to source/.test(result.stderr), true);
      else assert.equal(result.stdout.includes("Verified unsigned release candidate"), true);
    }));
  }
});

test("release trust requires an externally pinned public key fingerprint", () => {
  const publicKey = "-----BEGIN PUBLIC KEY-----\nfixture\n-----END PUBLIC KEY-----";
  const fingerprint = publicKeyFingerprint(publicKey);
  assert.throws(() => requireTrustedPublicKey(publicKey, undefined, "signing"), /fingerprint is not configured/);
  assert.throws(() => requireTrustedPublicKey(publicKey, "0".repeat(64), "signing"), /is not trusted/);
  assert.equal(requireTrustedPublicKey(publicKey, fingerprint, "signing"), fingerprint);
});

test("independent review signatures bind scope and findings", () => {
  const review = {
    schemaVersion: "1.0.0",
    algorithm: "RSA-SHA256",
    status: "approved",
    reviewer: "Independent Security",
    reviewedSha256: "a".repeat(64),
    approvedAt: "2026-01-01T00:00:00.000Z",
    scope: ["source", "security-scan", "codeql", "threat-model", "recovery", "package-installation"],
    findings: [],
    reviewerPublicKeyPem: "-----BEGIN PUBLIC KEY-----\nfixture\n-----END PUBLIC KEY-----"
  };
  const canonical = canonicalReviewPayload(review);
  assert.notEqual(canonicalReviewPayload({ ...review, scope: review.scope.slice(1) }), canonical);
  assert.notEqual(canonicalReviewPayload({ ...review, findings: ["HIGH unresolved"] }), canonical);
});

test("CI evidence aggregation requires every OS and supported Node major", async () => {
  const temporary = await mkdtemp(path.join(os.tmpdir(), "pso-ci-evidence-"));
  const commit = "a".repeat(40);
  try {
    for (const operatingSystem of ["windows", "linux", "macos"]) {
      for (const node of [22, 24, 26]) {
        await writeFile(path.join(temporary, `${operatingSystem}-${node}.json`), `${JSON.stringify({
          schemaVersion: "1.0.0",
          os: operatingSystem,
          node,
          commit,
          status: "passed",
          completedAt: new Date().toISOString()
        })}\n`, "utf8");
      }
    }
    const output = path.join(temporary, "..", `${path.basename(temporary)}-aggregate.json`);
    const result = spawnSync(process.execPath, [path.join(root, "scripts", "ci-evidence.mjs"), "aggregate", "--input", temporary, "--output", output, "--commit", commit], {
      cwd: root,
      encoding: "utf8"
    });
    assert.equal(result.status, 0, `${result.stdout}\n${result.stderr}`);
    const evidence = JSON.parse(await readFile(output, "utf8"));
    assert.equal(evidence.commit, commit);
    assert.equal(evidence.runs.length, 9);
    await rm(output, { force: true });
  } finally {
    await rm(temporary, { recursive: true, force: true });
  }
});