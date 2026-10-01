import assert from "node:assert/strict";
import { copyFile, link, mkdir, mkdtemp, readFile, readdir, rm, symlink, writeFile } from "node:fs/promises";
import { existsSync } from "node:fs";
import { createHash, randomUUID } from "node:crypto";
import os from "node:os";
import path from "node:path";
import { spawnSync } from "node:child_process";
import test from "node:test";
import { pathToFileURL } from "node:url";

const root = path.resolve(import.meta.dirname, "..");
const validator = path.join(root, ".github", "skills", "audit-code", "scripts", "audit-validate.mjs");
const evidenceCollector = path.join(root, ".github", "skills", "audit-code", "scripts", "audit-evidence.mjs");
const requiredStandards = [
  "microsoft-sdl",
  "microsoft-cloud-security-benchmark",
  "azure-well-architected-security",
  "owasp-asvs",
  "owasp-top-10",
  "nist-ssdf",
  "cis-controls",
  "slsa",
  "openssf-scorecard"
];
const standardVersions = {
  "microsoft-sdl": "access-dated living guidance",
  "microsoft-cloud-security-benchmark": "v1",
  "azure-well-architected-security": "access-dated living guidance",
  "owasp-asvs": "5.0.0",
  "owasp-top-10": "2025",
  "nist-ssdf": "1.1",
  "cis-controls": "8.1",
  "slsa": "1.2",
  "openssf-scorecard": "access-dated current checks"
};

function control(status = "conformant") {
  return { id: "CONTROL-1", title: "Control", status, evidence: ["verified"], limitations: [] };
}

function findingsReport() {
  return {
    schemaVersion: "2.0.0",
    generatedAt: "2026-09-11T12:00:00.000Z",
    repositoryEvidence: {
      localGit: { status: "completed" },
      secretScanning: {
        status: "completed",
        scanner: "gitleaks",
        version: "1.2.3",
        configurationDigest: "a".repeat(64),
        scopes: ["worktree", "tracked-reports", "all-local-refs", "reachable-history"],
        findingCount: 0,
        limitations: []
      },
      hostedRepository: { provider: "github", status: "completed", checkedAt: "2026-09-04T00:00:00.000Z", controls: [control()], limitations: [] }
    },
    standards: requiredStandards.map((id) => ({
      id,
      version: standardVersions[id],
      reference: `https://example.test/${id}`,
      accessedAt: "2026-09-11",
      applicability: "applicable",
      controls: [control()]
    })),
    assurance: { conclusion: "conformant", rationale: "All required evidence passed.", blockingEvidence: [], exceptionCount: 0, expiredExceptionCount: 0 }
  };
}

function strictFindingsReport() {
  const report = findingsReport();
  report.schemaVersion = "2.1.0";
  report.standards = report.standards.map((standard) => ({
    ...standard,
    stability: standard.id === "microsoft-sdl" || standard.id === "azure-well-architected-security" || standard.id === "openssf-scorecard" ? "current" : "stable",
    baselineRole: "normative"
  }));
  report.verificationEvidence = {
    secretExposure: {
      status: "completed",
      scopes: ["worktree", "tracked-reports", "all-local-refs", "reachable-history"],
      evidence: ["Pinned specialist scan passed."],
      limitations: []
    },
    analyzers: {
      status: "completed",
      detectedLanguages: ["javascript"],
      tools: [{ language: "javascript", tool: "node-test", version: "1.0.0", status: "passed", configurationDigest: "b".repeat(64) }],
      evidence: ["Native checks passed."],
      limitations: []
    },
    resourceOwnership: {
      status: "completed",
      ownershipModels: ["locally-owned", "framework-owned"],
      checks: ["ownership-classification", "normal-exit", "early-return", "exception", "cancellation"],
      pathsChecked: ["src/runtime.mjs"],
      evidence: ["Resource paths reviewed."],
      limitations: []
    },
    aiQuality: {
      status: "not-applicable",
      aiComponentsDetected: false,
      checks: ["ai-slop-indicators", "ai-authorship-non-inference", "agentic-security-applicability"],
      evidence: [],
      limitations: ["No AI or agentic runtime component was detected; general quality checks still ran."]
    },
    assuranceGates: {
      status: "completed",
      gates: ["critical-high-findings", "secret-evidence", "analyzer-evidence", "standards-evidence", "hosted-evidence"],
      evidence: ["All required gates evaluated."],
      limitations: []
    }
  };
  return report;
}

function run(...args) {
  return spawnSync(process.execPath, [validator, ...args], { cwd: root, encoding: "utf8" });
}

function runIn(cwd, ...args) {
  return spawnSync(process.execPath, [validator, ...args], { cwd, encoding: "utf8" });
}

function git(cwd, ...args) {
  const result = spawnSync("git", args, { cwd, encoding: "utf8" });
  assert.equal(result.status, 0, result.stderr);
}

async function withJson(value, action) {
  const directory = await mkdtemp(path.join(os.tmpdir(), "pso-audit-assurance-"));
  const file = path.join(directory, "artifact.json");
  try {
    await writeFile(file, `${JSON.stringify(value)}\n`, "utf8");
    await action(file, directory);
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
}

async function withAuditLifecycle(action) {
  // Leave room for the pinned executable path on Windows.
  const project = await mkdtemp(path.join(os.tmpdir(), "pso-al-"));
  const scripts = path.join(project, ".github", "skills", "audit-code", "scripts");
  const auditRunId = "11111111-1111-4111-8111-111111111111";
  const env = {
    ...process.env, GIT_CONFIG_NOSYSTEM: "1", GIT_CONFIG_GLOBAL: path.join(project, "absent-gitconfig"),
    GIT_CONFIG_COUNT: "5",
    GIT_CONFIG_KEY_0: "core.autocrlf", GIT_CONFIG_VALUE_0: "false",
    GIT_CONFIG_KEY_1: "user.name", GIT_CONFIG_VALUE_1: "Audit Test",
    GIT_CONFIG_KEY_2: "user.email", GIT_CONFIG_VALUE_2: "audit@example.invalid",
    GIT_CONFIG_KEY_3: "commit.gpgsign", GIT_CONFIG_VALUE_3: "false",
    GIT_CONFIG_KEY_4: "core.longpaths", GIT_CONFIG_VALUE_4: "true"
  };
  delete env.GIT_CONFIG_PARAMETERS;
  const invoke = (script, ...args) => spawnSync(process.execPath, [path.join(scripts, script), ...args], {
    cwd: project, env, encoding: "utf8", windowsHide: true, timeout: 30_000
  });
  const json = (script, ...args) => {
    const result = invoke(script, ...args);
    assert.equal(result.status, 0, `${script} must succeed`);
    return JSON.parse(result.stdout);
  };
  const localGit = (...args) => {
    const result = spawnSync("git", args, { cwd: project, env, encoding: "utf8", windowsHide: true });
    assert.equal(result.status, 0, "fixture Git command must succeed");
  };
  const hash = (bytes) => createHash("sha256").update(bytes).digest("hex");
  const capture = (...args) => json("audit-evidence.mjs", ...args, "--root", project, "--audit-run-id", auditRunId);
  const verify = (context, receipt, ...args) => invoke("audit-evidence.mjs", "verify", "--root", project,
    "--audit-run-id", auditRunId, "--context", context.artifact.path, "--scan-sha256", receipt, ...args);
  const input = () => json("gitleaks-scan.mjs", "digest", "--root", project);
  const files = async (directory = project, prefix = "") => {
    const result = {};
    for (const entry of await readdir(directory, { withFileTypes: true })) {
      if (entry.name === ".git") continue;
      const relative = `${prefix}${entry.name}`;
      const file = path.join(directory, entry.name);
      if (entry.isDirectory()) Object.assign(result, await files(file, `${relative}/`));
      else result[relative] = hash(await readFile(file));
    }
    return result;
  };
  // Only the scanner owner is faked; identity, checkpoint and complete input digests are real helpers.
  const certify = async (mutate = () => {}) => {
    const scanner = json("gitleaks-scan.mjs", "metadata");
    const checkpoint = json("audit-validate.mjs", "checkpoint", project);
    const digest = input();
    const value = {
      schemaVersion: "1.1.0", auditRunId, generatedAt: new Date().toISOString(), scanner,
      configurationSha256: digest.configurationSha256 ?? hash("[extend]\nuseDefault = true\n\n\n"),
      allowlistCount: 0, repositoryRevision: checkpoint.repositoryRevision,
      worktreeDigest: checkpoint.worktreeDigest, scanInputDigest: digest.scanInputDigest,
      scopes: ["worktree", "staged", "untracked-distributable", "tracked-reports", "all-local-refs", "reachable-history"],
      commands: [
        { scope: "worktree", command: "gitleaks dir <repository> --redact=100 --report-format=json", exitCode: 0 },
        { scope: "staged", command: "gitleaks git --staged <repository> --redact=100 --report-format=json", exitCode: 0 },
        { scope: "history", command: "gitleaks git <repository> --log-opts='--all --full-history' --redact=100 --report-format=json", exitCode: 0 }
      ],
      status: "passed", findings: { worktree: [], staged: [], history: [] },
      limitations: ["Deterministic test-owner certificate; no real scanner execution is claimed."]
    };
    mutate(value);
    const bytes = Buffer.from(`${JSON.stringify(value, null, 2)}\n`);
    await writeFile(path.join(project, "reports", "gitleaks-scan.json"), bytes);
    return { value, receipt: hash(bytes) };
  };
  try {
    await mkdir(scripts, { recursive: true });
    for (const name of ["audit-evidence.mjs", "audit-validate.mjs", "gitleaks-scan.mjs", "safe-path.mjs"]) {
      await copyFile(path.join(path.dirname(validator), name), path.join(scripts, name));
    }
    await mkdir(path.join(project, "src"));
    await mkdir(path.join(project, "reports"));
    await mkdir(path.join(project, "config"));
    await writeFile(path.join(project, ".gitleaks.toml"), "[extend]\nuseDefault = true\n", "utf8");
    await writeFile(path.join(project, "config", "gitleaks-allowlist.json"), '{"schemaVersion":"1.0.0","entries":[]}\n', "utf8");
    await writeFile(path.join(project, ".gitignore"), "ignored-distributable.txt\n", "utf8");
    await writeFile(path.join(project, "src", "main.mjs"), "export const value = 1;\n", "utf8");
    await writeFile(path.join(project, "reports", "existing.json"), '{"value":1}\n', "utf8");
    localGit("init", "--quiet");
    localGit("add", ".");
    localGit("commit", "--quiet", "-m", "audit lifecycle fixture");
    await writeFile(path.join(project, "reports", "untracked.json"), '{"value":1}\n', "utf8");
    await writeFile(path.join(project, "ignored-distributable.txt"), "first\n", "utf8");
    await action({ project, scripts, auditRunId, invoke, json, localGit, hash, capture, verify, input, files, certify, env });
  } finally {
    await rm(project, { recursive: true, force: true });
  }
}

test("audit lifecycle capture binds pre-publication inputs without claiming the new artifact was scanned", async () => {
  await withAuditLifecycle(async ({ capture, certify, input }) => {
    const certificate = await certify();
    const context = capture();
    assert.equal(context.secretHistory.status, "ready");
    assert.equal(context.secretHistory.scanEvidence, null);
    assert.equal(context.secretHistory.phase, "capture");
    assert.equal(context.repository.worktreeDigest, certificate.value.worktreeDigest);
    assert.equal(context.repository.scanInputDigest, certificate.value.scanInputDigest);
    assert.notEqual(input().scanInputDigest, certificate.value.scanInputDigest, "published context must remain a scanned input");
  });
});

test("audit lifecycle capture scan and repeated verification reuse immutable context without writes", async () => {
  await withAuditLifecycle(async ({ capture, certify, verify, files, input }) => {
    const context = capture("capture");
    const { receipt, value } = await certify();
    const before = await files();
    for (let attempt = 0; attempt < 3; attempt++) {
      const result = verify(context, receipt);
      assert.equal(result.status, 0, "current exact owner certificate must verify");
      const verification = JSON.parse(result.stdout);
      assert.equal(verification.secretHistory.phase, "verification");
      assert.equal(verification.secretHistory.status, "completed");
      assert.deepEqual(verification.secretHistory.helperValidity, { metadata: true, checkpoint: true, scanDigest: true });
      assert.equal(verification.secretHistory.context.sha256, context.artifact.sha256);
      assert.equal(verification.secretHistory.context.generatedAt, context.generatedAt);
      assert.equal(verification.secretHistory.scanEvidence.sha256, receipt);
      assert.equal(verification.repository.scanInputDigest, value.scanInputDigest);
      assert.equal(verification.artifact, undefined, "read-only verification must not masquerade as an immutable published snapshot");
      assert.deepEqual(await files(), before);
      assert.equal(input().scanInputDigest, value.scanInputDigest);
    }
  });
});

test("audit lifecycle rejects source, reports, configuration and reference drift without exclusions", async (context) => {
  const mutations = [
    ["source", async ({ project }) => writeFile(path.join(project, "src", "main.mjs"), "export const value = 2;\n")],
    ["existing tracked report", async ({ project }) => writeFile(path.join(project, "reports", "existing.json"), '{"value":2}\n')],
    ["existing untracked report", async ({ project }) => writeFile(path.join(project, "reports", "untracked.json"), '{"value":2}\n')],
    ["new untracked report", async ({ project }) => writeFile(path.join(project, "reports", "new.json"), "{}\n")],
    ["new tracked report", async ({ project, localGit }) => {
      await writeFile(path.join(project, "reports", "new.json"), "{}\n");
      localGit("add", "reports/new.json");
    }],
    ["ignored distributable input", async ({ project }) => writeFile(path.join(project, "ignored-distributable.txt"), "later\n")],
    ["scanner configuration", async ({ project }) => writeFile(path.join(project, ".gitleaks.toml"), "[extend]\nuseDefault = true\n# changed\n")],
    ["local ref", async ({ localGit }) => localGit("tag", "new-local-ref", "HEAD")],
    ["staged-only input", async ({ project, localGit }) => {
      const source = path.join(project, "src", "main.mjs");
      await writeFile(source, "export const value = 2;\n");
      localGit("add", "src/main.mjs");
      await writeFile(source, "export const value = 1;\n");
    }],
    ["new audit snapshot", async ({ capture }) => { capture(); }]
  ];
  for (const [name, mutate] of mutations) {
    await context.test(name, async () => {
      await withAuditLifecycle(async (fixture) => {
        const captured = fixture.capture();
        const { receipt } = await fixture.certify();
        assert.equal(fixture.verify(captured, receipt).status, 0);
        await mutate(fixture);
        const result = fixture.verify(captured, receipt);
        assert.equal(result.status, 1, `${name} must invalidate the certificate`);
        assert.equal(JSON.parse(result.stdout).secretHistory.status, "blocked");
      });
    });
  }
});

test("audit lifecycle new publication requires one explicit full scan, then reuses either context read-only", async () => {
  await withAuditLifecycle(async ({ capture, certify, verify, files }) => {
    const initial = capture();
    const first = await certify();
    assert.equal(verify(initial, first.receipt).status, 0);
    const published = capture();
    assert.notEqual(published.artifact.sha256, initial.artifact.sha256);
    assert.equal(published.secretHistory.status, "ready");
    assert.equal(verify(initial, first.receipt).status, 1);
    const rescanned = await certify();
    const before = await files();
    assert.equal(verify(initial, rescanned.receipt).status, 0);
    assert.equal(verify(published, rescanned.receipt).status, 0);
    assert.deepEqual(await files(), before);
  });
});

test("audit lifecycle binds effective shallow history without ref or index movement", async () => {
  await withAuditLifecycle(async ({ project, env, localGit, capture, certify, verify, input, json }) => {
    const revision = () => json("audit-validate.mjs", "checkpoint", project).repositoryRevision;
    const commits = [revision()];
    for (let index = 0; index < 3; index++) {
      localGit("commit", "--quiet", "--allow-empty", "-m", `history boundary ${index}`);
      commits.push(revision());
    }
    const boundary = path.join(project, ".git", "review-shallow-boundary");
    env.GIT_SHALLOW_FILE = boundary;
    await writeFile(boundary, `${commits[2]}\n`);
    const context = capture();
    const certificate = await certify();
    const before = input();
    const checkpoint = json("audit-validate.mjs", "checkpoint", project);
    assert.equal(verify(context, certificate.receipt).status, 0);
    for (const value of [`${commits[1]}\n`, ""]) {
      await writeFile(boundary, value);
      const after = input();
      assert.equal(after.localRefsDigest, before.localRefsDigest);
      assert.equal(after.indexDigest, before.indexDigest);
      assert.deepEqual(json("audit-validate.mjs", "checkpoint", project), checkpoint);
      const stale = verify(context, certificate.receipt);
      assert.equal(stale.status, 1, "unscanned reachable commits must invalidate the exact owner receipt");
      assert.equal(JSON.parse(stale.stdout).secretHistory.status, "blocked");
      assert.notEqual(after.scanInputDigest, before.scanInputDigest);
      assert.notEqual(after.historyDigest, before.historyDigest);
    }
    const expanded = await certify();
    const completed = verify(context, expanded.receipt);
    assert.equal(completed.status, 0);
    assert.equal(JSON.parse(completed.stdout).repository.reachableCommitCount, 4);
  });
});

test("audit lifecycle rejects missing, failed, stale, future and mismatched owner certificates", async (context) => {
  for (const [name, mutate] of [
    ["failed", (report) => { report.status = "failed"; }],
    ["stale", (report) => { report.generatedAt = new Date(Date.now() - 25 * 3_600_000).toISOString(); }],
    ["future", (report) => { report.generatedAt = new Date(Date.now() + 3_600_000).toISOString(); }],
    ["wrong run", (report) => { report.auditRunId = "22222222-2222-4222-8222-222222222222"; }],
    ["wrong revision", (report) => { report.repositoryRevision = "a".repeat(40); }],
    ["wrong configuration", (report) => { report.configurationSha256 = "a".repeat(64); }],
    ["wrong scanner", (report) => { report.scanner.archiveSha256 = "a".repeat(64); }],
    ["missing scope", (report) => { report.scopes.pop(); }],
    ["duplicate scope", (report) => { report.scopes[0] = report.scopes[1]; }],
    ["failed command", (report) => { report.commands[0].exitCode = 1; }],
    ["missing finding bucket", (report) => { delete report.findings.history; }],
    ["nonempty finding bucket", (report) => { report.findings.worktree = [{ ruleId: "test", path: "source", commit: null, startLine: 1 }]; }],
    ["legacy certificate", (report) => { report.schemaVersion = "1.0.0"; delete report.auditRunId; }]
  ]) {
    await context.test(name, async () => {
      await withAuditLifecycle(async ({ capture, certify, verify }) => {
        const captured = capture();
        const { receipt } = await certify(mutate);
        const result = verify(captured, receipt);
        assert.equal(result.status, 1, name);
        assert.equal(JSON.parse(result.stdout).secretHistory.status, "blocked");
      });
    });
  }
  await withAuditLifecycle(async ({ project, capture, certify, verify }) => {
    const captured = capture();
    const { receipt } = await certify();
    await rm(path.join(project, "reports", "gitleaks-scan.json"));
    assert.equal(verify(captured, receipt).status, 1);
  });
});

test("audit lifecycle rejects certificate byte tampering even when parsed JSON is unchanged", async () => {
  await withAuditLifecycle(async ({ project, capture, certify, verify, files }) => {
    const context = capture();
    const { receipt } = await certify();
    const report = path.join(project, "reports", "gitleaks-scan.json");
    await writeFile(report, `${await readFile(report, "utf8")}\n`, "utf8");
    const before = await files();
    const result = verify(context, receipt);
    assert.equal(result.status, 1);
    assert.equal(JSON.parse(result.stdout).secretHistory.status, "blocked");
    assert.deepEqual(await files(), before);
  });
});

test("audit lifecycle rejects tampered or linked snapshots and reads legacy context without upgrading assurance", async (context) => {
  await withAuditLifecycle(async ({ project, capture, certify, verify, hash }) => {
    const captured = capture();
    const { receipt } = await certify();
    const file = path.join(project, captured.artifact.path);
    const bytes = await readFile(file);
    await rm(file);
    assert.match(verify(captured, receipt).stderr, /artifact is missing/);
    await writeFile(file, "tampered snapshot\n");
    const tampered = verify(captured, receipt);
    assert.equal(tampered.status, 1);
    assert.match(tampered.stderr, /does not match its content digest/);
    await writeFile(file, bytes);
    const alias = path.join(project, "snapshot-hardlink.json");
    await link(file, alias);
    const linked = verify(captured, receipt);
    assert.equal(linked.status, 1);
    assert.match(linked.stderr, /regular file|links/i);
    await rm(alias);
    const legacy = JSON.parse(bytes);
    delete legacy.repository.worktreeDigest;
    delete legacy.repository.scanInputDigest;
    delete legacy.secretHistory.phase;
    const legacyBytes = Buffer.from(`${JSON.stringify(legacy, null, 2)}\n`);
    const legacyPath = `reports/audit-evidence/${hash(legacyBytes)}.json`;
    await writeFile(path.join(project, legacyPath), legacyBytes);
    const fresh = await certify();
    const readable = verify({ artifact: { path: legacyPath } }, fresh.receipt);
    assert.equal(readable.status, 1);
    const result = JSON.parse(readable.stdout);
    assert.equal(result.secretHistory.status, "blocked");
    assert.equal(result.secretHistory.context.sha256, hash(legacyBytes));
  });
  await context.test("symbolic link", async (child) => {
    await withAuditLifecycle(async ({ project, capture, certify, verify }) => {
      const captured = capture();
      const { receipt } = await certify();
      const file = path.join(project, captured.artifact.path);
      const bytes = await readFile(file);
      const target = path.join(project, "link-target.json");
      await writeFile(target, bytes);
      await rm(file);
      try { await symlink(target, file, "file"); } catch (error) {
        if (["EPERM", "EACCES", "ENOTSUP"].includes(error.code)) return child.skip("File symlinks require local privileges");
        throw error;
      }
      const result = verify(captured, receipt);
      assert.equal(result.status, 1);
      assert.match(result.stderr, /symbolic link|regular file/i);
    });
  });
});

test("audit lifecycle never completes with missing, failed or malformed helpers", async (context) => {
  for (const [name, script, replacement] of [
    ["missing checkpoint", "audit-validate.mjs", null],
    ["failed checkpoint", "audit-validate.mjs", 'console.error("private-helper-diagnostic-fixture"); process.exit(7);\n'],
    ["malformed checkpoint", "audit-validate.mjs", "console.log('{}');\n"],
    ["missing scanner helpers", "gitleaks-scan.mjs", null],
    ["failed scanner helpers", "gitleaks-scan.mjs", 'console.error("private-helper-diagnostic-fixture"); process.exit(7);\n'],
    ["malformed scanner helpers", "gitleaks-scan.mjs", "console.log('{}');\n"]
  ]) {
    await context.test(name, async () => {
      await withAuditLifecycle(async ({ scripts, capture, certify, verify }) => {
        const captured = capture();
        const { receipt } = await certify();
        if (replacement === null) await rm(path.join(scripts, script));
        else await writeFile(path.join(scripts, script), replacement);
        const result = verify(captured, receipt);
        assert.equal(result.status, 1);
        assert.equal(JSON.parse(result.stdout).secretHistory.status, "blocked");
        assert.equal(`${result.stdout}${result.stderr}`.includes("private-helper-diagnostic-fixture"), false);
      });
    });
  }
});

test("audit lifecycle offline scan does not install or download a missing cached tool", async () => {
  await withAuditLifecycle(async ({ project, scripts, env }) => {
    const toolRoot = path.join(project, "absent-tool-root");
    const guard = path.join(project, "deny-network.mjs");
    await writeFile(guard, 'globalThis.fetch = async () => { throw new Error("network-call-forbidden-fixture"); };\n');
    const result = spawnSync(process.execPath, ["--import", pathToFileURL(guard).href,
      path.join(scripts, "gitleaks-scan.mjs"), "scan", "--offline", "--json", "--root", project, "--tool-root", toolRoot], {
      cwd: project, env, encoding: "utf8", timeout: 30_000, windowsHide: true
    });
    assert.equal(result.status, 1);
    assert.match(result.stderr, /cached.*unavailable|explicit.*install/i);
    assert.equal(result.stderr.includes("network-call-forbidden-fixture"), false);
    assert.equal(existsSync(toolRoot), false, "offline failure must not create an installation tree");
  });
});

test("audit lifecycle scanner owner rejects success-shaped failures and tampered cached bytes", async (context) => {
  const metadataResult = spawnSync(process.execPath, [path.join(path.dirname(validator), "gitleaks-scan.mjs"), "metadata"], {
    cwd: root, encoding: "utf8", windowsHide: true
  });
  assert.equal(metadataResult.status, 0);
  const metadata = JSON.parse(metadataResult.stdout);
  const cacheRelative = path.join(".skills-orchestrator", "tools", "audit-code", "gitleaks", metadata.version, metadata.platform);
  const sourceCache = path.join(root, cacheRelative);
  const executable = process.platform === "win32" ? "gitleaks.exe" : "gitleaks";
  if (!existsSync(path.join(sourceCache, executable))) return context.skip("Requires a preinstalled pinned cache; this test never installs or downloads");
  await withAuditLifecycle(async ({ project, scripts, env, json, certify }) => {
    const cache = path.join(project, cacheRelative);
    await mkdir(cache, { recursive: true });
    const names = (await readdir(sourceCache)).filter((name) => name === executable || name.endsWith("_checksums.txt") || name.endsWith(".zip") || name.endsWith(".tar.gz"));
    for (const name of names) await copyFile(path.join(sourceCache, name), path.join(cache, name));
    await writeFile(path.join(project, ".gitignore"), "ignored-distributable.txt\n.skills-orchestrator/\n");
    const hook = path.join(project, "fake-scanner-owner.mjs");
    await writeFile(hook, `
import childProcess from "node:child_process";
import crypto from "node:crypto";
import fs from "node:fs/promises";
import { writeFileSync } from "node:fs";
import path from "node:path";
import { syncBuiltinESMExports } from "node:module";
const original = childProcess.spawnSync;
const mode = process.env.PSO_SCANNER_TEST_MODE;
const originalWrite = fs.writeFile;
const originalOpen = fs.open;
const originalRename = fs.rename;
const originalRm = fs.rm;
const originalRead = fs.readFile;
const isCanonical = (file) => path.basename(String(file)) === "gitleaks-scan.json";
const isCandidate = (file) => /^\\.gitleaks-scan-.*\\.candidate\\.json$/.test(path.basename(String(file)));
const publication = (file) => isCanonical(file) || isCandidate(file);
const fault = (code) => Object.assign(new Error("injected publication fault"), { code });
const partial = mode === "publish-partial" || mode === "publish-combined";
fs.writeFile = async (file, bytes, ...args) => {
  if (partial && publication(file)) {
    await originalWrite(file, Buffer.from(bytes).subarray(0, 17), ...args);
    throw fault("ENOSPC");
  }
  return originalWrite(file, bytes, ...args);
};
fs.open = async (file, ...args) => {
  const handle = await originalOpen(file, ...args);
  if (partial && publication(file)) {
    const write = handle.writeFile.bind(handle);
    handle.writeFile = async (bytes, ...options) => {
      await write(Buffer.from(bytes).subarray(0, 17), ...options);
      throw fault("ENOSPC");
    };
  }
  return handle;
};
fs.rename = async (from, to) => {
  if (mode === "publish-rename" && isCanonical(to)) throw fault("EACCES");
  return originalRename(from, to);
};
fs.rm = async (file, ...args) => {
  if (["publish-cleanup", "publish-combined"].includes(mode) && /-worktree\\.json$/.test(path.basename(String(file)))) throw fault("EBUSY");
  return originalRm(file, ...args);
};
fs.readFile = async (file, ...args) => {
  if (mode === "publish-verify" && isCandidate(file)) return Buffer.from("{}\\n");
  return originalRead(file, ...args);
};
if (process.env.PSO_SCANNER_TEST_MODE === "collision") crypto.randomUUID = () => "33333333-3333-4333-8333-333333333333";
childProcess.spawnSync = (command, args, options) => {
  if (path.basename(String(command)).startsWith("gitleaks") && args.includes("--report-path")) {
    const mode = process.env.PSO_SCANNER_TEST_MODE;
    if (mode !== "missing") writeFileSync(args[args.indexOf("--report-path") + 1],
      mode === "malformed" ? "{}" : mode === "invalid-json" ? "private-scanner-diagnostic-fixture" : "[]");
    return { status: 0, signal: null, stdout: "", stderr: "" };
  }
  return original(command, args, options);
};
syncBuiltinESMExports();
globalThis.fetch = async () => { throw new Error("network-call-forbidden-fixture"); };
`, "utf8");
    const certificate = path.join(project, "reports", "gitleaks-scan.json");
    await writeFile(certificate, "previous certificate bytes\n");
    const previous = await readFile(certificate);
    const scan = (mode) => spawnSync(process.execPath, ["--import", pathToFileURL(hook).href,
      path.join(scripts, "gitleaks-scan.mjs"), "scan", "--offline", "--json", "--root", project, "--tool-root", project], {
      cwd: project, env: { ...env, PSO_SCANNER_TEST_MODE: mode }, encoding: "utf8", windowsHide: true, timeout: 30_000
    });
    for (const mode of ["missing", "malformed", "invalid-json"]) {
      const result = scan(mode);
      assert.equal(result.status, 1, mode);
      assert.equal(result.stdout, "");
      assert.match(result.stderr, /required scan report|invalid findings array|invalid report JSON/);
      assert.equal(result.stderr.includes("private-scanner-diagnostic-fixture"), false);
      assert.deepEqual(await readFile(certificate), previous);
      assert.deepEqual((await readdir(cache)).sort(), names.sort(), "owned partial outputs must be removed");
    }
    const collisionPrefix = "scan-33333333-3333-4333-8333-333333333333";
    const unowned = [".gitleaks.toml", "-worktree.json", "-staged.json", "-history.json"].map((suffix) => path.join(cache, `${collisionPrefix}${suffix}`));
    for (const file of unowned) await writeFile(file, "unowned sentinel\n", { flag: "wx" });
    const collision = scan("collision");
    assert.equal(collision.status, 1);
    for (const file of unowned) {
      assert.equal(await readFile(file, "utf8"), "unowned sentinel\n", "failed exclusive creation must never remove unowned output");
      await rm(file);
    }
    assert.deepEqual(await readFile(certificate), previous);
    const checkpointFile = path.join(scripts, "audit-validate.mjs");
    const checkpointBytes = await readFile(checkpointFile);
    const checkpoint = json("audit-validate.mjs", "checkpoint", project);
    delete checkpoint.status;
    await writeFile(checkpointFile, `console.log(${JSON.stringify(JSON.stringify(checkpoint))});\n`);
    const invalidCheckpoint = scan("clean");
    assert.equal(invalidCheckpoint.status, 1, "a success-shaped but invalid checkpoint cannot authorize a certificate");
    assert.match(invalidCheckpoint.stderr, /checkpoint output is missing/);
    assert.deepEqual(await readFile(certificate), previous);
    await writeFile(checkpointFile, 'console.log("private-checkpoint-diagnostic-fixture");\n');
    const invalidJson = scan("clean");
    assert.equal(invalidJson.status, 1);
    assert.match(invalidJson.stderr, /checkpoint helper failed or returned invalid JSON/);
    assert.equal(invalidJson.stderr.includes("private-checkpoint-diagnostic-fixture"), false);
    assert.deepEqual(await readFile(certificate), previous);
    await writeFile(checkpointFile, checkpointBytes);
    for (const mode of ["publish-partial", "publish-cleanup", "publish-rename", "publish-combined", "publish-verify"]) {
      await context.test(mode, async () => {
        await certify();
        const priorCertificate = await readFile(certificate);
        try {
          const failed = scan(mode);
          assert.equal(failed.status, 1, mode);
          assert.equal(failed.stdout, "", "no receipt may escape before the atomic commit");
          assert.deepEqual(await readFile(certificate), priorCertificate, "all pre-commit failures must preserve prior certificate bytes");
          assert.match(failed.stderr, /canonical certificate unchanged/);
          assert.match(failed.stderr, /uncommitted candidate retained/);
          if (mode === "publish-partial" || mode === "publish-combined") assert.match(failed.stderr, /ENOSPC/);
          if (mode === "publish-cleanup" || mode === "publish-combined") assert.match(failed.stderr, /EBUSY/);
          if (mode === "publish-rename") assert.match(failed.stderr, /EACCES/);
          const candidates = (await readdir(path.join(project, "reports"))).filter((name) => /^\.gitleaks-scan-.*\.candidate\.json$/.test(name));
          assert.equal(candidates.length, 1, "failed publication must retain its owned recovery candidate");
          const candidate = await readFile(path.join(project, "reports", candidates[0]));
          if (mode === "publish-partial" || mode === "publish-combined") assert.equal(candidate.length, 17);
          else assert.equal(JSON.parse(candidate).status, "passed");
        } finally {
          await writeFile(certificate, priorCertificate);
          for (const name of await readdir(path.join(project, "reports"))) {
            if (/^\.gitleaks-scan-.*\.candidate\.json$/.test(name)) await rm(path.join(project, "reports", name));
          }
          for (const name of await readdir(cache)) {
            if (!names.includes(name)) await rm(path.join(cache, name));
          }
        }
      });
    }
    await writeFile(certificate, previous);
    const binary = path.join(cache, executable);
    await writeFile(binary, Buffer.concat([await readFile(binary), Buffer.from([0])]));
    const modified = await readFile(binary);
    const tampered = scan("clean");
    assert.equal(tampered.status, 1);
    assert.match(tampered.stderr, /executable does not match the authenticated archive/);
    assert.deepEqual(await readFile(binary), modified, "scan must not reinstall over a modified executable");
    assert.deepEqual(await readFile(certificate), previous);
    assert.deepEqual((await readdir(cache)).sort(), names.sort());
  });
});

test("audit assurance accepts complete conformant evidence", async () => {
  await withJson(findingsReport(), async (file) => {
    const result = run("findings", file);
    assert.equal(result.status, 0, result.stderr);
  });
});

test("audit assurance rejects conformant with blocked or incomplete evidence", async () => {
  for (const [name, mutate] of [
    ["blocked secret scan", (report) => { report.repositoryEvidence.secretScanning.status = "blocked"; }],
    ["blocked hosted repository", (report) => { report.repositoryEvidence.hostedRepository.status = "blocked"; }],
    ["empty standards", (report) => { report.standards = []; }],
    ["missing required standard", (report) => { report.standards.pop(); }],
    ["duplicate standard ID", (report) => { report.standards.push(structuredClone(report.standards[0])); }],
    ["missing standard version", (report) => { delete report.standards[0].version; }],
    ["missing standard reference", (report) => { delete report.standards[0].reference; }],
    ["missing standard access date", (report) => { delete report.standards[0].accessedAt; }],
    ["empty applicable controls", (report) => { report.standards[0].controls = []; }],
    ["null scanner version", (report) => { report.repositoryEvidence.secretScanning.version = null; }],
    ["invalid scanner digest", (report) => { report.repositoryEvidence.secretScanning.configurationDigest = "invalid"; }],
    ["missing secret scan scope", (report) => { report.repositoryEvidence.secretScanning.scopes.pop(); }],
    ["empty GitHub controls", (report) => { report.repositoryEvidence.hostedRepository.controls = []; }],
    ["blocked control", (report) => { report.standards[0].controls[0].status = "blocked"; }],
    ["non-conformant control", (report) => { report.standards[0].controls[0].status = "non-conformant"; }],
    ["empty partially applicable controls", (report) => {
      report.standards[0].applicability = "partially-applicable";
      report.standards[0].controls = [];
    }],
    ["declared blocker", (report) => { report.assurance.blockingEvidence = ["blocked"]; }]
  ]) {
    const report = findingsReport();
    mutate(report);
    await withJson(report, async (file) => {
      const result = run("findings", file);
      assert.notEqual(result.status, 0, name);
      assert.match(result.stderr, /Audit validation failed/);
    });
  }
});

test("audit assurance rejects expired or malformed exceptions", async () => {
  for (const [name, exception, expiredExceptionCount, expected] of [
    ["expired exception", { exceptionOwner: "security-owner", exceptionExpiresAt: "2020-01-01T00:00:00.000Z" }, 1, /expired/i],
    ["missing exception owner", { exceptionExpiresAt: "2999-01-01T00:00:00.000Z" }, 0, /no owner/i],
    ["missing exception expiry", { exceptionOwner: "security-owner" }, 0, /valid expiry/i],
    ["invalid exception expiry", { exceptionOwner: "security-owner", exceptionExpiresAt: "invalid" }, 0, /valid expiry/i]
  ]) {
    const report = findingsReport();
    report.standards[0].controls = [{ ...control("exception"), ...exception }];
    report.assurance.conclusion = "conformant-with-exceptions";
    report.assurance.exceptionCount = 1;
    report.assurance.expiredExceptionCount = expiredExceptionCount;
    await withJson(report, async (file) => {
      const result = run("findings", file);
      assert.notEqual(result.status, 0, name);
      assert.match(result.stderr, expected);
    });
  }
});

test("review validation requires exact v2 assurance preservation", async () => {
  const source = findingsReport();
  await withJson(source, async (sourcePath, directory) => {
    const review = {
      schemaVersion: "2.0.0",
      reviewId: "REVIEW-0001",
      generatedAt: "2026-09-04T00:00:00.000Z",
      sourceReport: "reports/code-audit-findings.json",
      sourceAuditId: "AUDIT-0001",
      summary: { total: 0, confirmed: 0, needsMoreEvidence: 0, disputed: 0, falsePositive: 0 },
      repositoryEvidence: structuredClone(source.repositoryEvidence),
      standards: structuredClone(source.standards),
      assurance: structuredClone(source.assurance),
      findings: [],
      limitations: []
    };
    const reviewPath = path.join(directory, "review.json");
    await writeFile(reviewPath, `${JSON.stringify(review)}\n`, "utf8");
    assert.equal(run("review", sourcePath, reviewPath).status, 0);
    review.assurance.conclusion = "conformant-with-exceptions";
    await writeFile(reviewPath, `${JSON.stringify(review)}\n`, "utf8");
    const softened = run("review", sourcePath, reviewPath);
    assert.notEqual(softened.status, 0);
    assert.match(softened.stderr, /preserve source assurance/i);
    review.assurance = structuredClone(source.assurance);
    review.assurance.blockingEvidence = ["new blocker"];
    await writeFile(reviewPath, `${JSON.stringify(review)}\n`, "utf8");
    assert.notEqual(run("review", sourcePath, reviewPath).status, 0);
  });
});

test("plan validation requires complexity in v2 prioritization", async () => {
  const plan = {
    schemaVersion: "2.0.0",
    prioritization: ["prerequisite", "security-severity", "complexity"],
    items: [{ id: "REM-0001", complexity: "low", complexityRationale: "Small change." }]
  };
  await withJson(plan, async (file) => {
    assert.equal(run("plan", file).status, 0);
    plan.prioritization = plan.prioritization.filter((value) => value !== "complexity");
    await writeFile(file, `${JSON.stringify(plan)}\n`, "utf8");
    assert.notEqual(run("plan", file).status, 0);
    plan.prioritization.push("complexity");
    delete plan.items[0].complexity;
    await writeFile(file, `${JSON.stringify(plan)}\n`, "utf8");
    assert.notEqual(run("plan", file).status, 0);
    plan.items[0].complexity = "low";
    delete plan.items[0].complexityRationale;
    await writeFile(file, `${JSON.stringify(plan)}\n`, "utf8");
    assert.notEqual(run("plan", file).status, 0);
  });
});

test("audit assurance accepts complete strict schema 2.1 evidence", async () => {
  await withJson(strictFindingsReport(), async (file) => {
    const result = run("findings", file);
    assert.equal(result.status, 0, result.stderr);
  });
});

test("strict audit assurance rejects omitted or weakened verification evidence", async () => {
  const cases = [
    ["missing secret evidence", (report) => { delete report.verificationEvidence.secretExposure; }, /secretExposure is required/],
    ["missing analyzer evidence", (report) => { delete report.verificationEvidence.analyzers; }, /analyzers is required/],
    ["missing resource evidence", (report) => { delete report.verificationEvidence.resourceOwnership; }, /resourceOwnership is required/],
    ["missing AI quality evidence", (report) => { delete report.verificationEvidence.aiQuality; }, /aiQuality is required/],
    ["missing assurance gates", (report) => { delete report.verificationEvidence.assuranceGates; }, /assuranceGates is required/],
    ["missing exception path", (report) => { report.verificationEvidence.resourceOwnership.checks = report.verificationEvidence.resourceOwnership.checks.filter((item) => item !== "exception"); }, /insufficient-evidence/],
    ["missing AI non-attribution check", (report) => { report.verificationEvidence.aiQuality.checks = report.verificationEvidence.aiQuality.checks.filter((item) => item !== "ai-authorship-non-inference"); }, /insufficient-evidence/],
    ["missing analyzer tool", (report) => { report.verificationEvidence.analyzers.tools = []; }, /insufficient-evidence/],
    ["stale standards evidence", (report) => { report.standards[0].accessedAt = "2020-01-01"; }, /insufficient-evidence/],
    ["normative preview", (report) => { const standard = report.standards.find((item) => item.id === "microsoft-cloud-security-benchmark"); standard.version = "v2"; standard.stability = "preview"; }, /insufficient-evidence/]
  ];
  for (const [name, mutate, expected] of cases) {
    const report = strictFindingsReport();
    mutate(report);
    await withJson(report, async (file) => {
      const result = run("findings", file);
      assert.notEqual(result.status, 0, `${name} unexpectedly passed`);
      assert.match(result.stderr, expected);
    });
  }
});

test("review validation preserves strict schema 2.1 verification evidence", async () => {
  const source = strictFindingsReport();
  await withJson(source, async (sourcePath, directory) => {
    const review = {
      schemaVersion: "2.1.0",
      reviewId: "REVIEW-0002",
      generatedAt: "2026-09-11T12:00:00.000Z",
      sourceReport: "reports/code-audit-findings.json",
      sourceAuditId: "AUDIT-0002",
      summary: { total: 0, confirmed: 0, needsMoreEvidence: 0, disputed: 0, falsePositive: 0 },
      repositoryEvidence: structuredClone(source.repositoryEvidence),
      standards: structuredClone(source.standards),
      assurance: structuredClone(source.assurance),
      verificationEvidence: structuredClone(source.verificationEvidence),
      findings: [],
      limitations: []
    };
    const reviewPath = path.join(directory, "review.json");
    await writeFile(reviewPath, `${JSON.stringify(review)}\n`, "utf8");
    assert.equal(run("review", sourcePath, reviewPath).status, 0);
    delete review.verificationEvidence.resourceOwnership;
    await writeFile(reviewPath, `${JSON.stringify(review)}\n`, "utf8");
    const omitted = run("review", sourcePath, reviewPath);
    assert.notEqual(omitted.status, 0);
    assert.match(omitted.stderr, /preserve source verification evidence exactly/);

    delete source.verificationEvidence.resourceOwnership;
    delete review.verificationEvidence;
    await writeFile(sourcePath, `${JSON.stringify(source)}\n`, "utf8");
    await writeFile(reviewPath, `${JSON.stringify(review)}\n`, "utf8");
    const invalidSource = run("review", sourcePath, reviewPath);
    assert.notEqual(invalidSource.status, 0);
    assert.match(invalidSource.stderr, /verificationEvidence\.resourceOwnership is required/);
  });
});

test("audit evidence redacts remote query credentials and fails closed on unavailable helpers", async () => {
  const project = await mkdtemp(path.join(os.tmpdir(), "pso-audit-evidence-"));
  try {
    const fixedClock = path.join(project, "fixed-clock.mjs");
    await writeFile(fixedClock, `
const NativeDate = Date;
const instant = "2026-09-11T12:00:00.000Z";
globalThis.Date = class extends NativeDate {
  constructor(...args) { super(...(args.length ? args : [instant])); }
  static now() { return NativeDate.parse(instant); }
};
`, "utf8");
    git(project, "init", "--quiet");
    git(project, "config", "user.name", "Audit Test");
    git(project, "config", "user.email", "audit@example.invalid");
    await writeFile(path.join(project, "README.md"), "fixture\n", "utf8");
    git(project, "add", "README.md", "fixed-clock.mjs");
    git(project, "commit", "--quiet", "-m", "fixture");
    await writeFile(path.join(project, "dirty-marker.txt"), "keep worktree state stable\n", "utf8");
    const sensitive = "query-secret-value";
    git(project, "remote", "add", "origin", `https://github.com/example/repository?access_token=${sensitive}#credential`);
    assert.equal(existsSync(path.join(project, ".github", "skills", "audit-code", "scripts", "audit-validate.mjs")), false);

    const auditRunId = "11111111-1111-4111-8111-111111111111";
    const collect = () => spawnSync(process.execPath, ["--import", pathToFileURL(fixedClock).href, evidenceCollector, "--root", project, "--audit-run-id", auditRunId], { cwd: root, encoding: "utf8" });
    const result = collect();
    assert.equal(result.status, 0, result.stderr);
    assert.doesNotMatch(result.stdout, new RegExp(sensitive));
    const evidence = JSON.parse(result.stdout);
    assert.equal(evidence.repository.root, ".");
    assert.equal(evidence.repository.rootResolved, true);
    assert.equal(evidence.repository.remotes[0].url, "https://github.com/example/repository");
    assert.equal(evidence.secretHistory.helperValidity.metadata, true);
    assert.equal(evidence.secretHistory.helperValidity.checkpoint, false);
    assert.equal(evidence.secretHistory.helperValidity.scanDigest, true);
    assert.equal(evidence.secretHistory.status, "ready");
    assert.equal(evidence.secretHistory.evidenceMaxAgeHours, 24);
    assert.equal(evidence.secretHistory.scanFresh, false);
    const verify = () => spawnSync(process.execPath, ["--import", pathToFileURL(fixedClock).href, evidenceCollector,
      "verify", "--root", project, "--audit-run-id", auditRunId, "--context", evidence.artifact.path, "--scan-sha256", "0".repeat(64)], {
      cwd: root, encoding: "utf8"
    });
    const publishedNames = await readdir(path.join(project, "reports", "audit-evidence"));
    const repeated = verify();
    assert.equal(repeated.status, 1);
    const inspected = JSON.parse(repeated.stdout);
    assert.equal(inspected.secretHistory.status, "blocked");
    assert.equal(inspected.secretHistory.helperValidity.checkpoint, false);
    assert.equal(inspected.secretHistory.context.sha256, evidence.artifact.sha256);
    assert.deepEqual(await readdir(path.join(project, "reports", "audit-evidence")), publishedNames);
    const evidencePath = path.join(project, evidence.artifact.path);
    await writeFile(evidencePath, "tampered\n", "utf8");
    const tampered = verify();
    assert.notEqual(tampered.status, 0);
    assert.match(tampered.stderr, /does not match its content digest/);
  } finally {
    await rm(project, { recursive: true, force: true });
  }
});

test("audit evidence accepts checkpoints for a complete large tracked diff", async () => {
  const project = await mkdtemp(path.join(os.tmpdir(), "pso-audit-large-checkpoint-"));
  try {
    const scripts = path.join(project, ".github", "skills", "audit-code", "scripts");
    await mkdir(scripts, { recursive: true });
    await copyFile(validator, path.join(scripts, "audit-validate.mjs"));
    await writeFile(path.join(project, "large.txt"), "baseline\n", "utf8");
    git(project, "init", "--quiet");
    git(project, "add", ".");
    git(project, "-c", "user.name=Audit Test", "-c", "user.email=audit@example.invalid", "-c", "commit.gpgsign=false", "commit", "--quiet", "-m", "fixture");
    await writeFile(path.join(project, "large.txt"), "large tracked fixture\n".repeat(100_000), "utf8");
    const result = spawnSync(process.execPath, [evidenceCollector, "--root", project, "--audit-run-id", "11111111-1111-4111-8111-111111111111"], {
      cwd: project, encoding: "utf8", windowsHide: true
    });
    assert.equal(result.status, 0, "large-worktree evidence collection must succeed");
    const evidence = JSON.parse(result.stdout);
    assert.deepEqual(evidence.secretHistory.helperValidity, { metadata: true, checkpoint: true, scanDigest: true });
    assert.equal(evidence.secretHistory.status, "ready");
    assert.equal(evidence.secretHistory.scanEvidence, null, "valid helpers alone do not prove a completed secret scan");
  } finally {
    await rm(project, { recursive: true, force: true });
  }
});

test("audit run identity and immutable evidence bind findings, review, and plan", async () => {
  const directory = await mkdtemp(path.join(os.tmpdir(), "pso-audit-run-binding-"));
  try {
    const auditRunId = randomUUID();
    const revision = "a".repeat(40);
    const evidence = { schemaVersion: "1.0.0", auditRunId, generatedAt: "2026-09-11T12:00:00.000Z", repository: { root: ".", rootResolved: true, head: revision } };
    const evidenceBytes = Buffer.from(`${JSON.stringify(evidence, null, 2)}\n`);
    const evidenceSha256 = createHash("sha256").update(evidenceBytes).digest("hex");
    await mkdir(path.join(directory, "reports", "audit-evidence"), { recursive: true });
    const evidenceRelative = `reports/audit-evidence/${evidenceSha256}.json`;
    await writeFile(path.join(directory, evidenceRelative), evidenceBytes);

    const findings = strictFindingsReport();
    findings.schemaVersion = "2.2.0";
    findings.auditRunId = auditRunId;
    findings.auditEvidence = { path: evidenceRelative, sha256: evidenceSha256 };
    findings.repositoryEvidence.localGit.revision = revision;
    findings.verificationEvidence.records = [{
      auditRunId, tool: "fixture", toolVersion: "1.0.0", command: "fixture --check", scope: "repository",
      configurationDigest: "b".repeat(64), exitCode: 0, status: "passed", executedAt: "2026-09-11T12:00:00.000Z",
      evidenceSha256: "c".repeat(64), repositoryRevision: revision, worktreeDigest: "d".repeat(64), inputDigest: "e".repeat(64)
    }];
    const findingsPath = path.join(directory, "reports", "findings.json");
    await writeFile(findingsPath, `${JSON.stringify(findings)}\n`);
    const findingsResult = runIn(directory, "findings", findingsPath);
    assert.equal(findingsResult.status, 0, findingsResult.stderr);

    const review = {
      schemaVersion: "2.2.0", auditRunId, auditEvidence: structuredClone(findings.auditEvidence), reviewId: "REVIEW-RUN", generatedAt: findings.generatedAt,
      sourceReport: "reports/findings.json", sourceAuditId: "AUDIT-RUN", summary: { total: 0, confirmed: 0, needsMoreEvidence: 0, disputed: 0, falsePositive: 0 },
      repositoryEvidence: structuredClone(findings.repositoryEvidence), standards: structuredClone(findings.standards), assurance: structuredClone(findings.assurance),
      verificationEvidence: structuredClone(findings.verificationEvidence), findings: [], limitations: []
    };
    const reviewPath = path.join(directory, "reports", "review.json");
    await writeFile(reviewPath, `${JSON.stringify(review)}\n`);
    assert.equal(runIn(directory, "review", findingsPath, reviewPath).status, 0);

    const reviewBytes = await import("node:fs/promises").then(({ readFile }) => readFile(reviewPath));
    const plan = { schemaVersion: "2.1.0", auditRunId, planId: "PLAN-RUN", generatedAt: findings.generatedAt, sourceReview: "reports/review.json", sourceReviewSha256: createHash("sha256").update(reviewBytes).digest("hex"), prioritization: ["complexity"], milestones: [], items: [], dispositions: [], limitations: [] };
    const planPath = path.join(directory, "reports", "plan.json");
    await writeFile(planPath, `${JSON.stringify(plan)}\n`);
    assert.equal(runIn(directory, "plan", planPath).status, 0);

    review.auditRunId = randomUUID();
    await writeFile(reviewPath, `${JSON.stringify(review)}\n`);
    assert.notEqual(runIn(directory, "review", findingsPath, reviewPath).status, 0);
    assert.notEqual(runIn(directory, "plan", planPath).status, 0);
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
});