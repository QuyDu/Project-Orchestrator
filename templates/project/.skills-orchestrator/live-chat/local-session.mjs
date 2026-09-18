export function createSessionBoundary({ sessionId, maxEvents = 30, maxRetries = 2, idleTimeoutMs = 30 * 60_000, absoluteTimeoutMs = 120 * 60_000, now = Date.now } = {}) {
  const createdAt = now();
  const accepted = [];
  const ids = new Set();
  let lastActivityAt = createdAt;
  let expired = false;

  function isExpired() {
    expired ||= now() - createdAt >= absoluteTimeoutMs || now() - lastActivityAt >= idleTimeoutMs;
    return expired;
  }

  return {
    maxRetries,
    accept(event) {
      if (!event || typeof event.id !== "string") return { ok: false, reason: "invalid" };
      if (isExpired()) return { ok: false, reason: "expired" };
      if (event.sessionId && event.sessionId !== sessionId) return { ok: false, reason: "cross-session" };
      if (ids.has(event.id)) return { ok: false, reason: "duplicate" };
      if (accepted.length >= maxEvents) return { ok: false, reason: "rate-limited" };
      ids.add(event.id);
      accepted.push({ ...event });
      lastActivityAt = now();
      return { ok: true };
    },
    exportTranscript() {
      if (isExpired()) return [];
      return accepted.filter((event) => event.type === "TRANSCRIPT_FINAL").map(({ id, type, text }) => ({ id, type, text }));
    },
    exportAudio() {
      return null;
    },
    isExpired() {
      return isExpired();
    }
  };
}

export function createTransportContract() {
  return { credentials: "server-only", replay: "session-and-sequence-bound", retryLimit: 2, rawAudio: "ephemeral" };
}

export function createFakeClock(start = 0) {
  let current = start;
  return { now: () => current, advance: (milliseconds) => { current += milliseconds; return current; } };
}

export function createFakeAdapters(clock = createFakeClock()) {
  return {
    clock,
    speech: { capture: false, start() { this.capture = true; }, stop() { this.capture = false; } },
    response: { deltas: [], complete: false, push(text) { this.deltas.push({ at: clock.now(), text }); }, finish() { this.complete = true; } },
    cancellation: { cancelled: false, cancel() { this.cancelled = true; } }
  };
}