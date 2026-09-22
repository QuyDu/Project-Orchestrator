import { validateShape, stop } from "../contracts.mjs";

const sha = { type: "string", pattern: "^[a-f0-9]{64}$" };
const resourceId = {
  type: "string", minLength: 1, maxLength: 1024,
  pattern: "^(?![A-Za-z][A-Za-z0-9+.-]*://)/?[A-Za-z0-9][A-Za-z0-9:._/-]*$"
};
const nullableId = { anyOf: [{ type: "null" }, resourceId] };
const version = { type: ["string", "null"], maxLength: 128, pattern: "^[a-zA-Z0-9][a-zA-Z0-9._+-]*$" };
const resourceIds = { type: "array", uniqueItems: true, maxItems: 64, items: resourceId };
export const PLATFORM_TARGETS = ["microsoft-365-copilot-and-teams", "copilot-studio", "microsoft-365-agents-toolkit"];

export const platformSnapshotSchema = {
  type: "object", additionalProperties: false,
  required: ["target", "cliVersion", "identitySha256", "configurationSha256", "resourceIds", "version", "phase"],
  properties: {
    target: { enum: PLATFORM_TARGETS },
    cliVersion: { type: "string", pattern: "^[0-9]+\\.[0-9]+\\.[0-9]+(?:[-+][a-zA-Z0-9.-]+)?$" },
    identitySha256: sha, configurationSha256: sha, resourceIds, version,
    phase: { enum: ["missing", "ready", "imported", "provisioned", "deployed", "packaged", "publication-submitted", "pending-admin-approval", "published", "unknown"] }
  }
};

export const platformOutcomeSchema = {
  type: "object", additionalProperties: false,
  required: ["status", "responseId", "resourceIds", "version", "mutationAccepted", "publicationVerified", "evidenceSha256", "messageCode"],
  properties: {
    status: { enum: ["imported", "provisioned", "deployed", "packaged", "publication-submitted", "pending-admin-approval", "published", "verification-required", "rolled-back"] },
    responseId: nullableId, resourceIds, version,
    mutationAccepted: { type: "boolean" }, publicationVerified: { type: "boolean" },
    evidenceSha256: sha, messageCode: { type: "string", pattern: "^[A-Z][A-Z0-9_]{0,79}$" }
  },
  allOf: [{
    if: { properties: { status: { const: "published" } }, required: ["status"] },
    then: { properties: { publicationVerified: { const: true } } },
    else: { properties: { publicationVerified: { const: false } } }
  }]
};

export function validatePlatformSnapshot(value) {
  return validateShape(platformSnapshotSchema, value, "platform snapshot");
}

export function validatePlatformOutcome(value) {
  return validateShape(platformOutcomeSchema, value, "platform outcome");
}

export function assertPlatformProvider(provider) {
  if (!provider || ["probe", "execute", "verify", "rollback"].some((name) => typeof provider[name] !== "function")) {
    stop("PROVIDER_CONTRACT", "A platform adapter must expose the reviewed probe, execute, verify and rollback interface.");
  }
  return provider;
}
