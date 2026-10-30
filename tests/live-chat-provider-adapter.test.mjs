import assert from "node:assert/strict";
import test from "node:test";
import { createProviderAdapter, ProviderAdapterError, providerCompatibilityMatrix, validateProviderConfig, validateSpeechConfig } from "../templates/project/.skills-orchestrator/live-chat/server/provider-adapter.mjs";

const config = { cloud: "AzureUSGovernment", location: "usgovvirginia", subscriptionId: "sub-test", openAI: { endpoint: "https://chat.openai.azure.us", deployment: "gpt-5.1", model: "gpt-5.1", apiVersion: "2025-04-01-preview" } };
const credential = { getToken: async () => ({ token: "fake-token" }) };

function fakeResponse(lines, status = 200) {
  return { status, ok: status >= 200 && status < 300, body: (async function* () { yield lines; })() };
}

async function drainProvider(adapter, request = {}) {
  const events = [];
  for await (const event of adapter.streamOpenAI({ sessionId: "fixture-session", identity: "fixture-user", turnId: "fixture-turn", messages: [], ...request })) events.push(event);
  return events;
}

test("remediation transcript accounting rejects forged counts before credentials or transport", async () => {
  let tokenCalls = 0;
  let transportCalls = 0;
  const adapter = createProviderAdapter({
    config,
    credential: { getToken: async () => { tokenCalls++; return { token: "fake-token" }; } },
    fetchImpl: async () => { transportCalls++; return fakeResponse("data: [DONE]\n"); }
  });
  const messages = [{ role: "user", content: "x".repeat(5000) }, { role: "assistant", content: "y".repeat(5000) }];
  for (const transcriptChars of [undefined, 0, -1, NaN, Infinity, 1, 9999, 10000]) {
    await assert.rejects(() => drainProvider(adapter, { messages, transcriptChars }), (error) => error.code === "transcript-limited");
  }
  assert.equal(tokenCalls, 0);
  assert.equal(transportCalls, 0);
});

test("remediation transcript metadata must match the measured boundary", async () => {
  let transportCalls = 0;
  const adapter = createProviderAdapter({ config, credential, limits: { maxTranscriptChars: 8 }, fetchImpl: async () => { transportCalls++; return fakeResponse("data: [DONE]\n"); } });
  const messages = [{ role: "user", content: "abcd" }, { role: "assistant", content: "efgh" }];
  await drainProvider(adapter, { messages });
  await drainProvider(adapter, { messages, transcriptChars: 8 });
  await drainProvider(adapter, { messages: [], transcriptChars: 0 });
  for (const transcriptChars of [0, -1, 7, 9, 1.5, NaN, Infinity, -Infinity, "8", null]) {
    await assert.rejects(() => drainProvider(adapter, { messages, transcriptChars }), (error) => error.code === "invalid-input");
  }
  assert.equal(transportCalls, 3);
});

test("remediation transcript and guard configuration rejects invalid numeric bounds", () => {
  for (const name of ["maxTranscriptChars", "maxRequestsPerMinute", "maxConcurrentPerIdentity", "circuitFailureThreshold", "circuitResetMs", "maxSessionRecords", "maxCircuitRecords"]) {
    for (const value of [0, -1, NaN, Infinity, 1.5, "2"]) {
      assert.throws(() => createProviderAdapter({ config, credential, limits: { [name]: value } }), (error) => error.code === "invalid-config", name);
    }
  }
  for (const value of [-1, NaN, Infinity, 1.5, "2"]) {
    assert.throws(() => createProviderAdapter({ config, credential, limits: { maxRetries: value } }), (error) => error.code === "invalid-config");
  }
});

test("remediation bookkeeping bounds session admission without evicting live rate windows", async () => {
  let clock = 0;
  let calls = 0;
  const adapter = createProviderAdapter({ config, credential, now: () => clock, limits: { maxSessionRecords: 2, maxRequestsPerMinute: 1 }, fetchImpl: async () => { calls++; return fakeResponse("data: [DONE]\n"); } });
  await drainProvider(adapter, { sessionId: "first" });
  await drainProvider(adapter, { sessionId: "second" });
  await assert.rejects(() => drainProvider(adapter, { sessionId: "third" }), (error) => error.code === "capacity-limited");
  await assert.rejects(() => drainProvider(adapter, { sessionId: "first" }), (error) => error.code === "rate-limited");
  for (let window = 1; window <= 20; window++) {
    clock = window * 60_000;
    await drainProvider(adapter, { sessionId: `${window}-first` });
    await drainProvider(adapter, { sessionId: `${window}-second` });
    await assert.rejects(() => drainProvider(adapter, { sessionId: `${window}-third` }), (error) => error.code === "capacity-limited");
  }
  assert.equal(calls, 42);
  assert.deepEqual(adapter.bookkeepingLimits, { maxSessionRecords: 2, maxCircuitRecords: 1000 });
});

test("remediation bookkeeping expires closed and open circuits without losing recovery", async () => {
  let clock = 0;
  let healthy = false;
  const adapter = createProviderAdapter({ config, credential, now: () => clock, limits: { maxCircuitRecords: 2, maxRequestsPerMinute: 1000, circuitFailureThreshold: 2, circuitResetMs: 100 }, fetchImpl: async () => { if (!healthy) throw new Error("offline"); return fakeResponse("data: [DONE]\n"); } });
  await assert.rejects(() => drainProvider(adapter, { identity: "first" }), /offline/);
  await assert.rejects(() => drainProvider(adapter, { identity: "second" }), /offline/);
  await assert.rejects(() => drainProvider(adapter, { identity: "third" }), (error) => error.code === "capacity-limited");
  await assert.rejects(() => drainProvider(adapter, { identity: "first" }), /offline/);
  await assert.rejects(() => drainProvider(adapter, { identity: "first" }), (error) => error.code === "circuit-open");
  for (let window = 1; window <= 20; window++) {
    clock = window * 100;
    await assert.rejects(() => drainProvider(adapter, { identity: `${window}-first` }), /offline/);
    await assert.rejects(() => drainProvider(adapter, { identity: `${window}-second` }), /offline/);
    await assert.rejects(() => drainProvider(adapter, { identity: `${window}-third` }), (error) => error.code === "capacity-limited");
  }
  healthy = true;
  await drainProvider(adapter, { identity: "20-first" });
  await drainProvider(adapter, { identity: "recovered-new" });
});

test("remediation bookkeeping stays bounded after concurrent identity failures", async () => {
  let release;
  let markStarted;
  let calls = 0;
  const failed = new Promise((resolve) => { release = resolve; });
  const started = new Promise((resolve) => { markStarted = resolve; });
  const adapter = createProviderAdapter({ config, credential, limits: { maxCircuitRecords: 2, maxRequestsPerMinute: 100 }, fetchImpl: async () => { calls++; if (calls === 30) markStarted(); await failed; throw new Error("offline"); } });
  const pending = Array.from({ length: 30 }, (_, index) => drainProvider(adapter, { identity: `parallel-${index}` }));
  try { await started; }
  finally { release(); }
  const results = await Promise.allSettled(pending);
  assert.ok(results.every((result) => result.status === "rejected"));
  for (let index = 2; index < 30; index++) {
    await assert.rejects(() => drainProvider(adapter, { identity: `parallel-${index}` }), (error) => error.code === "capacity-limited");
  }
  assert.equal(calls, 30);
});

test("remediation bookkeeping expiry preserves active identity ownership", async () => {
  let clock = 0;
  let release;
  let markStarted;
  let calls = 0;
  const response = new Promise((resolve) => { release = resolve; });
  const started = new Promise((resolve) => { markStarted = resolve; });
  const adapter = createProviderAdapter({ config, credential, now: () => clock, limits: { maxSessionRecords: 2 }, fetchImpl: async () => { calls++; if (calls === 1) { markStarted(); return response; } return fakeResponse("data: [DONE]\n"); } });
  const pending = drainProvider(adapter, { sessionId: "old-session", identity: "active-user" });
  try {
    await started;
    clock = 60_000;
    await drainProvider(adapter, { sessionId: "new-session", identity: "another-user" });
    await assert.rejects(() => drainProvider(adapter, { sessionId: "duplicate", identity: "active-user" }), (error) => error.code === "concurrency-limited");
  } finally { release(fakeResponse("data: [DONE]\n")); await pending; }
  await drainProvider(adapter, { sessionId: "new-session", identity: "active-user" });
});

test("remediation stalled credentials release identity on cancellation or deadline", async (context) => {
  for (const mode of ["cancelled", "deadline-exceeded"]) {
    await context.test(mode, async (child) => {
      child.mock.timers.enable({ apis: ["setTimeout"] });
      let release;
      let markStarted;
      let tokenCalls = 0;
      let fetchCalls = 0;
      let settled = false;
      const credentialPending = new Promise((resolve) => { release = resolve; });
      const started = new Promise((resolve) => { markStarted = resolve; });
      const controller = new AbortController();
      const adapter = createProviderAdapter({ config, credential: { getToken: async () => { tokenCalls++; if (tokenCalls === 1) { markStarted(); return credentialPending; } return { token: "fake-token" }; } }, fetchImpl: async () => { fetchCalls++; return fakeResponse("data: [DONE]\n"); } });
      const pending = drainProvider(adapter, { signal: controller.signal, deadlineMs: 5 });
      pending.then(() => { settled = true; }, () => { settled = true; });
      try {
        await started;
        if (mode === "cancelled") controller.abort();
        else child.mock.timers.tick(5);
        await new Promise((resolve) => setImmediate(resolve));
        assert.equal(settled, true, "Cancellation/deadline must settle before credentials complete");
        await assert.rejects(() => pending, (error) => error.code === mode);
        await drainProvider(adapter);
        assert.equal(fetchCalls, 1, "The same identity must be reusable before old credentials complete");
      } finally {
        release({ token: "late-token" });
        await pending.catch(() => {});
      }
      await new Promise((resolve) => setImmediate(resolve));
      assert.equal(fetchCalls, 1, "Late token completion must not start another transport");
    });
  }
});

test("remediation request deadlines reject invalid timer bounds before provider work", async () => {
  let tokenCalls = 0;
  const adapter = createProviderAdapter({ config, credential: { getToken: async () => { tokenCalls++; return { token: "fake-token" }; } }, fetchImpl: async () => fakeResponse("data: [DONE]\n") });
  for (const deadlineMs of [0, -1, NaN, Infinity, 1.5, "5", 2 ** 31]) {
    await assert.rejects(() => drainProvider(adapter, { deadlineMs }), (error) => error.code === "invalid-input");
  }
  assert.equal(tokenCalls, 0);
});

test("remediation deadlines bound every injected request dependency", async (context) => {
  for (const stage of ["inputSafety", "transport", "backoff", "outputSafety", "validateOutput"]) {
    await context.test(stage, async (child) => {
      child.mock.timers.enable({ apis: ["setTimeout"] });
      let release;
      let markStarted;
      let stalled = true;
      let settled = false;
      let calls = 0;
      const held = new Promise((resolve) => { release = resolve; });
      const started = new Promise((resolve) => { markStarted = resolve; });
      const pause = async () => { markStarted(); return held; };
      const successful = () => fakeResponse('data: {"choices":[{"delta":{"content":"ok"}}]}\n\ndata: [DONE]\n');
      const adapter = createProviderAdapter({
        config, credential, limits: { circuitFailureThreshold: 1 },
        fetchImpl: async () => { calls++; if (stalled && stage === "transport") return pause(); if (stalled && stage === "backoff") return fakeResponse("retry", 503); return successful(); },
        sleep: async () => { if (stalled && stage === "backoff") return pause(); },
        hooks: Object.fromEntries(["inputSafety", "outputSafety", "validateOutput"].map((name) => [name, async () => stalled && stage === name ? pause() : true]))
      });
      const pending = drainProvider(adapter, { deadlineMs: 5 });
      pending.then(() => { settled = true; }, () => { settled = true; });
      let completedCalls;
      try {
        await started;
        child.mock.timers.tick(5);
        await new Promise((resolve) => setImmediate(resolve));
        assert.equal(settled, true, `${stage} must not retain ownership after the deadline`);
        await assert.rejects(() => pending, (error) => error.code === "deadline-exceeded");
        stalled = false;
        await drainProvider(adapter);
        completedCalls = calls;
      } finally {
        stalled = false;
        release(stage === "transport" ? successful() : true);
        await pending.catch(() => {});
      }
      await new Promise((resolve) => setImmediate(resolve));
      assert.equal(calls, completedCalls, "Late dependency completion must not resume transport");
    });
  }
});

test("remediation deadlines release stalled stream ownership without waiting for cleanup", async (context) => {
  for (const mode of ["reader", "iterator"]) {
    await context.test(mode, async (child) => {
      child.mock.timers.enable({ apis: ["setTimeout"] });
      let release;
      let markStarted;
      let settled = false;
      let closed = 0;
      let released = 0;
      let calls = 0;
      const held = new Promise((resolve) => { release = resolve; });
      const started = new Promise((resolve) => { markStarted = resolve; });
      const read = async () => { markStarted(); return held; };
      const close = () => { closed++; return new Promise(() => {}); };
      const body = mode === "reader" ? { getReader: () => ({ read, cancel: close, releaseLock() { released++; } }) }
        : { [Symbol.asyncIterator]: () => ({ next: read, return: close }) };
      const adapter = createProviderAdapter({ config, credential, limits: { circuitFailureThreshold: 1 }, fetchImpl: async () => { calls++; return calls === 1 ? { status: 200, ok: true, body } : fakeResponse("data: [DONE]\n"); } });
      const pending = drainProvider(adapter, { deadlineMs: 5 });
      pending.then(() => { settled = true; }, () => { settled = true; });
      try {
        await started;
        child.mock.timers.tick(5);
        await new Promise((resolve) => setImmediate(resolve));
        assert.equal(settled, true);
        await assert.rejects(() => pending, (error) => error.code === "deadline-exceeded");
        assert.equal(closed, 1);
        assert.equal(released, mode === "reader" ? 1 : 0);
        await drainProvider(adapter);
      } finally { release({ done: true }); await pending.catch(() => {}); }
    });
  }
});

test("remediation input policy rejection does not open a provider failure circuit", async () => {
  let allowed = false;
  const adapter = createProviderAdapter({ config, credential, limits: { circuitFailureThreshold: 1 }, hooks: { inputSafety: async () => allowed }, fetchImpl: async () => fakeResponse("data: [DONE]\n") });
  await assert.rejects(() => drainProvider(adapter), (error) => error.code === "input-blocked");
  allowed = true;
  await drainProvider(adapter);
});

test("remediation attempt telemetry counts executed HTTP attempts on success and exhaustion", async (context) => {
  for (const statuses of [[200], [503, 503, 200], [503, 503, 503]]) {
    await context.test(statuses.join("-"), async () => {
      const events = [];
      let calls = 0;
      const adapter = createProviderAdapter({ config, credential, limits: { maxRetries: 2 }, sleep: async () => {}, telemetry: (event) => events.push(event), fetchImpl: async () => fakeResponse("data: [DONE]\n", statuses[calls++]) });
      if (statuses.at(-1) === 200) await drainProvider(adapter);
      else await assert.rejects(() => drainProvider(adapter), (error) => error.code === "provider-error");
      assert.equal(calls, statuses.length);
      assert.equal(events.find((event) => event.event === "provider.request").attempts, calls);
      for (const error of events.filter((event) => event.event === "provider.error")) assert.equal(error.attempts, calls);
    });
  }
});

test("remediation attempt telemetry reports zero before send and one before a cancelled retry", async (context) => {
  for (const stage of ["before-send", "credential-error", "transport-error", "backoff"]) {
    await context.test(stage, async () => {
      let calls = 0;
      const events = [];
      const controller = new AbortController();
      if (stage === "before-send") controller.abort();
      const adapter = createProviderAdapter({
        config, telemetry: (event) => events.push(event),
        credential: { getToken: async () => { if (stage === "credential-error") throw new Error("credential unavailable"); return { token: "fake-token" }; } },
        fetchImpl: async () => { calls++; if (stage === "transport-error") throw new Error("offline"); return fakeResponse("retry", 503); },
        sleep: async () => { controller.abort(); }
      });
      await assert.rejects(() => drainProvider(adapter, { signal: controller.signal }));
      assert.equal(calls, ["before-send", "credential-error"].includes(stage) ? 0 : 1);
      assert.equal(events.find((event) => event.event === "provider.error").attempts, calls);
    });
  }
});

test("remediation attempt telemetry does not count request serialization as transport", async () => {
  let calls = 0;
  const events = [];
  const message = { role: "user", content: "safe" };
  message.extra = message;
  const adapter = createProviderAdapter({ config, credential, telemetry: (event) => events.push(event), fetchImpl: async () => { calls++; return fakeResponse("data: [DONE]\n"); } });
  await assert.rejects(() => drainProvider(adapter, { messages: [message] }));
  assert.equal(calls, 0);
  assert.equal(events.find((event) => event.event === "provider.error").attempts, 0);
});

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