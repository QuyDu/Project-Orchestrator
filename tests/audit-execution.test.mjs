import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { spawnSync } from "node:child_process";
import { mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import test from "node:test";

const root = path.resolve(import.meta.dirname, "..");
const validator = path.join(root, ".github", "skills", "audit-code", "scripts", "audit-validate.mjs");
const fixtureAuditRunId = "123e4567-e89b-42d3-a456-426614174000";
const oneMiB = 1024 * 1024;
const checkpointStatePaths = [
  "reports/audit-remediation-execution.json",
  "reports/audit-remediation-execution.md",
  "reports/current-execution-state.json",
  "reports/current-execution-state.md",
  "reports/execution-log.jsonl",
  "reports/project-handoff.json",
  "reports/project-handoff.md",
  "reports/current-work-state.json",
  "reports/change-review.json",
  "reports/change-review.md",
  "reports/policy-evaluation.json",
  "reports/policy-evaluation.md",
  "reports/policy-decision-log.jsonl",
  "reports/gitleaks-scan.json"
];
const checkpointDiffArguments = [
  "diff", "--binary", "--no-ext-diff", "HEAD", "--", ".",
  ...checkpointStatePaths.map((file) => `:(exclude)${file}`)
];

function run(...args) {
  return spawnSync(process.execPath, [validator, ...args], { cwd: root, encoding: "utf8" });
}

function git(cwd, ...args) {
  const result = spawnSync("git", args, { cwd, encoding: "utf8" });
  assert.equal(result.status, 0, result.stderr);
  return result.stdout.trim();
}

async function withCheckpointRepository(action) {
  const repository = await mkdtemp(path.join(os.tmpdir(), "pso-checkpoint-"));
  const environment = {
    ...process.env,
    GIT_CONFIG_NOSYSTEM: "1",
    GIT_CONFIG_GLOBAL: path.join(repository, "absent-global-config"),
    GIT_CONFIG_COUNT: "6",
    GIT_CONFIG_KEY_0: "core.autocrlf", GIT_CONFIG_VALUE_0: "false",
    GIT_CONFIG_KEY_1: "user.name", GIT_CONFIG_VALUE_1: "Audit Test",
    GIT_CONFIG_KEY_2: "user.email", GIT_CONFIG_VALUE_2: "audit@example.invalid",
    GIT_CONFIG_KEY_3: "commit.gpgsign", GIT_CONFIG_VALUE_3: "false",
    GIT_CONFIG_KEY_4: "core.hooksPath", GIT_CONFIG_VALUE_4: path.join(repository, "absent-hooks"),
    GIT_CONFIG_KEY_5: "core.longpaths", GIT_CONFIG_VALUE_5: "true"
  };
  delete environment.GIT_CONFIG_PARAMETERS;
  const gitBytes = (args) => {
    const result = spawnSync("git", args, {
      cwd: repository, env: environment, encoding: null, windowsHide: true,
      maxBuffer: 16 * oneMiB
    });
    assert.equal(result.error, undefined, "complete-byte fixture Git command must not truncate");
    assert.equal(result.status, 0, "complete-byte fixture Git command must succeed");
    return result.stdout;
  };
  const checkpoint = (env = environment) => spawnSync(process.execPath, [validator, "checkpoint", repository], {
    cwd: repository, env, encoding: "utf8", windowsHide: true, timeout: 30_000, maxBuffer: 16 * oneMiB
  });
  try {
    await mkdir(path.join(repository, "reports"));
    await mkdir(path.join(repository, "src"));
    await writeFile(path.join(repository, ".gitignore"), "ignored.txt\n", "utf8");
    await writeFile(path.join(repository, "reports", "tracked.txt"), "baseline\n", "utf8");
    await writeFile(path.join(repository, "reports", "tracked.bin"), Buffer.from([0, 1, 2, 3]));
    await writeFile(path.join(repository, "src", "tracked.mjs"), "export const value = 1;\n", "utf8");
    gitBytes(["init", "--quiet"]);
    gitBytes(["add", "."]);
    gitBytes(["commit", "--quiet", "-m", "checkpoint fixture"]);
    await action({ repository, environment, gitBytes, checkpoint });
  } finally {
    await rm(repository, { recursive: true, force: true });
  }
}

async function completeByteCheckpoint(repository, gitBytes) {
  const revision = gitBytes(["rev-parse", "HEAD"]).toString("utf8").trim();
  const diff = gitBytes(checkpointDiffArguments);
  const files = gitBytes(["ls-files", "--others", "--exclude-standard", "-z"])
    .toString("utf8").split("\0").filter((file) => file && !checkpointStatePaths.includes(file)).sort();
  const bytes = [
    Buffer.from(`${revision}\0`), diff,
    Buffer.from(`\0${files.join("\0")}${files.length ? "\0" : ""}`)
  ];
  for (const file of files) {
    bytes.push(Buffer.from(`\0${file}\0`), await readFile(path.join(repository, file)));
  }
  return {
    diff,
    value: {
      status: "valid", command: "checkpoint", repositoryRevision: revision,
      worktreeDigest: createHash("sha256").update(Buffer.concat(bytes)).digest("hex")
    }
  };
}

for (const kind of ["textual", "binary"]) {
  for (const diffBytes of [oneMiB - 1, oneMiB, oneMiB + 1, 4 * oneMiB + 1]) {
    test(`checkpoint hashes the complete ${kind} diff at ${diffBytes} bytes`, async () => {
      await withCheckpointRepository(async ({ repository, gitBytes, checkpoint }) => {
        await writeFile(path.join(repository, "reports", "tracked.txt"), "x\n", "utf8");
        await writeFile(path.join(repository, "src", "tracked.mjs"), "export const value = 2;\n", "utf8");
        if (kind === "binary") {
          const payload = Buffer.alloc(oneMiB / 2);
          let state = 0x12345678;
          for (let index = 0; index < payload.length; index++) {
            state ^= state << 13;
            state ^= state >>> 17;
            state ^= state << 5;
            payload[index] = state & 0xff;
          }
          payload[0] = 0;
          await writeFile(path.join(repository, "reports", "tracked.bin"), payload);
          gitBytes(["add", "reports/tracked.bin"]);
        }
        // A tracked text line sizes the complete diff exactly, including binary patch framing.
        const padding = diffBytes - gitBytes(checkpointDiffArguments).length + 1;
        assert.ok(padding > 0);
        await writeFile(path.join(repository, "reports", "tracked.txt"), `${"x".repeat(padding)}\n`, "utf8");
        const expected = await completeByteCheckpoint(repository, gitBytes);
        assert.equal(expected.diff.length, diffBytes);
        assert.equal(expected.diff.includes(Buffer.from("GIT binary patch")), kind === "binary");
        const result = checkpoint();
        assert.equal(result.status, 0, `${kind} diff (${diffBytes} bytes) must produce a complete checkpoint`);
        assert.deepEqual(JSON.parse(result.stdout), expected.value);
        assert.equal(result.stderr, "");
      });
    });
  }
}

test("checkpoint preserves untracked source, report, binary, Unicode and workflow-state semantics", async () => {
  await withCheckpointRepository(async ({ repository, gitBytes, checkpoint }) => {
    const source = path.join(repository, "src", "évidence-λ.mjs");
    const report = path.join(repository, "reports", "code-audit-findings.json");
    const state = path.join(repository, "reports", "current-execution-state.json");
    await writeFile(source, "export const untracked = 1;\n", "utf8");
    await writeFile(report, '{"findings":[]}\n', "utf8");
    await writeFile(path.join(repository, "z-untracked.bin"), Buffer.alloc(oneMiB + 17, 0xa5));
    await writeFile(path.join(repository, "ignored.txt"), "ignored input\n", "utf8");
    await writeFile(state, '{"status":"running"}\n', "utf8");
    const check = async () => {
      const result = checkpoint();
      assert.equal(result.status, 0, "untracked inputs must produce a checkpoint");
      const expected = await completeByteCheckpoint(repository, gitBytes);
      const actual = JSON.parse(result.stdout);
      assert.deepEqual(actual, expected.value);
      return actual.worktreeDigest;
    };
    const original = await check();
    await writeFile(state, '{"status":"completed"}\n', "utf8");
    await writeFile(path.join(repository, "ignored.txt"), "updated ignored input\n", "utf8");
    assert.equal(await check(), original);
    await writeFile(source, "export const untracked = 2;\n", "utf8");
    const sourceChanged = await check();
    assert.notEqual(sourceChanged, original);
    await writeFile(report, '{"findings":[{"id":"AUD-0146"}]}\n', "utf8");
    assert.notEqual(await check(), sourceChanged);
  });
});

test("checkpoint fails closed with sanitized Git subprocess diagnostics", async () => {
  await withCheckpointRepository(async ({ repository, environment, checkpoint }) => {
    const marker = "private-git-diagnostic-fixture";
    const env = {
      ...environment, GIT_CONFIG_COUNT: "7",
      GIT_CONFIG_KEY_6: "diff.context", GIT_CONFIG_VALUE_6: marker
    };
    const control = spawnSync("git", checkpointDiffArguments, { cwd: repository, env, encoding: "utf8" });
    assert.notEqual(control.status, 0, "the real Git diff subprocess must fail");
    assert.equal(control.stderr.includes(marker), true, "the control must emit the sensitive diagnostic");
    const result = checkpoint(env);
    assert.equal(result.status, 1);
    assert.equal(result.stdout, "");
    assert.equal(result.stderr.includes(marker), false, "checkpoint must not echo Git output");
    assert.match(result.stderr, /could not inspect resume repository: git diff exited with status \d+/);
    assert.equal(checkpoint().status, 0, "failed subprocess handling must not affect the next checkpoint");
  });
});

test("checkpoint reports unavailable Git without masking its spawn error", async () => {
  await withCheckpointRepository(async ({ repository, environment, checkpoint }) => {
    const env = Object.fromEntries(Object.entries(environment).filter(([key]) => key.toLowerCase() !== "path"));
    env.PATH = path.join(repository, "absent-executables");
    const result = checkpoint(env);
    assert.equal(result.status, 1);
    assert.equal(result.stdout, "");
    assert.match(result.stderr, /could not inspect resume repository: git rev-parse could not start \(ENOENT\)/);
    assert.doesNotMatch(result.stderr, /TypeError|reading 'trim'/);
  });
});

function plan() {
  return {
    schemaVersion: "2.0.0",
    auditRunId: fixtureAuditRunId,
    planId: "PLAN-TEST",
    sourceReview: "reports/code-audit-review.json",
    prioritization: ["prerequisite", "complexity"],
    milestones: [
      { id: "P2", itemIds: ["REM-0203"] },
      { id: "P3", itemIds: ["REM-0204"] }
    ],
    items: [
      { id: "REM-0203", findingIds: ["AUD-0203"], dependsOn: [], complexity: "medium", complexityRationale: "Test fixture." },
      { id: "REM-0204", findingIds: ["AUD-0204"], dependsOn: ["REM-0203"], complexity: "high", complexityRationale: "Test fixture." }
    ]
  };
}

function execution(planSnapshot) {
  return {
    schemaVersion: "3.0.0",
    executionId: "EXEC-TEST",
    sourcePlan: {
      path: planSnapshot.path,
      planId: "PLAN-TEST",
      sha256: planSnapshot.sha256,
      sourceReview: "reports/code-audit-review.json"
    },
    selection: { mode: "phase", value: "P2", includedPrerequisites: [] },
    status: "completed",
    items: [{
      id: "REM-0203",
      findingIds: ["AUD-0203"],
      phaseIds: ["P2"],
      status: "completed",
      changedPaths: ["schemas/audit-remediation-execution.schema.json"],
      validation: [{ command: "node --test", status: "passed", exitCode: 0, evidence: "passed" }],
      approvals: ["P2 approved"],
      residualRisk: "Re-audit required.",
      rollbackStatus: "not-required",
      checkpointId: "CP-P2"
    }],
    checkpoints: [{
      id: "CP-P2",
      status: "terminal",
      completedItemIds: ["REM-0203"],
      remainingItemIds: ["REM-0204"],
      repositoryRevision: "a".repeat(40),
      worktreeDigest: "b".repeat(64)
    }],
    remaining: { itemIds: ["REM-0204"], findingIds: ["AUD-0204"], phaseIds: ["P3"] },
    pendingApprovals: ["P3 requires external approval."],
    limitations: [],
    nextAction: { status: "approval-required", action: "Approve P3." }
  };
}

async function withArtifacts(action) {
  const directory = await mkdtemp(path.join(os.tmpdir(), "pso-audit-execution-"));
  const repository = path.join(directory, "repository");
  const reports = path.join(repository, "reports");
  const canonicalPlanPath = path.join(reports, "audit-remediation-plan.json");
  const executionPath = path.join(directory, "execution.json");
  try {
    await mkdir(reports, { recursive: true });
    const planText = `${JSON.stringify(plan())}\n`;
    await writeFile(canonicalPlanPath, planText, "utf8");
    const snapshotResult = run("snapshot", canonicalPlanPath, repository);
    assert.equal(snapshotResult.status, 0, snapshotResult.stderr);
    const snapshot = JSON.parse(snapshotResult.stdout);
    const repeatedSnapshot = run("snapshot", canonicalPlanPath, repository);
    assert.equal(repeatedSnapshot.status, 0, repeatedSnapshot.stderr);
    assert.deepEqual(JSON.parse(repeatedSnapshot.stdout), snapshot);
    const planPath = path.join(repository, ...snapshot.path.split("/"));
    const validate = (...extra) => run("execution", planPath, executionPath, "--root", repository, ...extra);
    await action({ repository, canonicalPlanPath, planPath, executionPath, validate, value: execution(snapshot) });
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
}

test("snapshot validation accepts a canonical repository root alias", async (context) => {
  const directory = await mkdtemp(path.join(os.tmpdir(), "pso-audit-root-alias-"));
  const canonicalDirectory = await import("node:fs/promises").then(({ realpath }) => realpath(directory));
  if (canonicalDirectory === directory) {
    await rm(directory, { recursive: true, force: true });
    return context.skip("The temporary directory has no filesystem alias");
  }
  try {
    const reports = path.join(directory, "reports");
    await mkdir(reports, { recursive: true });
    const canonicalPlanPath = path.join(reports, "audit-remediation-plan.json");
    await writeFile(canonicalPlanPath, `${JSON.stringify(plan())}\n`, "utf8");
    const result = run("snapshot", canonicalPlanPath, directory);
    assert.equal(result.status, 0, result.stderr);
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
});

test("execution validation accepts completed selected scope with unselected work remaining", async () => {
  await withArtifacts(async ({ executionPath, validate, value }) => {
    await writeFile(executionPath, `${JSON.stringify(value)}\n`, "utf8");
    const result = validate();
    assert.equal(result.status, 0, result.stderr);
  });
});

test("immutable plan snapshot survives canonical replacement", async () => {
  await withArtifacts(async ({ canonicalPlanPath, executionPath, validate, value }) => {
    await writeFile(executionPath, `${JSON.stringify(value)}\n`, "utf8");
    assert.equal(validate().status, 0);
    await writeFile(canonicalPlanPath, `${JSON.stringify({ ...plan(), planId: "PLAN-NEXT" })}\n`, "utf8");
    assert.equal(validate().status, 0);
  });
});

test("immutable plan snapshot rejects tampering and escaping paths", async () => {
  await withArtifacts(async ({ planPath, executionPath, validate, value }) => {
    value.sourcePlan.path = "../outside.json";
    await writeFile(executionPath, `${JSON.stringify(value)}\n`, "utf8");
    assert.notEqual(validate().status, 0);
    value.sourcePlan.path = `reports/audit-remediation-plans/${value.sourcePlan.sha256}.json`;
    await writeFile(planPath, "{}\n", "utf8");
    await writeFile(executionPath, `${JSON.stringify(value)}\n`, "utf8");
    assert.notEqual(validate().status, 0);
  });
});

test("execution validation rejects illegal terminal states", async () => {
  const mutations = [
    ["plan digest mismatch", (value) => { value.sourcePlan.sha256 = "0".repeat(64); }],
    ["invalid phase selector", (value) => { value.selection.value = "missing"; }],
    ["invalid finding selector", (value) => { value.selection.mode = "finding"; value.selection.value = "not-an-audit-id"; }],
    ["unvalidated completion", (value) => { value.items[0].validation = []; }],
    ["failed validation", (value) => { value.items[0].validation[0].status = "failed"; value.items[0].validation[0].exitCode = 1; }],
    ["missing checkpoint", (value) => { value.items[0].checkpointId = null; }],
    ["missing checkpoint membership", (value) => { value.checkpoints[0].completedItemIds = []; }],
    ["duplicate checkpoint IDs", (value) => { value.checkpoints.push(structuredClone(value.checkpoints[0])); }],
    ["unresolved selected item", (value) => { value.items[0].status = "running"; }],
    ["remaining set mismatch", (value) => { value.remaining.itemIds = []; }]
  ];
  for (const [name, mutate] of mutations) {
    await withArtifacts(async ({ executionPath, validate, value }) => {
      mutate(value);
      await writeFile(executionPath, `${JSON.stringify(value)}\n`, "utf8");
      const result = validate();
      assert.notEqual(result.status, 0, name);
      assert.match(result.stderr, /Audit validation failed/);
    });
  }
});

test("execution validation rejects completed dependents when prerequisites did not complete", async () => {
  await withArtifacts(async ({ executionPath, validate, value }) => {
    value.selection = { mode: "phase", value: "P3", includedPrerequisites: ["REM-0203"] };
    value.items[0].status = "failed";
    value.items[0].checkpointId = null;
    value.items.push({
      ...structuredClone(value.items[0]),
      id: "REM-0204",
      findingIds: ["AUD-0204"],
      phaseIds: ["P3"],
      status: "completed",
      checkpointId: "CP-P2"
    });
    value.checkpoints[0].completedItemIds = ["REM-0204"];
    value.checkpoints[0].remainingItemIds = ["REM-0203"];
    value.remaining = { itemIds: ["REM-0203"], findingIds: ["AUD-0203"], phaseIds: ["P2"] };
    await writeFile(executionPath, `${JSON.stringify(value)}\n`, "utf8");
    assert.notEqual(validate().status, 0);
  });
});

test("all-scope completion rejects pending approvals", async () => {
  await withArtifacts(async ({ executionPath, validate, value }) => {
    value.selection = { mode: "all", value: null, includedPrerequisites: [] };
    value.items.push({
      ...structuredClone(value.items[0]),
      id: "REM-0204",
      findingIds: ["AUD-0204"],
      phaseIds: ["P3"]
    });
    value.checkpoints[0].completedItemIds = ["REM-0203", "REM-0204"];
    value.checkpoints[0].remainingItemIds = [];
    value.remaining = { itemIds: [], findingIds: [], phaseIds: [] };
    await writeFile(executionPath, `${JSON.stringify(value)}\n`, "utf8");
    assert.notEqual(validate().status, 0);
    value.pendingApprovals = [];
    value.nextAction = { status: "complete", action: "No work remains." };
    await writeFile(executionPath, `${JSON.stringify(value)}\n`, "utf8");
    assert.equal(validate().status, 0);
  });
});

test("resume validation rejects repository and same-status content drift", async () => {
  await withArtifacts(async ({ executionPath, validate, value }) => {
    const resumeRepository = path.join(path.dirname(executionPath), "resume-repository");
    await mkdir(resumeRepository);
    git(resumeRepository, "init", "--quiet");
    git(resumeRepository, "config", "user.name", "Audit Test");
    git(resumeRepository, "config", "user.email", "audit@example.invalid");
    await writeFile(path.join(resumeRepository, "tracked.txt"), "baseline\n", "utf8");
    git(resumeRepository, "add", "tracked.txt");
    git(resumeRepository, "commit", "--quiet", "-m", "baseline");
    value.selection = { mode: "resume", value: null, includedPrerequisites: [] };
    await writeFile(path.join(resumeRepository, "tracked.txt"), "first change\n", "utf8");
    const checkpoint = JSON.parse(run("checkpoint", resumeRepository).stdout);
    value.checkpoints[0].repositoryRevision = checkpoint.repositoryRevision;
    value.checkpoints[0].worktreeDigest = checkpoint.worktreeDigest;
    await writeFile(executionPath, `${JSON.stringify(value)}\n`, "utf8");
    assert.equal(validate("--resume-root", resumeRepository).status, 0);
    await mkdir(path.join(resumeRepository, "reports"));
    await writeFile(path.join(resumeRepository, "reports", "audit-remediation-execution.json"), "state update\n", "utf8");
    assert.equal(validate("--resume-root", resumeRepository).status, 0);
    await writeFile(path.join(resumeRepository, "tracked.txt"), "second change\n", "utf8");
    const result = validate("--resume-root", resumeRepository);
    assert.notEqual(result.status, 0);
    assert.match(result.stderr, /worktree digest/i);
  });
});

test("schema 3.1 execution requires the immutable plan audit run", async () => {
  await withArtifacts(async ({ executionPath, validate, value }) => {
    value.schemaVersion = "3.1.0";
    value.auditRunId = fixtureAuditRunId;
    await writeFile(executionPath, `${JSON.stringify(value)}\n`, "utf8");
    assert.equal(validate().status, 0);
    value.auditRunId = "223e4567-e89b-42d3-a456-426614174000";
    await writeFile(executionPath, `${JSON.stringify(value)}\n`, "utf8");
    const mismatch = validate();
    assert.notEqual(mismatch.status, 0);
    assert.match(mismatch.stderr, /auditRunId does not match plan/);
  });
});