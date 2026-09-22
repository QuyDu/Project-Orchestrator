import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

export const frameworkRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../../../..");
const schemaFiles = {
  request: "agent-deployment-request.schema.json",
  plan: "agent-deployment-plan.schema.json",
  result: "agent-deployment-result.schema.json",
  state: "agent-deployment-state.schema.json",
  capabilities: "agent-provider-capabilities.schema.json"
};
const schemas = new Map();

export class DeploymentError extends Error {
  constructor(code, message) {
    super(message);
    this.name = "DeploymentError";
    this.code = code;
  }
}

export function stop(code, message) {
  throw new DeploymentError(code, message);
}

export function safeError(error) {
  return error instanceof DeploymentError ? error
    : new DeploymentError("OPERATION_FAILED", "Operation failed; reconcile remote state before retrying. Provider output was redacted.");
}

export function stableJson(value) {
  if (Array.isArray(value)) return `[${value.map(stableJson).join(",")}]`;
  if (value !== null && typeof value === "object") {
    return `{${Object.keys(value).sort().map((key) => `${JSON.stringify(key)}:${stableJson(value[key])}`).join(",")}}`;
  }
  return JSON.stringify(value);
}

export function digest(value) {
  return createHash("sha256").update(typeof value === "string" || Buffer.isBuffer(value) ? value : stableJson(value)).digest("hex");
}

export function jsonBytes(value) {
  return `${JSON.stringify(value, null, 2)}\n`;
}

export function implementationDigest() {
  const scripts = ["agent-deployment.mjs", "contracts.mjs", "files.mjs", "package.mjs", "platform-engine.mjs", "providers/foundry.mjs", "providers/registry.mjs", "providers/azure-cli.mjs", "providers/azure-cli.ps1", "providers/azure-http.mjs", "providers/microsoft365.mjs", "providers/platform-contract.mjs", "providers/pac.mjs", "providers/atk.mjs", "providers/enterprise-cli.mjs", "providers/enterprise-cli.ps1"]
    .map((name) => `.github/skills/agent-deployment/scripts/${name}`);
  const inputs = [...scripts, ...Object.values(schemaFiles).map((name) => `schemas/${name}`)].sort();
  return digest(Object.fromEntries(inputs.map((name) => [name, digest(readFileSync(path.join(frameworkRoot, ...name.split("/"))))])));
}

export function rejectSecrets(value) {
  const forbiddenKey = /^(?:password|passphrase|secret|client[-_]?secret|api[-_]?key|access[-_]?key|access[-_]?token|refresh[-_]?token|token|connection[-_]?string|authorization[-_]?header)$/i;
  const patterns = [
    /-----BEGIN (?:[A-Z0-9]+ )?PRIVATE KEY-----/i,
    /-----BEGIN PGP PRIVATE KEY BLOCK-----/i,
    /\b(?:password|api[_-]?key|client[_-]?secret|access[_-]?token|refresh[_-]?token)\s*[:=]\s*["']?[^\s"'\\,;]{4,}/i,
    /\b(?:AccountKey|SharedAccessKey|SharedAccessSignature|sig)\s*=\s*[^\s;&"']{8,}/i,
    /\bBearer\s+[a-z0-9._~+/-]{8,}/i,
    /\beyJ[a-z0-9_-]{8,}\.[a-z0-9_-]{8,}\.[a-z0-9_-]{8,}/i,
    /\bgh[oprsu]_[a-z0-9]{20,}\b/i,
    /\b(?:AKIA|ASIA)[A-Z0-9]{16}\b/,
    /\bsk-(?:proj-|svcacct-)?[a-z0-9_-]{20,}\b/i
  ];
  function walk(item) {
    if (typeof item === "string" && patterns.some((pattern) => pattern.test(item))) {
      stop("CREDENTIAL_REJECTED", "Suspected secret or credential material is prohibited.");
    }
    if (Array.isArray(item)) item.forEach(walk);
    else if (item && typeof item === "object") for (const [key, child] of Object.entries(item)) {
      if (forbiddenKey.test(key)) stop("CREDENTIAL_REJECTED", "Credential fields are prohibited; use an existing provider CLI session.");
      walk(child);
    }
  }
  walk(value);
  return value;
}

function loadSchema(file) {
  if (!Object.values(schemaFiles).includes(file)) stop("SCHEMA_REFERENCE", "Untrusted schema reference.");
  if (!schemas.has(file)) schemas.set(file, JSON.parse(readFileSync(path.join(frameworkRoot, "schemas", file), "utf8")));
  return schemas.get(file);
}

function matches(schema, value, document, file) {
  if (schema === true) return true;
  if (schema === false) return false;
  if (schema.$ref) {
    const [referenceFile, fragment = ""] = schema.$ref.split("#");
    const targetFile = referenceFile || file;
    const targetDocument = referenceFile ? loadSchema(referenceFile) : document;
    const referenced = fragment.split("/").slice(1).reduce((result, key) => result?.[key.replace(/~1/g, "/").replace(/~0/g, "~")], targetDocument);
    if (!referenced) stop("SCHEMA_REFERENCE", "Unresolved contract schema reference.");
    if (!matches(referenced, value, targetDocument, targetFile)) return false;
  }
  if (schema.const !== undefined && stableJson(value) !== stableJson(schema.const)) return false;
  if (schema.enum && !schema.enum.some((item) => stableJson(item) === stableJson(value))) return false;
  if (schema.allOf && !schema.allOf.every((item) => matches(item, value, document, file))) return false;
  if (schema.anyOf && !schema.anyOf.some((item) => matches(item, value, document, file))) return false;
  if (schema.oneOf && schema.oneOf.filter((item) => matches(item, value, document, file)).length !== 1) return false;
  if (schema.not && matches(schema.not, value, document, file)) return false;
  if (schema.if) {
    const branch = matches(schema.if, value, document, file) ? schema.then : schema.else;
    if (branch && !matches(branch, value, document, file)) return false;
  }
  if (schema.type) {
    const types = Array.isArray(schema.type) ? schema.type : [schema.type];
    if (!types.some((type) => {
      if (type === "null") return value === null;
      if (type === "array") return Array.isArray(value);
      if (type === "object") return value !== null && typeof value === "object" && !Array.isArray(value);
      if (type === "integer") return Number.isSafeInteger(value);
      if (type === "number") return typeof value === "number" && Number.isFinite(value);
      return typeof value === type;
    })) return false;
  }
  if (typeof value === "string") {
    if (schema.minLength !== undefined && [...value].length < schema.minLength) return false;
    if (schema.maxLength !== undefined && [...value].length > schema.maxLength) return false;
    if (schema.pattern && !new RegExp(schema.pattern, "u").test(value)) return false;
    if (schema.format === "date-time" && (!/^\d{4}-\d\d-\d\dT\d\d:\d\d:\d\d(?:\.\d{1,3})?Z$/.test(value) || !Number.isFinite(Date.parse(value)))) return false;
    if (schema.format === "uri") {
      try { new URL(value); } catch { return false; }
    }
  }
  if (typeof value === "number" && ((schema.minimum !== undefined && value < schema.minimum) || (schema.maximum !== undefined && value > schema.maximum))) return false;
  if (Array.isArray(value)) {
    if (schema.minItems !== undefined && value.length < schema.minItems) return false;
    if (schema.maxItems !== undefined && value.length > schema.maxItems) return false;
    if (schema.uniqueItems && new Set(value.map(stableJson)).size !== value.length) return false;
    if (schema.items && !value.every((item) => matches(schema.items, item, document, file))) return false;
    if (schema.contains && !value.some((item) => matches(schema.contains, item, document, file))) return false;
  }
  if (value && typeof value === "object" && !Array.isArray(value)) {
    if (schema.required?.some((key) => !Object.hasOwn(value, key))) return false;
    if (schema.maxProperties !== undefined && Object.keys(value).length > schema.maxProperties) return false;
    if (schema.minProperties !== undefined && Object.keys(value).length < schema.minProperties) return false;
    for (const [key, child] of Object.entries(value)) {
      if (Object.hasOwn(schema.properties ?? {}, key)) {
        if (!matches(schema.properties[key], child, document, file)) return false;
      } else if (schema.additionalProperties === false) return false;
      else if (schema.additionalProperties && typeof schema.additionalProperties === "object" && !matches(schema.additionalProperties, child, document, file)) return false;
    }
  }
  return true;
}

export function validateContract(name, value) {
  const file = schemaFiles[name];
  if (!file) stop("CONTRACT_UNKNOWN", "Unknown deployment contract.");
  const schema = loadSchema(file);
  if (!matches(schema, value, schema, file)) stop("CONTRACT_INVALID", `Invalid deployment ${name} contract.`);
  return value;
}

export function validateContractPart(name, definition, value) {
  const file = schemaFiles[name];
  if (!file) stop("CONTRACT_UNKNOWN", "Unknown deployment contract.");
  const schema = loadSchema(file);
  const part = schema.$defs?.[definition];
  if (!part || !matches(part, value, schema, file)) stop("CONTRACT_INVALID", "Invalid deployment evidence contract.");
  return value;
}

export function validateShape(schema, value, label = "provider") {
  if (!matches(schema, value, schema, "agent-deployment-plan.schema.json")) stop("CONTRACT_INVALID", `Invalid deployment ${label} contract.`);
  rejectSecrets(value);
  return value;
}

export function validateRequest(request) {
  rejectSecrets(request);
  validateContract("request", request);
  return request;
}
