import assert from "node:assert/strict";
import { mkdtemp, readFile, rm } from "node:fs/promises";
import { spawnSync } from "node:child_process";
import os from "node:os";
import path from "node:path";
import test from "node:test";

const root = path.resolve(import.meta.dirname, "..");

test("generated project receives disposable live-chat template assets", async () => {
  const fixtureRoot = await mkdtemp(path.join(os.tmpdir(), "pso-live-chat-"));
  try {
    const result = spawnSync(process.execPath, [path.join(root, "pso.mjs"), "create-project", "--destination", fixtureRoot, "--name", "live-chat-fixture", "--profile", "core", "--accept-risk"], {
      cwd: root,
      encoding: "utf8"
    });
    assert.equal(result.status, 0, result.stderr || result.stdout);
    const liveChatRoot = path.join(fixtureRoot, "live-chat-fixture", ".skills-orchestrator", "live-chat");
    const assets = ["conversation-state.mjs", "grounding.mjs", "local-session.mjs", "browser-controller.mjs", "browser-panel.html", "browser.css"];
    for (const assetName of assets) assert.ok((await readFile(path.join(liveChatRoot, assetName), "utf8")).length > 0, `${assetName} must be generated`);
    assert.match(await readFile(path.join(liveChatRoot, "browser-panel.html"), "utf8"), /aria-live|label=/);
    assert.match(await readFile(path.join(liveChatRoot, "browser.css"), "utf8"), /prefers-reduced-motion|@media/);
  } finally {
    await rm(fixtureRoot, { recursive: true, force: true });
  }
});
