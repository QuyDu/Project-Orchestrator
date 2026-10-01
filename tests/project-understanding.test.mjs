import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { existsSync } from "node:fs";
import { mkdir, mkdtemp, readFile, readdir, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { spawnSync } from "node:child_process";
import test from "node:test";
import { pathToFileURL } from "node:url";

const root = path.resolve(import.meta.dirname, "..");
const helper = path.join(root, ".github", "skills", "project-understanding", "scripts", "project-understanding.mjs");

function run(project, command) {
  return spawnSync(process.execPath, [helper, command, "--root", project], { cwd: root, encoding: "utf8" });
}

function sha256(value) {
  return createHash("sha256").update(value).digest("hex");
}

async function seedProject(project) {
  await mkdir(path.join(project, "src"), { recursive: true });
  await mkdir(path.join(project, "tests"), { recursive: true });
  await mkdir(path.join(project, "schemas"), { recursive: true });
  await mkdir(path.join(project, ".github", "skills", "fixture-skill"), { recursive: true });
  await mkdir(path.join(project, ".github", "prompts"), { recursive: true });
  await mkdir(path.join(project, ".github", "agents"), { recursive: true });
  await writeFile(path.join(project, "README.md"), "# Understanding Fixture\n\nA fixture project that validates complete evidence-grounded repository understanding.\n", "utf8");
  await writeFile(path.join(project, "package.json"), JSON.stringify({ name: "understanding-fixture", scripts: { start: "node src/app.mjs", check: "node --test" } }), "utf8");
  await writeFile(path.join(project, "src", "app.mjs"), "export const ready = true;\n", "utf8");
  await writeFile(path.join(project, "tests", "app.test.mjs"), "export const tested = true;\n", "utf8");
  await writeFile(path.join(project, "schemas", "fixture.schema.json"), "{\"type\":\"object\"}\n", "utf8");
  await writeFile(path.join(project, ".github", "skills", "fixture-skill", "SKILL.md"), "---\nname: fixture-skill\ndescription: Exercise fixture behavior.\nlifecycle: draft\nconfidence: low\n---\n", "utf8");
  await writeFile(path.join(project, ".github", "prompts", "fixture.prompt.md"), "---\nname: fixture\ndescription: Run the fixture.\n---\n", "utf8");
  await writeFile(path.join(project, ".github", "agents", "fixture.agent.md"), "---\nname: fixture-agent\ndescription: Review the fixture.\n---\n", "utf8");
  await writeFile(path.join(project, ".env"), "SECRET_VALUE=must-not-appear\n", "utf8");
  await writeFile(path.join(project, "credentials.json"), "{\"password\":\"must-not-appear\"}\n", "utf8");
}

test("project-understanding performs a complete atomic rebuild with safe inventories", async () => {
  const project = await mkdtemp(path.join(os.tmpdir(), "pso-understanding-"));
  try {
    await seedProject(project);
    const first = run(project, "scan");
    assert.equal(first.status, 0, `${first.stdout}\n${first.stderr}`);
    const jsonFile = path.join(project, "reports", "project-understanding.json");
    const markdownFile = path.join(project, "reports", "project-understanding.md");
    assert.ok(existsSync(jsonFile));
    assert.ok(existsSync(markdownFile));
    const report = JSON.parse(await readFile(jsonFile, "utf8"));
    const markdown = await readFile(markdownFile, "utf8");
    assert.equal(report.status, "complete");
    assert.equal(report.scan.mode, "full-rebuild");
    assert.equal(report.scan.files.length, report.scan.fileCount);
    assert.ok(report.scan.files.some((item) => item.path === "src/app.mjs"));
    assert.ok(!report.scan.files.some((item) => item.path === ".env" || item.path === "credentials.json"));
    assert.ok(!report.scan.files.some((item) => item.path === "docs/PROJECT-GUIDE.md" || item.path === "reports/project-guide.json"));
    assert.ok(report.customizations.skills.some((item) => item.name === "fixture-skill" && item.invocation === "/fixture-skill"));
    assert.ok(report.customizations.prompts.some((item) => item.name === "fixture" && item.invocation === "/fixture"));
    assert.ok(report.customizations.agents.some((item) => item.name === "fixture-agent"));
    assert.ok(report.customizations.schemas.some((item) => item.name === "fixture.schema.json"));
    assert.equal(report.markdownSha256, sha256(markdown));
    assert.doesNotMatch(`${JSON.stringify(report)}${markdown}`, /must-not-appear/);

    const priorDigest = report.scan.repositoryDigestSha256;
    await writeFile(markdownFile, "stale content\n", "utf8");
    await writeFile(path.join(project, "src", "app.mjs"), "export const ready = true;\nexport const version = 2;\n", "utf8");
    const second = run(project, "scan");
    assert.equal(second.status, 0, `${second.stdout}\n${second.stderr}`);
    const rebuilt = JSON.parse(await readFile(jsonFile, "utf8"));
    const rebuiltMarkdown = await readFile(markdownFile, "utf8");
    assert.notEqual(rebuilt.scan.repositoryDigestSha256, priorDigest);
    assert.doesNotMatch(rebuiltMarkdown, /stale content/);
    assert.equal(rebuilt.markdownSha256, sha256(rebuiltMarkdown));

    const valid = run(project, "validate");
    assert.equal(valid.status, 0, `${valid.stdout}\n${valid.stderr}`);
  } finally {
    await rm(project, { recursive: true, force: true });
  }
});

test("project-understanding schema is strict and versioned", async () => {
  const schema = JSON.parse(await readFile(path.join(root, "schemas", "project-understanding.schema.json"), "utf8"));
  assert.equal(schema.$schema, "https://json-schema.org/draft/2020-12/schema");
  assert.equal(schema.additionalProperties, false);
  assert.equal(schema.properties.schemaVersion.const, "1.0.0");
  assert.equal(schema.properties.scan.additionalProperties, false);
  assert.equal(schema.properties.customizations.additionalProperties, false);
  assert.ok(schema.properties.customizations.required.includes("schemas"));
  assert.equal(schema.$defs.item.additionalProperties, false);
  assert.deepEqual(schema.$defs.item.properties.status.enum, ["verified", "inferred", "planned", "unknown"]);
});

test("understanding publication preserves originals and recovery backups across failures", async (context) => {
  for (const fault of ["publication", "restore-json", "cleanup"]) {
    await context.test(fault, async () => {
      const project = await mkdtemp(path.join(os.tmpdir(), "pso-understanding-fault-"));
      try {
        await seedProject(project);
        assert.equal(run(project, "scan").status, 0);
        const reports = path.join(project, "reports");
        const jsonFile = path.join(reports, "project-understanding.json");
        const markdownFile = path.join(reports, "project-understanding.md");
        const previousJson = await readFile(jsonFile);
        const previousMarkdown = await readFile(markdownFile);
        await writeFile(path.join(project, "src", "app.mjs"), "export const changed = true;\n");
        const privateDirectory = path.join(project, ".skills-orchestrator");
        await mkdir(privateDirectory);
        const preload = path.join(privateDirectory, "fault.mjs");
        await writeFile(preload, `
import fs from "node:fs/promises";
import { syncBuiltinESMExports } from "node:module";
const rename = fs.rename;
const rm = fs.rm;
const mode = ${JSON.stringify(fault)};
fs.rename = async (from, to) => {
  if (mode !== "cleanup" && String(from).endsWith(".partial") && String(to).endsWith("project-understanding.md")) {
    throw Object.assign(new Error("injected publication failure"), { code: "EIO" });
  }
  if (mode === "restore-json" && String(from).endsWith(".backup") && String(to).endsWith("project-understanding.json")) {
    throw Object.assign(new Error("injected restore failure"), { code: "EACCES" });
  }
  return rename(from, to);
};
fs.rm = async (file, options) => {
  if (mode === "cleanup" && /project-understanding\\.md\\.[^.]+\\.backup$/.test(String(file))) {
    throw Object.assign(new Error("injected cleanup failure"), { code: "EBUSY" });
  }
  return rm(file, options);
};
syncBuiltinESMExports();
`);
        const failed = spawnSync(process.execPath, ["--import", pathToFileURL(preload).href, helper, "scan", "--root", project], { cwd: root, encoding: "utf8", timeout: 30000 });
        assert.equal(failed.status, 1, failed.stderr);
        if (fault === "publication") {
          assert.deepEqual(await readFile(jsonFile), previousJson);
          assert.deepEqual(await readFile(markdownFile), previousMarkdown);
          assert.equal((await readdir(reports)).some((file) => /\.(?:partial|backup)$/.test(file)), false);
        } else if (fault === "restore-json") {
          const backup = (await readdir(reports)).find((file) => /^project-understanding\.json\..+\.backup$/.test(file));
          assert.ok(backup, "The unrestored original JSON must remain recoverable");
          assert.deepEqual(await readFile(path.join(reports, backup)), previousJson);
          assert.deepEqual(await readFile(markdownFile), previousMarkdown, "Independent Markdown restoration must still run");
          assert.match(failed.stderr, /recovery required/i);
        } else {
          const current = JSON.parse(await readFile(jsonFile, "utf8"));
          assert.equal(current.markdownSha256, sha256(await readFile(markdownFile)));
          assert.notDeepEqual(await readFile(jsonFile), previousJson);
          assert.match(failed.stderr, /committed.*cleanup/i);
          const backup = (await readdir(reports)).find((file) => /^project-understanding\.md\..+\.backup$/.test(file));
          assert.ok(backup);
          assert.deepEqual(await readFile(path.join(reports, backup)), previousMarkdown);
        }
      } finally {
        await rm(project, { recursive: true, force: true });
      }
    });
  }
});

test("flat repository scans accept exactly the file ceiling and reject the next insertion", async () => {
  const project = await mkdtemp(path.join(os.tmpdir(), "pso-understanding-limit-"));
  try {
    await writeFile(path.join(project, "README.md"), "# Limit Fixture\n\nFile-count boundary.\n");
    const state = path.join(project, ".skills-orchestrator");
    await mkdir(state);
    const preload = path.join(state, "large-directory.mjs");
    await writeFile(preload, `
import fs from "node:fs/promises";
import path from "node:path";
import { syncBuiltinESMExports } from "node:module";
const readdir = fs.readdir, lstat = fs.lstat, readFile = fs.readFile, stat = fs.stat;
const root = path.resolve(process.env.PSO_LIMIT_ROOT);
const count = Number(process.env.PSO_LIMIT_COUNT);
const fake = (file) => path.dirname(String(file)) === root && /^file-\\d+\\.mjs$/.test(path.basename(String(file)));
fs.readdir = async (directory, options) => path.resolve(directory) === root
  ? ["README.md", ...Array.from({ length: count - 1 }, (_, i) => "file-" + i + ".mjs")].map(name => ({ name, isSymbolicLink: () => false, isDirectory: () => false, isFile: () => true }))
  : readdir(directory, options);
const details = { size: 2, isFile: () => true, isDirectory: () => false, isSymbolicLink: () => false };
fs.lstat = async (file, ...rest) => fake(file) ? details : lstat(file, ...rest);
fs.stat = async (file, ...rest) => fake(file) ? details : stat(file, ...rest);
fs.readFile = async (file, encoding) => fake(file) ? (encoding ? "x\\n" : Buffer.from("x\\n")) : readFile(file, encoding);
syncBuiltinESMExports();
`);
    for (const count of [30000, 30001]) {
      const result = spawnSync(process.execPath, ["--import", pathToFileURL(preload).href, helper, "scan", "--root", project], {
        cwd: root, encoding: "utf8", timeout: 60000, env: { ...process.env, PSO_LIMIT_ROOT: project, PSO_LIMIT_COUNT: String(count) }
      });
      assert.equal(result.status, count === 30000 ? 0 : 1, result.stderr);
      if (count === 30000) {
        const report = JSON.parse(await readFile(path.join(project, "reports", "project-understanding.json"), "utf8"));
        assert.equal(report.scan.fileCount, count);
      } else assert.match(result.stderr, /exceeded 30000 files/);
    }
  } finally {
    await rm(project, { recursive: true, force: true });
  }
});
