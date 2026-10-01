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
  const fallback = (reason) => ({ answer: "I don't know based on the approved local sources.", citations: [], unknowns: [reason] });
  const checked = validateGroundingManifest(manifest, options);
  if (!checked.valid) return fallback("grounding-unavailable");
  if (!response || typeof response !== "object" || Array.isArray(response) || typeof response.answer !== "string") return fallback("unsupported-or-uncited");
  const sourceIds = new Set(manifest.sources.map((source) => source.id));
  const declaredSources = response.sourceIds ?? [];
  const unknowns = response.unknowns ?? [];
  if (!Array.isArray(declaredSources) || !Array.isArray(unknowns) || unknowns.some((unknown) => typeof unknown !== "string")
      || !Array.isArray(response.citations) || response.citations.some((citation) => !citation || typeof citation.sourceId !== "string" || typeof citation.locator !== "string")) {
    return fallback("unsupported-or-uncited");
  }
  const citations = response.citations.filter((citation) => sourceIds.has(citation.sourceId));
  if (INSTRUCTION_PATTERN.test(response.answer) || citations.length === 0 || declaredSources.some((id) => !sourceIds.has(id))) return fallback("unsupported-or-uncited");
  return { answer: response.answer, citations, unknowns };
}