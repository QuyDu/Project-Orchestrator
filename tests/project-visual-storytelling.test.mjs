import assert from "node:assert/strict";
import { existsSync } from "node:fs";
import { lstat, mkdtemp, mkdir, readFile, readdir, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { spawn, spawnSync } from "node:child_process";
import test from "node:test";
import { pathToFileURL } from "node:url";
import { generateAzureOpenAIImage, inspectAzureOpenAIImage, supportsAzureOpenAIImageDimensions } from "../.github/skills/project-visual-storytelling/scripts/azure-openai-image-render.mjs";
import { generateMaiImage, inspectMaiImage, supportsMaiImageDimensions } from "../.github/skills/project-visual-storytelling/scripts/mai-image-render.mjs";
import { azureProfile, discoveryReport, imageGeneration, seedDiscovery, installDiscoveryPackage, installFakeAzureCli } from "./helpers/azure-discovery-fixture.mjs";
import { inspectCachedDiscovery } from "../.github/skills/azure-discovery/scripts/discovery-cache.mjs";

const root = path.resolve(import.meta.dirname, "..");
const helper = path.join(root, ".github", "skills", "project-visual-storytelling", "scripts", "project-visual-storytelling.mjs");
const governmentProfile = azureProfile({ cloud: "AzureUSGovernment", location: "usgovarizona" });

function imageReport(model = "gpt-image-2", at = Date.now()) {
  return discoveryReport(governmentProfile, { discoveredAt: new Date(at).toISOString(), imageGeneration: imageGeneration(model, governmentProfile.location) });
}

function run(args, cwd = root, env = process.env) {
  return spawnSync(process.execPath, [helper, ...args], { cwd, encoding: "utf8", env });
}

async function installMockAzureImageProvider(project) {
  const preload = path.join(project, "mock-image-fetch.mjs");
  await seedDiscovery(project, imageReport(), governmentProfile);
  await mkdir(path.join(project, ".skills-orchestrator"), { recursive: true });
  const requestLog = path.join(project, ".skills-orchestrator", "mock-image-requests.log");
  await writeFile(requestLog, "");
  await writeFile(preload, `import childProcess from "node:child_process";
import { syncBuiltinESMExports } from "node:module";
import { appendFileSync } from "node:fs";
const originalSpawnSync = childProcess.spawnSync;
childProcess.spawnSync = (command, ...args) => command === "az"
  ? { status: 0, stdout: "test-government-token\\n", stderr: "" }
  : originalSpawnSync(command, ...args);
syncBuiltinESMExports();
globalThis.fetch = async () => {
  appendFileSync(${JSON.stringify(requestLog)}, "image-request\\n");
  if (process.env.PSO_VISUAL_FAKE_HOLD === "1") {
    await new Promise((resolve) => {
      process.once("message", resolve);
      process.send("image-request-started");
    });
    process.disconnect();
  }
  if (process.env.PSO_VISUAL_FAKE_FAILURE === "1") return new Response("Offline image failure", { status: 503 });
  const image = Buffer.alloc(1024);
  Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]).copy(image, 0);
  image.write("IHDR", 12, "ascii");
  image.writeUInt32BE(1200, 16);
  image.writeUInt32BE(800, 20);
  return new Response(JSON.stringify({ data: [{ b64_json: image.toString("base64") }] }), { headers: { "content-type": "application/json" } });
};
`, "utf8");
  return {
    ...process.env,
    NODE_OPTIONS: `${process.env.NODE_OPTIONS || ""} --import=${pathToFileURL(preload).href}`.trim(),
    PROJECT_VISUAL_AZURE_OPENAI_ENDPOINT: "https://visual.openai.azure.us",
    PROJECT_VISUAL_AZURE_OPENAI_DEPLOYMENT: "visual-gpt-image",
    PROJECT_VISUAL_AZURE_OPENAI_MODEL: "gpt-image-2"
  };
}

function profile() {
  return {
    schemaVersion: "1.0.0",
    updatedAt: "2026-09-14T12:00:00.000Z",
    attribution: { publicLabel: "Platform Guide", visualSignature: "AI-assisted for Platform Guide" },
    perspective: { roles: ["technologist"], expertise: [], interests: [], audiences: ["technical practitioners"] },
    communication: {
      voiceTraits: ["practical", "curious", "direct"], tone: "Technically grounded.", detailLevel: "balanced", paragraphStyle: "short", humor: "light", challengeStyle: "socratic", firstPerson: "when-relevant", preferredPatterns: ["validation-checklist"], signatureLines: [], preferredTerms: [], avoidedTerms: []
    },
    reasoning: {
      coreValues: ["clarity"], aiStance: "Humans retain responsibility.", evidenceStandards: "Attribute claims.", validationApproach: "Validate before action.", incompleteEvidenceAction: "Run a bounded test."
    },
    contentDefaults: { outputTypes: ["article"], defaultAudience: "Technical practitioners", postWordRange: { minimum: 150, maximum: 250 }, hashtagCount: 6, timezone: "America/New_York", includeDiscussionQuestion: true },
    visualPreferences: { format: "landscape", aesthetic: "Hand-drawn workshop whiteboard", useDominantMetaphor: true, maximumZones: 5, palette: { focus: "purple", positive: "dark green", risk: "red", neutral: "black" }, requireAltText: true },
    safety: { treatSourcesAsUntrusted: true, excludeConfidentialContent: true, externalPublicationRequiresApproval: true, requireAttribution: true, additionalBoundaries: [] }
  };
}

const IMAGE_JSON_BYTE_LIMIT = 33 * 1024 * 1024;
const IMAGE_ERROR_BYTE_LIMIT = 8 * 1024;
const imageAdapters = [
  { provider: "azure-openai", generate: generateAzureOpenAIImage, endpoint: "https://visual.openai.azure.us", deploymentModel: "gpt-image-2" },
  { provider: "mai-image", generate: generateMaiImage, endpoint: "https://visual.services.ai.azure.us", deploymentModel: "MAI-Image-2.6" }
];

function headerPng() {
  const image = Buffer.alloc(1024);
  Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]).copy(image);
  image.write("IHDR", 12, "ascii");
  image.writeUInt32BE(1200, 16);
  image.writeUInt32BE(800, 20);
  return image;
}

function imageResponsePrefix() {
  return Buffer.from(JSON.stringify({ note: "Provider ☁ detail", data: [{ b64_json: headerPng().toString("base64") }] }));
}

function* paddedResponseChunks(prefix, bytes, trailing = false) {
  const split = prefix.indexOf(Buffer.from("☁")) + 1;
  yield prefix.subarray(0, split);
  yield prefix.subarray(split);
  const spaces = Buffer.alloc(64 * 1024, " ");
  for (let remaining = bytes - prefix.length; remaining > 0; remaining -= spaces.length) {
    yield spaces.subarray(0, Math.min(remaining, spaces.length));
  }
  if (trailing) yield Buffer.from("must not read after overflow");
}

function trackedImageResponse(chunks, { ok = true, contentLength = null, failReadAt = 0, failCancel = false, failRelease = false, bodyAbsent = false } = {}) {
  const iterator = chunks[Symbol.iterator]();
  const observed = { reads: 0, bytes: 0, cancellations: 0, releases: 0, fullBodyCalls: [] };
  const reader = {
    async read() {
      observed.reads += 1;
      if (observed.reads === failReadAt) throw new Error("Injected stream read failure");
      const next = iterator.next();
      if (next.value instanceof Uint8Array) observed.bytes += next.value.byteLength;
      return next;
    },
    async cancel() {
      observed.cancellations += 1;
      if (failCancel) throw new Error("Injected stream cancel failure");
      iterator.return?.();
    },
    releaseLock() {
      observed.releases += 1;
      if (failRelease) throw new Error("Injected stream release failure");
    }
  };
  const response = {
    ok, status: ok ? 200 : 503,
    headers: { get: (name) => name.toLowerCase() === "content-length" ? contentLength : null },
    body: bodyAbsent ? null : { getReader: () => reader }
  };
  for (const method of ["json", "text", "arrayBuffer"]) {
    response[method] = async () => {
      observed.fullBodyCalls.push(method);
      throw new Error(`Forbidden full-allocation response.${method}()`);
    };
  }
  return { response, observed };
}

function generateTrackedImage(adapter, response, outputPath) {
  return adapter.generate({
    capability: { available: true, cloud: "AzureUSGovernment", ...adapter, deployment: "test-image", apiPath: "/test-images", modelMaturity: "generally-available" },
    prompt: "Offline streamed image response regression.",
    width: 1200, height: 800, outputPath,
    renderPlanSha256: "a".repeat(64),
    tokenProvider: () => "test-government-token",
    fetchImpl: async () => response
  });
}

test("REM-0143 image adapters bound streamed JSON and error bytes at limit minus one, limit and limit plus one", async (t) => {
  const project = await mkdtemp(path.join(os.tmpdir(), "pso-image-stream-limits-"));
  let index = 0;
  try {
    for (const adapter of imageAdapters) {
      for (const ok of [true, false]) {
        const limit = ok ? IMAGE_JSON_BYTE_LIMIT : IMAGE_ERROR_BYTE_LIMIT;
        const prefix = ok ? imageResponsePrefix() : Buffer.from("Provider ☁ detail");
        for (const delta of [-1, 0, 1]) {
          for (const contentLength of [null, "1", String(limit * 2)]) {
            await t.test(`${adapter.provider} ${ok ? "JSON" : "HTTP error"} ${delta > 0 ? "+" : ""}${delta}, Content-Length=${contentLength}`, async () => {
              const outputPath = path.join(project, `candidate-${index++}.png`);
              const { response, observed } = trackedImageResponse(paddedResponseChunks(prefix, limit + delta, delta > 0), { ok, contentLength });
              if (ok && delta <= 0) {
                const report = await generateTrackedImage(adapter, response, outputPath);
                assert.equal(report.provider, adapter.provider);
                assert.deepEqual(await readFile(outputPath), headerPng());
              } else {
                await assert.rejects(generateTrackedImage(adapter, response, outputPath), (error) => {
                  if (delta > 0) assert.match(error.message, new RegExp(`${limit}-byte limit`));
                  else {
                    assert.match(error.message, /HTTP 503: Provider ☁ detail/);
                    assert.ok(error.message.length < 900, "provider diagnostics retain only a bounded preview");
                  }
                  return true;
                });
                assert.equal(existsSync(outputPath), false);
              }
              assert.equal(observed.bytes, limit + delta, "stop at the first over-limit chunk without reading its tail");
              assert.deepEqual(observed.fullBodyCalls, []);
              assert.equal(observed.cancellations, !ok || delta > 0 ? 1 : 0);
              assert.equal(observed.releases, 1);
            });
          }
        }
      }
    }
  } finally {
    await rm(project, { recursive: true, force: true, maxRetries: 5, retryDelay: 100 });
  }
});

test("REM-0143 image stream failures cancel and release without full-body fallback or output", async (t) => {
  const project = await mkdtemp(path.join(os.tmpdir(), "pso-image-stream-failures-"));
  let index = 0;
  try {
    for (const adapter of imageAdapters) {
      for (const scenario of [
        { name: "oversized first chunk", chunks: () => [Buffer.alloc(IMAGE_JSON_BYTE_LIMIT + 1), Buffer.from("unread tail")], expected: /byte limit/, reads: 1 },
        { name: "read failure", chunks: () => [Buffer.from("{")], options: { failReadAt: 2 }, expected: /stream read failure/, reads: 2 },
        { name: "non-byte chunk", chunks: () => ["not bytes"], expected: /byte chunk/, reads: 1 },
        { name: "invalid JSON", chunks: () => [Buffer.from("{broken")], expected: /invalid JSON/, reads: 2 },
        { name: "missing stream", chunks: () => [], options: { bodyAbsent: true }, expected: /readable.*body|readable.*stream/, reads: 0 },
        { name: "overflow with cancellation failure", chunks: () => [Buffer.alloc(IMAGE_JSON_BYTE_LIMIT + 1)], options: { failCancel: true }, expected: /cleanup failed/, reads: 1, causes: 2 },
        { name: "release failure", chunks: () => [imageResponsePrefix()], options: { failRelease: true }, expected: /cleanup failed/, reads: 2, causes: 1 },
        { name: "read and both cleanup failures", chunks: () => [], options: { failReadAt: 1, failCancel: true, failRelease: true }, expected: /cleanup failed/, reads: 1, causes: 3 }
      ]) {
        await t.test(`${adapter.provider}: ${scenario.name}`, async () => {
          const { response, observed } = trackedImageResponse(scenario.chunks(), scenario.options);
          const outputPath = path.join(project, `candidate-${index++}.png`);
          await assert.rejects(generateTrackedImage(adapter, response, outputPath), (error) => {
            assert.match(error.message, scenario.expected);
            if (scenario.causes) {
              assert.ok(error instanceof AggregateError);
              assert.equal(error.errors.length, scenario.causes);
            }
            return true;
          });
          assert.equal(existsSync(outputPath), false);
          assert.deepEqual(observed.fullBodyCalls, []);
          assert.equal(observed.reads, scenario.reads);
          assert.equal(observed.cancellations, scenario.name === "missing stream" || scenario.name === "release failure" ? 0 : 1);
          assert.equal(observed.releases, scenario.name === "missing stream" ? 0 : 1);
        });
      }
    }
  } finally {
    await rm(project, { recursive: true, force: true, maxRetries: 5, retryDelay: 100 });
  }
});

async function refreshFixture() {
  const project = await mkdtemp(path.join(os.tmpdir(), "pso-visual-discovery-refresh-"));
  await mkdir(path.join(project, ".skills-orchestrator"), { recursive: true });
  await mkdir(path.join(project, "src"));
  await writeFile(path.join(project, ".gitignore"), ".skills-orchestrator/\n.azure/\n");
  await writeFile(path.join(project, "README.md"), "# Offline Refresh Project\n\nVerified local source for a governed visual.\n");
  await writeFile(path.join(project, "src", "app.mjs"), "export const ready = true;\n");
  await writeFile(path.join(project, ".skills-orchestrator", "user-personalization.json"), JSON.stringify(profile()));
  await installDiscoveryPackage(project);
  const imageEnvironment = await installMockAzureImageProvider(project);
  const fake = await installFakeAzureCli(project, { profile: governmentProfile, report: imageReport() });
  const environment = { ...imageEnvironment, PATH: fake.env.PATH, PSO_DISCOVERY_FAKE_CONFIG: fake.env.PSO_DISCOVERY_FAKE_CONFIG, PSO_DISCOVERY_AZ_LOG: fake.log };
  return { project, fake, environment, requestLog: path.join(project, ".skills-orchestrator", "mock-image-requests.log") };
}

async function renderFixture() {
  const fixture = await refreshFixture();
  const preflight = run(["preflight", "--project", fixture.project, "--output-type", "whiteboard"], fixture.project, fixture.environment);
  assert.equal(preflight.status, 0, preflight.stderr);
  const context = JSON.parse(preflight.stdout);
  const directory = path.join(fixture.project, ...context.destination.directory.split("/"));
  const plan = JSON.parse(await readFile(path.join(root, "tests", "fixtures", "project-visual-storytelling", "whiteboard-render-plan.json"), "utf8"));
  plan.source.repositoryDigestSha256 = context.source.repositoryDigestSha256;
  plan.canvas = { width: 1200, height: 800, samples: 32 };
  const date = Object.fromEntries(new Intl.DateTimeFormat("en-CA", { timeZone: profile().contentDefaults.timezone, year: "numeric", month: "2-digit", day: "2-digit" }).formatToParts(new Date()).map((part) => [part.type, part.value]));
  plan.creationDate = `${date.year}-${date.month}-${date.day}`;
  await writeFile(path.join(directory, "render-plan.json"), `${JSON.stringify(plan, null, 2)}\n`);
  await writeFile(path.join(directory, "whiteboard-specification.md"), "Preserved specification.\n");
  await writeFile(path.join(directory, "whiteboard-alt-text.md"), "Preserved alt text.\n");
  return {
    ...fixture, directory,
    command: ["render", "--project", fixture.project, "--run-id", context.destination.runId, "--external-processing-approved", "true"]
  };
}

async function installRenderFault(fixture, fault) {
  const preload = path.join(fixture.project, "mock-render-fault.mjs");
  await writeFile(preload, `import fs from "node:fs/promises";
import path from "node:path";
import { syncBuiltinESMExports } from "node:module";
const directory = ${JSON.stringify(fixture.directory)};
const fault = ${JSON.stringify(fault)};
const imagePath = path.join(directory, "whiteboard-azure-openai-candidate.png");
const reportPath = path.join(directory, "renderer-qualification.json");
const originalWrite = fs.writeFile;
const originalLink = fs.link;
const originalRemove = fs.rm;
let collided = false;
async function compete(target) {
  const selected = fault === "image-collision" ? imagePath : reportPath;
  if (collided || !fault.endsWith("-collision") || target !== selected) return;
  collided = true;
  if (fault === "replacement-collision") await fs.rm(imagePath);
  if (fault === "image-collision" || fault === "replacement-collision") await originalWrite(imagePath, "concurrent image", { flag: "wx" });
  await originalWrite(reportPath, "concurrent qualification", { flag: "wx" });
}
fs.writeFile = async (target, content, options) => {
  await compete(target);
  const image = path.basename(target).endsWith("-candidate.png");
  const report = path.basename(target) === "renderer-qualification.json";
  if ((fault === "partial-image" && image) || (fault === "partial-report" && report)) {
    await originalWrite(target, "incomplete owned output", options);
    throw Object.assign(new Error("Injected partial write failure"), { code: "ENOSPC" });
  }
  if (fault === "invalid-qualification" && report) {
    content = JSON.stringify({ ...JSON.parse(content), renderPlanSha256: "f".repeat(64) });
  }
  return originalWrite(target, content, options);
};
fs.link = async (source, target) => {
  if (fault === "link-unavailable") {
    throw Object.assign(new Error("Injected unsupported hard-link publication"), { code: "ENOTSUP" });
  }
  await compete(target);
  return originalLink(source, target);
};
fs.rm = async (target, options) => {
  if (fault === "rollback-collision" && target === imagePath) {
    throw Object.assign(new Error("Injected rollback failure"), { code: "EACCES" });
  }
  return originalRemove(target, options);
};
syncBuiltinESMExports();
`, "utf8");
  return { ...fixture.environment, NODE_OPTIONS: `${fixture.environment.NODE_OPTIONS} --import=${pathToFileURL(preload).href}` };
}

async function removeRenderFixture(fixture) {
  await rm(fixture.project, { recursive: true, force: true, maxRetries: 5, retryDelay: 100 });
}

test("REM-0129 rejects existing outputs before discovery or rendering and preserves their bytes", async (t) => {
  for (const names of [
    ["whiteboard-azure-openai-candidate.png"],
    ["whiteboard-mai-candidate.png"],
    ["renderer-qualification.json"],
    ["whiteboard-azure-openai-candidate.png", "renderer-qualification.json"]
  ]) {
    await t.test(names.join(" + "), async () => {
      const fixture = await renderFixture();
      try {
        for (const name of names) await writeFile(path.join(fixture.directory, name), `prior ${name}`);
        for (const stale of [false, true]) {
          if (stale) await seedDiscovery(fixture.project, imageReport("gpt-image-2", Date.now() - 31 * 86_400_000), governmentProfile);
          const rejected = run(fixture.command, fixture.project, { ...fixture.environment, PSO_VISUAL_FAKE_FAILURE: "1" });
          assert.notEqual(rejected.status, 0);
          for (const name of names) assert.equal(await readFile(path.join(fixture.directory, name), "utf8"), `prior ${name}`);
          assert.match(rejected.stderr, /already exists/);
          assert.equal(await readFile(fixture.requestLog, "utf8"), "", "a rejected rerender must not invoke an image provider");
          assert.equal(await readFile(fixture.fake.log, "utf8"), "", "a rejected rerender must not refresh discovery");
          assert.equal(existsSync(path.join(fixture.directory, ".rendering")), false);
        }
      } finally {
        await removeRenderFixture(fixture);
      }
    });
  }
});

test("REM-0129 cleans owned partial writes and failed qualification without removing specifications", async (t) => {
  for (const fault of ["transport", "partial-image", "partial-report", "invalid-qualification"]) {
    await t.test(fault, async () => {
      const fixture = await renderFixture();
      try {
        const environment = fault === "transport"
          ? { ...fixture.environment, PSO_VISUAL_FAKE_FAILURE: "1" }
          : await installRenderFault(fixture, fault);
        const rejected = run(fixture.command, fixture.project, environment);
        assert.notEqual(rejected.status, 0);
        assert.match(rejected.stderr, /HTTP 503|Injected partial write failure|binding failed qualification/);
        assert.deepEqual((await readdir(fixture.directory)).sort(), ["render-context.json", "render-plan.json", "whiteboard-alt-text.md", "whiteboard-specification.md"]);
        assert.equal(await readFile(path.join(fixture.directory, "whiteboard-specification.md"), "utf8"), "Preserved specification.\n");
        assert.equal(await readFile(path.join(fixture.directory, "whiteboard-alt-text.md"), "utf8"), "Preserved alt text.\n");
        assert.equal(await readFile(fixture.requestLog, "utf8"), "image-request\n");
      } finally {
        await removeRenderFixture(fixture);
      }
    });
  }
});

test("REM-0129 preserves EEXIST winners while rolling back only its own publication", async (t) => {
  for (const fault of ["image-collision", "report-collision", "replacement-collision"]) {
    await t.test(fault, async () => {
      const fixture = await renderFixture();
      try {
        const rejected = run(fixture.command, fixture.project, await installRenderFault(fixture, fault));
        assert.notEqual(rejected.status, 0);
        assert.match(rejected.stderr, /EEXIST/);
        assert.equal(await readFile(path.join(fixture.directory, "renderer-qualification.json"), "utf8"), "concurrent qualification");
        const imagePath = path.join(fixture.directory, "whiteboard-azure-openai-candidate.png");
        if (fault === "report-collision") assert.equal(existsSync(imagePath), false, "the failed invocation must remove its own published image");
        else assert.equal(await readFile(imagePath, "utf8"), "concurrent image");
        assert.equal(existsSync(path.join(fixture.directory, ".rendering")), false);
        assert.equal(await readFile(fixture.requestLog, "utf8"), "image-request\n");
      } finally {
        await removeRenderFixture(fixture);
      }
    });
  }
});

test("REM-0129 rejects an existing reservation without cleaning another invocation's staging", async () => {
  const fixture = await renderFixture();
  try {
    const reservation = path.join(fixture.directory, ".rendering");
    await mkdir(reservation);
    await writeFile(path.join(reservation, "owned-by-other"), "other invocation");
    const rejected = run(fixture.command, fixture.project, fixture.environment);
    assert.notEqual(rejected.status, 0);
    assert.match(rejected.stderr, /reserved|in progress/);
    assert.equal(await readFile(path.join(reservation, "owned-by-other"), "utf8"), "other invocation");
    assert.equal(await readFile(fixture.requestLog, "utf8"), "");
    assert.equal(existsSync(path.join(fixture.directory, "renderer-qualification.json")), false);
  } finally {
    await removeRenderFixture(fixture);
  }
});

test("REM-0129 rejects unsupported publication before any external work", async () => {
  const fixture = await renderFixture();
  try {
    const rejected = run(fixture.command, fixture.project, await installRenderFault(fixture, "link-unavailable"));
    assert.notEqual(rejected.status, 0);
    assert.match(rejected.stderr, /publication/);
    assert.equal(await readFile(fixture.requestLog, "utf8"), "", "unsupported local publication must not waste a provider request");
    assert.equal(await readFile(fixture.fake.log, "utf8"), "");
    assert.deepEqual((await readdir(fixture.directory)).sort(), ["render-context.json", "render-plan.json", "whiteboard-alt-text.md", "whiteboard-specification.md"]);
  } finally {
    await removeRenderFixture(fixture);
  }
});

test("REM-0129 preserves recovery staging when owned-output rollback cannot finish", async () => {
  const fixture = await renderFixture();
  try {
    const rejected = run(fixture.command, fixture.project, await installRenderFault(fixture, "rollback-collision"));
    assert.notEqual(rejected.status, 0);
    assert.match(rejected.stderr, /owned output cleanup is incomplete/);
    const reservation = path.join(fixture.directory, ".rendering");
    const stagedImage = await readFile(path.join(reservation, "whiteboard-azure-openai-candidate.png"));
    assert.deepEqual(await readFile(path.join(fixture.directory, "whiteboard-azure-openai-candidate.png")), stagedImage);
    assert.equal(await readFile(path.join(fixture.directory, "renderer-qualification.json"), "utf8"), "concurrent qualification");
    const rerender = run(fixture.command, fixture.project, fixture.environment);
    assert.notEqual(rerender.status, 0);
    assert.match(rerender.stderr, /reserved/);
    assert.deepEqual(await readFile(path.join(reservation, "whiteboard-azure-openai-candidate.png")), stagedImage);
    assert.equal(await readFile(fixture.requestLog, "utf8"), "image-request\n");
  } finally {
    await removeRenderFixture(fixture);
  }
});

test("REM-0129 publishes a MAI candidate without bypassing human review", async () => {
  const fixture = await renderFixture();
  try {
    await seedDiscovery(fixture.project, imageReport("MAI-Image-2.6"), governmentProfile);
    const result = run(fixture.command, fixture.project, {
      ...fixture.environment,
      PROJECT_VISUAL_MAI_ENDPOINT: "https://visual.services.ai.azure.us",
      PROJECT_VISUAL_MAI_DEPLOYMENT: "visual-mai",
      PROJECT_VISUAL_MAI_MODEL: "MAI-Image-2.6"
    });
    assert.equal(result.status, 0, result.stderr);
    const verification = JSON.parse(result.stdout);
    assert.equal(verification.status, "requires-review");
    assert.equal(verification.provider, "mai-image");
    assert.match(verification.artifact, /whiteboard-mai-candidate\.png$/);
    assert.equal(existsSync(path.join(fixture.directory, "whiteboard.png")), false);
    assert.equal(existsSync(path.join(fixture.directory, ".rendering")), false);
    assert.equal(await readFile(fixture.requestLog, "utf8"), "image-request\n");
  } finally {
    await removeRenderFixture(fixture);
  }
});

test("REM-0129 serializes simultaneous attempts and preserves the successful owner's outputs", { timeout: 30_000 }, async () => {
  const fixture = await renderFixture();
  const child = spawn(process.execPath, [helper, ...fixture.command], {
    cwd: fixture.project, env: { ...fixture.environment, PSO_VISUAL_FAKE_HOLD: "1" },
    stdio: ["ignore", "pipe", "pipe", "ipc"]
  });
  let stdout = "";
  let stderr = "";
  child.stdout.on("data", (data) => { stdout += data; });
  child.stderr.on("data", (data) => { stderr += data; });
  const completed = new Promise((resolve, reject) => {
    child.once("error", reject);
    child.once("close", (status) => resolve({ status, stdout, stderr }));
  });
  try {
    const started = await new Promise((resolve, reject) => {
      child.once("message", resolve);
      child.once("error", reject);
      child.once("exit", () => reject(new Error(`Render exited before the test barrier: ${stderr}`)));
    });
    assert.equal(started, "image-request-started");
    const rejected = run(fixture.command, fixture.project, fixture.environment);
    child.send("finish-image-request");
    const winner = await completed;
    assert.notEqual(rejected.status, 0);
    assert.match(rejected.stderr, /reserved|in progress/);
    assert.equal(winner.status, 0, winner.stderr);
    const verification = JSON.parse(winner.stdout);
    assert.equal(verification.status, "requires-review");
    assert.equal(verification.provider, "azure-openai");
    const imagePath = path.join(fixture.project, ...verification.artifact.split("/"));
    const imageBefore = await readFile(imagePath);
    const reportPath = path.join(fixture.directory, "renderer-qualification.json");
    const reportBefore = await readFile(reportPath);
    const rerender = run(fixture.command, fixture.project, fixture.environment);
    assert.notEqual(rerender.status, 0);
    assert.match(rerender.stderr, /already exists/);
    assert.deepEqual(await readFile(imagePath), imageBefore);
    assert.deepEqual(await readFile(reportPath), reportBefore);
    assert.equal(await readFile(fixture.requestLog, "utf8"), "image-request\n");
    assert.equal(existsSync(path.join(fixture.directory, ".rendering")), false);
  } finally {
    if (child.exitCode === null) child.kill();
    await completed;
    await removeRenderFixture(fixture);
  }
});

test("approved image creation refreshes once; diagnostics, rejected actions and refresh failures never bill", async () => {
  const { project, fake, environment, requestLog } = await refreshFixture();
  const command = ["create", "--project", project, "--output-type", "whiteboard", "--request", "Explain the verified project as a workshop."];
  try {
    await seedDiscovery(project, imageReport("gpt-image-2", Date.now() - 31 * 86_400_000), governmentProfile);
    const discoveryPath = path.join(project, "reports", "azure-discovery.json");
    const before = await readFile(discoveryPath);
    const doctor = run(["doctor", "--project", project], project, environment);
    assert.equal(doctor.status, 0, doctor.stderr);
    assert.equal(JSON.parse(doctor.stdout).renderers.azureOpenAIImage.refreshRequired, true);
    assert.notEqual(run(command, project, environment).status, 0);
    const invalid = run([...command, "--external-processing-approved", "true", "--audience", "invalid"], project, environment);
    assert.notEqual(invalid.status, 0);
    assert.match(invalid.stderr, /unsupported/);
    assert.equal(await readFile(fake.log, "utf8"), "");
    assert.equal(await readFile(requestLog, "utf8"), "");
    assert.deepEqual(await readFile(discoveryPath), before);

    const created = run([...command, "--external-processing-approved", "true"], project, environment);
    assert.equal(created.status, 0, `${created.stderr}\n${created.stdout}`);
    assert.equal(JSON.parse(created.stdout).status, "partial");
    assert.equal((await inspectCachedDiscovery(project)).status, "fresh");
    assert.equal((await readFile(fake.log, "utf8")).match(/cognitiveservices model list/g)?.length, 2, "one owner refresh queries chat and image catalogs once each");
    assert.equal(await readFile(requestLog, "utf8"), "image-request\n");

    await seedDiscovery(project, imageReport("gpt-image-2", Date.now() - 31 * 86_400_000), governmentProfile);
    const failedBefore = await readFile(discoveryPath);
    const configuration = JSON.parse(await readFile(fake.configuration, "utf8"));
    await writeFile(fake.configuration, JSON.stringify({ ...configuration, fail: true }));
    const failed = run([...command, "--external-processing-approved", "true"], project, environment);
    assert.notEqual(failed.status, 0);
    assert.match(failed.stderr, /discovery refresh failed/);
    assert.deepEqual(await readFile(discoveryPath), failedBefore);
    assert.equal(await readFile(requestLog, "utf8"), "image-request\n");
  } finally {
    await rm(project, { recursive: true, force: true });
  }
});

test("refreshing a reviewed render requires a new plan; a failed image request never triggers another provider", async () => {
  const { project, fake, environment, requestLog } = await refreshFixture();
  const command = ["create", "--project", project, "--output-type", "diorama", "--request", "Explain the project as a handcrafted exhibit.", "--external-processing-approved", "true"];
  try {
    const created = run(command, project, environment);
    assert.equal(created.status, 0, created.stderr);
    const result = JSON.parse(created.stdout);
    const directory = path.join(project, "artifacts", "project-visual-storytelling", result.runId);
    const planFile = path.join(directory, "render-plan.json");
    const planBefore = await readFile(planFile);
    const preflight = run(["preflight", "--project", project, "--output-type", "diorama"], project, environment);
    assert.equal(preflight.status, 0, preflight.stderr);
    const reviewedContext = JSON.parse(preflight.stdout);
    const reviewedPlanFile = path.join(project, ...reviewedContext.destination.directory.split("/"), "render-plan.json");
    const reviewedPlan = JSON.parse(planBefore);
    reviewedPlan.source.repositoryDigestSha256 = reviewedContext.source.repositoryDigestSha256;
    await writeFile(reviewedPlanFile, JSON.stringify(reviewedPlan));
    const reviewedPlanBefore = await readFile(reviewedPlanFile);
    await seedDiscovery(project, imageReport("gpt-image-2", Date.now() - 31 * 86_400_000), governmentProfile);
    const render = ["render", "--project", project, "--run-id", reviewedContext.destination.runId];
    const denied = run(render, project, environment);
    assert.notEqual(denied.status, 0);
    assert.match(denied.stderr, /requires --external-processing-approved/);
    assert.equal(await readFile(fake.log, "utf8"), "");
    const refreshed = run([...render, "--external-processing-approved", "true"], project, environment);
    assert.notEqual(refreshed.status, 0);
    assert.match(refreshed.stderr, /review a new render plan/);
    assert.deepEqual(await readFile(planFile), planBefore);
    assert.deepEqual(await readFile(reviewedPlanFile), reviewedPlanBefore);
    assert.equal((await inspectCachedDiscovery(project)).status, "fresh");
    assert.equal(await readFile(requestLog, "utf8"), "image-request\n");
    const calls = await readFile(fake.log);
    const verified = run(["verify", "--project", project, "--run-id", result.runId], project, environment);
    assert.equal(verified.status, 0, verified.stderr);
    assert.deepEqual(await readFile(fake.log), calls);

    const dualProviderReport = imageReport();
    dualProviderReport.imageGeneration.models.push(imageGeneration("MAI-Image-2.6", governmentProfile.location).models[0]);
    await seedDiscovery(project, dualProviderReport, governmentProfile);
    const dualProviderEnvironment = {
      ...environment,
      PROJECT_VISUAL_MAI_ENDPOINT: "https://visual.services.ai.azure.us",
      PROJECT_VISUAL_MAI_DEPLOYMENT: "visual-mai",
      PROJECT_VISUAL_MAI_MODEL: "MAI-Image-2.6"
    };
    const doctor = run(["doctor", "--project", project], project, dualProviderEnvironment);
    assert.equal(doctor.status, 0, doctor.stderr);
    assert.equal(JSON.parse(doctor.stdout).renderers.azureOpenAIImage.available, true);
    assert.equal(JSON.parse(doctor.stdout).renderers.maiImage.available, true);
    const failedImage = run(command, project, { ...dualProviderEnvironment, PSO_VISUAL_FAKE_FAILURE: "1" });
    assert.notEqual(failedImage.status, 0);
    assert.equal(JSON.parse(failedImage.stdout).status, "failed");
    assert.equal(await readFile(requestLog, "utf8"), "image-request\nimage-request\n");
  } finally {
    await rm(project, { recursive: true, force: true });
  }
});

test("both image inspectors enforce shared 30-day, future-date, schema and context boundaries offline", async () => {
  const project = await mkdtemp(path.join(os.tmpdir(), "pso-image-discovery-boundaries-"));
  const settings = {
    PROJECT_VISUAL_AZURE_OPENAI_ENDPOINT: "https://visual.openai.azure.us",
    PROJECT_VISUAL_AZURE_OPENAI_DEPLOYMENT: "visual-gpt-image",
    PROJECT_VISUAL_AZURE_OPENAI_MODEL: "gpt-image-2",
    PROJECT_VISUAL_MAI_ENDPOINT: "https://visual.services.ai.azure.us",
    PROJECT_VISUAL_MAI_DEPLOYMENT: "visual-mai",
    PROJECT_VISUAL_MAI_MODEL: "MAI-Image-2.6"
  };
  const previous = Object.fromEntries(Object.keys(settings).map((key) => [key, process.env[key]]));
  const originalNow = Date.now;
  const now = originalNow();
  try {
    Object.assign(process.env, settings);
    Date.now = () => now;
    const fake = await installFakeAzureCli(project, { profile: governmentProfile });
    for (const [inspect, model] of [[inspectAzureOpenAIImage, "gpt-image-2"], [inspectMaiImage, "MAI-Image-2.6"]]) {
      for (const age of [0, 29 * 86_400_000, 30 * 86_400_000]) {
        await seedDiscovery(project, imageReport(model, now - age), governmentProfile);
        assert.equal((await inspect(project)).available, true, `${model} must reuse evidence aged ${age}ms`);
      }
      await seedDiscovery(project, imageReport(model, now - 30 * 86_400_000 - 1), governmentProfile);
      assert.match((await inspect(project)).reason, /expired/);
      await seedDiscovery(project, imageReport(model, now + 1), governmentProfile);
      assert.match((await inspect(project)).reason, /future-dated/);
      await seedDiscovery(project, imageReport(model, now), governmentProfile);
      await writeFile(path.join(project, ".azure", "environment.json"), JSON.stringify(azureProfile({ ...governmentProfile, subscription: { ...governmentProfile.subscription, subscriptionId: "different-subscription" } })));
      assert.match((await inspect(project)).reason, /context-mismatch/);
      await seedDiscovery(project, imageReport(model, now), governmentProfile);
      await writeFile(path.join(project, "reports", "azure-discovery.json"), "{malformed");
      assert.match((await inspect(project)).reason, /malformed/);
      await writeFile(path.join(project, "reports", "azure-discovery.json"), JSON.stringify(imageReport(model, now)));
      assert.match((await inspect(project)).reason, /unbound/);
      assert.equal(await readFile(fake.log, "utf8"), "");
    }
  } finally {
    Date.now = originalNow;
    for (const [key, value] of Object.entries(previous)) {
      if (value === undefined) delete process.env[key];
      else process.env[key] = value;
    }
    await rm(project, { recursive: true, force: true });
  }
});

test("Project Visual Storytelling creates and verifies a photorealistic diorama in one command", async () => {
  const project = await mkdtemp(path.join(os.tmpdir(), "pso-project-visual-create-"));
  try {
    await mkdir(path.join(project, ".skills-orchestrator"), { recursive: true });
    await mkdir(path.join(project, "src"), { recursive: true });
    await writeFile(path.join(project, ".gitignore"), ".skills-orchestrator/\n");
    await writeFile(path.join(project, "README.md"), "# Workshop Platform\n\nA cloud architecture with services, controls, and operator workflows.\n");
    await writeFile(path.join(project, "src", "platform.js"), "export const controls = ['plan', 'validate', 'operate'];\n");
    await writeFile(path.join(project, ".skills-orchestrator", "user-personalization.json"), `${JSON.stringify(profile(), null, 2)}\n`);
    const imageProviderEnvironment = await installMockAzureImageProvider(project);
    const request = "Create a photorealistic handcrafted miniature diorama with a central operations workshop and clear project pathways.";
    const created = run([
      "create", "--project", project, "--output-type", "diorama", "--request", request, "--external-processing-approved", "true"
    ], project, imageProviderEnvironment);
    assert.equal(created.status, 0, `${created.stderr}\n${created.stdout}`);
    const result = JSON.parse(created.stdout);
    assert.equal(result.status, "partial");
    assert.equal(result.renderer.class, "bitmap-generation");
    assert.equal(result.renderer.name, "azure-openai");
    assert.ok(result.warnings.some((warning) => /human review/i.test(warning)));
    const runDirectory = path.join(project, "artifacts", "project-visual-storytelling", result.runId);
    const requestRecord = JSON.parse(await readFile(path.join(runDirectory, "request.json"), "utf8"));
    const renderPlan = JSON.parse(await readFile(path.join(runDirectory, "render-plan.json"), "utf8"));
    assert.equal(requestRecord.visual.type, "diorama");
    assert.deepEqual(requestRecord.rendering.allowedClasses, ["bitmap-generation"]);
    assert.match(renderPlan.renderer.prompt, /photorealistic handcrafted miniature diorama/i);
    assert.match(renderPlan.renderer.prompt, /central operations workshop/i);
    assert.match(renderPlan.renderer.prompt, /intentionally handcrafted/i);
    assert.match(renderPlan.renderer.prompt, /exact main title/i);
    assert.equal(renderPlan.renderer.preference, "auto");
    assert.ok(renderPlan.elements.every((element) => typeof element.caption === "string" && element.caption.length > 0));
    assert.ok(renderPlan.elements.some((element) => element.label === "Workshop Platform"));
    assert.ok(result.artifacts.some((artifact) => artifact.path.endsWith("/diorama-azure-openai-candidate.png") && artifact.validated));
    assert.match(await readFile(path.join(runDirectory, "diorama-specification.md"), "utf8"), /## Renderer Qualification/);
    assert.match(await readFile(path.join(runDirectory, "diorama-specification.md"), "utf8"), /## Reference Use/);
    assert.match(await readFile(path.join(runDirectory, "diorama-alt-text.md"), "utf8"), /handcrafted miniature/i);
  } finally {
    await rm(project, { recursive: true, force: true });
  }
});

test("Project Visual Storytelling requires current approval before image generation", async () => {
  const project = await mkdtemp(path.join(os.tmpdir(), "pso-project-visual-local-auto-"));
  const previous = {
    endpoint: process.env.PROJECT_VISUAL_AZURE_OPENAI_ENDPOINT,
    deployment: process.env.PROJECT_VISUAL_AZURE_OPENAI_DEPLOYMENT,
    model: process.env.PROJECT_VISUAL_AZURE_OPENAI_MODEL
  };
  try {
    await mkdir(path.join(project, ".azure"), { recursive: true });
    await mkdir(path.join(project, ".skills-orchestrator"), { recursive: true });
    await mkdir(path.join(project, "reports"), { recursive: true });
    await mkdir(path.join(project, "src"), { recursive: true });
    await writeFile(path.join(project, ".gitignore"), ".skills-orchestrator/\n");
    await writeFile(path.join(project, "README.md"), "# Local Visual Project\n\nA project with qualified cloud configuration that must remain local without current approval.\n");
    await writeFile(path.join(project, "src", "visual.js"), "export const rendererPolicy = 'approval-required';\n");
    await writeFile(path.join(project, ".skills-orchestrator", "user-personalization.json"), `${JSON.stringify(profile(), null, 2)}\n`);
    await seedDiscovery(project, imageReport(), governmentProfile);
    process.env.PROJECT_VISUAL_AZURE_OPENAI_ENDPOINT = "https://visual.openai.azure.us";
    process.env.PROJECT_VISUAL_AZURE_OPENAI_DEPLOYMENT = "visual-gpt-image";
    process.env.PROJECT_VISUAL_AZURE_OPENAI_MODEL = "gpt-image-2";
    const created = run([
      "create", "--project", project, "--output-type", "whiteboard", "--request", "Create a photorealistic physical project whiteboard."
    ], project, process.env);
    assert.notEqual(created.status, 0);
    assert.match(created.stderr, /requires --external-processing-approved true/);
    assert.equal(existsSync(path.join(project, "artifacts")), false);
  } finally {
    for (const [name, value] of Object.entries({
      PROJECT_VISUAL_AZURE_OPENAI_ENDPOINT: previous.endpoint,
      PROJECT_VISUAL_AZURE_OPENAI_DEPLOYMENT: previous.deployment,
      PROJECT_VISUAL_AZURE_OPENAI_MODEL: previous.model
    })) {
      if (value === undefined) delete process.env[name];
      else process.env[name] = value;
    }
    await rm(project, { recursive: true, force: true });
  }
});

test("Project Visual Storytelling blocks until User Personalization is valid", async () => {
  const project = await mkdtemp(path.join(os.tmpdir(), "pso-project-visual-storytelling-"));
  try {
    const doctor = run(["doctor", "--project", project]);
    assert.equal(doctor.status, 0, doctor.stderr);
    const doctorResult = JSON.parse(doctor.stdout);
    assert.equal(doctorResult.command, "doctor");
    assert.equal(typeof doctorResult.imageGenerationAvailable, "boolean");
    assert.deepEqual(Object.keys(doctorResult.renderers).sort(), ["azureOpenAIImage", "maiImage"]);
    assert.equal(doctorResult.renderers.azureOpenAIImage.rendererClass, "bitmap-generation");
    assert.equal(doctorResult.renderers.azureOpenAIImage.provider, "azure-openai");
    assert.equal(doctorResult.renderers.maiImage.rendererClass, "bitmap-generation");
    assert.equal(doctorResult.renderers.maiImage.provider, "mai-image");

    const unsupported = run(["preflight", "--project", project, "--output-type", "press-release"]);
    assert.notEqual(unsupported.status, 0);
    assert.match(unsupported.stderr, /Unsupported --output-type/);

    const missing = run(["preflight", "--project", project, "--output-type", "whiteboard"]);
    assert.notEqual(missing.status, 0);
    assert.match(missing.stderr, /profile is missing/);

    await mkdir(path.join(project, ".skills-orchestrator"), { recursive: true });
    await mkdir(path.join(project, "src"), { recursive: true });
    await writeFile(path.join(project, ".gitignore"), ".skills-orchestrator/\n");
    await writeFile(path.join(project, "README.md"), "# Current Project Alpha\n\nA governed project used as the project-visual-storytelling source.\n");
    await writeFile(path.join(project, "src", "index.js"), "export const project = 'alpha';\n");
    await writeFile(path.join(project, ".skills-orchestrator", "user-personalization.json"), "{\"schemaVersion\":\"1.0.0\"}\n");
    const invalidProfile = run(["preflight", "--project", project, "--output-type", "diorama"]);
    assert.notEqual(invalidProfile.status, 0);
    assert.match(invalidProfile.stderr, /profile\.updatedAt/);

    await writeFile(path.join(project, ".skills-orchestrator", "user-personalization.json"), `${JSON.stringify(profile(), null, 2)}\n`);
    const ready = run(["preflight", "--project", project, "--output-type", "whiteboard"]);
    assert.equal(ready.status, 0, ready.stderr);
    const result = JSON.parse(ready.stdout);
    assert.equal(result.status, "ready");
    assert.equal(result.outputType, "whiteboard");
    assert.equal(result.visualStyle, "whiteboard");
    assert.equal(result.visualTreatment, "hand-drawn-whiteboard");
    assert.doesNotMatch(result.destination.directory, /whiteboard-whiteboard/);
    assert.equal(result.controls.requireAltText, true);
    assert.equal(result.controls.externalPublicationRequiresApproval, true);
    assert.deepEqual(Object.keys(result.profile).sort(), ["schemaVersion", "sha256", "updatedAt"]);
    assert.equal(result.source.kind, "current-project");
    assert.equal(result.source.topic, "Current Project Alpha");
    assert.match(result.source.repositoryDigestSha256, /^[a-f0-9]{64}$/);
    assert.equal(result.source.projectUnderstandingJson, "reports/project-understanding.json");
    assert.match(result.destination.directory, /^artifacts\/project-visual-storytelling\/[A-Za-z0-9-]+$/);
    assert.deepEqual(result.destination.files.required, ["whiteboard-specification.md", "whiteboard-alt-text.md"]);
    assert.deepEqual(result.destination.files.optional, ["whiteboard-azure-openai-candidate.png", "whiteboard-mai-candidate.png"]);
    const runDirectory = path.join(project, ...result.destination.directory.split("/"));
    assert.equal((await lstat(runDirectory)).isDirectory(), true);
    const renderContext = JSON.parse(await readFile(path.join(runDirectory, "render-context.json"), "utf8"));
    assert.equal(renderContext.destination.runId, result.destination.runId);
    assert.equal(renderContext.source.repositoryDigestSha256, result.source.repositoryDigestSha256);
    await readFile(path.join(project, "reports", "project-understanding.json"), "utf8");

    const invalidPlan = JSON.parse(await readFile(path.join(root, "tests", "fixtures", "project-visual-storytelling", "whiteboard-render-plan.json"), "utf8"));
    await writeFile(path.join(runDirectory, "render-plan.json"), `${JSON.stringify(invalidPlan, null, 2)}\n`);
    const invalidRender = run(["render", "--project", project, "--run-id", result.destination.runId]);
    assert.notEqual(invalidRender.status, 0);
    assert.match(invalidRender.stderr, /source digest does not match preflight/);

    invalidPlan.source.repositoryDigestSha256 = result.source.repositoryDigestSha256;
    invalidPlan.renderer.preference = "mai-image";
    invalidPlan.creationDate = Object.fromEntries(new Intl.DateTimeFormat("en-CA", { timeZone: profile().contentDefaults.timezone, year: "numeric", month: "2-digit", day: "2-digit" }).formatToParts(new Date()).map((part) => [part.type, part.value]));
    invalidPlan.creationDate = `${invalidPlan.creationDate.year}-${invalidPlan.creationDate.month}-${invalidPlan.creationDate.day}`;
    await writeFile(path.join(runDirectory, "render-plan.json"), `${JSON.stringify(invalidPlan, null, 2)}\n`);
    const unavailableMai = run(["render", "--project", project, "--run-id", result.destination.runId, "--external-processing-approved", "true"]);
    assert.notEqual(unavailableMai.status, 0);
    assert.match(unavailableMai.stderr, /\.azure\/environment\.json is missing|MAI_ENDPOINT|Azure Government Foundry endpoint/);

    await writeFile(path.join(project, "README.md"), "# Current Project Beta\n\nThe changed repository must become the next run's source.\n");
    const refreshed = run(["preflight", "--project", project, "--output-type", "whiteboard"]);
    assert.equal(refreshed.status, 0, refreshed.stderr);
    const refreshedResult = JSON.parse(refreshed.stdout);
    assert.equal(refreshedResult.source.topic, "Current Project Beta");
    assert.notEqual(refreshedResult.source.repositoryDigestSha256, result.source.repositoryDigestSha256);
    assert.notEqual(refreshedResult.destination.directory, result.destination.directory);
    assert.deepEqual(refreshedResult.destination.files.required, ["whiteboard-specification.md", "whiteboard-alt-text.md"]);
    assert.equal((await lstat(path.join(project, ...refreshedResult.destination.directory.split("/")))).isDirectory(), true);

    const diorama = run(["preflight", "--project", project, "--output-type", "diorama"]);
    assert.equal(diorama.status, 0, diorama.stderr);
    const dioramaResult = JSON.parse(diorama.stdout);
    assert.equal(dioramaResult.visualStyle, "diorama");
    assert.equal(dioramaResult.visualTreatment, "conceptual");
    assert.deepEqual(dioramaResult.destination.files.required, ["diorama-specification.md", "diorama-alt-text.md"]);
    assert.deepEqual(dioramaResult.destination.files.optional, ["diorama-azure-openai-candidate.png", "diorama-mai-candidate.png"]);
    assert.match(dioramaResult.destination.directory, /-diorama-/);

    await writeFile(path.join(project, "README.md"), "# Service Handbook\n\nA practical guide for operators.\n");
    const weakArchitecturalSignal = run(["preflight", "--project", project, "--output-type", "diorama"]);
    assert.equal(weakArchitecturalSignal.status, 0, weakArchitecturalSignal.stderr);
    assert.equal(JSON.parse(weakArchitecturalSignal.stdout).visualTreatment, "conceptual");

    await writeFile(path.join(project, "README.md"), "# Cloud Architecture Platform\n\nCloud infrastructure components and service dependencies.\n");
    const architectural = run(["preflight", "--project", project, "--output-type", "diorama-specification"]);
    assert.equal(architectural.status, 0, architectural.stderr);
    const architecturalResult = JSON.parse(architectural.stdout);
    assert.equal(architecturalResult.visualTreatment, "architectural");
    assert.deepEqual(architecturalResult.destination.files.optional, []);
    const specificationRender = run(["render", "--project", project, "--run-id", architecturalResult.destination.runId]);
    assert.notEqual(specificationRender.status, 0);
    assert.match(specificationRender.stderr, /Specification-only runs cannot invoke a renderer/);

    const misspelled = run(["preflight", "--project", project, "--output-type", "diarama"]);
    assert.notEqual(misspelled.status, 0);
    assert.match(misspelled.stderr, /use diorama or diorama-specification/);

    const invalidStyle = run(["preflight", "--project", project, "--output-type", "whiteboard", "--visual-style", "isometric"]);
    assert.notEqual(invalidStyle.status, 0);
    assert.match(invalidStyle.stderr, /--visual-style is no longer supported/);

    const nonvisual = run(["preflight", "--project", project, "--output-type", "article"]);
    assert.notEqual(nonvisual.status, 0);
    assert.match(nonvisual.stderr, /Unsupported --output-type/);

    for (const [option, value] of [["source", "https://example.com"], ["topic", "Another project"], ["output-path", "elsewhere"]]) {
      const override = run(["preflight", "--project", project, "--output-type", "whiteboard", `--${option}`, value]);
      assert.notEqual(override.status, 0);
      assert.match(override.stderr, new RegExp(`Unknown parameter: --${option}`));
    }
  } finally {
    await rm(project, { recursive: true, force: true });
  }
});

test("Project Visual Storytelling creates a repository-bound Mermaid diagram without personalization", async () => {
  const project = await mkdtemp(path.join(os.tmpdir(), "pso-project-diagram-"));
  try {
    await mkdir(path.join(project, "src"), { recursive: true });
    await writeFile(path.join(project, "README.md"), "# Diagram Source Project\n\nA repository used to verify diagram source binding.\n");
    await writeFile(path.join(project, "src", "service.js"), "export const service = 'diagram-source';\n");
    const diagram = run(["diagram", "--project", project, "--type", "architecture", "--format", "mmd,spec"]);
    assert.equal(diagram.status, 0, diagram.stderr);
    const result = JSON.parse(diagram.stdout);
    assert.equal(result.status, "partial");
    assert.equal(result.renderer.name, "mermaid-source");
    assert.match(result.source.repositoryDigestSha256, /^[a-f0-9]{64}$/);
    const artifactNames = result.artifacts.map((artifact) => artifact.path).sort();
    assert.deepEqual(artifactNames, ["alt-text.md", "diagram.mmd", "evidence-map.md", "request.json", "result.json", "visual-specification.md"]);
    const runDirectory = path.join(project, "artifacts", "project-visual-storytelling", result.runId);
    const request = JSON.parse(await readFile(path.join(runDirectory, "request.json"), "utf8"));
    assert.equal(request.source.kind, "current-project");
    assert.equal(request.source.repositoryDigestSha256, result.source.repositoryDigestSha256);
    assert.equal(request.destination.directory, `artifacts/project-visual-storytelling/${result.runId}`);
    assert.match(await readFile(path.join(runDirectory, "diagram.mmd"), "utf8"), /Diagram Source Project/);
    assert.match(await readFile(path.join(runDirectory, "evidence-map.md"), "utf8"), /src\/service\.js/);
  } finally {
    await rm(project, { recursive: true, force: true });
  }
});

test("Project Visual Storytelling references are generic and close reviewed package gaps", async () => {
  const skillRoot = path.join(root, ".github", "skills", "project-visual-storytelling");
  const files = [
    "SKILL.md",
    "references/source-evaluation-playbook.md",
    "references/diorama-production-rules.md",
    "references/whiteboard-production-rules.md",
    "references/renderer-contract.md"
  ];
  const sources = await Promise.all(files.map((file) => readFile(path.join(skillRoot, file), "utf8")));
  const combined = sources.join("\n");
  const dioramaRules = sources[2];
  assert.doesNotMatch(combined, /\btadd\b/i);
  assert.match(combined, /untrusted data/i);
  assert.match(combined, /publication[\s\S]{0,120}requires (?:separate )?approval/i);
  assert.match(combined, /alt text/i);
  assert.match(combined, /no finished image was produced/i);
  assert.match(combined, /copyright/i);
  assert.doesNotMatch(sources[0].match(/^description: (.+)$/m)?.[1] ?? "", /article|action plan|social draft|Teams message/i);
  const outputs = sources[0].match(/## Outputs\s+([\s\S]*?)(?=\n## )/)?.[1] ?? "";
  assert.match(outputs, /artifacts\/project-visual-storytelling\/<run-id>\//);
  assert.doesNotMatch(outputs, /article|action-plan|linkedin|teams/i);
  assert.match(dioramaRules, /photograph of a deliberately handcrafted miniature exhibit/i);
  assert.match(dioramaRules, /bitmap-generation/);
  assert.match(dioramaRules, /HTML, CSS, SVG.*prohibited as final diorama output/is);
  assert.match(dioramaRules, /one central sculpted metaphor/i);
  assert.match(dioramaRules, /fewer, larger labels/i);
  assert.match(dioramaRules, /no finished image was produced/i);
  assert.match(dioramaRules, /must never be delivered, renamed, or described as `diorama\.png`/i);
  assert.match(dioramaRules, /profile\.attribution\.visualSignature/);
  assert.match(dioramaRules, /Do not imitate a reference image's exact composition/i);
  assert.match(dioramaRules, /## Renderer Qualification Record/);
  assert.match(dioramaRules, /A renderer label is not evidence/);
  assert.match(dioramaRules, /approved Azure Government processing boundary/);
  assert.match(dioramaRules, /## Render Status[\s\S]*No finished image produced/);
  assert.match(dioramaRules, /## Reference Use Record/);
  assert.match(dioramaRules, /their pixels must not be submitted to an image-to-image or training workflow/);
  assert.match(dioramaRules, /## Final Artifact Validation/);
  assert.match(dioramaRules, /Validate the file signature is PNG/);
  assert.match(dioramaRules, /meaningful nonblank pixel variation/);
  assert.match(dioramaRules, /every visible project label has a row in the evidence-mapping table/);
  assert.match(dioramaRules, /profile signature appears exactly once/);
  assert.match(sources[4], /Render plans are bounded data, never executable expressions/);
  assert.match(sources[4], /Automated verification returns `requires-review`, not `complete`/);
  assert.match(sources[4], /qualified dimension-compatible Azure OpenAI first, then MAI-Image/);
  assert.match(sources[0], /create --project \. --output-type whiteboard\|diorama --request/);
  assert.match(sources[0], /PROJECT_VISUAL_AZURE_OPENAI_ENDPOINT/);
  assert.equal(JSON.parse(await readFile(path.join(root, "schemas", "project-visual-scene.schema.json"), "utf8")).title, "Project Visual Storytelling Render Plan");
  assert.equal((await lstat(path.join(skillRoot, "scripts", "azure-openai-image-render.mjs"))).isFile(), true);
  assert.equal((await lstat(path.join(skillRoot, "scripts", "mai-image-render.mjs"))).isFile(), true);
  const visualRuntime = await readFile(path.join(skillRoot, "scripts", "project-visual-storytelling.mjs"), "utf8");
  assert.match(visualRuntime, /Image generation requires --external-processing-approved true/);
  assert.match(visualRuntime, /intentionally handcrafted/);
  assert.match(visualRuntime, /caption/);
});

test("MAI-Image qualification is Azure Government and discovery bound", async () => {
  const project = await mkdtemp(path.join(os.tmpdir(), "pso-project-visual-mai-"));
  const previous = {
    endpoint: process.env.PROJECT_VISUAL_MAI_ENDPOINT,
    deployment: process.env.PROJECT_VISUAL_MAI_DEPLOYMENT,
    model: process.env.PROJECT_VISUAL_MAI_MODEL
  };
  try {
    await mkdir(path.join(project, ".azure"), { recursive: true });
    await mkdir(path.join(project, "reports"), { recursive: true });
    await seedDiscovery(project, imageReport("MAI-Image-2.6"), governmentProfile);
    process.env.PROJECT_VISUAL_MAI_DEPLOYMENT = "visual-mai";
    process.env.PROJECT_VISUAL_MAI_MODEL = "MAI-Image-2.6";

    process.env.PROJECT_VISUAL_MAI_ENDPOINT = "https://visual.services.ai.azure.com";
    const publicEndpoint = await inspectMaiImage(project);
    assert.equal(publicEndpoint.available, false);
    assert.match(publicEndpoint.reason, /not an Azure Government Foundry endpoint/);

    process.env.PROJECT_VISUAL_MAI_ENDPOINT = "https://visual.services.ai.azure.us";
    const qualified = await inspectMaiImage(project);
    assert.equal(qualified.available, true);
    assert.equal(qualified.cloud, "AzureUSGovernment");
    assert.equal(qualified.authentication, "microsoft-entra");
    assert.equal(qualified.apiPath, "/mai/v1/images/generations");
    assert.equal(supportsMaiImageDimensions(1_200, 800), true);
    assert.equal(supportsMaiImageDimensions(1_920, 1_080), false);

    const image = Buffer.alloc(1_024);
    Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]).copy(image, 0);
    let request;
    const outputPath = path.join(project, "candidate.png");
    const report = await generateMaiImage({
      capability: qualified,
      prompt: "A photorealistic project diorama with reserved blank label panels.",
      width: 1_200,
      height: 800,
      outputPath,
      renderPlanSha256: "b".repeat(64),
      tokenProvider: () => "test-government-token",
      fetchImpl: async (url, options) => {
        request = { url, options };
        return new Response(JSON.stringify({ data: [{ b64_json: image.toString("base64") }] }));
      }
    });
    assert.equal(request.url, "https://visual.services.ai.azure.us/mai/v1/images/generations");
    assert.equal(request.options.headers.Authorization, "Bearer test-government-token");
    assert.equal(report.authentication, "microsoft-entra");
    assert.equal(report.provider, "mai-image");

    await seedDiscovery(project, imageReport("MAI-Image-2.6", Date.now() - 31 * 86_400_000), governmentProfile);
    const stale = await inspectMaiImage(project);
    assert.equal(stale.available, false);
    assert.match(stale.reason, /expired/);
  } finally {
    for (const [name, value] of Object.entries({
      PROJECT_VISUAL_MAI_ENDPOINT: previous.endpoint,
      PROJECT_VISUAL_MAI_DEPLOYMENT: previous.deployment,
      PROJECT_VISUAL_MAI_MODEL: previous.model
    })) {
      if (value === undefined) delete process.env[name];
      else process.env[name] = value;
    }
    await rm(project, { recursive: true, force: true });
  }
});

test("Azure OpenAI image qualification and generation are Government discovery bound", async () => {
  const project = await mkdtemp(path.join(os.tmpdir(), "pso-project-visual-openai-"));
  const previous = {
    endpoint: process.env.PROJECT_VISUAL_AZURE_OPENAI_ENDPOINT,
    deployment: process.env.PROJECT_VISUAL_AZURE_OPENAI_DEPLOYMENT,
    model: process.env.PROJECT_VISUAL_AZURE_OPENAI_MODEL
  };
  try {
    await mkdir(path.join(project, ".azure"), { recursive: true });
    await mkdir(path.join(project, "reports"), { recursive: true });
    await seedDiscovery(project, imageReport(), governmentProfile);
    process.env.PROJECT_VISUAL_AZURE_OPENAI_DEPLOYMENT = "visual-gpt-image";
    process.env.PROJECT_VISUAL_AZURE_OPENAI_MODEL = "gpt-image-2";

    process.env.PROJECT_VISUAL_AZURE_OPENAI_ENDPOINT = "https://visual.openai.azure.com";
    const publicEndpoint = await inspectAzureOpenAIImage(project);
    assert.equal(publicEndpoint.available, false);
    assert.match(publicEndpoint.reason, /not an Azure Government OpenAI endpoint/);

    process.env.PROJECT_VISUAL_AZURE_OPENAI_ENDPOINT = "https://visual.openai.azure.us";
    const qualified = await inspectAzureOpenAIImage(project);
    assert.equal(qualified.available, true);
    assert.equal(qualified.authentication, "microsoft-entra");
    assert.equal(qualified.apiPath, "/openai/v1/images/generations?api-version=preview");
    assert.equal(supportsAzureOpenAIImageDimensions(1_200, 800), true);
    assert.equal(supportsAzureOpenAIImageDimensions(1_920, 1_080), false);
    assert.equal(supportsAzureOpenAIImageDimensions(-1_024, -1_024), false);

    const image = Buffer.alloc(1_024);
    Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]).copy(image, 0);
    image.write("IHDR", 12, "ascii");
    image.writeUInt32BE(1_200, 16);
    image.writeUInt32BE(800, 20);
    let request;
    const outputPath = path.join(project, "candidate.png");
    const report = await generateAzureOpenAIImage({
      capability: qualified,
      prompt: "A photorealistic project diorama with reserved blank label panels.",
      width: 1_200,
      height: 800,
      outputPath,
      renderPlanSha256: "a".repeat(64),
      tokenProvider: () => "test-government-token",
      fetchImpl: async (url, options) => {
        request = { url, options };
        return new Response(JSON.stringify({ data: [{ b64_json: image.toString("base64") }] }));
      }
    });
    assert.equal(request.url, "https://visual.openai.azure.us/openai/v1/images/generations?api-version=preview");
    assert.equal(request.options.headers.Authorization, "Bearer test-government-token");
    assert.deepEqual(JSON.parse(request.options.body), {
      model: "visual-gpt-image",
      prompt: "A photorealistic project diorama with reserved blank label panels.",
      size: "1200x800",
      n: 1,
      quality: "high",
      output_format: "png"
    });
    assert.deepEqual(await readFile(outputPath), image);
    assert.equal(report.provider, "azure-openai");
    assert.equal(report.processingBoundary, "AzureUSGovernment");
    assert.equal(report.endpointHost, "visual.openai.azure.us");
    assert.equal(report.referencePixelsSupplied, false);
    assert.equal(report.webGrounding, false);

    await seedDiscovery(project, imageReport("gpt-image-2", Date.now() - 31 * 86_400_000), governmentProfile);
    const stale = await inspectAzureOpenAIImage(project);
    assert.equal(stale.available, false);
    assert.match(stale.reason, /expired/);
  } finally {
    for (const [name, value] of Object.entries({
      PROJECT_VISUAL_AZURE_OPENAI_ENDPOINT: previous.endpoint,
      PROJECT_VISUAL_AZURE_OPENAI_DEPLOYMENT: previous.deployment,
      PROJECT_VISUAL_AZURE_OPENAI_MODEL: previous.model
    })) {
      if (value === undefined) delete process.env[name];
      else process.env[name] = value;
    }
    await rm(project, { recursive: true, force: true });
  }
});