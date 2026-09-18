import assert from "node:assert/strict";
import { mkdtemp, mkdir, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { spawnSync } from "node:child_process";
import test from "node:test";

const root = path.resolve(import.meta.dirname, "..");
const runtime = path.join(root, "pso.mjs");

function run(project) {
  return spawnSync(process.execPath, [runtime, "doctor", "--project", project], { cwd: root, encoding: "utf8" });
}

test("compatibility doctor classifies portable fallbacks and host-specific customization surfaces", async () => {
  const project = await mkdtemp(path.join(os.tmpdir(), "pso-doctor-"));
  try {
    const sparse = run(project);
    assert.equal(sparse.status, 0, sparse.stderr);
    const sparseResult = JSON.parse(sparse.stdout);
    assert.equal(sparseResult.command, "doctor");
    assert.equal(sparseResult.totals.missing, 6);

    await mkdir(path.join(project, ".github", "instructions"), { recursive: true });
    await mkdir(path.join(project, ".github", "prompts"), { recursive: true });
    await mkdir(path.join(project, ".github", "skills", "sample"), { recursive: true });
    await mkdir(path.join(project, ".github", "agents"), { recursive: true });
    await mkdir(path.join(project, ".vscode"), { recursive: true });
    await writeFile(path.join(project, "AGENTS.md"), "# Project Instructions\n");
    await writeFile(path.join(project, ".github", "copilot-instructions.md"), "# Copilot Instructions\n");
    await writeFile(path.join(project, ".github", "instructions", "node.instructions.md"), "# Node\n");
    await writeFile(path.join(project, ".github", "prompts", "start.prompt.md"), "# Start\n");
    await writeFile(path.join(project, ".github", "skills", "sample", "SKILL.md"), "# Sample\n");
    await writeFile(path.join(project, ".github", "agents", "sample.agent.md"), "# Sample\n");
    await writeFile(path.join(project, ".vscode", "mcp.json"), "{\"servers\":{}}\n");
    const configured = run(project);
    assert.equal(configured.status, 0, configured.stderr);
    const result = JSON.parse(configured.stdout);
    assert.equal(result.totals.ready, 6);
    assert.equal(result.findings.find(({ id }) => id === "prompt-files").portability, "host-specific");
    assert.equal(result.findings.find(({ id }) => id === "agent-instructions").portability, "portable-fallback");
  } finally {
    await rm(project, { recursive: true, force: true });
  }
});