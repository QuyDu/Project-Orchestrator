import path from "node:path";
import { digest, rejectSecrets, stop, validateShape } from "../contracts.mjs";
import { checkedPath, immutableFile, makeDirectory, readBytes, relativePath } from "../files.mjs";
import { validatePlatformOutcome, validatePlatformSnapshot } from "./platform-contract.mjs";
import {
  checkedContext, cliPreflight, cliVersionSchema, fileSchema, filesSchema, guardedProvider, guidSchema, identitySchema,
  inspectZip, invokeCli, outputPath, pathSchema, reviewedFile, sourceTree, stageSource, verifyStaged, zipNameSchema
} from "./enterprise-cli.mjs";

const common = {
  operation: {}, expectedCliVersion: cliVersionSchema,
  environment: { type: "string", pattern: "^[a-z][a-z0-9-]{0,31}$" },
  projectDirectory: pathSchema, sourceFiles: filesSchema
};
const manifestFields = {
  manifest: fileSchema, appId: guidSchema,
  appVersion: { type: "string", pattern: "^[0-9]{1,5}\\.[0-9]{1,5}\\.[0-9]{1,5}$" }
};
function branch(operation, fields) {
  const properties = { ...common, operation: { const: operation }, ...fields };
  return { type: "object", additionalProperties: false, required: Object.keys(properties), properties };
}
export const requestSchema = {
  oneOf: [
    ...["provision", "deploy"].map((operation) => branch(operation, { identityEvidence: identitySchema, lifecycle: fileSchema })),
    branch("package", { ...manifestFields, outputDirectory: pathSchema, outputFileName: zipNameSchema }),
    ...["publish", "update"].map((operation) => branch(operation, { identityEvidence: identitySchema, ...manifestFields, package: fileSchema }))
  ]
};
export const operationApprovals = Object.freeze({
  provision: Object.freeze(["toolkit-code-execution"]),
  deploy: Object.freeze(["toolkit-code-execution"])
});

export function validateConfig(config) {
  validateShape(requestSchema, config, "Agents Toolkit configuration");
  relativePath(config.projectDirectory);
  if (config.outputDirectory) relativePath(config.outputDirectory);
  for (const ref of [...config.sourceFiles, config.lifecycle, config.manifest, config.package].filter(Boolean)) relativePath(ref.path);
  if (config.lifecycle && !/\.ya?ml$/i.test(config.lifecycle.path)) stop("LIFECYCLE_INVALID", "Toolkit lifecycle configuration must be an explicitly reviewed YAML file.");
  if (config.operation === "provision" && relativePath(config.lifecycle.path) !== `${relativePath(config.projectDirectory)}/m365agents.yml`) {
    stop("LIFECYCLE_INVALID", "Provision uses the reviewed default m365agents.yml; this CLI contract has no provision configuration-file flag.");
  }
  if (config.manifest && !/\.json$/i.test(config.manifest.path)) stop("MANIFEST_INVALID", "The reviewed application manifest must be JSON.");
  if (config.package && !/\.zip$/i.test(config.package.path)) stop("PACKAGE_INVALID", "Publication requires a retained reviewed application ZIP.");
  if (config.appVersion?.split(".").some((part) => Number(part) > 65535)) stop("MANIFEST_INVALID", "Application version components must remain within manifest bounds.");
  return config;
}

function localReference(value, { directory = false } = {}) {
  if (typeof value !== "string" || /\$\{|[\r\n]/.test(value)) stop("LIFECYCLE_PATH_INVALID", "Use reviewed literal local references; implicit environment substitutions are not supported.");
  const normalized = value.startsWith("./") || value.startsWith(".\\") ? value.slice(2) : value;
  if (directory && (value === "." || value === "./")) return "";
  return relativePath(normalized);
}

function yamlSubset(bytes) {
  const text = bytes.toString("utf8").replace(/^\uFEFF/, "");
  if (text.length > 1_048_576) stop("LIFECYCLE_INVALID", "Lifecycle configuration exceeds its review boundary.");
  if (text.trimStart().startsWith("{")) {
    try { return JSON.parse(text); }
    catch { stop("LIFECYCLE_INVALID", "The JSON-compatible YAML document is invalid."); }
  }
  const result = {};
  let section = null;
  let action = null;
  let group = null;
  function scalar(value) {
    if (!value || /[&*!|>]|\$\{/.test(value)) stop("LIFECYCLE_UNSUPPORTED", "YAML aliases, tags, blocks and environment expressions are outside the reviewed lifecycle subset.");
    if (value.startsWith('"')) {
      try {
        const parsed = JSON.parse(value);
        if (typeof parsed !== "string") throw new Error();
        return parsed;
      } catch { stop("LIFECYCLE_INVALID", "Invalid quoted lifecycle value."); }
    }
    if (value.startsWith("'")) {
      if (!/^'(?:[^']|'')*'$/.test(value)) stop("LIFECYCLE_INVALID", "Invalid quoted lifecycle value.");
      return value.slice(1, -1).replaceAll("''", "'");
    }
    if (/[\[\]{}#]/.test(value)) stop("LIFECYCLE_UNSUPPORTED", "Use simple reviewed scalar lifecycle values.");
    return value;
  }
  for (const raw of text.split(/\r?\n/)) {
    if (!raw.trim() || raw.trimStart().startsWith("#")) continue;
    if (/\t/.test(raw)) stop("LIFECYCLE_INVALID", "Lifecycle indentation must use spaces.");
    const indent = raw.length - raw.trimStart().length;
    const line = raw.trim();
    if (indent === 0) {
      const match = /^([a-zA-Z][a-zA-Z0-9]*):(?: +(.*))?$/.exec(line);
      if (!match || Object.hasOwn(result, match[1])) stop("LIFECYCLE_INVALID", "Lifecycle root keys must be unique and explicit.");
      section = match[1];
      action = null;
      group = null;
      result[section] = match[2] && match[2] !== "[]" ? scalar(match[2]) : [];
    } else if (indent === 2) {
      const match = /^- uses: +([a-zA-Z][a-zA-Z0-9/]+)$/.exec(line);
      if (!match || !Array.isArray(result[section])) stop("LIFECYCLE_UNSUPPORTED", "Only explicit reviewed lifecycle action lists are supported.");
      action = { uses: match[1] };
      result[section].push(action);
      group = null;
    } else if (indent === 4) {
      const match = /^(with|writeToEnvironmentFile):$/.exec(line);
      if (!match || !action || Object.hasOwn(action, match[1])) stop("LIFECYCLE_UNSUPPORTED", "Unsupported or duplicate lifecycle action property.");
      group = {};
      action[match[1]] = group;
    } else if (indent === 6) {
      const match = /^([a-zA-Z][a-zA-Z0-9]*): +(.*)$/.exec(line);
      if (!match || !group || Object.hasOwn(group, match[1])) stop("LIFECYCLE_INVALID", "Lifecycle action settings must be unique bounded scalars.");
      group[match[1]] = scalar(match[2]);
    } else stop("LIFECYCLE_UNSUPPORTED", "Nested or executable YAML outside the reviewed subset is not supported.");
  }
  return result;
}

function validateLifecycle(bytes, tree, context, requireStage = null) {
  // Toolkit detects this raw marker even in comments and runs npm install during packaging.
  if (bytes.includes(Buffer.from("typeSpec/compile"))) {
    stop("LIFECYCLE_UNSUPPORTED", "TypeSpec preprocessing can install dependencies implicitly; build it in a separately approved workflow and supply resolved package inputs.");
  }
  const document = yamlSubset(bytes);
  rejectSecrets(document);
  if (!document || typeof document !== "object" || Array.isArray(document) || !/^v1\.[0-9]{1,2}$/.test(document.version ?? "")
      || Object.keys(document).some((key) => !["version", "environmentFolderPath", "provision", "deploy"].includes(key))) {
    stop("LIFECYCLE_UNSUPPORTED", "Supported lifecycle roots are version, environmentFolderPath, provision and deploy; custom, publish, install and credential stages are not executed.");
  }
  if (document.environmentFolderPath) localReference(document.environmentFolderPath);
  const ids = [];
  const exactKeys = (value, allowed, required) => value && typeof value === "object" && !Array.isArray(value)
    && Object.keys(value).every((key) => allowed.includes(key)) && required.every((key) => Object.hasOwn(value, key));
  for (const stage of ["provision", "deploy"]) {
    if (!Object.hasOwn(document, stage)) continue;
    if (!Array.isArray(document[stage]) || document[stage].length > 16) stop("LIFECYCLE_UNSUPPORTED", "Lifecycle stages must be bounded action arrays.");
    for (const action of document[stage]) {
      if (!exactKeys(action, ["uses", "with", "writeToEnvironmentFile"], ["uses", "with"])) stop("LIFECYCLE_UNSUPPORTED", "Unknown lifecycle action properties are not execution authority.");
      if (stage === "provision" && action.uses === "teamsApp/create") {
        if (!exactKeys(action.with, ["name"], ["name"]) || typeof action.with.name !== "string"
            || !/^[a-zA-Z0-9][a-zA-Z0-9 ._-]{0,99}$/.test(action.with.name)) {
          stop("LIFECYCLE_UNSUPPORTED", "teamsApp/create requires a reviewed literal nonsecret application name.");
        }
        if (action.writeToEnvironmentFile && (!exactKeys(action.writeToEnvironmentFile, ["teamsAppId"], ["teamsAppId"])
            || action.writeToEnvironmentFile.teamsAppId !== "TEAMS_APP_ID")) {
          stop("LIFECYCLE_UNSUPPORTED", "Only the generated nonsecret TEAMS_APP_ID mapping is supported.");
        }
      } else if (stage === "deploy" && ["azureAppService/zipDeploy", "azureFunctions/zipDeploy"].includes(action.uses)) {
        if (action.writeToEnvironmentFile || !exactKeys(action.with, ["artifactFolder", "resourceId", "ignoreFile"], ["artifactFolder", "resourceId"])) {
          stop("LIFECYCLE_UNSUPPORTED", "Zip deployment accepts only an explicitly reviewed artifact folder, resource and optional ignore file.");
        }
        const artifact = localReference(action.with.artifactFolder, { directory: true });
        const prefix = `${tree.directory}${artifact ? `/${artifact}` : ""}/`;
        if (![...tree.files.keys()].some((name) => name.startsWith(prefix))) stop("LIFECYCLE_INPUT_MISSING", "The deployment artifact folder is not included in the frozen source tree.");
        if (action.with.ignoreFile && !tree.files.has(`${tree.directory}/${localReference(action.with.ignoreFile)}`)) stop("LIFECYCLE_INPUT_MISSING", "The deployment ignore file is not reviewed.");
        const match = /^\/subscriptions\/([a-f0-9-]{36})\/resourceGroups\/[a-zA-Z0-9._-]{1,90}\/providers\/Microsoft\.Web\/sites\/[a-zA-Z0-9-]{1,60}(?:\/slots\/[a-zA-Z0-9-]{1,60})?$/i.exec(action.with.resourceId ?? "");
        if (!match || match[1].toLowerCase() !== context.profile?.subscription?.subscriptionId?.toLowerCase()) {
          stop("CLI_SUBSCRIPTION_MISMATCH", "The reviewed deployment resource must belong to the explicit project subscription.");
        }
        if (requireStage === "deploy") ids.push(action.with.resourceId);
      } else {
        stop("LIFECYCLE_UNSUPPORTED", "This action is not reviewed for execution. Scripts, dependency installation, credential creation and implicit publication require a different separately reviewed adapter.");
      }
    }
  }
  if (requireStage && !document[requireStage]?.length) stop("LIFECYCLE_INVALID", "The selected operation has no reviewed executable lifecycle stage.");
  return [...new Set(ids)];
}

function manifestInputs(config, tree) {
  const manifestPath = relativePath(config.manifest.path);
  const manifestBytes = tree.files.get(manifestPath);
  if (!manifestBytes || digest(manifestBytes) !== config.manifest.sha256) stop("MANIFEST_DRIFT", "The application manifest must be part of the frozen reviewed source tree.");
  const manifest = JSON.parse(manifestBytes.toString("utf8"));
  if (!manifest || typeof manifest !== "object" || Array.isArray(manifest)
      || manifest.id !== config.appId || manifest.version !== config.appVersion || !manifest.icons
      || typeof manifest.icons.color !== "string" || typeof manifest.icons.outline !== "string") {
    stop("MANIFEST_IDENTITY_MISMATCH", "The manifest application ID, version and icon references must match reviewed intent.");
  }
  const files = new Map([["manifest.json", manifestBytes]]);
  const inspected = new Set();
  const base = path.posix.dirname(manifestPath);
  function inspect(filePath, bytes) {
    if (inspected.has(filePath)) return;
    inspected.add(filePath);
    if (!/\.json$/i.test(filePath)) return;
    let value;
    try { value = JSON.parse(bytes.toString("utf8")); }
    catch { stop("MANIFEST_INVALID", "A referenced manifest JSON file is invalid."); }
    rejectSecrets(value);
    function walk(item) {
      if (typeof item === "string") {
        if (/\$\{|%[a-zA-Z_][a-zA-Z0-9_]*%/.test(item)) stop("MANIFEST_UNRESOLVED", "Manifest environment substitutions must be resolved to reviewed nonsecret bytes before packaging.");
        if (/\.(?:json|ya?ml|png)$/i.test(item) && !/^https:\/\//i.test(item)) {
          const relative = localReference(item);
          const source = `${path.posix.dirname(filePath)}/${relative}`;
          const content = tree.files.get(source);
          if (!content || !source.startsWith(`${base}/`)) stop("MANIFEST_REFERENCE_MISSING", "Every local manifest, API description and icon reference must be inside the reviewed package source tree.");
          files.set(path.posix.relative(base, source), content);
          inspect(source, content);
        }
      } else if (Array.isArray(item)) item.forEach(walk);
      else if (item && typeof item === "object") Object.values(item).forEach(walk);
    }
    walk(value);
  }
  inspect(manifestPath, manifestBytes);
  for (const icon of [manifest.icons.color, manifest.icons.outline]) {
    const bytes = files.get(localReference(icon));
    if (!bytes || bytes.length < 8 || !bytes.subarray(0, 8).equals(Buffer.from("89504e470d0a1a0a", "hex"))) stop("MANIFEST_ICON_INVALID", "Reviewed application icons must be nonempty PNG files.");
  }
  return { value: manifest, files };
}

function validatePackage(bytes, manifest) {
  const archive = inspectZip(bytes);
  const metadata = archive.files.get("manifest.json");
  let value;
  try { value = JSON.parse(metadata?.toString("utf8") ?? ""); }
  catch { stop("PACKAGE_IDENTITY_INVALID", "The application ZIP has no valid manifest.json."); }
  if (digest(value) !== digest(manifest.value)) stop("PACKAGE_IDENTITY_MISMATCH", "The packaged manifest differs from the reviewed resolved manifest.");
  if (archive.files.size !== manifest.files.size) stop("PACKAGE_CONTENT_MISMATCH", "The application package has missing or additional unreviewed files.");
  for (const [name, bytes] of manifest.files) {
    if (name !== "manifest.json" && (!archive.files.has(name) || digest(archive.files.get(name)) !== digest(bytes))) {
      stop("PACKAGE_CONTENT_MISMATCH", "A packaged icon or referenced file differs from its reviewed source bytes.");
    }
  }
  return archive.sha256;
}

function outcome(config, inputs, status, evidenceSha256, mutationAccepted, messageCode) {
  return validatePlatformOutcome({
    status, responseId: null, resourceIds: config.appId ? [config.appId] : inputs.resourceIds,
    version: config.appVersion ?? null, mutationAccepted, publicationVerified: false, evidenceSha256, messageCode
  });
}

export async function createAtkProvider(rawContext, dependencies = {}) {
  const config = structuredClone(validateConfig(rawContext.request?.agentsToolkit));
  const context = await checkedContext({
    ...rawContext, request: { ...structuredClone(rawContext.request), agentsToolkit: config },
    profile: structuredClone(rawContext.profile)
  }, dependencies, "atk", config.operation === "package");
  let attempted = false;
  const outputDirectory = config.outputDirectory ?? `${context.workDirectory}/atk-output-${config.operation}`;
  const outputRelative = `${relativePath(outputDirectory)}/${config.outputFileName ?? "app.zip"}`;

  async function inputs() {
    const tree = await sourceTree(context, config.projectDirectory, config.sourceFiles);
    let resourceIds = [];
    const lifecyclePath = config.lifecycle ? relativePath(config.lifecycle.path) : null;
    if (lifecyclePath && (!tree.files.has(lifecyclePath) || digest(tree.files.get(lifecyclePath)) !== config.lifecycle.sha256)) {
      stop("LIFECYCLE_DRIFT", "The lifecycle configuration must be part of the frozen reviewed source tree.");
    }
    for (const [name, bytes] of tree.files) {
      if (/\/(?:m365agents(?:\.[a-zA-Z0-9_-]+)?\.ya?ml|teamsapp(?:\.[a-zA-Z0-9_-]+)?\.ya?ml)$/i.test(name) || name === lifecyclePath) {
        if (/\/teamsapp/i.test(name)) stop("LIFECYCLE_UNSUPPORTED", "Deprecated TeamsFx configuration is not an Agents Toolkit execution contract.");
        const ids = validateLifecycle(bytes, tree, context, name === lifecyclePath ? config.operation : null);
        if (name === lifecyclePath) resourceIds = ids;
      }
    }
    const manifest = config.manifest ? manifestInputs(config, tree) : null;
    const packageBytes = config.package ? await reviewedFile(context.root, config.package) : null;
    if (packageBytes) validatePackage(packageBytes, manifest);
    await outputPath(context, outputRelative);
    return { tree, manifest, packageBytes, resourceIds, sha256: digest({ config, tree: tree.sha256, package: packageBytes ? digest(packageBytes) : null }) };
  }

  async function preflight() {
    const reviewed = await inputs();
    const cli = await cliPreflight("atk", config, context, context.root, dependencies, config.operation === "package");
    if ((await inputs()).sha256 !== reviewed.sha256) stop("INPUT_DRIFT", "Reviewed Toolkit inputs changed during preflight.");
    return { reviewed, cli };
  }

  return guardedProvider({
    async probe() {
      const { reviewed, cli } = await preflight();
      return validatePlatformSnapshot({
        target: "microsoft-365-agents-toolkit", ...cli,
        configurationSha256: digest({ inputs: reviewed.sha256, identity: cli.identitySha256 }),
        resourceIds: [], version: null, phase: config.operation === "package" ? "ready" : "unknown"
      });
    },
    async execute(operation, receipt = null) {
      if (operation !== config.operation) stop("CLI_OPERATION_REJECTED", "The Toolkit operation was not selected in the reviewed configuration.");
      if (receipt !== null || attempted) stop("CLI_REPLAY_REJECTED", "A prior or uncertain Toolkit operation cannot be retried blindly; use core reconciliation.");
      const { reviewed } = await preflight();
      if (["package", "publish", "update"].includes(operation)) {
        await outputPath(context, outputRelative, { fresh: true });
        await outputPath(context, outputDirectory, { directory: true, fresh: true });
      }
      await makeDirectory(context.root, context.workDirectory);
      const staged = await stageSource(context, reviewed.tree, "atk");
      const args = [operation, "--env", config.environment];
      if (["provision", "deploy"].includes(operation)) {
        args.push("--folder", staged.absolute);
        if (operation === "deploy") args.push("--config-file-path", await checkedPath(context.root, `${staged.folder}/${path.posix.relative(reviewed.tree.directory, relativePath(config.lifecycle.path))}`));
        args.push("--ignore-env-file", "-i", "false");
      } else {
        if (reviewed.packageBytes) {
          const packagePath = `${context.workDirectory}/atk-input/app.zip`;
          await immutableFile(context.root, packagePath, reviewed.packageBytes);
          args.push("--package-file", await checkedPath(context.root, packagePath));
        } else {
          const manifestPath = `${staged.folder}/${path.posix.relative(reviewed.tree.directory, relativePath(config.manifest.path))}`;
          args.push("--manifest-file", await checkedPath(context.root, manifestPath));
        }
        await makeDirectory(context.root, outputDirectory);
        args.push("--output-folder", await outputPath(context, outputDirectory, { directory: true }),
          "--output-package-file", await outputPath(context, outputRelative, { fresh: true }),
          "--folder", staged.absolute, "-i", "false");
      }
      if ((await inputs()).sha256 !== reviewed.sha256) stop("INPUT_DRIFT", "Reviewed Toolkit inputs changed before execution.");
      await verifyStaged(context, staged.folder, staged.references);
      if (reviewed.packageBytes) await reviewedFile(context.root, { path: `${context.workDirectory}/atk-input/app.zip`, sha256: digest(reviewed.packageBytes) });
      attempted = true;
      const result = await invokeCli("atk", args, { cwd: staged.absolute, timeoutMs: 300_000 }, dependencies);
      if (operation === "package") {
        const archive = await readBytes(context.root, outputRelative, { maximum: 33_554_432 });
        return outcome(config, reviewed, "packaged", validatePackage(archive, reviewed.manifest), false, "ATK_PACKAGE_VALIDATED");
      }
      const status = { provision: "provisioned", deploy: "deployed", publish: "publication-submitted", update: "publication-submitted" }[operation];
      return outcome(config, reviewed, status, digest({ operation, inputs: reviewed.sha256, response: result }), true,
        ["publish", "update"].includes(operation) ? "ATK_PUBLICATION_ACCEPTED_UNVERIFIED" : "ATK_LIFECYCLE_ACCEPTED_UNVERIFIED");
    },
    async verify(receipt) {
      validatePlatformOutcome(receipt);
      const { reviewed } = await preflight();
      if (config.operation === "package") {
        const actual = validatePackage(await readBytes(context.root, outputRelative, { maximum: 33_554_432 }), reviewed.manifest);
        if (receipt.status !== "packaged" || actual !== receipt.evidenceSha256) stop("ARTIFACT_DRIFT", "The retained application ZIP differs from accepted artifact evidence.");
        return outcome(config, reviewed, "packaged", actual, false, "ATK_RETAINED_ARTIFACT_VERIFIED");
      }
      let launchSha256 = null;
      if (["publish", "update"].includes(config.operation)) {
        const result = await invokeCli("atk", ["launchinfo", "--manifest-id", config.appId], { cwd: context.root, timeoutMs: 30_000 }, dependencies);
        if (!result.stdout.trim()) stop("CLI_EVIDENCE_INVALID", "Launch information is unavailable; tenant catalog approval and conversation health remain unverified.");
        launchSha256 = digest(result);
      }
      return outcome(config, reviewed, launchSha256 ? "publication-submitted" : "verification-required",
        digest({ inputs: reviewed.sha256, accepted: receipt.evidenceSha256, launchSha256 }), receipt.mutationAccepted,
        "ATK_OPERATOR_VERIFICATION_REQUIRED");
    },
    async rollback() {
      stop("RECOVERY_REQUIRED", "Toolkit has no documented atomic rollback. Retain the reviewed source and application ZIP; create a separately approved recovery or republish plan. Uninstall is destructive cleanup and will not be invoked.");
    }
  });
}
