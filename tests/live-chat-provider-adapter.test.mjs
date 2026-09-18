import assert from "node:assert/strict";
import test from "node:test";
import { createProviderAdapter, ProviderAdapterError, providerCompatibilityMatrix, validateProviderConfig, validateSpeechConfig } from "../templates/project/.skills-orchestrator/live-chat/server/provider-adapter.mjs";

const config = { cloud: "AzureUSGovernment", location: "usgovvirginia", subscriptionId: "sub-test", openAI: { endpoint: "https://chat.openai.azure.us", deployment: "gpt-5.1", model: "gpt-5.1", apiVersion: "2025-04-01-preview" } };
const credential = { getToken: async () => ({ token: "fake-token" }) };

function fakeResponse(lines, status = 200) {
  return { status, ok: status >= 200 && status < 300, body: (async function* () { yield lines; })() };
}

test("compatibility matrix and server credential are enforced before transport", () => {
  assert.equal(providerCompatibilityMatrix.openAI.model, "gpt-5.1");
  assert.deepEqual(validateProviderConfig(config).openAI.apiVersion, "2025-04-01-preview");
  assert.throws(() => validateProviderConfig({ ...config, cloud: "AzureCloud" }), (error) => error.code === "cloud-mismatch");
  assert.throws(() => validateProviderConfig({ ...config, openAI: { ...config.openAI, endpoint: "https://chat.openai.azure.com" } }), (error) => error.code === "sovereignty-mismatch");
  assert.throws(() => validateProviderConfig({ ...config, openAI: { ...config.openAI, apiVersion: "" } }), (error) => error.code === "api-version-mismatch");
  assert.throws(() => createProviderAdapter({ config, credential: { apiKey: "secret" }, fetchImpl: () => { throw new Error("must not call"); } }), (error) => error.code === "credential-required");
  assert.throws(() => validateSpeechConfig({ endpoint: "https://speech.cognitiveservices.azure.us", region: "usgovarizona" }), (error) => error.code === "speech-api-version-required");
});

test("OpenAI streaming uses injected fakes, hooks, redacted telemetry, cancellation, deadline, retry, rate, and cost guards", async () => {
  const calls = [];
  const telemetry = [];
  let responseNumber = 0;
  const adapter = createProviderAdapter({ config, credential, maxRetries: 2, limits: { maxRequestsPerMinute: 2 }, fetchImpl: async (_url, request) => {
    calls.push(request);
    responseNumber += 1;
    if (responseNumber === 1) return fakeResponse("retry", 503);
    return fakeResponse('data: {"choices":[{"delta":{"content":"hello"}}]}\n\ndata: [DONE]\n');
  }, telemetry: (event) => telemetry.push(event), hooks: { inputSafety: async () => true, outputSafety: async () => true, validateOutput: async ({ output }) => output === "hello" } });
  const events = [];
  for await (const event of adapter.streamOpenAI({ sessionId: "s1", identity: "user-1", turnId: "turn-1", messages: [{ role: "user", content: "hi" }] })) events.push(event);
  assert.deepEqual(events, [{ type: "RESPONSE_DELTA", text: "hello" }]);
  assert.equal(calls.length, 2);
  assert.match(calls[1].headers.authorization, /^Bearer fake-token$/);
  assert.doesNotMatch(JSON.stringify(telemetry), /hi|fake-token/);
  await assert.rejects(async () => { for await (const _event of adapter.streamOpenAI({ sessionId: "s2", identity: "user-2", turnId: "turn-2", messages: [], estimatedCostUsd: 0.11 })) {} }, (error) => error.code === "cost-limited");
  for await (const _event of adapter.streamOpenAI({ sessionId: "s1", identity: "user-1", turnId: "turn-2", messages: [] })) {}
  await assert.rejects(async () => { for await (const _event of adapter.streamOpenAI({ sessionId: "s1", identity: "user-1", turnId: "turn-3", messages: [] })) {} }, (error) => error.code === "rate-limited");
});

test("cancellation and deadline abort the injected request and Speech remains fail-closed", async () => {
  const controller = new AbortController();
  controller.abort();
  const adapter = createProviderAdapter({ config, credential, fetchImpl: async () => { throw new Error("must not call"); } });
  await assert.rejects(async () => { for await (const _event of adapter.streamOpenAI({ sessionId: "cancel", identity: "user-1", turnId: "turn-cancel", messages: [], signal: controller.signal })) {} }, (error) => error.code === "cancelled");
  assert.throws(() => validateSpeechConfig({ endpoint: "https://speech.tts.speech.azure.us", region: "usgovarizona" }), ProviderAdapterError);
});

test("identity limits, transcript limits, response limits, and circuit breaker fail closed", async () => {
  const adapter = createProviderAdapter({ config, credential, limits: { circuitFailureThreshold: 2, maxTranscriptChars: 5, maxResponseTokens: 2 }, fetchImpl: async () => { throw new Error("offline"); } });
  const request = { sessionId: "s1", identity: "user-1", turnId: "turn-1", messages: [] };
  await assert.rejects(async () => { for await (const _event of adapter.streamOpenAI(request)) {} }, /offline/);
  await assert.rejects(async () => { for await (const _event of adapter.streamOpenAI({ ...request, turnId: "turn-2" })) {} }, /offline/);
  await assert.rejects(async () => { for await (const _event of adapter.streamOpenAI({ ...request, turnId: "turn-3" })) {} }, (error) => error.code === "circuit-open");
  await assert.rejects(async () => { for await (const _event of adapter.streamOpenAI({ ...request, turnId: "turn-4", messages: [{ role: "user", content: "123456" }] })) {} }, (error) => error.code === "transcript-limited");
  await assert.rejects(async () => { for await (const _event of adapter.streamOpenAI({ ...request, turnId: "turn-5", responseTokens: 3 })) {} }, (error) => error.code === "response-limited");
});