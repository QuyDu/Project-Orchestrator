import assert from "node:assert/strict";
import { existsSync } from "node:fs";
import { readFile } from "node:fs/promises";
import path from "node:path";
import { pathToFileURL } from "node:url";
import test from "node:test";

const root = path.resolve(import.meta.dirname, "..");
const liveChatRoot = path.join(root, "templates", "project", ".skills-orchestrator", "live-chat");

test("live chat skill contract and provider-neutral assets are shipped", async () => {
  const skillPath = path.join(root, ".github", "skills", "live-chat-interaction", "SKILL.md");
  assert.ok(existsSync(skillPath));
  const skill = await readFile(skillPath, "utf8");
  assert.match(skill, /^name: live-chat-interaction$/m);
  assert.match(skill, /transcript state session-only/i);
  assert.match(skill, /consequential/i);

  for (const asset of [
    "conversation-state.mjs",
    "grounding.mjs",
    "local-session.mjs",
    "server/provider-adapter.mjs",
    "browser-controller.mjs",
    "browser-panel.html",
    "browser.css"
  ]) {
    assert.ok(existsSync(path.join(liveChatRoot, asset)), `${asset} must be shipped`);
  }
});

test("conversation reducer covers automatic informational turns and confirmed actions", async () => {
  const module = await import(pathToFileURL(path.join(liveChatRoot, "conversation-state.mjs")));
  let state = module.createInitialState({ consent: true, endpointMs: 600 });
  assert.equal(state.status, "idle");
  state = module.reduceConversation(state, { type: "START_LISTENING" });
  state = module.reduceConversation(state, { type: "TRANSCRIPT_INTERIM", text: "What can you do?" });
  state = module.reduceConversation(state, { type: "TRANSCRIPT_FINAL", text: "What can you do?", intent: "informational" });
  state = module.reduceConversation(state, { type: "ENDPOINT_ACCEPTED" });
  assert.equal(state.status, "thinking");
  assert.equal(state.pendingSubmission.intent, "informational");
  assert.equal(state.pendingSubmission.submitCount, 1);

  state = module.reduceConversation(state, { type: "RESPONSE_COMPLETE" });
  assert.equal(state.status, "idle");
  state = module.reduceConversation(state, { type: "START_LISTENING" });
  state = module.reduceConversation(state, { type: "TRANSCRIPT_FINAL", text: "Delete the record", intent: "consequential" });
  state = module.reduceConversation(state, { type: "ENDPOINT_ACCEPTED" });
  assert.equal(state.status, "confirming");
  assert.equal(state.pendingSubmission.submitCount, 0);
  state = module.reduceConversation(state, { type: "CONFIRM_ACTION" });
  assert.equal(state.status, "thinking");
  assert.equal(state.pendingSubmission.submitCount, 1);
});

test("false endpoint correction and cancellation prevent late duplicate submission", async () => {
  const module = await import(pathToFileURL(path.join(liveChatRoot, "conversation-state.mjs")));
  let state = module.createInitialState({ consent: true });
  state = module.reduceConversation(state, { type: "START_LISTENING" });
  state = module.reduceConversation(state, { type: "TRANSCRIPT_FINAL", text: "Show the guide", intent: "informational" });
  state = module.reduceConversation(state, { type: "CORRECT_TRANSCRIPT", text: "Show the security guide" });
  assert.equal(state.status, "listening");
  state = module.reduceConversation(state, { type: "CANCEL" });
  assert.equal(state.status, "cancelled");
  state = module.reduceConversation(state, { type: "ENDPOINT_ACCEPTED" });
  assert.equal(state.pendingSubmission, null);
  state = module.reduceConversation(state, { type: "RESPONSE_COMPLETE" });
  assert.equal(state.status, "cancelled");
});

test("half-duplex speaking pauses capture and deterministic adapters resume after completion", async () => {
  const module = await import(pathToFileURL(path.join(liveChatRoot, "conversation-state.mjs")));
  const { createFakeAdapters } = await import(pathToFileURL(path.join(liveChatRoot, "local-session.mjs")));
  const adapters = createFakeAdapters();
  adapters.speech.start();
  assert.equal(adapters.speech.capture, true);
  let state = module.createInitialState({ consent: true });
  state = module.reduceConversation(state, { type: "START_LISTENING" });
  state = module.reduceConversation(state, { type: "TRANSCRIPT_FINAL", text: "Explain the guide", intent: "informational" });
  state = module.reduceConversation(state, { type: "ENDPOINT_ACCEPTED" });
  state = module.reduceConversation(state, { type: "RESPONSE_DELTA", text: "Here is the guide." });
  state = module.reduceConversation(state, { type: "SPEAKING_STARTED" });
  adapters.speech.stop();
  assert.equal(state.status, "speaking");
  assert.equal(state.capturePaused, true);
  assert.equal(adapters.speech.capture, false);
  adapters.clock.advance(250);
  adapters.response.finish();
  state = module.reduceConversation(state, { type: "SPEAKING_COMPLETE" });
  adapters.speech.start();
  assert.equal(state.status, "idle");
  assert.equal(state.capturePaused, false);
  assert.equal(adapters.clock.now(), 250);
  assert.equal(adapters.response.complete, true);
  assert.equal(adapters.speech.capture, true);
});
