export const CONVERSATION_STATES = [
  "idle", "consent-required", "listening", "transcribing", "endpoint-pending", "correcting",
  "confirming", "thinking", "speaking", "reconnecting", "text-fallback", "guided-fallback",
  "denied", "unavailable", "cancelled", "error"
];

export function createInitialState({ consent = false, endpointMs = 900 } = {}) {
  return {
    status: consent ? "idle" : "consent-required",
    endpointMs,
    transcript: "",
    pendingSubmission: null,
    response: "",
    capturePaused: false,
    cancelled: false,
    seenEventIds: []
  };
}

function remember(state, event) {
  if (!event.id || state.seenEventIds.includes(event.id)) return state;
  return { ...state, seenEventIds: [...state.seenEventIds, event.id].slice(-100) };
}

function withSubmission(state, intent) {
  return {
    ...state,
    pendingSubmission: { text: state.transcript, intent, submitCount: 0 }
  };
}

export function reduceConversation(current, event) {
  if (!event || typeof event.type !== "string") return { ...current, status: "error" };
  if (event.id && current.seenEventIds.includes(event.id)) return current;
  let state = remember(current, event);
  if (state.cancelled && !["START_LISTENING", "GRANT_CONSENT"].includes(event.type)) return state;
  switch (event.type) {
    case "GRANT_CONSENT": return { ...state, status: "idle", cancelled: false };
    case "DENY_CONSENT": return { ...state, status: "denied" };
    case "START_LISTENING": return state.status === "idle" || state.status === "cancelled" ? { ...state, status: "listening", cancelled: false, transcript: "", pendingSubmission: null } : state;
    case "STOP_LISTENING": return ["listening", "transcribing"].includes(state.status) ? { ...state, status: "idle" } : state;
    case "TRANSCRIPT_INTERIM": return ["listening", "transcribing"].includes(state.status) ? { ...state, status: "transcribing", transcript: String(event.text ?? "") } : state;
    case "TRANSCRIPT_FINAL": return ["listening", "transcribing"].includes(state.status) ? { ...withSubmission(state, event.intent === "consequential" ? "consequential" : "informational"), status: "endpoint-pending", transcript: String(event.text ?? "") } : state;
    case "CORRECT_TRANSCRIPT": return state.status === "endpoint-pending" || state.status === "correcting" ? { ...state, status: "listening", transcript: String(event.text ?? state.transcript), pendingSubmission: null } : state;
    case "ENDPOINT_ACCEPTED":
      if (state.status !== "endpoint-pending" || !state.pendingSubmission) return state;
      if (state.pendingSubmission.intent === "consequential") return { ...state, status: "confirming" };
      return { ...state, status: "thinking", pendingSubmission: { ...state.pendingSubmission, submitCount: 1 } };
    case "CONFIRM_ACTION": return state.status === "confirming" ? { ...state, status: "thinking", pendingSubmission: { ...state.pendingSubmission, submitCount: 1 } } : state;
    case "REJECT_ACTION": return state.status === "confirming" ? { ...state, status: "cancelled", cancelled: true, pendingSubmission: null } : state;
    case "CANCEL": return { ...state, status: "cancelled", cancelled: true, pendingSubmission: null, response: "" };
    case "RESPONSE_DELTA": return ["thinking", "speaking"].includes(state.status) ? { ...state, status: "thinking", response: `${state.response}${String(event.text ?? "")}` } : state;
    case "RESPONSE_COMPLETE": return state.status === "cancelled" ? state : { ...state, status: "idle", pendingSubmission: null, capturePaused: false };
    case "SPEAKING_STARTED": return state.status === "thinking" ? { ...state, status: "speaking", capturePaused: true } : state;
    case "SPEAKING_COMPLETE": return state.status === "speaking" ? { ...state, status: "idle", capturePaused: false, pendingSubmission: null } : state;
    case "RECONNECT": return state.cancelled ? state : { ...state, status: "reconnecting" };
    case "FALLBACK": return { ...state, status: event.fallback === "guided-fallback" ? "guided-fallback" : "text-fallback", capturePaused: false };
    case "ERROR": return { ...state, status: "error", capturePaused: false };
    default: return { ...state, status: "error" };
  }
}