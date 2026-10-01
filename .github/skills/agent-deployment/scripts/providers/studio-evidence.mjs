import { digest, rejectSecrets, stableJson, stop, validateShape } from "../contracts.mjs";

const sha = { type: "string", pattern: "^[a-f0-9]{64}$" };
const guid = { type: "string", pattern: "^[a-fA-F0-9]{8}-(?:[a-fA-F0-9]{4}-){3}[a-fA-F0-9]{12}$" };
const id = { type: "string", pattern: "^[a-zA-Z0-9][a-zA-Z0-9._/-]{0,255}$" };
const timestamp = { type: "string", format: "date-time" };
const object = (properties, required = Object.keys(properties)) => ({ type: "object", additionalProperties: false, required, properties });
const array = (items, maxItems = 128) => ({ type: "array", uniqueItems: true, maxItems, items });
const same = (a, b) => stableJson(a) === stableJson(b);
const fail = () => stop("STUDIO_CONFIGURATION_UNSUPPORTED", "Native configuration or publishOnImport is missing, ambiguous or unsupported; use reviewed solution ALM without deleting valid components.");
const securityKey = (key) => /authenticat|authoriz|security|accesscontrol|audience|channel|dlp|credential|identity|runas|maker|connection|ownerid|owning|publishedon|publishedby/i.test(key.replaceAll(/[_-]/g, ""));
const securityMutation = () => stop("STUDIO_SECURITY_SCOPE", "The solution contains security, ownership, channel or publication-metadata controls that this import contract cannot prove unchanged. Preserve the artifact and use a separately reviewed supported security workflow.");

// The restricted parser rejects duplicate keys rather than allowing JSON.parse's last-key-wins behavior.
export function parseStudioJson(text) {
  if (typeof text !== "string" || Buffer.byteLength(text) > 4_194_304) fail();
  let offset = 0;
  let nodes = 0;
  const whitespace = () => { while (/\s/.test(text[offset] ?? "") && offset < text.length) offset++; };
  function value(depth = 0) {
    whitespace();
    if (depth > 64 || ++nodes > 65536) fail();
    if (text[offset] === "{") {
      offset++;
      const result = Object.create(null);
      whitespace();
      if (text[offset] === "}") { offset++; return result; }
      while (offset < text.length) {
        whitespace();
        if (text[offset] !== '"') fail();
        const key = scalar();
        if (Object.hasOwn(result, key)) fail();
        whitespace();
        if (text[offset++] !== ":") fail();
        result[key] = value(depth + 1);
        whitespace();
        const separator = text[offset++];
        if (separator === "}") return result;
        if (separator !== ",") fail();
      }
    } else if (text[offset] === "[") {
      offset++;
      const result = [];
      whitespace();
      if (text[offset] === "]") { offset++; return result; }
      while (offset < text.length) {
        result.push(value(depth + 1));
        whitespace();
        const separator = text[offset++];
        if (separator === "]") return result;
        if (separator !== ",") fail();
      }
    } else return scalar();
    fail();
  }
  function scalar() {
    const match = /^(?:"(?:[^"\\\u0000-\u001f]|\\(?:["\\/bfnrt]|u[0-9a-fA-F]{4}))*"|true|false|null|-?(?:0|[1-9][0-9]*)(?:\.[0-9]+)?(?:[eE][+-]?[0-9]+)?)/.exec(text.slice(offset));
    if (!match) fail();
    offset += match[0].length;
    try { return JSON.parse(match[0]); } catch { fail(); }
  }
  const result = value();
  whitespace();
  if (offset !== text.length) fail();
  return rejectSecrets(result);
}

function decodeXml(text) {
  return text.replace(/&([^;]*);|&/g, (whole, entity) => {
    const predefined = { amp: "&", lt: "<", gt: ">", quot: '"', apos: "'" };
    if (Object.hasOwn(predefined, entity)) return predefined[entity];
    if (/^#(?:[0-9]+|x[0-9a-fA-F]+)$/.test(entity ?? "")) {
      const point = entity[1] === "x" ? Number.parseInt(entity.slice(2), 16) : Number(entity.slice(1));
      if (point >= 32 && point <= 0x10ffff && !(point >= 0xd800 && point <= 0xdfff)) return String.fromCodePoint(point);
    }
    fail();
  });
}

function parseXml(text) {
  if (text.length > 4_194_304 || /<!DOCTYPE|<!ENTITY|[\u0000-\u0008\u000b\u000c\u000e-\u001f]/i.test(text)) fail();
  const tokens = text.match(/<!--[\s\S]*?-->|<\?xml[\s\S]*?\?>|<!\[CDATA\[[\s\S]*?\]\]>|<(?:[^<>"']|"[^"]*"|'[^']*')*>|[^<]+/g) ?? [];
  if (tokens.join("") !== text || tokens.length > 65536) fail();
  const root = { name: "#document", children: [], text: "", attributes: {} };
  const stack = [root];
  for (const token of tokens) {
    const current = stack.at(-1);
    if (token.startsWith("<!--") || token.startsWith("<?xml")) continue;
    if (token.startsWith("<![CDATA[")) { current.text += token.slice(9, -3); continue; }
    if (token.startsWith("</")) {
      if (stack.length < 2 || token !== `</${current.name}>`) fail();
      stack.pop();
    } else if (token.startsWith("<")) {
      const match = /^<([A-Za-z_][A-Za-z0-9_.:-]*)([\s\S]*?)(\/?)>$/.exec(token);
      if (!match || stack.length > 64) fail();
      const attributes = Object.create(null);
      let remaining = match[2];
      while (remaining.trim()) {
        const attribute = /^\s+([A-Za-z_][A-Za-z0-9_.:-]*)\s*=\s*(?:"([^"]*)"|'([^']*)')/.exec(remaining);
        if (!attribute || Object.hasOwn(attributes, attribute[1].toLowerCase())) fail();
        attributes[attribute[1].toLowerCase()] = decodeXml(attribute[2] ?? attribute[3]);
        remaining = remaining.slice(attribute[0].length);
      }
      const node = { name: match[1], attributes, text: "", children: [] };
      current.children.push(node);
      if (!match[3]) stack.push(node);
    } else current.text += decodeXml(token);
  }
  if (stack.length !== 1 || root.children.length !== 1 || root.text.trim()) fail();
  return root.children[0];
}

function publicationFlags(value, flags) {
  if (!value || typeof value !== "object") return;
  for (const [key, child] of Object.entries(value)) {
    if (securityKey(key)) securityMutation();
    if (key.toLowerCase() === "publishonimport") {
      if (key !== "publishOnImport" || typeof child !== "boolean") fail();
      flags.push(child);
    } else if (key.toLowerCase() === "configuration" && typeof child === "string") {
      publicationFlags(parseStudioJson(child), flags);
    } else publicationFlags(child, flags);
  }
}

export function inspectStudioSolution(files, { requiredComponents = [], nativeMode = false, expectedBotId = null } = {}) {
  if (!(files instanceof Map) || files.size > 4096 || !files.size) fail();
  const components = new Set();
  const flags = [];
  let agents = 0;
  const botIds = [];
  let recognized = 0;
  function component(name) {
    if (typeof name !== "string" || !/^[a-zA-Z0-9][a-zA-Z0-9_.-]{0,255}$/.test(name) || components.has(name.toLowerCase())) {
      stop("STUDIO_COMPONENT_MEMBERSHIP", "Agent component membership is absent, duplicated or ambiguous.");
    }
    components.add(name.toLowerCase());
  }
  function xmlNode(node, parent = null) {
    const name = node.name.toLowerCase();
    if (name.includes(":")) fail();
    if (securityKey(name) || Object.keys(node.attributes).some(securityKey)
        || Object.entries(node.attributes).some(([key, value]) => ["name", "key", "logicalname"].includes(key) && securityKey(value))) securityMutation();
    if (name !== "configuration" && /^\s*[\[{]/.test(node.text)) publicationFlags(parseStudioJson(node.text), flags);
    else if (["content", "data", "definition"].includes(name) && node.text.trim()) fail();
    if (["bot", "botcomponent"].includes(name)) {
      const names = node.children.filter((child) => child.name.toLowerCase() === "schemaname");
      if (names.length > 1 || (names.length && Object.hasOwn(node.attributes, "schemaname"))) fail();
      const identity = node.attributes.schemaname ?? names[0]?.text.trim();
      component(identity);
      if (name === "bot") {
        agents++;
        if (Object.hasOwn(node.attributes, "configuration") || (node.attributes.botid && node.attributes.id)) fail();
        const identifiers = node.children.filter((child) => child.name.toLowerCase() === "botid");
        if (identifiers.length > 1 || (identifiers.length && (node.attributes.botid || node.attributes.id))) fail();
        const botId = node.attributes.botid ?? node.attributes.id ?? identifiers[0]?.text.trim();
        if (botId) {
          const normalizedId = /^\{[^{}]+\}$/.test(botId) ? botId.slice(1, -1) : botId;
          validateShape(guid, normalizedId, "Studio solution bot ID");
          botIds.push(normalizedId.toLowerCase());
        }
        const configs = node.children.filter((child) => child.name.toLowerCase() === "configuration");
        if (configs.length !== 1 || configs[0].children.length) fail();
        const before = flags.length;
        publicationFlags(parseStudioJson(configs[0].text), flags);
        if (flags.length !== before + 1) fail();
      }
    }
    if (/publishonimport/i.test(node.text) && !(name === "configuration" && parent === "bot")) fail();
    if (name === "publishonimport" || Object.keys(node.attributes).includes("publishonimport")) fail();
    for (const child of node.children) xmlNode(child, name);
  }
  for (const [name, bytes] of files) {
    const normalized = name.replaceAll("\\", "/").toLowerCase();
    if (!(Buffer.isBuffer(bytes) || typeof bytes === "string")) fail();
    const text = bytes.toString("utf8");
    if (nativeMode && !["solution.xml", "customizations.xml", "[content_types].xml"].includes(normalized)
        && !/^(?:bots|botcomponents)\/[a-z0-9_./-]+\.(?:xml|json)$/.test(normalized)) {
      stop("STUDIO_COMPONENT_MEMBERSHIP", "The native solution includes unreviewed component types or executable assets outside this bounded import contract.");
    }
    if (normalized.endsWith(".xml")) {
      const document = parseXml(text);
      if (normalized === "customizations.xml" && document.children.some((child) =>
        !["bots", "botcomponents"].includes(child.name.toLowerCase())
          && (child.children.length || child.text.trim() || Object.keys(child.attributes).length))) {
        stop("STUDIO_COMPONENT_MEMBERSHIP", "Additional solution roles, workflows, entities or other components need an explicit supported review; they cannot hide inside an agent import.");
      }
      xmlNode(document);
      recognized++;
    } else if (normalized.endsWith(".json")) {
      publicationFlags(parseStudioJson(text), flags);
      recognized++;
    } else if (/publishonimport|configuration|(?:^|[\\/])bots?(?:[\\/]|$)/i.test(`${name}\n${text}`)) fail();
  }
  const emptyLegacy = !nativeMode && !agents && !flags.length && files.size === 3
    && [...files.keys()].every((name) => ["solution.xml", "customizations.xml", "[content_types].xml"].includes(name.toLowerCase()))
    && (() => {
      const entry = [...files].find(([name]) => name.toLowerCase() === "customizations.xml");
      const tree = parseXml(entry[1].toString("utf8"));
      return tree.name === "ImportExportXml" && !tree.text.trim()
        && tree.children.every((node) => node.name === "Entities" && !node.text.trim() && !node.children.length);
    })();
  if (flags.some(Boolean)) {
    stop("STUDIO_AUTO_PUBLICATION_UNSUPPORTED", "publishOnImport enables publication. A separate agent-publication scope for every affected agent/channel is required; this adapter cannot safely implement that combined mutation. Import is blocked.");
  }
  if (!emptyLegacy && (!agents || flags.length !== agents || !recognized)) fail();
  if (nativeMode && (agents !== 1 || (expectedBotId !== null
      && (botIds.length !== 1 || botIds[0] !== expectedBotId.toLowerCase())))) {
    stop("STUDIO_TARGET_SCOPE", "A native import must contain exactly the reviewed bot identity; ambiguous or missing target IDs require supported discovery.");
  }
  if (agents && !nativeMode) {
    stop("STUDIO_COMPONENT_MEMBERSHIP", "A native agent solution requires the new reviewed native handoff and complete component membership before import; legacy non-agent packages remain readable.");
  }
  if (nativeMode && (!requiredComponents.length || !requiredComponents.every((name) => typeof name === "string" && components.has(name.toLowerCase())))) {
    stop("STUDIO_COMPONENT_MEMBERSHIP", "Required agent components are absent from the release solution membership; export a complete reviewed solution.");
  }
  if (nativeMode && (new Set(requiredComponents.map((name) => name.toLowerCase())).size !== requiredComponents.length
      || components.size !== requiredComponents.length)) stop("STUDIO_COMPONENT_MEMBERSHIP", "The solution contains ambiguous or unreviewed agent component membership.");
  return { publishOnImport: false, legacyNonAgent: emptyLegacy, components: [...components].sort(), inventorySha256: digest([...components].sort()) };
}

export function inspectStudioWorkspace(files, { nativeMode = false, workspaceKind = null } = {}) {
  if (!(files instanceof Map) || !files.size) fail();
  if ((nativeMode && workspaceKind !== "local-init") || [...files.keys()].some((name) =>
    /(?:^|[\\/])(?:\.mcs|actions|settings|connectionreferences|connection-references)(?:[\\/.]|$)/i.test(name)
      || (!nativeMode && /\.mcs\.ya?ml$/i.test(name)))) {
    stop("STUDIO_WORKSPACE_UNSUPPORTED", "Connected workspace packaging requires reviewed solution ALM. Preserve all actions, settings and references; no files were removed.");
  }
  for (const [name, bytes] of files) {
    const text = bytes.toString("utf8");
    if (/publishonimport/i.test(text)) {
      if (!name.toLowerCase().endsWith(".json")) fail();
      const flags = [];
      publicationFlags(parseStudioJson(text), flags);
      if (flags.length !== 1 || flags[0]) fail();
    }
  }
  return { status: "verified", scope: "local-shape-only", sourceSha256: digest([...files].map(([name, bytes]) => [name, digest(bytes)])) };
}

const urlSchema = { type: "string", pattern: "^https://[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?\\.crm[0-9]*\\.dynamics\\.com$" };
export const studioTargetSchema = object({ cloud: { const: "AzureCloud" }, tenantId: guid, environmentId: guid, dataverseUrl: urlSchema, botId: guid });

export function resolveStudioEnvironment(selector, candidates, { cloud, tenantId }) {
  if (cloud !== "AzureCloud") stop("STUDIO_CLOUD_UNVERIFIED", "This cloud has no validated native provider contract; no alternative cloud or hostname was inferred.");
  validateShape(array(object({
    displayName: { type: "string", minLength: 1, maxLength: 256 }, environmentId: guid,
    dataverseUrl: urlSchema, tenantId: guid, cloud: { const: "AzureCloud" }, evidenceSha256: sha
  }), 256), candidates, "Studio environment discovery");
  if (typeof selector !== "string" || !selector.trim() || selector.length > 256) stop("STUDIO_ENVIRONMENT_UNRESOLVED", "An exact environment name, ID or URL is required.");
  const matches = candidates.filter((item) => [item.displayName, item.environmentId, item.dataverseUrl].some((value) => value.toLowerCase() === selector.toLowerCase()));
  if (matches.length !== 1 || matches[0].tenantId.toLowerCase() !== tenantId?.toLowerCase()) {
    stop("STUDIO_ENVIRONMENT_UNRESOLVED", "Environment resolution is missing, ambiguous or outside the reviewed tenant. Reuse only a unique vetted URL and ID.");
  }
  return structuredClone(matches[0]);
}

const environmentReviewSchema = object({
  displayName: { type: "string", minLength: 1, maxLength: 256 }, environmentId: guid,
  dataverseUrl: urlSchema, tenantId: guid, cloud: { const: "AzureCloud" }, evidenceSha256: sha
});
const securityReviewSchema = object({
  authenticationMode: { const: "microsoft-single-tenant" }, authenticationTrigger: { const: "always" },
  audience: { enum: ["tenant", "private"] }, channels: { ...array({ enum: ["teams", "microsoft-365"] }, 2), minItems: 1 },
  toolIdentity: { const: "Invoker" }, audienceSha256: sha, dlpPolicySha256: sha
});
export const studioTargetReviewSchema = object({
  schemaVersion: { const: "1.0.0" }, kind: { const: "studio-target-review" }, source: { const: "operator-reviewed" },
  observedAt: timestamp, expiresAt: timestamp, cloud: { const: "AzureCloud" }, tenantId: guid,
  environmentSelector: { type: "string", minLength: 1, maxLength: 256 }, environments: { ...array(environmentReviewSchema, 256), minItems: 1 },
  botId: guid, agentSchemaName: id, solutionName: id, identitySha256: sha, security: securityReviewSchema
});
const membershipSchema = object({
  schemaVersion: { const: "1.0.0" }, kind: { const: "studio-solution-membership" },
  solutionName: id, solutionSha256: sha,
  components: { ...array(object({ path: { type: "string", minLength: 1, maxLength: 512 }, schemaName: id }), 512), minItems: 1 },
  recoverySha256: sha
});

// These records are reviewed private inputs, never a live discovery or evaluation transport.
export function bindNativeStudioHandoff(request, blueprint, handoff, documents) {
  if (!(documents instanceof Map) || !handoff || handoff.agent.id !== blueprint.id) {
    stop("STUDIO_HANDOFF_BINDING", "Native source identity differs from the deployment request.");
  }
  const config = request.copilotStudio;
  const reasons = [];
  const result = { studioTarget: null, studioTargetReview: null, studioMembership: null, studioApprovals: [],
    studioEvidence: assessStudioEvidence(), studioReview: {}, studioGateReasons: reasons };
  const read = (ref) => {
    const bytes = documents.get(ref.path.replaceAll("\\", "/"));
    if (!bytes || digest(bytes) !== ref.sha256) stop("STUDIO_EVIDENCE_DRIFT", "Native evidence is absent or differs from its reviewed digest.");
    return parseStudioJson(bytes.toString("utf8"));
  };
  function proof(observation, kind) {
    if (observation.state !== "verified") return null;
    const matches = observation.evidence.map(read).filter((item) => item?.kind === kind);
    if (matches.length !== 1) stop("STUDIO_EVIDENCE_CONTRACT", "Native verified evidence needs exactly one supported, scoped review record; a local label or CLI receipt is not enough.");
    return matches[0];
  }
  if (handoff.artifacts.authored.length) {
    result.studioEvidence = assessStudioEvidence({ authoredSha256: digest(handoff.artifacts.authored) });
  } else reasons.push("Native authored files are missing; an instruction-only package is not a native implementation.");
  // Handoff intent preserves source provenance; only the current request and reviewed plan authorize an operation.
  const operation = config?.operation;
  if (config?.solutionName && config.solutionName !== handoff.target.solution.uniqueName) stop("STUDIO_SOLUTION_SCOPE", "Solution identity differs from the native handoff.");
  if (operation === "pack" && (config.projectDirectory !== `copilot-studio/${handoff.agent.id}`
      || !same(config.sourceFiles, handoff.artifacts.authored) || config.publisherPrefix !== handoff.agent.publisherPrefix)) {
    stop("STUDIO_SOURCE_BINDING", "PAC pack must consume exactly the canonical reviewed authored source and publisher.");
  }
  if (operation === "pack" && handoff.artifacts.connectedDirectory !== null) reasons.push("Connected source requires supported solution ALM; pack cannot delete or reinterpret valid components.");
  if (operation !== "pack" && config) {
    if (handoff.target.cloud !== "Public" || request.cloud !== "AzureCloud") {
      reasons.push("The selected native cloud has no validated fixed provider contract; no alternate endpoint or cloud is inferred.");
    } else {
      const observations = ["tenant", "environment", "dataverse", "bot"].map((name) => handoff.target[name]);
      observations.push(handoff.target.solution.readiness, handoff.security.policy);
      if (observations.some((item) => item.state !== "verified")) reasons.push("Native target and security policy need scoped operator-reviewed discovery evidence, not display names or local readiness labels.");
      else {
        const reviews = observations.map((item) => proof(item, "studio-target-review"));
        reviews.forEach((item) => validateShape(studioTargetReviewSchema, item, "Studio target review"));
        if (!reviews.every((item) => same(item, reviews[0]))) stop("STUDIO_TARGET_CONFLICT", "Target readiness records disagree; no environment, tenant or policy is selected by inference.");
        const review = reviews[0];
        const selected = resolveStudioEnvironment(review.environmentSelector, review.environments, review);
        result.studioTargetReview = review;
        result.studioTarget = { cloud: review.cloud, tenantId: review.tenantId, environmentId: selected.environmentId, dataverseUrl: selected.dataverseUrl, botId: review.botId };
        const security = {
          authenticationMode: handoff.security.authentication, authenticationTrigger: "always", audience: handoff.security.audience,
          channels: handoff.security.channels.map((name) => name === "microsoft365" ? "microsoft-365" : name),
          toolIdentity: handoff.security.toolIdentity === "invoker" ? "Invoker" : handoff.security.toolIdentity,
          audienceSha256: review.security.audienceSha256, dlpPolicySha256: review.security.dlpPolicySha256
        };
        assertStudioSecurityInvariant(review.security, security);
        if (![selected.dataverseUrl, selected.environmentId].includes(config.environment)
            || review.identitySha256 !== config.identityEvidence.sha256 || request.audience !== security.audience
            || review.agentSchemaName !== handoff.agent.schemaName || review.solutionName !== handoff.target.solution.uniqueName
            || (config.botId && config.botId !== review.botId)) {
          stop("STUDIO_TARGET_SCOPE", "Native request differs from the exact vetted URL, ID, bot, solution, identity or audience.");
        }
      }
    }
    if (!["microsoft-single-tenant"].includes(handoff.security.authentication) || handoff.security.toolIdentity !== "invoker"
        || handoff.security.audience !== request.audience || !handoff.security.channels.length
        || handoff.security.channels.some((name) => !["teams", "microsoft365"].includes(name))) {
      stop("STUDIO_SECURITY_SCOPE", "Native delivery must preserve private Microsoft authentication, Invoker identity and the approved Teams/Microsoft 365 audience; security workarounds are unsupported.");
    }
  }
  const membership = handoff.artifacts.solutionMembership;
  if (["import", "export", "publish"].includes(operation)) {
    if (membership.state !== "verified" || membership.missing.length || !membership.components.length) {
      reasons.push("Complete native solution membership and retained recovery coverage have not been verified.");
    } else {
      const review = proof(membership, "studio-solution-membership");
      validateShape(membershipSchema, review, "Studio solution membership");
      const paths = review.components.map((item) => item.path);
      const authored = handoff.artifacts.authored.map((item) => item.path);
      if (!same([...paths].sort(), [...membership.components].sort()) || !same([...paths].sort(), [...authored].sort())
          || new Set(paths).size !== paths.length || new Set(review.components.map((item) => item.schemaName.toLowerCase())).size !== paths.length
          || !review.components.some((item) => item.schemaName === handoff.agent.schemaName)
          || review.solutionName !== handoff.target.solution.uniqueName
          || (config.solution && review.solutionSha256 !== config.solution.sha256)
          || !handoff.artifacts.recovery.artifacts.some((ref) => ref.sha256 === review.recoverySha256)
          || handoff.artifacts.recovery.state !== "verified") {
        stop("STUDIO_COMPONENT_MEMBERSHIP", "Release/recovery membership does not cover exactly the reviewed authored components and retained artifact.");
      }
      result.studioMembership = review;
    }
  }
  if (handoff.evidence.evaluated.state === "verified") {
    const review = proof(handoff.evidence.evaluated, "studio-evaluation-review");
    validateShape(object({ schemaVersion: { const: "1.0.0" }, kind: { const: "studio-evaluation-review" }, spec: evaluationSpecSchema, run: { type: "object" } }), review, "Studio evaluation review");
    if ((result.studioTarget && !same(review.spec.target, result.studioTarget))
        || review.spec.definitionSha256 !== digest(handoff.artifacts.authored) || (operation === "publish" && review.spec.version.kind !== "draft")) {
      stop("STUDIO_EVALUATION_BINDING", "Pre-publication evaluation review must bind this exact authored draft and target; stale definitions or a relabeled published run are insufficient.");
    }
    result.studioReview.evaluation = assessEvaluationRun(review.spec, review.run);
    result.studioEvidence.evaluated = result.studioReview.evaluation.status === "verified"
      ? layer("pending", "STUDIO_REVIEWED_EVALUATION_NOT_LIVE", digest(review)) : result.studioReview.evaluation;
  }
  if (handoff.evidence.synchronized.state === "verified") {
    const review = proof(handoff.evidence.synchronized, "studio-setting-review");
    validateShape(object({ schemaVersion: { const: "1.0.0" }, kind: { const: "studio-setting-review" }, definitionSha256: sha,
      expected: { type: "object" }, readBack: { type: "object" } }), review, "Studio setting review");
    if ((result.studioTarget && !same(review.expected.target, result.studioTarget))
        || review.definitionSha256 !== digest(handoff.artifacts.authored)) stop("STUDIO_TARGET_SCOPE", "Server setting evidence belongs to another target or source definition.");
    result.studioReview.setting = verifyStudioSetting(review.expected, review.readBack);
    result.studioEvidence.synchronized = result.studioReview.setting.status === "verified"
      ? layer("pending", "STUDIO_REVIEWED_SETTING_NOT_LIVE", digest(review)) : result.studioReview.setting;
  }
  if (operation === "publish") {
    if (handoff.capabilities.some((item) => item.scope === "required" && (item.implementation.state !== "verified"
        || item.acceptance.state !== "verified" || item.gaps.length || (item.persistence.mode === "durable" && item.persistence.state !== "verified")))) {
      reasons.push("Required native capabilities or persistence acceptance remain incomplete; publication cannot silently reduce the approved scope.");
    }
    if (result.studioReview.evaluation?.status !== "verified" || result.studioReview.setting?.status !== "verified") {
      reasons.push("Publication requires reviewed functional evaluation and exact server-setting read-back; connection grades and source no-ops are insufficient.");
    }
  }
  const diagnosticReviews = handoff.security.policy.evidence.map(read).filter((item) => item?.kind === "studio-diagnostics-review");
  if (diagnosticReviews.length > 1) stop("STUDIO_DIAGNOSTICS_AMBIGUOUS", "Native diagnostics contain ambiguous review records.");
  if (diagnosticReviews.length) {
    const review = diagnosticReviews[0];
    validateShape(object({
      schemaVersion: { const: "1.0.0" }, kind: { const: "studio-diagnostics-review" }, target: studioTargetSchema,
      issues: { type: "array", maxItems: 128 }
    }), review, "Studio diagnostics review");
    if (!result.studioTarget || !same(review.target, result.studioTarget)) stop("STUDIO_TARGET_SCOPE", "Diagnostic evidence is not bound to the reviewed target.");
    result.studioReview.diagnostics = handoff.security.channels.map((name) => assessStudioDiagnostics({
      issues: review.issues, accessPath: name === "microsoft365" ? "microsoft-365" : name
    }));
    if (result.studioReview.diagnostics.some((item) => item.status === "blocked")) reasons.push("A Blocking issue affects the intended native channel; resolve it without changing authentication, identity, audience or DLP.");
  }
  const approvalName = { pack: "localMutation", import: "draft", publish: "publication", export: "draft" }[operation];
  if (approvalName && handoff.approvals[approvalName].state === "verified") {
    const observation = handoff.approvals[approvalName];
    const reference = object({ path: { type: "string", minLength: 1, maxLength: 512 }, sha256: sha });
    const preparationReceipt = object({
      schemaVersion: { const: "1.0.0" }, runtime: { const: "native-copilot-studio" },
      scope: { const: "local-preview-only" }, acceptedRisk: { const: true },
      targetPath: { const: `copilot-studio/${handoff.agent.id}` },
      tooling: object({ pacVersion: { type: "string", pattern: "^[0-9]+\\.[0-9]+\\.[0-9]+$" }, helpSha256: sha }),
      spec: reference, guide: reference, inputs: array(reference, 512)
    });
    const previewOnly = approvalName === "localMutation" && handoff.intent.operation === "prepare"
      && observation.evidence.length > 0 && observation.evidence.map(read).every((receipt) => {
        try { validateShape(preparationReceipt, receipt, "Studio local preparation provenance"); }
        catch { return false; }
        return same(receipt.spec, handoff.artifacts.spec) && same(receipt.guide, handoff.artifacts.guide);
      });
    // A builder preview receipt is retained, never reused as current pack or remote-operation consent.
    if (!previewOnly) {
      const review = proof(observation, "studio-operation-approval");
      validateShape(object({ schemaVersion: { const: "1.0.0" }, kind: { const: "studio-operation-approval" }, approval: { type: "object" } }), review, "Studio operation approval");
      result.studioApprovals.push(review.approval);
    }
  }
  return result;
}

export function nativeStudioApprovalScope(request, handoff, target) {
  return {
    operation: request.copilotStudio.operation,
    targetSha256: digest(target ?? { cloud: request.cloud, operation: "local-pack" }),
    identitySha256: request.copilotStudio.identityEvidence?.sha256 ?? digest({ authentication: "not-required" }),
    audienceSha256: digest({ audience: request.audience, security: handoff.security }),
    mutationSha256: digest({
      blueprint: request.blueprint, release: request.release, mode: request.mode, configuration: request.copilotStudio,
      intent: handoff.intent, artifacts: handoff.artifacts, capabilities: handoff.capabilities
    })
  };
}

export function nativeStudioReadiness(context, now) {
  const review = context.studioTargetReview;
  if (review && (Date.parse(review.observedAt) > Date.parse(now) || Date.parse(review.expiresAt) <= Date.parse(now)
      || Date.parse(review.expiresAt) <= Date.parse(review.observedAt) || Date.parse(now) - Date.parse(review.observedAt) > 86_400_000)) {
    return "Native operator-reviewed target evidence expired or is not current; refresh read-only discovery without changing cloud, identity or security.";
  }
  for (const approval of context.studioApprovals ?? []) {
    validateStudioApproval(approval, nativeStudioApprovalScope(context.request, context.nativeStudioHandoff, context.studioTarget), { now });
  }
  return context.studioGateReasons?.[0] ?? null;
}

const approvalScopeSchema = object({
  operation: { enum: ["pack", "import", "publish", "export", "evaluate", "synchronize"] },
  targetSha256: sha, identitySha256: sha, audienceSha256: sha, mutationSha256: sha
});
export function validateStudioApproval(approval, expected, { now = new Date().toISOString() } = {}) {
  validateShape(approvalScopeSchema, expected, "Studio approval scope");
  validateShape(object({ scope: approvalScopeSchema, approved: { const: true }, grantedAt: timestamp, expiresAt: timestamp }), approval, "Studio approval");
  const at = Date.parse(now);
  if (!Number.isFinite(at) || !same(approval.scope, expected) || Date.parse(approval.grantedAt) > at
      || Date.parse(approval.expiresAt) <= at || Date.parse(approval.expiresAt) <= Date.parse(approval.grantedAt)) {
    stop("STUDIO_APPROVAL_SCOPE", "Native approval is expired or differs from the exact operation, target, identity, audience or mutation digest.");
  }
  return approval;
}

const connectionSchema = object({ connectionId: id, connectionReferenceName: id, connectorId: id });
const toolSchema = object({ botId: guid, botSchemaName: id, connections: array(connectionSchema, 32) });
const versionSchema = object({ kind: { enum: ["draft", "published"] }, id });
const evaluationBodySchema = object({
  evaluationRunName: { type: "string", minLength: 1, maxLength: 128, pattern: "^[a-zA-Z0-9][a-zA-Z0-9 ._-]*$" },
  mcsConnectionId: id, runOnPublishedBot: { type: "boolean" }, toolsConnections: array(toolSchema, 32)
});
const evaluationSpecSchema = object({
  target: studioTargetSchema, testSetId: guid, testSetSha256: sha, definitionSha256: sha,
  version: versionSchema, requiredToolBindings: array(toolSchema, 32), body: evaluationBodySchema,
  cases: { ...array(object({ id, expectedSubstring: { type: "string", minLength: 1, maxLength: 512 }, requiresSideEffect: { type: "boolean" } }), 100), minItems: 1 }
});
export function validateEvaluationRequest(spec) {
  validateShape(evaluationSpecSchema, spec, "Studio evaluation request");
  if (spec.body.runOnPublishedBot !== (spec.version.kind === "published") || !same(spec.body.toolsConnections, spec.requiredToolBindings)
      || spec.requiredToolBindings.some((item) => item.botId !== spec.target.botId)
      || new Set(spec.cases.map((item) => item.id)).size !== spec.cases.length) {
    stop("STUDIO_EVALUATION_BINDING", "Evaluation requires the exact version, stable test set, Microsoft Copilot Studio profile and required tool bindings.");
  }
  return spec;
}

export function validateEvaluationCallback(uri, target, runId) {
  validateShape(studioTargetSchema, target, "Studio evaluation target");
  validateShape(guid, runId, "Studio evaluation run ID");
  if (typeof uri !== "string" || uri.length > 1024 || /[%\\\s]/.test(uri)) {
    stop("STUDIO_CALLBACK_REJECTED", "Evaluation callback is not a bounded approved target URL.");
  }
  let url;
  try { url = new URL(uri); } catch { stop("STUDIO_CALLBACK_REJECTED", "Evaluation callback is not an approved target-bound HTTPS URL."); }
  const expected = `/copilotstudio/environments/${target.environmentId}/bots/${target.botId}/api/makerevaluation/testruns/${runId}`;
  if (url.protocol !== "https:"
      || url.hostname !== "api.powerplatform.com" || url.port || url.username || url.password || url.hash
      || url.pathname !== expected || url.search !== "?api-version=2024-10-01") {
    stop("STUDIO_CALLBACK_REJECTED", "Evaluation callback must match the approved Microsoft host and exact environment, bot and run path without redirects or extra query data.");
  }
  return url.href;
}

export function recordEvaluationAdmission(previous, response, spec) {
  validateEvaluationRequest(spec);
  if (previous !== null && previous !== undefined) stop("STUDIO_EVALUATION_REPLAY", "An admitted or ambiguous evaluation cannot issue another POST; reconcile the existing attempt.");
  const result = {
    schemaVersion: "1.0.0", requestSha256: digest(spec), testSetSha256: spec.testSetSha256,
    version: structuredClone(spec.version), status: "unknown", admission: "ambiguous",
    runId: null, callbackUri: null, retryAllowed: false
  };
  const body = response?.body;
  if (!body || typeof body !== "object") return result;
  try { validateShape(guid, body.runId, "Studio evaluation admission"); }
  catch { return result; }
  result.runId = body.runId;
  if (![200, 202].includes(response?.status)) return result;
  result.admission = "accepted";
  // Even HTTP 200/Completed admission is not proof that cases ran or passed.
  result.status = "pending";
  if (body.callbackUri !== undefined) {
    try { result.callbackUri = validateEvaluationCallback(body.callbackUri, spec.target, body.runId); }
    catch { result.status = "blocked"; }
  }
  return result;
}

const evaluationAttemptSchema = object({
  schemaVersion: { const: "1.0.0" }, requestSha256: sha, testSetSha256: sha, version: versionSchema,
  status: { enum: ["pending", "unknown", "blocked"] }, admission: { enum: ["ambiguous", "accepted"] },
  runId: { anyOf: [{ type: "null" }, guid] }, callbackUri: { type: ["string", "null"], maxLength: 1024 },
  retryAllowed: { const: false }
});

export function reconcileEvaluationRun(attempt, candidates, spec) {
  validateEvaluationRequest(spec);
  validateShape(evaluationAttemptSchema, attempt, "Studio evaluation attempt");
  if (attempt.callbackUri !== null) validateEvaluationCallback(attempt.callbackUri, spec.target, attempt.runId);
  if (!attempt || attempt.requestSha256 !== digest(spec) || !Array.isArray(candidates) || candidates.length > 100) {
    stop("STUDIO_EVALUATION_RECONCILIATION", "Reconciliation requires the original request and bounded read-only run evidence.");
  }
  const matches = candidates.filter((item) => item && (attempt.runId ? item.runId === attempt.runId
    : item.evaluationRunName === spec.body.evaluationRunName) && item.testSetId === spec.testSetId
      && item.testSetSha256 === spec.testSetSha256 && item.definitionSha256 === spec.definitionSha256
      && item.mcsConnectionId === spec.body.mcsConnectionId && same(item.toolsConnections, spec.body.toolsConnections)
      && same(item.version, spec.version) && same(item.target, spec.target));
  if (matches.length !== 1) return { ...attempt, status: "unknown", retryAllowed: false };
  const candidate = matches[0];
  validateShape(guid, candidate.runId, "Studio evaluation reconciliation");
  return { ...attempt, runId: candidate.runId, admission: "accepted", status: "pending", retryAllowed: false };
}

const layer = (status, code, evidenceSha256 = null) => ({ status, code, evidenceSha256 });
export const studioEvidenceSchema = object(Object.fromEntries(
  ["authored", "synchronized", "imported", "provisioned", "evaluated", "published", "channelVerified"].map((name) =>
    [name, object({ status: { enum: ["not-requested", "pending", "blocked", "failed", "unknown", "verified"] },
      code: { type: "string", pattern: "^[A-Z][A-Z0-9_]{0,79}$" }, evidenceSha256: { anyOf: [{ type: "null" }, sha] } })])
));

function functionalResponse(actual, expected) {
  return actual && typeof actual.responseText === "string" && actual.responseText.length >= 8 && actual.responseText.length <= 32000
    && !/\b(?:let.?s get you connected|sign[ -]?in|log[ -]?in|connect (?:your|an?|to|first)|authentication (?:is )?required|datalosspreventionviolation)\b/i.test(actual.responseText)
    && typeof expected.expectedSubstring === "string" && expected.expectedSubstring.length > 0
    && actual.responseText.includes(expected.expectedSubstring)
    && (!expected.requiresSideEffect || /^[a-f0-9]{64}$/.test(actual.sideEffectReadBackSha256 ?? ""));
}

export function assessEvaluationRun(spec, run) {
  validateEvaluationRequest(spec);
  if (!run || run.mcsConnectionId !== spec.body.mcsConnectionId || !same(run.toolsConnections, spec.requiredToolBindings)) return layer("blocked", "STUDIO_EVALUATION_PROFILE_UNVERIFIED");
  if (run.testSetId !== spec.testSetId || run.testSetSha256 !== spec.testSetSha256 || run.definitionSha256 !== spec.definitionSha256
      || !same(run.version, spec.version) || !same(run.target, spec.target)) return layer("blocked", "STUDIO_EVALUATION_SCOPE_MISMATCH");
  if (["Failed", "Abandoned", "Cancelled", "Deleted"].includes(run.state)) return layer("failed", "STUDIO_EVALUATION_FAILED");
  if (run.state !== "Completed" || run.executionState !== "Completed") return layer("pending", "STUDIO_EVALUATION_NOT_COMPLETED");
  try { validateShape(guid, run.runId, "Studio completed evaluation"); } catch { return layer("unknown", "STUDIO_EVALUATION_RUN_ID_REQUIRED"); }
  if (!Array.isArray(run.cases) || run.cases.length !== spec.cases.length || run.cases.length > 100
      || new Set(run.cases.map((item) => item.id)).size !== run.cases.length) return layer("unknown", "STUDIO_FUNCTIONAL_RESPONSES_REQUIRED");
  const functional = spec.cases.every((expected) => {
    const actual = run.cases.find((item) => item.id === expected.id);
    return functionalResponse(actual, expected) && actual.graderResult === "Pass"
      && typeof actual.quality === "string" && actual.quality.length <= 1024
      && !/^(?:N\/?A|unknown|not applicable|\s*)$/i.test(actual.quality.trim());
  });
  if (!functional) return layer("failed", "STUDIO_FUNCTIONAL_GATE_FAILED");
  rejectSecrets(run);
  return layer("verified", "STUDIO_EVALUATION_CASES_VERIFIED", digest(run));
}

export function verifyStudioSetting(expected, readBack) {
  if (!expected || !readBack || readBack.source !== "provider-readback") return layer("pending", "STUDIO_SERVER_READBACK_REQUIRED");
  if (/(?:authentication|accesscontrol|audience|channel|dlp|tool.?identity|connection.*mode)/i.test(expected.property ?? "")) {
    return layer("blocked", "STUDIO_SECURITY_SETTING_UNSUPPORTED");
  }
  const fields = { target: studioTargetSchema, property: id, value: { type: ["string", "boolean", "number", "null"], maxLength: 4096 } };
  try {
    validateShape(object(fields), expected, "Studio expected setting");
    validateShape(object({ ...fields, source: { const: "provider-readback" }, observedAt: timestamp }), readBack, "Studio setting observation");
  } catch { return layer("unknown", "STUDIO_SERVER_READBACK_REQUIRED"); }
  if (!same(expected.target, readBack.target) || expected.property !== readBack.property
      || !same(expected.value, readBack.value)) return layer("failed", "STUDIO_SERVER_SETTING_MISMATCH");
  validateShape(timestamp, readBack.observedAt, "Studio setting observation");
  rejectSecrets(readBack);
  return layer("verified", "STUDIO_SERVER_SETTING_VERIFIED", digest(readBack));
}

export function assertStudioSecurityInvariant(before, after) {
  try {
    validateShape(securityReviewSchema, before, "Studio security baseline");
    validateShape(securityReviewSchema, after, "Studio security intent");
  } catch { stop("STUDIO_SECURITY_SCOPE", "Native authentication, audience, channels, Invoker identity and DLP must retain the exact supported security scope."); }
  const keys = ["authenticationMode", "authenticationTrigger", "audience", "channels", "toolIdentity", "audienceSha256", "dlpPolicySha256"];
  if (!before || !after || keys.some((key) => before[key] === undefined || !same(before[key], after[key]))) {
    stop("STUDIO_SECURITY_SCOPE", "Authentication, audience, channels, Invoker identity and DLP must remain exactly plan-bound; diagnostic bypasses or expansion are unsupported.");
  }
  if (before.toolIdentity !== "Invoker" || before.authenticationMode !== "microsoft-single-tenant" || before.authenticationTrigger !== "always"
      || !["individual", "tenant", "private"].includes(before.audience) || !Array.isArray(before.channels)
      || !before.channels.length || before.channels.length > 2 || before.channels.some((name) => !["teams", "microsoft-365"].includes(name))
      || !/^[a-f0-9]{64}$/.test(before.dlpPolicySha256 ?? "")) {
    stop("STUDIO_SECURITY_SCOPE", "Only the reviewed private Microsoft-authenticated Invoker design is supported by this native contract.");
  }
  return true;
}

export function assessStudioDiagnostics({ issues, accessPath }) {
  validateShape({ enum: ["teams", "microsoft-365", "studio", "evaluation", "direct-engine", "direct-line"] }, accessPath, "Studio diagnostic access path");
  validateShape(array(object({
    severity: { enum: ["Blocking", "Warning", "Information"] },
    accessPath: { enum: ["teams", "microsoft-365", "studio", "evaluation", "direct-engine", "direct-line", "all"] },
    code: { type: "string", pattern: "^[A-Z][A-Z0-9_]{0,79}$" }
  }), 128), issues, "Studio diagnostics");
  const relevant = issues.filter((item) => ["all", accessPath].includes(item.accessPath));
  return { status: relevant.some((item) => item.severity === "Blocking") ? "blocked" : "pending",
    blocking: relevant.filter((item) => item.severity === "Blocking").map((item) => item.code),
    warnings: relevant.filter((item) => item.severity === "Warning").map((item) => item.code),
    scope: accessPath };
}

export function assessStudioEvidence(observations = {}) {
  const result = Object.fromEntries(["authored", "synchronized", "imported", "provisioned", "evaluated", "published", "channelVerified"]
    .map((name) => [name, layer("unknown", "STUDIO_EVIDENCE_REQUIRED")]));
  if (/^[a-f0-9]{64}$/.test(observations.authoredSha256 ?? "")) result.authored = layer("verified", "STUDIO_LOCAL_BYTES_VERIFIED", observations.authoredSha256);
  if (observations.operation === "import") result.imported = layer("pending", "STUDIO_IMPORT_READBACK_REQUIRED");
  if (observations.operation === "publish") result.published = layer("pending", "STUDIO_PUBLICATION_READBACK_REQUIRED");
  if (observations.setting) result.synchronized = verifyStudioSetting(observations.setting.expected, observations.setting.readBack);
  if (observations.evaluation) result.evaluated = assessEvaluationRun(observations.evaluation.spec, observations.evaluation.run);
  const publication = observations.publication;
  if (publication?.source === "provider-readback" && publication.expected && publication.actual) {
    const { expected, actual } = publication;
    const binding = { target: studioTargetSchema, definitionSha256: sha, securitySha256: sha };
    let valid = true;
    try {
      validateShape(object({ ...binding, previousPublishedOn: { anyOf: [{ type: "null" }, timestamp] }, operationStartedAt: timestamp }), expected, "Studio publication expectation");
      validateShape(object({ ...binding, publishedOn: timestamp, observedAt: timestamp }), actual, "Studio publication readback");
    } catch { valid = false; }
    const after = Date.parse(actual.publishedOn);
    if (valid && same(expected.target, actual.target) && expected.definitionSha256 === actual.definitionSha256
        && expected.securitySha256 === actual.securitySha256 && /^[a-f0-9]{64}$/.test(expected.definitionSha256 ?? "")
        && /^[a-f0-9]{64}$/.test(expected.securitySha256 ?? "") && Number.isFinite(after)
        && after > Date.parse(expected.previousPublishedOn ?? "1970-01-01T00:00:00Z")
        && after >= Date.parse(expected.operationStartedAt) && after <= Date.parse(actual.observedAt)) {
      result.published = layer("verified", "STUDIO_PUBLICATION_READBACK_VERIFIED", digest(publication));
    }
  }
  const channel = observations.channel;
  if (result.published.status === "verified" && channel?.source === "channel-observation"
      && channel.freshConversation === true && channel.publishedEvidenceSha256 === result.published.evidenceSha256
      && same(channel.target, publication.expected.target) && ["teams", "microsoft-365"].includes(channel.name)
      && Array.isArray(observations.intendedChannels) && observations.intendedChannels.includes(channel.name)
      && channel.audienceSha256 === observations.audienceSha256 && /^[a-f0-9]{64}$/.test(channel.audienceSha256 ?? "")
      && Array.isArray(channel.cases) && channel.cases.length > 0 && channel.cases.length <= 100
      && channel.cases.every((item) => item.passed === true && typeof item.requiresSideEffect === "boolean" && functionalResponse(item, item))) {
    rejectSecrets(channel);
    result.channelVerified = layer("verified", "STUDIO_CHANNEL_CASES_VERIFIED", digest(channel));
  }
  return validateShape(studioEvidenceSchema, result, "Studio layered evidence");
}
