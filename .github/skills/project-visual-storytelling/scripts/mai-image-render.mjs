#!/usr/bin/env node
import { createHash } from "node:crypto";
import { spawnSync } from "node:child_process";
import { readFile, writeFile } from "node:fs/promises";
import path from "node:path";

const DISCOVERY_PATH = "reports/azure-discovery.json";
const ENVIRONMENT_PATH = ".azure/environment.json";
const MAX_DISCOVERY_AGE_MS = 14 * 24 * 60 * 60 * 1000;
const MAI_MODEL_PATTERN = /^MAI-Image-(?:2\.5(?:-Pro|-Flash)?|2\.6(?:-Flash)?)$/u;
const GOVERNMENT_ENDPOINT_PATTERN = /^https:\/\/[a-z0-9-]+\.services\.ai\.azure\.us$/u;
const PNG_SIGNATURE = Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]);

function sha256(value) {
  return createHash("sha256").update(value).digest("hex");
}

async function readJson(root, relativePath) {
  try {
    return JSON.parse(await readFile(path.join(root, ...relativePath.split("/")), "utf8"));
  } catch (error) {
    return { error: error.code === "ENOENT" ? `${relativePath} is missing` : `${relativePath} is invalid: ${error.message}` };
  }
}

function discoveredImageModel(discovery, deploymentModel, location) {
  const models = discovery.imageGeneration?.models;
  if (!Array.isArray(models)) return false;
  return models.some((entry) => entry?.name === deploymentModel && entry?.available === true && Array.isArray(entry.regions) && entry.regions.includes(location));
}

export async function inspectMaiImage(root) {
  const endpoint = (process.env.PROJECT_VISUAL_MAI_ENDPOINT || "").replace(/\/$/u, "");
  const deployment = process.env.PROJECT_VISUAL_MAI_DEPLOYMENT || "";
  const deploymentModel = process.env.PROJECT_VISUAL_MAI_MODEL || "";
  const environment = await readJson(root, ENVIRONMENT_PATH);
  if (environment.error) return { available: false, rendererClass: "bitmap-generation", provider: "mai-image", reason: environment.error };
  if (environment.cloud !== "AzureUSGovernment") return { available: false, rendererClass: "bitmap-generation", provider: "mai-image", reason: "MAI-Image is restricted to AzureUSGovernment for this project" };
  if (!GOVERNMENT_ENDPOINT_PATTERN.test(endpoint)) return { available: false, rendererClass: "bitmap-generation", provider: "mai-image", reason: "PROJECT_VISUAL_MAI_ENDPOINT is missing or is not an Azure Government Foundry endpoint" };
  if (!/^[A-Za-z0-9][A-Za-z0-9._-]{0,127}$/u.test(deployment)) return { available: false, rendererClass: "bitmap-generation", provider: "mai-image", reason: "PROJECT_VISUAL_MAI_DEPLOYMENT is missing or invalid" };
  if (!MAI_MODEL_PATTERN.test(deploymentModel)) return { available: false, rendererClass: "bitmap-generation", provider: "mai-image", reason: "PROJECT_VISUAL_MAI_MODEL is missing or unsupported" };

  const discovery = await readJson(root, DISCOVERY_PATH);
  if (discovery.error) return { available: false, rendererClass: "bitmap-generation", provider: "mai-image", reason: discovery.error };
  const discoveredAt = Date.parse(discovery.discoveredAt || "");
  if (discovery.cloud !== "AzureUSGovernment" || !Number.isFinite(discoveredAt) || Date.now() - discoveredAt > MAX_DISCOVERY_AGE_MS) {
    return { available: false, rendererClass: "bitmap-generation", provider: "mai-image", reason: "Azure Government discovery evidence is missing, mismatched, or older than 14 days" };
  }
  if (!discoveredImageModel(discovery, deploymentModel, environment.location)) {
    return { available: false, rendererClass: "bitmap-generation", provider: "mai-image", reason: `${deploymentModel} is not confirmed in current Azure Government discovery evidence` };
  }
  return {
    available: true,
    rendererClass: "bitmap-generation",
    provider: "mai-image",
    endpoint,
    deployment,
    deploymentModel,
    cloud: "AzureUSGovernment",
    location: environment.location,
    discoveredAt: discovery.discoveredAt,
    apiPath: "/mai/v1/images/generations",
    authentication: "microsoft-entra"
  };
}

function getGovernmentToken() {
  const result = spawnSync("az", ["account", "get-access-token", "--resource", "https://cognitiveservices.azure.us", "--query", "accessToken", "--output", "tsv"], {
    encoding: "utf8",
    env: process.env,
    windowsHide: true,
    timeout: 30_000,
    maxBuffer: 2 * 1024 * 1024
  });
  if (result.error) throw new Error(`Azure CLI token acquisition could not start: ${result.error.message}`);
  if (result.status !== 0 || !result.stdout.trim()) throw new Error(`Azure CLI did not return an Azure Government access token: ${(result.stderr || result.stdout).trim().slice(0, 500)}`);
  return result.stdout.trim();
}

function validateGenerationInput({ prompt, width, height }) {
  if (typeof prompt !== "string" || !prompt.trim() || prompt.length > 4_000 || /[\u0000-\u001f\u007f]/u.test(prompt)) throw new Error("MAI image prompt must be printable text between 1 and 4000 characters");
  if (!Number.isInteger(width) || !Number.isInteger(height) || width < 768 || height < 768 || width * height > 1_048_576) {
    throw new Error("MAI image dimensions must be at least 768x768 and no more than 1,048,576 total pixels");
  }
}

export async function generateMaiImage({ capability, prompt, width, height, outputPath, renderPlanSha256 }) {
  if (!capability?.available || capability.cloud !== "AzureUSGovernment") throw new Error("MAI-Image capability is not qualified for Azure Government");
  validateGenerationInput({ prompt, width, height });
  const response = await fetch(`${capability.endpoint}${capability.apiPath}`, {
    method: "POST",
    headers: {
      "Authorization": `Bearer ${getGovernmentToken()}`,
      "Content-Type": "application/json"
    },
    body: JSON.stringify({ model: capability.deployment, prompt, width, height, web_grounding: false }),
    signal: AbortSignal.timeout(120_000)
  });
  if (!response.ok) throw new Error(`MAI-Image request failed with HTTP ${response.status}: ${(await response.text()).slice(0, 800)}`);
  const result = await response.json();
  const encoded = result?.data?.[0]?.b64_json;
  if (typeof encoded !== "string" || encoded.length < 100 || encoded.length > 32 * 1024 * 1024) throw new Error("MAI-Image response does not contain one bounded base64 PNG");
  const image = Buffer.from(encoded, "base64");
  if (image.length < 1024 || !image.subarray(0, 8).equals(PNG_SIGNATURE)) throw new Error("MAI-Image response is not a valid nonempty PNG");
  await writeFile(outputPath, image, { flag: "wx", mode: 0o600 });
  return {
    schemaVersion: "1.0.0",
    status: "rendered",
    rendererClass: "bitmap-generation",
    provider: "mai-image",
    tool: capability.deploymentModel,
    deployment: capability.deployment,
    processingBoundary: "AzureUSGovernment",
    endpointHost: new URL(capability.endpoint).hostname,
    referencePixelsSupplied: false,
    webGrounding: false,
    promptSha256: sha256(prompt),
    renderPlanSha256,
    manualVisualInspectionRequired: true
  };
}