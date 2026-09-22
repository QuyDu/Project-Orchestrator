import assert from "node:assert/strict";
import { mkdir, mkdtemp, readFile, rm, symlink, writeFile } from "node:fs/promises";
import { existsSync } from "node:fs";
import path from "node:path";
import os from "node:os";
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