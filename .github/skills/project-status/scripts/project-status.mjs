#!/usr/bin/env node

import { execFileSync } from "node:child_process";
import { existsSync } from "node:fs";
import { mkdir, readFile, realpath, writeFile } from "node:fs/promises";
import path from "node:path";
import process from "node:process";
import { fileURLToPath } from "node:url";

const SCRIPT_ROOT = path.dirname(fileURLToPath(import.meta.url));
const DEFAULT_ROOT = path.resolve(SCRIPT_ROOT, "..", "..", "..", "..");
const SYNC_FILES = ["reports/sync-status.json", "reports/syncs.json", "reports/workflow-telemetry.json"];
const AZURE_STATUSES = new Set(["not-configured", "unknown", "healthy", "degraded"]);
const DEPLOYMENT_STATUSES = new Set(["current", "outdated", "unknown", "not-deployed"]);
const SYNC_STATUSES = new Set(["failed", "stale", "healthy", "unknown"]);

function command(command, args, cwd) {
  try {
    if (process.platform === "win32" && command === "az") {
      if (args.some((value) => /[&|<>()^%!"\r\n]/.test(String(value)))) return null;
      const quote = (value) => /\s/.test(String(value)) ? `"${String(value)}"` : String(value);
      const commandLine = ["az.cmd", ...args.map(quote)].join(" ");
      return execFileSync(process.env.ComSpec || "cmd.exe", ["/d", "/c", commandLine], { cwd, encoding: "utf8", stdio: ["ignore", "pipe", "ignore"], windowsHide: true }).trim();
    }
    return execFileSync(command, args, { cwd, encoding: "utf8", stdio: ["ignore", "pipe", "ignore"], windowsHide: true }).trim();
  } catch { return null; }
}

function jsonFile(root, relative) {
  const file = path.join(root, relative);
  return existsSync(file) ? readFile(file, "utf8").then(JSON.parse).catch(() => null) : Promise.resolve(null);
}

function stringOrNull(value) {
  return typeof value === "string" && value.trim() ? value.trim() : null;
}

function finiteNumber(value, fallback, allowZero = false) {
  const number = Number(value);
  return Number.isFinite(number) && (allowZero ? number >= 0 : number > 0) ? number : fallback;
}

function normalizeSyncs(value, now) {
  const syncs = Array.isArray(value?.syncs) ? value.syncs : Array.isArray(value) ? value : [];
  return syncs.map((sync) => {
    const lastSuccessValue = sync.lastSuccessfulAt || sync.lastCompletedAt || sync.heartbeatAt || null;
    const parsedLastSuccess = typeof lastSuccessValue === "string" ? Date.parse(lastSuccessValue) : NaN;
    const lastSuccess = Number.isFinite(parsedLastSuccess) ? new Date(parsedLastSuccess).toISOString() : null;
    const intervalMinutes = finiteNumber(sync.expectedIntervalMinutes ?? sync.intervalMinutes, 60);
    const graceMinutes = finiteNumber(sync.graceMinutes, intervalMinutes, true);
    const last = lastSuccess ? parsedLastSuccess : NaN;
    const future = Number.isFinite(last) && last > now;
    const status = sync.status === "failed" || sync.lastRunStatus === "failed" ? "failed"
      : future ? "unknown"
      : Number.isFinite(last) && now - last > (intervalMinutes + graceMinutes) * 60_000 ? "stale"
      : Number.isFinite(last) ? "healthy" : "unknown";
    const lastError = stringOrNull(sync.lastError || sync.error) ?? (future ? "Success timestamp is in the future; freshness cannot be established." : null);
    return { name: String(sync.name || sync.id || "unnamed-sync"), status, lastSuccess, lastError, expectedIntervalMinutes: intervalMinutes, graceMinutes };
  });
}

function azureProjectToken(projectName) {
  const token = String(projectName || "").trim().toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "");
  if (!token) throw new Error("Project name must contain at least one letter or number");
  return token;
}

function expectedResourceGroup(projectName) {
  return `rg-${azureProjectToken(projectName)}`.slice(0, 90).replace(/-+$/g, "");
}

function normalizeResources(output) {
  if (!output) return null;
  let parsed;
  try { parsed = JSON.parse(output); } catch { return null; }
  if (!Array.isArray(parsed)) return null;
  const resources = [];
  for (const value of parsed) {
    if (!value || typeof value !== "object" || Array.isArray(value)) return null;
    const name = stringOrNull(value.name);
    const type = stringOrNull(value.type);
    const resourceGroup = stringOrNull(value.resourceGroup);
    if (!name || !type || !resourceGroup) return null;
    const location = stringOrNull(value.location);
    const provisioningState = stringOrNull(value.provisioningState);
    const runtimeState = stringOrNull(value.runtimeState);
    const unhealthyProvisioning = provisioningState && provisioningState.toLowerCase() !== "succeeded";
    const isWebApp = type.toLowerCase() === "microsoft.web/sites";
    const unhealthyRuntime = isWebApp && runtimeState && runtimeState.toLowerCase() !== "running";
    const status = unhealthyProvisioning || unhealthyRuntime ? "degraded"
      : !provisioningState || (isWebApp && !runtimeState) ? "unknown"
      : "healthy";
    resources.push({ name, type, resourceGroup, location, provisioningState, runtimeState, status });
  }
  return resources;
}

function validateReport(report) {
  const errors = [];
  const exactObject = (value, fields, label) => {
    if (!value || typeof value !== "object" || Array.isArray(value)) { errors.push(`${label} must be an object`); return false; }
    for (const field of fields) if (!(field in value)) errors.push(`${label}.${field} is required`);
    for (const field of Object.keys(value)) if (!fields.includes(field)) errors.push(`${label}.${field} is not allowed`);
    return true;
  };
  const nullableString = (value) => value === null || typeof value === "string";
  exactObject(report, ["schemaVersion", "generatedAt", "project", "local", "azure", "syncs", "deployment", "limitations"], "report");
  if (report.schemaVersion !== "1.0.0") errors.push("schemaVersion must be 1.0.0");
  if (typeof report.generatedAt !== "string" || !Number.isFinite(Date.parse(report.generatedAt))) errors.push("generatedAt must be a date-time string");
  if (typeof report.project !== "string" || !report.project) errors.push("project must be a non-empty string");
  if (exactObject(report.local, ["head"], "local") && !nullableString(report.local.head)) errors.push("local.head must be a string or null");
  if (exactObject(report.azure, ["status", "cloud", "subscriptionId", "resourceGroup", "resources"], "azure")) {
    if (!AZURE_STATUSES.has(report.azure.status)) errors.push("azure.status is invalid");
    for (const field of ["cloud", "subscriptionId"]) if (!nullableString(report.azure[field])) errors.push(`azure.${field} must be a string or null`);
    if (typeof report.azure.resourceGroup !== "string" || !report.azure.resourceGroup) errors.push("azure.resourceGroup must be a non-empty string");
    if (!Array.isArray(report.azure.resources)) errors.push("azure.resources must be an array");
    else report.azure.resources.forEach((resource, index) => {
      if (!exactObject(resource, ["name", "type", "resourceGroup", "location", "provisioningState", "runtimeState", "status"], `azure.resources[${index}]`)) return;
      for (const field of ["name", "type", "resourceGroup"]) if (typeof resource[field] !== "string" || !resource[field]) errors.push(`azure.resources[${index}].${field} must be a non-empty string`);
      for (const field of ["location", "provisioningState", "runtimeState"]) if (!nullableString(resource[field])) errors.push(`azure.resources[${index}].${field} must be a string or null`);
      if (!["healthy", "degraded", "unknown"].includes(resource.status)) errors.push(`azure.resources[${index}].status is invalid`);
    });
  }
  if (!Array.isArray(report.syncs)) errors.push("syncs must be an array");
  else report.syncs.forEach((sync, index) => {
    if (!exactObject(sync, ["name", "status", "lastSuccess", "lastError", "expectedIntervalMinutes", "graceMinutes"], `syncs[${index}]`)) return;
    if (typeof sync.name !== "string" || !sync.name) errors.push(`syncs[${index}].name must be a non-empty string`);
    if (!SYNC_STATUSES.has(sync.status)) errors.push(`syncs[${index}].status is invalid`);
    for (const field of ["lastSuccess", "lastError"]) if (!nullableString(sync[field])) errors.push(`syncs[${index}].${field} must be a string or null`);
    if (sync.lastSuccess && !Number.isFinite(Date.parse(sync.lastSuccess))) errors.push(`syncs[${index}].lastSuccess must be a date-time string or null`);
    if (!Number.isFinite(sync.expectedIntervalMinutes) || sync.expectedIntervalMinutes <= 0) errors.push(`syncs[${index}].expectedIntervalMinutes must be positive`);
    if (!Number.isFinite(sync.graceMinutes) || sync.graceMinutes < 0) errors.push(`syncs[${index}].graceMinutes must be non-negative`);
  });
  if (exactObject(report.deployment, ["status", "localHead", "ciArtifact", "deployedMarker"], "deployment")) {
    if (!DEPLOYMENT_STATUSES.has(report.deployment.status)) errors.push("deployment.status is invalid");
    for (const field of ["localHead", "ciArtifact", "deployedMarker"]) if (!nullableString(report.deployment[field])) errors.push(`deployment.${field} must be a string or null`);
  }
  if (!Array.isArray(report.limitations) || report.limitations.some((value) => typeof value !== "string")) errors.push("limitations must be an array of strings");
  if (errors.length) throw new Error(`Project status report validation failed: ${errors.join("; ")}`);
}

async function build(root) {
  const head = command("git", ["rev-parse", "HEAD"], root);
  const [profile, deploymentSource, blueprint, manifest] = await Promise.all([
    jsonFile(root, ".azure/environment.json"),
    jsonFile(root, "reports/deployment-status.json"),
    jsonFile(root, "docs/PROJECT-BLUEPRINT.json"),
    jsonFile(root, "package.json")
  ]);
  const project = stringOrNull(blueprint?.project?.name) || stringOrNull(manifest?.name) || path.basename(root);
  const resourceGroup = stringOrNull(deploymentSource?.resourceGroupName) || stringOrNull(deploymentSource?.resourceGroup) || expectedResourceGroup(project);
  const limitations = [];
  let resources = [];
  let azureStatus = "not-configured";
  if (profile?.subscription?.subscriptionId && profile?.cloudEndpoints?.resourceManager) {
    const activeCloud = command("az", ["cloud", "show", "--query", "name", "-o", "tsv"], root);
    if (activeCloud !== profile.cloud) {
      azureStatus = "unknown";
      limitations.push(`Azure CLI active cloud is ${activeCloud || "unavailable"}; expected ${profile.cloud}.`);
    }
    else {
      const groupExists = command("az", ["group", "exists", "--name", resourceGroup, "--subscription", profile.subscription.subscriptionId, "-o", "tsv"], root);
      if (groupExists === "false") {
        azureStatus = "degraded";
        limitations.push(`Expected project resource group ${resourceGroup} was not found.`);
      } else if (groupExists !== "true") {
        azureStatus = "unknown";
        limitations.push(`The current Azure CLI identity could not verify project resource group ${resourceGroup}.`);
      } else {
        const output = command("az", ["resource", "list", "--resource-group", resourceGroup, "--subscription", profile.subscription.subscriptionId, "--query", "[].{name:name,type:type,resourceGroup:resourceGroup,location:location,provisioningState:properties.provisioningState,runtimeState:properties.state}", "-o", "json"], root);
        const inventory = normalizeResources(output);
        if (!inventory) {
          azureStatus = "unknown";
          limitations.push("Azure returned an unavailable or malformed project resource inventory.");
        } else {
          resources = inventory;
          azureStatus = resources.length === 0 || resources.some((resource) => resource.status === "degraded") ? "degraded"
            : resources.some((resource) => resource.status === "unknown") ? "unknown"
            : "healthy";
          if (resources.length === 0) limitations.push(`Project resource group ${resourceGroup} contains no resources.`);
        }
      }
    }
  } else if (profile) {
    azureStatus = "unknown";
    limitations.push("Azure profile is missing a discovered endpoint catalog or subscription ID; run azure-discovery.");
  }
  const syncSource = await Promise.all(SYNC_FILES.map((file) => jsonFile(root, file))).then((items) => items.find(Boolean));
  const syncs = normalizeSyncs(syncSource, Date.now());
  if (!syncSource) limitations.push("No sync status, heartbeat, or telemetry report was found.");
  const deployedCommit = stringOrNull(deploymentSource?.deployedCommit);
  const deployedMarker = deployedCommit || stringOrNull(deploymentSource?.buildId) || stringOrNull(deploymentSource?.version);
  const ciArtifact = stringOrNull(deploymentSource?.validatedArtifact) || stringOrNull(deploymentSource?.ciCommit);
  const ciCommit = stringOrNull(deploymentSource?.ciCommit);
  const deploymentStatus = !deployedMarker ? (profile?.subscription?.subscriptionId ? "unknown" : "not-deployed")
    : !deployedCommit || !head ? "unknown"
    : deployedCommit !== head || (ciCommit && ciCommit !== head) ? "outdated"
    : "current";
  if (deploymentStatus === "unknown") limitations.push("No deployed build/version marker was found; deployment currency is unknown.");
  return { schemaVersion: "1.0.0", generatedAt: new Date().toISOString(), project, local: { head }, azure: { status: azureStatus, cloud: profile?.cloud || null, subscriptionId: profile?.subscription?.subscriptionId || null, resourceGroup, resources }, syncs, deployment: { status: deploymentStatus, localHead: head, ciArtifact, deployedMarker }, limitations };
}

function markdown(report) {
  return `# Project Status: ${report.project}\n\n- Generated: ${report.generatedAt}\n- Local HEAD: ${report.local.head || "unknown"}\n- Azure: ${report.azure.status}${report.azure.cloud ? ` (${report.azure.cloud})` : ""}\n- Azure resources: ${report.azure.resources.length}\n- Deployment: ${report.deployment.status}\n\n## Syncs\n\n${report.syncs.length ? report.syncs.map((sync) => `- ${sync.name}: ${sync.status}${sync.lastSuccess ? `; last success ${sync.lastSuccess}` : ""}${sync.lastError ? `; error ${sync.lastError}` : ""}`).join("\n") : "- No observable sync evidence."}\n\n## Limitations\n\n${report.limitations.length ? report.limitations.map((item) => `- ${item}`).join("\n") : "- None."}\n`;
}

const root = await realpath(path.resolve(process.argv.includes("--root") ? process.argv[process.argv.indexOf("--root") + 1] : DEFAULT_ROOT));
const report = await build(root);
validateReport(report);
await mkdir(path.join(root, "reports"), { recursive: true });
await writeFile(path.join(root, "reports", "project-status.json"), `${JSON.stringify(report, null, 2)}\n`, "utf8");
await writeFile(path.join(root, "reports", "project-status.md"), markdown(report), "utf8");
console.log(`Project status: ${report.deployment.status}; Azure ${report.azure.status}; ${report.syncs.length} observable syncs`);