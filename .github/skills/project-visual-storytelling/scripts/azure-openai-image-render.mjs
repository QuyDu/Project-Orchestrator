#!/usr/bin/env node
import { createHash } from "node:crypto";
import { spawnSync } from "node:child_process";
import { readFile, writeFile } from "node:fs/promises";
import path from "node:path";

const DISCOVERY_PATH = "reports/azure-discovery.json";
const ENVIRONMENT_PATH = ".azure/environment.json";
const MAX_DISCOVERY_AGE_MS = 14 * 24 * 60 * 60 * 1000;
const GPT_IMAGE_MODEL_PATTERN = /^gpt-image-2(?:$|[-.][A-Za-z0-9][A-Za-z0-9.-]{0,80})$/u;
const GOVERNMENT_ENDPOINT_PATTERN = /^https:\/\/[a-z0-9-]+\.openai\.azure\.us$/u;
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

function discoveryQualifies(discovery, deploymentModel, location) {
  const imageGeneration = discovery.imageGeneration;
  const model = imageGeneration?.models?.find((entry) => entry?.name === deploymentModel);
  const deployments = imageGeneration?.existingDeployments;
  return imageGeneration?.catalogQuerySucceeded === true
    && imageGeneration.available === true
    && imageGeneration.selectedModelName === deploymentModel
    && imageGeneration.selectedProvider === "azure-openai"
    && imageGeneration.selectedMaturity === "generally-available"
    && imageGeneration.requiresExplicitAcceptance === false
    && model?.provider === "azure-openai"
    && model.maturity === "generally-available"
    && model.available === true
    && /^OpenAI$/iu.test(model.format || "")
    && Array.isArray(model.regions)
    && model.regions.includes(location)
    && deployments?.querySucceeded === true
    && deployments.available === true
    && Array.isArray(deployments.regions)
    && deployments.regions.includes(location)
    && Array.isArray(deployments.models)
    && deployments.models.includes(deploymentModel)
    && Array.isArray(deployments.formats)
    && deployments.formats.some((format) => /^OpenAI$/iu.test(format));
}

export async function inspectAzureOpenAIImage(root) {
  const endpoint = (process.env.PROJECT_VISUAL_AZURE_OPENAI_ENDPOINT || "").replace(/\/$/u, "");
  const deployment = process.env.PROJECT_VISUAL_AZURE_OPENAI_DEPLOYMENT || "";
  const deploymentModel = process.env.PROJECT_VISUAL_AZURE_OPENAI_MODEL || "";
  const unavailable = (reason) => ({ available: false, rendererClass: "bitmap-generation", provider: "azure-openai", reason });
  const environment = await readJson(root, ENVIRONMENT_PATH);
  if (environment.error) return unavailable(environment.error);
  if (environment.cloud !== "AzureUSGovernment") return unavailable("Azure OpenAI image generation is restricted to AzureUSGovernment for this project");
  if (!GOVERNMENT_ENDPOINT_PATTERN.test(endpoint)) return unavailable("PROJECT_VISUAL_AZURE_OPENAI_ENDPOINT is missing or is not an Azure Government OpenAI endpoint");
  if (!/^[A-Za-z0-9][A-Za-z0-9._-]{0,127}$/u.test(deployment)) return unavailable("PROJECT_VISUAL_AZURE_OPENAI_DEPLOYMENT is missing or invalid");
  if (!GPT_IMAGE_MODEL_PATTERN.test(deploymentModel)) return unavailable("PROJECT_VISUAL_AZURE_OPENAI_MODEL is missing or does not support exact landscape dimensions");

  const discovery = await readJson(root, DISCOVERY_PATH);
  if (discovery.error) return unavailable(discovery.error);
  const discoveredAt = Date.parse(discovery.discoveredAt || "");
  if (discovery.cloud !== "AzureUSGovernment" || !Number.isFinite(discoveredAt) || Date.now() - discoveredAt > MAX_DISCOVERY_AGE_MS) {
    return unavailable("Azure Government discovery evidence is missing, mismatched, or older than 14 days");
  }
  if (!discoveryQualifies(discovery, deploymentModel, environment.location)) {
    return unavailable(`${deploymentModel} is not the current discovery-selected Azure OpenAI model with a matching existing Government deployment`);
  }
  return {
    available: true,
    rendererClass: "bitmap-generation",
    provider: "azure-openai",
    endpoint,
    deployment,
    deploymentModel,
    modelMaturity: "generally-available",
    cloud: "AzureUSGovernment",
    location: environment.location,
    discoveredAt: discovery.discoveredAt,
    apiPath: "/openai/v1/images/generations?api-version=preview",
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

export function supportsAzureOpenAIImageDimensions(width, height) {
  const pixels = width * height;
  const ratio = Math.max(width, height) / Math.min(width, height);
  return Number.isInteger(width) && Number.isInteger(height) && width > 0 && height > 0 && width % 16 === 0 && height % 16 === 0
    && Math.max(width, height) <= 3_840 && pixels >= 655_360 && pixels <= 8_294_400 && ratio <= 3;
}

function validateGenerationInput({ prompt, width, height }) {
  if (typeof prompt !== "string" || !prompt.trim() || prompt.length > 4_000 || /[\u0000-\u001f\u007f]/u.test(prompt)) {
    throw new Error("Azure OpenAI image prompt must be printable text between 1 and 4000 characters");
  }
  if (!supportsAzureOpenAIImageDimensions(width, height)) {
    throw new Error("Azure OpenAI image dimensions must satisfy GPT Image 2 exact-size limits");
  }
}

function decodePng(encoded, width, height) {
  if (typeof encoded !== "string" || encoded.length < 100 || encoded.length > 32 * 1024 * 1024 || encoded.length % 4 !== 0 || !/^[A-Za-z0-9+/]+={0,2}$/u.test(encoded)) {
    throw new Error("Azure OpenAI response does not contain one bounded base64 PNG");
  }
  const image = Buffer.from(encoded, "base64");
  if (image.length < 1_024 || !image.subarray(0, 8).equals(PNG_SIGNATURE) || image.toString("ascii", 12, 16) !== "IHDR") {
    throw new Error("Azure OpenAI response is not a valid nonempty PNG");
  }
  if (image.readUInt32BE(16) !== width || image.readUInt32BE(20) !== height) throw new Error("Azure OpenAI PNG dimensions do not match the request");
  return image;
}

export async function generateAzureOpenAIImage({ capability, prompt, width, height, outputPath, renderPlanSha256, fetchImpl = globalThis.fetch, tokenProvider = getGovernmentToken }) {
  if (!capability?.available || capability.cloud !== "AzureUSGovernment" || capability.provider !== "azure-openai") {
    throw new Error("Azure OpenAI image capability is not qualified for Azure Government");
  }
  validateGenerationInput({ prompt, width, height });
  if (typeof fetchImpl !== "function" || typeof tokenProvider !== "function") throw new Error("Azure OpenAI image transport is unavailable");
  const token = await tokenProvider();
  if (typeof token !== "string" || !token || token.length > 16_384 || /[\u0000-\u0020\u007f]/u.test(token)) throw new Error("Azure OpenAI image authentication did not return a bounded bearer token");
  const response = await fetchImpl(`${capability.endpoint}${capability.apiPath}`, {
    method: "POST",
    headers: {
      "Authorization": `Bearer ${token}`,
      "Content-Type": "application/json"
    },
    body: JSON.stringify({
      model: capability.deployment,
      prompt,
      size: `${width}x${height}`,
      n: 1,
      quality: "high",
      output_format: "png"
    }),
    signal: AbortSignal.timeout(120_000)
  });
  if (!response.ok) throw new Error(`Azure OpenAI image request failed with HTTP ${response.status}: ${(await response.text()).slice(0, 800)}`);
  const result = await response.json();
  const image = decodePng(result?.data?.[0]?.b64_json, width, height);
  await writeFile(outputPath, image, { flag: "wx", mode: 0o600 });
  return {
    schemaVersion: "1.0.0",
    status: "rendered",
    rendererClass: "bitmap-generation",
    provider: "azure-openai",
    tool: capability.deploymentModel,
    deployment: capability.deployment,
    modelMaturity: capability.modelMaturity,
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