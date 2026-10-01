import { createHash, randomUUID } from "node:crypto";
import { spawnSync } from "node:child_process";
import { constants } from "node:fs";
import { lstat, mkdir, open, readFile, readdir, realpath, rename, rm, writeFile } from "node:fs/promises";
import path from "node:path";

export const NATIVE_STUDIO_GUIDE = ".github/instructions/copilot-studio.instructions.md";
export const NATIVE_STUDIO_SCOPE = "copilot-studio/**,**/*.mcs.yml,**/*.mcs.yaml,scripts/*studio*.ts,tests/studio-*.test.ts";
export const NATIVE_STUDIO_STATES = Object.freeze(["not-requested", "pending", "blocked", "failed", "unknown", "verified"]);
const OPERATIONS = ["prepare", "clone", "pull", "push", "import", "evaluate", "troubleshoot", "publish"];
const APPROVALS = ["localMutation", "draft", "publication", "sharing", "cost", "security", "destructive"];
const LAYERS = ["authored", "localValidation", "synchronized", "imported", "provisioned", "evaluated", "publicationSubmitted", "serverPublished", "channelVerified"];
const CLOUDS = ["unknown", "Public", "GCC", "GCCHigh", "DoD"];
const CHANNELS = ["teams", "microsoft365", "studio-test-chat", "direct-line", "direct-engine", "custom-website"];
const HASH = /^[a-f0-9]{64}$/;
const ID = /^[a-z][a-z0-9]*(?:-[a-z0-9]+)*$/;
const SECRET = /-----BEGIN [\w ]*PRIVATE KEY-----|\bBearer\s+\S+|\b(?:password|client[_-]?secret|access[_-]?token|api[_-]?key|AccountKey|SharedAccessKey)\s*[:=]\s*["']?[A-Za-z0-9_+/.=-]{8,}|\bgh[oprsu]_[A-Za-z0-9]{20,}/i;

function object(value, required, optional, at) {
  if (!value || typeof value !== "object" || Array.isArray(value)) throw new Error(`${at} must be an object`);
  for (const key of required) if (!Object.hasOwn(value, key)) throw new Error(`${at}.${key} is required`);
  for (const key of Object.keys(value)) if (![...required, ...optional].includes(key)) throw new Error(`Unknown ${at} field: ${key}`);
}

function text(value, at, max = 2000) {
  if (typeof value !== "string" || !value.trim() || value.length > max || /[\u0000-\u0008\u000b\u000c\u000e-\u001f]/.test(value)) {
    throw new Error(`${at} must be nonempty text of at most ${max} characters`);
  }
  if (SECRET.test(value)) throw new Error(`${at} contains suspected credential material`);
}

function choice(value, allowed, at) {
  if (!allowed.includes(value)) throw new Error(`${at} must be one of ${allowed.join(", ")}`);
}

function list(value, at, validate, minimum = 0) {
  if (!Array.isArray(value) || value.length < minimum || value.length > 512) throw new Error(`${at} must contain ${minimum}-512 items`);
  if (new Set(value.map((item) => JSON.stringify(item))).size !== value.length) throw new Error(`${at} contains duplicate items`);
  value.forEach((item, index) => validate(item, `${at}[${index}]`));
}

function relative(value, at) {
  text(value, at, 512);
  if (value.includes("\\") || value.split("/").some((part) => !part || part === "." || part === ".." || /[<>:"|?*\u0000-\u001f]/.test(part) || /[. ]$/.test(part) || /^(?:con|prn|aux|nul|com[1-9]|lpt[1-9])(?:\.|$)/i.test(part))) {
    throw new Error(`${at} must be a safe project-relative path`);
  }
}

function reference(value, at) {
  object(value, ["path", "sha256"], [], at);
  relative(value.path, `${at}.path`);
  if (typeof value.sha256 !== "string" || !HASH.test(value.sha256)) throw new Error(`${at}.sha256 must be a SHA-256 digest`);
}

function observation(value, at, extra = []) {
  object(value, ["state", "evidence", "detail", ...extra], [], at);
  choice(value.state, NATIVE_STUDIO_STATES, `${at}.state`);
  text(value.detail, `${at}.detail`);
  list(value.evidence, `${at}.evidence`, reference, value.state === "verified" ? 1 : 0);
}

function agentIdentity(value, at) {
  object(value, ["id", "name", "schemaName", "publisherPrefix"], [], at);
  text(value.id, `${at}.id`, 64);
  if (!ID.test(value.id)) throw new Error(`${at}.id must be lowercase kebab-case`);
  text(value.name, `${at}.name`, 80);
  if (/^[\s@/-]|[\r\n\t]/.test(value.name)) throw new Error(`${at}.name must be a single-line display name, not an option or response-file argument`);
  if (!/^[a-z][a-z0-9]{1,7}$/.test(value.publisherPrefix)) throw new Error(`${at}.publisherPrefix must be a 2-8 character publisher prefix`);
  if (typeof value.schemaName !== "string" || !new RegExp(`^${value.publisherPrefix}_[A-Za-z][A-Za-z0-9_]{0,99}$`).test(value.schemaName)) {
    throw new Error(`${at}.schemaName must use the selected publisher prefix`);
  }
}

function targetContract(value, at) {
  object(value, ["cloud", "tenant", "environment", "dataverse", "bot", "solution"], [], at);
  choice(value.cloud, CLOUDS, `${at}.cloud`);
  for (const key of ["tenant", "environment", "dataverse", "bot"]) observation(value[key], `${at}.${key}`);
  object(value.solution, ["uniqueName", "readiness"], [], `${at}.solution`);
  if (value.solution.uniqueName !== null &&
    (typeof value.solution.uniqueName !== "string" || !/^[A-Za-z][A-Za-z0-9_]{0,99}$/.test(value.solution.uniqueName))) {
    throw new Error(`${at}.solution.uniqueName must be a valid solution name string or null`);
  }
  observation(value.solution.readiness, `${at}.solution.readiness`);
  if (value.cloud === "unknown" && ["tenant", "environment", "dataverse", "bot"].some((key) => value[key].state === "verified")) {
    throw new Error(`${at} cannot be verified in an unknown cloud`);
  }
}

function securityContract(value, at) {
  object(value, ["authentication", "audience", "channels", "toolIdentity", "policy", "requirements"], [], at);
  choice(value.authentication, ["unknown", "microsoft-single-tenant", "manual", "none", "multitenant"], `${at}.authentication`);
  choice(value.audience, ["unknown", "private", "tenant", "external"], `${at}.audience`);
  list(value.channels, `${at}.channels`, (item, location) => choice(item, CHANNELS, location));
  choice(value.toolIdentity, ["unknown", "invoker", "maker", "not-requested"], `${at}.toolIdentity`);
  observation(value.policy, `${at}.policy`);
  list(value.requirements, `${at}.requirements`, text);
  if (["private", "tenant"].includes(value.audience) && ["none", "multitenant"].includes(value.authentication)) {
    throw new Error(`${at} must preserve private/tenant authentication; audience expansion requires a separate design`);
  }
}

function capabilityContract(value, at) {
  object(value, ["id", "scope", "description", "sourcePaths", "implementation", "acceptance", "persistence", "gaps"], [], at);
  if (typeof value.id !== "string" || value.id.length > 64 || !ID.test(value.id)) throw new Error(`${at}.id is invalid`);
  choice(value.scope, ["required", "excluded"], `${at}.scope`);
  text(value.description, `${at}.description`);
  list(value.sourcePaths, `${at}.sourcePaths`, relative);
  observation(value.implementation, `${at}.implementation`);
  observation(value.acceptance, `${at}.acceptance`, ["criteria"]);
  list(value.acceptance.criteria, `${at}.acceptance.criteria`, text, 1);
  observation(value.persistence, `${at}.persistence`, ["mode", "operations"]);
  choice(value.persistence.mode, ["none", "session", "durable", "unknown"], `${at}.persistence.mode`);
  list(value.persistence.operations, `${at}.persistence.operations`, text);
  list(value.gaps, `${at}.gaps`, text);
  if (value.implementation.state === "verified" && !value.sourcePaths.length) throw new Error(`${at}: verified implementation requires real sourcePaths`);
  if (value.persistence.mode === "durable" && value.persistence.state === "verified" && !value.persistence.operations.length) {
    throw new Error(`${at}: a Connected tool is not a verified persistence operation`);
  }
}

/**
 * Validates only the portable contract. Evidence references are not attestations:
 * consumers must verify the referenced bytes, target, approvals and observations.
 * Importing this module or calling this function performs no IO.
 */
export function validateNativeStudioHandoff(value) {
  object(value, ["schemaVersion", "runtime", "intent", "agent", "target", "security", "capabilities", "artifacts", "approvals", "evidence", "complete", "gaps"], [], "native handoff");
  choice(value.schemaVersion, ["1.0.0"], "native handoff.schemaVersion");
  choice(value.runtime, ["native-copilot-studio"], "native handoff.runtime");
  object(value.intent, ["agent", "operation", "owner"], [], "intent");
  choice(value.intent.agent, ["new", "existing"], "intent.agent");
  choice(value.intent.operation, OPERATIONS, "intent.operation");
  choice(value.intent.owner, ["agent-deployment"], "intent.owner");
  agentIdentity(value.agent, "agent");
  targetContract(value.target, "target");
  securityContract(value.security, "security");
  list(value.capabilities, "capabilities", capabilityContract, 1);
  if (new Set(value.capabilities.map((item) => item.id)).size !== value.capabilities.length) throw new Error("Duplicate capability ID");
  const artifacts = value.artifacts;
  object(artifacts, ["guide", "spec", "authored", "connectedDirectory", "solutionMembership", "recovery"], [], "artifacts");
  reference(artifacts.guide, "artifacts.guide");
  if (artifacts.guide.path !== NATIVE_STUDIO_GUIDE) throw new Error(`artifacts.guide must reference ${NATIVE_STUDIO_GUIDE}`);
  reference(artifacts.spec, "artifacts.spec");
  list(artifacts.authored, "artifacts.authored", reference);
  const authored = new Set(artifacts.authored.map((item) => item.path));
  if (new Set([...authored].map((item) => item.toLowerCase())).size !== artifacts.authored.length) throw new Error("Duplicate authored path");
  if (artifacts.connectedDirectory !== null) relative(artifacts.connectedDirectory, "artifacts.connectedDirectory");
  observation(artifacts.solutionMembership, "artifacts.solutionMembership", ["components", "missing"]);
  list(artifacts.solutionMembership.components, "artifacts.solutionMembership.components", relative);
  list(artifacts.solutionMembership.missing, "artifacts.solutionMembership.missing", relative);
  if (artifacts.solutionMembership.state === "verified" && artifacts.solutionMembership.missing.length) throw new Error("Verified solution membership cannot have missing components");
  observation(artifacts.recovery, "artifacts.recovery", ["artifacts", "procedure"]);
  list(artifacts.recovery.artifacts, "artifacts.recovery.artifacts", reference);
  list(artifacts.recovery.procedure, "artifacts.recovery.procedure", text, 1);
  object(value.approvals, APPROVALS, [], "approvals");
  for (const key of APPROVALS) observation(value.approvals[key], `approvals.${key}`);
  object(value.evidence, LAYERS, [], "evidence");
  for (const key of LAYERS) observation(value.evidence[key], `evidence.${key}`);
  list(value.gaps, "gaps", text);
  if (value.evidence.authored.state === "verified" && !artifacts.authored.length) throw new Error("Verified authored evidence requires an actual source inventory");
  for (const capability of value.capabilities) {
    if (capability.sourcePaths.some((item) => !authored.has(item))) {
      throw new Error(`Capability ${capability.id} is missing its authored source`);
    }
  }
  if (typeof value.complete !== "boolean") throw new Error("complete must be boolean");
  if (value.complete && (
    value.gaps.length || value.target.cloud === "unknown" ||
    ["tenant", "environment", "dataverse", "bot"].some((key) => value.target[key].state !== "verified") ||
    [value.security.authentication, value.security.audience, value.security.toolIdentity].includes("unknown") || !value.security.channels.length ||
    value.security.policy.state !== "verified" || value.approvals.localMutation.state !== "verified" || value.approvals.publication.state !== "verified" ||
    (value.intent.operation === "push" && value.approvals.draft.state !== "verified") ||
    (value.security.audience === "external" && value.approvals.sharing.state !== "verified") ||
    ((["none", "multitenant"].includes(value.security.authentication) || value.security.toolIdentity === "maker") && value.approvals.security.state !== "verified") ||
    artifacts.recovery.state !== "verified" || !artifacts.recovery.artifacts.length ||
    (value.target.solution.uniqueName !== null && (value.target.solution.readiness.state !== "verified" || artifacts.solutionMembership.state !== "verified")) ||
    !["synchronized", "imported"].some((key) => value.evidence[key].state === "verified") ||
    (value.intent.agent === "new" && value.evidence.provisioned.state !== "verified") ||
    ["authored", "localValidation", "evaluated", "publicationSubmitted", "serverPublished", "channelVerified"].some((key) => value.evidence[key].state !== "verified") ||
    !value.capabilities.some((item) => item.scope === "required") ||
    value.capabilities.some((item) => item.scope === "required" && (item.gaps.length || item.implementation.state !== "verified" || item.acceptance.state !== "verified" || item.persistence.mode === "unknown" || (["session", "durable"].includes(item.persistence.mode) && item.persistence.state !== "verified")))
  )) throw new Error("Native completion requires verified target, security, capabilities, read-back, recovery, scoped approvals, evaluation, publication and channel evidence with no gaps");
  return value;
}

export function validateNativeStudioGuide(source) {
  if (typeof source !== "string") throw new Error("Native Studio guide must be text");
  const normalized = source.replace(/^\uFEFF/, "").replaceAll("\r\n", "\n");
  const match = /^---\n([\s\S]+?)\n---\n([\s\S]+)$/.exec(normalized);
  if (!match) throw new Error("Native Studio guide requires valid frontmatter and body");
  const fields = {};
  for (const line of match[1].split("\n")) {
    const entry = /^(name|description|applyTo): (.+)$/.exec(line);
    if (!entry || Object.hasOwn(fields, entry[1])) throw new Error("Native Studio guide has unsupported or duplicate frontmatter");
    let value = entry[2];
    if (value.startsWith('"')) {
      try { value = JSON.parse(value); } catch { throw new Error("Native Studio guide frontmatter must use valid quoted scalars"); }
    } else if (value.startsWith("'") && value.endsWith("'")) value = value.slice(1, -1).replaceAll("''", "'");
    fields[entry[1]] = value;
  }
  text(fields.name, "Native Studio guide name");
  text(fields.description, "Native Studio guide description");
  if (fields.applyTo !== NATIVE_STUDIO_SCOPE) throw new Error("Native Studio guide requires the narrow native applyTo scope");
  if (!/^# .+/m.test(match[2])) throw new Error("Native Studio guide requires its operational body");
  return source;
}

// Deliberately not a general YAML implementation. This bounded block subset is
// sufficient for static topics/metadata; unsupported syntax must go to native tooling.
export function parseNativeStudioSource(source) {
  if (typeof source !== "string" || Buffer.byteLength(source) > 1024 * 1024) throw new Error("Unsupported native source size");
  const lines = source.replace(/^\uFEFF/, "").replaceAll("\r\n", "\n").split("\n");
  let index = 0;
  let nodes = 0;
  const error = (message) => { throw new Error(`Unsupported native YAML syntax at line ${index + 1}: ${message}`); };
  const indentOf = (line) => {
    if (/^\s*\t/.test(line)) error("tab indentation");
    const indent = line.match(/^ */)[0].length;
    if (indent % 2) error("use two-space indentation");
    return indent;
  };
  const skip = () => {
    while (index < lines.length && (!lines[index].trim() || lines[index].trimStart().startsWith("#"))) index += 1;
  };
  const scalar = (raw) => {
    raw = raw.trim();
    if (raw.startsWith('"')) {
      try { const result = JSON.parse(raw); if (typeof result !== "string") error("expected a quoted scalar"); return result; }
      catch { error("invalid double-quoted scalar"); }
    }
    if (raw.startsWith("'")) {
      if (!/^'(?:[^']|'')*'$/.test(raw)) error("invalid single-quoted scalar");
      return raw.slice(1, -1).replaceAll("''", "'");
    }
    if (raw === "[]") return [];
    if (raw === "{}") return {};
    if (raw === "true") return true;
    if (raw === "false") return false;
    if (raw === "null") return null;
    if (/^-?(?:0|[1-9]\d*)(?:\.\d+)?$/.test(raw)) {
      const number = Number(raw);
      if (!Number.isFinite(number) || (Number.isInteger(number) && !Number.isSafeInteger(number))) error("quote numbers outside the supported numeric range");
      return number;
    }
    if (/^(?:true|false|null|~|yes|no|on|off|y|n)$/i.test(raw) || /^[+-]?(?:\d|\.\d)/.test(raw) ||
      /^[+-]?\.(?:inf|nan)$/i.test(raw) || /^(?:[-?:](?:\s|$)|[,#])/.test(raw)) {
      error("quote ambiguous or unsupported plain scalar text");
    }
    if (!raw || /^[&*!>{[\]}%|@`]/.test(raw) || /(?:^|\s)[&*!]|:(?:\s|$)|\s#|^---$|^\.\.\.$/.test(raw)) error("flow, tag, anchor, alias, folded scalar, directive or ambiguous plain scalar");
    return raw;
  };
  const parseBlock = (indent, depth = 0) => {
    if (depth > 32 || ++nodes > 4096) error("nesting or node limit exceeded");
    skip();
    const sequence = lines[index]?.slice(indent).startsWith("- ");
    const result = sequence ? [] : {};
    const pair = (record, content, currentIndent) => {
      const match = /^([A-Za-z_][A-Za-z0-9_.-]*):(?: (.*))?$/.exec(content);
      if (!match || ["__proto__", "constructor", "prototype"].includes(match[1])) error("unsupported mapping key");
      const [, key, raw] = match;
      if (Object.hasOwn(record, key)) error(`duplicate mapping key ${key}`);
      index += 1;
      if (raw === "|" || raw === "|-") {
        const body = [];
        while (index < lines.length) {
          const line = lines[index];
          if (line.trim() && indentOf(line) <= currentIndent) break;
          if (line.trim() && indentOf(line) < currentIndent + 2) error("block scalar indentation");
          body.push(line.trim() ? line.slice(currentIndent + 2) : "");
          index += 1;
        }
        record[key] = body.join("\n").replace(/\n+$/, "") + (raw === "|" ? "\n" : "");
      } else if (raw !== undefined && raw !== "") record[key] = scalar(raw);
      else {
        skip();
        if (index >= lines.length || indentOf(lines[index]) <= currentIndent) error("empty mapping values are outside the supported subset");
        if (indentOf(lines[index]) !== currentIndent + 2) error("unexpected mapping indentation");
        record[key] = parseBlock(currentIndent + 2, depth + 1);
      }
    };
    while (index < lines.length) {
      skip();
      if (index >= lines.length) break;
      const actual = indentOf(lines[index]);
      if (actual < indent) break;
      if (actual !== indent) error("unexpected indentation");
      const content = lines[index].slice(indent);
      if (sequence) {
        if (!content.startsWith("- ")) error("mixed sequence and mapping");
        const item = content.slice(2);
        if (/^[A-Za-z_][A-Za-z0-9_.-]*:/.test(item)) {
          const record = {};
          pair(record, item, indent + 2);
          skip();
          while (index < lines.length && indentOf(lines[index]) === indent + 2 && !lines[index].slice(indent + 2).startsWith("- ")) {
            pair(record, lines[index].slice(indent + 2), indent + 2);
            skip();
          }
          result.push(record);
        } else {
          result.push(scalar(item));
          index += 1;
        }
      } else {
        if (content.startsWith("- ")) error("mixed mapping and sequence");
        pair(result, content, indent);
      }
    }
    return result;
  };
  skip();
  if (index >= lines.length || indentOf(lines[index]) !== 0) error("missing root mapping");
  const result = parseBlock(0);
  skip();
  if (index !== lines.length || Array.isArray(result)) error("expected one root mapping");
  return result;
}

export function diagnoseNativeStudioSource(document, { operationSchema } = {}) {
  const diagnostics = [];
  const add = (code, message) => diagnostics.push({ code, message });
  const allowed = (value, keys, at) => {
    if (!value || typeof value !== "object" || Array.isArray(value)) { add("UNSUPPORTED_NATIVE_SHAPE", `${at} must be a mapping`); return false; }
    for (const key of Object.keys(value)) if (!keys.includes(key)) add("UNSUPPORTED_NATIVE_PROPERTY", `${at}.${key} is not a supported native schema property`);
    return true;
  };
  const requireText = (value, at, maximum = 2000) => {
    if (typeof value !== "string" || !value.trim() || value.length > maximum || SECRET.test(value)) add("INVALID_NATIVE_TEXT", `${at} requires bounded nonsecret text`);
  };
  const metadata = (value) => {
    if (allowed(value, ["componentName", "description"], "mcs.metadata")) {
      requireText(value.componentName, "mcs.metadata.componentName", 80);
      if (value.description !== undefined) requireText(value.description, "mcs.metadata.description", 1024);
    }
  };
  if (!document || typeof document !== "object" || Array.isArray(document)) {
    add("UNSUPPORTED_NATIVE_SHAPE", "Native source must have a supported document mapping");
  } else if (document.kind === "GptComponentMetadata") {
    allowed(document, ["kind", "mcs.metadata", "instructions"], "metadata");
    metadata(document["mcs.metadata"]);
    requireText(document.instructions, "instructions", 8000);
  } else if (document.kind === "AdaptiveDialog") {
    allowed(document, ["kind", "modelDescription", "beginDialog", "inputType", "outputType", "mcs.metadata"], "topic");
    if (document["mcs.metadata"] !== undefined) metadata(document["mcs.metadata"]);
    requireText(document.modelDescription, "modelDescription");
    const begin = document.beginDialog;
    if (allowed(begin, ["kind", "id", "intent", "actions"], "beginDialog")) {
      if (begin.kind !== "OnRecognizedIntent") add("UNSUPPORTED_NATIVE_SHAPE", "Only static OnRecognizedIntent topics are supported locally");
      requireText(begin.id, "beginDialog.id", 100);
      if (allowed(begin.intent, ["triggerQueries"], "beginDialog.intent")) {
        if (!Array.isArray(begin.intent.triggerQueries) || !begin.intent.triggerQueries.length) add("UNSUPPORTED_NATIVE_SHAPE", "A static topic needs explicit triggerQueries");
        else begin.intent.triggerQueries.forEach((query) => requireText(query, "triggerQueries", 500));
      }
      const ids = new Set([begin.id]);
      if (!Array.isArray(begin.actions) || !begin.actions.length) add("UNSUPPORTED_NATIVE_SHAPE", "A static topic needs at least one SendActivity node");
      else for (const action of begin.actions) {
        if (!allowed(action, ["kind", "id", "activity"], "action")) continue;
        if (action.kind !== "SendActivity") add("UNSUPPORTED_NATIVE_SHAPE", "Only static SendActivity nodes are supported; use native tooling for other nodes");
        requireText(action.id, "action.id", 100);
        if (ids.has(action.id)) add("DUPLICATE_NATIVE_NODE", "Topic node IDs must be unique");
        ids.add(action.id);
        requireText(action.activity, "action.activity", 8000);
        if (typeof action.activity === "string" && action.activity.startsWith("=")) add("UNSUPPORTED_NATIVE_SHAPE", "Dynamic Power Fx activities require platform schema validation");
      }
      for (const key of ["inputType", "outputType"]) {
        if (document[key] !== undefined && (!document[key] || Array.isArray(document[key]) || typeof document[key] !== "object" || Object.keys(document[key]).length)) {
          add("UNSUPPORTED_NATIVE_SHAPE", `${key}: parameterized topics are outside the static authoring subset`);
        }
      }
    }
  } else if (document.kind === "TaskDialog") {
    allowed(document, ["kind", "modelDisplayName", "modelDescription", "triggerCondition", "inputs", "action", "outputMode", "mcs.metadata"], "tool");
    if (document["mcs.metadata"] !== undefined) metadata(document["mcs.metadata"]);
    if (Array.isArray(document.inputs)) {
      for (const input of document.inputs) {
        if (!allowed(input, ["kind", "propertyName", "shouldPromptUser"], "tool input")) continue;
        if (input.kind !== "AutomaticTaskInput") add("UNSUPPORTED_NATIVE_SHAPE", "Only AutomaticTaskInput can be inspected");
        if (operationSchema?.required?.includes(input.propertyName) && input.shouldPromptUser === false) {
          add("REQUIRED_INPUT_PROMPTING", "A required AutomaticTaskInput must permit prompting, including on caller-only helpers");
        }
        if (operationSchema?.properties && !Object.hasOwn(operationSchema.properties, input.propertyName)) {
          add("INVALID_TOOL_PROPERTY", "The declared input is absent from the supplied operation schema");
        }
      }
    }
    add("NATIVE_TOOL_VALIDATION_REQUIRED", "Connector tools require verified operation schemas, identity, bindings and runtime tests; local static preparation does not implement them");
  } else add("UNSUPPORTED_NATIVE_SHAPE", "Supported local native source is limited to GptComponentMetadata and static AdaptiveDialog topics");
  return {
    diagnostics,
    invocation: document?.triggerCondition === "=false" || document?.triggerCondition === false ? "caller-only" : "unknown",
    componentState: "unknown", persistenceState: "unknown", serverSettingsState: "unknown"
  };
}

export function validateNativeStudioSpec(value) {
  object(value, ["schemaVersion", "runtime", "intent", "agent", "target", "security", "tooling", "source", "capabilities"], [], "native spec");
  choice(value.schemaVersion, ["1.0.0"], "native spec.schemaVersion");
  choice(value.runtime, ["native-copilot-studio"], "native spec.runtime");
  object(value.intent, ["agent", "operation"], [], "native spec.intent");
  choice(value.intent.agent, ["new", "existing"], "native spec.intent.agent");
  choice(value.intent.operation, OPERATIONS, "native spec.intent.operation");
  agentIdentity(value.agent, "native spec.agent");
  object(value.target, ["cloud", "solutionUniqueName"], [], "native spec.target");
  choice(value.target.cloud, CLOUDS, "native spec.target.cloud");
  if (value.target.solutionUniqueName !== null &&
    (typeof value.target.solutionUniqueName !== "string" || !/^[A-Za-z][A-Za-z0-9_]{0,99}$/.test(value.target.solutionUniqueName))) {
    throw new Error("native spec.target.solutionUniqueName must be a valid solution name string or null");
  }
  object(value.security, ["authentication", "audience", "channels", "toolIdentity", "requirements"], [], "native spec.security");
  securityContract({ ...value.security, policy: state("unknown", "No policy verification was supplied.") }, "native spec.security");
  object(value.tooling, ["pacVersion"], [], "native spec.tooling");
  if (typeof value.tooling.pacVersion !== "string" || !/^\d+\.\d+\.\d+$/.test(value.tooling.pacVersion)) throw new Error("native spec.tooling.pacVersion must be an exact three-part version");
  object(value.source, ["directory", "files"], [], "native spec.source");
  if (value.source.directory !== `copilot-studio/${value.agent.id}`) throw new Error("native spec.source.directory must be copilot-studio/<agent-id>");
  list(value.source.files, "native spec.source.files", (file, at) => {
    object(file, ["path", "target"], [], at);
    relative(file.path, `${at}.path`);
    relative(file.target, `${at}.target`);
    if (!/^topics\/[A-Za-z0-9][A-Za-z0-9_.-]*\.mcs\.ya?ml$/.test(file.target)) throw new Error(`${at}.target must be a static topics/*.mcs.yml or .mcs.yaml file`);
    if (file.path.startsWith(`${value.source.directory}/`) || file.path.startsWith(".skills-orchestrator/")) throw new Error(`${at}.path must preserve independently authored source outside the managed destination`);
  });
  if (new Set(value.source.files.map((file) => file.target.toLowerCase())).size !== value.source.files.length) throw new Error("Native source targets must be unique ignoring case");
  list(value.capabilities, "native spec.capabilities", (capability, at) => {
    object(capability, ["id", "scope", "description", "sourcePaths", "acceptanceCriteria", "persistence"], [], at);
    object(capability.persistence, ["mode", "operations"], [], `${at}.persistence`);
    capabilityContract({
      id: capability.id, scope: capability.scope, description: capability.description, sourcePaths: capability.sourcePaths,
      implementation: state("pending", "Not yet authored."),
      acceptance: { ...state("unknown", "Not executed."), criteria: capability.acceptanceCriteria },
      persistence: { ...state("unknown", "Not verified."), ...capability.persistence }, gaps: []
    }, at);
  }, 1);
  if (new Set(value.capabilities.map((item) => item.id)).size !== value.capabilities.length) throw new Error("Native capability IDs must be unique");
  return value;
}

function stable(value) {
  if (Array.isArray(value)) return `[${value.map(stable).join(",")}]`;
  if (value && typeof value === "object") return `{${Object.keys(value).sort().map((key) => `${JSON.stringify(key)}:${stable(value[key])}`).join(",")}}`;
  return JSON.stringify(value);
}

function digest(value) { return createHash("sha256").update(value).digest("hex"); }
function json(value) { return `${JSON.stringify(value, null, 2)}\n`; }
function state(status, detail, evidence = []) { return { state: status, evidence, detail }; }

function parseJson(source, label) {
  const content = Buffer.isBuffer(source) ? source.toString("utf8") : source;
  let value;
  try { value = JSON.parse(content); }
  catch { throw new Error(`Invalid ${label} JSON; inspect syntax locally. Input values are suppressed.`); }
  const tokens = content.match(/"(?:\\[\s\S]|[^"\\])*"|true|false|null|-?(?:0|[1-9]\d*)(?:\.\d+)?(?:[eE][+-]?\d+)?|[{}\[\]:,]/g);
  let index = 0;
  const walk = (depth = 0) => {
    if (depth > 32) throw new Error(`Invalid ${label} JSON: nesting exceeds the supported limit`);
    const token = tokens[index++];
    if (token === "{") {
      const keys = new Set();
      while (tokens[index] !== "}") {
        const key = JSON.parse(tokens[index++]);
        if (keys.has(key)) throw new Error(`Invalid ${label} JSON: duplicate object key`);
        keys.add(key);
        index += 1;
        walk(depth + 1);
        if (tokens[index] === ",") index += 1;
      }
      index += 1;
    } else if (token === "[") {
      while (tokens[index] !== "]") {
        walk(depth + 1);
        if (tokens[index] === ",") index += 1;
      }
      index += 1;
    }
  };
  walk();
  return value;
}

class PreparationBlocked extends Error {
  constructor(code, message) { super(message); this.code = code; }
}

async function safePath(root, requested) {
  relative(requested, "native managed path");
  let current = root;
  for (const part of requested.split("/")) {
    current = path.join(current, part);
    try {
      const details = await lstat(current);
      if (details.isSymbolicLink()) throw new Error("Symbolic links are prohibited in native source, guidance, evidence and destination paths");
    } catch (error) { if (error.code === "ENOENT") break; throw error; }
  }
  return path.join(root, ...requested.split("/"));
}

function projectRelative(root, file) {
  if (typeof file !== "string" || !file) throw new Error("Use --native-spec with a project-relative reviewed JSON specification");
  const absolute = path.resolve(root, file);
  const name = path.relative(root, absolute).replaceAll("\\", "/");
  relative(name, "native input");
  return name;
}

async function readLocal(root, name) {
  const file = await safePath(root, name);
  const handle = await open(file, constants.O_RDONLY | (constants.O_NOFOLLOW ?? 0));
  try {
    const info = await handle.stat();
    if (!info.isFile() || info.size > 2 * 1024 * 1024) throw new Error("Native input must be a bounded regular file");
    const bytes = await handle.readFile();
    return { bytes, ref: { path: name, sha256: digest(bytes) } };
  } finally { await handle.close(); }
}

async function atomic(root, name, content) {
  const target = await safePath(root, name);
  await mkdir(path.dirname(target), { recursive: true });
  const pending = `${target}.pending-${randomUUID()}`;
  try {
    await writeFile(pending, content, { flag: "wx", mode: 0o600 });
    await rename(pending, target);
  } finally { await rm(pending, { force: true }); }
}

async function readGuide(root) {
  try {
    const loaded = await readLocal(root, NATIVE_STUDIO_GUIDE);
    validateNativeStudioGuide(loaded.bytes.toString("utf8"));
    return loaded;
  } catch (error) { throw new Error(`Native Studio guide must be read and validated before requirements or native preparation: ${error.message}`); }
}

async function missingDestination(root, name) {
  const target = await safePath(root, name);
  try { await lstat(target); throw new Error("Native destination already exists; preserve it and use a separately reviewed existing-agent workflow"); }
  catch (error) { if (error.code !== "ENOENT") throw error; }
  return target;
}

async function inspectManagedPath(root, name) {
  let current = await safePath(root, name);
  const suffix = [];
  while (true) {
    try {
      const resolved = await realpath(current);
      const details = suffix.length ? null : await lstat(current, { bigint: true });
      return {
        canonical: path.join(resolved, ...suffix).toLowerCase(),
        fileIdentity: details?.isFile() && details.ino > 0n ? `${details.dev}:${details.ino}` : null
      };
    } catch (error) {
      if (error.code !== "ENOENT" || path.dirname(current) === current) throw error;
      suffix.unshift(path.basename(current));
      current = path.dirname(current);
    }
  }
}

async function preflightNativeOutputs(root, command, blueprintPath, loaded, planPath) {
  const outputs = command === "apply"
    ? ["reports/agent-builder-result.json"]
    : ["reports/agent-builder-plan.json", "reports/agent-builder-plan.md", "reports/agent-builder-result.json"];
  if (command === "build") outputs.push(blueprintPath);
  outputs.push(".skills-orchestrator/agent-builder.lock", loaded.spec.source.directory);
  if (command !== "apply") outputs.push(".skills-orchestrator/agent-builder", ".skills-orchestrator/agent-builder/native-preview");
  else await inspectManagedPath(root, ".skills-orchestrator/agent-builder");
  const inputs = [loaded.guideRef.path, loaded.specRef.path, ...loaded.inputs.map((item) => item.path)];
  if (command !== "build") inputs.push(blueprintPath);
  if (planPath) inputs.push(planPath);
  const destinations = [];
  for (const name of outputs) destinations.push(await inspectManagedPath(root, name));
  for (const name of new Set(inputs)) {
    const input = await inspectManagedPath(root, name);
    if (destinations.some((output) => input.canonical === output.canonical ||
      input.canonical.startsWith(`${output.canonical}${path.sep}`) || output.canonical.startsWith(`${input.canonical}${path.sep}`) ||
      (input.fileIdentity !== null && input.fileIdentity === output.fileIdentity))) {
      throw new Error("Native input aliases or overlaps a managed destination; relocate the original input before preparation");
    }
  }
}

async function contractDigest() {
  const root = path.resolve(import.meta.dirname, "..", "..", "..", "..");
  const files = [
    ".github/skills/agent-builder/scripts/native-studio.mjs", ".github/skills/agent-builder/scripts/agent-builder.mjs",
    "schemas/copilot-studio-handoff.schema.json", "schemas/agent-blueprint.schema.json",
    "schemas/agent-builder-plan.schema.json", "schemas/agent-builder-result.schema.json"
  ];
  const values = [];
  for (const file of files) values.push({ path: file, sha256: digest(await readFile(path.join(root, ...file.split("/")))) });
  return digest(stable(values));
}

function invokePac(args, cwd) {
  const executable = process.env.PSO_PAC_PATH || "pac";
  const nodeShim = /\.(?:mjs|cjs)$/.test(executable);
  const result = spawnSync(nodeShim ? process.execPath : executable, nodeShim ? [executable, ...args] : args, {
    cwd, encoding: "utf8", windowsHide: true, shell: false, timeout: 30000, maxBuffer: 2 * 1024 * 1024
  });
  if (result.error?.code === "ENOENT") throw new PreparationBlocked("PAC_NOT_INSTALLED", "The pinned PAC executable is unavailable; install/configure it separately, then replan. No installation or authentication was attempted.");
  if (result.error || result.status !== 0) {
    const sourceIndex = args.indexOf("--project-dir");
    const recovery = sourceIndex < 0 ? "" : ` Partial source is preserved at ${path.relative(cwd, args[sourceIndex + 1]).replaceAll("\\", "/")}.`;
    throw new PreparationBlocked("PAC_LOCAL_COMMAND_FAILED", `PAC local ${args[0] === "--version" ? "version probe" : args.includes("help") ? "help probe" : "initialization"} failed. Inspect sanitized local diagnostics; raw CLI output was not copied to reports.${recovery}`);
  }
  return result.stdout ?? "";
}

function probePac(root, version) {
  if (version !== "2.12.2") throw new PreparationBlocked("UNSUPPORTED_PAC_VERSION", "This bounded authoring adapter supports reviewed PAC 2.12.2 only; qualify another version before extending it.");
  const output = invokePac(["--version"], root);
  const installed = output.match(/^(?:Microsoft PowerPlatform CLI Version:\s*|Version:\s*)?(\d+\.\d+\.\d+)(?:\+[A-Za-z0-9.-]+)?(?:\s|$)/m)?.[1];
  if (installed !== version) throw new PreparationBlocked("PAC_VERSION_MISMATCH", "Installed PAC does not match the reviewed exact version; no initialization was attempted.");
  const help = invokePac(["copilot", "init", "help"], root);
  for (const flag of ["--name", "--publisher-prefix", "--schema-name", "--project-dir"]) {
    if (!help.includes(flag)) throw new PreparationBlocked("UNSUPPORTED_PAC_INIT", "Installed PAC help does not advertise the bounded native local-init arguments");
  }
  return { pacVersion: installed, helpSha256: digest(help) };
}

function validateNativeSourceBytes(bytes) {
  if (SECRET.test(bytes.toString("utf8"))) {
    throw new PreparationBlocked("NATIVE_SOURCE_CREDENTIAL_MATERIAL", "Native source contains suspected credential material; original source is preserved for local review");
  }
}

async function snapshotDirectory(root, directory, { allowHandoff = false } = {}) {
  const files = [];
  const documents = new Map();
  const names = new Set();
  const walk = async (relativeDirectory = "") => {
    const location = await safePath(root, relativeDirectory ? `${directory}/${relativeDirectory}` : directory);
    const entries = await readdir(location, { withFileTypes: true });
    for (const entry of entries.sort((a, b) => a.name.localeCompare(b.name, "en"))) {
      const relativeName = relativeDirectory ? `${relativeDirectory}/${entry.name}` : entry.name;
      relative(relativeName, "native source path");
      if (entry.isSymbolicLink()) throw new PreparationBlocked("NATIVE_SOURCE_LINK", "Native source contains a symbolic link; the original workspace is preserved");
      if (entry.isDirectory()) {
        if (entry.name.startsWith(".")) throw new PreparationBlocked("UNSUPPORTED_CONNECTED_SOURCE", "Generated binding/cache directories require supported connected-workspace handling; they are preserved, never fabricated or removed");
        await walk(relativeName);
      } else if (entry.isFile()) {
        if (names.has(relativeName.toLowerCase())) throw new PreparationBlocked("NATIVE_PATH_COLLISION", "Native source paths collide ignoring case");
        names.add(relativeName.toLowerCase());
        const loaded = await readLocal(root, `${directory}/${relativeName}`);
        if (/\.mcs\.ya?ml$/.test(relativeName)) {
          validateNativeSourceBytes(loaded.bytes);
          let document;
          try { document = parseNativeStudioSource(loaded.bytes.toString("utf8")); }
          catch { throw new PreparationBlocked("UNSUPPORTED_NATIVE_YAML", `Native source ${relativeName} uses syntax outside the bounded block subset; preserve it and validate through supported native tooling`); }
          const diagnostics = diagnoseNativeStudioSource(document).diagnostics;
          if (diagnostics.length) throw new PreparationBlocked(diagnostics[0].code, `${relativeName}: ${diagnostics[0].message}`);
          documents.set(relativeName, document);
        } else if (!(allowHandoff && relativeName === "native-handoff.json") && !["README.md", ".gitignore"].includes(relativeName)) {
          throw new PreparationBlocked("UNSUPPORTED_NATIVE_SHAPE", `Native source ${relativeName} is outside the supported local authoring shape; preserve it and use the deployment owner's supported workflow`);
        }
        files.push({ path: relativeName, sha256: loaded.ref.sha256 });
        if (files.length > 256) throw new PreparationBlocked("NATIVE_SOURCE_LIMIT", "Native preparation exceeds the bounded source inventory");
      } else throw new PreparationBlocked("UNSUPPORTED_NATIVE_FILE", "Native source must contain regular files and directories only");
    }
  };
  try { await walk(); }
  catch (error) {
    if (error instanceof PreparationBlocked) error.message += ` Workspace preserved at ${directory}.`;
    throw error;
  }
  if ([...documents.values()].filter((item) => item.kind === "GptComponentMetadata").length !== 1) throw new PreparationBlocked("UNSUPPORTED_NATIVE_SHAPE", "Native preparation requires exactly one supported GPT metadata document; no metadata or bindings are invented");
  return { files: files.sort((a, b) => a.path.localeCompare(b.path, "en")), documents };
}

function makeHandoff(spec, specRef, guideRef, snapshot, previewDirectory, receipt) {
  const authored = snapshot.files.map((item) => ({ path: `${spec.source.directory}/${item.path}`, sha256: item.sha256 }));
  const preview = snapshot.files.map((item) => ({ path: `${previewDirectory}/${item.path}`, sha256: item.sha256 }));
  const capabilities = spec.capabilities.map((item) => {
    const supported = item.sourcePaths.length > 0 && item.sourcePaths.every((name) => snapshot.documents.get(name)?.kind === "AdaptiveDialog");
    const excluded = item.scope === "excluded";
    const implementation = excluded ? "not-requested" : supported && !["durable", "unknown"].includes(item.persistence.mode) ? "verified" : "blocked";
    const gaps = excluded ? ["Explicitly excluded from this preparation."] : [
      ...(supported ? [] : ["No complete supported native topic/operation source implements this capability."]),
      ...(item.persistence.mode === "durable" ? ["No durable store or authenticated save/read-back/new-session operation has been implemented or verified."] : []),
      "Acceptance has not run in the intended Studio runtime or channel."
    ];
    return {
      id: item.id, scope: item.scope, description: item.description,
      sourcePaths: item.sourcePaths.filter((name) => snapshot.documents.has(name)).map((name) => `${spec.source.directory}/${name}`),
      implementation: state(implementation, implementation === "verified" ? "Only the bounded static native topic implementation was validated locally; platform acceptance is separate." : "Unsupported or excluded implementation remains explicit.", implementation === "verified" ? preview.filter((file) => item.sourcePaths.some((name) => file.path === `${previewDirectory}/${name}`)) : []),
      acceptance: { ...state(excluded ? "not-requested" : "unknown", "No functional acceptance or fresh-channel conversation was executed."), criteria: item.acceptanceCriteria },
      persistence: { ...state(item.persistence.mode === "none" ? "not-requested" : "unknown", "Connections and local source do not prove persistence."), ...item.persistence },
      gaps
    };
  });
  const handoff = {
    schemaVersion: "1.0.0", runtime: "native-copilot-studio",
    intent: { ...spec.intent, owner: "agent-deployment" }, agent: spec.agent,
    target: {
      cloud: spec.target.cloud,
      ...Object.fromEntries(["tenant", "environment", "dataverse", "bot"].map((key) => [key, state("unknown", "No target discovery was performed; resolve through approved private operator configuration.")])),
      solution: { uniqueName: spec.target.solutionUniqueName, readiness: state("unknown", "A requested name is not verified solution existence or membership.") }
    },
    security: { ...spec.security, policy: state("unknown", "Authentication, audience, Invoker identity, DLP and channels require independent server verification.") },
    capabilities,
    artifacts: {
      guide: guideRef, spec: specRef, authored, connectedDirectory: null,
      solutionMembership: { ...state("unknown", "Local files are not proof of solution membership or recovery export coverage."), components: authored.map((item) => item.path), missing: [] },
      recovery: {
        ...state("verified", "Local input and reviewed preview source are preserved; no live rollback is implied.", [receipt]),
        artifacts: preview,
        procedure: ["Keep the original authored input and reviewed preview bytes.", "Apply only to a new destination; failed installs are retained under their transaction and removed from the canonical location.", "Any server recovery, import or publication requires a separate reviewed deployment-owner approval."]
      }
    },
    approvals: Object.fromEntries(APPROVALS.map((key) => [key, key === "localMutation"
      ? state("verified", "Explicit --accept-risk covered local preview preparation only; canonical apply and all remote operations have separate gates.", [receipt])
      : state("not-requested", "Local preparation grants no approval for this operation.")])),
    evidence: Object.fromEntries(LAYERS.map((key) => [key, ["authored", "localValidation"].includes(key)
      ? state("verified", key === "authored" ? "Pinned PAC produced the reviewed local preview; canonical installation is separately reviewed." : "Bounded static metadata/topic structural checks passed; no complete YAML or platform validation is claimed.", preview)
      : state("not-requested", "No remote synchronization, provisioning, evaluation, publication or channel operation was performed.")])),
    complete: false,
    gaps: [
      ...(capabilities.some((item) => item.scope === "required" && item.implementation.state === "blocked")
        ? ["Required capabilities lack supported operations or stores; every specific gap remains recorded in capabilities."] : []),
      "Required capability acceptance has not run in the intended Studio runtime or channel.",
      "Target, policy, connections, evaluation, server properties, publication and intended channels remain unverified."
    ]
  };
  return validateNativeStudioHandoff(handoff);
}

async function loadInputs(root, specRef, expectedGuide) {
  const guide = await readGuide(root);
  if (expectedGuide && (expectedGuide.path !== guide.ref.path || expectedGuide.sha256 !== guide.ref.sha256)) throw new Error("Native guide changed after review; build a fresh native plan");
  const loaded = await readLocal(root, specRef.path);
  if (specRef.sha256 && specRef.sha256 !== loaded.ref.sha256) throw new Error("Native spec changed after review; build a fresh native plan");
  let spec;
  try { spec = validateNativeStudioSpec(parseJson(loaded.bytes, "native spec")); }
  catch (error) { throw new Error(`Invalid native spec: ${error.message}`); }
  const inputs = [];
  for (const file of spec.source.files) {
    const input = await readLocal(root, file.path);
    validateNativeSourceBytes(input.bytes);
    if (!inputs.some((item) => item.path === input.ref.path)) inputs.push(input.ref);
  }
  return { spec, specRef: loaded.ref, guideRef: guide.ref, inputs };
}

async function blockedResult(root, spec, error, blueprintSha256 = null) {
  const result = {
    schemaVersion: "2.0.0", completedAt: new Date().toISOString(),
    runtime: "native-copilot-studio", status: "blocked", action: "prepare", targetPath: spec.source.directory,
    blueprintSha256, planSha256: null, handoff: null, transactionId: null, complete: false,
    diagnostics: [{ code: error.code || "NATIVE_PREPARATION_BLOCKED", message: error.message }]
  };
  await atomic(root, "reports/agent-builder-result.json", json(result));
  return result;
}

async function nativePlan(root, blueprintPath, blueprintBytes, loaded) {
  const { spec, specRef, guideRef, inputs } = loaded;
  if (spec.intent.agent !== "new" || spec.intent.operation !== "prepare") throw new PreparationBlocked("DEPLOYMENT_OWNER_REQUIRED", "Existing-agent clone/pull/push and all remote operations require a separately reviewed agent-deployment plan; local builder performed none.");
  await missingDestination(root, spec.source.directory);
  const tooling = probePac(root, spec.tooling.pacVersion);
  const previewRoot = `.skills-orchestrator/agent-builder/native-preview/NP-${randomUUID()}`;
  const previewDirectory = `${previewRoot}/source`;
  await mkdir(await safePath(root, previewDirectory), { recursive: true, mode: 0o700 });
  invokePac(["copilot", "init", "--name", spec.agent.name, "--publisher-prefix", spec.agent.publisherPrefix,
    "--schema-name", spec.agent.schemaName, "--project-dir", await safePath(root, previewDirectory)], root);
  await snapshotDirectory(root, previewDirectory);
  for (const file of spec.source.files) {
    const destination = `${previewDirectory}/${file.target}`;
    const target = await safePath(root, destination);
    try { await lstat(target); throw new PreparationBlocked("NATIVE_SOURCE_CONFLICT", "Authored source would replace a PAC-generated file; preserve both and resolve the conflict deliberately"); }
    catch (error) { if (error.code !== "ENOENT") throw error; }
    const source = await readLocal(root, file.path);
    if (source.ref.sha256 !== inputs.find((item) => item.path === file.path).sha256) throw new Error("Native source changed during preparation");
    await mkdir(path.dirname(target), { recursive: true });
    await writeFile(target, source.bytes, { flag: "wx", mode: 0o600 });
  }
  const snapshot = await snapshotDirectory(root, previewDirectory);
  const preparationPath = `${previewRoot}/preparation.json`;
  const receiptContent = json({ schemaVersion: "1.0.0", runtime: "native-copilot-studio", scope: "local-preview-only", acceptedRisk: true,
    targetPath: spec.source.directory, tooling, spec: specRef, guide: guideRef, inputs });
  await atomic(root, preparationPath, receiptContent);
  const receipt = { path: preparationPath, sha256: digest(receiptContent) };
  const handoff = makeHandoff(spec, specRef, guideRef, snapshot, previewDirectory, receipt);
  const handoffContent = json(handoff);
  await atomic(root, `${previewDirectory}/native-handoff.json`, handoffContent);
  const plan = {
    schemaVersion: "2.0.0", runtime: "native-copilot-studio", generatedAt: new Date().toISOString(), status: "review-required",
    projectRoot: root, blueprintPath, blueprintSha256: digest(blueprintBytes), guide: guideRef, nativeSpec: specRef,
    targetPath: spec.source.directory, targetState: "missing", action: "create", previewDirectory,
    inputs, files: [...snapshot.files, { path: "native-handoff.json", sha256: digest(handoffContent) }].sort((a, b) => a.path.localeCompare(b.path, "en")),
    tooling, preparation: receipt, handoff, handoffSha256: digest(handoffContent),
    contractSha256: await contractDigest(),
    warnings: ["This plan installs local native preparation only, not a deployed or functionally complete agent.",
      ...handoff.capabilities.filter((item) => item.scope === "required").flatMap((item) => item.gaps.map((gap) => `${item.id}: ${gap}`)), ...handoff.gaps]
  };
  plan.planSha256 = digest(stable(plan));
  await atomic(root, `${previewRoot}/plan.json`, json(plan));
  await atomic(root, "reports/agent-builder-plan.json", json(plan));
  await atomic(root, "reports/agent-builder-plan.md", [
    "# Native Studio Agent Builder Plan", "", `Action: create \`${plan.targetPath}\` (local preparation only)`,
    `Plan SHA-256: \`${plan.planSha256}\``, `Guide SHA-256: \`${guideRef.sha256}\``, `Spec SHA-256: \`${specRef.sha256}\``,
    "", "## Reviewed Files", ...plan.files.map((file) => `- ${file.path}: ${file.sha256}`),
    "", "## Limitations and Approval", ...plan.warnings.map((warning) => `- ${warning}`),
    "- Apply requires a separate explicit --accept-risk and unchanged guide, spec, source, plan and destination.",
    "- Follow .github/skills/agent-builder/references/deployment-handoff.md and the native guide for a separately approved agent-deployment handoff.", ""
  ].join("\n"));
  return plan;
}

async function reviewNativePlan(root, blueprintPath, planPath, loaded, blueprintBytes) {
  const planFile = await readLocal(root, planPath);
  const plan = parseJson(planFile.bytes, "native plan");
  object(plan, ["schemaVersion", "runtime", "generatedAt", "status", "projectRoot", "blueprintPath", "blueprintSha256",
    "guide", "nativeSpec", "targetPath", "targetState", "action", "previewDirectory", "inputs", "files", "tooling",
    "preparation", "handoff", "handoffSha256", "contractSha256", "warnings", "planSha256"], [], "native plan");
  if (plan.schemaVersion !== "2.0.0" || plan.runtime !== "native-copilot-studio" || plan.status !== "review-required") throw new Error("Native apply requires a reviewed native plan 2.0.0, not a legacy plan");
  const { planSha256, ...body } = plan;
  if (digest(stable(body)) !== planSha256) throw new Error("Native plan digest changed after review");
  if (plan.contractSha256 !== await contractDigest()) throw new Error("Native builder or schema contract changed after review");
  if (plan.projectRoot !== root || plan.blueprintPath !== blueprintPath || plan.blueprintSha256 !== digest(blueprintBytes)) throw new Error("Native blueprint or project changed after review");
  if (stable(plan.guide) !== stable(loaded.guideRef) || stable(plan.nativeSpec) !== stable(loaded.specRef) || stable(plan.inputs) !== stable(loaded.inputs)) throw new Error("Native guide, spec or authored source changed after review");
  if (plan.targetPath !== loaded.spec.source.directory || plan.targetState !== "missing" || plan.action !== "create") throw new Error("Native plan destination or action is invalid");
  if (!/^\.skills-orchestrator\/agent-builder\/native-preview\/NP-[a-f0-9-]{36}\/source$/.test(plan.previewDirectory)) throw new Error("Native preview directory is invalid");
  const archived = await readLocal(root, `${plan.previewDirectory.slice(0, -7)}/plan.json`);
  if (archived.ref.sha256 !== planFile.ref.sha256) throw new Error("Native plan changed from its immutable reviewed copy");
  reference(plan.preparation, "native plan.preparation");
  if (plan.preparation.path !== `${plan.previewDirectory.slice(0, -7)}/preparation.json`) throw new Error("Native preparation receipt path is invalid");
  const receipt = await readLocal(root, plan.preparation.path);
  if (receipt.ref.sha256 !== plan.preparation.sha256) throw new Error("Native preparation receipt changed after review");
  const snapshot = await snapshotDirectory(root, plan.previewDirectory, { allowHandoff: true });
  if (stable(snapshot.files) !== stable(plan.files)) throw new Error("Native staged source changed after review");
  for (const file of loaded.spec.source.files) {
    if (snapshot.files.find((item) => item.path === file.target)?.sha256 !== loaded.inputs.find((item) => item.path === file.path)?.sha256) {
      throw new Error("Native staged source no longer matches the preserved authored input");
    }
  }
  const nativeOnly = { ...snapshot, files: snapshot.files.filter((item) => item.path !== "native-handoff.json") };
  const expectedHandoff = makeHandoff(loaded.spec, loaded.specRef, loaded.guideRef, nativeOnly, plan.previewDirectory, plan.preparation);
  validateNativeStudioHandoff(plan.handoff);
  if (stable(plan.handoff) !== stable(expectedHandoff) || digest(json(expectedHandoff)) !== plan.handoffSha256 ||
    snapshot.files.find((item) => item.path === "native-handoff.json")?.sha256 !== plan.handoffSha256) throw new Error("Native handoff or evidence changed after review");
  return plan;
}

async function applyNative(root, blueprintPath, planPath, loaded, blueprintBytes) {
  let plan = await reviewNativePlan(root, blueprintPath, planPath, loaded, blueprintBytes);
  const target = await missingDestination(root, plan.targetPath);
  const lockPath = await safePath(root, ".skills-orchestrator/agent-builder.lock");
  await mkdir(path.dirname(lockPath), { recursive: true });
  let lock;
  try { lock = await open(lockPath, "wx", 0o600); }
  catch (error) { if (error.code === "EEXIST") throw new Error("Another Agent Builder apply operation holds the project lock"); throw error; }
  const transactionId = `AGT-${randomUUID()}`;
  const transaction = `.skills-orchestrator/agent-builder/${transactionId}`;
  const staged = `${transaction}/installation`;
  let installed = false;
  try {
    await lock.writeFile(json({ processId: process.pid, targetPath: plan.targetPath }));
    await missingDestination(root, plan.targetPath);
    const current = await loadInputs(root, loaded.specRef, loaded.guideRef);
    const currentBlueprint = await readLocal(root, blueprintPath);
    plan = await reviewNativePlan(root, blueprintPath, planPath, current, currentBlueprint.bytes);
    await mkdir(await safePath(root, staged), { recursive: true, mode: 0o700 });
    for (const file of plan.files) {
      const original = await readLocal(root, `${plan.previewDirectory}/${file.path}`);
      if (original.ref.sha256 !== file.sha256) throw new Error("Native source changed while acquiring the project lock");
      const targetFile = await safePath(root, `${staged}/${file.path}`);
      await mkdir(path.dirname(targetFile), { recursive: true });
      await writeFile(targetFile, original.bytes, { flag: "wx", mode: 0o600 });
    }
    const record = { schemaVersion: "1.0.0", transactionId, runtime: "native-copilot-studio", planSha256: plan.planSha256, targetPath: plan.targetPath, originalState: "missing", acceptedRisk: true };
    await atomic(root, `${transaction}/transaction.json`, json({ ...record, status: "prepared" }));
    const beforeInstall = await loadInputs(root, loaded.specRef, loaded.guideRef);
    if (stable(beforeInstall.inputs) !== stable(plan.inputs)) throw new Error("Native source changed before installation");
    await missingDestination(root, plan.targetPath);
    await mkdir(path.dirname(target), { recursive: true });
    await rename(await safePath(root, staged), target);
    installed = true;
    const installedSnapshot = await snapshotDirectory(root, plan.targetPath, { allowHandoff: true });
    if (stable(installedSnapshot.files) !== stable(plan.files)) throw new Error("Installed native source does not match the reviewed plan");
    const result = {
      schemaVersion: "2.0.0", completedAt: new Date().toISOString(), runtime: "native-copilot-studio", status: "prepared",
      action: "prepare", targetPath: plan.targetPath, blueprintSha256: plan.blueprintSha256, planSha256: plan.planSha256,
      handoff: { path: `${plan.targetPath}/native-handoff.json`, sha256: plan.handoffSha256 },
      transactionId, complete: false, diagnostics: []
    };
    await atomic(root, `${transaction}/transaction.json`, json({ ...record, status: "applied" }));
    await atomic(root, "reports/agent-builder-result.json", json(result));
    return result;
  } catch (error) {
    if (installed) {
      await safePath(root, plan.targetPath);
      await rename(target, await safePath(root, `${transaction}/failed-installation`));
      await atomic(root, `${transaction}/transaction.json`, json({ schemaVersion: "1.0.0", transactionId,
        runtime: "native-copilot-studio", status: "rolled-back", targetPath: plan.targetPath,
        originalState: "missing", planSha256: plan.planSha256, preservedPath: `${transaction}/failed-installation` }));
    }
    throw error;
  } finally {
    await lock.close();
    await rm(lockPath, { force: true });
  }
}

export async function runNativeStudioBuilder(command, root, options, validateNativeStudioBlueprint) {
  const guide = await readGuide(root);
  if (typeof validateNativeStudioBlueprint !== "function") throw new Error("Native preparation requires the synchronous blueprint validator from agent-builder.mjs");
  if (options._?.length !== 1) throw new Error("Native Studio accepts one command only; --accept-risk is an explicit flag with no value");
  if (options.agent) throw new Error("Native Studio never validates a .agent.md; use its reviewed native blueprint and source");
  if (["build", "plan", "apply"].includes(command) && options["accept-risk"] !== true) throw new Error("Use --accept-risk for explicit local native preparation or reviewed application; it never authorizes remote operations");
  let blueprintPath;
  let blueprintBytes;
  let blueprint;
  let loaded;
  if (command === "build") {
    const allowed = ["_", "project", "type", "native-spec", "accept-risk", "json"];
    for (const option of Object.keys(options)) if (!allowed.includes(option)) throw new Error(`--${option} does not apply to native Studio; use reviewed native-spec fields without Azure hosting or portable tool grants`);
    const specPath = projectRelative(root, options["native-spec"]);
    loaded = await loadInputs(root, { path: specPath }, guide.ref);
    blueprint = { schemaVersion: "3.0.0", agentType: "copilot-studio", id: loaded.spec.agent.id, name: loaded.spec.agent.name, nativeSpec: loaded.specRef, guide: loaded.guideRef };
    validateNativeStudioBlueprint(blueprint);
    blueprintPath = `reports/agent-blueprints/${blueprint.id}.json`;
    blueprintBytes = Buffer.from(json(blueprint));
  } else {
    blueprintPath = projectRelative(root, options.blueprint);
    blueprintBytes = (await readLocal(root, blueprintPath)).bytes;
    blueprint = validateNativeStudioBlueprint(parseJson(blueprintBytes, "native blueprint"));
    if (options["native-spec"] && projectRelative(root, options["native-spec"]) !== blueprint.nativeSpec.path) throw new Error("Native spec path differs from the reviewed blueprint");
    loaded = await loadInputs(root, blueprint.nativeSpec, blueprint.guide);
    if (blueprint.id !== loaded.spec.agent.id || blueprint.name !== loaded.spec.agent.name) throw new Error("Native blueprint identity differs from its reviewed spec");
  }
  if (["build", "plan", "apply"].includes(command)) {
    await preflightNativeOutputs(root, command, blueprintPath, loaded, command === "apply" ? projectRelative(root, options.plan) : undefined);
  }
  if (command === "validate") {
    let sourcePresent = false;
    try { await lstat(await safePath(root, loaded.spec.source.directory)); sourcePresent = true; }
    catch (error) { if (error.code !== "ENOENT") throw error; }
    if (sourcePresent) {
      const handoff = await readLocal(root, `${loaded.spec.source.directory}/native-handoff.json`);
      const value = validateNativeStudioHandoff(parseJson(handoff.bytes, "native handoff"));
      if (stable(value.artifacts.guide) !== stable(loaded.guideRef) || stable(value.artifacts.spec) !== stable(loaded.specRef)) throw new Error("Installed native guide or spec digest is stale");
      const receipt = value.approvals.localMutation.evidence[0];
      if (!receipt || !/^\.skills-orchestrator\/agent-builder\/native-preview\/NP-[a-f0-9-]{36}\/preparation\.json$/.test(receipt.path)) throw new Error("Installed native handoff lacks its reviewed preparation receipt");
      const reviewed = await reviewNativePlan(root, blueprintPath, `${receipt.path.slice(0, -"preparation.json".length)}plan.json`, loaded, blueprintBytes);
      if (handoff.ref.sha256 !== reviewed.handoffSha256) throw new Error("Installed native handoff changed after review");
      const snapshot = await snapshotDirectory(root, loaded.spec.source.directory, { allowHandoff: true });
      for (const item of value.artifacts.authored) {
        const actual = await readLocal(root, item.path);
        if (actual.ref.sha256 !== item.sha256) throw new Error("Installed native artifact changed after review");
      }
      if (stable(snapshot.files) !== stable(reviewed.files)) throw new Error("Installed native source inventory changed after review");
    }
    return { status: "valid", runtime: "native-copilot-studio", id: blueprint.id, sourcePresent, complete: false };
  }
  if (command === "apply") return applyNative(root, blueprintPath, projectRelative(root, options.plan), loaded, blueprintBytes);
  if (!["build", "plan"].includes(command)) throw new Error("Unsupported native builder command");
  try {
    const plan = await nativePlan(root, blueprintPath, blueprintBytes, loaded);
    if (command === "build") await atomic(root, blueprintPath, blueprintBytes);
    return command === "build" ? { blueprintPath, plan } : plan;
  } catch (error) {
    if (!(error instanceof PreparationBlocked)) throw error;
    return blockedResult(root, loaded.spec, error, digest(blueprintBytes));
  }
}
