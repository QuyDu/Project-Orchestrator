import { stop } from "../contracts.mjs";
import { runAzureCli } from "./azure-cli.mjs";

export async function createAzureHttp(profile, dependencies = {}) {
  if (profile?.cloud !== "AzureCloud") stop("CLOUD_UNVERIFIED", "Only the reviewed Azure Commercial cloud is supported.");
  const guid = /^[a-f0-9]{8}-(?:[a-f0-9]{4}-){3}[a-f0-9]{12}$/i;
  if (!guid.test(profile.subscription?.subscriptionId ?? "") || !guid.test(profile.subscription?.tenantId ?? "")) stop("AZURE_PROFILE_REQUIRED", "The target profile must bind an existing Azure account and tenant.");
  const cli = dependencies.runAzureCli ?? runAzureCli;
  const version = await cli(["version", "--output", "json"]);
  const cloud = await cli(["cloud", "show", "--output", "json"]);
  const account = await cli(["account", "show", "--output", "json", "--only-show-errors"]);
  if (!/^\d+\.\d+\.\d+$/.test(version?.["azure-cli"] ?? "") || cloud?.name !== "AzureCloud"
      || account?.environmentName !== "AzureCloud" || account?.state !== "Enabled"
      || account.id !== profile.subscription.subscriptionId || account.tenantId !== profile.subscription.tenantId) {
    stop("AZURE_ACCOUNT_MISMATCH", "Current Azure CLI cloud/account does not match the reviewed project profile; no login or switching was attempted.");
  }
  const fetchImpl = dependencies.fetch ?? globalThis.fetch;
  const cache = new Map();
  async function token(audience) {
    const resource = audience === "foundry" ? "https://ai.azure.com" : audience === "arm" ? "https://management.azure.com/" : null;
    if (!resource) stop("TOKEN_AUDIENCE", "Unapproved Azure token audience.");
    const cached = cache.get(resource);
    if (cached && cached.expires > Date.now() + 60_000) return cached.value;
    const value = await cli(["account", "get-access-token", "--resource", resource, "--output", "json", "--only-show-errors"]);
    const expires = Number(value?.expires_on) * 1000;
    if (value?.tenant !== profile.subscription.tenantId || value?.subscription !== profile.subscription.subscriptionId
        || typeof value.accessToken !== "string" || !value.accessToken || /[\r\n]/.test(value.accessToken)
        || !Number.isFinite(expires) || expires <= Date.now() + 60_000) stop("AZURE_SESSION_REQUIRED", "A current matching Entra CLI session is required; details were redacted.");
    cache.set(resource, { expires, value: value.accessToken });
    return value.accessToken;
  }
  return {
    cliVersion: version["azure-cli"],
    async send(operation, { body, missing = false, timeoutMs = 60_000 } = {}) {
      const { url, method, audience, merge = false } = operation;
      const parsed = new URL(url);
      if (parsed.protocol !== "https:" || parsed.username || parsed.password || parsed.hash || parsed.port
          || (audience === "arm" ? parsed.origin !== "https://management.azure.com"
            : !/^[a-z0-9-]+\.services\.ai\.azure\.com$/.test(parsed.hostname))
          || !["GET", "POST", "PUT", "PATCH"].includes(method)) stop("HTTP_BOUNDARY", "Unapproved provider transport operation.");
      let response;
      try {
        response = await fetchImpl(url, {
          method, redirect: "error", signal: AbortSignal.timeout(timeoutMs),
          headers: { Authorization: `Bearer ${await token(audience)}`, Accept: "application/json",
            ...(body !== undefined ? { "Content-Type": merge ? "application/merge-patch+json" : "application/json" } : {}) },
          ...(body !== undefined ? { body: JSON.stringify(body) } : {})
        });
      } catch (error) {
        if (error?.name === "DeploymentError") throw error;
        stop("PROVIDER_TRANSPORT", "Provider transport failed; a submitted mutation may have succeeded. No automatic retry is permitted.");
      }
      if (method === "GET" && missing && response.status === 404) { await response.body?.cancel().catch(() => {}); return null; }
      const expected = method === "PUT" ? [200, 201, 202] : [200];
      if (!expected.includes(response.status)) {
        await response.body?.cancel().catch(() => {});
        stop(`PROVIDER_HTTP_${response.status}`, `Provider rejected the reviewed operation (HTTP ${response.status}); details were redacted.`);
      }
      const chunks = [];
      let size = 0;
      const reader = response.body?.getReader();
      if (reader) {
        try {
          while (true) {
            const { done, value } = await reader.read();
            if (done) break;
            size += value.length;
            if (size > 2_097_152) stop("PROVIDER_RESPONSE_LIMIT", "Provider response exceeded the bounded size limit.");
            chunks.push(Buffer.from(value));
          }
        } finally { await reader.cancel().catch(() => {}); reader.releaseLock(); }
      }
      if (size === 0 && method === "PUT") return { status: response.status, body: null };
      try { return { status: response.status, body: JSON.parse(Buffer.concat(chunks).toString("utf8")) }; }
      catch { stop("PROVIDER_CONTRACT", "Provider returned invalid JSON; response details were redacted."); }
    }
  };
}
