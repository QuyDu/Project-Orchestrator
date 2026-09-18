const DIGEST = /^[a-f0-9]{64}$/i;
const INSTRUCTION_PATTERN = /ignore\s+(?:all|previous|the)\s+(?:instructions|rules)|system\s+prompt|developer\s+message/i;

export function validateGroundingManifest(manifest, { now = new Date().toISOString() } = {}) {
  if (!manifest || manifest.schemaVersion !== "1.0.0" || manifest.approved !== true || typeof manifest.corpusVersion !== "string" || !Array.isArray(manifest.sources)) return { valid: false, reason: "malformed-or-unapproved" };
  if (!manifest.freshness || typeof manifest.freshness.checkedAt !== "string" || !Number.isInteger(manifest.freshness.maxAgeHours)) return { valid: false, reason: "malformed-freshness" };
  const ageHours = (Date.parse(now) - Date.parse(manifest.freshness.checkedAt)) / 3600000;
  if (!Number.isFinite(ageHours) || ageHours < 0 || ageHours > manifest.freshness.maxAgeHours) return { valid: false, reason: "stale" };
  if (manifest.sources.some((source) => !source || typeof source.id !== "string" || !DIGEST.test(source.digest) || !Number.isFinite(Date.parse(source.updatedAt)))) return { valid: false, reason: "malformed-source" };
  return { valid: true };
}

export function groundResponse(response, manifest, options = {}) {
  const checked = validateGroundingManifest(manifest, options);
  const sourceIds = new Set((manifest?.sources ?? []).map((source) => source.id));
  const citations = Array.isArray(response?.citations) ? response.citations.filter((citation) => sourceIds.has(citation.sourceId) && typeof citation.locator === "string") : [];
  if (!checked.valid || INSTRUCTION_PATTERN.test(String(response?.answer ?? "")) || citations.length === 0 || (response.sourceIds ?? []).some((id) => !sourceIds.has(id))) {
    return { answer: "I don't know based on the approved local sources.", citations: [], unknowns: [checked.valid ? "unsupported-or-uncited" : "grounding-unavailable"] };
  }
  return { answer: String(response.answer), citations, unknowns: Array.isArray(response.unknowns) ? response.unknowns : [] };
}