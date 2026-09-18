import assert from "node:assert/strict";
import { existsSync } from "node:fs";
import { mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { spawnSync } from "node:child_process";
import { createHash } from "node:crypto";
import test from "node:test";

const root = path.resolve(import.meta.dirname, "..");
const understanding = path.join(root, ".github", "skills", "project-understanding", "scripts", "project-understanding.mjs");
const helper = path.join(root, ".github", "skills", "documentation-builder", "scripts", "documentation-builder.mjs");

function run(project, script, command) {
  return spawnSync(process.execPath, [script, command, "--root", project], { cwd: root, encoding: "utf8" });
}

function sha256(value) {
  return createHash("sha256").update(value).digest("hex");
}

test("repository project guide binding matches current guide and understanding evidence", async () => {
  const report = JSON.parse(await readFile(path.join(root, "reports", "project-guide.json"), "utf8"));
  const guideSource = await readFile(path.join(root, report.guide), "utf8");
  const understandingSource = await readFile(path.join(root, report.projectUnderstanding.json), "utf8");
  const understanding = JSON.parse(understandingSource);
  const understandingMarkdown = await readFile(path.join(root, report.projectUnderstanding.markdown), "utf8");
  assert.equal(report.guideSha256, sha256(guideSource));
  assert.equal(report.projectUnderstanding.jsonSha256, sha256(JSON.stringify(understanding)));
  assert.equal(report.projectUnderstanding.markdownSha256, understanding.markdownSha256);
  assert.equal(understanding.markdownSha256, sha256(understandingMarkdown));
});

test("documentation-builder creates and validates a guide for its target project", async () => {
  const project = await mkdtemp(path.join(os.tmpdir(), "pso-guide-"));
  try {
    await mkdir(path.join(project, "src"), { recursive: true });
    await writeFile(path.join(project, "README.md"), "# Target Project\n\nA project-specific guide fixture.\n", "utf8");
    await writeFile(path.join(project, "package.json"), JSON.stringify({ name: "target-project", scripts: { test: "node --test" } }), "utf8");
    await writeFile(path.join(project, "src", "app.mjs"), "export const ready = true;\n", "utf8");
    const scan = run(project, understanding, "scan");
    assert.equal(scan.status, 0, `${scan.stdout}\n${scan.stderr}`);
    const build = run(project, helper, "build");
    assert.equal(build.status, 0, `${build.stdout}\n${build.stderr}`);
    assert.ok(existsSync(path.join(project, "docs", "PROJECT-GUIDE.md")));
    const report = JSON.parse(await readFile(path.join(project, "reports", "project-guide.json"), "utf8"));
    assert.equal(report.guide, "docs/PROJECT-GUIDE.md");
    assert.ok(report.claims.length > 0);
    assert.match(await readFile(path.join(project, "docs", "PROJECT-GUIDE.md"), "utf8"), /Target Project Project Guide/);
    const validation = run(project, helper, "validate");
    assert.equal(validation.status, 0, `${validation.stdout}\n${validation.stderr}`);

    const guideFile = path.join(project, "docs", "PROJECT-GUIDE.md");
    await writeFile(guideFile, `${await readFile(guideFile, "utf8")}\nTampered guide body.\n`, "utf8");
    const tamperedGuide = run(project, helper, "validate");
    assert.notEqual(tamperedGuide.status, 0);
    assert.match(`${tamperedGuide.stdout}\n${tamperedGuide.stderr}`, /Project guide content is stale/);

    const rebuilt = run(project, helper, "build");
    assert.equal(rebuilt.status, 0, `${rebuilt.stdout}\n${rebuilt.stderr}`);
    const understandingMarkdown = path.join(project, "reports", "project-understanding.md");
    await writeFile(understandingMarkdown, `${await readFile(understandingMarkdown, "utf8")}\nTampered understanding body.\n`, "utf8");
    const tamperedUnderstanding = run(project, helper, "validate");
    assert.notEqual(tamperedUnderstanding.status, 0);
    assert.match(`${tamperedUnderstanding.stdout}\n${tamperedUnderstanding.stderr}`, /Project Understanding Markdown content is stale/);
  } finally {
    await rm(project, { recursive: true, force: true });
  }
});