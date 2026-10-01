export function createBrowserController({ dispatch, speech = globalThis.navigator?.mediaDevices } = {}) {
  let permissionGeneration = 0;
  return {
    async requestPermission() {
      const generation = ++permissionGeneration;
      if (!speech?.getUserMedia) return { status: "unavailable" };
      let stream;
      try {
        stream = await speech.getUserMedia({ audio: true });
      } catch {
        if (generation !== permissionGeneration) return { status: "cancelled" };
        dispatch?.({ type: "DENY_CONSENT" });
        return { status: "denied" };
      }
      stream.getTracks().forEach((track) => track.stop());
      if (generation !== permissionGeneration) return { status: "cancelled" };
      dispatch?.({ type: "GRANT_CONSENT" });
      return { status: "granted" };
    },
    cancel() { permissionGeneration++; dispatch?.({ type: "CANCEL" }); },
    fallback(kind = "text-fallback") { permissionGeneration++; dispatch?.({ type: "FALLBACK", fallback: kind }); }
  };
}