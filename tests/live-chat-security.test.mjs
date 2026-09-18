import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import path from "node:path";
import { pathToFileURL } from "node:url";
import test from "node:test";

const liveChatRoot = path.resolve(import.meta.dirname, "..", "templates", "project", ".skills-orchestrator", "live-chat");

test("local session boundary is credential-free, session-only, and replay-resistant", async () => {
  const { createSessionBoundary } = await import(pathToFileURL(path.join(liveChatRoot, "local-session.mjs")));
  const session = createSessionBoundary({ sessionId: "session-a", maxEvents: 3, maxRetries: 2 });
  assert.equal(session.accept({ id: "1", type: "TRANSCRIPT_FINAL", text: "hello" }).ok, true);
  assert.equal(session.accept({ id: "1", type: "TRANSCRIPT_FINAL", text: "hello" }).reason, "duplicate");
  assert.equal(session.accept({ id: "2", type: "RESPONSE_DELTA", text: "x" }).ok, true);
  assert.equal(session.accept({ id: "3", type: "RESPONSE_DELTA", text: "y" }).ok, true);
  assert.equal(session.accept({ id: "4", type: "RESPONSE_DELTA", text: "z" }).reason, "rate-limited");
  assert.deepEqual(session.exportTranscript(), [{ id: "1", type: "TRANSCRIPT_FINAL", text: "hello" }]);
  assert.equal(session.accept({ id: "5", type: "TRANSCRIPT_FINAL", sessionId: "session-b", text: "leak" }).reason, "cross-session");
});

test("browser assets contain no credential surface and expose permission/cancellation fallbacks", async () => {
  const controller = await readFile(path.join(liveChatRoot, "browser-controller.mjs"), "utf8");
  const panel = await readFile(path.join(liveChatRoot, "browser-panel.html"), "utf8");
  assert.doesNotMatch(controller, /api[_-]?key|client[_-]?secret|password|token/i);
  assert.match(controller, /permission/i);
  assert.match(controller, /cancel/i);
  assert.match(panel, /text-fallback/i);
  assert.match(panel, /guided-fallback/i);
});

test("permission denial and transport bounds stay local and credential-free", async () => {
  const { createBrowserController } = await import(pathToFileURL(path.join(liveChatRoot, "browser-controller.mjs")));
  const { createTransportContract } = await import(pathToFileURL(path.join(liveChatRoot, "local-session.mjs")));
  const events = [];
  const controller = createBrowserController({
    dispatch: (event) => events.push(event),
    speech: { getUserMedia: async () => { throw new Error("permission denied"); } }
  });
  assert.deepEqual(await controller.requestPermission(), { status: "denied" });
  assert.deepEqual(events, [{ type: "DENY_CONSENT" }]);
  assert.deepEqual(createTransportContract(), { credentials: "server-only", replay: "session-and-sequence-bound", retryLimit: 2, rawAudio: "ephemeral" });
});
