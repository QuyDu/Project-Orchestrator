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

test("documentation consumes only a snapshot of the current source and leaves prior guides unchanged on drift", async (context) => {
  for (const mutation of ["changed-command", "deleted-source", "new-source"]) {
    await context.test(mutation, async () => {
      const project = await mkdtemp(path.join(os.tmpdir(), "pso-guide-freshness-"));
      try {
        await mkdir(path.join(project, "src"));
        await writeFile(path.join(project, "README.md"), "# Current Project\n\nSource freshness fixture.\n");
        await writeFile(path.join(project, "package.json"), JSON.stringify({ name: "current-project", scripts: { start: "node src/app.mjs" } }));
        await writeFile(path.join(project, "src", "app.mjs"), "export const ready = true;\n");
        assert.equal(run(project, understanding, "scan").status, 0);
        assert.equal(run(project, helper, "build").status, 0);
        const guide = await readFile(path.join(project, "docs", "PROJECT-GUIDE.md"));
        if (mutation === "changed-command") await writeFile(path.join(project, "package.json"), JSON.stringify({ name: "current-project", scripts: { start: "node src/new.mjs" } }));
        if (mutation === "deleted-source") await rm(path.join(project, "src", "app.mjs"));
        if (mutation === "new-source") await writeFile(path.join(project, "src", "new.mjs"), "export const newer = true;\n");
        assert.equal(run(project, understanding, "validate").status, 0, "Historical snapshot validity is separate from current-source freshness");
        for (const command of ["build", "validate"]) {
          const stale = run(project, helper, command);
          assert.equal(stale.status, 1, `${command} must reject ${mutation}`);
          assert.match(stale.stderr, /source.*stale|source.*changed/i);
        }
        assert.deepEqual(await readFile(path.join(project, "docs", "PROJECT-GUIDE.md")), guide);
        if (mutation === "deleted-source") await writeFile(path.join(project, "src", "replacement.mjs"), "export const replacement = true;\n");
        assert.equal(run(project, understanding, "scan").status, 0);
        assert.equal(run(project, helper, "build").status, 0);
        assert.equal(run(project, helper, "validate").status, 0);
      } finally {
        await rm(project, { recursive: true, force: true });
      }
    });
  }
});

test("documentation preserves planned and uncertain classifications rather than verifying them", async () => {
  const project = await mkdtemp(path.join(os.tmpdir(), "pso-guide-classification-"));
  try {
    await mkdir(path.join(project, "src"));
    await writeFile(path.join(project, "README.md"), "# Classified Project\n\nClassified project evidence.\n");
    await writeFile(path.join(project, "src", "app.mjs"), "export const ready = true;\n");
    assert.equal(run(project, understanding, "scan").status, 0);
    const file = path.join(project, "reports", "project-understanding.json");
    const snapshot = JSON.parse(await readFile(file, "utf8"));
    snapshot.features = ["verified", "planned", "inferred", "unknown"].map((status) => ({
      name: `feature-${status}`, description: `Capability marked ${status}.`, status, evidence: ["src/app.mjs"]
    }));
    await writeFile(file, JSON.stringify(snapshot));
    const built = run(project, helper, "build");
    assert.equal(built.status, 0, built.stderr);
    const report = JSON.parse(await readFile(path.join(project, "reports", "project-guide.json"), "utf8"));
    const classified = report.claims.filter((claim) => claim.statement.startsWith("Capability marked "));
    assert.deepEqual(classified.map((claim) => claim.status), ["verified", "planned", "unavailable", "unavailable"]);
    const guide = await readFile(path.join(project, "docs", "PROJECT-GUIDE.md"), "utf8");
    assert.match(guide, /feature-planned.*\[planned\]/);
    assert.match(guide, /feature-inferred.*\[inferred; unverified\]/);
    assert.match(guide, /feature-unknown.*\[unknown; unverified\]/);
    assert.equal(run(project, helper, "validate").status, 0);
    const reportFile = path.join(project, "reports", "project-guide.json");
    report.claims.find((claim) => claim.statement === "Capability marked planned.").status = "verified";
    await writeFile(reportFile, JSON.stringify(report));
    const promoted = run(project, helper, "validate");
    assert.equal(promoted.status, 1);
    assert.match(promoted.stderr, /classifications and evidence/);
  } finally {
    await rm(project, { recursive: true, force: true });
  }
});

test("documentation validates the digest of an understanding Markdown file truncated to empty", async () => {
  const project = await mkdtemp(path.join(os.tmpdir(), "pso-guide-empty-"));
  try {
    await mkdir(path.join(project, "src"));
    await writeFile(path.join(project, "README.md"), "# Nonempty Project\n\nCurrent source.\n");
    await writeFile(path.join(project, "src", "app.mjs"), "export const ready = true;\n");
    assert.equal(run(project, understanding, "scan").status, 0);
    assert.equal(run(project, helper, "build").status, 0);
    await writeFile(path.join(project, "reports", "project-understanding.md"), "");
    const result = run(project, helper, "validate");
    assert.equal(result.status, 1);
    assert.match(result.stderr, /Markdown content is stale/);
  } finally {
    await rm(project, { recursive: true, force: true });
  }
});

test("current-code guides stay valid across downstream attestation updates but not authored report changes", async () => {
  const project = await mkdtemp(path.join(os.tmpdir(), "pso-guide-attestation-"));
  try {
    await mkdir(path.join(project, "src"));
    await mkdir(path.join(project, "reports"));
    await writeFile(path.join(project, "README.md"), "# Stable Source\n\nA current-code fixture.\n");
    await writeFile(path.join(project, "src", "app.mjs"), "export const ready = true;\n");
    await writeFile(path.join(project, "reports", "authored-input.json"), '{"requirement":"original"}');
    for (const file of ["current-work-state.json", "audit-remediation-execution.json", "gitleaks-scan.json"]) {
      await writeFile(path.join(project, "reports", file), '{"state":"before"}');
    }
    assert.equal(run(project, understanding, "scan").status, 0);
    assert.equal(run(project, helper, "build").status, 0);
    for (const file of ["current-work-state.json", "audit-remediation-execution.json", "gitleaks-scan.json"]) {
      await writeFile(path.join(project, "reports", file), '{"state":"after"}');
    }
    const current = run(project, helper, "validate");
    assert.equal(current.status, 0, "Downstream attestations must not form a freshness cycle with their own guide/checkpoint inputs");
    await writeFile(path.join(project, "reports", "authored-input.json"), '{"requirement":"changed"}');
    assert.equal(run(project, helper, "validate").status, 1, "Other meaningful reports remain part of current-source evidence");
  } finally {
    await rm(project, { recursive: true, force: true });
  }
});