import { validateBlueprint, renderAgent, normalizeDistribution } from "../../agent-builder/scripts/agent-builder.mjs";
import { digest, jsonBytes, rejectSecrets, stableJson, stop, validateContractPart, validateRequest } from "./contracts.mjs";
import { immutableFile, readBytes, readJson, relativePath, verifyDirectory } from "./files.mjs";
import { capabilityFor } from "./providers/registry.mjs";

function httpsUrl(value, allowedHosts) {
  let url;
  try { url = new URL(value); } catch { stop("OPENAPI_URL", "An action or privacy URL is invalid."); }
  if (url.protocol !== "https:" || url.username || url.password || url.port || url.hash || url.search
      || !/^(?:[a-z0-9](?:[a-z0-9-]*[a-z0-9])?\.)+[a-z]{2,63}$/.test(url.hostname)
      || /(?:^|\.)(?:localhost|local|internal|test|invalid)$/.test(url.hostname)
      || (allowedHosts && !allowedHosts.includes(url.hostname))
      || /%|\\/.test(value)) stop("OPENAPI_URL", "Action URLs require an approved public HTTPS host without credentials, redirects or URL templates.");
  return url;
}

export function validateOpenApi(document, policy) {
  rejectSecrets(document);
  if (!document || !["3.0.3", "3.1.0"].includes(document.openapi) || !document.info?.title || !document.info?.version
      || !document.paths || !Array.isArray(document.servers) || !document.servers.length || document.servers.length > 8) {
    stop("OPENAPI_CONTRACT", "A JSON OpenAPI 3.0.3 or 3.1.0 document with explicit servers and paths is required.");
  }
  function inspect(value) {
    if (Array.isArray(value)) return value.forEach(inspect);
    if (!value || typeof value !== "object") return;
    if (value.$ref !== undefined) {
      if (typeof value.$ref !== "string" || !value.$ref.startsWith("#/")) stop("OPENAPI_REFERENCE", "External OpenAPI references are prohibited.");
      let referenced = document;
      for (const segment of value.$ref.slice(2).split("/")) {
        const key = segment.replace(/~1/g, "/").replace(/~0/g, "~");
        if (!referenced || !Object.hasOwn(referenced, key)) stop("OPENAPI_REFERENCE", "An OpenAPI local reference does not resolve.");
        referenced = referenced[key];
      }
    }
    if (value.servers !== undefined) {
      if (!Array.isArray(value.servers) || !value.servers.length || value.servers.length > 8) stop("OPENAPI_URL", "Every OpenAPI server override must be explicit.");
      for (const server of value.servers) {
        if (server.variables || typeof server.url !== "string") stop("OPENAPI_URL", "Templated action servers are prohibited.");
        httpsUrl(server.url, policy.allowedHosts);
      }
    }
    if (value.callbacks || value.webhooks) stop("OPENAPI_CALLBACK", "Action callbacks and webhooks are outside this handoff contract.");
    Object.values(value).forEach(inspect);
  }
  inspect(document);
  const schemes = document.components?.securitySchemes ?? {};
  const names = Object.keys(schemes);
  for (const scheme of Object.values(schemes)) {
    if (scheme && typeof scheme === "object" && Object.hasOwn(scheme, "$ref")) {
      stop("OPENAPI_REFERENCE", "Authentication schemes must be explicit; unresolved security references are not supported.");
    }
  }
  if (policy.authentication === "none") {
    if (names.length || (document.security && document.security.length)) stop("OPENAPI_AUTH", "The action authentication policy disagrees with OpenAPI security.");
  } else {
    if (names.length !== 1 || schemes[names[0]].type !== "oauth2") stop("OPENAPI_AUTH", "OAuth action handoff requires one explicit OAuth2 scheme.");
    const flows = schemes[names[0]].flows;
    if (!flows || Object.keys(flows).join() !== "authorizationCode" || !flows.authorizationCode.scopes) stop("OPENAPI_AUTH", "Only reviewed OAuth2 authorization-code flows are supported.");
    httpsUrl(flows.authorizationCode.authorizationUrl, policy.allowedHosts);
    httpsUrl(flows.authorizationCode.tokenUrl, policy.allowedHosts);
    if (!Array.isArray(document.security) || document.security.length !== 1 || !Object.hasOwn(document.security[0], names[0])) stop("OPENAPI_AUTH", "OAuth must protect every action by default.");
  }
  const operationIds = new Set();
  for (const [route, item] of Object.entries(document.paths)) {
    if (!route.startsWith("/") || /(?:^|\/)\.\.?(?:\/|$)|[\\?#]/.test(route)) stop("OPENAPI_PATH", "Unsafe action path.");
    if (!item || typeof item !== "object" || Array.isArray(item)) stop("OPENAPI_PATH", "Action path items must be explicit objects.");
    if (Object.hasOwn(item, "$ref")) stop("OPENAPI_REFERENCE", "Referenced path items cannot be reviewed safely; declare action operations inline.");
    for (const [method, operation] of Object.entries(item)) {
      if (!["get", "post", "put", "patch", "delete", "head", "options"].includes(method)) continue;
      if (operation && typeof operation === "object" && Object.hasOwn(operation, "$ref")) {
        stop("OPENAPI_REFERENCE", "Action operations must be inline rather than reference-overridden.");
      }
      if (!operation || typeof operation.operationId !== "string" || !/^[a-zA-Z][a-zA-Z0-9_-]{0,63}$/.test(operation.operationId) || operationIds.has(operation.operationId) || !operation.responses) {
        stop("OPENAPI_OPERATION", "Each action requires a unique operationId and response contract.");
      }
      operationIds.add(operation.operationId);
      if (["post", "put", "patch", "delete"].includes(method) && operation["x-openai-isConsequential"] !== true) {
        stop("OPENAPI_CONSEQUENTIAL", "Mutating actions must explicitly require consequential-action confirmation.");
      }
      if (operation.security !== undefined && stableJson(operation.security) !== stableJson(document.security ?? [])) stop("OPENAPI_AUTH", "Per-operation security cannot weaken or replace the reviewed authentication policy.");
    }
  }
  if (!operationIds.size || operationIds.size > 64) stop("OPENAPI_OPERATION", "An action handoff requires between one and 64 reviewed operations.");
  if (policy.privacyPolicyUrl) httpsUrl(policy.privacyPolicyUrl);
  return document;
}

function promptInstructions(blueprint) {
  return [
    blueprint.purpose,
    "Runtime boundary: tool-free prompt execution. Local portable capability labels do not grant remote tools, filesystem access, browsing, subagents or handoffs.",
    "Constraints:", ...blueprint.instructions.constraints.map((item) => `- ${item}`),
    "Approach:", ...blueprint.instructions.approach.map((item, index) => `${index + 1}. ${item}`),
    "Output:", blueprint.instructions.outputFormat,
    ...(blueprint.autonomy ? ["Direct human approval is required for:", ...blueprint.autonomy.approvalRequiredFor.map((item) => `- ${item}`)] : [])
  ].join("\n\n") + "\n";
}

function ownClientSource(model, instructions) {
  return `// Server-side own-client export. Packaging does not run this module or deploy an application.
const model = ${JSON.stringify(model)};
const instructions = ${JSON.stringify(instructions)};
export async function respond(input) {
  if (typeof input !== "string" || !input.trim() || input.length > 16000) throw new Error("Provide bounded text input.");
  const key = process.env.OPENAI_API_KEY;
  if (!key) throw new Error("Configure OPENAI_API_KEY in the server environment, never in a browser or repository.");
  let response;
  try {
    response = await fetch("https://api.openai.com/v1/responses", {
      method: "POST", redirect: "error", signal: AbortSignal.timeout(60000),
      headers: { Authorization: \`Bearer \${key}\`, "Content-Type": "application/json" },
      body: JSON.stringify({ model, instructions, input, max_output_tokens: 256, store: false, stream: false })
    });
  } catch { throw new Error("Model request failed; provider details were redacted."); }
  if (!response.ok) throw new Error(\`Model request rejected (HTTP \${response.status}); provider details were redacted.\`);
  const body = await response.json();
  if (body.status !== "completed") throw new Error("Model response is incomplete.");
  return (body.output ?? []).flatMap(item => item.type === "message"
    ? (item.content ?? []).filter(part => part.type === "output_text").map(part => part.text) : []).join("\\n");
}
`;
}

async function boundInput(root, reference) {
  const maximum = /\.(?:zip|png)$/i.test(reference.path) ? 67_108_864 : 1_048_576;
  const bytes = await readBytes(root, relativePath(reference.path), { maximum });
  if (digest(bytes) !== reference.sha256) stop("INPUT_DIGEST_MISMATCH", "Input bytes do not match their immutable reviewed digest.");
  return bytes;
}

export async function loadContext(root, requestPath) {
  const normalizedPath = relativePath(requestPath);
  const requestFile = await readJson(root, normalizedPath);
  const request = validateRequest(requestFile.value);
  if (request.copilotStudio) (await import("./providers/pac.mjs")).validateConfig(request.copilotStudio);
  if (request.agentsToolkit) (await import("./providers/atk.mjs")).validateConfig(request.agentsToolkit);
  const source = await boundInput(root, request.blueprint);
  let blueprint;
  try {
    blueprint = JSON.parse(source.toString("utf8"));
    rejectSecrets(blueprint);
    validateBlueprint(blueprint);
  } catch {
    stop("BLUEPRINT_INVALID", "Invalid blueprint; validate the whole source with agent-builder before packaging.");
  }
  const distribution = normalizeDistribution(blueprint);
  if (distribution && !distribution.targets.includes(request.target)) stop("DISTRIBUTION_MISMATCH", "Requested target is absent from the validated blueprint distribution.");
  if (blueprint.agentType === "foundry-hosted" && request.runtime.kind !== "hosted") stop("RUNTIME_MISMATCH", "A hosted blueprint cannot execute as a prompt-agent deployment.");
  const capability = capabilityFor(request);
  if (!capability) stop("PROVIDER_UNAVAILABLE", "No trusted adapter owns the requested target.");
  const instructions = promptInstructions(blueprint);
  const files = new Map([
    ["blueprint.json", source],
    ["request.json", requestFile.bytes],
    ["agent.md", Buffer.from(renderAgent(blueprint))],
    ["instructions.txt", Buffer.from(instructions)]
  ]);
  const definition = request.target !== "foundry-endpoint" ? null : request.runtime.kind === "prompt"
    ? { kind: "prompt", model: request.foundry.modelDeployment, instructions, tools: [] }
    : {
      kind: "hosted", cpu: request.hosted.cpu, memory: request.hosted.memory,
      container_configuration: {
        image: request.hosted.image,
        ...(request.hosted.registryConnectionId ? { registry_connection_id: request.hosted.registryConnectionId } : {})
      },
      protocol_versions: [{ protocol: "responses", version: request.hosted.protocolVersion }],
      session_configuration: { idle_timeout_seconds: request.hosted.idleTimeoutSeconds }
    };
  if (definition) files.set("definition.json", Buffer.from(jsonBytes(definition)));
  let hostedTestEvidence = null;
  let publicationTestEvidence = null;
  if (request.hosted) {
    const sbom = await boundInput(root, request.hosted.sbom);
    try { rejectSecrets(JSON.parse(sbom.toString("utf8"))); } catch { stop("SBOM_INVALID", "Hosted handoff requires a credential-free JSON SBOM."); }
    files.set("sbom.json", sbom);
    const evidence = await boundInput(root, request.hosted.testEvidence);
    try { hostedTestEvidence = JSON.parse(evidence.toString("utf8")); } catch { stop("HOSTED_PROOF_INVALID", "Hosted test evidence must be valid JSON."); }
    rejectSecrets(hostedTestEvidence);
    validateContractPart("request", "hostedTestEvidence", hostedTestEvidence);
    if (hostedTestEvidence.agentName !== request.hosted.testedAgentName || hostedTestEvidence.version !== request.hosted.testedVersion
        || hostedTestEvidence.image !== request.hosted.image || hostedTestEvidence.blueprintSha256 !== request.blueprint.sha256) {
      stop("HOSTED_PROOF_INVALID", "Hosted test evidence does not bind the reviewed image, source version and blueprint.");
    }
    files.set("hosted-test-evidence.json", evidence);
    files.set("hosted-image.json", Buffer.from(jsonBytes({ image: request.hosted.image, testedAgentName: request.hosted.testedAgentName, testedVersion: request.hosted.testedVersion })));
  }
  if (request.microsoft365) {
    const bytes = await boundInput(root, request.microsoft365.testEvidence);
    try { publicationTestEvidence = JSON.parse(bytes.toString("utf8")); } catch { stop("PUBLICATION_PROOF_INVALID", "Publication test evidence must be valid JSON."); }
    rejectSecrets(publicationTestEvidence);
    validateContractPart("request", "publicationTestEvidence", publicationTestEvidence);
    const config = request.microsoft365;
    if (publicationTestEvidence.projectEndpoint !== config.projectEndpoint || publicationTestEvidence.agentName !== blueprint.id
        || publicationTestEvidence.version !== config.agentVersion || publicationTestEvidence.definitionSha256 !== config.definitionSha256
        || publicationTestEvidence.blueprintSha256 !== request.blueprint.sha256) stop("PUBLICATION_PROOF_INVALID", "Publication evidence does not bind the reviewed endpoint, version, definition and blueprint.");
    files.set("publication-test-evidence.json", bytes);
  }
  const inputReferences = [];
  const inputDigests = new Map();
  let platformInputBytes = 0;
  async function collectInputs(value) {
    if (!value || typeof value !== "object") return;
    if (typeof value.path === "string" && typeof value.sha256 === "string") {
      const normalized = relativePath(value.path);
      if (inputDigests.has(normalized)) {
        if (inputDigests.get(normalized) !== value.sha256) stop("INPUT_CONFLICT", "One platform input path has conflicting reviewed digests.");
        return;
      }
      inputDigests.set(normalized, value.sha256);
      const bytes = await boundInput(root, value);
      platformInputBytes += bytes.length;
      if (platformInputBytes > 67_108_864) stop("INPUT_LIMIT", "Platform inputs exceed the 64 MiB reviewed-package boundary.");
      const suffix = value.path.match(/\.[a-zA-Z0-9]{1,8}$/)?.[0] ?? ".data";
      if ([".json", ".yaml", ".yml", ".env", ".txt"].includes(suffix.toLowerCase())) rejectSecrets(bytes.toString("utf8"));
      const name = `input-${String(inputReferences.length + 1).padStart(3, "0")}${suffix.toLowerCase()}`;
      files.set(name, bytes);
      inputReferences.push({ path: normalized, sha256: value.sha256, packagedName: name });
      if (inputReferences.length > 2056) stop("INPUT_LIMIT", "Too many platform input artifacts.");
      return;
    }
    for (const child of Object.values(value)) await collectInputs(child);
  }
  await collectInputs(request.copilotStudio ?? request.agentsToolkit);
  if (request.target === "openai-api-application") {
    files.set("application.mjs", Buffer.from(ownClientSource(request.openai.model, instructions)));
  }
  if (request.target === "chatgpt-action-handoff") {
    const openApi = await boundInput(root, request.chatgpt.openApi);
    let document;
    try { document = JSON.parse(openApi.toString("utf8")); } catch { stop("OPENAPI_CONTRACT", "Action handoffs require JSON OpenAPI, not YAML or executable source."); }
    validateOpenApi(document, request.chatgpt);
    files.set("openapi.json", Buffer.from(jsonBytes(document)));
  }
  files.set("handoff.json", Buffer.from(jsonBytes({
    schemaVersion: "1.0.0", target: request.target, adapter: capability.id,
    support: capability.support, deploymentPerformed: false, executableToolGrants: [],
    manualSteps: capability.manualSteps, limitations: capability.limitations, sources: capability.sources
  })));
  const requestSha256 = digest(requestFile.bytes);
  const manifest = {
    schemaVersion: "1.0.0", agentId: blueprint.id, release: request.release, target: request.target,
    adapter: capability.id, blueprintSha256: request.blueprint.sha256, requestSha256, distribution,
    executableToolGrants: [],
    files: [...files].map(([name, bytes]) => ({ path: name, sha256: digest(bytes), bytes: bytes.length })).sort((a, b) => a.path.localeCompare(b.path, "en"))
  };
  const packageSha256 = digest(manifest);
  const packagePath = `reports/agent-deployment/${blueprint.id}/packages/${packageSha256}`;
  return {
    root, requestPath: normalizedPath, request, requestSha256, blueprint, distribution, definition,
    capability, manifest, files, packageSha256, packagePath, hostedTestEvidence, publicationTestEvidence,
    inputReferences: inputReferences.map((item) => ({ ...item, packagedPath: `${packagePath}/${item.packagedName}` }))
  };
}

export async function writePackage(context) {
  for (const [name, bytes] of context.files) await immutableFile(context.root, `${context.packagePath}/${name}`, bytes);
  await immutableFile(context.root, `${context.packagePath}/manifest.json`, jsonBytes(context.manifest));
  await verifyPackage(context);
}

export async function verifyPackage(context) {
  await verifyDirectory(context.root, context.packagePath, [...context.files.keys(), "manifest.json"]);
  for (const [name, bytes] of context.files) {
    const saved = await readBytes(context.root, `${context.packagePath}/${name}`, { maximum: bytes.length });
    if (!saved.equals(bytes)) stop("PACKAGE_DRIFT", "Reviewed package content has changed.");
  }
  const expectedManifest = Buffer.from(jsonBytes(context.manifest));
  const saved = await readBytes(context.root, `${context.packagePath}/manifest.json`, { maximum: expectedManifest.length });
  if (!saved.equals(expectedManifest)) stop("PACKAGE_DRIFT", "Reviewed package manifest has changed.");
}
