export function createBrowserController({ dispatch, speech = globalThis.navigator?.mediaDevices } = {}) {
  return {
    async requestPermission() {
      if (!speech?.getUserMedia) return { status: "unavailable" };
      try {
        const stream = await speech.getUserMedia({ audio: true });
        stream.getTracks().forEach((track) => track.stop());
        dispatch?.({ type: "GRANT_CONSENT" });
        return { status: "granted" };
      } catch {
        dispatch?.({ type: "DENY_CONSENT" });
        return { status: "denied" };
      }
    },
    cancel() { dispatch?.({ type: "CANCEL" }); },
    fallback(kind = "text-fallback") { dispatch?.({ type: "FALLBACK", fallback: kind }); }
  };
}