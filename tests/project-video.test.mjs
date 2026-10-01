import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { existsSync } from "node:fs";
import { copyFile, mkdir, mkdtemp, readFile, readdir, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { spawnSync } from "node:child_process";
import test from "node:test";
import { pathToFileURL } from "node:url";
import { inspectCachedDiscovery, inspectDiscovery, validateDiscovery } from "../.github/skills/azure-discovery/scripts/discovery-cache.mjs";
import { azureProfile, discoveryReport, imageGeneration, installDiscoveryPackage, installFakeAzureCli, seedDiscovery } from "./helpers/azure-discovery-fixture.mjs";

const root = path.resolve(import.meta.dirname, "..");
const helper = path.join(root, ".github", "skills", "project-video", "scripts", "project-video.mjs");
const avaHdVoice = { provider: "azure-neural", name: "en-US-AvaNeural", locale: "en-US", style: "auto", styleDegree: 0.65, ratePercent: -2, sentencePauseMs: 180 };
const localPiperVoice = { provider: "local-piper", name: "en_US-ljspeech-high", locale: "en-US", lengthScale: 1, sentenceSilenceSeconds: 0.18 };
const browserPreviewVoice = { provider: "browser-preview", name: "default-English", locale: "en-US" };
const fixtures = new Map();

async function createProject(label) {
  const project = await mkdtemp(path.join(os.tmpdir(), `pso-video-${label}-`));
  const support = path.join(project, ".skills-orchestrator", "offline-tests");
  const azure = await installFakeAzureCli(support, { fail: true });
  const networkLog = path.join(support, "http-calls.log");
  const networkGuard = path.join(support, "network-guard.mjs");
  await writeFile(networkLog, "");
  await writeFile(networkGuard, `
import { appendFileSync } from "node:fs";
import http from "node:http";
import https from "node:https";
import { syncBuiltinESMExports } from "node:module";
function record(url) { appendFileSync(process.env.PSO_VIDEO_HTTP_LOG, String(url) + "\\n"); }
function deny(url) { record(url); throw new Error("Live HTTP is disabled in project-video tests"); }
http.get = http.request = https.get = https.request = deny;
syncBuiltinESMExports();
globalThis.fetch = async (url, options) => {
  record(url);
  if (process.env.PSO_VIDEO_FAKE_SPEECH !== "audio" || options?.method !== "POST" ||
      !/^https:\\/\\/[a-z0-9-]+\\.tts\\.speech\\.(?:microsoft\\.com|azure\\.us)\\/cognitiveservices\\/v1$/.test(String(url))) {
    throw new Error("Live HTTP is disabled in project-video tests");
  }
  const audio = Buffer.alloc(2048, 1);
  audio.write("ID3");
  return new Response(audio, { headers: { "content-type": "audio/mpeg" } });
};
`);
  fixtures.set(project, { azure, networkLog, networkGuard });
  return project;
}

async function removeProject(project) {
  await rm(project, { recursive: true, force: true, maxRetries: 10, retryDelay: 100 });
  fixtures.delete(project);
}

function sha256(value) {
  return createHash("sha256").update(value).digest("hex");
}

function run(project, command, args = [], environment = {}) {
  const fixture = fixtures.get(project);
  assert.ok(fixture, "Every video test must use an isolated fake Azure CLI and HTTP guard");
  return spawnSync(process.execPath, [helper, command, "--root", project, ...args], {
    cwd: root,
    encoding: "utf8",
    env: {
      ...fixture.azure.env,
      AZURE_SPEECH_KEY: "", SPEECH_KEY: "", AZURE_SPEECH_REGION: "", SPEECH_REGION: "", AZURE_SPEECH_CLOUD: "",
      PSO_VIDEO_HTTP_LOG: fixture.networkLog, PSO_VIDEO_FAKE_SPEECH: "",
      ...environment,
      NODE_OPTIONS: [fixture.networkGuard, fixture.operationProbe, fixture.speechProbe].filter(Boolean).map((file) => `--import=${pathToFileURL(file).href}`).join(" ")
    }
  });
}

function speechReport(profile = azureProfile(), overrides = {}) {
  return discoveryReport(profile, {
    cognitiveAvailable: true,
    cognitiveRegions: [profile.location],
    ...overrides,
    speech: {
      serviceAvailable: true,
      serviceRegions: [profile.location],
      existingResourceQuerySucceeded: true,
      existingResourceAvailable: true,
      existingResourceCount: 1,
      existingResourceRegions: [profile.location],
      existingResourceKinds: ["SpeechServices"],
      ...overrides.speech
    }
  });
}

async function seedAzureDiscovery(project, overrides = {}) {
  const profile = azureProfile({ cloud: overrides.cloud || "AzureCloud", location: overrides.location || "eastus" });
  await installProjectDiscovery(project);
  return seedDiscovery(project, speechReport(profile, overrides), profile);
}

async function installProjectDiscovery(project) {
  const fixture = fixtures.get(project);
  if (!fixture.discoveryInstalled) {
    await installDiscoveryPackage(project);
    fixture.discoveryInstalled = true;
  }
}

async function configureAzure(project, profile = azureProfile(), report = speechReport(profile), fail = false) {
  await writeFile(fixtures.get(project).azure.configuration, JSON.stringify({ profile, report, fail }));
}

async function azureCalls(project) {
  return (await readFile(fixtures.get(project).azure.log, "utf8")).trim().split(/\r?\n/).filter(Boolean);
}

async function assertOffline(project) {
  assert.deepEqual(await azureCalls(project), []);
  assert.equal(await readFile(fixtures.get(project).networkLog, "utf8"), "");
}

async function discoveryFiles(project) {
  return Promise.all(["json", "md"].map(async (extension) => {
    const file = path.join(project, "reports", `azure-discovery.${extension}`);
    return existsSync(file) ? readFile(file, "utf8") : null;
  }));
}

function validPlan(name, voice = avaHdVoice) {
  return {
    schemaVersion: "1.0.0",
    project: {
      name,
      purpose: "Explain the verified fixture project and how a developer uses its primary workflow.",
      evidence: ["README.md", "src/app.mjs"]
    },
    audience: "Developers joining the project",
    targetDurationSeconds: 120,
    video: {
      width: 1280,
      height: 720,
      fps: 30,
      backgroundColor: "#132129",
      primaryColor: "#1261A0",
      accentColor: "#F05D3D"
    },
    voice,
    output: { file: `dist/project-video/${name}.mp4` },
    scenes: Array.from({ length: 6 }, (_, index) => ({
      id: `scene-${String(index + 1).padStart(2, "0")}`,
      title: `Verified scene ${index + 1}`,
      subtitle: "A factual explanation grounded in repository evidence",
      narration: index === 0
        ? "U.S. projects can use Node.js safely. This narration explains only behavior supported by the fixture repository."
        : `This is verified narration for scene ${index + 1}. It explains only behavior supported by the fixture repository.`,
      evidence: index % 2 === 0 ? ["README.md"] : ["src/app.mjs"]
    }))
  };
}

function executivePlan(name) {
  const plan = validPlan(name, avaHdVoice);
  plan.schemaVersion = "1.1.0";
  plan.production = {
    production_path: "executive-demo",
    script_provider: "azure-openai",
    narration_provider: "azure-neural",
    presenter_provider: "azure-speech-avatar",
    assembly_provider: "ffmpeg",
    delivery_kind: "portable-mp4",
    capabilities: [
      { capability: "azure-openai", status: "ready", region: "eastus", resource_id: null, deployment_id: "executive-script-deployment", model_id: "gpt-5-2026-08", evidence: "reports/azure-discovery.json" },
      { capability: "azure-neural", status: "ready", region: "eastus", resource_id: "speech-project-resource", deployment_id: null, model_id: null, evidence: "reports/azure-discovery.json" },
      { capability: "azure-speech-avatar", status: "ready", region: "eastus", resource_id: "speech-project-resource", deployment_id: null, model_id: null, evidence: "reports/avatar-preflight.json" }
    ],
    evidence: {
      claims_ledger: "reports/project-video/claims-ledger.json",
      script: "reports/project-video/script.md"
    },
    approvals: {
      required: ["script", "azure-openai", "azure-narration", "synthetic-presenter", "avatar-generation", "ffmpeg-render"],
      completed: ["script"]
    },
    selection: {
      voice_profile: "ava-hd-warm",
      avatar_profile: {
        character: "approved-presenter",
        voice: "en-US-AvaNeural",
        language: "en-US",
        layout: "picture-in-picture",
        background: "transparent",
        segments: ["scene-01", "scene-06"],
        generation_status: "planned",
        assets: []
      }
    },
    paths: {
      assets: ["reports/project-video/script.md", "README.md"],
      validation: ["reports/avatar-preflight.json"],
      final_output: `dist/project-video/${name}.mp4`
    }
  };
  return plan;
}

async function seedApprovedVoiceSelection(project) {
  const sampleDirectory = path.join(project, "reports", "project-video", "voice-samples");
  await mkdir(sampleDirectory, { recursive: true });
  const sampleText = "This is a shared audition passage for selecting the approved project narration voice.";
  const profiles = [
    { id: "ava-hd-warm", slot: "A", label: "A - Ava Neural - natural conversational", voice: avaHdVoice },
    { id: "aria-hd-warm", slot: "B", label: "B - Aria Neural - warm presenter", voice: { ...avaHdVoice, name: "en-US-AriaNeural", style: "friendly" } },
    { id: "jenny-professional", slot: "C", label: "C - Jenny Neural - professional narration", voice: { provider: "azure-neural", name: "en-US-JennyNeural", locale: "en-US", style: "narration-professional", styleDegree: 0.75, ratePercent: -3, sentencePauseMs: 200 } }
  ];
  const samples = [];
  for (const [index, profile] of profiles.entries()) {
    const bytes = Buffer.alloc(2048, index + 2);
    const file = `${profile.id}.mp3`;
    await writeFile(path.join(sampleDirectory, file), bytes);
    samples.push({ ...profile, file, sha256: sha256(bytes) });
  }
  const auditionPage = "<!doctype html><title>Voice audition</title><p>Listen to A, B, and C.</p>\n";
  await writeFile(path.join(sampleDirectory, "index.html"), auditionPage, "utf8");
  await writeFile(path.join(sampleDirectory, "voice-samples.json"), `${JSON.stringify({
    schemaVersion: "1.0.0",
    generatedAt: new Date().toISOString(),
    planSha256: "0".repeat(64),
    scene: "scene-01",
    sampleText,
    sampleTextSha256: sha256(sampleText),
    auditionPageSha256: sha256(auditionPage),
    cloud: "AzureCloud",
    region: "eastus",
    recommended: "ava-hd-warm",
    samples
  }, null, 2)}\n`, "utf8");
  const selected = run(project, "select-voice", ["--profile", "ava-hd-warm", "--approve-selection"]);
  assert.equal(selected.status, 0, `${selected.stdout}\n${selected.stderr}`);
  assert.match(selected.stdout, /Selected voice profile A/);
  const updatedPlan = JSON.parse(await readFile(path.join(project, "reports", "project-video", "project-video-plan.json"), "utf8"));
  assert.deepEqual(updatedPlan.voice, avaHdVoice);
}

async function seedLegacyVoiceSelection(project) {
  const currentVoice = { ...avaHdVoice };
  delete currentVoice.provider;
  const sampleDirectory = path.join(project, "reports", "project-video", "voice-samples");
  await mkdir(sampleDirectory, { recursive: true });
  const sampleText = "This is a shared audition passage for selecting the approved project narration voice.";
  const profiles = [
    { id: "ava-hd-warm", slot: "A", label: "A - Ava Neural - natural conversational", voice: currentVoice },
    { id: "aria-hd-warm", slot: "B", label: "B - Aria Neural - warm presenter", voice: { ...currentVoice, name: "en-US-AriaNeural", style: "friendly" } },
    { id: "jenny-professional", slot: "C", label: "C - Jenny Neural - professional narration", voice: { name: "en-US-JennyNeural", locale: "en-US", style: "narration-professional", styleDegree: 0.75, ratePercent: -3, sentencePauseMs: 200 } }
  ];
  const samples = [];
  for (const [index, profile] of profiles.entries()) {
    const bytes = Buffer.alloc(2048, index + 2);
    const file = `${profile.id}.mp3`;
    await writeFile(path.join(sampleDirectory, file), bytes);
    samples.push({ ...profile, file, sha256: sha256(bytes) });
  }
  const auditionPage = "<!doctype html><title>Voice audition</title><p>Listen to A, B, and C.</p>\n";
  await writeFile(path.join(sampleDirectory, "index.html"), auditionPage, "utf8");
  await writeFile(path.join(sampleDirectory, "voice-samples.json"), `${JSON.stringify({
    schemaVersion: "1.0.0",
    generatedAt: new Date().toISOString(),
    planSha256: "0".repeat(64),
    scene: "scene-01",
    sampleText,
    sampleTextSha256: sha256(sampleText),
    auditionPageSha256: sha256(auditionPage),
    cloud: "AzureCloud",
    region: "eastus",
    recommended: "ava-hd-warm",
    samples
  }, null, 2)}\n`, "utf8");
}

async function seedPlan(project, voice = avaHdVoice) {
  await mkdir(path.join(project, "src"), { recursive: true });
  await mkdir(path.join(project, "reports", "project-video"), { recursive: true });
  await writeFile(path.join(project, "README.md"), "# Offline video fixture\n");
  await writeFile(path.join(project, "src", "app.mjs"), "export const ready = true;\n");
  const plan = validPlan("offline-video-fixture", voice);
  if (voice.provider === "browser-preview") plan.output.file = "dist/project-video/offline-video-fixture.html";
  await writeFile(path.join(project, "reports", "project-video", "project-video-plan.json"), JSON.stringify(plan));
  return plan;
}

async function seedUnusableDiscovery(project, state) {
  const profile = azureProfile();
  const report = speechReport(profile, {
    discoveredAt: new Date(Date.now() + (state === "future-dated" ? 1 : state === "expired" ? -31 : 0) * 86_400_000).toISOString()
  });
  await installProjectDiscovery(project);
  const bound = await seedDiscovery(project, report, profile);
  const file = path.join(project, "reports", "azure-discovery.json");
  const markdown = path.join(project, "reports", "azure-discovery.md");
  if (state === "missing") {
    await rm(file);
    await rm(markdown);
  } else if (state === "malformed") {
    await writeFile(file, "{invalid JSON");
  } else if (state === "invalid") {
    await writeFile(file, JSON.stringify({ ...bound, resourceName: "unsupported-private-field" }));
  } else if (state === "unbound") {
    const legacy = { ...bound };
    delete legacy.contextSha256;
    delete legacy.expiresAt;
    delete legacy.imageGeneration;
    await writeFile(file, JSON.stringify(legacy));
  } else if (state === "context-mismatch") {
    profile.subscription.subscriptionId = "00000000-0000-0000-0000-000000000003";
    await writeFile(path.join(project, ".azure", "environment.json"), JSON.stringify(profile));
  } else if (state === "incomplete") {
    await writeFile(markdown, "# Outdated discovery summary\n");
  } else if (state === "missing-markdown") {
    await rm(markdown);
  }
  await configureAzure(project, profile);
  return profile;
}

async function seedNarration(project) {
  const planText = await readFile(path.join(project, "reports", "project-video", "project-video-plan.json"), "utf8");
  const plan = JSON.parse(planText);
  const discoveryText = await readFile(path.join(project, "reports", "azure-discovery.json"), "utf8");
  const discovery = JSON.parse(discoveryText);
  const audioDirectory = path.join(project, "reports", "project-video", "audio");
  await mkdir(audioDirectory, { recursive: true });
  const scenes = [];
  for (const [index, scene] of plan.scenes.entries()) {
    const audio = Buffer.alloc(2048, index + 1);
    audio.write("ID3");
    const file = `reports/project-video/audio/${scene.id}.mp3`;
    await writeFile(path.join(audioDirectory, `${scene.id}.mp3`), audio);
    scenes.push({ id: scene.id, file, narrationSha256: sha256(scene.narration), audioSha256: sha256(audio) });
  }
  const manifestFile = path.join(audioDirectory, "narration-manifest.json");
  await writeFile(manifestFile, JSON.stringify({
    schemaVersion: "1.0.0", generatedAt: new Date().toISOString(), provider: "azure-neural",
    planSha256: sha256(planText), voice: plan.voice.name, voiceSettings: plan.voice,
    voiceSettingsSha256: sha256(JSON.stringify(plan.voice)),
    voiceSelectionProfile: "ava-hd-warm",
    voiceSelectionSha256: sha256(await readFile(path.join(project, "reports", "project-video", "voice-selection.json"))),
    cloud: discovery.cloud, region: discovery.location,
    azureDiscoverySha256: sha256(discoveryText), azureDiscoveryAt: discovery.discoveredAt, scenes
  }));
  return manifestFile;
}

async function installOperationProbe(project, targets) {
  const fixture = fixtures.get(project);
  const directory = path.dirname(fixture.networkGuard);
  const log = path.join(directory, "operations.jsonl");
  fixture.operationProbe = path.join(directory, "operation-probe.mjs");
  await writeFile(log, "");
  await writeFile(fixture.operationProbe, `
import fs from "node:fs";
import fsp from "node:fs/promises";
import cp from "node:child_process";
import path from "node:path";
import { syncBuiltinESMExports } from "node:module";
const targets = ${JSON.stringify(targets)};
const log = ${JSON.stringify(log)};
const config = JSON.parse(process.env.PSO_VIDEO_OPERATION_CONFIG || "{}");
const originalRename = fsp.rename;
const originalRm = fsp.rm;
const originalStream = fs.createReadStream;
const originalRead = fsp.readFile;
let planEdited = false;
const record = (operation) => fs.appendFileSync(log, JSON.stringify(operation) + "\\n");
const identify = (file) => Object.entries(targets).find(([, target]) => file === target || file.startsWith(target + "."))?.[0];
function attempt(event) {
  record({ event });
  if (config.failures?.includes(event)) throw Object.assign(new Error("Injected " + event), { code: "EACCES" });
}
fsp.readFile = async (file, ...args) => {
  const bytes = await originalRead(file, ...args);
  if (file === targets.plan) {
    record({ event: "plan-read" });
    if (config.planReplacement && !planEdited) {
      planEdited = true;
      fs.writeFileSync(file, config.planReplacement);
    }
  }
  return bytes;
};
fsp.rename = async (from, to) => {
  const name = identify(from) || identify(to);
  const event = name ? (from.endsWith(".backup") ? "restore:" : to === targets[name] ? "publish:" : to.endsWith(".backup") ? "backup:" : "unstage:") + name
    : path.basename(to) === "publication-committed.json" ? "commit" : null;
  if (event) attempt(event);
  const result = await originalRename(from, to);
  if (event && config.crashAfter === event) process.exit(79);
  return result;
};
fsp.rm = async (file, options) => {
  const name = identify(file);
  if (name) attempt((file.endsWith(".backup") ? "cleanup-backup:" : /\\.partial(?:\\.[a-z0-9]+)?$/i.test(file) ? "cleanup-partial:" : "rollback-remove:") + name);
  else if (path.dirname(file) === ${JSON.stringify(path.join(project, ".skills-orchestrator", "cache", "project-video"))} && /^[a-f0-9-]{36}$/.test(path.basename(file))) attempt("cleanup-cache");
  return originalRm(file, options);
};
fs.createReadStream = (file, ...args) => {
  if (file === targets.plan) record({ event: "plan-hash-read" });
  const stream = originalStream(file, ...args);
  if (config.driftRenderer && file === targets.renderer) {
    stream.once("end", () => fs.writeFileSync(file, "changed fake renderer after hashing"));
  }
  return stream;
};
cp.spawnSync = (executable, args) => {
  record({ event: "process", executable: path.relative(${JSON.stringify(project)}, executable), args });
  if (args.length === 1 && args[0] === "-version") {
    return { status: config.versionStatus ?? 0, stdout: "offline-renderer-test-double", stderr: "" };
  }
  if (config.renderMedia) {
    if (args[0] === "-hide_banner") return { status: 1, stdout: "", stderr: "Duration: 00:00:02.50" };
    if (args.at(-1)?.endsWith(".mp4")) {
      const bytes = Buffer.alloc(60 * 1024, 1);
      bytes.write(config.mediaMarker || "original offline media");
      fs.writeFileSync(args.at(-1), bytes);
      return { status: 0, stdout: "", stderr: "" };
    }
    if (args.includes("null") && args.at(-1) === "-") return { status: 0, stdout: "", stderr: "" };
  }
  return { status: 91, stdout: "", stderr: "Offline renderer intentionally stops before media execution" };
};
syncBuiltinESMExports();
`);
  return {
    async reset() { await writeFile(log, ""); },
    async events() { return (await readFile(log, "utf8")).trim().split(/\r?\n/).filter(Boolean).map(JSON.parse); }
  };
}

test("project-video REM-0128 verifies pinned renderer integrity before any process launch", async (t) => {
  const project = await createProject("renderer-integrity");
  try {
    await seedPlan(project);
    await seedAzureDiscovery(project);
    await seedApprovedVoiceSelection(project);
    await seedNarration(project);
    const tools = path.join(project, ".skills-orchestrator", "tools", "project-video");
    const renderer = path.join(tools, "node_modules", "ffmpeg-static", process.platform === "win32" ? "ffmpeg.exe" : "ffmpeg");
    const manifest = path.join(tools, "renderer-manifest.json");
    const bytes = Buffer.from("non-executable fixture renderer");
    await mkdir(path.dirname(renderer), { recursive: true });
    const probe = await installOperationProbe(project, { renderer });
    const valid = { package: "ffmpeg-static", packageVersion: "5.3.0", binarySha256: sha256(bytes) };
    for (const condition of ["missing-manifest", "malformed-manifest", "wrong-digest", "wrong-version", "hash-time-drift"]) {
      await t.test(condition, async () => {
        await writeFile(renderer, bytes);
        await writeFile(manifest, JSON.stringify(valid));
        if (condition === "missing-manifest") await rm(manifest);
        if (condition === "malformed-manifest") await writeFile(manifest, "{invalid");
        if (condition === "wrong-digest") await writeFile(manifest, JSON.stringify({ ...valid, binarySha256: "0".repeat(64) }));
        if (condition === "wrong-version") await writeFile(manifest, JSON.stringify({ ...valid, packageVersion: "0.0.0" }));
        await probe.reset();
        const result = run(project, "render", ["--approve-render"], {
          FFMPEG_PATH: "",
          PSO_VIDEO_OPERATION_CONFIG: JSON.stringify({ driftRenderer: condition === "hash-time-drift" })
        });
        assert.notEqual(result.status, 0);
        assert.equal((await probe.events()).filter((entry) => entry.event === "process").length, 0, "invalid pinned evidence must be rejected before even -version");
        assert.match(result.stderr, /manifest|integrity|changed|JSON/i);
        await assertOffline(project);
      });
    }
    for (const selection of ["automatic", "explicit", "environment"]) {
      await t.test(`valid-${selection}`, async () => {
        await writeFile(renderer, bytes);
        await writeFile(manifest, JSON.stringify(valid));
        await probe.reset();
        const result = run(project, "render", ["--approve-render", ...(selection === "explicit" ? ["--ffmpeg", renderer] : [])], {
          FFMPEG_PATH: selection === "environment" ? renderer : ""
        });
        assert.notEqual(result.status, 0);
        assert.match(result.stderr, /Unable to determine audio duration/);
        const calls = (await probe.events()).filter((entry) => entry.event === "process");
        assert.deepEqual(calls[0].args, ["-version"]);
        assert.equal(calls.length, 2, "a valid renderer reaches the controlled duration probe without executing a native binary");
        assert.ok(calls.every((entry) => path.resolve(project, entry.executable) === renderer));
        await assertOffline(project);
      });
    }
  } finally {
    await removeProject(project);
  }
});

test("project-video REM-0128 never substitutes a renderer for a rejected explicit selection", async (t) => {
  const project = await createProject("renderer-selection");
  try {
    await seedPlan(project);
    await seedAzureDiscovery(project);
    await seedApprovedVoiceSelection(project);
    await seedNarration(project);
    const tools = path.join(project, ".skills-orchestrator", "tools", "project-video");
    const renderer = path.join(tools, "node_modules", "ffmpeg-static", process.platform === "win32" ? "ffmpeg.exe" : "ffmpeg");
    const bytes = Buffer.from("non-executable fixture renderer");
    await mkdir(path.dirname(renderer), { recursive: true });
    await writeFile(renderer, bytes);
    await writeFile(path.join(tools, "renderer-manifest.json"), JSON.stringify({ package: "ffmpeg-static", packageVersion: "5.3.0", binarySha256: sha256(bytes) }));
    const probe = await installOperationProbe(project, { renderer });
    const explicit = path.join(project, "selected-ffmpeg");
    for (const condition of ["missing-explicit", "missing-environment", "failing-explicit", "tampered-pinned-explicit"]) {
      await t.test(condition, async () => {
        await writeFile(renderer, bytes);
        await rm(explicit, { force: true });
        if (condition === "failing-explicit") await writeFile(explicit, "non-executable explicit fixture");
        if (condition === "tampered-pinned-explicit") await writeFile(renderer, "modified renderer");
        await probe.reset();
        const result = run(project, "render", [
          "--approve-render",
          ...(condition === "missing-environment" ? [] : ["--ffmpeg", condition === "tampered-pinned-explicit" ? renderer : explicit])
        ], {
          FFMPEG_PATH: condition === "missing-environment" ? explicit : "",
          PSO_VIDEO_OPERATION_CONFIG: JSON.stringify({ versionStatus: condition === "failing-explicit" ? 7 : 0 })
        });
        assert.notEqual(result.status, 0);
        const calls = (await probe.events()).filter((entry) => entry.event === "process");
        assert.equal(calls.length, condition === "failing-explicit" ? 1 : 0, "rejection must not probe a fallback binary");
        assert.match(result.stderr, /selected|explicit|environment|integrity|unavailable|probe/i);
        await assertOffline(project);
      });
    }
  } finally {
    await removeProject(project);
  }
});

test("project-video REM-0130 preserves recoverable preview originals across publication and rollback faults", async (t) => {
  for (const failures of [
    ["backup:output"], ["backup:manifest"], ["publish:output"], ["publish:manifest"],
    ["publish:manifest", "restore:output"], ["publish:manifest", "restore:manifest"],
    ["publish:manifest", "rollback-remove:output"]
  ]) {
    await t.test(failures.join(", "), async () => {
      const project = await createProject("preview-rollback");
      try {
        const plan = await seedPlan(project, browserPreviewVoice);
        assert.equal(run(project, "browser-preview").status, 0);
        const targets = {
          output: path.join(project, ...plan.output.file.split("/")),
          manifest: path.join(project, "reports", "project-video", "browser-preview-manifest.json")
        };
        const originals = Object.fromEntries(await Promise.all(Object.entries(targets).map(async ([name, file]) => [name, await readFile(file)])));
        plan.scenes[0].title = "Replacement scene";
        await writeFile(path.join(project, "reports", "project-video", "project-video-plan.json"), JSON.stringify(plan));
        const probe = await installOperationProbe(project, targets);
        const result = run(project, "browser-preview", ["--force"], { PSO_VIDEO_OPERATION_CONFIG: JSON.stringify({ failures }) });
        assert.notEqual(result.status, 0);
        const events = await probe.events();
        for (const failure of failures) assert.ok(events.some((entry) => entry.event === failure), `fault ${failure} must be reached`);
        for (const [name, file] of Object.entries(targets)) {
          const backups = (await readdir(path.dirname(file))).filter((entry) => entry.startsWith(`${path.basename(file)}.`) && entry.endsWith(".backup"));
          const candidates = [...(existsSync(file) ? [file] : []), ...backups.map((entry) => path.join(path.dirname(file), entry))];
          assert.ok((await Promise.all(candidates.map((candidate) => readFile(candidate)))).some((bytes) => bytes.equals(originals[name])), `${name} original must remain installed or in a retained backup`);
          if (failures.length === 1) {
            assert.deepEqual(await readFile(file), originals[name]);
            assert.equal(backups.length, 0);
          }
        }
        if (failures.length > 1) assert.match(result.stderr, /recovery|required|rollback.*incomplete|retain.*backup/i);
        await assertOffline(project);
      } finally {
        await removeProject(project);
      }
    });
  }
});

test("project-video REM-0130 keeps committed preview output intact when backup cleanup fails", async (t) => {
  for (const name of ["output", "manifest"]) {
    await t.test(name, async () => {
      const project = await createProject("preview-cleanup");
      try {
        const plan = await seedPlan(project, browserPreviewVoice);
        assert.equal(run(project, "browser-preview").status, 0);
        const targets = {
          output: path.join(project, ...plan.output.file.split("/")),
          manifest: path.join(project, "reports", "project-video", "browser-preview-manifest.json")
        };
        const original = await readFile(targets[name]);
        plan.scenes[0].title = "Replacement scene";
        await writeFile(path.join(project, "reports", "project-video", "project-video-plan.json"), JSON.stringify(plan));
        const probe = await installOperationProbe(project, targets);
        const result = run(project, "browser-preview", ["--force"], {
          PSO_VIDEO_OPERATION_CONFIG: JSON.stringify({ failures: [`cleanup-backup:${name}`] })
        });
        assert.notEqual(result.status, 0);
        assert.match(result.stderr, /published.*cleanup|cleanup.*published|committed/i);
        const html = await readFile(targets.output);
        const manifest = JSON.parse(await readFile(targets.manifest, "utf8"));
        assert.match(html.toString("utf8"), /Replacement scene/);
        assert.equal(manifest.sha256, sha256(html));
        assert.ok(!(await probe.events()).some((entry) => entry.event.startsWith("restore:")));
        const backups = (await readdir(path.dirname(targets[name]))).filter((entry) => entry.startsWith(`${path.basename(targets[name])}.`) && entry.endsWith(".backup"));
        assert.equal(backups.length, 1);
        assert.deepEqual(await readFile(path.join(path.dirname(targets[name]), backups[0])), original);
        await assertOffline(project);
      } finally {
        await removeProject(project);
      }
    });
  }
});

async function mediaPublicationFixture() {
  const project = await createProject("media-publication");
  try {
    const plan = await seedPlan(project);
    await seedAzureDiscovery(project);
    await seedApprovedVoiceSelection(project);
    await seedNarration(project);
    const tools = path.join(project, ".skills-orchestrator", "tools", "project-video");
    const renderer = path.join(tools, "node_modules", "ffmpeg-static", process.platform === "win32" ? "ffmpeg.exe" : "ffmpeg");
    await mkdir(path.dirname(renderer), { recursive: true });
    const bytes = Buffer.from("non-executable publication fixture");
    await writeFile(renderer, bytes);
    await writeFile(path.join(tools, "renderer-manifest.json"), JSON.stringify({ package: "ffmpeg-static", packageVersion: "5.3.0", binarySha256: sha256(bytes) }));
    const targets = {
      output: path.join(project, ...plan.output.file.split("/")),
      source: path.join(project, "reports", "project-video", "source"),
      manifest: path.join(project, "reports", "project-video", "project-video-manifest.json")
    };
    const probe = await installOperationProbe(project, { ...targets, renderer });
    function render(options = {}) {
      return run(project, "render", ["--approve-render", "--force"], {
        FFMPEG_PATH: "",
        PSO_VIDEO_OPERATION_CONFIG: JSON.stringify({ renderMedia: true, ...options })
      });
    }
    async function changePlan() {
      const planFile = path.join(project, "reports", "project-video", "project-video-plan.json");
      const current = JSON.parse(await readFile(planFile, "utf8"));
      current.scenes[0].title = "Replacement source generation";
      await writeFile(planFile, JSON.stringify(current));
      await seedNarration(project);
    }
    return { project, targets, probe, render, changePlan };
  } catch (error) {
    await removeProject(project);
    throw error;
  }
}

async function mediaSnapshot(targets) {
  const snapshot = {};
  for (const [name, file] of Object.entries(targets)) {
    if (!existsSync(file)) snapshot[name] = null;
    else if (name === "source") snapshot[name] = Object.fromEntries(await Promise.all((await readdir(file)).sort().map(async (item) => [item, sha256(await readFile(path.join(file, item)))])));
    else snapshot[name] = sha256(await readFile(file));
  }
  return snapshot;
}

async function assertMediaGeneration(fixture, replacement = false) {
  const { project, targets } = fixture;
  const bytes = await readFile(targets.output);
  const manifest = JSON.parse(await readFile(targets.manifest, "utf8"));
  assert.equal(manifest.status, "complete");
  assert.equal(manifest.sha256, sha256(bytes));
  assert.equal(manifest.bytes, bytes.length);
  assert.equal(manifest.output, path.relative(project, targets.output).replaceAll("\\", "/"));
  const planFile = path.join(project, ...manifest.plan.split("/"));
  assert.equal(manifest.planSha256, sha256(await readFile(planFile)));
  const plan = JSON.parse(await readFile(planFile, "utf8"));
  assert.deepEqual((await readdir(targets.source)).sort(), plan.scenes.map((scene) => `${scene.id}.svg`).sort());
  const source = await readFile(path.join(targets.source, "scene-01.svg"), "utf8");
  assert.equal(/REPLACEMENT SOURCE GENERATION/.test(source), replacement);
  for (const record of manifest.audio.scenes) assert.equal(record.sha256, sha256(await readFile(path.join(project, ...record.file.split("/")))));
  const schema = JSON.parse(await readFile(path.join(root, "schemas", "project-video-manifest.schema.json"), "utf8"));
  assert.deepEqual(Object.keys(manifest).sort(), schema.required.toSorted());
  assert.equal(manifest.schemaVersion, schema.properties.schemaVersion.const);
  assert.equal(manifest.status, schema.properties.status.const);
  assert.match(manifest.output, new RegExp(schema.properties.output.pattern));
  assert.equal(manifest.video.codec, schema.properties.video.properties.codec.const);
}

test("project-video REM-0131 normally publishes one coherent media generation", async () => {
  const fixture = await mediaPublicationFixture();
  try {
    const initial = fixture.render();
    assert.equal(initial.status, 0, initial.stderr);
    await assertMediaGeneration(fixture);
    const old = await mediaSnapshot(fixture.targets);
    await fixture.changePlan();
    const replacement = fixture.render({ mediaMarker: "replacement offline media" });
    assert.equal(replacement.status, 0, replacement.stderr);
    await assertMediaGeneration(fixture, true);
    const current = await mediaSnapshot(fixture.targets);
    for (const name of Object.keys(current)) assert.notDeepEqual(current[name], old[name]);
    const cacheRoot = path.join(fixture.project, ".skills-orchestrator", "cache", "project-video");
    assert.deepEqual(await readdir(cacheRoot), []);
    for (const file of Object.values(fixture.targets)) assert.ok(!(await readdir(path.dirname(file))).some((entry) => entry.startsWith(`${path.basename(file)}.`) && entry.endsWith(".backup")));
    await assertOffline(fixture.project);
  } finally {
    await removeProject(fixture.project);
  }
});

test("project-video REM-0131 restores existing and absent originals at every publication boundary", async (t) => {
  for (const originals of ["present", "absent", "output-only"]) {
    const failures = [...(originals === "present" ? ["backup:output", "backup:source", "backup:manifest"] : []), "publish:output", "publish:source", "publish:manifest", "commit"];
    for (const failure of failures) {
      await t.test(`${originals}: ${failure}`, async () => {
        const fixture = await mediaPublicationFixture();
        try {
          if (originals !== "absent") {
            assert.equal(fixture.render().status, 0);
            if (originals === "output-only") {
              await rm(fixture.targets.source, { recursive: true });
              await rm(fixture.targets.manifest);
            }
          }
          const before = await mediaSnapshot(fixture.targets);
          await fixture.changePlan();
          await fixture.probe.reset();
          const result = fixture.render({ mediaMarker: "replacement offline media", failures: [failure] });
          assert.notEqual(result.status, 0);
          assert.ok((await fixture.probe.events()).some((event) => event.event === failure), "the requested publication failure must be reached");
          assert.deepEqual(await mediaSnapshot(fixture.targets), before, "failure must restore the exact prior generation, including absent originals");
          const cacheRoot = path.join(fixture.project, ".skills-orchestrator", "cache", "project-video");
          assert.deepEqual(await readdir(cacheRoot), []);
          await assertOffline(fixture.project);
        } finally {
          await removeProject(fixture.project);
        }
      });
    }
  }
});

test("project-video REM-0131 retains originals, candidates and a journal when rollback is incomplete", async (t) => {
  for (const failure of ["restore:output", "restore:source", "restore:manifest", "unstage:output", "unstage:source", "unstage:manifest"]) {
    await t.test(failure, async () => {
      const fixture = await mediaPublicationFixture();
      try {
        assert.equal(fixture.render().status, 0);
        const before = await mediaSnapshot(fixture.targets);
        await fixture.changePlan();
        const result = fixture.render({ mediaMarker: "replacement offline media", failures: ["commit", failure] });
        assert.notEqual(result.status, 0);
        assert.match(result.stderr, /rollback incomplete|recovery required/i);
        const lockPath = path.join(fixture.project, ".skills-orchestrator", "cache", "project-video", "publication.lock");
        const lock = JSON.parse(await readFile(lockPath, "utf8"));
        const journalFile = path.join(fixture.project, ...lock.journal.split("/"));
        const journal = JSON.parse(await readFile(journalFile, "utf8"));
        assert.equal(journal.state, "prepared");
        for (const entry of journal.entries) {
          const target = path.join(fixture.project, ...entry.target.split("/"));
          const backup = path.join(fixture.project, ...entry.backup.split("/"));
          const original = existsSync(backup) ? backup : target;
          assert.deepEqual((await mediaSnapshot({ [entry.name]: original }))[entry.name], before[entry.name]);
          assert.ok(existsSync(path.join(fixture.project, ...entry.staged.split("/"))) || entry.hadOriginal && existsSync(backup) && existsSync(target), "the replacement candidate must survive failed rollback");
        }
        await fixture.probe.reset();
        const retry = fixture.render();
        assert.notEqual(retry.status, 0);
        assert.match(retry.stderr, /publication.*progress|recovery/i);
        assert.equal((await fixture.probe.events()).filter((entry) => entry.event === "process").length, 0, "recovery must block rerender before executable use");
        await assertOffline(fixture.project);
      } finally {
        await removeProject(fixture.project);
      }
    });
  }
});

test("project-video REM-0131 preserves committed media when backup cleanup fails", async (t) => {
  for (const name of ["output", "source", "manifest"]) {
    await t.test(name, async () => {
      const fixture = await mediaPublicationFixture();
      try {
        assert.equal(fixture.render().status, 0);
        const before = await mediaSnapshot(fixture.targets);
        await fixture.changePlan();
        const result = fixture.render({ mediaMarker: "replacement offline media", failures: [`cleanup-backup:${name}`] });
        assert.notEqual(result.status, 0);
        assert.match(result.stderr, /committed.*cleanup|published.*cleanup/i);
        await assertMediaGeneration(fixture, true);
        const lock = JSON.parse(await readFile(path.join(fixture.project, ".skills-orchestrator", "cache", "project-video", "publication.lock"), "utf8"));
        const journalFile = path.join(fixture.project, ...lock.journal.split("/"));
        const journal = JSON.parse(await readFile(journalFile, "utf8"));
        const commit = JSON.parse(await readFile(path.join(path.dirname(journalFile), "publication-committed.json"), "utf8"));
        assert.equal(commit.state, "committed");
        assert.equal(commit.outputSha256, (await mediaSnapshot(fixture.targets)).output);
        const backup = journal.entries.find((entry) => entry.name === name).backup;
        assert.deepEqual((await mediaSnapshot({ [name]: path.join(fixture.project, ...backup.split("/")) }))[name], before[name]);
        await assertOffline(fixture.project);
      } finally {
        await removeProject(fixture.project);
      }
    });
  }
});

test("project-video REM-0131 process interruption retains a recoverable publication generation", async (t) => {
  for (const after of ["publish:output", "publish:source", "publish:manifest", "commit"]) {
    await t.test(after, async () => {
      const fixture = await mediaPublicationFixture();
      try {
        assert.equal(fixture.render().status, 0);
        const before = await mediaSnapshot(fixture.targets);
        await fixture.changePlan();
        const result = fixture.render({ mediaMarker: "replacement offline media", crashAfter: after });
        assert.equal(result.status, 79);
        const lock = JSON.parse(await readFile(path.join(fixture.project, ".skills-orchestrator", "cache", "project-video", "publication.lock"), "utf8"));
        const journalFile = path.join(fixture.project, ...lock.journal.split("/"));
        const journal = JSON.parse(await readFile(journalFile, "utf8"));
        assert.equal(existsSync(path.join(path.dirname(journalFile), "publication-committed.json")), after === "commit");
        if (after === "commit") await assertMediaGeneration(fixture, true);
        for (const entry of journal.entries) {
          const backup = path.join(fixture.project, ...entry.backup.split("/"));
          assert.deepEqual((await mediaSnapshot({ [entry.name]: backup }))[entry.name], before[entry.name]);
          assert.ok(existsSync(path.join(fixture.project, ...entry.staged.split("/"))) || existsSync(path.join(fixture.project, ...entry.target.split("/"))));
        }
        await fixture.probe.reset();
        const retry = fixture.render();
        assert.notEqual(retry.status, 0);
        assert.match(retry.stderr, /publication.*progress|recovery/i);
        assert.equal((await fixture.probe.events()).filter((entry) => entry.event === "process").length, 0);
        await assertOffline(fixture.project);
      } finally {
        await removeProject(fixture.project);
      }
    });
  }
});

test("project-video REM-0131 reports postcommit render-cache cleanup failure without rolling back media", async () => {
  const fixture = await mediaPublicationFixture();
  try {
    const result = fixture.render({ failures: ["cleanup-cache"] });
    assert.notEqual(result.status, 0);
    assert.match(result.stderr, /publication committed.*cleanup incomplete/i);
    await assertMediaGeneration(fixture);
    const cacheRoot = path.join(fixture.project, ".skills-orchestrator", "cache", "project-video");
    assert.equal((await readdir(cacheRoot)).length, 1, "failed cache cleanup must leave its transaction evidence available");
    assert.ok(!(await fixture.probe.events()).some((event) => event.event.startsWith("restore:")));
    await assertOffline(fixture.project);
  } finally {
    await removeProject(fixture.project);
  }
});

test("project-video REM-0134 binds the parsed plan and digest to one read despite an intervening edit", async (t) => {
  for (const replace of [false, true]) {
    await t.test(replace ? "edited-after-read" : "unchanged-control", async () => {
      const project = await createProject("plan-snapshot");
      try {
        const plan = await seedPlan(project, browserPreviewVoice);
        const file = path.join(project, "reports", "project-video", "project-video-plan.json");
        const original = await readFile(file);
        const replacement = structuredClone(plan);
        replacement.scenes[0].title = "Later unconsumed plan title";
        const probe = await installOperationProbe(project, { plan: file });
        const result = run(project, "browser-preview", [], {
          PSO_VIDEO_OPERATION_CONFIG: JSON.stringify({ planReplacement: replace ? JSON.stringify(replacement) : null })
        });
        assert.equal(result.status, 0, result.stderr);
        const manifest = JSON.parse(await readFile(path.join(project, "reports", "project-video", "browser-preview-manifest.json"), "utf8"));
        const html = await readFile(path.join(project, ...plan.output.file.split("/")), "utf8");
        assert.equal(manifest.planSha256, sha256(original), "the manifest must hash the bytes actually parsed, never a later reread");
        assert.equal(manifest.sha256, sha256(html));
        assert.ok(html.includes(plan.scenes[0].title));
        assert.ok(!html.includes(replacement.scenes[0].title));
        const events = await probe.events();
        assert.equal(events.filter((entry) => entry.event === "plan-read").length, 1);
        assert.equal(events.filter((entry) => entry.event === "plan-hash-read").length, 0);
        if (replace) assert.notEqual(sha256(await readFile(file)), manifest.planSha256);
        await assertOffline(project);
      } finally {
        await removeProject(project);
      }
    });
  }
});

const voiceSchemaDocuments = new Map();
async function inlineVoiceSchema(file) {
  const allowed = new Set(["project-video-plan.schema.json", "project-video-voice-samples.schema.json", "project-video-voice-selection.schema.json", "project-video-narration-manifest.schema.json", "project-video-manifest.schema.json"]);
  async function document(name) {
    assert.ok(allowed.has(name), "only repository-local video schemas may be resolved");
    if (!voiceSchemaDocuments.has(name)) voiceSchemaDocuments.set(name, JSON.parse(await readFile(path.join(root, "schemas", name), "utf8")));
    return voiceSchemaDocuments.get(name);
  }
  async function inline(rule, owner, stack = []) {
    if (Array.isArray(rule)) return Promise.all(rule.map((value) => inline(value, owner, stack)));
    if (!rule || typeof rule !== "object") return rule;
    const entries = Object.entries(rule).filter(([key]) => !["$id", "$defs", "$ref"].includes(key));
    const siblings = Object.fromEntries(await Promise.all(entries.map(async ([key, value]) => [key, await inline(value, owner, stack)])));
    if (!rule.$ref) return siblings;
    const [reference, fragment = ""] = rule.$ref.split("#");
    const targetFile = reference || owner;
    const identity = `${targetFile}#${fragment}`;
    assert.ok(!stack.includes(identity), "video schema reference cycle");
    const target = fragment.split("/").slice(1).reduce((value, key) => value?.[key.replaceAll("~1", "/").replaceAll("~0", "~")], await document(targetFile));
    assert.ok(target !== undefined, "every local schema reference must resolve");
    const expanded = await inline(target, targetFile, [...stack, identity]);
    return entries.length ? { allOf: [expanded, siblings] } : expanded;
  }
  return inline(await document(file), file);
}

async function voiceSchemaVerdicts(cases) {
  const input = await Promise.all(cases.map(async ({ schema, value }) => ({
    schema: JSON.stringify(await inlineVoiceSchema(schema)), document: JSON.stringify(value)
  })));
  const script = `
$ErrorActionPreference = 'Stop'
Get-Command Test-Json -ErrorAction Stop | Out-Null
$cases = [Console]::In.ReadToEnd() | ConvertFrom-Json
$results = @()
foreach ($case in $cases) {
  try { $results += [bool](Test-Json -Json $case.document -Schema $case.schema -ErrorAction Stop) }
  catch { $results += $false }
}
ConvertTo-Json -InputObject $results -Compress
`;
  const result = spawnSync("pwsh", ["-NoProfile", "-NonInteractive", "-EncodedCommand", Buffer.from(script, "utf16le").toString("base64")], {
    input: JSON.stringify(input), encoding: "utf8", timeout: 30_000, windowsHide: true
  });
  assert.equal(result.status, 0, `Local PowerShell Test-Json is required: ${result.error?.message || result.stderr}`);
  return JSON.parse(result.stdout);
}

test("project-video REM-0135 emitted A/B/C artifacts conform to all actual owning schemas", async (t) => {
  for (const profile of ["ava-hd-warm", "aria-hd-warm", "jenny-professional"]) {
    await t.test(profile, async () => {
      const fixture = await mediaPublicationFixture();
      try {
        const speech = { AZURE_SPEECH_KEY: "offline-fake-speech-key", AZURE_SPEECH_REGION: "eastus", PSO_VIDEO_FAKE_SPEECH: "audio" };
        const audition = run(fixture.project, "audition", ["--approve-external", "--force"], speech);
        assert.equal(audition.status, 0, audition.stderr);
        const selection = run(fixture.project, "select-voice", ["--profile", profile, "--approve-selection"]);
        assert.equal(selection.status, 0, selection.stderr);
        const narration = run(fixture.project, "narrate", ["--approve-external", "--force"], speech);
        assert.equal(narration.status, 0, narration.stderr);
        const render = fixture.render();
        assert.equal(render.status, 0, render.stderr);
        const artifacts = [
          ["project-video-voice-samples.schema.json", "voice-samples/voice-samples.json"],
          ["project-video-voice-selection.schema.json", "voice-selection.json"],
          ["project-video-narration-manifest.schema.json", "audio/narration-manifest.json"],
          ["project-video-manifest.schema.json", "project-video-manifest.json"]
        ];
        const cases = await Promise.all(artifacts.map(async ([schema, file]) => ({
          schema, value: JSON.parse(await readFile(path.join(fixture.project, "reports", "project-video", ...file.split("/")), "utf8"))
        })));
        assert.equal(cases[1].value.profile, profile);
        assert.equal(cases[2].value.voiceSelectionProfile, profile);
        assert.equal(cases[3].value.audio.profile, profile);
        const invalid = cases.map(({ schema, value }) => ({ schema, value: { ...structuredClone(value), unexpectedContractField: true } }));
        const nestedInvalid = structuredClone(cases[1]);
        nestedInvalid.value.voice.styleDegree = 99;
        const invalidProfile = structuredClone(cases[3]);
        invalidProfile.value.audio.profile = "unapproved-profile";
        assert.deepEqual(await voiceSchemaVerdicts([...cases, ...invalid, nestedInvalid, invalidProfile]),
          [true, true, true, true, false, false, false, false, false, false],
          "actual emitted artifacts must pass; additional fields, referenced constraints, and unknown profiles must fail");
        if (profile === "jenny-professional") {
          const historical = structuredClone(cases);
          const historicalVoice = { ...historical[0].value.samples[2].voice, name: "en-US-AriaNeural" };
          historical[0].value.samples[2].id = "aria-professional";
          historical[0].value.samples[2].file = "aria-professional.mp3";
          historical[0].value.samples[2].voice = historicalVoice;
          historical[0].value.samples[2].label = "C - Aria Neural - historical professional narration";
          historical[1].value.profile = "aria-professional";
          historical[1].value.sampleFile = "reports/project-video/voice-samples/aria-professional.mp3";
          historical[1].value.voice = historicalVoice;
          historical[1].value.label = historical[0].value.samples[2].label;
          historical[2].value.voiceSelectionProfile = "aria-professional";
          historical[2].value.voice = historicalVoice.name;
          historical[2].value.voiceSettings = historicalVoice;
          historical[2].value.voiceSettingsSha256 = sha256(JSON.stringify(historicalVoice));
          historical[3].value.audio.profile = "aria-professional";
          historical[3].value.audio.voice = historicalVoice.name;
          historical[3].value.audio.voiceSettingsSha256 = historical[2].value.voiceSettingsSha256;
          assert.deepEqual(await voiceSchemaVerdicts(historical), [true, true, true, true], "historical profile identifiers must remain schema-readable, not silently renamed");
        }
        assert.deepEqual(await azureCalls(fixture.project), []);
      } finally {
        await removeProject(fixture.project);
      }
    });
  }
});

test("project-video REM-0135 legacy profile reuse requires explicit re-audition without rewriting evidence", async () => {
  const project = await createProject("legacy-profile-gate");
  try {
    await seedPlan(project);
    await seedAzureDiscovery(project);
    await seedApprovedVoiceSelection(project);
    const sampleFile = path.join(project, "reports", "project-video", "voice-samples", "voice-samples.json");
    const selectionFile = path.join(project, "reports", "project-video", "voice-selection.json");
    const samples = JSON.parse(await readFile(sampleFile, "utf8"));
    samples.samples[2].id = "aria-professional";
    samples.samples[2].file = "aria-professional.mp3";
    await writeFile(sampleFile, JSON.stringify(samples));
    const selection = JSON.parse(await readFile(selectionFile, "utf8"));
    selection.profile = "aria-professional";
    await writeFile(selectionFile, JSON.stringify(selection));
    const files = [sampleFile, selectionFile, path.join(project, "reports", "project-video", "project-video-plan.json")];
    const before = await Promise.all(files.map((file) => readFile(file)));
    for (const [command, args] of [
      ["select-voice", ["--profile", "aria-professional", "--approve-selection"]],
      ["select-voice", ["--profile", "ava-hd-warm", "--approve-selection"]],
      ["narrate", ["--approve-external"]]
    ]) {
      const result = run(project, command, args);
      assert.notEqual(result.status, 0);
      assert.match(result.stderr, /legacy.*aria-professional.*re-audition/i);
      assert.deepEqual(await Promise.all(files.map((file) => readFile(file))), before);
    }
    assert.ok(!existsSync(path.join(project, "reports", "project-video", "audio")));
    await assertOffline(project);
  } finally {
    await removeProject(project);
  }
});

async function installSpeechStreamProbe(project) {
  const fixture = fixtures.get(project);
  const directory = path.dirname(fixture.networkGuard);
  fixture.speechProbe = path.join(directory, "speech-stream-probe.mjs");
  const log = path.join(directory, "speech-stream-events.jsonl");
  await writeFile(log, "");
  await writeFile(fixture.speechProbe, `
import fs from "node:fs";
const config = JSON.parse(process.env.PSO_VIDEO_STREAM_CASE);
const record = (value) => fs.appendFileSync(${JSON.stringify(log)}, JSON.stringify(value) + "\\n");
const allocate = Buffer.alloc;
let currentResponse = 0;
let recordingAllocation = false;
Buffer.alloc = (size, ...args) => {
  if (currentResponse && !recordingAllocation) {
    recordingAllocation = true;
    try { record({ id: currentResponse, event: "consumer-allocation", bytes: size }); }
    finally { recordingAllocation = false; }
  }
  return allocate(size, ...args);
};
let sequence = 0;
globalThis.fetch = async (url, options) => {
  if (url !== "https://eastus.tts.speech.microsoft.com/cognitiveservices/v1" || options.method !== "POST") throw new Error("Unexpected stream fixture request");
  const id = ++sequence;
  currentResponse = id;
  let bytes = 0;
  let reads = 0;
  record({ id, event: "fetch" });
  const reader = {
    async read() {
      reads += 1;
      if (config.readFailure && reads === 2) throw new Error("Injected Speech stream read failure");
      if (config.abortRead && reads === 2) throw new DOMException("Injected Speech abort", "AbortError");
      if (bytes === config.total) { record({ id, event: "done" }); return { done: true }; }
      const length = Math.min(config.chunkSize || 65536, config.total - bytes);
      const value = allocate(length, 1);
      for (let index = 0; index < length && bytes + index < 3; index += 1) value[index] = config.badHeader ? 0 : Buffer.from("ID3")[bytes + index];
      bytes += length;
      record({ id, event: "chunk", bytes: length, cumulativeBytes: bytes });
      return { done: false, value };
    },
    async cancel() {
      record({ id, event: "cancel" });
      if (config.cancelFailure) throw new Error("Injected Speech cancellation failure");
    },
    releaseLock() {
      record({ id, event: "release" });
      currentResponse = 0;
      if (config.releaseFailure) throw new Error("Injected Speech release failure");
    }
  };
  return {
    ok: (config.status || 200) === 200,
    status: config.status || 200,
    headers: { get: (name) => name === "content-type" ? (config.contentType || "audio/mpeg") : name === "content-length" ? (config.contentLength ?? null) : null },
    body: config.noBody ? null : { getReader: () => reader },
    async arrayBuffer() { record({ id, event: "unbounded-buffer" }); throw new Error("Unbounded Speech buffering attempted"); }
  };
};
`);
  return async () => (await readFile(log, "utf8")).trim().split(/\r?\n/).filter(Boolean).map(JSON.parse);
}

test("project-video REM-0143 caps streamed Speech bytes and releases responses on every exit", async (t) => {
  const maximum = 20 * 1024 * 1024;
  const cases = [
    { name: "minimum-minus-one", total: 1023, error: /incomplete MP3/ },
    { name: "minimum", total: 1024 },
    { name: "minimum-plus-one-split-header", total: 1025, chunkSize: 1 },
    { name: "maximum-minus-one-no-length", total: maximum - 1 },
    { name: "maximum-with-false-large-length", total: maximum, contentLength: String(maximum + 1) },
    { name: "maximum-plus-one-with-false-small-length", total: maximum + 1, contentLength: "1", error: /too large|byte limit|exceed/i },
    { name: "oversized-first-chunk", total: maximum + 1, chunkSize: maximum + 1, error: /too large|byte limit|exceed/i },
    { name: "overflow-cancel-failure", total: maximum + 1, cancelFailure: true, error: /cleanup.*cancellation|cancellation.*cleanup/i },
    { name: "read-failure", total: 131072, readFailure: true, error: /stream read failure/ },
    { name: "aborted-read", total: 131072, abortRead: true, error: /abort/i },
    { name: "http-error", total: maximum + 1, status: 503, error: /HTTP 503/ },
    { name: "wrong-content-type", total: maximum + 1, contentType: "application/json", error: /non-audio/ },
    { name: "invalid-header", total: 1024, badHeader: true, error: /incomplete MP3/ },
    { name: "release-failure", total: 1024, releaseFailure: true, error: /cleanup.*release|release.*cleanup/i },
    { name: "missing-body", total: 1024, noBody: true, error: /body|stream/i }
  ];
  for (const entry of cases) {
    await t.test(entry.name, async () => {
      const project = await createProject("speech-stream");
      try {
        await seedPlan(project);
        await seedAzureDiscovery(project);
        const events = await installSpeechStreamProbe(project);
        const { error, name, ...configuration } = entry;
        const result = run(project, "audition", ["--approve-external"], {
          AZURE_SPEECH_KEY: "offline-fake-speech-key", AZURE_SPEECH_REGION: "eastus",
          PSO_VIDEO_STREAM_CASE: JSON.stringify(configuration)
        });
        const trace = await events();
        assert.ok(!trace.some((event) => event.event === "unbounded-buffer"), "full-body buffering must never be attempted");
        const allocations = trace.filter((event) => event.event === "consumer-allocation");
        assert.ok(allocations.every((event) => event.bytes <= maximum), "no consumer allocation may exceed the byte cap");
        if (entry.chunkSize > maximum) assert.ok(allocations.every((event) => event.bytes === 0), "reject a first oversized chunk before allocating response storage");
        const requests = trace.filter((event) => event.event === "fetch").length;
        if (error) {
          assert.notEqual(result.status, 0);
          assert.match(result.stderr, error);
          assert.equal(requests, 1);
          assert.equal(trace.filter((event) => event.event === "release").length, entry.noBody ? 0 : 1);
          assert.equal(trace.filter((event) => event.event === "cancel").length, entry.noBody || entry.releaseFailure ? 0 : 1);
          assert.ok(!existsSync(path.join(project, "reports", "project-video", "voice-samples")));
          if (entry.status || entry.contentType) assert.equal(trace.filter((event) => event.event === "chunk").length, 0);
          if (entry.total > maximum && !entry.status && !entry.contentType) {
            assert.equal(trace.filter((event) => event.event === "done").length, 0, "overflow must stop without reading to EOF");
            assert.equal(Math.max(...trace.filter((event) => event.event === "chunk").map((event) => event.cumulativeBytes)), maximum + 1);
          }
        } else {
          assert.equal(result.status, 0, result.stderr);
          assert.equal(requests, 3);
          assert.equal(trace.filter((event) => event.event === "release").length, 3);
          assert.equal(trace.filter((event) => event.event === "cancel").length, 0);
          const manifest = JSON.parse(await readFile(path.join(project, "reports", "project-video", "voice-samples", "voice-samples.json"), "utf8"));
          for (const sample of manifest.samples) assert.equal((await readFile(path.join(project, "reports", "project-video", "voice-samples", sample.file))).length, entry.total);
        }
        assert.deepEqual(await azureCalls(project), []);
      } finally {
        await removeProject(project);
      }
    });
  }
});

test("project-video accepts canonical producer fields and 29-day bound discovery without Azure calls", async () => {
  const project = await createProject("canonical-discovery");
  try {
    const report = await seedAzureDiscovery(project, {
      discoveredAt: new Date(Date.now() - 29 * 86_400_000).toISOString(),
      imageGeneration: imageGeneration("gpt-image-2", "eastus"),
      openAIAvailable: true, openAIModelName: "gpt-5", openAIModelVersion: "2026-08"
    });
    assert.deepEqual(validateDiscovery(report), []);
    const before = await discoveryFiles(project);
    const diagnostic = run(project, "discovery-status");
    assert.equal(diagnostic.status, 0, diagnostic.stderr);
    assert.equal(JSON.parse(diagnostic.stdout).status, "ready", diagnostic.stdout);
    const preflight = run(project, "azure-preflight", [], { AZURE_SPEECH_REGION: "eastus" });
    assert.equal(preflight.status, 0, `${preflight.stdout}\n${preflight.stderr}`);
    assert.equal(JSON.parse(preflight.stdout).selectedRegion, "eastus");
    assert.match(preflight.stderr, /Set AZURE_SPEECH_KEY/);
    assert.deepEqual(await discoveryFiles(project), before);
    await assertOffline(project);
  } finally {
    await removeProject(project);
  }
});

test("project-video discovery inspection follows the owner's exact inclusive 30-day boundary", async () => {
  const project = await createProject("discovery-boundary");
  try {
    const profile = azureProfile();
    const discoveredAt = "2026-08-01T00:00:00.000Z";
    const report = await seedDiscovery(project, speechReport(profile, { discoveredAt }), profile);
    const boundary = Date.parse(discoveredAt) + 30 * 86_400_000;
    assert.equal(inspectDiscovery(report, profile, { now: boundary }).status, "fresh");
    assert.equal((await inspectCachedDiscovery(project, { now: boundary })).status, "fresh");
    assert.equal((await inspectCachedDiscovery(project, { now: boundary + 1 })).reason, "expired");
    assert.equal(inspectDiscovery(report, profile, { now: Date.parse(discoveredAt) - 1 }).reason, "future-dated");
    await assertOffline(project);
  } finally {
    await removeProject(project);
  }
});

for (const state of ["missing", "expired", "future-dated", "context-mismatch", "malformed", "invalid", "unbound", "incomplete", "missing-markdown"]) {
  test(`project-video diagnoses ${state} offline and azure-preflight refreshes once through the packaged owner`, async () => {
    const project = await createProject(`refresh-${state}`);
    try {
      const profile = await seedUnusableDiscovery(project, state);
      const before = await discoveryFiles(project);
      const diagnostic = run(project, "discovery-status");
      assert.equal(diagnostic.status, 0, diagnostic.stderr);
      const status = JSON.parse(diagnostic.stdout);
      assert.equal(status.status, state === "missing" ? "missing" : "unusable");
      assert.equal(status.nextAction, "refresh-on-selected-azure-work");
      assert.match(status.reason, new RegExp(state === "missing-markdown" ? "incomplete" : state));
      assert.deepEqual(await discoveryFiles(project), before);
      await assertOffline(project);

      const preflight = run(project, "azure-preflight");
      assert.equal(preflight.status, 0, `${preflight.stdout}\n${preflight.stderr}`);
      const readiness = JSON.parse(preflight.stdout);
      assert.equal(readiness.status, "ready");
      assert.equal(readiness.credentialConfigured, false);
      assert.equal(readiness.selectedRegion, null);
      assert.match(preflight.stderr, /=== Azure discovery \(/);
      assert.match(preflight.stderr, /Set AZURE_SPEECH_KEY/);
      assert.match(preflight.stderr, /Set AZURE_SPEECH_REGION/);
      const calls = await azureCalls(project);
      assert.equal(calls.filter((call) => call.startsWith("cognitiveservices model list ") && call.includes("sku:model.skus[0].name")).length, 1, calls.join("\n"));
      assert.ok(!calls.some((call) => call.startsWith("keyvault ")));
      const current = await inspectCachedDiscovery(project);
      assert.equal(current.status, "fresh");
      assert.equal(current.report.cloud, profile.cloud);
      assert.equal(current.report.location, profile.location);
      assert.deepEqual(validateDiscovery(current.report), []);
      assert.ok(current.report.contextSha256 && current.report.expiresAt && current.report.imageGeneration);

      const second = run(project, "azure-preflight");
      assert.equal(second.status, 0, `${second.stdout}\n${second.stderr}`);
      assert.equal(JSON.parse(second.stdout).status, "ready");
      assert.doesNotMatch(second.stderr, /=== Azure discovery \(/);
      assert.deepEqual(await azureCalls(project), calls);
      assert.equal(await readFile(fixtures.get(project).networkLog, "utf8"), "");
    } finally {
      await removeProject(project);
    }
  });
}

for (const command of ["audition", "narrate"]) {
  for (const state of ["fresh", "expired", "missing"]) {
    test(`project-video ${command} with ${state} evidence needs current approval before any Azure or credential request`, async () => {
      const project = await createProject(`approval-${command}-${state}`);
      try {
        await seedPlan(project);
        if (state === "fresh") await seedAzureDiscovery(project);
        else await seedUnusableDiscovery(project, state);
        await seedApprovedVoiceSelection(project);
        if (command === "audition") await rm(path.join(project, "reports", "project-video", "voice-samples"), { recursive: true });
        const before = await discoveryFiles(project);
        for (const args of [[], ["--approve-external", "false"]]) {
          const result = run(project, command, args, { AZURE_SPEECH_REGION: "eastus" });
          assert.notEqual(result.status, 0);
          assert.match(`${result.stdout}${result.stderr}`, /requires --approve-external/);
        }
        assert.deepEqual(await discoveryFiles(project), before);
        await assertOffline(project);
        assert.ok(!existsSync(path.join(project, "reports", "project-video", "audio")));
      } finally {
        await removeProject(project);
      }
    });
  }
}

for (const state of ["missing", "malformed", "unsupported-version", "missing-identity"]) {
  test(`project-video requires explicit profile initialization for ${state} profiles without contacting Azure`, async () => {
    const project = await createProject(`profile-${state}`);
    try {
      await seedAzureDiscovery(project);
      const profileFile = path.join(project, ".azure", "environment.json");
      if (state === "missing") await rm(profileFile);
      else if (state === "malformed") await writeFile(profileFile, "{invalid");
      else {
        const profile = azureProfile();
        if (state === "unsupported-version") profile.schemaVersion = "0.0.0";
        else delete profile.subscription.tenantId;
        await writeFile(profileFile, JSON.stringify(profile));
      }
      const before = await discoveryFiles(project);
      const result = run(project, "azure-preflight");
      assert.notEqual(result.status, 0);
      assert.match(`${result.stdout}${result.stderr}`, /initialize|initialization/i);
      assert.match(`${result.stdout}${result.stderr}`, /azure-discovery/);
      assert.deepEqual(await discoveryFiles(project), before);
      await assertOffline(project);
    } finally {
      await removeProject(project);
    }
  });
}

for (const command of ["audition", "narrate"]) {
  test(`project-video approved ${command} refreshes discovery before mocked Speech and binds the new digest`, async () => {
    const project = await createProject(`approved-${command}`);
    try {
      await seedPlan(project);
      await seedUnusableDiscovery(project, "expired");
      if (command === "narrate") await seedApprovedVoiceSelection(project);
      const result = run(project, command, ["--approve-external"], {
        AZURE_SPEECH_KEY: "offline-fake-speech-key", AZURE_SPEECH_REGION: "eastus", PSO_VIDEO_FAKE_SPEECH: "audio"
      });
      assert.equal(result.status, 0, `${result.stdout}\n${result.stderr}`);
      const calls = await azureCalls(project);
      assert.equal(calls.filter((call) => call.startsWith("cognitiveservices model list ") && call.includes("sku:model.skus[0].name")).length, 1);
      assert.ok(!calls.some((call) => call.startsWith("keyvault ")));
      const requests = (await readFile(fixtures.get(project).networkLog, "utf8")).trim().split("\n");
      assert.equal(requests.length, command === "audition" ? 3 : 6);
      assert.ok(requests.every((url) => url === "https://eastus.tts.speech.microsoft.com/cognitiveservices/v1"));
      const manifestFile = command === "audition"
        ? path.join(project, "reports", "project-video", "voice-samples", "voice-samples.json")
        : path.join(project, "reports", "project-video", "audio", "narration-manifest.json");
      const manifest = JSON.parse(await readFile(manifestFile, "utf8"));
      const discovery = await readFile(path.join(project, "reports", "azure-discovery.json"), "utf8");
      assert.equal(manifest.azureDiscoverySha256, sha256(discovery));
      assert.equal(manifest.azureDiscoveryAt, JSON.parse(discovery).discoveredAt);
      assert.equal(manifest.cloud, "AzureCloud");
      assert.equal(manifest.region, "eastus");
    } finally {
      await removeProject(project);
    }
  });

  test(`project-video approved ${command} preserves discovery on refresh failure and never synthesizes`, async () => {
    const project = await createProject(`failure-${command}`);
    try {
      await seedPlan(project);
      await seedUnusableDiscovery(project, "expired");
      await configureAzure(project, azureProfile(), speechReport(), true);
      if (command === "narrate") await seedApprovedVoiceSelection(project);
      const before = await discoveryFiles(project);
      const result = run(project, command, ["--approve-external"], {
        AZURE_SPEECH_REGION: "eastus", PSO_VIDEO_FAKE_SPEECH: "audio"
      });
      assert.notEqual(result.status, 0);
      assert.match(`${result.stdout}${result.stderr}`, /Azure discovery refresh failed/);
      assert.deepEqual(await discoveryFiles(project), before);
      const calls = await azureCalls(project);
      assert.ok(calls.length > 0);
      assert.ok(!calls.some((call) => call.startsWith("keyvault ")));
      assert.equal(await readFile(fixtures.get(project).networkLog, "utf8"), "");
      assert.ok(!existsSync(path.join(project, "reports", "project-video", command === "audition" ? "voice-samples" : "audio")));
    } finally {
      await removeProject(project);
    }
  });
}

test("project-video keeps local audio verification offline and refuses to rebind existing narration after refresh", async () => {
  const project = await createProject("digest-binding");
  try {
    await seedPlan(project);
    await seedUnusableDiscovery(project, "expired");
    await seedApprovedVoiceSelection(project);
    const manifestFile = await seedNarration(project);
    const before = await readFile(manifestFile, "utf8");
    const discoveryBefore = await discoveryFiles(project);
    for (const [command, args] of [["validate", []], ["ssml", []]]) {
      const result = run(project, command, args);
      assert.equal(result.status, 0, `${result.stdout}\n${result.stderr}`);
    }
    for (const [command, args] of [["render", ["--approve-render"]], ["browser-preview", ["--with-audio"]]]) {
      const result = run(project, command, args);
      assert.notEqual(result.status, 0);
      assert.match(`${result.stdout}${result.stderr}`, /expired/);
    }
    assert.deepEqual(await discoveryFiles(project), discoveryBefore);
    await assertOffline(project);
    const refreshed = run(project, "narrate", ["--approve-external"], {
      AZURE_SPEECH_KEY: "offline-fake-speech-key", AZURE_SPEECH_REGION: "eastus", PSO_VIDEO_FAKE_SPEECH: "audio"
    });
    assert.notEqual(refreshed.status, 0);
    assert.match(`${refreshed.stdout}${refreshed.stderr}`, /stale or unverified/);
    assert.equal(await readFile(manifestFile, "utf8"), before);
    const calls = await azureCalls(project);
    assert.equal(calls.filter((call) => call.startsWith("cognitiveservices model list ") && call.includes("sku:model.skus[0].name")).length, 1);
    for (const [command, args] of [["render", ["--approve-render"]], ["browser-preview", ["--with-audio"]]]) {
      const result = run(project, command, args);
      assert.notEqual(result.status, 0);
      assert.match(`${result.stdout}${result.stderr}`, /does not match the current discovery evidence/);
    }
    assert.deepEqual(await azureCalls(project), calls);
    assert.equal(await readFile(fixtures.get(project).networkLog, "utf8"), "");
    assert.equal(await readFile(manifestFile, "utf8"), before);
  } finally {
    await removeProject(project);
  }
});

for (const voice of [browserPreviewVoice, localPiperVoice]) {
  test(`project-video ${voice.provider} plans never activate Azure during an audition`, async () => {
    const project = await createProject(voice.provider);
    try {
      await seedPlan(project, voice);
      await seedUnusableDiscovery(project, "expired");
      const before = await discoveryFiles(project);
      const result = run(project, "audition", ["--approve-external"], { AZURE_SPEECH_REGION: "eastus" });
      assert.notEqual(result.status, 0);
      assert.match(`${result.stdout}${result.stderr}`, /requires an azure-neural plan/);
      if (voice.provider === "browser-preview") {
        const preview = run(project, "browser-preview");
        assert.equal(preview.status, 0, `${preview.stdout}\n${preview.stderr}`);
      } else {
        const narration = run(project, "narrate", ["--approve-local"]);
        assert.notEqual(narration.status, 0);
        assert.match(`${narration.stdout}${narration.stderr}`, /local Piper voice is not installed/);
      }
      assert.deepEqual(await discoveryFiles(project), before);
      await assertOffline(project);
    } finally {
      await removeProject(project);
    }
  });
}

test("project-video refresh preserves the configured cloud and never substitutes an unapproved Speech region", async () => {
  const project = await createProject("cloud-region");
  try {
    await seedPlan(project);
    const profile = azureProfile({ cloud: "AzureUSGovernment", location: "usgovarizona" });
    const report = speechReport(profile, { speech: { existingResourceKinds: ["AIServices"] } });
    await installProjectDiscovery(project);
    await seedDiscovery(project, { ...report, discoveredAt: new Date(Date.now() - 31 * 86_400_000).toISOString() }, profile);
    await configureAzure(project, profile, report);
    const before = await discoveryFiles(project);
    const cloudMismatch = run(project, "audition", ["--approve-external"], {
      AZURE_SPEECH_CLOUD: "AzureCloud", AZURE_SPEECH_REGION: "usgovarizona"
    });
    assert.notEqual(cloudMismatch.status, 0);
    assert.match(`${cloudMismatch.stdout}${cloudMismatch.stderr}`, /does not match AZURE_SPEECH_CLOUD AzureCloud/);
    assert.deepEqual(await discoveryFiles(project), before);
    await assertOffline(project);

    const regionMismatch = run(project, "audition", ["--approve-external"], {
      AZURE_SPEECH_CLOUD: "AzureUSGovernment", AZURE_SPEECH_REGION: "eastus"
    });
    assert.notEqual(regionMismatch.status, 0);
    assert.match(`${regionMismatch.stdout}${regionMismatch.stderr}`, /eastus is not an existing discovered Speech resource region: usgovarizona/);
    const current = await inspectCachedDiscovery(project);
    assert.equal(current.status, "fresh");
    assert.equal(current.report.cloud, "AzureUSGovernment");
    assert.equal(current.report.location, "usgovarizona");
    assert.ok(!existsSync(path.join(project, "reports", "project-video", "voice-samples")));
    const calls = await azureCalls(project);
    assert.equal(calls.filter((call) => call.startsWith("cognitiveservices model list ") && call.includes("sku:model.skus[0].name")).length, 1);
    assert.ok(!calls.some((call) => call.startsWith("keyvault ")));
    assert.equal(await readFile(fixtures.get(project).networkLog, "utf8"), "");

    const approved = run(project, "audition", ["--approve-external"], {
      AZURE_SPEECH_CLOUD: "AzureUSGovernment", AZURE_SPEECH_REGION: "usgovarizona",
      AZURE_SPEECH_KEY: "offline-fake-speech-key", PSO_VIDEO_FAKE_SPEECH: "audio"
    });
    assert.equal(approved.status, 0, `${approved.stdout}\n${approved.stderr}`);
    assert.deepEqual(await azureCalls(project), calls);
    const requests = (await readFile(fixtures.get(project).networkLog, "utf8")).trim().split("\n");
    assert.equal(requests.length, 3);
    assert.ok(requests.every((url) => url === "https://usgovarizona.tts.speech.azure.us/cognitiveservices/v1"));
  } finally {
    await removeProject(project);
  }
});

test("project-video inspection distinguishes an empty baseline from an implemented project", async () => {
  const project = await createProject("inspect");
  try {
    await mkdir(path.join(project, "src"), { recursive: true });
    await writeFile(path.join(project, "src", ".gitkeep"), "", "utf8");
    await writeFile(path.join(project, "README.md"), "# Empty governed baseline\n", "utf8");

    const blocked = run(project, "inspect");
    assert.equal(blocked.status, 2, `${blocked.stdout}\n${blocked.stderr}`);
    let evidence = JSON.parse(await readFile(path.join(project, "reports", "project-video", "project-evidence.json"), "utf8"));
    assert.equal(evidence.readiness, "blocked");
    assert.equal(evidence.sourceFileCount, 0);

    await writeFile(path.join(project, "main.py"), "ready = True\n", "utf8");
    const ready = run(project, "inspect");
    assert.equal(ready.status, 0, `${ready.stdout}\n${ready.stderr}`);
    evidence = JSON.parse(await readFile(path.join(project, "reports", "project-video", "project-evidence.json"), "utf8"));
    assert.equal(evidence.readiness, "ready");
    assert.equal(evidence.sourceFileCount, 1);
    assert.equal(evidence.languageExtensions[".py"], 1);
  } finally {
    await removeProject(project);
  }
});

test("project-video validates grounded plans and rejects escaping evidence", async () => {
  const project = await createProject("plan");
  try {
    await mkdir(path.join(project, "src"), { recursive: true });
    await mkdir(path.join(project, "reports", "project-video"), { recursive: true });
    await writeFile(path.join(project, "README.md"), "# Video fixture\n", "utf8");
    await writeFile(path.join(project, "src", "app.mjs"), "export const ready = true;\n", "utf8");
    const planPath = path.join(project, "reports", "project-video", "project-video-plan.json");
    const plan = validPlan("video-fixture");
    await writeFile(planPath, `${JSON.stringify(plan, null, 2)}\n`, "utf8");

    const valid = run(project, "validate");
    assert.equal(valid.status, 0, `${valid.stdout}\n${valid.stderr}`);
    assert.match(valid.stdout, /Valid project video plan/);

    const ssml = run(project, "ssml", ["--scene", "scene-01"]);
    assert.equal(ssml.status, 0, `${ssml.stdout}\n${ssml.stderr}`);
    assert.match(ssml.stdout, /en-US-AvaNeural/);
    assert.match(ssml.stdout, /xmlns:mstts="https:\/\/www\.w3\.org\/2001\/mstts"/);
    assert.match(ssml.stdout, /<voice name="en-US-AvaNeural"><prosody rate="-2%">/);
    assert.match(ssml.stdout, /rate="-2%"/);
    assert.match(ssml.stdout, /<s>U\.S\. projects can use Node\.js safely\.<\/s><break time="180ms"\/>/);
    assert.match(ssml.stdout, /<break time="180ms"\/>/);
    assert.doesNotMatch(ssml.stdout, /pitch=/);

    const legacyPlan = validPlan("legacy-video-fixture", { ...avaHdVoice });
    delete legacyPlan.voice.provider;
    await writeFile(planPath, `${JSON.stringify(legacyPlan, null, 2)}\n`, "utf8");
    await seedLegacyVoiceSelection(project);
    const legacySelection = run(project, "select-voice", ["--profile", "ava-hd-warm", "--approve-selection"]);
    assert.equal(legacySelection.status, 0, `${legacySelection.stdout}\n${legacySelection.stderr}`);
    const migratedPlan = JSON.parse(await readFile(planPath, "utf8"));
    assert.equal(migratedPlan.voice.provider, "azure-neural");
    await writeFile(planPath, `${JSON.stringify(plan, null, 2)}\n`, "utf8");

    const localPlan = validPlan("local-video-fixture", localPiperVoice);
    await writeFile(planPath, `${JSON.stringify(localPlan, null, 2)}\n`, "utf8");
    const localValid = run(project, "validate");
    assert.equal(localValid.status, 0, `${localValid.stdout}\n${localValid.stderr}`);
    const localSsml = run(project, "ssml");
    assert.notEqual(localSsml.status, 0);
    assert.match(`${localSsml.stdout}${localSsml.stderr}`, /available only for the azure-neural provider/);
    const browserPlan = validPlan("browser-video-fixture", browserPreviewVoice);
    browserPlan.output.file = "dist/project-video/browser-video-fixture.html";
    await writeFile(planPath, `${JSON.stringify(browserPlan, null, 2)}\n`, "utf8");
    const browserValid = run(project, "validate");
    assert.equal(browserValid.status, 0, `${browserValid.stdout}\n${browserValid.stderr}`);
    browserPlan.output.file = "dist/project-video/browser-video-fixture.mp4";
    await writeFile(planPath, `${JSON.stringify(browserPlan, null, 2)}\n`, "utf8");
    const browserMp4 = run(project, "validate");
    assert.notEqual(browserMp4.status, 0);
    assert.match(`${browserMp4.stdout}${browserMp4.stderr}`, /must match dist\/project-video\/<name>\.html/);
    await writeFile(planPath, `${JSON.stringify(plan, null, 2)}\n`, "utf8");

    plan.unexpected = true;
    await writeFile(planPath, `${JSON.stringify(plan, null, 2)}\n`, "utf8");
    const unknown = run(project, "validate");
    assert.notEqual(unknown.status, 0);
    assert.match(`${unknown.stdout}${unknown.stderr}`, /unsupported fields: unexpected/);

    delete plan.unexpected;
    const originalNarration = plan.scenes[0].narration;
    plan.scenes[0].narration = `${Array.from({ length: 37 }, () => "word").join(" ")}.`;
    await writeFile(planPath, `${JSON.stringify(plan, null, 2)}\n`, "utf8");
    const denseNarration = run(project, "validate");
    assert.notEqual(denseNarration.status, 0);
    assert.match(`${denseNarration.stdout}${denseNarration.stderr}`, /must not exceed 36 words/);

    plan.scenes[0].narration = originalNarration;
    plan.scenes[0].evidence = ["../outside.md"];
    await writeFile(planPath, `${JSON.stringify(plan, null, 2)}\n`, "utf8");
    const invalid = run(project, "validate");
    assert.notEqual(invalid.status, 0);
    assert.match(`${invalid.stdout}${invalid.stderr}`, /unsafe path/);
  } finally {
    await removeProject(project);
  }
});

test("project-video validates an executive production path assembled locally with FFmpeg", async () => {
  const project = await createProject("executive");
  try {
    await mkdir(path.join(project, "src"), { recursive: true });
    await mkdir(path.join(project, "reports", "project-video"), { recursive: true });
    await writeFile(path.join(project, "README.md"), "# Executive demo fixture\n", "utf8");
    await writeFile(path.join(project, "src", "app.mjs"), "export const ready = true;\n", "utf8");
    await seedAzureDiscovery(project, { openAIAvailable: true, openAIModelName: "gpt-5", openAIModelVersion: "2026-08" });
    await writeFile(path.join(project, "reports", "avatar-preflight.json"), "{\"status\":\"ready\"}\n", "utf8");
    await writeFile(path.join(project, "reports", "project-video", "claims-ledger.json"), "{\"claims\":[]}\n", "utf8");
    await writeFile(path.join(project, "reports", "project-video", "script.md"), "# Approved evidence-grounded script\n", "utf8");
    const planPath = path.join(project, "reports", "project-video", "project-video-plan.json");
    const plan = executivePlan("executive-fixture");
    await writeFile(planPath, `${JSON.stringify(plan, null, 2)}\n`, "utf8");

    const valid = run(project, "validate");
    assert.equal(valid.status, 0, `${valid.stdout}\n${valid.stderr}`);
    const preflight = run(project, "production-preflight");
    assert.equal(preflight.status, 0, `${preflight.stdout}\n${preflight.stderr}`);
    const readiness = JSON.parse(preflight.stdout);
    assert.equal(readiness.status, "ready");
    assert.equal(readiness.externalWorkAuthorized, false);
    assert.equal(readiness.verifiedCapabilities[0].deployment_id, "executive-script-deployment");
    assert.equal(readiness.verifiedCapabilities[0].model_id, "gpt-5-2026-08");

    assert.equal(readiness.selectedProviders.assembly, "ffmpeg");
    assert.equal(readiness.selectedProviders.delivery, "portable-mp4");

    plan.production.selection.avatar_profile.generation_status = "generated";
    await writeFile(planPath, `${JSON.stringify(plan, null, 2)}\n`, "utf8");
    const incompleteAvatar = run(project, "validate");
    assert.notEqual(incompleteAvatar.status, 0);
    assert.match(`${incompleteAvatar.stdout}${incompleteAvatar.stderr}`, /one generated asset to each selected segment/);
    plan.production.selection.avatar_profile.generation_status = "planned";

    plan.production.capabilities[0].deployment_id = null;
    await writeFile(planPath, `${JSON.stringify(plan, null, 2)}\n`, "utf8");
    const missingDeployment = run(project, "production-preflight");
    assert.notEqual(missingDeployment.status, 0);
    assert.match(`${missingDeployment.stdout}${missingDeployment.stderr}`, /must record deployment_id/);
    await assertOffline(project);
  } finally {
    await removeProject(project);
  }
});

test("project-video generates an explicitly selected browser preview without Azure discovery", async () => {
  const project = await createProject("browser");
  try {
    await mkdir(path.join(project, "src"), { recursive: true });
    await mkdir(path.join(project, "reports", "project-video"), { recursive: true });
    await writeFile(path.join(project, "README.md"), "# Browser preview fixture\n", "utf8");
    await writeFile(path.join(project, "src", "app.mjs"), "export const ready = true;\n", "utf8");
    const plan = validPlan("browser-preview-fixture", browserPreviewVoice);
    plan.output.file = "dist/project-video/browser-preview-fixture.html";
    plan.scenes[0].narration = "This verified browser preview safely displays script-like text such as </script> without executing it.";
    const planPath = path.join(project, "reports", "project-video", "project-video-plan.json");
    await writeFile(planPath, `${JSON.stringify(plan, null, 2)}\n`, "utf8");

    const discovery = run(project, "discovery-status");
    assert.equal(discovery.status, 0, `${discovery.stdout}\n${discovery.stderr}`);
    const discoveryResult = JSON.parse(discovery.stdout);
    assert.equal(discoveryResult.status, "missing");
    assert.equal(discoveryResult.nextAction, "refresh-on-selected-azure-work");
    assert.equal(discoveryResult.alternativeAction, "generate-browser-preview");

    const generated = run(project, "browser-preview");
    assert.equal(generated.status, 0, `${generated.stdout}\n${generated.stderr}`);
    const output = path.join(project, "dist", "project-video", "browser-preview-fixture.html");
    const manifestFile = path.join(project, "reports", "project-video", "browser-preview-manifest.json");
    assert.ok(existsSync(output));
    assert.ok(existsSync(manifestFile));
    const html = await readFile(output, "utf8");
    assert.match(html, /SpeechSynthesisUtterance/);
    assert.match(html, /voice\.localService&&voice\.lang==="en-US"/);
    assert.match(html, /utterance\.onend=function\(\)/);
    assert.match(html, /Browser default English voice/);
    assert.doesNotMatch(html, /<\/script> without executing it/);
    const manifest = JSON.parse(await readFile(manifestFile, "utf8"));
    assert.equal(manifest.provider, "browser-preview");
    assert.equal(manifest.capabilities.renderedAudio, false);
    assert.equal(manifest.capabilities.portableMedia, false);
    assert.equal(manifest.sha256, sha256(html));
    assert.equal(manifest.scenes.length, 6);

    const narration = run(project, "narrate");
    assert.notEqual(narration.status, 0);
    assert.match(`${narration.stdout}${narration.stderr}`, /run browser-preview instead of narrate/);
    const duplicate = run(project, "browser-preview");
    assert.notEqual(duplicate.status, 0);
    assert.match(`${duplicate.stdout}${duplicate.stderr}`, /already exists/);
    await assertOffline(project);
  } finally {
    await removeProject(project);
  }
});

test("project-video rebuilds and binds current Project Understanding before planning pages", async () => {
  const project = await createProject("understanding");
  try {
    await mkdir(path.join(project, "src"), { recursive: true });
    await mkdir(path.join(project, ".github", "skills", "project-understanding", "scripts"), { recursive: true });
    await mkdir(path.join(project, ".github", "skills", "documentation-builder", "scripts"), { recursive: true });
    await mkdir(path.join(project, "schemas"), { recursive: true });
    await writeFile(path.join(project, "README.md"), "# Current Repository Subject\n\nBuilds a verified current-project presentation from repository evidence.\n", "utf8");
    await writeFile(path.join(project, "package.json"), "{\"name\":\"current-repository-subject\",\"scripts\":{\"start\":\"node src/app.mjs\",\"check\":\"node --check src/app.mjs\"}}\n", "utf8");
    await writeFile(path.join(project, "src", "app.mjs"), "export const projectFeature = 'current-subject';\n", "utf8");
    await copyFile(path.join(root, ".github", "skills", "project-understanding", "scripts", "project-understanding.mjs"), path.join(project, ".github", "skills", "project-understanding", "scripts", "project-understanding.mjs"));
    await copyFile(path.join(root, ".github", "skills", "documentation-builder", "scripts", "documentation-builder.mjs"), path.join(project, ".github", "skills", "documentation-builder", "scripts", "documentation-builder.mjs"));
    await copyFile(path.join(root, "schemas", "project-understanding.schema.json"), path.join(project, "schemas", "project-understanding.schema.json"));
    await copyFile(path.join(root, "schemas", "project-guide.schema.json"), path.join(project, "schemas", "project-guide.schema.json"));
    await copyFile(path.join(root, "schemas", "project-video-plan.schema.json"), path.join(project, "schemas", "project-video-plan.schema.json"));

    const generated = run(project, "plan-from-understanding", ["--name", "current-project"]);
    assert.equal(generated.status, 0, `${generated.stdout}\n${generated.stderr}`);
    const understandingFile = path.join(project, "reports", "project-understanding.json");
    const understandingMarkdown = path.join(project, "reports", "project-understanding.md");
    const planFile = path.join(project, "reports", "project-video", "project-video-plan.json");
    assert.ok(existsSync(path.join(project, "docs", "PROJECT-GUIDE.md")));
    assert.ok(existsSync(path.join(project, "reports", "project-guide.json")));
    const plan = JSON.parse(await readFile(planFile, "utf8"));
    assert.equal(plan.schemaVersion, "1.2.0");
    assert.equal(plan.project.name, "current-repository-subject");
    assert.equal(plan.scenes.length, 8);
    assert.deepEqual(plan.scenes.map((scene) => scene.title), ["Project purpose", "Architecture", "Technology", "Key features", "Setup and use", "Skills and prompts", "Workflows", "Validation and limits"]);
    assert.equal(plan.understanding.jsonSha256, sha256(await readFile(understandingFile)));
    assert.equal(plan.understanding.markdownSha256, sha256(await readFile(understandingMarkdown)));
    assert.equal(plan.production.narration_provider, "browser-preview");
    assert.equal(plan.production.delivery_kind, "interactive-html");

    const valid = run(project, "validate");
    assert.equal(valid.status, 0, `${valid.stdout}\n${valid.stderr}`);
    const preview = run(project, "browser-preview");
    assert.equal(preview.status, 0, `${preview.stdout}\n${preview.stderr}`);
    const html = await readFile(path.join(project, "dist", "project-video", "current-project.html"), "utf8");
    for (const scene of plan.scenes) assert.match(html, new RegExp(scene.title));

    const understanding = JSON.parse(await readFile(understandingFile, "utf8"));
    understanding.project.purpose = "Changed after planning";
    await writeFile(understandingFile, `${JSON.stringify(understanding, null, 2)}\n`, "utf8");
    const stale = run(project, "validate");
    assert.notEqual(stale.status, 0);
    assert.match(`${stale.stdout}${stale.stderr}`, /Project Understanding JSON changed/);
  } finally {
    await removeProject(project);
  }
});

test("project-video fails before external work without credentials or approval", async () => {
  const project = await createProject("gates");
  try {
    await mkdir(path.join(project, "src"), { recursive: true });
    await mkdir(path.join(project, "reports", "project-video"), { recursive: true });
    await writeFile(path.join(project, "README.md"), "# Gated fixture\n", "utf8");
    await writeFile(path.join(project, "src", "app.mjs"), "export const ready = true;\n", "utf8");
    await writeFile(path.join(project, "reports", "project-video", "project-video-plan.json"), `${JSON.stringify(validPlan("gated-fixture"), null, 2)}\n`, "utf8");

    const missingDiscovery = run(project, "azure-preflight");
    assert.notEqual(missingDiscovery.status, 0);
    assert.match(`${missingDiscovery.stdout}${missingDiscovery.stderr}`, /initialize.*azure-discovery|azure-discovery.*initialize/i);
    const report = await seedAzureDiscovery(project);
    await writeFile(path.join(project, "reports", "azure-discovery.json"), JSON.stringify({ ...report, resourceName: "must-not-be-persisted" }));
    const incompatibleDiscovery = run(project, "discovery-status");
    assert.equal(incompatibleDiscovery.status, 0);
    assert.equal(JSON.parse(incompatibleDiscovery.stdout).status, "unusable");
    assert.match(JSON.parse(incompatibleDiscovery.stdout).reason, /unsupported field/);
    await seedAzureDiscovery(project, { discoveredAt: new Date(Date.now() - 31 * 86_400_000).toISOString() });
    const staleDiscovery = run(project, "discovery-status");
    assert.equal(staleDiscovery.status, 0);
    assert.equal(JSON.parse(staleDiscovery.stdout).status, "unusable");
    assert.match(JSON.parse(staleDiscovery.stdout).reason, /expired/);
    await seedAzureDiscovery(project, { speech: { existingResourceQuerySucceeded: false, existingResourceAvailable: false, existingResourceCount: 0, existingResourceRegions: [], existingResourceKinds: [] } });
    const uncertainDiscovery = run(project, "azure-preflight");
    assert.notEqual(uncertainDiscovery.status, 0);
    assert.match(`${uncertainDiscovery.stdout}${uncertainDiscovery.stderr}`, /resource discovery is uncertain/);
    await seedAzureDiscovery(project, { speech: { existingResourceAvailable: false, existingResourceCount: 0, existingResourceRegions: [], existingResourceKinds: [] } });
    const unavailableDiscovery = run(project, "azure-preflight");
    assert.notEqual(unavailableDiscovery.status, 0);
    assert.match(`${unavailableDiscovery.stdout}${unavailableDiscovery.stderr}`, /No existing Azure Speech-capable resource was discovered/);
    await seedAzureDiscovery(project);
    const readyDiscovery = run(project, "discovery-status");
    assert.equal(readyDiscovery.status, 0, `${readyDiscovery.stdout}\n${readyDiscovery.stderr}`);
    const readyDiscoveryResult = JSON.parse(readyDiscovery.stdout);
    assert.equal(readyDiscoveryResult.status, "ready");
    assert.equal(readyDiscoveryResult.nextAction, "continue-azure-preflight");
    const mismatchedRegion = run(project, "azure-preflight", [], { AZURE_SPEECH_REGION: "westus" });
    assert.notEqual(mismatchedRegion.status, 0);
    assert.match(`${mismatchedRegion.stdout}${mismatchedRegion.stderr}`, /is not an existing discovered Speech resource region/);
    const preflight = run(project, "azure-preflight");
    assert.equal(preflight.status, 0, `${preflight.stdout}\n${preflight.stderr}`);
    assert.match(preflight.stdout, /"status": "ready"/);
    assert.match(preflight.stdout, /"videoRenderer": "local-ffmpeg"/);
    assert.match(preflight.stderr, /never paste or persist it/);

    await seedAzureDiscovery(project, {
      cloud: "AzureUSGovernment",
      location: "usgovarizona",
      cognitiveRegions: ["usgovarizona"],
      speech: {
        serviceRegions: ["usgovarizona"],
        existingResourceRegions: ["usgovarizona"],
        existingResourceKinds: ["AIServices"]
      }
    });
    const governmentDiscovery = run(project, "discovery-status");
    assert.equal(governmentDiscovery.status, 0, `${governmentDiscovery.stdout}\n${governmentDiscovery.stderr}`);
    const governmentDiscoveryResult = JSON.parse(governmentDiscovery.stdout);
    assert.equal(governmentDiscoveryResult.status, "ready");
    assert.equal(governmentDiscoveryResult.cloud, "AzureUSGovernment");
    assert.deepEqual(governmentDiscoveryResult.resourceKinds, ["AIServices"]);
    assert.deepEqual(governmentDiscoveryResult.regions, ["usgovarizona"]);
    const governmentPreflight = run(project, "azure-preflight");
    assert.equal(governmentPreflight.status, 0, `${governmentPreflight.stdout}\n${governmentPreflight.stderr}`);
    assert.match(governmentPreflight.stdout, /"cloud": "AzureUSGovernment"/);
    assert.match(governmentPreflight.stdout, /"existingResourceKinds": \[\s*"AIServices"/);
    assert.match(governmentPreflight.stdout, /"optionalEnvironment": \[\s*"AZURE_SPEECH_CLOUD"/);
    const explicitCloudMismatch = run(project, "azure-preflight", [], { AZURE_SPEECH_CLOUD: "AzureCloud" });
    assert.notEqual(explicitCloudMismatch.status, 0);
    assert.match(`${explicitCloudMismatch.stdout}${explicitCloudMismatch.stderr}`, /does not match AZURE_SPEECH_CLOUD AzureCloud/);

    const narration = run(project, "narrate", ["--approve-external"]);
    assert.notEqual(narration.status, 0);
    assert.match(`${narration.stdout}${narration.stderr}`, /Explicit voice selection is missing/);
    assert.ok(!existsSync(path.join(project, "reports", "project-video", "audio")));

    const audition = run(project, "audition", ["--approve-external"]);
    assert.notEqual(audition.status, 0);
    assert.match(`${audition.stdout}${audition.stderr}`, /Set AZURE_SPEECH_KEY/);
    assert.ok(!existsSync(path.join(project, "reports", "project-video", "voice-samples")));

    const selection = run(project, "select-voice", ["--profile", "ava-hd-warm", "--approve-selection"]);
    assert.notEqual(selection.status, 0);
    assert.match(`${selection.stdout}${selection.stderr}`, /Voice audition evidence is missing/);

    const renderer = run(project, "install-renderer");
    assert.notEqual(renderer.status, 0);
    assert.match(`${renderer.stdout}${renderer.stderr}`, /requires --accept-download/);
    assert.ok(!existsSync(path.join(project, ".skills-orchestrator", "tools", "project-video")));

    const localVoice = run(project, "install-local-voice");
    assert.notEqual(localVoice.status, 0);
    assert.match(`${localVoice.stdout}${localVoice.stderr}`, /requires --accept-download/);
    assert.ok(!existsSync(path.join(project, ".skills-orchestrator", "tools", "project-video", "local-voice")));
    const localLicense = run(project, "install-local-voice", ["--accept-download"]);
    assert.notEqual(localLicense.status, 0);
    assert.match(`${localLicense.stdout}${localLicense.stderr}`, /requires --accept-gpl/);
    const localProvenance = run(project, "install-local-voice", ["--accept-download", "--accept-gpl"]);
    assert.notEqual(localProvenance.status, 0);
    assert.match(`${localProvenance.stdout}${localProvenance.stderr}`, /requires --accept-model-provenance/);
    const unavailablePython = run(project, "install-local-voice", [
      "--accept-download", "--accept-gpl", "--accept-model-provenance", "--python", path.join(project, "missing-python.exe")
    ]);
    assert.notEqual(unavailablePython.status, 0);
    assert.match(`${unavailablePython.stdout}${unavailablePython.stderr}`, /requires an approved Python/);
    assert.ok(!existsSync(path.join(project, ".skills-orchestrator", "tools", "project-video", "local-voice")));

    const planPath = path.join(project, "reports", "project-video", "project-video-plan.json");
    await writeFile(planPath, `${JSON.stringify(validPlan("local-gated-fixture", localPiperVoice), null, 2)}\n`, "utf8");
    const unapprovedLocalNarration = run(project, "narrate");
    assert.notEqual(unapprovedLocalNarration.status, 0);
    assert.match(`${unapprovedLocalNarration.stdout}${unapprovedLocalNarration.stderr}`, /requires --approve-local/);
    const missingLocalVoice = run(project, "narrate", ["--approve-local"]);
    assert.notEqual(missingLocalVoice.status, 0);
    assert.match(`${missingLocalVoice.stdout}${missingLocalVoice.stderr}`, /local Piper voice is not installed/);
    assert.ok(!existsSync(path.join(project, "reports", "project-video", "audio")));
    await writeFile(planPath, `${JSON.stringify(validPlan("gated-fixture"), null, 2)}\n`, "utf8");

    const render = run(project, "render", ["--approve-render"]);
    assert.notEqual(render.status, 0);
    assert.match(`${render.stdout}${render.stderr}`, /narration-manifest\.json is missing/);
  } finally {
    await removeProject(project);
  }
});

test("project-video refuses to relabel existing audio for changed narration", async () => {
  const project = await createProject("stale-audio");
  try {
    await mkdir(path.join(project, "src"), { recursive: true });
    await mkdir(path.join(project, "reports", "project-video", "audio"), { recursive: true });
    await writeFile(path.join(project, "README.md"), "# Stale audio fixture\n", "utf8");
    await writeFile(path.join(project, "src", "app.mjs"), "export const ready = true;\n", "utf8");
    await writeFile(path.join(project, "reports", "project-video", "project-video-plan.json"), `${JSON.stringify(validPlan("stale-audio-fixture"), null, 2)}\n`, "utf8");
    await seedAzureDiscovery(project);
    await seedApprovedVoiceSelection(project);
    await writeFile(path.join(project, "reports", "project-video", "audio", "scene-01.mp3"), Buffer.alloc(2048, 1));

    const result = run(project, "narrate", ["--approve-external"], { AZURE_SPEECH_KEY: "test-key-not-sent", AZURE_SPEECH_REGION: "eastus" });
    assert.notEqual(result.status, 0);
    assert.match(`${result.stdout}${result.stderr}`, /stale or unverified/);
  } finally {
    await removeProject(project);
  }
});

test("project-video refuses to render Azure narration without current discovery evidence", async () => {
  const project = await createProject("discovery-render");
  try {
    await mkdir(path.join(project, "src"), { recursive: true });
    await mkdir(path.join(project, "reports", "project-video", "audio"), { recursive: true });
    await writeFile(path.join(project, "README.md"), "# Discovery render fixture\n", "utf8");
    await writeFile(path.join(project, "src", "app.mjs"), "export const ready = true;\n", "utf8");
    const planPath = path.join(project, "reports", "project-video", "project-video-plan.json");
    await writeFile(planPath, `${JSON.stringify(validPlan("discovery-render-fixture"), null, 2)}\n`, "utf8");
    await seedAzureDiscovery(project);
    await seedApprovedVoiceSelection(project);
    const planText = await readFile(planPath, "utf8");
    const plan = JSON.parse(planText);
    const selectionFile = path.join(project, "reports", "project-video", "voice-selection.json");
    const scenes = [];
    for (const [index, scene] of plan.scenes.entries()) {
      const audio = Buffer.alloc(2048, index + 1);
      const relative = `reports/project-video/audio/${scene.id}.mp3`;
      await writeFile(path.join(project, ...relative.split("/")), audio);
      scenes.push({
        id: scene.id,
        file: relative,
        narrationSha256: sha256(scene.narration),
        audioSha256: sha256(audio)
      });
    }
    await writeFile(path.join(project, "reports", "project-video", "audio", "narration-manifest.json"), `${JSON.stringify({
      schemaVersion: "1.0.0",
      generatedAt: new Date().toISOString(),
      provider: "azure-neural",
      planSha256: sha256(planText),
      voice: plan.voice.name,
      voiceSettings: plan.voice,
      voiceSettingsSha256: sha256(JSON.stringify(plan.voice)),
      voiceSelectionProfile: "ava-hd-warm",
      voiceSelectionSha256: sha256(await readFile(selectionFile)),
      cloud: "AzureCloud",
      region: "eastus",
      scenes
    }, null, 2)}\n`, "utf8");

    const render = run(project, "render", ["--approve-render"]);
    assert.notEqual(render.status, 0);
    assert.match(`${render.stdout}${render.stderr}`, /does not match the current discovery evidence/);
    assert.ok(!existsSync(path.join(project, "dist", "project-video", "discovery-render-fixture.mp4")));
  } finally {
    await removeProject(project);
  }
});