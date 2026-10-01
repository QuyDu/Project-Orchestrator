import assert from "node:assert/strict";
import { chmod, mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { spawnSync } from "node:child_process";
import test from "node:test";
import { pathToFileURL } from "node:url";

const root = path.resolve(import.meta.dirname, "..");
const helper = path.join(root, ".github", "skills", "project-status", "scripts", "project-status.mjs");
const schemaFile = path.join(root, "schemas", "project-status.schema.json");

async function installFakeAzureCli(project) {
  const bin = path.join(project, "fake-az-bin");
  const fakeCli = path.join(bin, "fake-az.cjs");
  await mkdir(bin, { recursive: true });
  await writeFile(fakeCli, `#!/usr/bin/env node
const { appendFileSync } = require("node:fs");
const args = process.argv.slice(2);
appendFileSync(process.env.FAKE_AZ_LOG, JSON.stringify(args) + "\\n", "utf8");
if (args[0] === "cloud" && args[1] === "show") console.log("AzureUSGovernment");
else if (args[0] === "group" && args[1] === "exists") console.log("true");
else if (args[0] === "resource" && args[1] === "list") console.log(JSON.stringify([
  { name: "app-sample-project", type: "Microsoft.Web/sites", resourceGroup: "rg-sample-project", location: "usgovvirginia", provisioningState: "Succeeded", runtimeState: "Stopped" }
]));
else process.exitCode = 2;
`, "utf8");
  if (process.platform === "win32") {
    await writeFile(path.join(bin, "az.cmd"), `@echo off\r\n"${process.execPath}" "%~dp0fake-az.cjs" %*\r\n`, "utf8");
  } else {
    const executable = path.join(bin, "az");
    await writeFile(executable, await readFile(fakeCli, "utf8"), "utf8");
    await chmod(executable, 0o755);
  }
  return bin;
}

test("project-status marks failed and stale sync evidence and an older deployment marker", async () => {
  const project = await mkdtemp(path.join(os.tmpdir(), "pso-status-"));
  try {
    await mkdir(path.join(project, "reports"), { recursive: true });
    await writeFile(path.join(project, "README.md"), "# Status fixture\n", "utf8");
    assert.equal(spawnSync("git", ["init", "-q"], { cwd: project }).status, 0);
    assert.equal(spawnSync("git", ["add", "README.md"], { cwd: project }).status, 0);
    assert.equal(spawnSync("git", ["-c", "user.name=Project Status Test", "-c", "user.email=status@example.invalid", "commit", "-qm", "fixture"], { cwd: project }).status, 0);
    await writeFile(path.join(project, "reports", "sync-status.json"), JSON.stringify({ syncs: [
      { name: "failed-sync", status: "failed", lastError: "source unavailable" },
      { name: "stale-sync", lastSuccessfulAt: "2020-01-01", expectedIntervalMinutes: 5, graceMinutes: 5 }
    ] }), "utf8");
    await writeFile(path.join(project, "reports", "deployment-status.json"), JSON.stringify({ deployedCommit: "old-build", validatedArtifact: "old-build" }), "utf8");
    const result = spawnSync(process.execPath, [helper, "--root", project], { cwd: root, encoding: "utf8" });
    assert.equal(result.status, 0, `${result.stdout}\n${result.stderr}`);
    const status = JSON.parse(await readFile(path.join(project, "reports", "project-status.json"), "utf8"));
    assert.equal(status.azure.status, "not-configured");
    assert.equal(status.syncs.find((sync) => sync.name === "failed-sync").status, "failed");
    assert.equal(status.syncs.find((sync) => sync.name === "stale-sync").status, "stale");
    assert.equal(status.syncs.find((sync) => sync.name === "stale-sync").lastSuccess, "2020-01-01T00:00:00.000Z");
    assert.equal(status.deployment.status, "outdated");
  } finally {
    await rm(project, { recursive: true, force: true });
  }
});

test("project-status scopes Azure Government health to the target project resource group", async () => {
  const project = await mkdtemp(path.join(os.tmpdir(), "pso-status-azure-"));
  try {
    await mkdir(path.join(project, ".azure"), { recursive: true });
    await mkdir(path.join(project, "docs"), { recursive: true });
    await writeFile(path.join(project, ".azure", "environment.json"), JSON.stringify({
      cloud: "AzureUSGovernment",
      subscription: { subscriptionId: "00000000-0000-0000-0000-000000000001" },
      cloudEndpoints: { resourceManager: "https://management.usgovcloudapi.net/" }
    }), "utf8");
    await writeFile(path.join(project, "docs", "PROJECT-BLUEPRINT.json"), JSON.stringify({ project: { name: "sample-project" } }), "utf8");
    const fakeAzBin = await installFakeAzureCli(project);
    const logFile = path.join(project, "fake-az.log");
    const result = spawnSync(process.execPath, [helper, "--root", project], {
      cwd: root,
      encoding: "utf8",
      env: { ...process.env, PATH: `${fakeAzBin}${path.delimiter}${process.env.PATH || ""}`, FAKE_AZ_LOG: logFile }
    });
    assert.equal(result.status, 0, `${result.stdout}\n${result.stderr}`);
    const status = JSON.parse(await readFile(path.join(project, "reports", "project-status.json"), "utf8"));
    const calls = (await readFile(logFile, "utf8")).trim().split("\n").map(JSON.parse);
    assert.equal(status.azure.cloud, "AzureUSGovernment");
    assert.equal(status.azure.resourceGroup, "rg-sample-project");
    assert.equal(status.azure.status, "degraded", JSON.stringify({ limitations: status.limitations, calls }));
    assert.equal(status.azure.resources[0].runtimeState, "Stopped");

    const resourceCall = calls.find((args) => args[0] === "resource" && args[1] === "list");
    assert.ok(resourceCall, "expected an Azure resource inventory call");
    assert.deepEqual(resourceCall.slice(resourceCall.indexOf("--resource-group"), resourceCall.indexOf("--resource-group") + 2), ["--resource-group", "rg-sample-project"]);
    assert.ok(calls.some((args) => args[0] === "group" && args[1] === "exists"), "expected a resource-group existence check");
  } finally {
    await rm(project, { recursive: true, force: true });
  }
});

test("project-status schema constrains Azure resources and sync evidence", async () => {
  const schema = JSON.parse(await readFile(schemaFile, "utf8"));
  assert.equal(schema.$defs.resource.additionalProperties, false);
  assert.equal(schema.$defs.sync.additionalProperties, false);
  assert.deepEqual(schema.properties.azure.properties.resources.items, { $ref: "#/$defs/resource" });
  assert.deepEqual(schema.properties.syncs.items, { $ref: "#/$defs/sync" });
});

test("future success evidence is unknown even one millisecond ahead, while explicit failures stay failed", async () => {
  const project = await mkdtemp(path.join(os.tmpdir(), "pso-status-future-"));
  try {
    await mkdir(path.join(project, "reports"));
    const instant = "2026-10-01T10:00:00.000Z";
    const preload = path.join(project, "clock.mjs");
    await writeFile(preload, `const NativeDate = Date; globalThis.Date = class extends NativeDate { constructor(...args) { super(...(args.length ? args : [${JSON.stringify(instant)}])); } static now() { return NativeDate.parse(${JSON.stringify(instant)}); } };`);
    await writeFile(path.join(project, "reports", "sync-status.json"), JSON.stringify({ syncs: [
      { name: "current", lastSuccessfulAt: instant },
      { name: "one-ms-future", lastSuccessfulAt: "2026-10-01T10:00:00.001Z" },
      { name: "far-future", lastSuccessfulAt: "2099-01-01T00:00:00.000Z" },
      { name: "failed-future", status: "failed", lastSuccessfulAt: "2099-01-01T00:00:00.000Z", lastError: "actual failure" }
    ] }));
    const result = spawnSync(process.execPath, ["--import", pathToFileURL(preload).href, helper, "--root", project], { cwd: root, encoding: "utf8", timeout: 30000 });
    assert.equal(result.status, 0, result.stderr);
    const report = JSON.parse(await readFile(path.join(project, "reports", "project-status.json"), "utf8"));
    assert.deepEqual(report.syncs.map((sync) => sync.status), ["healthy", "unknown", "unknown", "failed"]);
    for (const sync of report.syncs.filter((entry) => entry.status === "unknown")) assert.match(sync.lastError, /future/i);
    assert.equal(report.syncs.at(-1).lastError, "actual failure");
    assert.equal(report.azure.status, "not-configured");
  } finally {
    await rm(project, { recursive: true, force: true });
  }
});