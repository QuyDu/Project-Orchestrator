import assert from "node:assert/strict";
import test from "node:test";
import { createProviderAdapter, ProviderAdapterError, providerCompatibilityMatrix, validateProviderConfig, validateSpeechConfig } from "../templates/project/.skills-orchestrator/live-chat/server/provider-adapter.mjs";

const config = { cloud: "AzureUSGovernment", location: "usgovvirginia", subscriptionId: "sub-test", openAI: { endpoint: "https://chat.openai.azure.us", deployment: "gpt-5.1", model: "gpt-5.1", apiVersion: "2025-04-01-preview" } };
const credential = { getToken: async () => ({ token: "fake-token" }) };

function fakeResponse(lines, status = 200) {
  return { status, ok: status >= 200 && status < 300, body: (async function* () { yield lines; })() };
}

test("compatibility matrix and server credential are enforced before transport", () => {
  assert.equal(providerCompatibilityMatrix.AzureUSGovernment.openAI.endpointSuffix, ".openai.azure.us");
  assert.equal(providerCompatibilityMatrix.AzureCloud.openAI.endpointSuffix, ".openai.azure.com");
  assert.deepEqual(validateProviderConfig(config).openAI.apiVersion, "2025-04-01-preview");
  assert.deepEqual(validateProviderConfig({ ...config, cloud: "AzureCloud", location: "eastus", openAI: { ...config.openAI, endpoint: "https://chat.openai.azure.com" } }).cloud, "AzureCloud");
  assert.throws(() => validateProviderConfig({ ...config, cloud: "AzureChinaCloud" }), (error) => error.code === "cloud-mismatch");
  assert.throws(() => validateProviderConfig({ ...config, openAI: { ...config.openAI, endpoint: "https://chat.openai.azure.com" } }), (error) => error.code === "sovereignty-mismatch");
  assert.throws(() => validateProviderConfig({ ...config, openAI: { ...config.openAI, apiVersion: "" } }), (error) => error.code === "api-version-mismatch");
  assert.throws(() => createProviderAdapter({ config, fetchImpl: () => { throw new Error("must not call"); } }), (error) => error.code === "credential-required");
  assert.throws(() => createProviderAdapter({ config, credential: { apiKey: "secret" }, fetchImpl: () => { throw new Error("must not call"); } }), (error) => error.code === "credential-required");
  assert.throws(() => validateSpeechConfig({ endpoint: "https://speech.cognitiveservices.azure.us", region: "usgovarizona" }), (error) => error.code === "speech-api-version-required");
  assert.deepEqual(validateSpeechConfig({ endpoint: "https://speech.cognitiveservices.azure.com", region: "eastus", apiVersion: "2025-10-15" }, "AzureCloud").region, "eastus");
  assert.throws(() => validateSpeechConfig({ endpoint: "https://speech.cognitiveservices.azure.us", region: "usgovarizona", apiVersion: "2025-10-15" }, "AzureCloud"), (error) => error.code === "sovereignty-mismatch");
  assert.throws(() => validateSpeechConfig({ endpoint: "https://speech.cognitiveservices.azure.com", region: "eastus", apiVersion: "2025-10-15" }, "AzureUSGovernment"), (error) => error.code === "sovereignty-mismatch");
});

test("Azure Commercial transport uses the Commercial Entra token audience", async () => {
  const scopes = [];
  const adapter = createProviderAdapter({
    config: { ...config, cloud: "AzureCloud", location: "eastus", openAI: { ...config.openAI, endpoint: "https://chat.openai.azure.com" } },
    credential: { getToken: async (scope) => { scopes.push(scope); return { token: "fake-token" }; } },
    fetchImpl: async () => fakeResponse("data: [DONE]\n")
  });
  for await (const _event of adapter.streamOpenAI({ sessionId: "s1", identity: "user-1", turnId: "turn-1", messages: [] })) {}
  assert.deepEqual(scopes, ["https://cognitiveservices.azure.com/.default"]);
});

test("Azure Government transport uses the Government Entra token audience", async () => {
  const scopes = [];
  const adapter = createProviderAdapter({
    config,
    credential: { getToken: async (scope) => { scopes.push(scope); return { token: "fake-token" }; } },
    fetchImpl: async () => fakeResponse("data: [DONE]\n")
  });
  for await (const _event of adapter.streamOpenAI({ sessionId: "s1", identity: "user-1", turnId: "turn-1", messages: [] })) {}
  assert.deepEqual(scopes, ["https://cognitiveservices.azure.us/.default"]);
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

test("response budgets reach the provider and reject invalid numeric bounds", async () => {
  const bodies = [];
  const adapter = createProviderAdapter({
    config, credential, limits: { maxResponseTokens: 20 },
    fetchImpl: async (_url, request) => {
      bodies.push(JSON.parse(request.body));
      return fakeResponse("data: [DONE]\n");
    }
  });
  const request = { sessionId: "budget", identity: "budget-user", turnId: "turn", messages: [] };
  for (const responseTokens of [undefined, 0, 7]) {
    for await (const _event of adapter.streamOpenAI({ ...request, responseTokens })) {}
  }
  assert.deepEqual(bodies.map((body) => body.max_completion_tokens), [20, 20, 7]);
  for (const estimatedCostUsd of [NaN, Infinity, -Infinity, "0"]) {
    await assert.rejects(async () => {
      for await (const _event of adapter.streamOpenAI({ ...request, estimatedCostUsd })) {}
    }, (error) => error.code === "cost-limited");
  }
  for (const value of [0, -1, NaN, Infinity, 1.5, "2"]) {
    assert.throws(() => createProviderAdapter({ config, credential, limits: { maxResponseTokens: value } }), (error) => error.code === "invalid-config");
    assert.throws(() => createProviderAdapter({ config, credential, limits: { maxResponseBytes: value } }), (error) => error.code === "invalid-config");
  }
  assert.equal(bodies.length, 3);
});

test("output byte ceiling stops before yielding excess and releases the request", async () => {
  let closed = 0;
  let requestSignal;
  let calls = 0;
  const adapter = createProviderAdapter({
    config, credential, limits: { maxResponseBytes: 8 },
    fetchImpl: async (_url, request) => {
      requestSignal = request.signal;
      calls++;
      return {
        status: 200, ok: true,
        body: (async function* () {
          try {
            yield 'data: {"choices":[{"delta":{"content":"abcd"}}]}\n';
            if (calls === 1) yield 'data: {"choices":[{"delta":{"content":"efghi"}}]}\n';
            yield "data: [DONE]\n";
          } finally { closed++; }
        })()
      };
    }
  });
  const request = { sessionId: "bytes", identity: "byte-user", turnId: "first", messages: [] };
  const output = [];
  await assert.rejects(async () => {
    for await (const event of adapter.streamOpenAI(request)) output.push(event.text);
  }, (error) => error.code === "response-limited");
  assert.deepEqual(output, ["abcd"]);
  assert.equal(closed, 1);
  assert.equal(requestSignal.aborted, true);
  for await (const _event of adapter.streamOpenAI({ ...request, turnId: "second" })) {}
  assert.equal(closed, 2);
});

test("wire and line byte ceilings reject oversized streams and release readers", async () => {
  for (const readerMode of [false, true]) {
    for (const chunks of [
      [Buffer.alloc(64 * 1024 + 1, 120)],
      Array.from({ length: 17 }, () => Buffer.from("x\n".repeat(32 * 1024)))
    ]) {
      let returned = 0;
      let released = 0;
      let position = 0;
      const body = readerMode ? {
        getReader: () => ({
          async read() { return position < chunks.length ? { value: chunks[position++], done: false } : { done: true }; },
          async cancel() { returned++; },
          releaseLock() { released++; }
        })
      } : (async function* () {
        try { yield* chunks; } finally { returned++; }
      })();
      const adapter = createProviderAdapter({ config, credential, fetchImpl: async () => ({ status: 200, ok: true, body }) });
      await assert.rejects(async () => {
        for await (const _event of adapter.streamOpenAI({ sessionId: "wire", identity: "wire-user", turnId: "turn", messages: [] })) {}
      }, (error) => error.code === "response-limited");
      assert.equal(returned, 1);
      assert.equal(released, readerMode ? 1 : 0);
    }
  }
});

test("bounded stream decoding preserves UTF-8 across all byte boundaries", async () => {
  const text = "caf\u00e9 \ud83d\ude03 \u6f22";
  const data = Buffer.from(`data: ${JSON.stringify({ choices: [{ delta: { content: text } }] })}\n\ndata: [DONE]\n`);
  for (let split = 1; split < data.length; split++) {
    const adapter = createProviderAdapter({
      config, credential,
      fetchImpl: async () => ({ status: 200, ok: true, body: (async function* () { yield data.subarray(0, split); yield data.subarray(split); })() })
    });
    const values = [];
    for await (const event of adapter.streamOpenAI({ sessionId: "unicode", identity: "unicode-user", turnId: "turn", messages: [] })) values.push(event.text);
    assert.deepEqual(values, [text]);
  }
});

test("provider byte bounds accept exact ceilings and count UTF-8 bytes rather than characters", async () => {
  for (const text of ["\u00e9\u00e9", "\u00e9\u00e9x"]) {
    const adapter = createProviderAdapter({
      config, credential, limits: { maxResponseBytes: 4 },
      fetchImpl: async () => fakeResponse(`data: ${JSON.stringify({ choices: [{ delta: { content: text } }] })}\n\ndata: [DONE]\n`)
    });
    const consume = async () => {
      const values = [];
      for await (const event of adapter.streamOpenAI({ sessionId: "exact", identity: "exact-user", turnId: "turn", messages: [] })) values.push(event.text);
      return values;
    };
    if (Buffer.byteLength(text) === 4) assert.deepEqual(await consume(), [text]);
    else await assert.rejects(consume, (error) => error.code === "response-limited");
  }
  for (const chunks of [
    [Buffer.alloc(64 * 1024, 120)],
    Array.from({ length: 16 }, () => Buffer.from("x\n".repeat(32 * 1024)))
  ]) {
    const adapter = createProviderAdapter({
      config, credential,
      fetchImpl: async () => ({ status: 200, ok: true, body: (async function* () { yield* chunks; })() })
    });
    const values = [];
    for await (const event of adapter.streamOpenAI({ sessionId: "exact-wire", identity: "exact-wire-user", turnId: "turn", messages: [] })) values.push(event);
    assert.deepEqual(values, []);
  }
});

test("rate rejection and pre-transport errors do not retain an active identity slot", async () => {
  let clock = 1;
  const request = { sessionId: "rate-reset", identity: "same-user", turnId: "turn", messages: [] };
  const adapter = createProviderAdapter({
    config, credential, now: () => clock, limits: { maxRequestsPerMinute: 1 },
    fetchImpl: async () => fakeResponse("data: [DONE]\n")
  });
  const consume = async (instance, value) => { for await (const _event of instance.streamOpenAI(value)) {} };
  await consume(adapter, request);
  await assert.rejects(() => consume(adapter, request), (error) => error.code === "rate-limited");
  clock += 60_001;
  await consume(adapter, request);

  const second = createProviderAdapter({ config, credential, fetchImpl: async () => fakeResponse("data: [DONE]\n") });
  await assert.rejects(() => consume(second, {
    ...request, signal: { aborted: false, addEventListener() { throw new Error("injected signal setup failure"); } }
  }), /signal setup failure/);
  await consume(second, request);
});