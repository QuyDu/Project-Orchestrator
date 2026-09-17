import assert from "node:assert/strict";
import { mkdtemp, mkdir, readFile, readdir, realpath, rename, rm, symlink, writeFile } from "node:fs/promises";
import { existsSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import { spawn, spawnSync } from "node:child_process";
import { createHash } from "node:crypto";
import test from "node:test";

const root = path.resolve(import.meta.dirname, "..");
const runtime = path.join(root, "pso.mjs");
const expectedSkillCount = (await readdir(path.join(root, ".github", "skills"), { withFileTypes: true }))
  .filter((entry) => entry.isDirectory()).length;

function runAdoption(project, mode, options = ["--profile", "core"]) {
  const mutationOptions = mode === "--apply" ? ["--accept-risk"] : [];
  const result = spawnSync(process.execPath, [runtime, "adopt", "--project", project, ...options, mode, ...mutationOptions], {
    cwd: root,
    encoding: "utf8"
  });
  assert.equal(result.status, 0, `${mode} failed:\n${result.stdout}\n${result.stderr}`);
  return `${result.stdout}${result.stderr}`;
}

function runInteractive(args, exchanges) {
  return new Promise((resolve, reject) => {
    const child = spawn(process.execPath, [runtime, ...args], { cwd: root, stdio: ["pipe", "pipe", "pipe"] });
    let stdout = "";
    let stderr = "";
    let exchangeIndex = 0;
    const timeout = setTimeout(() => {
      child.kill();
      reject(new Error(`Interactive command timed out after ${exchangeIndex} answers:\n${stdout}\n${stderr}`));
    }, 60000);
    child.stdout.setEncoding("utf8");
    child.stderr.setEncoding("utf8");
    child.stdout.on("data", (chunk) => {
      stdout += chunk;
      const exchange = exchanges[exchangeIndex];
      if (exchange?.prompt.test(stdout)) {
        child.stdin.write(`${exchange.answer}\n`);
        exchangeIndex += 1;
      }
    });
    child.stderr.on("data", (chunk) => {
      stderr += chunk;
    });
    child.on("error", (error) => {
      clearTimeout(timeout);
      reject(error);
    });
    child.on("close", (status) => {
      clearTimeout(timeout);
      resolve({ status, stdout, stderr, answers: exchangeIndex });
    });
  });
}

test("clone-setup clones a GitHub repository and publishes only after verified adoption", async (context) => {
  const git = spawnSync("git", ["--version"], { encoding: "utf8" });
  if (git.status !== 0) return context.skip("Git is required for clone-setup validation");
  const source = await mkdtemp(path.join(os.tmpdir(), "pso-clone-source-"));
  const destinationParent = await mkdtemp(path.join(os.tmpdir(), "pso-clone-target-"));
  const destination = path.join(destinationParent, "cloned-fixture");
  const bundle = path.join(source, "fixture.bundle");
  const repository = "https://github.com/example/cloned-fixture.git";
  try {
    assert.equal(spawnSync("git", ["init", "--initial-branch=main"], { cwd: source }).status, 0);
    await writeFile(path.join(source, "package.json"), "{\"name\":\"cloned-fixture\"}\n", "utf8");
    assert.equal(spawnSync("git", ["add", "package.json"], { cwd: source }).status, 0);
    assert.equal(spawnSync("git", ["-c", "user.name=Fixture", "-c", "user.email=fixture@example.invalid", "commit", "-m", "fixture"], { cwd: source }).status, 0);
    assert.equal(spawnSync("git", ["bundle", "create", bundle, "--all"], { cwd: source }).status, 0);
    const sourceUrl = bundle.replaceAll("\\", "/");
    const result = spawnSync(process.execPath, [runtime, "clone-setup", "--repository", repository, "--destination", destination, "--profile", "core", "--accept-risk"], {
      cwd: root,
      encoding: "utf8",
      env: {
        ...process.env,
        GIT_CONFIG_COUNT: "1",
        GIT_CONFIG_KEY_0: `url.${sourceUrl}.insteadOf`,
        GIT_CONFIG_VALUE_0: repository
      }
    });
    assert.equal(result.status, 0, `${result.stdout}\n${result.stderr}`);
    assert.ok(existsSync(path.join(destination, ".git")));
    assert.ok(existsSync(path.join(destination, ".github", "skills", "project-skills-orchestrator", "SKILL.md")));
    const manifest = JSON.parse(await readFile(path.join(destination, "project-orchestrator.json"), "utf8"));
    assert.equal(manifest.projectName, "cloned-fixture");
    const verification = JSON.parse(await readFile(path.join(destination, "reports", "adoption-verification.json"), "utf8"));
    assert.equal(verification.status, "passed");
    assert.equal(verification.checks.frameworkSkills, expectedSkillCount);
    assert.deepEqual((await readdir(destinationParent)).filter((entry) => entry.startsWith(".pso-clone-")), []);
  } finally {
    await rm(source, { recursive: true, force: true });
    await rm(destinationParent, { recursive: true, force: true });
  }
});

test("clone-setup rejects unsafe repository locations before creating a destination", async () => {
  const parent = await mkdtemp(path.join(os.tmpdir(), "pso-clone-reject-"));
  try {
    const repositories = [
      "https://user:token@github.com/owner/project.git",
      "https://gitlab.com/owner/project.git",
      "https://github.com/owner/project.git?ref=main",
      "file:///tmp/project"
    ];
    for (const [index, repository] of repositories.entries()) {
      const destination = path.join(parent, `target-${index}`);
      const result = spawnSync(process.execPath, [runtime, "clone-setup", "--repository", repository, "--destination", destination, "--accept-risk"], {
        cwd: root,
        encoding: "utf8"
      });
      assert.notEqual(result.status, 0, repository);
      assert.ok(!existsSync(destination), repository);
    }
    const existingDestination = path.join(parent, "existing");
    await mkdir(existingDestination);
    const existing = spawnSync(process.execPath, [runtime, "clone-setup", "--repository", "https://github.com/owner/project.git", "--destination", existingDestination, "--accept-risk"], {
      cwd: root,
      encoding: "utf8"
    });
    assert.notEqual(existing.status, 0);
    assert.match(`${existing.stdout}${existing.stderr}`, /must not already exist/);
    assert.deepEqual(await readdir(existingDestination), []);
  } finally {
    await rm(parent, { recursive: true, force: true });
  }
});

test("clone-setup derives the local folder from the repository name", async () => {
  const result = spawnSync(process.execPath, [runtime, "clone-setup", "--repository", "https://github.com/owner/derived-project.git"], {
    cwd: root,
    encoding: "utf8"
  });
  assert.notEqual(result.status, 0);
  assert.doesNotMatch(`${result.stdout}${result.stderr}`, /Use --repository with a GitHub URL and --destination/);
  assert.match(`${result.stdout}${result.stderr}`, /acknowledge and accept these risks/);
});

test("rerun adoption synchronizes updates, wiring, and legacy skill IDs", async () => {
  const project = await mkdtemp(path.join(os.tmpdir(), "pso-rerun-"));
  try {
    await writeFile(path.join(project, "package.json"), "{\"name\":\"adoption-rerun-fixture\"}\n", "utf8");
    await writeFile(path.join(project, "AGENTS.md"), "Keep this project-specific agent instruction.\n", "utf8");
    runAdoption(project, "--apply");

    const auditPath = path.join(project, ".github", "skills", "audit-code", "SKILL.md");
    await writeFile(auditPath, `${await readFile(auditPath, "utf8")}\nStale installed content.\n`, "utf8");
    const obsoletePackageFile = path.join(project, ".github", "skills", "policy-engine", "obsolete-installed-file.txt");
    await writeFile(obsoletePackageFile, "This file is not part of the current framework skill package.\n", "utf8");

    const currentReview = path.join(project, ".github", "skills", "audit-review-findings");
    const legacyReview = path.join(project, ".github", "skills", "review-audit-findings");
    await rename(currentReview, legacyReview);
    const legacySkillPath = path.join(legacyReview, "SKILL.md");
    const legacySkill = (await readFile(legacySkillPath, "utf8")).replaceAll("audit-review-findings", "review-audit-findings");
    await writeFile(legacySkillPath, legacySkill, "utf8");

    const currentVisualStorytelling = path.join(project, ".github", "skills", "project-visual-storytelling");
    const legacyPersonalizedContent = path.join(project, ".github", "skills", "personalized-content");
    await rename(currentVisualStorytelling, legacyPersonalizedContent);
    const legacyPersonalizedSkillPath = path.join(legacyPersonalizedContent, "SKILL.md");
    const legacyPersonalizedSkill = (await readFile(legacyPersonalizedSkillPath, "utf8"))
      .replaceAll("project-visual-storytelling", "personalized-content");
    await writeFile(legacyPersonalizedSkillPath, legacyPersonalizedSkill, "utf8");
    const currentVisualHelp = path.join(project, ".github", "prompts", "project-visual-storytelling-help.prompt.md");
    const legacyVisualHelp = path.join(project, ".github", "prompts", "personalized-content-help.prompt.md");
    await rename(currentVisualHelp, legacyVisualHelp);
    await writeFile(legacyVisualHelp, (await readFile(legacyVisualHelp, "utf8"))
      .replaceAll("project-visual-storytelling", "personalized-content"), "utf8");

    const schemaPath = path.join(project, "schemas", "code-audit-findings.schema.json");
    await writeFile(schemaPath, `${await readFile(schemaPath, "utf8")}\n`, "utf8");
    const profilesPath = path.join(project, "config", "profiles.yaml");
    await writeFile(profilesPath, `${await readFile(profilesPath, "utf8")}\n# stale profile copy\n`, "utf8");
    await writeFile(path.join(project, "config", "orchestrator.yaml"), "frameworkVersion: stale\nprofile: wrong\n", "utf8");
    await writeFile(path.join(project, ".github", "copilot-instructions.md"), "Keep this project-specific instruction.\n", "utf8");
    const obsoletePrompt = path.join(project, ".github", "prompts", "project-video.prompt.md");
    await writeFile(obsoletePrompt, "Run the `project-video` skill and follow its contract.\n", "utf8");
    const customSkillDirectory = path.join(project, ".github", "skills", "custom-consumer");
    await mkdir(customSkillDirectory, { recursive: true });
    const customSkillPath = path.join(customSkillDirectory, "SKILL.md");
    await writeFile(customSkillPath, `---
name: custom-consumer
description: Exercise migration of a project-owned skill dependency.
lifecycle: draft
confidence: low
---

# custom-consumer

## Purpose

Consume reviewed audit findings.

## Preconditions

- Read project instructions.

## Inputs

- Reviewed audit findings.

## Approved Tools and Resources

- Use read-only tools.

## Read and Write Boundaries

- Do not mutate unrelated files.

## Procedure

1. Read the reviewed findings.

## Validation

- Confirm the input is valid.

## Outputs

- No dedicated report.

## Failure Behavior

- Fail when input is missing.

## Approval Gates

No approval is required for read-only work.

## Composition and Dependencies

- review-audit-findings

## Examples

- Consume a reviewed audit report.
`, "utf8");

    const dryRun = runAdoption(project, "--dry-run");
    assert.match(dryRun, /Existing skills to update: [1-9]/);
    assert.match(dryRun, /Project skill references to migrate: 1/);
    assert.match(dryRun, /Framework files to update: [1-9]/);
    assert.match(dryRun, /Wiring files to update: [1-9]/);
    assert.match(dryRun, /Duplicate skills to replace: 2/);
    assert.match(dryRun, /Duplicate prompt commands to remove: 2/);

    runAdoption(project, "--apply");

    assert.equal(await readFile(auditPath, "utf8"), await readFile(path.join(root, ".github", "skills", "audit-code", "SKILL.md"), "utf8"));
    assert.ok(!existsSync(obsoletePackageFile));
    assert.ok(!existsSync(obsoletePrompt));
    const migratedCustomSkill = await readFile(customSkillPath, "utf8");
    assert.match(migratedCustomSkill, /audit-review-findings/);
    assert.doesNotMatch(migratedCustomSkill, /review-audit-findings/);
    assert.ok(existsSync(currentReview));
    assert.ok(!existsSync(legacyReview));
    assert.ok(existsSync(currentVisualStorytelling));
    assert.ok(!existsSync(legacyPersonalizedContent));
    assert.ok(existsSync(currentVisualHelp));
    assert.ok(!existsSync(legacyVisualHelp));
    assert.equal(await readFile(schemaPath, "utf8"), await readFile(path.join(root, "schemas", "code-audit-findings.schema.json"), "utf8"));
    assert.equal(await readFile(profilesPath, "utf8"), await readFile(path.join(root, "config", "profiles.yaml"), "utf8"));
    assert.ok(existsSync(path.join(project, ".github", "skills", "project-video", "scripts", "project-video.mjs")));
    assert.ok(existsSync(path.join(project, ".github", "skills", "project-understanding", "scripts", "project-understanding.mjs")));
    assert.ok(existsSync(path.join(project, ".github", "skills", "audit-code", "scripts", "audit-evidence.mjs")));
    assert.ok(existsSync(path.join(project, ".github", "skills", "audit-code", "scripts", "audit-validate.mjs")));
    const adoptedGitleaksRunner = path.join(project, ".github", "skills", "audit-code", "scripts", "gitleaks-scan.mjs");
    assert.ok(existsSync(adoptedGitleaksRunner));
    assert.ok(existsSync(path.join(project, ".github", "skills", "audit-code", "scripts", "safe-path.mjs")));
    assert.ok(existsSync(path.join(project, ".github", "skills", "audit-code", "config", "gitleaks.toml")));
    assert.ok(existsSync(path.join(project, ".github", "skills", "audit-code", "config", "gitleaks-allowlist.json")));
    const adoptedGitleaksMetadata = spawnSync(process.execPath, [adoptedGitleaksRunner, "metadata"], { cwd: project, encoding: "utf8" });
    assert.equal(adoptedGitleaksMetadata.status, 0, adoptedGitleaksMetadata.stderr);
    assert.equal(JSON.parse(adoptedGitleaksMetadata.stdout).version, "8.30.1");
    assert.ok(existsSync(path.join(project, ".github", "skills", "audit-remediation", "SKILL.md")));
    assert.ok(existsSync(path.join(project, ".github", "skills", "azure-discovery", "scripts", "azure-discovery.ps1")));
    assert.ok(existsSync(path.join(project, ".github", "skills", "azure-discovery", "scripts", "azure-environment.ps1")));
    assert.ok(!existsSync(path.join(project, ".github", "prompts", "project-video.prompt.md")));
    assert.ok(existsSync(path.join(project, "schemas", "project-video-plan.schema.json")));
    assert.ok(existsSync(path.join(project, "schemas", "project-understanding.schema.json")));
    assert.ok(existsSync(path.join(project, "schemas", "project-video-manifest.schema.json")));
    assert.ok(existsSync(path.join(project, "schemas", "project-video-voice-samples.schema.json")));
    assert.ok(existsSync(path.join(project, "schemas", "project-video-voice-selection.schema.json")));
    assert.ok(existsSync(path.join(project, "schemas", "project-video-narration-manifest.schema.json")));
    assert.ok(existsSync(path.join(project, "schemas", "project-video-local-voice-manifest.schema.json")));
    assert.ok(existsSync(path.join(project, "schemas", "project-video-browser-preview-manifest.schema.json")));
    assert.ok(existsSync(path.join(project, "schemas", "azure-discovery.schema.json")));
    assert.ok(existsSync(path.join(project, "schemas", "azure-environment.schema.json")));
    assert.ok(existsSync(path.join(project, "schemas", "audit-remediation-execution.schema.json")));
    assert.ok(existsSync(path.join(project, "schemas", "gitleaks-scan.schema.json")));
    assert.ok(existsSync(path.join(project, "schemas", "gitleaks-allowlist.schema.json")));
    const adoptedVideoHelper = await readFile(path.join(project, ".github", "skills", "project-video", "scripts", "project-video.mjs"), "utf8");
    assert.match(adoptedVideoHelper, /command === "install-local-voice"/);
    assert.match(adoptedVideoHelper, /en_US-ljspeech-high/);
    const adoptedVideoSkill = await readFile(path.join(project, ".github", "skills", "project-video", "SKILL.md"), "utf8");
    assert.match(adoptedVideoSkill, /local-piper/);
    assert.match(adoptedVideoSkill, /azure-preflight/);
    assert.match(adoptedVideoSkill, /browser-preview/);
    const adoptedVideoSchema = JSON.parse(await readFile(path.join(project, "schemas", "project-video-plan.schema.json"), "utf8"));
    assert.equal(adoptedVideoSchema.$defs.localVoice.properties.provider.const, "local-piper");

    const instructions = await readFile(path.join(project, ".github", "copilot-instructions.md"), "utf8");
    assert.match(instructions, /Keep this project-specific instruction\./);
    assert.match(instructions, /\.github\/skills\/project-skills-orchestrator\/SKILL\.md/);
    assert.match(instructions, /\.azure\/environment\.json/);
    assert.match(instructions, /Azure MCP is opt-in/);
    const agentInstructions = await readFile(path.join(project, "AGENTS.md"), "utf8");
    assert.match(agentInstructions, /Keep this project-specific agent instruction\./);
    assert.match(agentInstructions, /\.github\/skills\/project-skills-orchestrator\/SKILL\.md/);
    assert.match(agentInstructions, /\.azure\/environment\.json/);
    assert.ok(existsSync(path.join(project, ".vscode", "extensions.json")));
    assert.ok(existsSync(path.join(project, ".vscode", "settings.json")));
    const adoptedSettings = JSON.parse(await readFile(path.join(project, ".vscode", "settings.json"), "utf8"));
    assert.ok(!Object.hasOwn(adoptedSettings, "window.title"), "adoption must not impose new-project workspace identity");
    assert.ok(!Object.hasOwn(adoptedSettings, "workbench.colorCustomizations"), "adoption must preserve the existing color theme");

    const manifest = JSON.parse(await readFile(path.join(project, "project-orchestrator.json"), "utf8"));
    assert.equal(manifest.frameworkVersion, "9.0.0");
    assert.equal(manifest.runtimeVersion, "1.1.2");
    assert.equal(manifest.conformanceProfile, "core");
    assert.equal(manifest.riskAcceptance.noticeVersion, "1.0.0");
    assert.equal(manifest.riskAcceptance.method, "cli-flag");

    const verification = JSON.parse(await readFile(path.join(project, "reports", "adoption-verification.json"), "utf8"));
    assert.equal(verification.status, "passed");
    assert.equal(verification.mode, "existing-project-adoption");
    assert.equal(verification.checks.frameworkSkills, expectedSkillCount);
    assert.equal(verification.checks.clarificationConfigured, true);
    assert.equal(verification.checks.profilesCurrent, true);
    assert.equal(verification.checks.inventoryCurrent, true);
    assert.equal(verification.checks.orchestratorConfigured, true);
    assert.equal(verification.checks.copilotRouted, true);
    assert.equal(verification.checks.agentInstructionsRouted, true);
    assert.equal(verification.checks.workspaceSupportPresent, true);
    assert.equal(verification.checks.legacySkillsRemoved, true);

    const persistedPlan = JSON.parse(await readFile(path.join(project, "reports", "adoption-plan.json"), "utf8"));
    assert.ok(!Object.hasOwn(persistedPlan, "projectRoot"));
    assert.equal(persistedPlan.project.name, path.basename(project));

    const backupsRoot = path.join(project, ".skills-orchestrator", "transactions");
    assert.ok(existsSync(backupsRoot));
    const transactionDirectories = await readdir(backupsRoot);
    const journal = JSON.parse(await readFile(path.join(backupsRoot, transactionDirectories[0], "journal.json"), "utf8"));
    assert.equal(journal.status, "completed");
    assert.equal(journal.riskAcceptance.noticeVersion, "1.0.0");
    assert.equal(journal.riskAcceptance.method, "cli-flag");
    const secondDryRun = runAdoption(project, "--dry-run");
    assert.match(secondDryRun, /Existing skills to update: 0/);
    assert.match(secondDryRun, /Project skill references to migrate: 0/);
    assert.match(secondDryRun, /Framework files to update: 0/);
    assert.match(secondDryRun, /Wiring files to update: 0/);
    assert.match(secondDryRun, /Duplicate skills to replace: 0/);
  } finally {
    await rm(project, { recursive: true, force: true });
  }
});

test("adoption resolves project configuration with CLI precedence", async () => {
  const project = await mkdtemp(path.join(os.tmpdir(), "pso-config-"));
  try {
    await writeFile(path.join(project, "package.json"), "{\"name\":\"adoption-config-fixture\"}\n", "utf8");
    await mkdir(path.join(project, "config"), { recursive: true });
    await writeFile(path.join(project, "config", "skills-orchestrator.json"), `${JSON.stringify({
      schemaVersion: "1.0.0",
      profile: "durable",
      platforms: { agent: "github-copilot", ci: "manual" },
      packs: ["core"],
      routing: { precedence: ["project-domain", "framework"] },
      clarification: { enabled: true, maxQuestionsPerRound: 5, blockOnMaterialAmbiguity: true },
      policy: { requireApprovalFor: ["external", "privileged", "destructive", "irreversible"] }
    }, null, 2)}\n`, "utf8");

    const configured = runAdoption(project, "--dry-run", []);
    assert.match(configured, /Profile: durable/);

    const overridden = runAdoption(project, "--dry-run", ["--profile", "advanced"]);
    assert.match(overridden, /Profile: advanced/);
  } finally {
    await rm(project, { recursive: true, force: true });
  }
});

test("adoption preserves project-owned orchestrator routes on rerun", async () => {
  const project = await mkdtemp(path.join(os.tmpdir(), "pso-project-routing-"));
  try {
    await writeFile(path.join(project, "package.json"), "{\"name\":\"project-routing-fixture\"}\n", "utf8");
    await mkdir(path.join(project, "config"), { recursive: true });
    await writeFile(path.join(project, "config", "orchestrator.yaml"), "routing:\n  intents:\n    project-task:\n      skill: project-skill\n      requiresApproval: false\napprovalPolicy:\n  requireExplicitApprovalFor:\n    - push\n", "utf8");
    const projectSkill = path.join(project, ".github", "skills", "project-skill", "SKILL.md");
    await mkdir(path.dirname(projectSkill), { recursive: true });
    await writeFile(projectSkill, `---
name: project-skill
description: Project-owned route fixture.
lifecycle: draft
confidence: low
---

# project-skill

## Purpose

- Exercise project routing preservation.

## Preconditions

- None.

## Inputs

- None.

## Approved Tools and Resources

- None.

## Read and Write Boundaries

- None.

## Procedure

- None.

## Validation

- None.

## Outputs

- None.

## Failure Behavior

- None.

## Approval Gates

- None.

## Composition and Dependencies


## Examples

- Preserve a project route.
`, "utf8");

    runAdoption(project, "--apply");

    const orchestrator = await readFile(path.join(project, "config", "orchestrator.yaml"), "utf8");
    assert.match(orchestrator, /project-task:/);
    assert.match(orchestrator, /skill: project-skill/);
    assert.match(orchestrator, /approvalPolicy:/);

    const rerun = runAdoption(project, "--dry-run");
    assert.match(rerun, /Wiring files to update: 0/);
  } finally {
    await rm(project, { recursive: true, force: true });
  }
});

test("adoption rejects unknown project configuration fields", async () => {
  const project = await mkdtemp(path.join(os.tmpdir(), "pso-invalid-config-"));
  try {
    await writeFile(path.join(project, "package.json"), "{\"name\":\"invalid-config-fixture\"}\n", "utf8");
    await mkdir(path.join(project, "config"), { recursive: true });
    await writeFile(path.join(project, "config", "skills-orchestrator.json"), "{\"schemaVersion\":\"1.0.0\",\"unexpected\":true}\n", "utf8");
    const result = spawnSync(process.execPath, [runtime, "adopt", "--project", project, "--dry-run"], {
      cwd: root,
      encoding: "utf8"
    });
    assert.notEqual(result.status, 0);
    assert.match(`${result.stdout}${result.stderr}`, /Unknown configuration field: unexpected/);
  } finally {
    await rm(project, { recursive: true, force: true });
  }
});

test("adoption rejects managed paths that escape through symbolic links", async () => {
  const project = await mkdtemp(path.join(os.tmpdir(), "pso-symlink-project-"));
  const outside = await mkdtemp(path.join(os.tmpdir(), "pso-symlink-outside-"));
  try {
    await writeFile(path.join(project, "package.json"), "{\"name\":\"symlink-fixture\"}\n", "utf8");
    await symlink(outside, path.join(project, ".github"), process.platform === "win32" ? "junction" : "dir");
    const result = spawnSync(process.execPath, [runtime, "adopt", "--project", project, "--dry-run"], {
      cwd: root,
      encoding: "utf8"
    });
    assert.notEqual(result.status, 0);
    assert.match(`${result.stdout}${result.stderr}`, /Unsafe symbolic link in managed path: \.github/);
    assert.deepEqual(await readdir(outside), []);
  } finally {
    await rm(project, { recursive: true, force: true });
    await rm(outside, { recursive: true, force: true });
  }
});

test("adoption lock prevents concurrent project mutation", async () => {
  const project = await mkdtemp(path.join(os.tmpdir(), "pso-locked-project-"));
  try {
    await writeFile(path.join(project, "package.json"), "{\"name\":\"locked-fixture\"}\n", "utf8");
    await mkdir(path.join(project, ".skills-orchestrator"), { recursive: true });
    await writeFile(path.join(project, ".skills-orchestrator", "adoption.lock"), "existing transaction\n", "utf8");
    const result = spawnSync(process.execPath, [runtime, "adopt", "--project", project, "--apply", "--accept-risk"], {
      cwd: root,
      encoding: "utf8"
    });
    assert.notEqual(result.status, 0);
    assert.match(`${result.stdout}${result.stderr}`, /Another adoption transaction holds/);
    assert.ok(!existsSync(path.join(project, "project-orchestrator.json")));
    assert.ok(!existsSync(path.join(project, ".github")));
  } finally {
    await rm(project, { recursive: true, force: true });
  }
});

test("failed validation rolls back every adoption mutation", async () => {
  const project = await mkdtemp(path.join(os.tmpdir(), "pso-rollback-project-"));
  try {
    await writeFile(path.join(project, "package.json"), "{\"name\":\"rollback-fixture\"}\n", "utf8");
    const projectSkill = path.join(project, ".github", "skills", "project-owned", "SKILL.md");
    await mkdir(path.dirname(projectSkill), { recursive: true });
    const original = "---\nname: project-owned\ndescription: Deliberately incomplete project fixture.\nlifecycle: draft\nconfidence: low\n---\n\n# project-owned\n";
    await writeFile(projectSkill, original, "utf8");

    const result = spawnSync(process.execPath, [runtime, "adopt", "--project", project, "--apply", "--accept-risk"], {
      cwd: root,
      encoding: "utf8"
    });
    assert.notEqual(result.status, 0);
    assert.match(`${result.stdout}${result.stderr}`, /Adoption failed and was rolled back/);
    assert.equal(await readFile(projectSkill, "utf8"), original);
    assert.ok(!existsSync(path.join(project, ".github", "skills", "project-skills-orchestrator")));
    assert.ok(!existsSync(path.join(project, "project-orchestrator.json")));
  } finally {
    await rm(project, { recursive: true, force: true });
  }
});

test("recover restores an interrupted transaction from its persistent journal", async () => {
  const project = await mkdtemp(path.join(os.tmpdir(), "pso-recover-project-"));
  try {
    const canonicalProject = await realpath(project);
    await writeFile(path.join(project, "package.json"), "{\"name\":\"recover-fixture\"}\n", "utf8");
    await writeFile(path.join(project, "project-orchestrator.json"), "modified\n", "utf8");
    const transactionId = "interrupted-fixture";
    const transaction = path.join(project, ".skills-orchestrator", "transactions", transactionId);
    await mkdir(path.join(transaction, "backup"), { recursive: true });
    const original = "original\n";
    await writeFile(path.join(transaction, "backup", "project-orchestrator.json"), original, "utf8");
    await writeFile(path.join(transaction, "journal.json"), `${JSON.stringify({
      schemaVersion: "1.0.0",
      transactionId,
      status: "applying",
      projectRoot: canonicalProject,
      riskAcceptance: { noticeVersion: "1.0.0", acceptedAt: new Date().toISOString(), method: "cli-flag" },
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
      entries: [{ path: "project-orchestrator.json", originalState: `file:sha256:${createHash("sha256").update(original).digest("hex")}`, backup: "backup/project-orchestrator.json" }]
    }, null, 2)}\n`, "utf8");
    await writeFile(path.join(project, ".skills-orchestrator", "adoption.lock"), `${JSON.stringify({
      transactionId,
      processId: 2147483647,
      startedAt: new Date().toISOString()
    })}\n`, "utf8");

    const result = spawnSync(process.execPath, [runtime, "recover", "--project", project, "--transaction", transactionId], {
      cwd: root,
      encoding: "utf8"
    });
    assert.equal(result.status, 0, `${result.stdout}\n${result.stderr}`);
    assert.equal(await readFile(path.join(project, "project-orchestrator.json"), "utf8"), "original\n");
    assert.ok(!existsSync(path.join(project, ".skills-orchestrator", "adoption.lock")));
    const journal = JSON.parse(await readFile(path.join(transaction, "journal.json"), "utf8"));
    assert.equal(journal.status, "rolled-back");
  } finally {
    await rm(project, { recursive: true, force: true });
  }
});

test("recover removes partial writes after forced process termination", async () => {
  const project = await mkdtemp(path.join(os.tmpdir(), "pso-forced-interruption-"));
  try {
    await writeFile(path.join(project, "package.json"), "{\"name\":\"forced-interruption-fixture\"}\n", "utf8");
    const interrupted = spawnSync(process.execPath, [runtime, "adopt", "--project", project, "--apply", "--accept-risk"], {
      cwd: root,
      encoding: "utf8",
      env: { ...process.env, NODE_ENV: "test", PSO_TEST_INTERRUPT_AFTER_FIRST_WRITE: "1" }
    });
    assert.equal(interrupted.status, 86, `${interrupted.stdout}\n${interrupted.stderr}`);
    const lockPath = path.join(project, ".skills-orchestrator", "adoption.lock");
    assert.ok(existsSync(lockPath));
    const lock = JSON.parse(await readFile(lockPath, "utf8"));

    const recovered = spawnSync(process.execPath, [runtime, "recover", "--project", project, "--transaction", lock.transactionId], {
      cwd: root,
      encoding: "utf8"
    });
    assert.equal(recovered.status, 0, `${recovered.stdout}\n${recovered.stderr}`);
    assert.ok(!existsSync(path.join(project, ".github", "skills", "project-skills-orchestrator")));
    assert.ok(!existsSync(path.join(project, "project-orchestrator.json")));
    assert.ok(!existsSync(lockPath));
    const journal = JSON.parse(await readFile(path.join(project, ".skills-orchestrator", "transactions", lock.transactionId, "journal.json"), "utf8"));
    assert.equal(journal.status, "rolled-back");
  } finally {
    await rm(project, { recursive: true, force: true });
  }
});

test("create-project rejects a symbolic-link destination", async () => {
  const parent = await mkdtemp(path.join(os.tmpdir(), "pso-create-parent-"));
  const outside = await mkdtemp(path.join(os.tmpdir(), "pso-create-outside-"));
  try {
    await symlink(outside, path.join(parent, "linked-project"), process.platform === "win32" ? "junction" : "dir");
    const result = spawnSync(process.execPath, [runtime, "create-project", "--name", "Linked Project", "--destination", parent, "--accept-risk"], {
      cwd: root,
      encoding: "utf8"
    });
    assert.notEqual(result.status, 0);
    assert.match(`${result.stdout}${result.stderr}`, /Target cannot be a symbolic link/);
    assert.deepEqual(await readdir(outside), []);
  } finally {
    await rm(parent, { recursive: true, force: true });
    await rm(outside, { recursive: true, force: true });
  }
});

test("mutating installation requires explicit risk acceptance", async () => {
  const project = await mkdtemp(path.join(os.tmpdir(), "pso-risk-project-"));
  const parent = await mkdtemp(path.join(os.tmpdir(), "pso-risk-create-"));
  try {
    await writeFile(path.join(project, "package.json"), "{\"name\":\"risk-fixture\"}\n", "utf8");
    const adoption = spawnSync(process.execPath, [runtime, "adopt", "--project", project, "--apply"], {
      cwd: root,
      encoding: "utf8"
    });
    assert.notEqual(adoption.status, 0);
    assert.match(`${adoption.stdout}${adoption.stderr}`, /explicitly acknowledge and accept these risks/);
    assert.ok(!existsSync(path.join(project, ".github")));

    const creation = spawnSync(process.execPath, [runtime, "create-project", "--name", "Risk Fixture", "--destination", parent], {
      cwd: root,
      encoding: "utf8"
    });
    assert.notEqual(creation.status, 0);
    assert.match(`${creation.stdout}${creation.stderr}`, /--accept-risk/);
    assert.ok(!existsSync(path.join(parent, "risk-fixture")));
  } finally {
    await rm(project, { recursive: true, force: true });
    await rm(parent, { recursive: true, force: true });
  }
});

test("accepted project creation records the risk acknowledgment", async () => {
  const parent = await mkdtemp(path.join(os.tmpdir(), "pso-risk-record-"));
  try {
    const result = spawnSync(process.execPath, [runtime, "create-project", "--name", "Accepted Fixture", "--destination", parent, "--accept-risk"], {
      cwd: root,
      encoding: "utf8"
    });
    assert.equal(result.status, 0, `${result.stdout}\n${result.stderr}`);
    const manifest = JSON.parse(await readFile(path.join(parent, "accepted-fixture", "project-orchestrator.json"), "utf8"));
    assert.equal(manifest.riskAcceptance.noticeVersion, "1.0.0");
    assert.equal(manifest.riskAcceptance.method, "cli-flag");
    assert.match(manifest.riskAcceptance.acceptedAt, /^\d{4}-\d{2}-\d{2}T/);
    assert.equal(manifest.conformanceProfile, "durable");
    const created = path.join(parent, "accepted-fixture");
    const freshHandoff = JSON.parse(await readFile(path.join(created, "reports", "project-handoff.json"), "utf8"));
    assert.equal(freshHandoff.project.name, "accepted-fixture");
    assert.equal(freshHandoff.status, "initialized");
    assert.match(freshHandoff.worktree.attribution, /does not inherit the source repository handoff/);
    assert.match(await readFile(path.join(created, "reports", "project-handoff.md"), "utf8"), /fresh handoff generated for this project/);
    const blueprint = JSON.parse(await readFile(path.join(created, "docs", "PROJECT-BLUEPRINT.json"), "utf8"));
    assert.equal(blueprint.schemaVersion, "1.0.0");
    assert.equal(blueprint.project.name, "accepted-fixture");
    assert.equal(blueprint.delivery.environment, "development");
    assert.deepEqual(blueprint.quality.testing, ["automated tests"]);
    assert.ok(!JSON.stringify(blueprint).match(/password|token|secret value|connection string/i));
    const blueprintSummary = await readFile(path.join(created, "docs", "PROJECT-BLUEPRINT.md"), "utf8");
    assert.match(blueprintSummary, /\/project-blueprint/);
    const orchestrator = await readFile(path.join(created, "config", "orchestrator.yaml"), "utf8");
    assert.match(orchestrator, /^profile: durable$/m);
    const inventory = JSON.parse(await readFile(path.join(created, "reports", "skill-inventory.json"), "utf8"));
    assert.equal(inventory.skills.length, expectedSkillCount);
    const verification = JSON.parse(await readFile(path.join(created, "reports", "installation-verification.json"), "utf8"));
    assert.equal(verification.status, "passed");
    assert.equal(verification.mode, "new-project-creation");
    assert.equal(verification.checks.frameworkSkills, expectedSkillCount);
    assert.equal(verification.checks.clarificationConfigured, true);
    const configuration = JSON.parse(await readFile(path.join(created, "config", "skills-orchestrator.json"), "utf8"));
    assert.deepEqual(configuration.clarification, {
      enabled: true,
      maxQuestionsPerRound: 5,
      blockOnMaterialAmbiguity: true,
      askEveryPrompt: true,
      questionsPerPrompt: 3,
      confirmPlanBeforeExecution: true
    });
    assert.equal(verification.checks.inventoryCurrent, true);
    assert.equal(verification.checks.copilotRouted, true);
    assert.equal(verification.checks.agentInstructionsRouted, true);
    assert.equal(verification.checks.workspaceSupportPresent, true);
    const configuredProfile = JSON.parse(await readFile(path.join(created, "config", "skills-orchestrator.json"), "utf8")).profile;
    assert.equal(configuredProfile, "durable");
    assert.ok(existsSync(path.join(created, ".github", "skills", "project-video", "scripts", "project-video.mjs")));
    assert.ok(existsSync(path.join(created, ".github", "skills", "project-understanding", "scripts", "project-understanding.mjs")));
    assert.ok(existsSync(path.join(created, ".github", "skills", "azure-discovery", "scripts", "azure-discovery.ps1")));
    assert.ok(existsSync(path.join(created, ".github", "skills", "azure-discovery", "scripts", "azure-environment.ps1")));
    assert.ok(existsSync(path.join(created, "infra", "azure-environment.ps1")));
    assert.ok(!existsSync(path.join(created, ".github", "prompts", "project-video.prompt.md")));
    assert.ok(existsSync(path.join(created, "schemas", "project-video-plan.schema.json")));
    assert.ok(existsSync(path.join(created, "schemas", "project-understanding.schema.json")));
    assert.ok(existsSync(path.join(created, "schemas", "project-video-manifest.schema.json")));
    assert.ok(existsSync(path.join(created, "schemas", "project-video-voice-samples.schema.json")));
    assert.ok(existsSync(path.join(created, "schemas", "project-video-voice-selection.schema.json")));
    assert.ok(existsSync(path.join(created, "schemas", "project-video-narration-manifest.schema.json")));
    assert.ok(existsSync(path.join(created, "schemas", "project-video-local-voice-manifest.schema.json")));
    assert.ok(existsSync(path.join(created, "schemas", "project-video-browser-preview-manifest.schema.json")));
    assert.ok(existsSync(path.join(created, "schemas", "azure-discovery.schema.json")));
    assert.ok(existsSync(path.join(created, "schemas", "azure-environment.schema.json")));
    const createdVideoHelper = await readFile(path.join(created, ".github", "skills", "project-video", "scripts", "project-video.mjs"), "utf8");
    assert.match(createdVideoHelper, /command === "install-local-voice"/);
    assert.match(createdVideoHelper, /en_US-ljspeech-high/);
    const createdVideoSkill = await readFile(path.join(created, ".github", "skills", "project-video", "SKILL.md"), "utf8");
    assert.match(createdVideoSkill, /local-piper/);
    assert.match(createdVideoSkill, /azure-preflight/);
    assert.match(createdVideoSkill, /browser-preview/);
    const createdVideoSchema = JSON.parse(await readFile(path.join(created, "schemas", "project-video-plan.schema.json"), "utf8"));
    assert.equal(createdVideoSchema.$defs.localVoice.properties.provider.const, "local-piper");
  } finally {
    await rm(parent, { recursive: true, force: true });
  }
});

test("adoption installs only the scoped instructions the detected stack needs", async () => {
  const project = await mkdtemp(path.join(os.tmpdir(), "pso-stack-python-"));
  try {
    await writeFile(path.join(project, "pyproject.toml"), "[project]\nname = \"fixture\"\n", "utf8");
    await mkdir(path.join(project, "src"), { recursive: true });
    await writeFile(path.join(project, "src", "app.py"), "value = 1\n", "utf8");

    const dryRun = runAdoption(project, "--dry-run");
    assert.match(dryRun, /Detected stack: python/);
    assert.match(dryRun, /Templates skipped as not applicable: [1-9]/);

    runAdoption(project, "--apply");
    const instructions = await readdir(path.join(project, ".github", "instructions"));
    assert.ok(instructions.includes("clarification.instructions.md"));
    assert.ok(instructions.includes("security.instructions.md"));
    for (const absent of ["bicep.instructions.md", "powershell.instructions.md", "csharp.instructions.md", "typescript.instructions.md"]) {
      assert.ok(!instructions.includes(absent), `${absent} must not be installed into a Python-only repository`);
    }

    const plan = JSON.parse(await readFile(path.join(project, "reports", "adoption-plan.json"), "utf8"));
    const skipped = plan.actions.filter((action) => action.action === "skipped");
    assert.ok(skipped.length > 0);
    for (const action of skipped) assert.match(action.reason, /No detected stack matches/);
  } finally {
    await rm(project, { recursive: true, force: true });
  }
});

test("adoption reports existing coverage instead of installing a duplicate", async () => {
  const project = await mkdtemp(path.join(os.tmpdir(), "pso-equivalence-"));
  try {
    await writeFile(path.join(project, "package.json"), "{\"name\":\"equivalence-fixture\"}\n", "utf8");
    await mkdir(path.join(project, ".github", "instructions"), { recursive: true });
    await writeFile(path.join(project, ".github", "instructions", "appsec.instructions.md"), `---
applyTo: "**"
description: Application security rules
---

# AppSec

- Validate all external input and encode output at trust boundaries.
- Never store secrets in source; use managed identity and least privilege.
`, "utf8");

    const dryRun = runAdoption(project, "--dry-run");
    assert.match(dryRun, /Templates covered by existing files: 1/);
    assert.match(dryRun, /covered: \.github\/instructions\/security\.instructions\.md by \.github\/instructions\/appsec\.instructions\.md/);

    runAdoption(project, "--apply");
    const instructions = await readdir(path.join(project, ".github", "instructions"));
    assert.ok(!instructions.includes("security.instructions.md"), "an equivalent project-owned instruction must not be duplicated");
    assert.ok(instructions.includes("clarification.instructions.md"), "the mandatory protocol is never suppressed by equivalence");

    const forced = spawnSync(process.execPath, [runtime, "adopt", "--project", project, "--profile", "core", "--force-templates", "--dry-run"], { cwd: root, encoding: "utf8" });
    assert.equal(forced.status, 0, forced.stderr);
    assert.match(`${forced.stdout}`, /Templates covered by existing files: 0/);
  } finally {
    await rm(project, { recursive: true, force: true });
  }
});

test("adoption reports thin guidance as overlap and still installs the framework standard", async () => {
  const project = await mkdtemp(path.join(os.tmpdir(), "pso-overlap-"));
  try {
    await writeFile(path.join(project, "package.json"), "{\"name\":\"overlap-fixture\"}\n", "utf8");
    await mkdir(path.join(project, ".github", "instructions"), { recursive: true });
    await writeFile(path.join(project, ".github", "instructions", "appsec.instructions.md"), `---
applyTo: "**"
description: security
---

Secure input.
`, "utf8");

    const dryRun = runAdoption(project, "--dry-run");
    assert.match(dryRun, /Templates overlapping existing files: 1/);
    assert.match(dryRun, /overlap: \.github\/instructions\/security\.instructions\.md with \.github\/instructions\/appsec\.instructions\.md/);

    runAdoption(project, "--apply");
    const instructions = await readdir(path.join(project, ".github", "instructions"));
    assert.ok(instructions.includes("security.instructions.md"), "thin overlapping guidance must not suppress the framework standard");
  } finally {
    await rm(project, { recursive: true, force: true });
  }
});

test("adoption dry-run emits a portable JSON plan without mutating the project", async () => {
  const project = await mkdtemp(path.join(os.tmpdir(), "pso-json-plan-"));
  try {
    await writeFile(path.join(project, "package.json"), "{\"name\":\"json-plan-fixture\"}\n", "utf8");
    await mkdir(path.join(project, ".github", "instructions"), { recursive: true });
    await writeFile(path.join(project, ".github", "instructions", "appsec.instructions.md"), `---
applyTo: "**"
description: Application security rules
---

# AppSec
- Validate all external input and encode output at trust boundaries.
- Never store secrets in source; use managed identity and least privilege.
`, "utf8");

    const result = spawnSync(process.execPath, [runtime, "adopt", "--project", project, "--profile", "core", "--dry-run", "--json"], {
      cwd: root,
      encoding: "utf8"
    });
    assert.equal(result.status, 0, result.stderr);
    const plan = JSON.parse(result.stdout);
    assert.equal(plan.project.name, path.basename(project));
    assert.equal(plan.profile, "core");
    assert.equal(plan.counts.covered, 1);
    assert.ok(plan.actions.some((action) => action.action === "covered"
      && action.path === ".github/instructions/security.instructions.md"
      && action.coveredBy === ".github/instructions/appsec.instructions.md"));
    assert.ok(!Object.hasOwn(plan, "projectRoot"));
    assert.ok(plan.actions.every((action) => !Object.hasOwn(action, "source") && !Object.hasOwn(action, "content")));
    assert.ok(!existsSync(path.join(project, "reports")));
    assert.ok(!existsSync(path.join(project, "project-orchestrator.json")));

    const rejected = spawnSync(process.execPath, [runtime, "adopt", "--project", project, "--profile", "core", "--apply", "--accept-risk", "--json"], {
      cwd: root,
      encoding: "utf8"
    });
    assert.notEqual(rejected.status, 0);
    assert.match(`${rejected.stdout}${rejected.stderr}`, /Use --json only with an adoption dry run/);
    assert.ok(!existsSync(path.join(project, "reports")));
  } finally {
    await rm(project, { recursive: true, force: true });
  }
});

test("adoption evidence generator captures the initial plan and no-op rerun", async () => {
  const output = await mkdtemp(path.join(os.tmpdir(), "pso-adoption-evidence-output-"));
  try {
    const result = spawnSync(process.execPath, [path.join(root, "scripts", "adoption-evidence.mjs"), "--output-dir", output], {
      cwd: root,
      encoding: "utf8"
    });
    assert.equal(result.status, 0, `${result.stdout}\n${result.stderr}`);

    const jsonPath = path.join(output, "adoption-rerun-evidence.json");
    const markdownPath = path.join(output, "adoption-rerun-evidence.md");
    const source = await readFile(jsonPath, "utf8");
    const evidence = JSON.parse(source);
    assert.equal(evidence.schemaVersion, "1.0.0");
    assert.equal(evidence.profile, "core");
    assert.ok(evidence.before.summary.plannedWrites > 0);
    assert.equal(evidence.before.summary.coveredAssets, 1);
    assert.equal(evidence.before.summary.conflicts, 0);
    assert.equal(evidence.after.summary.plannedWrites, 0);
    assert.ok(evidence.after.counts["already-current"] > 0);
    assert.equal(evidence.after.noOp, true);
    assert.doesNotMatch(source, /"(?:projectRoot|source|content)"/);

    const markdown = await readFile(markdownPath, "utf8");
    assert.match(markdown, /## Before Apply/);
    assert.match(markdown, /## No-Op Rerun/);
    assert.match(markdown, /security\.instructions\.md/);
  } finally {
    await rm(output, { recursive: true, force: true });
  }
});

test("framework customization code does not change the detected application stack", async () => {
  const project = await mkdtemp(path.join(os.tmpdir(), "pso-framework-stack-isolation-"));
  try {
    await writeFile(path.join(project, "package.json"), "{\"name\":\"framework-stack-isolation\"}\n", "utf8");
    await mkdir(path.join(project, ".github", "skills", "custom", "scripts"), { recursive: true });
    await writeFile(path.join(project, ".github", "skills", "custom", "scripts", "helper.ps1"), "Write-Output 'framework helper'\n", "utf8");
    const plan = spawnSync(process.execPath, [runtime, "adopt", "--project", project, "--profile", "core", "--dry-run", "--json"], {
      cwd: root,
      encoding: "utf8"
    });
    assert.equal(plan.status, 0, plan.stderr);
    const output = JSON.parse(plan.stdout);
    assert.ok(output.detectedStack.includes("javascript"));
    assert.ok(!output.detectedStack.includes("powershell"));
    assert.ok(!output.actions.some((action) => action.path === ".github/instructions/powershell.instructions.md" && action.action === "create"));
  } finally {
    await rm(project, { recursive: true, force: true });
  }
});

test("adoption recognizes additional ecosystems and refuses unknown directories without an override", async () => {
  const cases = [
    ["pom.xml", "<project></project>\n"],
    ["build.gradle.kts", "plugins { }\n"],
    ["Gemfile", "source 'https://rubygems.org'\n"],
    ["main.tf", "terraform {}\n"],
    ["composer.json", "{\"name\":\"fixture/app\"}\n"]
  ];
  for (const [marker, content] of cases) {
    const project = await mkdtemp(path.join(os.tmpdir(), "pso-ecosystem-"));
    try {
      await writeFile(path.join(project, marker), content, "utf8");
      const dryRun = runAdoption(project, "--dry-run");
      assert.match(dryRun, /Existing project:/, `${marker} must be recognized as an adoptable project`);
    } finally {
      await rm(project, { recursive: true, force: true });
    }
  }

  const unknown = await mkdtemp(path.join(os.tmpdir(), "pso-unknown-"));
  try {
    await writeFile(path.join(unknown, "notes.txt"), "not a project\n", "utf8");
    const refused = spawnSync(process.execPath, [runtime, "adopt", "--project", unknown, "--dry-run"], { cwd: root, encoding: "utf8" });
    assert.notEqual(refused.status, 0);
    assert.match(`${refused.stdout}${refused.stderr}`, /rerun with --force-adopt/);
    assert.doesNotMatch(`${refused.stdout}${refused.stderr}`, /Use new-project setup instead/);

    const forced = spawnSync(process.execPath, [runtime, "adopt", "--project", unknown, "--force-adopt", "--dry-run"], { cwd: root, encoding: "utf8" });
    assert.equal(forced.status, 0, forced.stderr);
  } finally {
    await rm(unknown, { recursive: true, force: true });
  }
});

test("managed instruction regions survive heading edits without duplicating", async () => {
  const project = await mkdtemp(path.join(os.tmpdir(), "pso-region-"));
  try {
    await writeFile(path.join(project, "package.json"), "{\"name\":\"region-fixture\"}\n", "utf8");
    runAdoption(project, "--apply");

    const instructionPath = path.join(project, ".github", "copilot-instructions.md");
    const migrated = (await readFile(instructionPath, "utf8"))
      .replaceAll(/<!-- pso:(begin|end) id=[a-z-]+( version=\d+)? -->\r?\n?/g, "")
      .replace("Engagement protocol (mandatory, highest precedence)", "Engagement protocol (our house rules)");
    await writeFile(instructionPath, `${migrated}\nProject-authored trailing note.\n`, "utf8");

    runAdoption(project, "--apply");
    const result = await readFile(instructionPath, "utf8");
    assert.equal([...result.matchAll(/<!-- pso:begin id=clarification-protocol version=1 -->/g)].length, 1);
    assert.equal([...result.matchAll(/Ask one question round only:/g)].length, 1);
    assert.equal([...result.matchAll(/Engagement protocol/g)].length, 1);
    assert.match(result, /Project-authored trailing note\./);

    const verification = JSON.parse(await readFile(path.join(project, "reports", "adoption-verification.json"), "utf8"));
    assert.equal(verification.status, "passed");
  } finally {
    await rm(project, { recursive: true, force: true });
  }
});

test("created projects preinstall dependencies for Copilot cloud agent", async () => {
  const parent = await mkdtemp(path.join(os.tmpdir(), "pso-agent-env-"));
  try {
    const created = spawnSync(process.execPath, [runtime, "create-project", "--name", "Agent Env", "--destination", parent, "--stack", "python,bicep", "--accept-risk"], { cwd: root, encoding: "utf8" });
    assert.equal(created.status, 0, created.stderr);
    const workflow = await readFile(path.join(parent, "agent-env", ".github", "workflows", "copilot-setup-steps.yml"), "utf8");

    assert.match(workflow, /^ {2}copilot-setup-steps:$/m, "the job name must match what Copilot looks for");
    assert.match(workflow, /^ {4}runs-on: ubuntu-latest$/m);
    assert.match(workflow, /^ {6}contents: read$/m);
    assert.match(workflow, /timeout-minutes: 30/);
    assert.match(workflow, /pip install -r requirements\.txt/);
    assert.match(workflow, /az bicep install/);
    assert.doesNotMatch(workflow, /dotnet restore/, "an unrelated stack must not appear");
    for (const match of workflow.matchAll(/^\s*uses:\s*(\S+)\s*$/gm)) {
      assert.match(match[1], /@[a-f0-9]{40}$/, `${match[1]} must be pinned to a full commit SHA`);
    }

    const readme = await readFile(path.join(parent, "agent-env", "README.md"), "utf8");
    assert.match(readme, /Provisioned with Project Orchestrator/);
    assert.doesNotMatch(readme, /Project Skills Orchestrator/);
    assert.match(readme, /Copilot cloud agent/);
  } finally {
    await rm(parent, { recursive: true, force: true });
  }
});

test("a project with no declared stack gets no Copilot setup steps to guess with", async () => {
  const parent = await mkdtemp(path.join(os.tmpdir(), "pso-agent-env-bare-"));
  try {
    const created = spawnSync(process.execPath, [runtime, "create-project", "--name", "Bare Env", "--destination", parent, "--accept-risk"], { cwd: root, encoding: "utf8" });
    assert.equal(created.status, 0, created.stderr);
    assert.ok(!existsSync(path.join(parent, "bare-env", ".github", "workflows", "copilot-setup-steps.yml")));
  } finally {
    await rm(parent, { recursive: true, force: true });
  }
});

test("the workspace is configured so VS Code discovers every customization without extra setup", async () => {
  const parent = await mkdtemp(path.join(os.tmpdir(), "pso-discovery-"));
  try {
    const created = spawnSync(process.execPath, [runtime, "create-project", "--name", "Discovery Demo", "--destination", parent, "--stack", "python", "--accept-risk"], { cwd: root, encoding: "utf8" });
    assert.equal(created.status, 0, created.stderr);
    assert.match(created.stdout, /Rerun with --open to launch Visual Studio Code automatically\./);
    const project = path.join(parent, "discovery-demo");

    const settings = JSON.parse(await readFile(path.join(project, ".vscode", "settings.json"), "utf8"));
    assert.equal(settings["chat.useAgentsMdFile"], true);
    assert.equal(settings["chat.includeApplyingInstructions"], true);
    assert.equal(settings["chat.includeReferencedInstructions"], true);
    assert.equal(settings["chat.promptFilesRecommendations"], true);
    assert.equal(settings["window.title"], "🚀 Discovery Demo • ${rootName}");
    assert.deepEqual(settings["workbench.colorCustomizations"], {
      "titleBar.activeBackground": "#004578",
      "titleBar.activeForeground": "#FFFFFF",
      "statusBar.background": "#004578",
      "statusBar.foreground": "#FFFFFF"
    });
    assert.ok(!Object.hasOwn(settings, "chat.promptFiles"), "the superseded prompt file toggle is not written");
    assert.ok(!Object.hasOwn(settings, "github.copilot.chat.codeGeneration.useInstructionFiles"), "the deprecated instruction setting is not written");

    const manifest = JSON.parse(await readFile(path.join(project, "project-orchestrator.json"), "utf8"));
    assert.equal(manifest.workspaceColor, "#004578");
    const workspace = JSON.parse(await readFile(path.join(project, "discovery-demo.code-workspace"), "utf8"));
    assert.equal(workspace.settings["window.title"], settings["window.title"]);
    assert.deepEqual(workspace.settings["workbench.colorCustomizations"], settings["workbench.colorCustomizations"]);

    for (const relative of [
      ".github/copilot-instructions.md",
      "AGENTS.md",
      ".github/instructions/clarification.instructions.md",
      ".github/prompts/create-adr.prompt.md",
      ".github/agents/security-reviewer.agent.md",
      ".github/skills/clarify-the-ask/SKILL.md"
    ]) {
      assert.ok(existsSync(path.join(project, relative)), `${relative} must exist in a default discovery location`);
    }

    const readme = await readFile(path.join(project, "README.md"), "utf8");
    assert.match(readme, /workspace trust/i);
    assert.match(readme, /recommended extensions/i);
  } finally {
    await rm(parent, { recursive: true, force: true });
  }
});

test("new projects validate and apply a custom workspace color", async () => {
  const parent = await mkdtemp(path.join(os.tmpdir(), "pso-workspace-color-"));
  try {
    const custom = spawnSync(process.execPath, [runtime, "create-project", "--name", "Light Workspace", "--destination", parent, "--color", "#ffffff", "--accept-risk"], {
      cwd: root,
      encoding: "utf8"
    });
    assert.equal(custom.status, 0, custom.stderr);
    const settings = JSON.parse(await readFile(path.join(parent, "light-workspace", ".vscode", "settings.json"), "utf8"));
    assert.equal(settings["window.title"], "🚀 Light Workspace • ${rootName}");
    assert.deepEqual(settings["workbench.colorCustomizations"], {
      "titleBar.activeBackground": "#FFFFFF",
      "titleBar.activeForeground": "#000000",
      "statusBar.background": "#FFFFFF",
      "statusBar.foreground": "#000000"
    });
    const manifest = JSON.parse(await readFile(path.join(parent, "light-workspace", "project-orchestrator.json"), "utf8"));
    assert.equal(manifest.workspaceColor, "#FFFFFF");
    const workspace = JSON.parse(await readFile(path.join(parent, "light-workspace", "light-workspace.code-workspace"), "utf8"));
    assert.equal(workspace.settings["window.title"], settings["window.title"]);
    assert.deepEqual(workspace.settings["workbench.colorCustomizations"], settings["workbench.colorCustomizations"]);

    const invalid = spawnSync(process.execPath, [runtime, "create-project", "--name", "Invalid Workspace", "--destination", parent, "--color", "blue", "--accept-risk"], {
      cwd: root,
      encoding: "utf8"
    });
    assert.notEqual(invalid.status, 0);
    assert.match(`${invalid.stdout}${invalid.stderr}`, /Workspace color must use #RRGGBB format/);
    assert.ok(!existsSync(path.join(parent, "invalid-workspace")));
  } finally {
    await rm(parent, { recursive: true, force: true });
  }
});

test("guided project creation prompts for the workspace color", async () => {
  const parent = await mkdtemp(path.join(os.tmpdir(), "pso-guided-color-"));
  try {
    const created = await runInteractive(["create-project"], [
      { prompt: /Project name: /, answer: "Guided Color" },
      { prompt: /Destination folder \[[^\]]+\]: /, answer: parent },
      { prompt: /Stack, comma separated, blank for none \[[^\]]+\]: /, answer: "" },
      { prompt: /Workspace accent color \[#004578\]: /, answer: "#D13438" },
      { prompt: /What should be built first\? Blank to skip: /, answer: "" },
      { prompt: /Open in Visual Studio Code when finished\? \[Y\/n\]: /, answer: "n" },
      { prompt: /Type "I ACCEPT" to acknowledge the risks and continue: /, answer: "I ACCEPT" }
    ]);
    assert.equal(created.status, 0, `${created.stdout}\n${created.stderr}`);
    assert.equal(created.answers, 7, created.stdout);
    const settings = JSON.parse(await readFile(path.join(parent, "guided-color", ".vscode", "settings.json"), "utf8"));
    assert.equal(settings["workbench.colorCustomizations"]["titleBar.activeBackground"], "#D13438");
    assert.equal(settings["workbench.colorCustomizations"]["titleBar.activeForeground"], "#FFFFFF");
  } finally {
    await rm(parent, { recursive: true, force: true });
  }
});

test("--open reports its outcome and never fails project creation", async () => {
  const parent = await mkdtemp(path.join(os.tmpdir(), "pso-open-"));
  try {
    const created = spawnSync(process.execPath, [runtime, "create-project", "--name", "Open Demo", "--destination", parent, "--accept-risk", "--open"], {
      cwd: root,
      encoding: "utf8",
      env: { ...process.env, PSO_SUPPRESS_EDITOR_LAUNCH: "1" }
    });
    assert.equal(created.status, 0, created.stderr);
    assert.match(created.stdout, /Could not open Visual Studio Code automatically/);
    assert.doesNotMatch(created.stdout, /Rerun with --open/);
    const verification = JSON.parse(await readFile(path.join(parent, "open-demo", "reports", "installation-verification.json"), "utf8"));
    assert.equal(verification.status, "passed");

    const help = spawnSync(process.execPath, [runtime, "--help"], { cwd: root, encoding: "utf8" });
    assert.equal(help.status, 0, help.stderr);
    assert.match(help.stdout, /--open launches Visual Studio Code/);
    assert.match(help.stdout, /--stack is optional/);
  } finally {
    await rm(parent, { recursive: true, force: true });
  }
});

test("--intent records the requested outcome and stamps an unambiguous creation time", async () => {
  const parent = await mkdtemp(path.join(os.tmpdir(), "pso-intent-"));
  const outcome = "Demo started 10:30 am and runs for 1 hour. Build a web app with a countdown to the end.";
  try {
    const created = spawnSync(process.execPath, [runtime, "create-project", "--name", "Intent Demo", "--destination", parent, "--intent", outcome, "--accept-risk", "--open"], {
      cwd: root,
      encoding: "utf8",
      env: { ...process.env, PSO_SUPPRESS_EDITOR_LAUNCH: "1" }
    });
    assert.equal(created.status, 0, created.stderr);

    const project = path.join(parent, "intent-demo");
    const brief = await readFile(path.join(project, "docs", "PROJECT-BRIEF.md"), "utf8");
    assert.ok(brief.includes(outcome), "the requested outcome is recorded verbatim");
    assert.match(brief, /ask three clarifying questions/);
    assert.match(brief, /Resolve every relative or partial time/);

    const manifest = JSON.parse(await readFile(path.join(project, "project-orchestrator.json"), "utf8"));
    assert.match(manifest.createdAt, /^\d{4}-\d{2}-\d{2}T[\d:.]+Z$/);
    assert.ok(brief.includes(manifest.createdAt), "the brief and the manifest agree on the creation instant");

    assert.match(created.stdout, /Project brief:/);
    assert.match(created.stdout, /Paste this into Copilot Chat/);
    assert.ok(created.stdout.includes(outcome), "the fallback prints a prompt the user can actually paste");
  } finally {
    await rm(parent, { recursive: true, force: true });
  }
});

test("a project created without --intent carries no brief", async () => {
  const parent = await mkdtemp(path.join(os.tmpdir(), "pso-nointent-"));
  try {
    const created = spawnSync(process.execPath, [runtime, "create-project", "--name", "Quiet Demo", "--destination", parent, "--accept-risk"], {
      cwd: root, encoding: "utf8"
    });
    assert.equal(created.status, 0, created.stderr);
    assert.equal(existsSync(path.join(parent, "quiet-demo", "docs", "PROJECT-BRIEF.md")), false);
    assert.doesNotMatch(created.stdout, /Project brief:/);
  } finally {
    await rm(parent, { recursive: true, force: true });
  }
});

test("intent text is stored verbatim and never interpreted as a command", async () => {
  const parent = await mkdtemp(path.join(os.tmpdir(), "pso-intent-safe-"));
  const hostile = 'Build a page & echo pwned > owned.txt; rm -rf / `whoami` $(id) | tee out';
  try {
    const created = spawnSync(process.execPath, [runtime, "create-project", "--name", "Safe Demo", "--destination", parent, "--intent", hostile, "--accept-risk"], {
      cwd: root, encoding: "utf8"
    });
    assert.equal(created.status, 0, created.stderr);
    const project = path.join(parent, "safe-demo");
    const brief = await readFile(path.join(project, "docs", "PROJECT-BRIEF.md"), "utf8");
    assert.ok(brief.includes(hostile), "metacharacters survive intact rather than being expanded or stripped");
    assert.equal(existsSync(path.join(project, "owned.txt")), false);
    assert.equal(existsSync(path.join(root, "owned.txt")), false);
  } finally {
    await rm(parent, { recursive: true, force: true });
  }
});

test("every created project receives the Azure discovery and deployment scaffold", async () => {
  const parent = await mkdtemp(path.join(os.tmpdir(), "pso-infra-"));
  try {
    // No --stack: the scaffold installs unconditionally, so a stackless project still gets it.
    const created = spawnSync(process.execPath, [runtime, "create-project", "--name", "Infra Demo", "--destination", parent, "--accept-risk"], {
      cwd: root, encoding: "utf8"
    });
    assert.equal(created.status, 0, created.stderr);
    const infra = path.join(parent, "infra-demo", "infra");
    for (const file of ["deploy.ps1", "discover.ps1", "deploy-infra.ps1", "main.bicep", "README.md"]) {
      assert.equal(existsSync(path.join(infra, file)), true, `infra/${file} is installed`);
    }
    const skillCount = (await readdir(path.join(root, ".github", "skills"), { withFileTypes: true }))
      .filter((entry) => entry.isDirectory()).length;
    const promptFiles = await readdir(path.join(parent, "infra-demo", ".github", "prompts"));
    assert.equal(promptFiles.filter((file) => file.endsWith("-help.prompt.md") && file !== "skills-help.prompt.md").length, skillCount);
    assert.ok(promptFiles.includes("skills-help.prompt.md"));
    assert.ok(promptFiles.includes("skill-update-help.prompt.md"));
    const skillUpdateHelp = await readFile(path.join(parent, "infra-demo", ".github", "prompts", "skill-update-help.prompt.md"), "utf8");
    assert.match(skillUpdateHelp, /Run the skill with \/skill-update\./);
    assert.match(skillUpdateHelp, /Open this help with \/skill-update-help\./);
    const workflowPlannerHelp = await readFile(path.join(parent, "infra-demo", ".github", "prompts", "workflow-planner-help.prompt.md"), "utf8");
    assert.match(workflowPlannerHelp, /schema 1\.1/);
    assert.match(workflowPlannerHelp, /terminal handoff/);
    assert.match(workflowPlannerHelp, /workflow-planned/);
    const auditCodeHelp = await readFile(path.join(parent, "infra-demo", ".github", "prompts", "audit-code-help.prompt.md"), "utf8");
    assert.match(auditCodeHelp, /AI-slop findings identify concrete harmful behavior/);
    assert.match(auditCodeHelp, /locally owned disposable and async-disposable lifetimes/);
    assert.match(auditCodeHelp, /Draft standards are labeled and never silently replace final baselines/);
    assert.match(auditCodeHelp, /Current audit reports use schema 2\.2 and reference one immutable content-addressed audit evidence snapshot/);
    assert.match(auditCodeHelp, /Supplemental scanners provide defense in depth but never satisfy readiness/);
    assert.match(auditCodeHelp, /worktree result must be empty and covers current tracked reports and untracked distributable files/);
    assert.match(auditCodeHelp, /Metadata, checkpoint, and scan-digest helpers must exit successfully/);
    assert.match(auditCodeHelp, /no more than 24 hours old and cannot have a future timestamp/);
    assert.match(auditCodeHelp, /represent the repository root without an absolute workstation path/);
    assert.match(auditCodeHelp, /distinguish declaration time, last verified time, version resolution, currency verification/);
    assert.match(auditCodeHelp, /Every verification record includes audit run ID/);
    assert.match(auditCodeHelp, /immutable content-addressed audit evidence snapshot/);
    const auditReviewHelp = await readFile(path.join(parent, "infra-demo", ".github", "prompts", "audit-review-findings-help.prompt.md"), "utf8");
    assert.match(auditReviewHelp, /Schema 2\.1 reviews preserve verification evidence exactly/);
    const auditPlanHelp = await readFile(path.join(parent, "infra-demo", ".github", "prompts", "audit-plan-remediation-help.prompt.md"), "utf8");
    assert.match(auditPlanHelp, /auditRunId and SHA-256 digest/);
    const auditRemediationHelp = await readFile(path.join(parent, "infra-demo", ".github", "prompts", "audit-remediation-help.prompt.md"), "utf8");
    assert.match(auditRemediationHelp, /same auditRunId/);
    const instructions = await readFile(path.join(parent, "infra-demo", ".github", "instructions", "azure-deployment.instructions.md"), "utf8");
    assert.match(instructions, /applyTo:\s*"infra\/\*\*"/);
  } finally {
    await rm(parent, { recursive: true, force: true });
  }
});

test("standalone project update refreshes framework skills without replacing project files", async () => {
  const parent = await mkdtemp(path.join(os.tmpdir(), "pso-update-"));
  try {
    const created = spawnSync(process.execPath, [runtime, "create-project", "--name", "Update Demo", "--destination", parent, "--accept-risk"], {
      cwd: root, encoding: "utf8"
    });
    assert.equal(created.status, 0, created.stderr);
    const project = path.join(parent, "update-demo");
    const skillPath = path.join(project, ".github", "skills", "azure-discovery", "SKILL.md");
    const projectFile = path.join(project, "src", "owned.txt");
    const report = path.join(project, "reports", "azure-discovery.md");
    await writeFile(skillPath, "project-owned replacement\n", "utf8");
    await writeFile(projectFile, "preserve me\n", "utf8");
    await writeFile(report, "preserve report\n", "utf8");
    const updated = spawnSync(process.execPath, [runtime, "update", "--project", project, "--accept-risk"], {
      cwd: root, encoding: "utf8"
    });
    assert.equal(updated.status, 0, updated.stderr);
    assert.match(await readFile(skillPath, "utf8"), /discover services, regions, chat and image-generation models, SKUs/);
    assert.equal(await readFile(projectFile, "utf8"), "preserve me\n");
    assert.equal(await readFile(report, "utf8"), "preserve report\n");
  } finally {
    await rm(parent, { recursive: true, force: true });
  }
});

test("the Azure scaffold carries no tenant, subscription, or credential material", async () => {
  const infra = path.join(root, "templates", "project", "infra");
  const files = await readdir(infra);
  const forbidden = [
    [/\b[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}\b/i, "a literal GUID, which would pin a tenant or subscription"],
    [/client_?secret|clientSecret/i, "a client secret reference"],
    [/--password|-Password\b/, "a password argument"],
    [/service[- ]?principal\s*=|\bsp_?password\b/i, "service principal credentials"]
  ];
  for (const file of files) {
    const content = await readFile(path.join(infra, file), "utf8");
    // Built-in role definition ids are global Azure constants, not environment identifiers.
    const scannable = content.split("\n").filter((line) => !/RoleId|roleDefinition/i.test(line)).join("\n");
    for (const [pattern, description] of forbidden) {
      assert.doesNotMatch(scannable, pattern, `infra/${file} must not contain ${description}`);
    }
  }
});

test("the Azure baseline authenticates by managed identity and follows the shipped Bicep standards", async () => {
  const bicep = await readFile(path.join(root, "templates", "project", "infra", "main.bicep"), "utf8");
  assert.match(bicep, /targetScope = 'resourceGroup'/, "targetScope is declared explicitly");
  assert.match(bicep, /type: 'SystemAssigned'/, "the web app gets a managed identity");
  assert.match(bicep, /Microsoft\.Authorization\/roleAssignments/, "access is granted by RBAC rather than keys");
  assert.match(bicep, /param publicNetworkAccess string = 'Enabled'/, "the baseline deploys reachable");
  assert.match(bicep, /isAzureGov \? 'AzureUSGovernment' : 'AzureCloud'/, "one build serves both clouds");
  assert.doesNotMatch(bicep, /listKeys\(|\.keys\[0\]|primaryKey/i, "no service key is ever read into app settings");
});

test("the reachable-by-default baseline states the production hardening it still needs", async () => {
  const readme = await readFile(path.join(root, "templates", "project", "infra", "README.md"), "utf8");
  assert.match(readme, /change this before production/i);
  assert.match(readme, /private endpoints/i);
  const instructions = await readFile(path.join(root, "templates", "project", ".github", "instructions", "azure-deployment.instructions.md"), "utf8");
  assert.match(instructions, /not a substitute for network isolation/i);
});

test("the Azure baseline treats Key Vault as optional", async () => {
  const bicep = await readFile(path.join(root, "templates", "project", "infra", "main.bicep"), "utf8");
  assert.match(bicep, /param deployKeyVault bool = true/);
  assert.match(bicep, /resource keyVault '[^']+' = if \(deployKeyVault\)/, "the vault itself is conditional");
  assert.match(bicep, /resource keyVaultSecretsUser '[^']+' = if \(deployKeyVault\)/, "its role assignment disappears with it");
  // A conditional resource is null until deployed, so every read of it must be safe-dereferenced.
  assert.doesNotMatch(bicep, /keyVault\.properties/, "no unguarded read of a resource that may not exist");
  const deploy = await readFile(path.join(root, "templates", "project", "infra", "deploy.ps1"), "utf8");
  assert.match(deploy, /\[switch\]\$NoKeyVault/, "the switch is reachable from the entry point");
});

test("discovery probes every region rather than only the target region", async () => {
  const discover = await readFile(path.join(root, "templates", "project", "infra", "discover.ps1"), "utf8");
  assert.match(discover, /function Get-AzureDiscoveryProjectRoot/);
  assert.match(discover, /function Get-AzureCognitiveKindRegion/);
  assert.match(discover, /function Get-AzureSpeechResourceSummary/);
  assert.match(discover, /function Get-AzureImageModelClassification/);
  assert.match(discover, /function ConvertTo-AzureImageModelSummary/);
  assert.match(discover, /function Get-AzureImageQuotaSummary/);
  assert.match(discover, /function Get-AzureImageDeploymentSummary/);
  assert.match(discover, /function Invoke-AzureDiscovery/);
  // The all-region probe omits --location on purpose; pinning it reports false negatives.
  assert.match(discover, /az cognitiveservices account list-skus --kind \$Kind `\r?\n\s*--query "\[\]\.locations"/);
  assert.match(discover, /az cognitiveservices account list `\r?\n\s*--query "\[\?kind=='SpeechServices'/);
  assert.match(discover, /existingResourceQuerySucceeded/);
  assert.match(discover, /existingResourceRegions/);
  assert.doesNotMatch(discover, /\.\{name:name,/, "Speech discovery must not persist resource names");
  assert.match(discover, /'gpt-5\.1', 'gpt-4\.1'/, "the model preference ladder is present");
  assert.match(discover, /\^gpt-image-2/);
  assert.match(discover, /\^MAI-Image-/);
  assert.match(discover, /az cognitiveservices usage list --location \$Location/);
  assert.match(discover, /az cognitiveservices account deployment list --name \$account\.accountName --resource-group \$account\.resourceGroup/);
  assert.match(discover, /catalogQuerySucceeded\s+=\s+\$imageCatalogQuerySucceeded/);
  assert.match(discover, /requiresExplicitAcceptance\s+=\s+\[bool\]/);
  assert.doesNotMatch(discover, /deploymentName|deploymentId|resourceId|endpoint\s+=/, "tracked image discovery must not persist deployment identifiers or endpoints");
});

test("adoption accepts an explicit stack override", async () => {
  const project = await mkdtemp(path.join(os.tmpdir(), "pso-stack-override-"));
  try {
    await writeFile(path.join(project, "package.json"), "{\"name\":\"stack-override\"}\n", "utf8");
    const plan = spawnSync(process.execPath, [runtime, "adopt", "--project", project, "--profile", "core", "--stack", "python", "--dry-run", "--json"], {
      cwd: root, encoding: "utf8"
    });
    assert.equal(plan.status, 0, plan.stderr);
    const output = JSON.parse(plan.stdout);
    assert.ok(output.detectedStack.includes("python"));
  } finally {
    await rm(project, { recursive: true, force: true });
  }
});

// Regression guard: `chat` is implemented in cli.js, so handing it to the Electron binary opens a
// window and silently discards the subcommand, which looked like success.
test("the chat handover invokes the VS Code CLI entry point, not the Electron binary alone", async () => {
  const source = await readFile(runtime, "utf8");
  assert.match(source, /ELECTRON_RUN_AS_NODE/, "the CLI entry point is invoked the way the launcher does");
  assert.match(source, /args\.unshift\(cliPath\)/, "cli.js is prepended to the chat arguments");
  assert.match(source, /%~dp0\(\[\^"\]\*\?cli\\\.js\)/, "the cli.js path is read from the launcher rather than guessed");
  assert.doesNotMatch(source, /shell:\s*true/, "no spawn uses a shell, so intent text cannot be interpreted as a command");
});

test("created projects wire a usable VS Code workspace for the declared stack", async () => {  const parent = await mkdtemp(path.join(os.tmpdir(), "pso-workspace-"));
  try {
    const created = spawnSync(process.execPath, [runtime, "create-project", "--name", "Workspace Demo", "--destination", parent, "--stack", "csharp,bicep", "--accept-risk"], { cwd: root, encoding: "utf8" });
    assert.equal(created.status, 0, created.stderr);
    const project = path.join(parent, "workspace-demo");

    const extensions = JSON.parse(await readFile(path.join(project, ".vscode", "extensions.json"), "utf8"));
    assert.ok(extensions.recommendations.includes("github.copilot"));
    assert.ok(extensions.recommendations.includes("editorconfig.editorconfig"));
    assert.ok(extensions.recommendations.includes("ms-dotnettools.csdevkit"), "a C# project recommends the C# Dev Kit");
    assert.ok(extensions.recommendations.includes("ms-azuretools.vscode-bicep"), "a Bicep project recommends the Bicep extension");
    assert.ok(!extensions.recommendations.includes("ms-python.python"), "an unrelated language extension is not recommended");
    assert.equal(new Set(extensions.recommendations).size, extensions.recommendations.length, "recommendations are unique");

    const tasks = JSON.parse(await readFile(path.join(project, ".vscode", "tasks.json"), "utf8"));
    assert.equal(tasks.version, "2.0.0");
    const build = tasks.tasks.find((task) => task.label === "build");
    const test = tasks.tasks.find((task) => task.label === "test");
    assert.equal(build.command, "dotnet build");
    assert.equal(build.group.isDefault, true);
    assert.equal(test.command, "dotnet test");
    assert.equal(test.group.kind, "test");
    assert.ok(tasks.tasks.some((task) => task.label === "validate: bicep"));

    const launch = JSON.parse(await readFile(path.join(project, ".vscode", "launch.json"), "utf8"));
    assert.equal(launch.version, "0.2.0");
    assert.equal(launch.configurations.length, 1);
    assert.equal(launch.configurations[0].type, "coreclr");
    assert.equal(launch.configurations[0].preLaunchTask, "build");

    const attributes = await readFile(path.join(project, ".gitattributes"), "utf8");
    assert.match(attributes, /^\* text=auto eol=lf$/m);
    assert.match(attributes, /^\*\.ps1 text eol=crlf$/m);

    const readme = await readFile(path.join(project, "README.md"), "utf8");
    assert.match(readme, /Ctrl\+Shift\+B/);
    assert.match(readme, /REPLACE_WITH_/);
  } finally {
    await rm(parent, { recursive: true, force: true });
  }
});

test("a project with no declared stack gets no misleading build or debug configuration", async () => {
  const parent = await mkdtemp(path.join(os.tmpdir(), "pso-workspace-bare-"));
  try {
    const created = spawnSync(process.execPath, [runtime, "create-project", "--name", "Bare Workspace", "--destination", parent, "--accept-risk"], { cwd: root, encoding: "utf8" });
    assert.equal(created.status, 0, created.stderr);
    const project = path.join(parent, "bare-workspace");

    assert.ok(!existsSync(path.join(project, ".vscode", "tasks.json")), "no build task is invented without a stack");
    assert.ok(!existsSync(path.join(project, ".vscode", "launch.json")), "no debug configuration is invented without a stack");
    assert.ok(existsSync(path.join(project, ".gitattributes")), "line ending normalization always applies");

    const extensions = JSON.parse(await readFile(path.join(project, ".vscode", "extensions.json"), "utf8"));
    assert.deepEqual(extensions.recommendations, ["github.copilot", "github.copilot-chat", "bierner.markdown-mermaid", "editorconfig.editorconfig"]);

    const readme = await readFile(path.join(project, "README.md"), "utf8");
    assert.match(readme, /Rerun setup with `--stack`/);
  } finally {
    await rm(parent, { recursive: true, force: true });
  }
});

test("adoption adds workspace tasks and debug configuration from the detected stack", async () => {
  const project = await mkdtemp(path.join(os.tmpdir(), "pso-workspace-adopt-"));
  try {
    await writeFile(path.join(project, "pyproject.toml"), "[project]\nname = \"fixture\"\n", "utf8");
    await mkdir(path.join(project, "src"), { recursive: true });
    await writeFile(path.join(project, "src", "app.py"), "value = 1\n", "utf8");
    runAdoption(project, "--apply");

    const tasks = JSON.parse(await readFile(path.join(project, ".vscode", "tasks.json"), "utf8"));
    assert.equal(tasks.tasks.find((task) => task.label === "test").command, "python -m pytest");

    const launch = JSON.parse(await readFile(path.join(project, ".vscode", "launch.json"), "utf8"));
    assert.equal(launch.configurations[0].type, "debugpy");
    assert.equal(launch.configurations[0].program, "${file}");

    const extensions = JSON.parse(await readFile(path.join(project, ".vscode", "extensions.json"), "utf8"));
    assert.ok(extensions.recommendations.includes("ms-python.python"));
    assert.ok(!extensions.recommendations.includes("ms-dotnettools.csdevkit"));

    assert.ok(existsSync(path.join(project, ".gitattributes")));
    runAdoption(project, "--dry-run");
  } finally {
    await rm(project, { recursive: true, force: true });
  }
});

test("adoption never overwrites a project's own workspace configuration", async () => {
  const project = await mkdtemp(path.join(os.tmpdir(), "pso-workspace-preserve-"));
  try {
    await writeFile(path.join(project, "package.json"), "{\"name\":\"preserve-fixture\"}\n", "utf8");
    await mkdir(path.join(project, ".vscode"), { recursive: true });
    const ownTasks = "{\n  \"version\": \"2.0.0\",\n  \"tasks\": [{ \"label\": \"my own build\", \"type\": \"shell\", \"command\": \"make\" }]\n}\n";
    await writeFile(path.join(project, ".vscode", "tasks.json"), ownTasks, "utf8");
    await writeFile(path.join(project, ".gitattributes"), "# project owned\n", "utf8");

    runAdoption(project, "--apply");
    assert.equal(await readFile(path.join(project, ".vscode", "tasks.json"), "utf8"), ownTasks);
    assert.equal(await readFile(path.join(project, ".gitattributes"), "utf8"), "# project owned\n");
  } finally {
    await rm(project, { recursive: true, force: true });
  }
});

test("created projects wire real continuous integration for a declared stack", async () => {
  const parent = await mkdtemp(path.join(os.tmpdir(), "pso-ci-"));
  try {
    const declared = spawnSync(process.execPath, [runtime, "create-project", "--name", "Ci Declared", "--destination", parent, "--stack", "typescript", "--accept-risk"], { cwd: root, encoding: "utf8" });
    assert.equal(declared.status, 0, declared.stderr);
    const declaredWorkflow = await readFile(path.join(parent, "ci-declared", ".github", "workflows", "ci.yml"), "utf8");
    assert.match(declaredWorkflow, /run: npm ci/);
    assert.match(declaredWorkflow, /run: npm test/);
    assert.doesNotMatch(declaredWorkflow, /exit 1/);
    for (const match of declaredWorkflow.matchAll(/^\s*uses:\s*(\S+)\s*$/gm)) {
      assert.match(match[1], /@[a-f0-9]{40}$/, `${match[1]} must be pinned to a full commit SHA`);
    }
    const manifest = JSON.parse(await readFile(path.join(parent, "ci-declared", "project-orchestrator.json"), "utf8"));
    assert.deepEqual(manifest.declaredStack, ["javascript", "typescript"]);

    const bare = spawnSync(process.execPath, [runtime, "create-project", "--name", "Ci Bare", "--destination", parent, "--accept-risk"], { cwd: root, encoding: "utf8" });
    assert.equal(bare.status, 0, bare.stderr);
    const bareWorkflow = await readFile(path.join(parent, "ci-bare", ".github", "workflows", "ci.yml"), "utf8");
    assert.match(bareWorkflow, /exit 1/);
    assert.doesNotMatch(bareWorkflow, /echo "Configure the build command/);
    const bareReadme = await readFile(path.join(parent, "ci-bare", "README.md"), "utf8");
    assert.match(bareReadme, /does not yet contain application code/);

    const rejected = spawnSync(process.execPath, [runtime, "create-project", "--name", "Ci Bad", "--destination", parent, "--stack", "cobol", "--accept-risk"], { cwd: root, encoding: "utf8" });
    assert.notEqual(rejected.status, 0);
    assert.match(`${rejected.stdout}${rejected.stderr}`, /Unknown --stack value: cobol/);
  } finally {
    await rm(parent, { recursive: true, force: true });
  }
});

