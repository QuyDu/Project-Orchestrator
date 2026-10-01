const MAX_SESSION_COST_USD = 0.1;
const MAX_TRANSCRIPT_CHARS = 8000;
const MAX_RESPONSE_TOKENS = 1500;
const MAX_RESPONSE_BYTES = 64 * 1024;
const MAX_STREAM_BYTES = 1024 * 1024;
const MAX_STREAM_LINE_BYTES = 64 * 1024;

export const providerCompatibilityMatrix = Object.freeze({
  AzureCloud: Object.freeze({
    tokenScope: "https://cognitiveservices.azure.com/.default",
    openAI: Object.freeze({ endpointSuffix: ".openai.azure.com", apiVersions: ["2025-04-01-preview"] }),
    speech: Object.freeze({ endpointSuffixes: [".speech.microsoft.com", ".cognitiveservices.azure.com"], apiVersion: "explicit-required" })
  }),
  AzureUSGovernment: Object.freeze({
    tokenScope: "https://cognitiveservices.azure.us/.default",
    openAI: Object.freeze({ endpointSuffix: ".openai.azure.us", apiVersions: ["2025-04-01-preview"] }),
    speech: Object.freeze({ endpointSuffixes: [".speech.azure.us", ".cognitiveservices.azure.us"], apiVersion: "explicit-required" })
  })
});

export class ProviderAdapterError extends Error {
  constructor(code, message, details = {}) {
    super(message);
    this.name = "ProviderAdapterError";
    this.code = code;
    Object.assign(this, details);
  }
}

function fail(code, message, details) {
  throw new ProviderAdapterError(code, message, details);
}

function requireString(value, name) {
  if (typeof value !== "string" || value.trim() === "") fail("invalid-config", `${name} is required`);
  return value.trim();
}

function cloudContract(cloud) {
  const contract = providerCompatibilityMatrix[cloud];
  if (!contract) fail("cloud-mismatch", "AzureCloud or AzureUSGovernment is required");
  return contract;
}

function validateEndpoint(endpoint, service, suffixes) {
  let url;
  try { url = new URL(endpoint); } catch { fail("invalid-endpoint", `${service} endpoint must be an HTTPS URL`); }
  if (url.protocol !== "https:" || !suffixes.some((suffix) => url.hostname.endsWith(suffix))) {
    fail("sovereignty-mismatch", `${service} endpoint does not match the selected Azure cloud`);
  }
  return url;
}

export function validateProviderConfig(config) {
  if (!config) fail("invalid-config", "Provider configuration is required");
  const contract = cloudContract(config.cloud);
  requireString(config.location, "location");
  requireString(config.subscriptionId, "subscriptionId");
  const openAI = config.openAI ?? {};
  validateEndpoint(requireString(openAI.endpoint, "openAI.endpoint"), "openai", [contract.openAI.endpointSuffix]);
  requireString(openAI.deployment, "openAI.deployment");
  requireString(openAI.model, "openAI.model");
  if (!contract.openAI.apiVersions.includes(openAI.apiVersion)) fail("api-version-mismatch", "OpenAI API version is not supported for the selected cloud");
  if (config.speech) validateSpeechConfig(config.speech, config.cloud);
  return { cloud: config.cloud, location: config.location, subscriptionId: config.subscriptionId, openAI: { ...openAI }, speech: config.speech ? { ...config.speech } : undefined };
}

export function validateSpeechConfig(config, cloud = "AzureUSGovernment") {
  const contract = cloudContract(cloud);
  const endpoint = validateEndpoint(requireString(config?.endpoint, "speech.endpoint"), "speech", contract.speech.endpointSuffixes);
  if (typeof config.apiVersion !== "string" || config.apiVersion.trim() === "") fail("speech-api-version-required", "Speech API version must be explicitly configured");
  requireString(config.region, "speech.region");
  return { endpoint: endpoint.toString(), apiVersion: config.apiVersion, region: config.region };
}

function validateCredential(credential) {
  if (!credential || typeof credential.getToken !== "function") fail("credential-required", "A server-side DefaultAzureCredential or managed identity adapter is required");
  if ("apiKey" in credential || "key" in credential) fail("credential-boundary", "API keys are not accepted by the server adapter");
}

function createDeadline(signal, deadlineMs) {
  const controller = new AbortController();
  const abort = () => controller.abort(signal?.reason ?? new Error("cancelled"));
  if (signal) {
    if (signal.aborted) abort();
    else signal.addEventListener("abort", abort, { once: true });
  }
  const timer = setTimeout(() => controller.abort(new Error("deadline exceeded")), deadlineMs);
  return { signal: controller.signal, abort: () => controller.abort(), clear: () => { clearTimeout(timer); signal?.removeEventListener("abort", abort); } };
}

async function* responseChunks(body) {
  if (body && body[Symbol.asyncIterator]) {
    yield* body;
    return;
  }
  if (body?.getReader) {
    const reader = body.getReader();
    let complete = false;
    try {
      while (true) {
        const next = await reader.read();
        if (next.done) { complete = true; break; }
        yield next.value;
      }
    } finally {
      try {
        if (!complete) await reader.cancel();
      } finally {
        reader.releaseLock();
      }
    }
    return;
  }
  fail("invalid-output", "Provider returned no readable response body");
}

async function* responseLines(body) {
  const decoder = new TextDecoder();
  let pending = "";
  let receivedBytes = 0;
  for await (const chunk of responseChunks(body)) {
    if (typeof chunk !== "string" && !(chunk instanceof Uint8Array)) fail("invalid-output", "Provider returned a non-byte stream chunk");
    const length = typeof chunk === "string" ? Buffer.byteLength(chunk, "utf8") : chunk.byteLength;
    receivedBytes += length;
    if (receivedBytes > MAX_STREAM_BYTES) fail("response-limited", "Provider stream exceeds the byte ceiling");
    const bytes = typeof chunk === "string" ? Buffer.from(chunk, "utf8") : chunk;
    pending += decoder.decode(bytes, { stream: true });
    const lines = pending.split(/\r?\n/);
    pending = lines.pop();
    for (const line of lines) {
      if (Buffer.byteLength(line, "utf8") > MAX_STREAM_LINE_BYTES) fail("response-limited", "Provider stream line exceeds the byte ceiling");
      yield line;
    }
    if (Buffer.byteLength(pending, "utf8") > MAX_STREAM_LINE_BYTES) fail("response-limited", "Provider stream line exceeds the byte ceiling");
  }
  pending += decoder.decode();
  if (Buffer.byteLength(pending, "utf8") > MAX_STREAM_LINE_BYTES) fail("response-limited", "Provider stream line exceeds the byte ceiling");
  if (pending) yield pending;
}

function retryable(status) { return status === 429 || status >= 500; }

export function createProviderAdapter({ config, credential, fetchImpl = globalThis.fetch, sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms)), telemetry = () => {}, hooks = {}, now = Date.now, limits = {} }) {
  const validated = validateProviderConfig(config);
  validateCredential(credential);
  if (typeof fetchImpl !== "function") fail("transport-required", "An injected fetch implementation is required");
  const maxRetries = limits.maxRetries ?? 2;
  const maxRequestsPerMinute = limits.maxRequestsPerMinute ?? 20;
  const maxConcurrentPerIdentity = limits.maxConcurrentPerIdentity ?? 1;
  const maxTranscriptChars = limits.maxTranscriptChars ?? MAX_TRANSCRIPT_CHARS;
  const maxResponseTokens = limits.maxResponseTokens ?? MAX_RESPONSE_TOKENS;
  const maxResponseBytes = limits.maxResponseBytes ?? MAX_RESPONSE_BYTES;
  for (const [name, value] of Object.entries({ maxResponseTokens, maxResponseBytes })) {
    if (!Number.isSafeInteger(value) || value < 1) fail("invalid-config", `${name} must be a positive safe integer`);
  }
  const circuitFailureThreshold = limits.circuitFailureThreshold ?? 3;
  const circuitResetMs = limits.circuitResetMs ?? 30_000;
  const requests = new Map();
  const activeByIdentity = new Map();
  const circuits = new Map();

  function guardRate(sessionId) {
    const current = requests.get(sessionId) ?? { started: now(), count: 0 };
    if (now() - current.started >= 60_000) { current.started = now(); current.count = 0; }
    if (current.count >= maxRequestsPerMinute) fail("rate-limited", "Session request rate exceeded", { retryAfterMs: 60_000 });
    current.count += 1;
    requests.set(sessionId, current);
  }

  function guardCircuit(identity) {
    const circuit = circuits.get(identity);
    if (circuit?.openedAt && now() - circuit.openedAt < circuitResetMs) fail("circuit-open", "Provider circuit is open", { retryAfterMs: circuitResetMs - (now() - circuit.openedAt) });
    if (circuit?.openedAt) circuits.delete(identity);
  }

  function recordFailure(identity) {
    const circuit = circuits.get(identity) ?? { failures: 0, openedAt: 0 };
    circuit.failures += 1;
    if (circuit.failures >= circuitFailureThreshold) circuit.openedAt = now();
    circuits.set(identity, circuit);
  }

  function recordSuccess(identity) {
    circuits.delete(identity);
  }

  async function token() {
    const result = await credential.getToken(cloudContract(validated.cloud).tokenScope);
    if (!result?.token) fail("credential-invalid", "Server credential did not return a token");
    return result.token;
  }

  async function* streamOpenAI({ sessionId, identity, turnId, messages, signal, deadlineMs = 10_000, estimatedCostUsd = 0, transcriptChars, responseTokens = 0 }) {
    requireString(sessionId, "sessionId");
    requireString(identity, "identity");
    requireString(turnId, "turnId");
    if (!Array.isArray(messages) || messages.some((message) => !message || typeof message.role !== "string" || typeof message.content !== "string")) fail("invalid-input", "messages must contain role and content strings");
    if (messages.some((message) => message.content.length > maxTranscriptChars) || (transcriptChars ?? messages.reduce((total, message) => total + message.content.length, 0)) > maxTranscriptChars) fail("transcript-limited", "Transcript length exceeds the approved ceiling");
    if (!Number.isInteger(responseTokens) || responseTokens < 0 || responseTokens > maxResponseTokens) fail("response-limited", "Response token request exceeds the approved ceiling");
    if (!Number.isFinite(estimatedCostUsd) || estimatedCostUsd < 0 || estimatedCostUsd > MAX_SESSION_COST_USD) fail("cost-limited", "Estimated session cost exceeds the approved ceiling");
    if (hooks.inputSafety && !(await hooks.inputSafety({ messages }))) fail("input-blocked", "Input safety policy blocked the request");
    guardCircuit(identity);
    const active = activeByIdentity.get(identity) ?? 0;
    if (active >= maxConcurrentPerIdentity) fail("concurrency-limited", "Identity already has an active request");
    guardRate(sessionId);
    const requestUrl = new URL(`/openai/deployments/${encodeURIComponent(validated.openAI.deployment)}/chat/completions`, validated.openAI.endpoint);
    requestUrl.searchParams.set("api-version", validated.openAI.apiVersion);
    const started = now();
    const deadline = createDeadline(signal, deadlineMs);
    activeByIdentity.set(identity, active + 1);
    let response;
    try {
      for (let attempt = 0; attempt <= maxRetries; attempt += 1) {
        if (deadline.signal.aborted) fail(signal?.aborted ? "cancelled" : "deadline-exceeded", signal?.aborted ? "Request cancelled" : "Request deadline exceeded");
        response = await fetchImpl(requestUrl, { method: "POST", headers: { authorization: `Bearer ${await token()}`, "content-type": "application/json" }, body: JSON.stringify({ messages, stream: true, max_completion_tokens: responseTokens || maxResponseTokens }), signal: deadline.signal });
        if (!retryable(response.status) || attempt === maxRetries) break;
        await sleep(2 ** attempt * 100);
      }
      telemetry({ event: "provider.request", provider: "azure-openai", status: response.status, attempts: Math.min(maxRetries + 1, 1), durationMs: now() - started });
      if (!response.ok) fail(response.status === 429 ? "rate-limited" : "provider-error", "Provider request failed", { status: response.status });
      let output = "";
      let outputBytes = 0;
      for await (const line of responseLines(response.body)) {
        if (!line.startsWith("data:")) continue;
        const payload = line.slice(5).trim();
        if (payload === "[DONE]") break;
        let parsed;
        try { parsed = JSON.parse(payload); } catch { fail("invalid-output", "Provider returned malformed streaming data"); }
        const text = parsed?.choices?.[0]?.delta?.content;
        if (text === undefined) continue;
        if (typeof text !== "string") fail("invalid-output", "Provider returned a non-string delta");
        outputBytes += Buffer.byteLength(text, "utf8");
        if (outputBytes > maxResponseBytes) fail("response-limited", "Provider output exceeds the byte ceiling");
        output += text;
        if (hooks.outputSafety && !(await hooks.outputSafety({ text, output }))) fail("output-blocked", "Output safety policy blocked the response");
        yield { type: "RESPONSE_DELTA", text };
      }
      if (hooks.validateOutput && !(await hooks.validateOutput({ output }))) fail("output-invalid", "Output validation rejected the response");
      recordSuccess(identity);
      telemetry({ event: "provider.complete", provider: "azure-openai", outputLength: output.length, durationMs: now() - started });
    } catch (error) {
      if (error.code !== "cancelled" && error.code !== "deadline-exceeded" && error.code !== "rate-limited" && error.code !== "cost-limited" && error.code !== "response-limited") recordFailure(identity);
      const code = deadline.signal.aborted ? (signal?.aborted ? "cancelled" : "deadline-exceeded") : error.code;
      telemetry({ event: "provider.error", provider: "azure-openai", code: code ?? "provider-error" });
      if (code && code !== error.code) fail(code, code === "cancelled" ? "Request cancelled" : "Request deadline exceeded");
      throw error;
    } finally {
      const remaining = (activeByIdentity.get(identity) ?? 1) - 1;
      if (remaining > 0) activeByIdentity.set(identity, remaining);
      else activeByIdentity.delete(identity);
      deadline.abort();
      deadline.clear();
    }
  }

  return { cloud: validated.cloud, location: validated.location, apiVersion: validated.openAI.apiVersion, credentialMode: "server-only", streamOpenAI };
}