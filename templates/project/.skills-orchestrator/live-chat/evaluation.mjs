function percentile(values, percentileValue) {
  if (!Array.isArray(values) || values.length === 0) throw new Error("Latency samples are required");
  const sorted = [...values].sort((left, right) => left - right);
  return sorted[Math.min(sorted.length - 1, Math.ceil(sorted.length * percentileValue) - 1)];
}

export function endpointDecision(frames, { silenceMs = 900, frameMs = 100, speechFloor = 0.5 } = {}) {
  if (!Array.isArray(frames) || !frames.every((frame) => Number.isFinite(frame) && frame >= 0)) throw new Error("Frames must be non-negative numbers");
  let observedSpeech = false;
  let quietMs = 0;
  for (const frame of frames) {
    if (frame >= speechFloor) {
      observedSpeech = true;
      quietMs = 0;
    } else if (observedSpeech) {
      quietMs += frameMs;
      if (quietMs >= silenceMs) return { accepted: true, reason: "post-speech-silence", quietMs };
    }
  }
  return { accepted: false, reason: observedSpeech ? "awaiting-silence" : "no-speech", quietMs };
}

export function evaluateEndpointFixtures(fixtures, options) {
  if (!Array.isArray(fixtures) || fixtures.length === 0) throw new Error("Endpoint fixtures are required");
  const outcomes = fixtures.map(({ id, frames, expected }) => ({ id, expected, ...endpointDecision(frames, options) }));
  const mismatches = outcomes.filter(({ expected, accepted }) => expected !== accepted);
  return { total: outcomes.length, matched: outcomes.length - mismatches.length, falseEndpointRate: mismatches.length / outcomes.length, outcomes };
}

export function measureLocalLatency(samples, thresholdMs) {
  if (!Number.isFinite(thresholdMs) || thresholdMs < 0) throw new Error("A non-negative latency threshold is required");
  if (!Array.isArray(samples) || samples.some((sample) => !Number.isFinite(sample) || sample < 0)) throw new Error("Latency samples must be non-negative numbers");
  const p95 = percentile(samples, 0.95);
  return { samples: samples.length, p95, thresholdMs, passed: p95 <= thresholdMs };
}