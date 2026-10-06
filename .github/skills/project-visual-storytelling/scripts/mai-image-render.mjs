#!/usr/bin/env node
import { createHash } from "node:crypto";
import { spawnSync } from "node:child_process";
import { readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { inspectCachedDiscovery } from "../../azure-discovery/scripts/discovery-cache.mjs";
import { decodeProviderPng, readImageResponse } from "./azure-openai-image-render.mjs";

const ENVIRONMENT_PATH = ".azure/environment.json";
const MAI_MODEL_PATTERN = /^MAI-Image-(?:2\.5(?:-Pro|-Flash)?|2\.6(?:-Flash)?)$/u;
const GOVERNMENT_ENDPOINT_PATTERN = /^https:\/\/[a-z0-9-]+\.services\.ai\.azure\.us$/u;

function sha256(value) {
  return createHash("sha256").update(value).digest("hex");
}

async function readJson(root, relativePath) {
  try {
    return JSON.parse((await readFile(path.join(root, ...relativePath.split("/")), "utf8")).replace(/^\uFEFF/u, ""));
  } catch (error) {
    return { error: error.code === "ENOENT" ? `${relativePath} is missing` : error instanceof SyntaxError ? `${relativePath} contains invalid JSON` : `${relativePath} is unreadable: ${error.message}` };
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
  const unavailable = (reason, refreshRequired = false) => ({ available: false, rendererClass: "bitmap-generation", provider: "mai-image", reason, refreshRequired });
  const environment = await readJson(root, ENVIRONMENT_PATH);
  if (environment.error) return { available: false, rendererClass: "bitmap-generation", provider: "mai-image", reason: environment.error };
  if (environment.cloud !== "AzureUSGovernment") return { available: false, rendererClass: "bitmap-generation", provider: "mai-image", reason: "MAI-Image is restricted to AzureUSGovernment for this project" };
  if (!GOVERNMENT_ENDPOINT_PATTERN.test(endpoint)) return { available: false, rendererClass: "bitmap-generation", provider: "mai-image", reason: "PROJECT_VISUAL_MAI_ENDPOINT is missing or is not an Azure Government Foundry endpoint" };
  if (!/^[A-Za-z0-9][A-Za-z0-9._-]{0,127}$/u.test(deployment)) return { available: false, rendererClass: "bitmap-generation", provider: "mai-image", reason: "PROJECT_VISUAL_MAI_DEPLOYMENT is missing or invalid" };
  if (!MAI_MODEL_PATTERN.test(deploymentModel)) return { available: false, rendererClass: "bitmap-generation", provider: "mai-image", reason: "PROJECT_VISUAL_MAI_MODEL is missing or unsupported" };

  let state;
  try { state = await inspectCachedDiscovery(root); }
  catch (error) { return unavailable(`Azure discovery is blocked: ${error.message}`); }
  if (state.status !== "fresh") return unavailable(`Azure discovery requires refresh: ${state.reason}; run azure-discovery.`, true);
  const discovery = state.report;
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

export function supportsMaiImageDimensions(width, height) {
  return Number.isInteger(width) && Number.isInteger(height) && width >= 768 && height >= 768 && width * height <= 1_048_576;
}

function validateGenerationInput({ prompt, width, height }) {
  if (typeof prompt !== "string" || !prompt.trim() || prompt.length > 4_000 || /[\u0000-\u001f\u007f]/u.test(prompt)) throw new Error("MAI image prompt must be printable text between 1 and 4000 characters");
  if (!supportsMaiImageDimensions(width, height)) {
    throw new Error("MAI image dimensions must be at least 768x768 and no more than 1,048,576 total pixels");
  }
}

export async function generateMaiImage({ capability, prompt, width, height, outputPath, renderPlanSha256, fetchImpl = globalThis.fetch, tokenProvider = getGovernmentToken }) {
  if (!capability?.available || capability.cloud !== "AzureUSGovernment") throw new Error("MAI-Image capability is not qualified for Azure Government");
  validateGenerationInput({ prompt, width, height });
  if (typeof fetchImpl !== "function" || typeof tokenProvider !== "function") throw new Error("MAI-Image transport is unavailable");
  const token = await tokenProvider();
  if (typeof token !== "string" || !token || token.length > 16_384 || /[\u0000-\u0020\u007f]/u.test(token)) throw new Error("MAI-Image authentication did not return a bounded bearer token");
  const response = await fetchImpl(`${capability.endpoint}${capability.apiPath}`, {
    method: "POST",
    headers: {
      "Authorization": `Bearer ${token}`,
      "Content-Type": "application/json"
    },
    body: JSON.stringify({ model: capability.deployment, prompt, width, height, web_grounding: false }),
    signal: AbortSignal.timeout(120_000)
  });
  const result = await readImageResponse(response, "MAI-Image");
  const image = decodeProviderPng(result?.data?.[0]?.b64_json, width, height, "MAI-Image");
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
    authentication: "microsoft-entra",
    referencePixelsSupplied: false,
    webGrounding: false,
    promptSha256: sha256(prompt),
    renderPlanSha256,
    manualVisualInspectionRequired: true
  };
}