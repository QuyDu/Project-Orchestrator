import * as fs from "node:fs/promises";
import path from "node:path";
import { publishDiscovery } from "../../.github/skills/azure-discovery/scripts/discovery-cache.mjs";

const sourceRoot = path.resolve(import.meta.dirname, "..", "..");

export function azureProfile(overrides = {}) {
  return {
    schemaVersion: "1.0.0", cloud: "AzureCloud", location: "eastus",
    updatedAt: new Date().toISOString(), environmentName: "development", deploymentTool: "azure-cli",
    authentication: { method: "interactive" }, cloudEndpoints: null,
    mcp: { enabled: false, services: [], foundryExtensions: { requested: false, enabled: false, clientId: "" } },
    mutationPolicy: "approval-required",
    ...overrides,
    subscription: {
      tenantId: "00000000-0000-0000-0000-000000000001",
      subscriptionId: "00000000-0000-0000-0000-000000000002",
      subscriptionName: "Offline fixture",
      ...overrides.subscription
    }
  };
}

export function discoveryReport(profile = azureProfile(), overrides = {}) {
  return {
    schemaVersion: "1.0.0", discoveredAt: new Date().toISOString(),
    cloud: profile.cloud, location: profile.location,
    cognitiveAvailable: false, cognitiveRegions: [],
    openAIAvailable: false, openAIModelName: "", openAIModelVersion: "",
    openAIModelSku: "Standard", openAIApiVersion: "2024-10-01",
    ...overrides,
    imageGeneration: {
      catalogQuerySucceeded: true, available: false, models: [],
      selectedModelName: "", selectedModelVersion: "", selectedModelFormat: "",
      selectedModelSku: "", selectedProvider: "none", selectedMaturity: "none",
      requiresExplicitAcceptance: false,
      quota: { querySucceeded: false, matchFound: false, status: "unknown", currentValue: null, limit: null, unit: "" },
      existingDeployments: { querySucceeded: true, available: false, count: 0, regions: [], models: [], formats: [] },
      ...overrides.imageGeneration
    },
    speech: {
      serviceAvailable: false, serviceRegions: [], existingResourceQuerySucceeded: true,
      existingResourceAvailable: false, existingResourceCount: 0, existingResourceRegions: [], existingResourceKinds: [],
      ...overrides.speech
    }
  };
}

export function imageGeneration(modelName = "gpt-image-2", location = "usgovarizona") {
  const mai = modelName.startsWith("MAI-");
  const provider = mai ? "mai-image" : "azure-openai";
  const maturity = mai ? "preview" : "generally-available";
  const format = mai ? "Microsoft" : "OpenAI";
  return {
    catalogQuerySucceeded: true, available: true,
    models: [{ name: modelName, version: "2026-01-01", format, sku: "GlobalStandard", provider, maturity, available: true, regions: [location] }],
    selectedModelName: modelName, selectedModelVersion: "2026-01-01", selectedModelFormat: format,
    selectedModelSku: "GlobalStandard", selectedProvider: provider, selectedMaturity: maturity,
    requiresExplicitAcceptance: mai,
    quota: { querySucceeded: false, matchFound: false, status: "unknown", currentValue: null, limit: null, unit: "" },
    existingDeployments: { querySucceeded: true, available: true, count: 1, regions: [location], models: [modelName], formats: [format] }
  };
}

export async function installDiscoveryPackage(project) {
  const directory = path.join(project, ".github", "skills", "azure-discovery");
  await fs.mkdir(path.dirname(directory), { recursive: true });
  await fs.cp(path.join(sourceRoot, ".github", "skills", "azure-discovery"), directory, { recursive: true });
  await fs.mkdir(path.join(project, "schemas"), { recursive: true });
  await fs.copyFile(path.join(sourceRoot, "schemas", "azure-discovery.schema.json"), path.join(project, "schemas", "azure-discovery.schema.json"));
  await fs.mkdir(path.join(project, "infra"), { recursive: true });
  for (const name of ["discover.ps1", "azure-environment.ps1"]) {
    await fs.copyFile(path.join(sourceRoot, "templates", "project", "infra", name), path.join(project, "infra", name));
  }
}

export async function seedDiscovery(project, report = discoveryReport(), profile = azureProfile({ cloud: report.cloud, location: report.location }), options = {}) {
  await fs.mkdir(path.join(project, ".azure"), { recursive: true });
  await fs.writeFile(path.join(project, ".azure", "environment.json"), JSON.stringify(profile));
  return publishDiscovery(project, report, { now: Date.parse(report.discoveredAt), ...options });
}

export async function installFakeAzureCli(project, { profile = azureProfile(), report = discoveryReport(profile), fail = false } = {}) {
  const bin = path.join(project, "fake-azure-cli");
  await fs.mkdir(bin, { recursive: true });
  const log = path.join(bin, "calls.log");
  const configuration = path.join(bin, "configuration.json");
  await fs.writeFile(log, "");
  await fs.writeFile(configuration, JSON.stringify({ profile, report, fail }));
  const script = `#!/usr/bin/env node
const fs = require("node:fs");
const args = process.argv.slice(2);
const { profile, report, fail } = JSON.parse(fs.readFileSync(process.env.PSO_DISCOVERY_FAKE_CONFIG, "utf8"));
fs.appendFileSync(process.env.PSO_DISCOVERY_AZ_LOG, args.join(" ") + "\\n");
if (fail) { console.error("Offline Azure discovery failure"); process.exit(9); }
const query = args[args.indexOf("--query") + 1] || "";
const output = (value) => console.log(JSON.stringify(value));
if (args[0] === "cloud" && args[1] === "show") {
  const gov = profile.cloud === "AzureUSGovernment";
  if (args.includes("--query")) console.log(profile.cloud);
  else output({
    name: profile.cloud,
    endpoints: { resourceManager: gov ? "https://management.usgovcloudapi.net/" : "https://management.azure.com/", activeDirectory: gov ? "https://login.microsoftonline.us/" : "https://login.microsoftonline.com/", portal: gov ? "https://portal.azure.us/" : "https://portal.azure.com/" },
    suffixes: { storageEndpoint: gov ? "core.usgovcloudapi.net" : "core.windows.net", keyvaultDns: gov ? ".vault.usgovcloudapi.net" : ".vault.azure.net" }
  });
} else if (args[0] === "account" && args[1] === "show") {
  output({ tenantId: profile.subscription.tenantId, id: profile.subscription.subscriptionId, name: profile.subscription.subscriptionName });
} else if (args[0] === "account" && args[1] === "get-access-token") console.log("offline-fixture-token");
else if (args[0] === "cognitiveservices" && args[1] === "account" && args[2] === "list-skus") {
  const speech = args.includes("SpeechServices");
  const available = speech ? report.speech.serviceAvailable : report.cognitiveAvailable;
  output(available ? query === "[].locations" ? [speech ? report.speech.serviceRegions : [profile.location]] : [{ sku: "S0" }] : []);
} else if (args[0] === "cognitiveservices" && args[1] === "model" && args[2] === "list") {
  output(query.includes("sku:model.skus[0].name")
    ? report.openAIAvailable ? [{ name: report.openAIModelName, version: report.openAIModelVersion, sku: report.openAIModelSku }] : []
    : report.imageGeneration.models.map((item) => ({ name: item.name, version: item.version, format: item.format, skus: [{ name: item.sku }] })));
} else if (args[0] === "cognitiveservices" && args[1] === "usage" && args[2] === "list") output([]);
else if (args[0] === "cognitiveservices" && args[1] === "account" && args[2] === "list") {
  output(query.includes("kind=='SpeechServices'")
    ? Array.from({ length: report.speech.existingResourceCount }, (_, index) => ({ kind: report.speech.existingResourceKinds[index % report.speech.existingResourceKinds.length], location: report.speech.existingResourceRegions[index % report.speech.existingResourceRegions.length] }))
    : report.imageGeneration.existingDeployments.available ? [{ accountName: "offline-ai", resourceGroup: "rg-offline", location: profile.location }] : []);
} else if (args[0] === "cognitiveservices" && args[1] === "account" && args[2] === "deployment" && args[3] === "list") {
  output(report.imageGeneration.existingDeployments.models.map((name, index) => ({ modelName: name, modelFormat: report.imageGeneration.existingDeployments.formats[index] || report.imageGeneration.selectedModelFormat })));
} else if (args[0] === "keyvault" && args[1] === "list") output([]);
else if (!(args[0] === "account" && args[1] === "set" || args[0] === "cloud" && args[1] === "set")) {
  console.error("Unexpected fake Azure command"); process.exitCode = 8;
}
`;
  if (process.platform === "win32") {
    const file = path.join(bin, "fake-az.cjs");
    await fs.writeFile(file, script);
    await fs.writeFile(path.join(bin, "az.cmd"), `@echo off\r\n"${process.execPath}" "${file}" %*\r\n`);
  } else {
    const file = path.join(bin, "az");
    await fs.writeFile(file, script);
    await fs.chmod(file, 0o755);
  }
  return {
    log, configuration,
    env: { ...process.env, PATH: `${bin}${path.delimiter}${process.env.PATH}`, PSO_DISCOVERY_FAKE_CONFIG: configuration, PSO_DISCOVERY_AZ_LOG: log }
  };
}
