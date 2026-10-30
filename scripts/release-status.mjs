#!/usr/bin/env node
import { createHash } from "node:crypto";
import { spawnSync } from "node:child_process";
import { mkdir, readFile, stat, writeFile } from "node:fs/promises";
import { existsSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { acquireReleaseLock } from "./release-lock.mjs";
import { releaseSourceStatus } from "./release-worktree.mjs";
import { assertSafeRelativePath } from "./safe-path.mjs";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const releaseLock = await acquireReleaseLock(root, "release-status");
const packageManifest = JSON.parse(await readFile(path.join(root, "package.json"), "utf8"));
const releaseManifest = JSON.parse(await readFile(path.join(root, "release", "release-manifest.json"), "utf8"));
const artifactRoot = path.join(root, "dist", `${packageManifest.name}-${packageManifest.version}`);
await assertSafeRelativePath(root, "dist");
await assertSafeRelativePath(root, "reports");
const checks = [];

function add(id, passed, evidence, blocking = true) {
  checks.push({ id, status: passed ? "passed" : "blocked", blocking, evidence });
}

function run(command, args) {
  return spawnSync(command, args, { cwd: root, encoding: "utf8", windowsHide: true });
}

function exactFields(value, fields) {
  return value !== null && typeof value === "object" && !Array.isArray(value)
    && Object.keys(value).length === fields.length && fields.every((field) => Object.hasOwn(value, field));
}

function validEvidenceTimestamp(value) {
  if (typeof value !== "string" || !/^\d{4}-\d{2}-\d{2}T(?:[01]\d|2[0-3]):[0-5]\d:[0-5]\d(?:\.\d+)?(?:Z|[+-](?:[01]\d|2[0-3]):[0-5]\d)$/.test(value)) return false;
  const timestamp = Date.parse(value);
  const date = new Date(`${value.slice(0, 10)}T00:00:00.000Z`);
  return Number.isFinite(timestamp) && timestamp <= Date.now() && Number.isFinite(date.getTime()) && date.toISOString().slice(0, 10) === value.slice(0, 10);
}

async function readBoundedFile(relative) {
  try {
    const file = await assertSafeRelativePath(root, relative);
    const details = await stat(file);
    if (!details.isFile() || details.size > 1024 * 1024) return null;
    const bytes = await readFile(file);
    return bytes.length <= 1024 * 1024 ? bytes : null;
  } catch { return null; }
}

async function readEvidence(relative) {
  const bytes = await readBoundedFile(relative);
  try { return bytes ? JSON.parse(bytes.toString("utf8")) : null; }
  catch { return null; }
}

const revision = run("git", ["rev-parse", "HEAD"]);
const commit = revision.status === 0 ? revision.stdout.trim() : null;
add("source-revision", Boolean(commit), commit ?? "No committed Git revision exists");
const worktree = releaseSourceStatus(root);
add("clean-worktree", worktree.status === 0 && worktree.stdout.trim() === "", worktree.status === 0 ? (worktree.stdout.trim() || "Release source clean; report-only changes excluded") : worktree.stderr.trim());

const securityReport = await readEvidence("reports/security-check.json");
const securityVerification = run(process.execPath, [path.join(root, "scripts", "security-check.mjs"), "--verify-report"]);
const securityPassed = securityVerification.status === 0 && securityReport?.status === "passed";
add("security-scan", securityPassed, securityPassed ? `${securityReport.filesScanned} files; digest ${securityReport.sourceDigest}` : "Current source-bound passing security evidence is missing, stale, malformed, or failed verification");

const candidate = run(process.execPath, [path.join(root, "scripts", "verify-release.mjs"), "--candidate"]);
add("release-candidate-integrity", candidate.status === 0, candidate.status === 0 ? candidate.stdout.trim() : "Current release candidate is missing, unsafe, stale, or failed integrity verification");
const candidateChecksums = await readBoundedFile(path.relative(root, path.join(artifactRoot, "SHA256SUMS")));
const candidateSha256 = candidateChecksums ? createHash("sha256").update(candidateChecksums).digest("hex") : null;

const ciEvidence = await readEvidence("reports/cross-platform-ci-evidence.json");
const requiredRuns = new Set(["windows-22", "windows-24", "windows-26", "linux-22", "linux-24", "linux-26", "macos-22", "macos-24", "macos-26"]);
const ciRuns = Array.isArray(ciEvidence?.runs) ? ciEvidence.runs : [];
const validRuns = ciRuns.every((item) => exactFields(item, ["schemaVersion", "os", "node", "commit", "status", "completedAt"])
  && item.schemaVersion === "1.0.0" && item.status === "passed" && item.commit === commit
  && Number.isInteger(item.node) && requiredRuns.has(`${item.os}-${item.node}`)
  && validEvidenceTimestamp(item.completedAt) && Date.parse(item.completedAt) <= Date.parse(ciEvidence.generatedAt));
const passedRuns = new Set(ciRuns.filter((item) => item && typeof item === "object").map((item) => `${item.os}-${item.node}`));
const ciPassed = Boolean(commit) && exactFields(ciEvidence, ["schemaVersion", "commit", "generatedAt", "runs"])
  && ciEvidence.schemaVersion === "1.0.0" && ciEvidence.commit === commit && validEvidenceTimestamp(ciEvidence.generatedAt)
  && validRuns && ciRuns.length === requiredRuns.size && passedRuns.size === requiredRuns.size && [...requiredRuns].every((item) => passedRuns.has(item));
add("cross-platform-ci", ciPassed, ciPassed ? `9 required runs passed for ${commit}` : "Current-commit Windows, Linux, and macOS evidence for Node 22, 24, and 26 is missing");

const requiredSignals = new Set(releaseManifest.monitoringSignals ?? []);
const operations = await readEvidence("reports/release-operations.json");
const ownerPattern = /^@[A-Za-z0-9](?:[A-Za-z0-9-]{0,37})$/;
const operationSignals = Array.isArray(operations?.signals) ? operations.signals : [];
const signals = new Map(operationSignals.filter((signal) => signal && typeof signal === "object").map((signal) => [signal.id, signal]));
const fresh = (value) => validEvidenceTimestamp(value) && Date.now() - Date.parse(value) <= 24 * 60 * 60 * 1000;
const ownersReady = exactFields(operations?.owners, releaseManifest.requiredOperationalRoles ?? [])
  && releaseManifest.requiredOperationalRoles?.every((role) => ownerPattern.test(operations?.owners?.[role] ?? ""));
const signalsReady = operationSignals.length === requiredSignals.size && signals.size === requiredSignals.size
  && operationSignals.every((signal) => exactFields(signal, ["id", "status", "checkedAt", "evidence"]) && requiredSignals.has(signal.id)
    && typeof signal.evidence === "string" && signal.evidence.trim().length > 0 && Date.parse(signal.checkedAt) <= Date.parse(operations.generatedAt))
  && [...requiredSignals].every((id) => signals.get(id)?.status === "passing" && fresh(signals.get(id)?.checkedAt));
const revocationReady = exactFields(operations?.revocation, ["status", "owner", "testedAt", "evidence"])
  && operations?.revocation?.status === "ready" && ownerPattern.test(operations.revocation.owner ?? "") && fresh(operations.revocation.testedAt)
  && operations.revocation.owner === operations?.owners?.artifactRevocation && typeof operations.revocation.evidence === "string" && operations.revocation.evidence.trim().length > 0
  && Date.parse(operations.revocation.testedAt) <= Date.parse(operations.generatedAt);
const operationalReady = exactFields(operations, ["schemaVersion", "generatedAt", "candidateSha256", "owners", "signals", "revocation"])
  && operations.schemaVersion === "1.0.0" && fresh(operations.generatedAt) && candidate.status === 0 && typeof candidateSha256 === "string" && /^[a-f0-9]{64}$/.test(candidateSha256)
  && operations?.candidateSha256 === candidateSha256 && ownersReady && signalsReady && revocationReady;
add("operational-readiness", operationalReady, operationalReady ? "Candidate-bound owners, fresh monitoring signals, and tested revocation evidence pass" : "Candidate-bound owner assignments, fresh monitoring signals, or tested revocation evidence are incomplete");

const signaturePath = path.join(artifactRoot, "release-signature.json");
const signingTrustConfigured = /^[a-f0-9]{64}$/.test(process.env.PSO_TRUSTED_SIGNING_KEY_SHA256 ?? "");
const signatureVerification = existsSync(signaturePath) && signingTrustConfigured
  ? run(process.execPath, [path.join(root, "scripts", "verify-release.mjs"), "--signature-only"]) : null;
const signaturePassed = signatureVerification?.status === 0;
add("trusted-signature", signaturePassed, signaturePassed ? "Release signature verified against the external signing trust anchor" : "Trusted release signature is missing, unconfigured, or failed cryptographic verification");
const reviewPath = path.join(artifactRoot, "independent-review.json");
const reviewTrustConfigured = /^[a-f0-9]{64}$/.test(process.env.PSO_TRUSTED_REVIEW_KEY_SHA256 ?? "");
const productionVerification = run(process.execPath, [path.join(root, "scripts", "verify-release.mjs")]);
const reviewPassed = existsSync(reviewPath) && reviewTrustConfigured && productionVerification.status === 0;
add("independent-review", reviewPassed, reviewPassed ? "Signed independent review and release verification passed against external trust anchors" : "Trusted independent review is missing, unconfigured, or failed release verification");
add("production-verification", productionVerification.status === 0, productionVerification.status === 0 ? productionVerification.stdout.trim() : "Production cryptographic verification failed or required release trust evidence is unavailable");

const blocked = checks.filter((item) => item.blocking && item.status !== "passed");
const report = {
  schemaVersion: "1.0.0",
  product: packageManifest.name,
  version: packageManifest.version,
  evaluatedAt: new Date().toISOString(),
  commit,
  candidateSha256,
  status: blocked.length ? "blocked" : "production-ready",
  checks
};
await mkdir(path.join(root, "reports"), { recursive: true });
await assertSafeRelativePath(root, "reports/release-readiness.json");
await writeFile(path.join(root, "reports", "release-readiness.json"), `${JSON.stringify(report, null, 2)}\n`, "utf8");
await releaseLock();
for (const check of checks) console.log(`${check.status.toUpperCase()} ${check.id}: ${check.evidence}`);
console.log(`Release readiness: ${report.status}`);
if (blocked.length) process.exitCode = 1;
