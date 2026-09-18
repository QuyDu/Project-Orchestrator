import assert from "node:assert/strict";
import { mkdtemp, mkdir, readFile, rm, symlink, writeFile } from "node:fs/promises";
import { existsSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import { spawnSync } from "node:child_process";
import test from "node:test";

const root = path.resolve(import.meta.dirname, "..");
const runtime = path.join(root, "pso.mjs");

function run(...args) {
  return spawnSync(process.execPath, [runtime, ...args], { cwd: root, encoding: "utf8" });
}

async function installWorkflowOwners(project) {
  const definitions = {
    "project-skills-orchestrator": "Routes governed workflows.",
    "project-handoff": "Publishes workflow continuity.",
    "workflow-planner": "Builds workflow plans.",
    "azure-discovery": "Discover Azure availability and supported service configuration.",
    "clarify-the-ask": "Clarify user intent before Azure discovery."
  };
  for (const [skillName, description] of Object.entries(definitions)) {
    const skillRoot = path.join(project, ".github", "skills", skillName);
    await mkdir(skillRoot, { recursive: true });
    const dependencies = skillName === "azure-discovery" ? "\n## Composition and Dependencies\n\n- `clarify-the-ask`\n" : "";
    await writeFile(path.join(skillRoot, "SKILL.md"), `---\nname: ${skillName}\ndescription: ${description}\n---\n${dependencies}`, "utf8");
  }
}

test("configuration parser fails closed for adversarial structured inputs", async () => {
  const invalidConfigurations = [
    null,
    [],
    { schemaVersion: "0.0.0" },
    { schemaVersion: "1.0.0", profile: "../../advanced" },
    { schemaVersion: "1.0.0", platforms: "github-copilot" },
    { schemaVersion: "1.0.0", platforms: { agent: "unknown", ci: "auto" } },
    { schemaVersion: "1.0.0", platforms: { agent: "github-copilot", ci: "unknown" } },
    { schemaVersion: "1.0.0", packs: ["core", "core"] },
    { schemaVersion: "1.0.0", routing: { precedence: ["framework", "framework"] } },
    { schemaVersion: "1.0.0", clarification: true },
    { schemaVersion: "1.0.0", clarification: { enabled: true, maxQuestionsPerRound: 0, blockOnMaterialAmbiguity: true } },
    { schemaVersion: "1.0.0", clarification: { enabled: true, maxQuestionsPerRound: 11, blockOnMaterialAmbiguity: true } },
    { schemaVersion: "1.0.0", clarification: { enabled: true, maxQuestionsPerRound: 3, blockOnMaterialAmbiguity: true, bypassSafety: true } },
    { schemaVersion: "1.0.0", policy: { requireApprovalFor: ["bypass-security"] } },
    { schemaVersion: "1.0.0", __proto__: { polluted: true }, unexpected: true }
  ];
  for (const configuration of invalidConfigurations) {
    const project = await mkdtemp(path.join(os.tmpdir(), "pso-config-fuzz-"));
    try {
      await writeFile(path.join(project, "package.json"), "{\"name\":\"config-fuzz\"}\n", "utf8");
      await mkdir(path.join(project, "config"), { recursive: true });
      await writeFile(path.join(project, "config", "skills-orchestrator.json"), `${JSON.stringify(configuration)}\n`, "utf8");
      const result = run("adopt", "--project", project, "--dry-run");
      assert.notEqual(result.status, 0, `configuration unexpectedly accepted: ${JSON.stringify(configuration)}`);
      assert.match(`${result.stdout}${result.stderr}`, /Error:/);
    } finally {
      await rm(project, { recursive: true, force: true });
    }
  }
});

test("update selection rejects unknown fields, duplicates, and unsafe exact paths", async () => {
  const parent = await mkdtemp(path.join(os.tmpdir(), "pso-selection-fuzz-"));
  try {
    const created = run("create-project", "--name", "Selection Fuzz", "--destination", parent, "--accept-risk");
    assert.equal(created.status, 0, created.stderr);
    const project = path.join(parent, "selection-fuzz");
    const selectionPath = path.join(parent, "selection.json");
    const target = { projectName: "selection-fuzz", frameworkVersion: "9.0.0", runtimeVersion: "1.1.2" };
    const invalidSelections = [
      { schemaVersion: "1.0.0", expectedPlanDigest: "0".repeat(64), target, selectors: { skills: [], assets: [], extra: true } },
      { schemaVersion: "1.0.0", expectedPlanDigest: "0".repeat(64), target, selectors: { skills: ["workflow-planner", "workflow-planner"], assets: [] } },
      { schemaVersion: "1.0.0", expectedPlanDigest: "0".repeat(64), target, selectors: { skills: [], assets: ["schemas/x.json", "SCHEMAS/X.JSON"] } },
      { schemaVersion: "1.0.0", expectedPlanDigest: "0".repeat(64), target, selectors: { skills: [], assets: ["../outside.txt"] } },
      { schemaVersion: "1.0.0", expectedPlanDigest: "0".repeat(64), target, selectors: { skills: [], assets: ["C:/outside.txt"] } },
      { schemaVersion: "1.0.0", expectedPlanDigest: "0".repeat(64), target, selectors: { skills: [], assets: [] }, resolutions: [{ asset: "schemas/x.json", disposition: "keep" }, { asset: "schemas/x.json", disposition: "replace" }] },
      { schemaVersion: "1.0.0", expectedPlanDigest: "0".repeat(64), target, selectors: { skills: [], assets: ["schemas/*.json"] }, exactForcePaths: ["schemas/*.json"] },
      { schemaVersion: "1.0.0", expectedPlanDigest: "0".repeat(64), target, selectors: { skills: [], assets: ["schemas/"] }, exactForcePaths: ["schemas/"] },
      { schemaVersion: "1.0.0", expectedPlanDigest: "0".repeat(64), target, selectors: { skills: ["azure-discovery"], assets: [] }, resolutions: [{ asset: ".github/skills/azure-discovery/SKILL.md", disposition: "fork" }] },
      { schemaVersion: "1.0.0", expectedPlanDigest: "0".repeat(64), target, selectors: { skills: ["azure-discovery"], assets: [] }, resolutions: [{ asset: ".github/skills/azure-discovery/SKILL.md", disposition: "keep", forkSkillId: "unexpected-fork" }] },
      { schemaVersion: "1.0.0", expectedPlanDigest: "0".repeat(64), target, selectors: { skills: [], assets: ["schemas/project-update-plan.schema.json"] }, resolutions: [{ asset: "schemas/project-update-plan.schema.json", disposition: "fork", forkSkillId: "not-a-skill" }] }
    ];
    for (const selection of invalidSelections) {
      await writeFile(selectionPath, `${JSON.stringify(selection, null, 2)}\n`, "utf8");
      const result = run("update", "--project", project, "--mode", "select", "--selection-file", selectionPath);
      assert.notEqual(result.status, 0, `selection unexpectedly accepted: ${JSON.stringify(selection)}`);
      assert.match(`${result.stdout}${result.stderr}`, /Error:/);
      const applied = run("update", "--project", project, "--mode", "select", "--selection-file", selectionPath, "--apply", "--accept-risk");
      assert.notEqual(applied.status, 0, `selection unexpectedly applied: ${JSON.stringify(selection)}`);
      assert.match(`${applied.stdout}${applied.stderr}`, /Error:/);
      assert.equal(existsSync(path.join(project, "reports", "update-verification.json")), false);
    }
  } finally {
    await rm(parent, { recursive: true, force: true });
  }
});

test("update rejects malformed, unsupported, and colliding manifest-lock baselines", async () => {
  const parent = await mkdtemp(path.join(os.tmpdir(), "pso-baseline-fuzz-"));
  try {
    const created = run("create-project", "--name", "Baseline Fuzz", "--destination", parent, "--accept-risk");
    assert.equal(created.status, 0, created.stderr);
    const source = path.join(parent, "baseline-fuzz");
    const originalManifest = JSON.parse(await readFile(path.join(source, "project-orchestrator.json"), "utf8"));
    const originalLock = JSON.parse(await readFile(path.join(source, "project-orchestrator.lock.json"), "utf8"));
    const forkContractPath = ".github/skills/azure-discovery/SKILL.md";
    const legacyManifest = { ...originalManifest, schemaVersion: "1.0.0" };
    for (const field of ["lockPath", "lockSchemaVersion", "digestAlgorithm", "installedSource", "minimumUpdaterRuntimeVersion", "lastSuccessfulReconciliation"]) {
      delete legacyManifest[field];
    }
    const cases = [
      ["manifest 1.1 missing lock", originalManifest, null, /manifest 1\.1 requires a valid lock.*restore both files.*downgrade/is],
      ["manifest 1.0 interrupted cutover", legacyManifest, originalLock, /manifest 1\.0 must not have a 1\.1 baseline lock.*pre-migration pair/is],
      ["unsupported old manifest", { ...originalManifest, schemaVersion: "0.9.0" }, originalLock, /Unsupported manifest schemaVersion: 0\.9\.0.*compatible updater.*prior manifest and lock pair/is],
      ["unsupported new manifest", { ...originalManifest, schemaVersion: "2.0.0" }, originalLock, /Unsupported manifest schemaVersion: 2\.0\.0.*compatible updater.*prior manifest and lock pair/is],
      ["unsupported old lock", originalManifest, { ...originalLock, schemaVersion: "0.9.0" }, /Unsupported lock schemaVersion: 0\.9\.0.*compatible updater.*prior manifest and lock pair/is],
      ["unsupported new lock", originalManifest, { ...originalLock, schemaVersion: "2.0.0" }, /Unsupported lock schemaVersion: 2\.0\.0.*compatible updater.*prior manifest and lock pair/is],
      ["malformed minimum updater", { ...originalManifest, minimumUpdaterRuntimeVersion: "latest" }, originalLock, /valid minimumUpdaterRuntimeVersion/i],
      ["newer minimum updater", { ...originalManifest, minimumUpdaterRuntimeVersion: "99.0.0" }, originalLock, /updater runtime 1\.1\.2 is older than required minimum 99\.0\.0.*compatible updater.*downgrade/is],
      ["duplicate IDs", originalManifest, { ...originalLock, entries: [originalLock.entries[0], { ...originalLock.entries[1], assetId: originalLock.entries[0].assetId }] }, /duplicate asset IDs/i],
      ["duplicate paths", originalManifest, { ...originalLock, entries: [originalLock.entries[0], { ...originalLock.entries[0] }] }, /Duplicate baseline path/i],
      ["case-colliding paths", originalManifest, { ...originalLock, entries: [originalLock.entries[0], { ...originalLock.entries[1], assetId: `managed:${originalLock.entries[0].path.toUpperCase()}`, path: originalLock.entries[0].path.toUpperCase() }] }, /Case-collision baseline paths/i],
      ["path alias", originalManifest, { ...originalLock, entries: [{ ...originalLock.entries[0], assetId: "managed:schemas\\alias.json", path: "schemas\\alias.json" }] }, /baseline path is not canonical/i],
      ["unsafe path", originalManifest, { ...originalLock, entries: [{ ...originalLock.entries[0], assetId: "managed:../outside", path: "../outside" }] }, /Unsafe managed path/i],
      ["unresolved dependency", originalManifest, { ...originalLock, entries: [{ ...originalLock.entries[0], dependencies: ["managed:missing"] }] }, /reference.*does not resolve/i],
      ["unknown entry field", originalManifest, { ...originalLock, entries: [{ ...originalLock.entries[0], unexpected: true }] }, /unknown.*baseline lock entry.*unexpected/i],
      ["unknown policy", originalManifest, { ...originalLock, entries: [{ ...originalLock.entries[0], policy: "freeze" }] }, /invalid update baseline policy/i],
      ["arbitrary scope", originalManifest, { ...originalLock, entries: [{ ...originalLock.entries[0], scope: "operator-invented" }] }, /invalid update baseline scope/i],
      ["mismatched generated scope", originalManifest, { ...originalLock, entries: [{ ...originalLock.entries[0], scope: "scaffold:prompt" }] }, /invalid update baseline scope/i],
      ["inconsistent ownership", originalManifest, { ...originalLock, entries: [{ ...originalLock.entries[0], ownership: "project-owned", policy: "track" }] }, /ownership.*policy/i],
      ["duplicate dependencies", originalManifest, { ...originalLock, entries: [{ ...originalLock.entries[0], dependencies: [originalLock.entries[1].assetId, originalLock.entries[1].assetId] }] }, /duplicate.*dependencies/i],
      ["duplicate companions", originalManifest, { ...originalLock, entries: [{ ...originalLock.entries[0], generatedCompanions: [originalLock.entries[1].assetId, originalLock.entries[1].assetId] }] }, /duplicate.*generatedCompanions/i],
      ["fork on non-contract", originalManifest, { ...originalLock, entries: [{ ...originalLock.entries[0], policy: "fork", forkSkillId: "project-copy" }] }, /fork policy.*skill contract/i],
      ["missing fork reference", originalManifest, { ...originalLock, entries: originalLock.entries.map((entry) => entry.path === forkContractPath ? { ...entry, policy: "fork", forkSkillId: "project-missing" } : entry) }, /fork reference.*valid project-owned skill/i],
      ["framework fork reference", originalManifest, { ...originalLock, entries: originalLock.entries.map((entry) => entry.path === forkContractPath ? { ...entry, policy: "fork", forkSkillId: "workflow-planner" } : entry) }, /fork reference.*valid project-owned skill/i]
    ];
    for (const [name, manifest, lock, expected] of cases) {
      const project = path.join(parent, name.replaceAll(" ", "-"));
      await mkdir(project, { recursive: true });
      await writeFile(path.join(project, "package.json"), "{\"name\":\"baseline-case\"}\n", "utf8");
      await writeFile(path.join(project, "project-orchestrator.json"), `${JSON.stringify(manifest, null, 2)}\n`, "utf8");
      if (lock) await writeFile(path.join(project, "project-orchestrator.lock.json"), `${JSON.stringify(lock, null, 2)}\n`, "utf8");
      if (name === "framework fork reference") {
        const frameworkFork = path.join(project, ".github", "skills", "workflow-planner");
        await mkdir(frameworkFork, { recursive: true });
        await writeFile(path.join(frameworkFork, "SKILL.md"), "---\nname: workflow-planner\ndescription: Framework-managed fixture.\n---\n", "utf8");
      }
      const watched = ["project-orchestrator.json", "project-orchestrator.lock.json", "reports/project-update-plan.json", "reports/project-update-plan.md"];
      const before = new Map(await Promise.all(watched.map(async (relative) => [
        relative,
        existsSync(path.join(project, relative)) ? await readFile(path.join(project, relative)) : null
      ])));
      const result = run("update", "--project", project);
      assert.notEqual(result.status, 0, name);
      assert.match(`${result.stdout}${result.stderr}`, expected, name);
      const applied = run("update", "--project", project, "--apply", "--accept-risk");
      assert.notEqual(applied.status, 0, `${name} apply`);
      assert.match(`${applied.stdout}${applied.stderr}`, expected, `${name} apply`);
      for (const [relative, content] of before) {
        if (content === null) assert.equal(existsSync(path.join(project, relative)), false, `${name}: ${relative} should remain absent`);
        else assert.deepEqual(await readFile(path.join(project, relative)), content, `${name}: ${relative} should remain unchanged`);
      }
    }
  } finally {
    await rm(parent, { recursive: true, force: true });
  }
});

test("manifest 1.1 and lock 1.0 accept an older compatible minimum updater", async () => {
  const parent = await mkdtemp(path.join(os.tmpdir(), "pso-compatible-minimum-"));
  try {
    const created = run("create-project", "--name", "Compatible Minimum", "--destination", parent, "--accept-risk");
    assert.equal(created.status, 0, created.stderr);
    const project = path.join(parent, "compatible-minimum");
    const manifestPath = path.join(project, "project-orchestrator.json");
    const manifest = JSON.parse(await readFile(manifestPath, "utf8"));
    manifest.minimumUpdaterRuntimeVersion = "1.0.0";
    await writeFile(manifestPath, `${JSON.stringify(manifest, null, 2)}\n`, "utf8");

    const result = run("update", "--project", project, "--json");
    assert.equal(result.status, 0, result.stderr);
    assert.equal(JSON.parse(result.stdout).source.runtimeVersion, manifest.runtimeVersion);
  } finally {
    await rm(parent, { recursive: true, force: true });
  }
});

test("update rejects a managed asset directory link escaping the project", async () => {
  const parent = await mkdtemp(path.join(os.tmpdir(), "pso-update-link-"));
  const outside = await mkdtemp(path.join(os.tmpdir(), "pso-update-link-outside-"));
  try {
    const created = run("create-project", "--name", "Update Link", "--destination", parent, "--accept-risk");
    assert.equal(created.status, 0, created.stderr);
    const project = path.join(parent, "update-link");
    const linkedSkill = path.join(project, ".github", "skills", "azure-discovery");
    await rm(linkedSkill, { recursive: true, force: true });
    await symlink(outside, linkedSkill, process.platform === "win32" ? "junction" : "dir");
    const result = run("update", "--project", project);
    assert.notEqual(result.status, 0);
    assert.match(`${result.stdout}${result.stderr}`, /Unsafe symbolic link in managed path/i);
  } finally {
    await rm(parent, { recursive: true, force: true });
    await rm(outside, { recursive: true, force: true });
  }
});

test("exact force requires one selected replace resolution, fresh plan evidence, and risk acceptance", async () => {
  const parent = await mkdtemp(path.join(os.tmpdir(), "pso-force-fuzz-"));
  try {
    const created = run("create-project", "--name", "Force Fuzz", "--destination", parent, "--accept-risk");
    assert.equal(created.status, 0, created.stderr);
    const project = path.join(parent, "force-fuzz");
    const asset = "schemas/project-update-plan.schema.json";
    const assetPath = path.join(project, asset);
    await writeFile(assetPath, "locally diverged\n", "utf8");
    const lockPath = path.join(project, "project-orchestrator.lock.json");
    const lock = JSON.parse(await readFile(lockPath, "utf8"));
    lock.entries.find((entry) => entry.path === asset).normalizedBaseDigest = "0".repeat(64);
    await writeFile(lockPath, `${JSON.stringify(lock, null, 2)}\n`, "utf8");
    const initial = run("update", "--project", project, "--mode", "select", "--assets", asset, "--json");
    assert.equal(initial.status, 0, initial.stderr);
    const plan = JSON.parse(initial.stdout);
    const selectionPath = path.join(parent, "selection.json");
    const selection = {
      schemaVersion: "1.0.0",
      expectedPlanDigest: plan.planDigest,
      target: plan.target,
      selectors: { skills: [], assets: [asset] },
      policyChanges: [],
      resolutions: [{ asset, disposition: "replace" }],
      exactForcePaths: [asset]
    };
    await writeFile(selectionPath, `${JSON.stringify(selection, null, 2)}\n`, "utf8");
    const noRisk = run("update", "--project", project, "--mode", "select", "--selection-file", selectionPath);
    assert.notEqual(noRisk.status, 0);
    assert.match(`${noRisk.stdout}${noRisk.stderr}`, /accept-risk/i);

    selection.resolutions = [{ asset, disposition: "keep" }];
    await writeFile(selectionPath, `${JSON.stringify(selection, null, 2)}\n`, "utf8");
    const noReplace = run("update", "--project", project, "--mode", "select", "--selection-file", selectionPath, "--accept-risk");
    assert.notEqual(noReplace.status, 0);
    assert.match(`${noReplace.stdout}${noReplace.stderr}`, /replace resolution/i);

    selection.resolutions = [{ asset, disposition: "replace" }];
    selection.expectedPlanDigest = "0".repeat(64);
    await writeFile(selectionPath, `${JSON.stringify(selection, null, 2)}\n`, "utf8");
    const stale = run("update", "--project", project, "--mode", "select", "--selection-file", selectionPath, "--accept-risk");
    assert.notEqual(stale.status, 0);
    assert.match(`${stale.stdout}${stale.stderr}`, /stale plan digest/i);

    selection.expectedPlanDigest = plan.planDigest;
    await writeFile(selectionPath, `${JSON.stringify(selection, null, 2)}\n`, "utf8");
    const accepted = run("update", "--project", project, "--mode", "select", "--selection-file", selectionPath, "--accept-risk", "--json");
    assert.equal(accepted.status, 0, accepted.stderr);
    const acceptedPlan = JSON.parse(accepted.stdout);
    assert.equal(acceptedPlan.canApply, true);
    assert.equal(acceptedPlan.assets.find((item) => item.path === asset).force, true);
    assert.equal(await readFile(assetPath, "utf8"), "locally diverged\n");
  } finally {
    await rm(parent, { recursive: true, force: true });
  }
});

test("recovery rejects traversal, absolute, and device-style journal paths", async () => {
  const unsafePaths = ["../outside.txt", "/tmp/outside.txt", "C:/outside.txt", "backup/../../outside.txt", "CON", "config/NUL.txt"];
  for (const unsafePath of unsafePaths) {
    const project = await mkdtemp(path.join(os.tmpdir(), "pso-journal-fuzz-"));
    try {
      await writeFile(path.join(project, "package.json"), "{\"name\":\"journal-fuzz\"}\n", "utf8");
      const transactionId = "unsafe-journal";
      const transactionRoot = path.join(project, ".skills-orchestrator", "transactions", transactionId);
      await mkdir(transactionRoot, { recursive: true });
      const now = new Date().toISOString();
      await writeFile(path.join(transactionRoot, "journal.json"), `${JSON.stringify({
        schemaVersion: "1.0.0",
        transactionId,
        status: "recovery-required",
        projectRoot: project,
        riskAcceptance: { noticeVersion: "1.0.0", acceptedAt: now, method: "cli-flag" },
        createdAt: now,
        updatedAt: now,
        entries: [{ path: unsafePath, originalState: "missing", backup: null }]
      })}\n`, "utf8");
      const result = run("recover", "--project", project, "--transaction", transactionId);
      assert.notEqual(result.status, 0, `unsafe recovery path unexpectedly accepted: ${unsafePath}`);
      assert.match(`${result.stdout}${result.stderr}`, /Unsafe managed path|Invalid recovery journal/);
    } finally {
      await rm(project, { recursive: true, force: true });
    }
  }
});

test("recovery rejects a tampered journal targeting repository metadata", async () => {
  const project = await mkdtemp(path.join(os.tmpdir(), "pso-journal-metadata-"));
  try {
    await writeFile(path.join(project, "package.json"), "{\"name\":\"journal-metadata\"}\n", "utf8");
    await mkdir(path.join(project, ".git"), { recursive: true });
    await writeFile(path.join(project, ".git", "sentinel"), "preserve\n", "utf8");
    const transactionId = "tampered-journal";
    const transactionRoot = path.join(project, ".skills-orchestrator", "transactions", transactionId);
    await mkdir(transactionRoot, { recursive: true });
    const now = new Date().toISOString();
    await writeFile(path.join(transactionRoot, "journal.json"), `${JSON.stringify({
      schemaVersion: "1.0.0",
      transactionId,
      status: "recovery-required",
      projectRoot: project,
      riskAcceptance: { noticeVersion: "1.0.0", acceptedAt: now, method: "cli-flag" },
      createdAt: now,
      updatedAt: now,
      entries: [{ path: ".git", originalState: "missing", backup: null }]
    })}\n`, "utf8");
    const result = run("recover", "--project", project, "--transaction", transactionId);
    assert.notEqual(result.status, 0);
    assert.equal(await readFile(path.join(project, ".git", "sentinel"), "utf8"), "preserve\n");
  } finally {
    await rm(project, { recursive: true, force: true });
  }
});

test("planning rejects a reports directory link outside the project", async () => {
  const project = await mkdtemp(path.join(os.tmpdir(), "pso-report-link-"));
  const outside = await mkdtemp(path.join(os.tmpdir(), "pso-report-outside-"));
  try {
    await writeFile(path.join(project, "package.json"), "{\"name\":\"report-link\"}\n", "utf8");
    await symlink(outside, path.join(project, "reports"), process.platform === "win32" ? "junction" : "dir");
    const result = run("plan", "--root", project, "--intent", "test report confinement");
    assert.notEqual(result.status, 0);
    assert.match(`${result.stdout}${result.stderr}`, /Unsafe symbolic link in managed path: reports/);
    assert.equal(existsSync(path.join(outside, "workflow-plan.json")), false);
    assert.equal(existsSync(path.join(outside, "execution-log.jsonl")), false);
  } finally {
    await rm(project, { recursive: true, force: true });
    await rm(outside, { recursive: true, force: true });
  }
});

test("workflow planning refuses a concurrent writer lock", async () => {
  const project = await mkdtemp(path.join(os.tmpdir(), "pso-plan-lock-"));
  try {
    await writeFile(path.join(project, "package.json"), "{\"name\":\"plan-lock\"}\n", "utf8");
    await mkdir(path.join(project, "reports"), { recursive: true });
    await writeFile(path.join(project, "reports", "workflow-plan.lock"), "existing planner\n", "utf8");
    const result = run("plan", "--root", project, "--intent", "must not race");
    assert.notEqual(result.status, 0);
    assert.match(`${result.stdout}${result.stderr}`, /Another workflow planner holds/);
    assert.equal(existsSync(path.join(project, "reports", "workflow-plan.json")), false);
    assert.equal(existsSync(path.join(project, "reports", "execution-log.jsonl")), false);
  } finally {
    await rm(project, { recursive: true, force: true });
  }
});

test("workflow planning emits governed plan, markdown, event, and matching state", async () => {
  const project = await mkdtemp(path.join(os.tmpdir(), "pso-plan-lineage-"));
  try {
    await writeFile(path.join(project, "package.json"), "{\"name\":\"plan-lineage\"}\n", "utf8");
    await installWorkflowOwners(project);
    const result = run("plan", "--root", project, "--intent", "establish governed lineage");
    assert.equal(result.status, 0, `${result.stdout}${result.stderr}`);

    const plan = JSON.parse(await readFile(path.join(project, "reports", "workflow-plan.json"), "utf8"));
    const state = JSON.parse(await readFile(path.join(project, "reports", "current-execution-state.json"), "utf8"));
    const event = JSON.parse((await readFile(path.join(project, "reports", "execution-log.jsonl"), "utf8")).trim());
    const markdown = await readFile(path.join(project, "reports", "workflow-plan.md"), "utf8");
    assert.equal(plan.schemaVersion, "1.1.0");
    assert.equal(plan.terminalStepId, "STEP-002");
    assert.equal(plan.steps[0].status, "ready");
    assert.deepEqual(plan.steps[0].owner, { type: "skill", id: "project-skills-orchestrator" });
    assert.match(markdown, /STEP-001.*skill:project-skills-orchestrator/);
    assert.equal(event.event, "workflow-planned");
    assert.equal(event.workflowId, plan.workflowId);
    assert.equal(event.runId, plan.runId);
    assert.equal(state.workflowId, plan.workflowId);
    assert.equal(state.runId, plan.runId);
    assert.equal(state.totalSteps, plan.steps.length);
    assert.equal(state.lastSequence, event.sequence);
    assert.equal(run("plan", "validate", "--root", project).status, 0);
  } finally {
    await rm(project, { recursive: true, force: true });
  }
});

test("workflow planning expands the matched skill and its declared prerequisites", async () => {
  const project = await mkdtemp(path.join(os.tmpdir(), "pso-plan-routing-"));
  try {
    await writeFile(path.join(project, "package.json"), "{\"name\":\"plan-routing\"}\n", "utf8");
    await installWorkflowOwners(project);
    const result = run("plan", "--root", project, "--intent", "discover Azure availability");
    assert.equal(result.status, 0, `${result.stdout}${result.stderr}`);
    const plan = JSON.parse(await readFile(path.join(project, "reports", "workflow-plan.json"), "utf8"));
    assert.deepEqual(plan.steps.map((step) => step.owner.id), ["project-skills-orchestrator", "clarify-the-ask", "azure-discovery", "project-handoff"]);
    assert.deepEqual(plan.steps[2].prerequisites, ["STEP-002"]);
    assert.deepEqual(plan.steps[3].prerequisites, ["STEP-002", "STEP-003"]);
  } finally {
    await rm(project, { recursive: true, force: true });
  }
});

test("workflow plan validation rejects broken ownership, topology, and terminal routes", async () => {
  const project = await mkdtemp(path.join(os.tmpdir(), "pso-plan-validation-"));
  try {
    await writeFile(path.join(project, "package.json"), "{\"name\":\"plan-validation\"}\n", "utf8");
    await installWorkflowOwners(project);
    assert.equal(run("plan", "--root", project, "--intent", "validate governed topology").status, 0);
    const planPath = path.join(project, "reports", "workflow-plan.json");
    const valid = JSON.parse(await readFile(planPath, "utf8"));
    const invalidPlans = [
      ["duplicate IDs", (plan) => { plan.steps[1].id = "STEP-001"; }, /step IDs must be unique/],
      ["dangling reference", (plan) => { plan.steps[0].onFailed = "STEP-999"; }, /references unknown step/],
      ["dependency cycle", (plan) => { plan.steps[0].prerequisites = ["STEP-002"]; }, /prerequisite cycle/],
      ["unknown owner", (plan) => { plan.steps[0].owner.id = "missing-skill"; }, /unknown skill owner/],
      ["unreachable handoff", (plan) => { plan.steps[0].onBlocked = "STEP-001"; }, /cannot reach terminal handoff/],
      ["operator without approval", (plan) => { plan.steps[0].owner = { type: "operator", id: "release-owner" }; }, /operator step.*must require approval/],
      ["unsupported approval", (plan) => { plan.steps[0].requiresApproval = true; plan.steps[0].approvalClasses = ["bypass"]; }, /unsupported approval classes/],
      ["invalid checkpoint", (plan) => { plan.steps[0].checkpoint = "checkpoint one"; }, /checkpoint.*invalid format/]
    ];
    for (const [label, mutate, expected] of invalidPlans) {
      const candidate = structuredClone(valid);
      mutate(candidate);
      await writeFile(planPath, `${JSON.stringify(candidate, null, 2)}\n`, "utf8");
      const result = run("plan", "validate", "--root", project);
      assert.notEqual(result.status, 0, `${label} unexpectedly passed`);
      assert.match(`${result.stdout}${result.stderr}`, expected);
    }
  } finally {
    await rm(project, { recursive: true, force: true });
  }
});
