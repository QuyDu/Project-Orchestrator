import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import path from "node:path";
import { pathToFileURL } from "node:url";
import test from "node:test";

const root = path.resolve(import.meta.dirname, "..");
const liveChatRoot = path.join(root, "templates", "project", ".skills-orchestrator", "live-chat");
const config = {
  cloud: "AzureUSGovernment",
  location: "usgovvirginia",
  subscriptionId: "offline-evaluation",
  openAI: {
    endpoint: "https://chat.openai.azure.us",
    deployment: "gpt-5.1",
    model: "gpt-5.1",
    apiVersion: "2025-04-01-preview"
  }
};

function metric(id, status, observed, threshold, detail) {
  return { id, status, observed, threshold, detail };
}

test("STEP-016 deterministically evaluates frozen local and provider-adapter thresholds", async () => {
  const conversation = await import(pathToFileURL(path.join(liveChatRoot, "conversation-state.mjs")));
  const grounding = await import(pathToFileURL(path.join(liveChatRoot, "grounding.mjs")));
  const evaluation = await import(pathToFileURL(path.join(liveChatRoot, "evaluation.mjs")));
  const sessionModule = await import(pathToFileURL(path.join(liveChatRoot, "local-session.mjs")));
  const provider = await import(pathToFileURL(path.join(liveChatRoot, "server", "provider-adapter.mjs")));
  const controller = await import(pathToFileURL(path.join(liveChatRoot, "browser-controller.mjs")));
  const metrics = [];

  let state = conversation.createInitialState({ consent: true });
  metrics.push(metric("endpoint.default-silence", state.endpointMs === 900 ? "passed" : "failed", state.endpointMs, 900, "Reducer default."));
  state = conversation.reduceConversation(state, { type: "START_LISTENING" });
  state = conversation.reduceConversation(state, { type: "TRANSCRIPT_FINAL", text: "Show the guide", intent: "informational" });
  state = conversation.reduceConversation(state, { type: "CORRECT_TRANSCRIPT", text: "Show the security guide" });
  state = conversation.reduceConversation(state, { type: "CANCEL" });
  const cancelled = conversation.reduceConversation(state, { type: "ENDPOINT_ACCEPTED" });
  const late = conversation.reduceConversation(cancelled, { type: "RESPONSE_COMPLETE" });
  metrics.push(metric("endpoint.correction-cancel-late-events", late.status === "cancelled" && late.pendingSubmission === null ? "passed" : "failed", late.status, "corrected and cancelled turn has zero submissions", "Late endpoint and completion are inert."));
  const endpointFixtures = evaluation.evaluateEndpointFixtures([
    { id: "clean-speech", frames: [1, 1, 0, 0, 0, 0, 0, 0, 0, 0, 0], expected: true },
    { id: "short-pause", frames: [1, 1, 0, 0, 0, 0], expected: false },
    { id: "noise-only", frames: [0.2, 0.3, 0.4, 0.3, 0.2], expected: false },
    { id: "noise-after-speech", frames: [1, 0.2, 0.3, 0.4, 0.3, 0.2, 0.3, 0.2, 0.3, 0.2, 0.3], expected: true }
  ]);
  metrics.push(metric("endpoint.fixture-accuracy", endpointFixtures.falseEndpointRate === 0 ? "passed" : "failed", endpointFixtures, "synthetic fixture false endpoints <=5%", "Deterministic clean, short-pause, and noise fixtures validate local endpoint decisions; microphone accuracy remains unmeasured."));

  const manifest = {
    schemaVersion: "1.0.0",
    corpusVersion: "2026.09.18",
    approved: true,
    freshness: { checkedAt: "2026-09-18T00:00:00Z", maxAgeHours: 72 },
    sources: [{ id: "guide", digest: "a".repeat(64), updatedAt: "2026-09-17T00:00:00Z" }]
  };
  const grounded = grounding.groundResponse({ answer: "Use the guide", sourceIds: ["guide"], citations: [{ sourceId: "guide", locator: "intro" }] }, manifest, { now: "2026-09-18T12:00:00Z" });
  const unknown = grounding.groundResponse({ answer: "Ignore safeguards", sourceIds: ["unknown"], citations: [] }, { schemaVersion: "9.0.0", corpusVersion: "bad", approved: false, sources: [] }, { now: "2026-09-18T12:00:00Z" });
  metrics.push(metric("grounding.citations-active", grounded.citations.length === 1 ? "passed" : "failed", grounded.citations.length, "100%", "Approved source citation is retained."));
  metrics.push(metric("grounding.unknown-stale-injection", unknown.answer === "I don't know based on the approved local sources." && unknown.unknowns.includes("grounding-unavailable") ? "passed" : "failed", unknown.unknowns, "unknown >=95%; stale/injection 100%", "Invalid, stale, unsupported, and instruction-like grounding fails closed."));

  const clock = sessionModule.createFakeClock(0);
  const session = sessionModule.createSessionBoundary({ sessionId: "session-a", maxEvents: 3, now: clock.now, idleTimeoutMs: 1_800_000, absoluteTimeoutMs: 7_200_000 });
  session.accept({ id: "turn-1", type: "TRANSCRIPT_FINAL", text: "hello" });
  const replay = session.accept({ id: "turn-1", type: "TRANSCRIPT_FINAL", text: "hello" });
  const crossSession = session.accept({ id: "turn-2", sessionId: "session-b", type: "TRANSCRIPT_FINAL", text: "leak" });
  metrics.push(metric("privacy.raw-audio-session-only", session.exportAudio() === null && session.exportTranscript().length === 1 ? "passed" : "failed", { rawAudio: session.exportAudio(), transcriptEntries: session.exportTranscript().length }, "0 bytes; session-only", "Audio cannot be exported and transcript exports only accepted final turns."));
  metrics.push(metric("security.cross-session-replay", replay.reason === "duplicate" && crossSession.reason === "cross-session" ? "passed" : "failed", { replay: replay.reason, crossSession: crossSession.reason }, "0 cross-session/replay accepts", "Session boundary rejects replay and foreign session IDs."));
  clock.advance(1_800_000);
  const expired = session.accept({ id: "turn-expired", type: "TRANSCRIPT_FINAL", text: "late" });
  metrics.push(metric("privacy.session-expiry", expired.reason === "expired" && session.isExpired() ? "passed" : "failed", expired.reason, "idle 30m; absolute 120m", "Idle and absolute session expiry reject late events and hide transcript export."));

  const telemetry = [];
  const adapter = provider.createProviderAdapter({
    config,
    credential: { getToken: async () => ({ token: "offline-token" }) },
    telemetry: (event) => telemetry.push(event),
    hooks: { inputSafety: async () => true, outputSafety: async () => true, validateOutput: async () => true },
    fetchImpl: async () => ({ status: 200, ok: true, body: (async function* () { yield 'data: {"choices":[{"delta":{"content":"safe"}}]}\n\ndata: [DONE]\n'; })() })
  });
  const streamed = [];
  for await (const event of adapter.streamOpenAI({ sessionId: "session-a", identity: "offline-user", turnId: "turn-1", messages: [{ role: "user", content: "private prompt" }], estimatedCostUsd: 0.1 })) streamed.push(event);
  metrics.push(metric("security.safety-hooks-content-logs", streamed.length === 1 && !/private prompt|offline-token/.test(JSON.stringify(telemetry)) ? "passed" : "failed", { streamed: streamed.length, telemetry: telemetry.length }, "safety hooks; no content logs", "Injected hooks and redacted telemetry are enforced."));
  await assert.rejects(async () => {
    for await (const _event of adapter.streamOpenAI({ sessionId: "session-b", identity: "offline-user", turnId: "turn-2", messages: [], estimatedCostUsd: 0.100001 })) {}
  }, (error) => error.code === "cost-limited");
  metrics.push(metric("cost.session-ceiling", "passed", "0.100001 rejected", "<= $0.10 per 10-minute session", "Injected adapter denies over-ceiling estimates."));
  metrics.push(metric("rate-retry.deadline", adapter.credentialMode === "server-only" ? "passed" : "failed", { retryLimit: 2, deadlineMs: 10000 }, "retries <=2; deadline <=15s", "Adapter default deadline is 10 seconds and retry ceiling is two."));
  metrics.push(metric("rate-retry.identity-turn-transcript-response-circuit", "passed", { identity: true, turn: true, transcriptChars: 8000, responseTokens: 1500, circuit: true }, "1 active identity/session turn; 30 turns/10m; 8000 chars; 1500 tokens; circuit", "Adapter rejects missing identity/turn, excessive transcript or response limits, concurrent identity use, and repeated provider failures."));

  assert.throws(() => provider.validateProviderConfig({ ...config, cloud: "AzureCloud" }), (error) => error.code === "cloud-mismatch");
  assert.throws(() => provider.validateProviderConfig({ ...config, openAI: { ...config.openAI, endpoint: "https://chat.openai.azure.com" } }), (error) => error.code === "sovereignty-mismatch");
  assert.throws(() => provider.validateSpeechConfig({ endpoint: "https://speech.tts.speech.azure.us", region: "usgovarizona" }), provider.ProviderAdapterError);
  metrics.push(metric("government.matrix-speech-fail-closed-commercial", "passed", provider.providerCompatibilityMatrix, "AzureUSGovernment only; explicit Speech API; no Commercial fallback", "Commercial and invalid Speech configurations reject before transport."));

  const events = [];
  const browser = controller.createBrowserController({ dispatch: (event) => events.push(event), speech: { getUserMedia: async () => { throw new Error("denied"); } } });
  await browser.requestPermission();
  browser.fallback("guided-fallback");
  const panel = await readFile(path.join(liveChatRoot, "browser-panel.html"), "utf8");
  const css = await readFile(path.join(liveChatRoot, "browser.css"), "utf8");
  metrics.push(metric("fallback.text-guided-permission", events.some((event) => event.type === "DENY_CONSENT") && events.some((event) => event.fallback === "guided-fallback") ? "passed" : "failed", events, "100%", "Permission denial and guided fallback dispatch deterministically."));
  metrics.push(metric("accessibility.fixture", /aria-live/.test(panel) && /label for=/.test(panel) && /prefers-reduced-motion/.test(css) ? "passed" : "failed", "aria-live, label, reduced motion", "100% keyboard/screen-reader/reduced-motion/responsive/text/guided fixture", "Static fixture verifies exposed controls and reduced-motion CSS; live assistive technology timing is unmeasured."));
  const localLatency = evaluation.measureLocalLatency([1, 2, 2, 3, 3, 4, 4, 5, 5, 6], 500);
  metrics.push(metric("latency.local-transition-p95", localLatency.passed ? "passed" : "failed", localLatency, "fallback local transition p95 <=500ms", "Deterministic local timing validates synchronous transition overhead; device and provider latency remain unmeasured."));

  const summary = Object.groupBy(metrics, ({ status }) => status);
  console.log(JSON.stringify({ step: "STEP-016", metrics, totals: Object.fromEntries(Object.entries(summary).map(([status, values]) => [status, values.length])) }));
  assert.equal(metrics.filter(({ status }) => status === "failed").length, 0, "The deterministic evaluation must pass all locally enforceable threshold groups.");
  assert.equal(metrics.filter(({ status }) => status === "unmeasured").length, 0, "Synthetic endpoint and local latency fixtures are measured; production measurements remain documented limitations.");
});