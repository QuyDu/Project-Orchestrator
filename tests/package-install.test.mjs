import assert from "node:assert/strict";
import { mkdtemp, readFile, readdir, rm } from "node:fs/promises";
import { existsSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import { spawnSync } from "node:child_process";
import test from "node:test";

const root = path.resolve(import.meta.dirname, "..");
const packageManifest = JSON.parse(await readFile(path.join(root, "package.json"), "utf8"));
const candidateRoot = path.join(root, "dist", `${packageManifest.name}-${packageManifest.version}`);
const expectedSkillCount = (await readdir(path.join(root, ".github", "skills"), { withFileTypes: true }))
  .filter((entry) => entry.isDirectory()).length;

test("private package installs offline and resolves bundled project assets", async () => {
  const packageFiles = (await readdir(candidateRoot)).filter((item) => item.endsWith(".tgz"));
  assert.equal(packageFiles.length, 1, "release candidate must contain exactly one private package");
  const installation = await mkdtemp(path.join(os.tmpdir(), "pso-package-install-"));
  const projects = await mkdtemp(path.join(os.tmpdir(), "pso-package-projects-"));
  try {
    const npmCli = [
      process.env.npm_execpath,
      path.join(path.dirname(process.execPath), "node_modules", "npm", "bin", "npm-cli.js")
    ].find((candidate) => candidate && existsSync(candidate));
    assert.ok(npmCli && existsSync(npmCli), "npm CLI path is required for package installation test");
    const install = spawnSync(process.execPath, [npmCli, "install", "--offline", "--ignore-scripts", "--no-audit", "--no-fund", path.join(candidateRoot, packageFiles[0])], {
      cwd: installation,
      encoding: "utf8"
    });
    assert.equal(install.status, 0, `${install.stdout}\n${install.stderr}`);

    const installedRuntime = path.join(installation, "node_modules", packageManifest.name, "pso.mjs");
    const verify = spawnSync(process.execPath, [installedRuntime, "verify"], { cwd: installation, encoding: "utf8" });
    assert.equal(verify.status, 0, `${verify.stdout}\n${verify.stderr}`);
    assert.match(verify.stdout, /Verified registry-free distribution/);

    const create = spawnSync(process.execPath, [installedRuntime, "create-project", "--name", "Packaged Fixture", "--destination", projects, "--accept-risk"], {
      cwd: installation,
      encoding: "utf8"
    });
    assert.equal(create.status, 0, `${create.stdout}\n${create.stderr}`);
    const createdProject = path.join(projects, "packaged-fixture");
    assert.ok(existsSync(path.join(createdProject, ".github", "skills", "project-skills-orchestrator", "SKILL.md")));
    assert.ok(existsSync(path.join(createdProject, ".github", "skills", "agent-builder", "scripts", "agent-builder.mjs")));
    assert.ok(existsSync(path.join(createdProject, ".github", "skills", "user-personalization", "scripts", "user-personalization.mjs")));
    assert.ok(existsSync(path.join(createdProject, ".github", "skills", "personalized-content", "scripts", "personalized-content.mjs")));
    assert.ok(existsSync(path.join(createdProject, ".github", "skills", "personalized-content", "references", "diorama-production-rules.md")));
    assert.ok(existsSync(path.join(createdProject, ".github", "skills", "user-personalization", "references", "personalization-questionnaire.md")));
    assert.ok(existsSync(path.join(createdProject, "schemas", "agent-blueprint.schema.json")));
    assert.ok(existsSync(path.join(createdProject, "schemas", "user-personalization.schema.json")));
    assert.ok(existsSync(path.join(createdProject, ".github", "prompts", "user-personalization-help.prompt.md")));
    assert.ok(existsSync(path.join(createdProject, ".github", "prompts", "personalized-content-help.prompt.md")));
    const installedAgentBuilder = await readFile(path.join(createdProject, ".github", "skills", "agent-builder", "SKILL.md"), "utf8");
    const installedAgentBuilderRuntime = await readFile(path.join(createdProject, ".github", "skills", "agent-builder", "scripts", "agent-builder.mjs"), "utf8");
    const installedPersonalizedContent = await readFile(path.join(createdProject, ".github", "skills", "personalized-content", "SKILL.md"), "utf8");
    const installedPersonalizedContentRuntime = await readFile(path.join(createdProject, ".github", "skills", "personalized-content", "scripts", "personalized-content.mjs"), "utf8");
    const installedDioramaRules = await readFile(path.join(createdProject, ".github", "skills", "personalized-content", "references", "diorama-production-rules.md"), "utf8");
    const installedRuntimeSource = await readFile(installedRuntime, "utf8");
    const installedBlueprintSchema = JSON.parse(await readFile(path.join(createdProject, "schemas", "agent-blueprint.schema.json"), "utf8"));
    const installedPlanSchema = JSON.parse(await readFile(path.join(createdProject, "schemas", "agent-builder-plan.schema.json"), "utf8"));
    assert.match(installedAgentBuilder, /chatgpt-action.*not direct Foundry publication/);
    assert.match(installedAgentBuilderRuntime, /"foundry-endpoint", "microsoft-365-copilot-and-teams", "chatgpt-action"/);
    assert.match(installedPersonalizedContent, /current project as its sole topic and source/);
    assert.match(installedPersonalizedContent, /artifacts\/personalized-content\/<run-id>\//);
    assert.match(installedPersonalizedContent, /--visual-style whiteboard\|diorama/);
    assert.match(installedPersonalizedContentRuntime, /PROJECT_UNDERSTANDING_SCRIPT/);
    assert.match(installedPersonalizedContentRuntime, /const OUTPUT_ROOT = "artifacts\/personalized-content"/);
    assert.match(installedPersonalizedContentRuntime, /const VISUAL_STYLES = new Set\(\["whiteboard", "diorama"\]\)/);
    assert.match(installedDioramaRules, /bitmap-generation/);
    assert.match(installedDioramaRules, /physically-based-3d/);
    assert.match(installedDioramaRules, /HTML, CSS, SVG.*prohibited as final diorama output/is);
    assert.match(installedDioramaRules, /## Renderer Qualification Record/);
    assert.match(installedDioramaRules, /## Final Artifact Validation/);
    assert.match(installedDioramaRules, /## Reference Use Record/);
    assert.match(installedRuntimeSource, /"publication-targets", "version-policy", "microsoft365-audience", "chatgpt-visibility"/);
    assert.ok(installedBlueprintSchema.properties.schemaVersion.enum.includes("2.2.0"));
    assert.ok(installedPlanSchema.properties.schemaVersion.enum.includes("1.1.0"));
    const verification = JSON.parse(await readFile(path.join(createdProject, "reports", "installation-verification.json"), "utf8"));
    assert.equal(verification.status, "passed");
    assert.equal(verification.checks.frameworkSkills, expectedSkillCount);
  } finally {
    await rm(installation, { recursive: true, force: true });
    await rm(projects, { recursive: true, force: true });
  }
});
