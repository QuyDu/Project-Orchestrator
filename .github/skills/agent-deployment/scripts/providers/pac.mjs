import path from "node:path";
import { digest, rejectSecrets, stop, validateShape } from "../contracts.mjs";
import { checkedPath, immutableFile, makeDirectory, readBytes, relativePath } from "../files.mjs";
import { validatePlatformOutcome, validatePlatformSnapshot } from "./platform-contract.mjs";
import {
  checkedContext, cliPreflight, cliVersionSchema, fileSchema, filesSchema, guardedProvider, guidSchema, identitySchema,
  inspectZip, invokeCli, outputPath, pathSchema, reviewedFile, sourceTree, stageSource, verifyStaged, zipNameSchema
} from "./enterprise-cli.mjs";

const nameSchema = { type: "string", minLength: 1, maxLength: 65, pattern: "^[a-zA-Z][a-zA-Z0-9_]*$" };
const solutionVersionSchema = { type: "string", pattern: "^[0-9]{1,5}(?:\\.[0-9]{1,5}){3}$" };
const environmentSchema = {
  anyOf: [guidSchema, {
    type: "string", maxLength: 256,
    pattern: "^https://[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?\\.crm[0-9]*\\.dynamics\\.com$"
  }]
};
const common = { operation: {}, expectedCliVersion: cliVersionSchema };
const remote = { environment: environmentSchema, identityEvidence: identitySchema };
function branch(operation, fields, optional = []) {
  const properties = { ...common, operation: { const: operation }, ...fields };
  return { type: "object", additionalProperties: false, required: Object.keys(properties).filter((key) => !optional.includes(key)), properties };
}

export const requestSchema = {
  oneOf: [
    branch("pack", {
      projectDirectory: pathSchema, sourceFiles: filesSchema,
      publisherPrefix: { type: "string", pattern: "^[a-zA-Z][a-zA-Z0-9]{1,7}$" },
      solutionName: nameSchema, solutionVersion: solutionVersionSchema,
      outputDirectory: pathSchema, outputFileName: zipNameSchema
    }),
    branch("import", {
      ...remote, solutionName: nameSchema, solutionVersion: solutionVersionSchema,
      solution: fileSchema, settings: fileSchema, solutionType: { enum: ["managed", "unmanaged"] }
    }, ["settings", "solutionType"]),
    branch("publish", { ...remote, botId: guidSchema }),
    branch("export", { ...remote, solutionName: nameSchema, solutionVersion: solutionVersionSchema, outputFile: pathSchema })
  ]
};

export function validateConfig(config) {
  validateShape(requestSchema, config, "Copilot Studio configuration");
  for (const key of ["projectDirectory", "outputDirectory", "outputFile"]) if (config[key]) relativePath(config[key]);
  for (const ref of [...(config.sourceFiles ?? []), config.solution, config.settings].filter(Boolean)) relativePath(ref.path);
  if (config.solutionVersion?.split(".").some((part) => Number(part) > 65535)) stop("SOLUTION_VERSION_INVALID", "Solution version components must be within Dataverse bounds.");
  if (config.outputFile && !/\.zip$/i.test(config.outputFile)) stop("OUTPUT_BOUNDARY", "A managed export must target an explicitly reviewed ZIP.");
  if (config.publisherPrefix?.toLowerCase() === "mscrm") stop("PUBLISHER_PREFIX_INVALID", "The reserved publisher prefix is not permitted.");
  return config;
}

function solutionIdentity(bytes, config) {
  const archive = inspectZip(bytes);
  const entries = new Map([...archive.files].map(([name, content]) => [name.toLowerCase(), content]));
  const xml = entries.get("solution.xml")?.toString("utf8");
  if (!xml || !entries.get("customizations.xml")?.length || !entries.get("[content_types].xml")?.length || xml.length > 4_194_304
      || /<!DOCTYPE|<!ENTITY|<!\[CDATA\[/i.test(xml)) stop("SOLUTION_IDENTITY_INVALID", "A nonempty solution ZIP with bounded solution identity metadata is required.");
  const stack = [];
  const values = {};
  let manifests = 0;
  let rootSeen = false;
  const tokens = xml.match(/<!--[\s\S]*?-->|<\?xml[\s\S]*?\?>|<[^>]*>|[^<]+/g) ?? [];
  if (tokens.join("") !== xml) stop("SOLUTION_IDENTITY_INVALID", "Solution XML metadata is unsupported.");
  const wanted = new Set([
    "ImportExportXml/SolutionManifest/UniqueName", "ImportExportXml/SolutionManifest/Version",
    "ImportExportXml/SolutionManifest/Managed", "ImportExportXml/SolutionManifest/Publisher/CustomizationPrefix"
  ]);
  for (const token of tokens) {
    if (token.startsWith("<?xml") || token.startsWith("<!--")) continue;
    if (token.startsWith("</")) {
      const match = /^<\/([A-Za-z][A-Za-z0-9_.-]*)\s*>$/.exec(token);
      if (!match || stack.pop() !== match[1]) stop("SOLUTION_IDENTITY_INVALID", "Solution XML metadata is not well formed.");
    } else if (token.startsWith("<")) {
      if (wanted.has(stack.join("/"))) stop("SOLUTION_IDENTITY_INVALID", "Solution identity values must be plain scalar XML content.");
      const match = /^<([A-Za-z][A-Za-z0-9_.-]*)(?:\s+[^<>]*)?\s*\/?>$/.exec(token);
      if (!match || stack.length > 64) stop("SOLUTION_IDENTITY_INVALID", "Solution XML metadata is unsupported.");
      if (!stack.length) {
        if (rootSeen || match[1] !== "ImportExportXml") stop("SOLUTION_IDENTITY_INVALID", "Solution XML must have one expected root.");
        rootSeen = true;
      }
      if (match[1] === "SolutionManifest") {
        if (stack.join("/") !== "ImportExportXml" || ++manifests !== 1) stop("SOLUTION_IDENTITY_INVALID", "Exactly one solution identity is required.");
      }
      stack.push(match[1]);
      if (wanted.has(stack.join("/"))) {
        if (Object.hasOwn(values, stack.join("/"))) stop("SOLUTION_IDENTITY_INVALID", "Ambiguous solution metadata is prohibited.");
        values[stack.join("/")] = "";
      }
      if (token.endsWith("/>")) stack.pop();
    } else if (wanted.has(stack.join("/"))) values[stack.join("/")] += token;
    else if (!stack.length && token.trim()) stop("SOLUTION_IDENTITY_INVALID", "Unexpected solution metadata content.");
  }
  const value = (name) => values[`ImportExportXml/SolutionManifest/${name}`]?.trim();
  const managed = config.operation !== "pack" && !(config.operation === "import" && config.solutionType === "unmanaged");
  if (stack.length || manifests !== 1 || value("UniqueName") !== config.solutionName || value("Version") !== config.solutionVersion
      || value("Managed") !== (managed ? "1" : "0")
      || (config.operation === "pack" && value("Publisher/CustomizationPrefix") !== config.publisherPrefix)) {
    stop("SOLUTION_IDENTITY_MISMATCH", "The ZIP solution name, version, managed state or publisher differs from reviewed intent.");
  }
  return archive.sha256;
}

function settingsInput(bytes) {
  let value;
  try { value = JSON.parse(bytes.toString("utf8")); }
  catch { stop("SETTINGS_INVALID", "Deployment settings must be reviewed nonsecret JSON."); }
  const short = { type: "string", minLength: 1, maxLength: 256 };
  validateShape({
    type: "object", additionalProperties: false,
    properties: {
      EnvironmentVariables: {
        type: "array", maxItems: 256, items: {
          type: "object", additionalProperties: false, required: ["SchemaName", "Value"],
          properties: { SchemaName: short, Value: { type: "string", maxLength: 4096 } }
        }
      },
      ConnectionReferences: {
        type: "array", maxItems: 256, items: {
          type: "object", additionalProperties: false, required: ["LogicalName", "ConnectionId", "ConnectorId"],
          properties: { LogicalName: short, ConnectionId: short, ConnectorId: { type: "string", minLength: 1, maxLength: 1024 } }
        }
      }
    }
  }, value, "nonsecret solution settings");
  if ((value.EnvironmentVariables ?? []).some((item) => /secret|password|token|credential|connection.?string|api.?key/i.test(item.SchemaName))) {
    stop("CREDENTIAL_REJECTED", "Secret-valued environment variables require a separate secure operator workflow.");
  }
  rejectSecrets(value);
}

function outcome(config, status, evidenceSha256, mutationAccepted, messageCode) {
  return validatePlatformOutcome({
    status, responseId: null, resourceIds: [config.botId ?? config.solutionName],
    version: config.solutionVersion ?? null, mutationAccepted, publicationVerified: false, evidenceSha256, messageCode
  });
}

export async function createPacProvider(rawContext, dependencies = {}) {
  const config = structuredClone(validateConfig(rawContext.request?.copilotStudio));
  if (config.solutionType === "unmanaged" && rawContext.request.environment !== "development") {
    stop("UNMANAGED_IMPORT_NOT_ALLOWED", "Unmanaged solution import must be explicitly selected for a development request; staging and production require managed artifacts.");
  }
  const context = await checkedContext({
    ...rawContext, request: { ...structuredClone(rawContext.request), copilotStudio: config },
    profile: structuredClone(rawContext.profile)
  }, dependencies, "pac", config.operation === "pack");
  let attempted = false;
  const outputRelative = config.outputFile ?? (config.outputDirectory ? `${relativePath(config.outputDirectory)}/${config.outputFileName}` : null);

  async function inputs() {
    const result = {};
    if (config.operation === "pack") result.tree = await sourceTree(context, config.projectDirectory, config.sourceFiles);
    if (config.solution) {
      result.solution = await reviewedFile(context.root, config.solution);
      solutionIdentity(result.solution, config);
    }
    if (config.settings) {
      result.settings = await reviewedFile(context.root, config.settings, 1_048_576);
      settingsInput(result.settings);
    }
    if (outputRelative) await outputPath(context, outputRelative);
    result.sha256 = digest({
      config, source: result.tree?.sha256 ?? null,
      solution: result.solution ? digest(result.solution) : null,
      settings: result.settings ? digest(result.settings) : null
    });
    return result;
  }

  async function preflight() {
    const reviewed = await inputs();
    const cli = await cliPreflight("pac", config, context, context.root, dependencies, config.operation === "pack");
    if ((await inputs()).sha256 !== reviewed.sha256) stop("INPUT_DRIFT", "Reviewed inputs changed during platform preflight.");
    return { reviewed, cli };
  }

  async function statusEvidence() {
    if (!config.botId) return null;
    const result = await invokeCli("pac", ["copilot", "status", "--bot-id", config.botId, "--environment", config.environment], { cwd: context.root, timeoutMs: 30_000 }, dependencies);
    if (!result.stdout.trim()) stop("CLI_EVIDENCE_INVALID", "PAC status returned no usable evidence; publication and conversation health remain unverified.");
    return digest(result);
  }

  return guardedProvider({
    async probe() {
      const { reviewed, cli } = await preflight();
      const statusSha256 = await statusEvidence();
      return validatePlatformSnapshot({
        target: "copilot-studio", ...cli,
        configurationSha256: digest({ inputs: reviewed.sha256, statusSha256 }),
        resourceIds: config.botId ? [config.botId] : [], version: null,
        phase: config.operation === "pack" ? "ready" : "unknown"
      });
    },
    async execute(operation, receipt = null) {
      if (operation !== config.operation) stop("CLI_OPERATION_REJECTED", "The PAC operation was not selected in the reviewed configuration.");
      if (receipt !== null || attempted) stop("CLI_REPLAY_REJECTED", "A prior or uncertain operation cannot be blindly retried; use core reconciliation.");
      const { reviewed } = await preflight();
      if (outputRelative) await outputPath(context, outputRelative, { fresh: true });
      await makeDirectory(context.root, context.workDirectory);
      const args = [];
      let staged = null;
      if (operation === "pack") {
        staged = await stageSource(context, reviewed.tree, "pac");
        const output = await outputPath(context, config.outputDirectory, { directory: true, fresh: true });
        await makeDirectory(context.root, config.outputDirectory);
        args.push("copilot", "pack", "--publisher-prefix", config.publisherPrefix, "--project-dir", staged.absolute,
          "--output-path", output, "--solution-name", config.solutionName);
      } else if (operation === "import") {
        const solution = `${context.workDirectory}/pac-input/solution.zip`;
        await immutableFile(context.root, solution, reviewed.solution);
        args.push("solution", "import", "--path", await checkedPath(context.root, solution), "--environment", config.environment);
        if (reviewed.settings) {
          const settings = `${context.workDirectory}/pac-input/settings.json`;
          await immutableFile(context.root, settings, reviewed.settings);
          args.push("--settings-file", await checkedPath(context.root, settings));
        }
      } else if (operation === "publish") {
        args.push("copilot", "publish", "--bot", config.botId, "--environment", config.environment);
      } else {
        await makeDirectory(context.root, path.posix.dirname(relativePath(outputRelative)));
        args.push("solution", "export", "--name", config.solutionName, "--environment", config.environment,
          "--managed", "--path", await outputPath(context, outputRelative, { fresh: true }));
      }
      if ((await inputs()).sha256 !== reviewed.sha256) stop("INPUT_DRIFT", "Reviewed PAC inputs changed before execution.");
      if (staged) await verifyStaged(context, staged.folder, staged.references);
      if (operation === "import") {
        await reviewedFile(context.root, { path: `${context.workDirectory}/pac-input/solution.zip`, sha256: digest(reviewed.solution) });
        if (reviewed.settings) await reviewedFile(context.root, { path: `${context.workDirectory}/pac-input/settings.json`, sha256: digest(reviewed.settings) });
      }
      attempted = true;
      const result = await invokeCli("pac", args, { cwd: context.work, timeoutMs: 120_000 }, dependencies);
      if (outputRelative) {
        const bytes = await readBytes(context.root, outputRelative, { maximum: 33_554_432 });
        return outcome(config, "packaged", solutionIdentity(bytes, config), false,
          operation === "pack" ? "PAC_PACKAGE_VALIDATED" : "PAC_MANAGED_EXPORT_VALIDATED");
      }
      return outcome(config, operation === "import" ? "imported" : "publication-submitted",
        digest({ operation, inputs: reviewed.sha256, response: result }), true,
        operation === "import" ? "PAC_IMPORT_ACCEPTED_NOT_PUBLISHED" : "PAC_PUBLICATION_ACCEPTED_UNVERIFIED");
    },
    async verify(receipt) {
      validatePlatformOutcome(receipt);
      const { reviewed } = await preflight();
      if (outputRelative) {
        const actual = solutionIdentity(await readBytes(context.root, outputRelative, { maximum: 33_554_432 }), config);
        if (receipt.status !== "packaged" || receipt.evidenceSha256 !== actual) stop("ARTIFACT_DRIFT", "The retained solution ZIP differs from accepted artifact evidence.");
        return outcome(config, "packaged", actual, false, "PAC_RETAINED_ARTIFACT_VERIFIED");
      }
      const statusSha256 = await statusEvidence();
      return outcome(config, config.operation === "publish" ? "publication-submitted" : "verification-required",
        digest({ inputs: reviewed.sha256, accepted: receipt.evidenceSha256, statusSha256 }),
        receipt.mutationAccepted, "PAC_OPERATOR_VERIFICATION_REQUIRED");
    },
    async rollback() {
      stop("RECOVERY_REQUIRED", "PAC has no documented atomic rollback. Retain the approved managed solution ZIP and settings; review compatible reimport or environment restore separately. Installed managed solutions cannot be exported; upgrade flags are not rollback.");
    }
  });
}
