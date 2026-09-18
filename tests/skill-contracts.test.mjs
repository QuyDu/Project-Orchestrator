import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { readFile, readdir, rm } from "node:fs/promises";
import { existsSync } from "node:fs";
import path from "node:path";
import test from "node:test";
import { inflateRawSync } from "node:zlib";

const root = path.resolve(import.meta.dirname, "..");
const skillsRoot = path.join(root, ".github", "skills");

function readZipEntry(archive, expectedName) {
  let endOfCentralDirectory = archive.length - 22;
  while (endOfCentralDirectory >= 0 && archive.readUInt32LE(endOfCentralDirectory) !== 0x06054b50) {
    endOfCentralDirectory -= 1;
  }
  assert.ok(endOfCentralDirectory >= 0, "ZIP end-of-central-directory record must exist.");

  const entryCount = archive.readUInt16LE(endOfCentralDirectory + 10);
  let centralDirectoryOffset = archive.readUInt32LE(endOfCentralDirectory + 16);
  for (let entryIndex = 0; entryIndex < entryCount; entryIndex += 1) {
    assert.equal(archive.readUInt32LE(centralDirectoryOffset), 0x02014b50, "ZIP central-directory entry must be valid.");
    const compressionMethod = archive.readUInt16LE(centralDirectoryOffset + 10);
    const compressedSize = archive.readUInt32LE(centralDirectoryOffset + 20);
    const fileNameLength = archive.readUInt16LE(centralDirectoryOffset + 28);
    const extraLength = archive.readUInt16LE(centralDirectoryOffset + 30);
    const commentLength = archive.readUInt16LE(centralDirectoryOffset + 32);
    const localHeaderOffset = archive.readUInt32LE(centralDirectoryOffset + 42);
    const fileName = archive.subarray(centralDirectoryOffset + 46, centralDirectoryOffset + 46 + fileNameLength).toString("utf8");
    if (fileName === expectedName) {
      assert.equal(archive.readUInt32LE(localHeaderOffset), 0x04034b50, "ZIP local entry must be valid.");
      const localFileNameLength = archive.readUInt16LE(localHeaderOffset + 26);
      const localExtraLength = archive.readUInt16LE(localHeaderOffset + 28);
      const dataOffset = localHeaderOffset + 30 + localFileNameLength + localExtraLength;
      const compressed = archive.subarray(dataOffset, dataOffset + compressedSize);
      if (compressionMethod === 0) return compressed;
      if (compressionMethod === 8) return inflateRawSync(compressed);
      assert.fail(`Unsupported ZIP compression method ${compressionMethod}.`);
    }
    centralDirectoryOffset += 46 + fileNameLength + extraLength + commentLength;
  }
  assert.fail(`ZIP entry ${expectedName} must exist.`);
}

const expectedSkillIds = [
  "agent-builder",
  "architecture-review",
  "artifact-upgrade",
  "audit-azure-environment",
  "audit-code",
  "audit-plan-remediation",
  "audit-remediation",
  "audit-review-findings",
  "azure-cleanup",
  "azure-discovery",
  "change-review",
  "ci-failure-triage",
  "clarify-the-ask",
  "dependency-maintenance",
  "deployment-review",
  "development-environment-readiness",
  "documentation-builder",
  "environment-update",
  "framework-health-check",
  "linkedin-post",
  "multi-agent-coordinator",
  "policy-engine",
  "prepare-commit",
  "project-handoff",
  "project-knowledge-capture",
  "project-memory",
  "project-setup",
  "project-skills-orchestrator",
  "project-status",
  "project-understanding",
  "project-video",
  "project-visual-storytelling",
  "regression-test-development",
  "security-review",
  "skill-create",
  "skill-dependency-manager",
  "skill-inventory",
  "skill-registry",
  "skill-update",
  "systematic-debugging",
  "user-personalization",
  "workflow-planner",
  "workflow-recovery",
  "workflow-scheduler",
  "workflow-simulator",
  "workflow-state-manager",
  "workflow-telemetry"
];

function frontmatter(source) {
  const block = source.match(/^---\r?\n([\s\S]*?)\r?\n---/);
  assert.ok(block, "skill must have frontmatter");
  return Object.fromEntries(block[1].split(/\r?\n/).map((line) => {
    const separator = line.indexOf(":");
    return [line.slice(0, separator).trim(), line.slice(separator + 1).trim()];
  }));
}

function sectionItems(source, heading) {
  const start = source.indexOf(`## ${heading}`);
  assert.notEqual(start, -1, `missing ${heading} section`);
  const remainder = source.slice(start + heading.length + 3);
  const next = remainder.search(/^## /m);
  const section = next === -1 ? remainder : remainder.slice(0, next);
  return [...section.matchAll(/^\s*-\s+`?([^`\r\n]+?)`?\s*$/gm)].map((match) => match[1].trim());
}

function dependencyItems(source) {
  const section = source.match(/^## Composition and Dependencies\s*$([\s\S]*?)(?=^## |(?![\s\S]))/m)?.[1] ?? "";
  const prerequisites = section.match(/^### Prerequisite Dependencies\s*$([\s\S]*?)(?=^### |(?![\s\S]))/m)?.[1];
  const content = prerequisites ?? section;
  return [...content.matchAll(/^\s*-\s+`?([^`\r\n]+?)`?\s*$/gm)].map((match) => match[1].trim()).filter((item) => item !== "None");
}

async function loadSkills() {
  const directories = (await readdir(skillsRoot, { withFileTypes: true })).filter((entry) => entry.isDirectory());
  return Promise.all(directories.map(async (entry) => {
    const source = await readFile(path.join(skillsRoot, entry.name, "SKILL.md"), "utf8");
    return { directory: entry.name, source, metadata: frontmatter(source) };
  }));
}

async function loadProfiles() {
  const source = await readFile(path.join(root, "config", "profiles.yaml"), "utf8");
  // The block terminator must be the next profile header or end of input; a bare `$` ends every block at its first newline.
  const blocks = [...source.matchAll(/^ {2}([a-z]+):\r?\n([\s\S]*?)(?=^ {2}[a-z]+:|(?![\s\S]))/gm)];
  assert.ok(blocks.length, "profiles.yaml declares no profiles");
  return new Map(blocks.map(([, name, block]) => [name, {
    parent: block.match(/^ {4}extends: ([a-z]+)\r?$/m)?.[1],
    required: [...block.matchAll(/^ {6}- ([a-z0-9-]+)\r?$/gm)].map((match) => match[1])
  }]));
}

test("all skill IDs and metadata are uniform", async () => {
  const skills = await loadSkills();
  const lifecycles = new Set(["draft", "tested", "validated", "production", "deprecated", "retired"]);
  const confidenceLevels = new Set(["low", "medium", "high"]);
  assert.equal(skills.length, expectedSkillIds.length);
  assert.deepEqual(skills.map((skill) => skill.metadata.name).sort(), expectedSkillIds);
  for (const skill of skills) {
    assert.match(skill.metadata.name, /^[a-z][a-z0-9]*(?:-[a-z0-9]+)*$/);
    assert.equal(skill.metadata.name, skill.directory);
    assert.ok(lifecycles.has(skill.metadata.lifecycle), `${skill.metadata.name} has an invalid lifecycle`);
    assert.ok(confidenceLevels.has(skill.metadata.confidence), `${skill.metadata.name} has an invalid confidence`);
    assert.doesNotMatch(skill.source, /Perform the bounded capability|Current user intent and constraints|Validate required dependencies and input schemas/);
  }
  const promoted = skills.filter((skill) => skill.metadata.lifecycle !== "draft");
  assert.ok(promoted.length > 0, "at least one skill must be promoted beyond draft");
  assert.ok(promoted.every((skill) => skill.metadata.confidence !== "low"), "a promoted skill must not remain low confidence");
});

test("development environment readiness has a strict evidence contract", async () => {
  const skills = new Map((await loadSkills()).map((skill) => [skill.metadata.name, skill]));
  const readiness = skills.get("development-environment-readiness");
  assert.ok(sectionItems(readiness.source, "Outputs").includes("reports/development-environment-readiness.json"));
  assert.match(readiness.metadata.description, /onboarding|preparing a new project/);
  assert.match(readiness.source, /must be entered by the user/);
  assert.match(readiness.source, /repository, user, machine, and remote/);

  const schema = JSON.parse(await readFile(path.join(root, "schemas", "development-environment-readiness.schema.json"), "utf8"));
  assert.equal(schema.$schema, "https://json-schema.org/draft/2020-12/schema");
  assert.equal(schema.additionalProperties, false);
  assert.equal(schema.properties.schemaVersion.const, "1.0.0");
  assert.deepEqual(schema.properties.status.enum, ["ready", "degraded", "blocked"]);
  assert.equal(schema.properties.scope.additionalProperties, false);
  assert.equal(schema.properties.requirements.items.additionalProperties, false);
  assert.equal(schema.properties.plannedActions.items.additionalProperties, false);
  assert.deepEqual(schema.properties.plannedActions.items.properties.scope.enum, ["repository", "user", "machine", "remote"]);
  assert.equal(schema.properties.plannedActions.items.allOf[0].then.properties.requiresApproval.const, true);
});

test("project video is a portable narrated MP4 capability", async () => {
  const skills = new Map((await loadSkills()).map((skill) => [skill.metadata.name, skill]));
  const projectVideo = skills.get("project-video");
  const projectUnderstanding = skills.get("project-understanding");
  assert.match(projectUnderstanding.metadata.description, /complete evidence-grounded scan/);
  assert.match(projectUnderstanding.source, /complete repository rescan/);
  assert.match(projectUnderstanding.source, /atomically replace both understanding outputs/);
  assert.ok(sectionItems(projectUnderstanding.source, "Outputs").includes("reports/project-understanding.json"));
  assert.ok(sectionItems(projectUnderstanding.source, "Outputs").includes("reports/project-understanding.md"));
  const understandingHelperPath = path.join(skillsRoot, "project-understanding", "scripts", "project-understanding.mjs");
  assert.ok(existsSync(understandingHelperPath), "project-understanding helper must ship inside its skill package");
  const understandingHelper = await readFile(understandingHelperPath, "utf8");
  assert.match(understandingHelper, /mode: "full-rebuild"/);
  assert.match(understandingHelper, /excludedSensitivePatterns/);
  assert.match(understandingHelper, /customizations: \{ skills:.*schemas:/s);
  const understandingSchema = JSON.parse(await readFile(path.join(root, "schemas", "project-understanding.schema.json"), "utf8"));
  assert.equal(understandingSchema.$schema, "https://json-schema.org/draft/2020-12/schema");
  assert.equal(understandingSchema.additionalProperties, false);
  assert.equal(understandingSchema.properties.scan.additionalProperties, false);
  assert.equal(understandingSchema.properties.customizations.additionalProperties, false);
  const guideSchema = JSON.parse(await readFile(path.join(root, "schemas", "project-guide.schema.json"), "utf8"));
  assert.ok(guideSchema.required.includes("guideSha256"));
  assert.equal(guideSchema.properties.guideSha256.$ref, "#/$defs/sha256");
  assert.match(projectVideo.metadata.description, /new or existing project/);
  assert.match(projectVideo.source, /\.github\/skills\/project-video\/scripts\/project-video\.mjs/);
  assert.match(projectVideo.source, /Never change narration providers silently/);
  assert.match(projectVideo.source, /Azure AI Foundry/);
  assert.match(projectVideo.source, /Foundry `AIServices` resource as the Speech provider/);
  assert.match(projectVideo.source, /zero-install-preview/);
  assert.match(projectVideo.source, /executive-demo/);
  assert.match(projectVideo.source, /azure-speech-avatar/);
  assert.match(projectVideo.source, /claims-ledger\.json/);
  assert.match(projectVideo.source, /actual deployment and model identifiers/);
  assert.match(projectVideo.source, /entire production workflow remains executable from VS Code/);
  assert.doesNotMatch(projectVideo.source, /clipchamp/i);
  assert.match(skills.get("project-setup").source, /project-video.*exclusively owns inspection, production-path selection/);
  assert.ok(sectionItems(projectVideo.source, "Composition and Dependencies").includes("clarify-the-ask"));
  assert.ok(sectionItems(projectVideo.source, "Composition and Dependencies").includes("project-understanding"));
  assert.ok(sectionItems(projectVideo.source, "Composition and Dependencies").includes("azure-discovery"));

  const helperPath = path.join(skillsRoot, "project-video", "scripts", "project-video.mjs");
  assert.ok(existsSync(helperPath), "project-video helper must ship inside its skill package");
  const helper = await readFile(helperPath, "utf8");
  assert.match(helper, /const RENDERER_VERSION = "5\.3\.0"/);
  assert.match(helper, /AZURE_SPEECH_KEY/);
  assert.match(helper, /command === "azure-preflight"/);
  assert.match(helper, /command === "discovery-status"/);
  assert.match(helper, /command === "browser-preview"/);
  assert.match(helper, /command === "plan-from-understanding"/);
  assert.match(helper, /PROJECT_UNDERSTANDING_PATH/);
  assert.match(helper, /command === "production-preflight"/);
  assert.match(helper, /externalWorkAuthorized: false/);
  assert.doesNotMatch(helper, /clipchamp/i);
  assert.match(helper, /AZURE_DISCOVERY_MAX_AGE_DAYS = 14/);
  assert.match(helper, /existingResourceQuerySucceeded/);
  assert.match(helper, /existingResourceKinds/);
  assert.match(helper, /function validateAzureDiscovery/);
  assert.match(helper, /Azure discovery speech/);
  assert.match(helper, /previousManifest\?\.azureDiscoverySha256 !== settings\.discoverySha256/);
  assert.match(helper, /--approve-external/);
  assert.match(helper, /--approve-local/);
  assert.match(helper, /--accept-download/);
  assert.match(helper, /--accept-gpl/);
  assert.match(helper, /--accept-model-provenance/);
  assert.match(helper, /--approve-render/);
  assert.match(helper, /--ignore-scripts=false/);
  assert.match(helper, /VOICE_AUDITION_PROFILES/);
  assert.match(helper, /en-US-AvaNeural/);
  assert.match(helper, /en-US-AriaNeural/);
  assert.match(helper, /narration-professional/);
  assert.match(helper, /command === "audition"/);
  assert.match(helper, /command === "select-voice"/);
  assert.match(helper, /command === "install-local-voice"/);
  assert.match(helper, /--approve-selection/);
  assert.match(helper, /audio-48khz-192kbitrate-mono-mp3/);
  assert.match(helper, /voiceAuditionHtml/);
  assert.match(helper, /"index\.html"/);
  assert.match(helper, /command === "ssml"/);
  assert.doesNotMatch(helper, /pitch=/);
  assert.doesNotMatch(helper, /shell\s*:/);
  assert.match(helper, /reports\/project-video\/audio/);
  assert.match(helper, /const PIPER_VERSION = "1\.7\.0"/);
  assert.match(helper, /const ONNX_RUNTIME_VERSION = "1\.23\.2"/);
  assert.match(helper, /protobuf: "6\.33\.5"/);
  assert.match(helper, /numpy: "2\.2\.6"/);
  assert.match(helper, /pyreadline3: "3\.5\.4"/);
  assert.match(helper, /requirementsSha256/);
  assert.match(helper, /en_US-ljspeech-high/);
  assert.match(helper, /5d4f08ba6a2a48c44592eed3ce56bf85e9de3dd4e20df90541ae68a8310c029a/);
  assert.match(helper, /SpeechSynthesisUtterance/);
  assert.match(helper, /defaultEnglishVoice/);
  assert.match(helper, /height:100dvh/);
  assert.doesNotMatch(helper, /SAPI\.SpVoice/);

  const planSchema = JSON.parse(await readFile(path.join(root, "schemas", "project-video-plan.schema.json"), "utf8"));
  assert.equal(planSchema.$schema, "https://json-schema.org/draft/2020-12/schema");
  assert.equal(planSchema.additionalProperties, false);
  assert.deepEqual(planSchema.properties.schemaVersion.enum, ["1.0.0", "1.1.0", "1.2.0"]);
  assert.equal(planSchema.properties.understanding.additionalProperties, false);
  assert.ok(planSchema.properties.understanding.required.includes("repositoryDigestSha256"));
  assert.equal(planSchema.properties.production.additionalProperties, false);
  assert.ok(planSchema.properties.production.required.includes("script_provider"));
  assert.ok(planSchema.properties.production.required.includes("narration_provider"));
  assert.ok(planSchema.properties.production.required.includes("presenter_provider"));
  assert.ok(planSchema.properties.production.required.includes("assembly_provider"));
  assert.ok(planSchema.properties.production.required.includes("delivery_kind"));
  assert.deepEqual(planSchema.properties.production.properties.script_provider.enum, ["agent-grounded", "azure-openai"]);
  assert.deepEqual(planSchema.properties.production.properties.presenter_provider.enum, ["none", "azure-speech-avatar"]);
  assert.deepEqual(planSchema.properties.production.properties.assembly_provider.enum, ["browser-preview", "ffmpeg"]);
  assert.deepEqual(planSchema.properties.production.properties.delivery_kind.enum, ["interactive-html", "portable-mp4"]);
  assert.equal(planSchema.$defs.capability.additionalProperties, false);
  assert.ok(planSchema.$defs.capability.required.includes("evidence"));
  assert.equal(planSchema.$defs.avatarProfile.additionalProperties, false);
  assert.deepEqual(planSchema.$defs.avatarProfile.properties.layout.enum, ["picture-in-picture", "full-frame"]);
  assert.equal(planSchema.properties.scenes.minItems, 6);
  assert.equal(planSchema.properties.scenes.maxItems, 10);
  assert.equal(planSchema.$defs.azureVoice.properties.provider.const, "azure-neural");
  assert.ok(planSchema.$defs.azureVoice.required.includes("styleDegree"));
  assert.ok(planSchema.$defs.azureVoice.required.includes("sentencePauseMs"));
  assert.match(planSchema.$defs.azureVoice.properties.name.pattern, /\?:/);
  assert.equal(planSchema.$defs.localVoice.properties.provider.const, "local-piper");
  assert.equal(planSchema.$defs.localVoice.properties.name.const, "en_US-ljspeech-high");
  assert.ok(planSchema.$defs.localVoice.required.includes("lengthScale"));
  assert.ok(planSchema.$defs.localVoice.required.includes("sentenceSilenceSeconds"));
  assert.equal(planSchema.$defs.browserVoice.properties.provider.const, "browser-preview");
  assert.equal(planSchema.$defs.browserVoice.properties.name.const, "default-English");
  const interactiveOutputRule = planSchema.allOf.find((rule) => rule.then?.properties?.output?.properties?.file?.pattern?.endsWith("\\.html$"));
  assert.equal(interactiveOutputRule.then.properties.output.properties.file.pattern, "^dist/project-video/[a-z0-9-]+\\.html$");

  const manifestSchema = JSON.parse(await readFile(path.join(root, "schemas", "project-video-manifest.schema.json"), "utf8"));
  assert.equal(manifestSchema.additionalProperties, false);
  assert.equal(manifestSchema.properties.status.const, "complete");
  assert.ok(manifestSchema.required.includes("planSha256"));
  assert.ok(manifestSchema.required.includes("presenter"));
  assert.equal(manifestSchema.properties.presenter.oneOf[1].properties.provider.const, "azure-speech-avatar");
  assert.equal(manifestSchema.$defs.azureAudio.properties.provider.const, "azure-neural");
  assert.ok(manifestSchema.$defs.azureAudio.required.includes("styleDegree"));
  assert.ok(manifestSchema.$defs.azureAudio.required.includes("sentencePauseMs"));
  assert.ok(manifestSchema.$defs.azureAudio.required.includes("selectionSha256"));
  assert.ok(manifestSchema.$defs.azureAudio.required.includes("azureDiscoverySha256"));
  assert.ok(manifestSchema.$defs.azureAudio.required.includes("azureDiscoveryAt"));
  assert.equal(manifestSchema.$defs.azureAudio.properties.azureDiscoverySha256.$ref, "#/$defs/sha256");
  assert.equal(manifestSchema.$defs.localAudio.properties.provider.const, "local-piper");
  assert.ok(manifestSchema.$defs.localAudio.required.includes("localVoiceInstallSha256"));
  assert.ok(manifestSchema.$defs.localAudio.required.includes("engine"));
  assert.ok(manifestSchema.$defs.localAudio.required.includes("model"));
  assert.ok(manifestSchema.properties.renderer.properties.source.enum.includes("isolated-pinned"));

  const sampleSchema = JSON.parse(await readFile(path.join(root, "schemas", "project-video-voice-samples.schema.json"), "utf8"));
  assert.equal(sampleSchema.properties.recommended.const, "ava-hd-warm");
  assert.equal(sampleSchema.$defs.voice.properties.provider.const, "azure-neural");
  assert.equal(sampleSchema.properties.samples.minItems, 3);
  assert.equal(sampleSchema.properties.samples.maxItems, 3);
  assert.ok(sampleSchema.required.includes("auditionPageSha256"));
  assert.equal(sampleSchema.properties.azureDiscoverySha256.$ref, "#/$defs/sha256");
  const selectionSchema = JSON.parse(await readFile(path.join(root, "schemas", "project-video-voice-selection.schema.json"), "utf8"));
  assert.equal(selectionSchema.additionalProperties, false);
  assert.ok(selectionSchema.required.includes("auditionManifestSha256"));
  const narrationSchema = JSON.parse(await readFile(path.join(root, "schemas", "project-video-narration-manifest.schema.json"), "utf8"));
  assert.ok(narrationSchema.required.includes("provider"));
  assert.equal(narrationSchema.properties.azureDiscoverySha256.$ref, "#/$defs/sha256");
  assert.ok(narrationSchema.allOf[0].then.required.includes("azureDiscoverySha256"));
  assert.ok(narrationSchema.allOf[0].then.required.includes("azureDiscoveryAt"));
  assert.ok(narrationSchema.allOf[0].then.required.includes("voiceSelectionSha256"));
  assert.ok(narrationSchema.allOf[1].then.required.includes("localVoiceInstallSha256"));
  assert.equal(narrationSchema.$defs.localEngine.properties.version.const, "1.7.0");
  assert.equal(narrationSchema.$defs.localModel.properties.datasetLicense.const, "public-domain");
  const localVoiceSchema = JSON.parse(await readFile(path.join(root, "schemas", "project-video-local-voice-manifest.schema.json"), "utf8"));
  assert.equal(localVoiceSchema.properties.engine.properties.version.const, "1.7.0");
  assert.equal(localVoiceSchema.properties.dependencies.properties.protobuf.const, "6.33.5");
  assert.equal(localVoiceSchema.properties.model.properties.datasetLicense.const, "public-domain");
  assert.equal(localVoiceSchema.properties.wheels.minItems, 11);
  assert.equal(localVoiceSchema.properties.wheels.maxItems, 12);
  const browserPreviewSchema = JSON.parse(await readFile(path.join(root, "schemas", "project-video-browser-preview-manifest.schema.json"), "utf8"));
  assert.equal(browserPreviewSchema.properties.provider.const, "browser-preview");
  assert.equal(browserPreviewSchema.properties.voice.properties.name.type, "string");
  assert.deepEqual(browserPreviewSchema.properties.voice.properties.processing.enum, ["browser-or-operating-system-controlled", "azure-speech-local-playback"]);
  assert.equal(browserPreviewSchema.properties.capabilities.properties.renderedAudio.type, "boolean");
  assert.equal(browserPreviewSchema.properties.capabilities.properties.portableMedia.const, false);
  const discoverySchema = JSON.parse(await readFile(path.join(root, "schemas", "azure-discovery.schema.json"), "utf8"));
  assert.equal(discoverySchema.properties.schemaVersion.const, "1.0.0");
  assert.ok(!discoverySchema.required.includes("imageGeneration"), "legacy 1.0.0 discovery reports remain valid");
  assert.equal(discoverySchema.properties.imageGeneration.additionalProperties, false);
  assert.ok(discoverySchema.properties.imageGeneration.required.includes("catalogQuerySucceeded"));
  assert.ok(discoverySchema.properties.imageGeneration.required.includes("existingDeployments"));
  assert.equal(discoverySchema.properties.imageGeneration.properties.models.items.$ref, "#/$defs/imageModel");
  assert.deepEqual(discoverySchema.properties.imageGeneration.properties.quota.properties.status.enum, ["available", "exhausted", "unknown"]);
  assert.deepEqual(discoverySchema.$defs.imageModel.properties.provider.enum, ["azure-openai", "mai-image"]);
  assert.deepEqual(discoverySchema.$defs.imageModel.properties.maturity.enum, ["generally-available", "limited-access", "preview"]);
  assert.equal(discoverySchema.properties.speech.additionalProperties, false);
  assert.ok(discoverySchema.properties.speech.required.includes("existingResourceQuerySucceeded"));
  assert.ok(discoverySchema.properties.speech.required.includes("existingResourceRegions"));
  assert.equal(discoverySchema.properties.speech.allOf[1].then.properties.existingResourceAvailable.const, false);

  const demoNarration = JSON.parse(await readFile(path.join(root, "Demo", "audio", "narration", "scenes.json"), "utf8"));
  assert.equal(demoNarration.voice.name, "en-US-AvaNeural");
  assert.equal(demoNarration.voice.style, "auto");
  assert.equal(demoNarration.outputFormat, "audio-48khz-192kbitrate-mono-mp3");
  assert.equal(demoNarration.scenes.length, 11);
  const demoGenerator = await readFile(path.join(root, "scripts", "generate-demo-narration.ps1"), "utf8");
  assert.match(demoGenerator, /ValidateSet\("ava-hd-warm", "aria-hd-warm", "aria-professional"\)/);
  assert.match(demoGenerator, /\$selectedProfile\.style/);
  assert.match(demoGenerator, /-ApproveExternal/);
  assert.match(demoGenerator, /AzureUSGovernment = "tts\.speech\.azure\.us"/);
  assert.match(demoGenerator, /AZURE_SPEECH_CLOUD must be AzureCloud or AzureUSGovernment/);
  assert.match(demoGenerator, /between one and 99 ordered scenes/);
  assert.doesNotMatch(demoGenerator, /pitch=/);
  const demoAnimation = await readFile(path.join(root, "Demo", "project-skills-orchestrator-animation.html"), "utf8");
  assert.equal((demoAnimation.match(/<section class="scene/g) ?? []).length, demoNarration.scenes.length);
  for (const scene of demoNarration.scenes) {
    assert.ok(demoAnimation.includes(scene.text), `Demo scene ${scene.id} narration must match its manifest text.`);
  }
  assert.match(demoAnimation, /guided or autonomous-research/);
  assert.match(demoAnimation, /Never silently publish/);
  assert.match(demoAnimation, /P4 BLOCKED/);
  assert.match(demoAnimation, /SpeechSynthesisUtterance/);
  assert.match(demoAnimation, /defaultEnglishVoice/);
  assert.match(demoAnimation, /Local browser voice/);
  assert.match(demoAnimation, /utterance\.onend = \(\) =>/);
  assert.match(demoAnimation, /scheduleAdvance\(token\)/);
  const demoPowerPoint = await readFile(path.join(root, "Demo", "Project-Orchestrator-Demo.pptx"));
  assert.deepEqual([...demoPowerPoint.subarray(0, 4)], [0x50, 0x4b, 0x03, 0x04]);
  const demoPowerPointSlideIds = new Set(
    [...demoPowerPoint.toString("latin1").matchAll(/ppt\/slides\/slide(\d+)\.xml/g)].map((match) => Number(match[1]))
  );
  assert.deepEqual([...demoPowerPointSlideIds].sort((left, right) => left - right), [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11]);
  const videoSlideRelationships = readZipEntry(demoPowerPoint, "ppt/slides/_rels/slide3.xml.rels").toString("utf8");
  assert.match(videoSlideRelationships, /Target="file:\/\/\/C:[\\/]repos[\\/]Skills-Orchestrator[\\/]dist[\\/]project-video[\\/]skills-orchestrator-1-1-0\.html"/);
  assert.match(videoSlideRelationships, /TargetMode="External"/);
  const expectedSlideMinutes = [4, 4, 5, 5, 4, 5, 5, 4, 4, 15, 5];
  for (const [index, minutes] of expectedSlideMinutes.entries()) {
    const slideNumber = index + 1;
    const relationships = readZipEntry(
      demoPowerPoint,
      `ppt/slides/_rels/slide${slideNumber}.xml.rels`
    ).toString("utf8");
    assert.match(relationships, new RegExp(`Target="\\.\\.\\/notesSlides\\/notesSlide${slideNumber}\\.xml"`));
    const notes = readZipEntry(demoPowerPoint, `ppt/notesSlides/notesSlide${slideNumber}.xml`).toString("utf8");
    assert.match(notes, new RegExp(`TIME TARGET: ${minutes} minutes?`));
    assert.match(notes, /WALK THE SLIDE/);
    assert.match(notes, /PROJECT DEPTH/);
    assert.match(notes, /EVIDENCE TO REFERENCE/);
    assert.match(notes, /AUDIENCE PROMPT/);
    assert.match(notes, /TRANSITION/);
  }
  assert.equal(expectedSlideMinutes.reduce((total, minutes) => total + minutes, 0), 60);
  const slideOneNotes = readZipEntry(demoPowerPoint, "ppt/notesSlides/notesSlide1.xml").toString("utf8");
  assert.match(slideOneNotes, /Anthony Marsiglia/);
  assert.match(slideOneNotes, /What if every repository had its own governed way of working\?/);
  const liveDemoNotes = readZipEntry(demoPowerPoint, "ppt/notesSlides/notesSlide10.xml").toString("utf8");
  assert.match(liveDemoNotes, /\/demo-create-project/);
  assert.match(liveDemoNotes, /\/demo-web-app/);
  assert.match(liveDemoNotes, /DEPLOYMENT GATE/);
  const closingNotes = readZipEntry(demoPowerPoint, "ppt/notesSlides/notesSlide11.xml").toString("utf8");
  assert.match(closingNotes, /Q&amp;A/);
  const demoRunbook = await readFile(path.join(root, "Demo", "DEMO-DAY.md"), "utf8");
  assert.match(demoRunbook, /60-minute presenter plan/);
  assert.match(demoRunbook, /reserve 15 minutes for the live project workflow/);
  assert.match(demoRunbook, /WALK THE SLIDE/);
  assert.match(demoRunbook, /PROJECT DEPTH/);
  assert.match(demoRunbook, /EVIDENCE TO REFERENCE/);
  assert.match(demoRunbook, /PowerPoint deck as an archived version 1\.1\.1 product story/);
  assert.match(demoRunbook, /not as evidence of the current source version or current test counts/);
  assert.match(demoRunbook, /Watch: Built by Project Orchestrator/);
  assert.match(demoRunbook, /repository-relative path manually/);
  assert.match(demoRunbook, /\/project-video --proceed/);
  assert.match(demoRunbook, /manifest-verified MP4/);
  assert.match(demoRunbook, /azure-discovery -Gov/);
  assert.match(demoRunbook, /azure-preflight/);
  assert.match(demoRunbook, /local FFmpeg renders the MP4/);
  assert.match(demoRunbook, /Never create an Azure resource for video narration/i);

  assert.match(projectVideo.source, /A\/B\/C selection/);
  assert.match(projectVideo.source, /azure-preflight/);
  assert.match(projectVideo.source, /browser-preview/);
  assert.match(projectVideo.source, /Foundry `AIServices` resource/);
  assert.match(projectVideo.source, /project Key Vault/);
  assert.match(projectVideo.source, /local-piper/);
  const generatedInstructions = await readFile(path.join(root, "templates", "project", ".github", "copilot-instructions.md"), "utf8");
  assert.match(generatedInstructions, /After refreshing Project Understanding, `\/project-video` runs its packaged `discovery-status`/);
  assert.match(generatedInstructions, /`\/project-understanding` performs a complete repository rescan/);
  assert.match(generatedInstructions, /Require approval before same-cloud cross-region processing/);

  const scaffold = JSON.parse(await readFile(path.join(root, "templates", "scaffold-manifest.json"), "utf8"));
  assert.equal(scaffold.templates.find((item) => item.path === ".github/prompts/project-video.prompt.md"), undefined);

  const orchestratorManifestSchema = JSON.parse(await readFile(path.join(root, "schemas", "project-orchestrator-manifest.schema.json"), "utf8"));
  assert.equal(orchestratorManifestSchema.$schema, "https://json-schema.org/draft/2020-12/schema");
  assert.deepEqual(orchestratorManifestSchema.properties.schemaVersion.enum, ["1.0.0", "1.1.0"]);
  assert.ok(orchestratorManifestSchema.allOf[0].then.required.includes("lockPath"));
  assert.equal(orchestratorManifestSchema.properties.minimumUpdaterRuntimeVersion.pattern, "^\\d+\\.\\d+\\.\\d+$");

  const orchestratorLockSchema = JSON.parse(await readFile(path.join(root, "schemas", "project-orchestrator-lock.schema.json"), "utf8"));
  assert.equal(orchestratorLockSchema.$schema, "https://json-schema.org/draft/2020-12/schema");
  assert.equal(orchestratorLockSchema.properties.schemaVersion.const, "1.0.0");
  assert.equal(orchestratorLockSchema.properties.entries.items.additionalProperties, false);
  assert.deepEqual(orchestratorLockSchema.properties.entries.items.properties.ownership.enum, ["framework", "project-owned"]);
  assert.deepEqual(orchestratorLockSchema.properties.entries.items.properties.policy.enum, ["track", "pin", "fork"]);
  assert.ok(orchestratorLockSchema.properties.entries.items.allOf.some((rule) => rule.if?.properties?.policy?.const === "fork"));

  const updatePlanSchema = JSON.parse(await readFile(path.join(root, "schemas", "project-update-plan.schema.json"), "utf8"));
  assert.equal(updatePlanSchema.$schema, "https://json-schema.org/draft/2020-12/schema");
  assert.equal(updatePlanSchema.additionalProperties, false);
  assert.equal(updatePlanSchema.properties.schemaVersion.const, "1.0.0");
  assert.deepEqual(updatePlanSchema.properties.requestedMode.enum, ["all", "additive", "select"]);
  assert.equal(updatePlanSchema.properties.assets.items.additionalProperties, false);
  assert.ok(updatePlanSchema.properties.assets.items.required.includes("baselineAction"));
  assert.ok(updatePlanSchema.properties.assets.items.required.includes("force"));
  assert.ok(updatePlanSchema.properties.assets.items.required.includes("fork"));
  assert.ok(updatePlanSchema.$defs.policyChange.allOf.some((rule) => rule.if?.properties?.policy?.const === "fork"));
  assert.ok(updatePlanSchema.$defs.resolution.allOf.some((rule) => rule.if?.properties?.disposition?.const === "fork"));
  assert.ok(updatePlanSchema.$defs.resolution.properties.disposition.enum.includes("remove"));
  assert.equal(updatePlanSchema.properties.planDigest.pattern, "^[a-f0-9]{64}$");

  const updateSelectionSchema = JSON.parse(await readFile(path.join(root, "schemas", "project-update-selection.schema.json"), "utf8"));
  assert.equal(updateSelectionSchema.$schema, "https://json-schema.org/draft/2020-12/schema");
  assert.equal(updateSelectionSchema.additionalProperties, false);
  assert.equal(updateSelectionSchema.properties.schemaVersion.const, "1.0.0");
  assert.equal(updateSelectionSchema.properties.selectors.additionalProperties, false);
  assert.equal(updateSelectionSchema.properties.expectedPlanDigest.pattern, "^[a-f0-9]{64}$");
  assert.ok(updateSelectionSchema.$defs.target.required.includes("installedSource"));
  assert.ok(updateSelectionSchema.properties.policyChanges.items.allOf.some((rule) => rule.if?.properties?.policy?.const === "fork"));
  assert.ok(updateSelectionSchema.properties.resolutions.items.allOf.some((rule) => rule.if?.properties?.disposition?.const === "fork"));
  assert.ok(updateSelectionSchema.properties.resolutions.items.properties.disposition.enum.includes("remove"));
  assert.match(updateSelectionSchema.$defs.exactPath.pattern, /[*?]/);

  const updateVerificationSchema = JSON.parse(await readFile(path.join(root, "schemas", "update-verification.schema.json"), "utf8"));
  assert.equal(updateVerificationSchema.$schema, "https://json-schema.org/draft/2020-12/schema");
  assert.equal(updateVerificationSchema.additionalProperties, false);
  assert.equal(updateVerificationSchema.properties.schemaVersion.const, "1.0.0");
  assert.equal(updateVerificationSchema.properties.status.const, "passed");
  assert.equal(updateVerificationSchema.properties.lockDigest.$ref, "#/$defs/sha256");
  assert.equal(updateVerificationSchema.$defs.sha256.pattern, "^[a-f0-9]{64}$");
  assert.equal(updateVerificationSchema.properties.checks.additionalProperties, false);
  assert.equal(updateVerificationSchema.properties.checks.properties.manifestLockConsistent.const, true);
  assert.equal(updateVerificationSchema.properties.checks.properties.legacySkillsRemoved.type, "boolean");
  assert.equal(updateVerificationSchema.properties.checks.properties.legacyMigrated.type, "boolean");
});

test("skill authoring has distinct create and update owners", async () => {
  const skills = new Map((await loadSkills()).map((skill) => [skill.metadata.name, skill]));
  const skillCreate = skills.get("skill-create");
  const skillUpdate = skills.get("skill-update");
  const orchestrator = skills.get("project-skills-orchestrator");
  assert.match(skillCreate.metadata.description, /Always use when a user asks.*create.*skill/);
  assert.match(skillCreate.source, /every request to create a new skill, regardless of the user's wording/);
  assert.match(skillCreate.source, /Run `skill-inventory` and compare the request/);
  assert.match(skillCreate.source, /Reuse or extend a matching capability/);
  assert.match(skillCreate.source, /obtain explicit approval before authoring a new skill/);
  assert.match(skillCreate.source, /identify reusable skills/);
  assert.match(skillCreate.source, /project-understanding/);
  assert.match(skillCreate.source, /Analyze both directions of integration/);
  assert.match(skillCreate.source, /<skill-name>-help\.prompt\.md/);
  assert.match(skillCreate.source, /Refresh the authoritative skill inventory, Project Understanding/);
  assert.match(skillUpdate.metadata.description, /Always use when a user asks.*update an existing skill/);
  assert.match(skillUpdate.source, /rank the plausible matches.*offer the candidate IDs as options/is);
  assert.match(skillUpdate.source, /Never mutate the closest match merely because it ranked first/);
  assert.match(skillUpdate.source, /names the exact skill ID and every file to change/);
  assert.match(skillUpdate.source, /require the user to enter `-Proceed` or `--proceed`/);
  assert.match(skillUpdate.source, /A prior general request, an inferred preference, silence, or a different token does not authorize mutation/);
  assert.match(skillUpdate.source, /incoming and outgoing integration/);
  assert.match(skillUpdate.source, /<skill-name>-help\.prompt\.md/);
  assert.match(skillUpdate.source, /Refresh the authoritative skill inventory, Project Understanding/);
  assert.deepEqual(sectionItems(skillUpdate.source, "Composition and Dependencies"), [
    "skill-inventory",
    "skill-dependency-manager",
    "project-understanding",
    "documentation-builder"
  ]);
  assert.match(orchestrator.source, /Route any request to create, add, define, author, build, or make a skill to `skill-create`/);
  assert.match(orchestrator.source, /Route any request to modify, revise, enhance, fix, or update an existing skill to `skill-update`/);
  assert.match(orchestrator.source, /candidate identification and user selection/);
  assert.match(orchestrator.source, /duplicate\/reuse analysis before authoring/);
  const repositoryInstructions = await readFile(path.join(root, ".github", "copilot-instructions.md"), "utf8");
  const repositoryAgentInstructions = await readFile(path.join(root, "AGENTS.md"), "utf8");
  const generatedInstructions = await readFile(path.join(root, "templates", "project", ".github", "copilot-instructions.md"), "utf8");
  for (const instructions of [repositoryInstructions, generatedInstructions]) {
    assert.match(instructions, /automatically use an existing skill/i);
    assert.match(instructions, /Prefer reuse over duplicating/i);
    assert.match(instructions, /obtain explicit approval.*new skill/i);
    assert.match(instructions, /existing skill.*`\/skill-update`/i);
  }
  assert.match(repositoryInstructions, /Launch Pad boundary/);
  assert.match(repositoryAgentInstructions, /Launch Pad boundary/);
  assert.match(repositoryInstructions, /Do not create application code, generated project files, demo implementation files, deployment outputs, or target-project artifacts inside this repository/);
  assert.match(generatedInstructions, /This repository is the target project/);
  assert.match(generatedInstructions, /Build application code, tests, documentation, project-specific prompts, deployment configuration, and validation artifacts here/);
  assert.doesNotMatch(generatedInstructions, /Launch Pad boundary/);
});

test("skill actions have one slash-command owner", async () => {
  const skillNames = new Set((await loadSkills()).map((skill) => skill.metadata.name));
  for (const promptRoot of [path.join(root, ".github", "prompts"), path.join(root, "templates", "project", ".github", "prompts")]) {
    const prompts = (await readdir(promptRoot)).filter((name) => name.endsWith(".prompt.md"));
    const collisions = prompts.map((name) => name.slice(0, -".prompt.md".length)).filter((name) => skillNames.has(name));
    assert.deepEqual(collisions, [], `${promptRoot} duplicates skill-owned slash commands`);
  }
});

test("clarification has a bounded portable evidence contract", async () => {
  const skills = new Map((await loadSkills()).map((skill) => [skill.metadata.name, skill]));
  const clarification = skills.get("clarify-the-ask");
  assert.match(clarification.metadata.description, /ambiguous|conflicting/);
  assert.match(clarification.source, /do not require a specific extension or vendor tool/);
  assert.match(clarification.source, /zero questions is valid/i);
  assert.match(clarification.source, /Never proceed merely because the question limit was reached/);
  assert.ok(sectionItems(clarification.source, "Outputs").includes("reports/clarification-result.json"));

  const planner = skills.get("workflow-planner");
  assert.ok(sectionItems(planner.source, "Composition and Dependencies").includes("clarify-the-ask"));
  assert.match(planner.source, /does not proceed while the clarification result is blocked/);

  const schema = JSON.parse(await readFile(path.join(root, "schemas", "clarification-result.schema.json"), "utf8"));
  assert.equal(schema.$schema, "https://json-schema.org/draft/2020-12/schema");
  assert.equal(schema.additionalProperties, false);
  assert.deepEqual(schema.properties.status.enum, ["ready", "blocked"]);
  assert.equal(schema.properties.rounds.items.additionalProperties, false);
  assert.equal(schema.properties.rounds.items.properties.questions.items.additionalProperties, false);
  assert.equal(schema.allOf[0].then.properties.openQuestions.minItems, 1);
  assert.equal(schema.allOf[0].then.properties.decision.const, "wait-for-answers");
});

test("workflow planning has a strict backward-compatible execution contract", async () => {
  const skills = new Map((await loadSkills()).map((skill) => [skill.metadata.name, skill]));
  const planner = skills.get("workflow-planner");
  assert.match(planner.source, /schema 1\.1/);
  assert.match(planner.source, /onBlocked/);
  assert.match(planner.source, /terminal handoff/);
  assert.match(planner.source, /workflow-planned/);

  const schema = JSON.parse(await readFile(path.join(root, "schemas", "workflow-plan.schema.json"), "utf8"));
  assert.equal(schema.$id, "https://project-skills.dev/schemas/workflow-plan/1.1.0");
  assert.equal(schema.$defs.legacyPlan.properties.schemaVersion.const, "1.0.0");
  assert.equal(schema.$defs.governedPlan.properties.schemaVersion.const, "1.1.0");
  assert.equal(schema.$defs.governedStep.additionalProperties, false);
  assert.ok(schema.$defs.governedStep.required.includes("checkpoint"));
  assert.ok(schema.$defs.governedStep.required.includes("onBlocked"));
  assert.ok(schema.$defs.governedStep.required.includes("approvalClasses"));

  const runtime = await readFile(path.join(root, "pso.mjs"), "utf8");
  assert.match(runtime, /step IDs must be unique/);
  assert.match(runtime, /prerequisite cycle/);
  assert.match(runtime, /cannot reach terminal handoff/);
  assert.match(runtime, /current-execution-state\.json/);
});

test("every generated and adopted project carries the mandatory clarification protocol", async () => {
  const skills = new Map((await loadSkills()).map((skill) => [skill.metadata.name, skill]));
  const clarification = skills.get("clarify-the-ask");
  assert.match(clarification.source, /askEveryPrompt/);
  assert.match(clarification.source, /questionsPerPrompt/);
  assert.match(clarification.source, /confirmPlanBeforeExecution/);
  assert.match(clarification.source, /Never treat the agent's own plan statement as the user's confirmation to proceed\./);

  const orchestrator = skills.get("project-skills-orchestrator");
  assert.match(orchestrator.source, /Route every new user prompt through `clarify-the-ask` first/);

  const runtime = await readFile(path.join(root, "pso.mjs"), "utf8");

test("every governed skill has deterministic help coverage", async () => {
  const skills = await loadSkills();
  const rootHelp = await readFile(path.join(root, ".github", "prompts", "skills-help.prompt.md"), "utf8");
  assert.match(rootHelp, /complete governed skill catalog/);
  assert.match(rootHelp, /Composition and Dependencies/);
  const runtime = await readFile(path.join(root, "pso.mjs"), "utf8");
  assert.match(runtime, /async function printSkillHelp\(skillName\)/);
  assert.match(runtime, /Unknown skill:/);

  for (const skill of skills) {
    const skillName = skill.metadata.name;
    assert.match(skill.source, /^## Composition and Dependencies$/m, `${skillName} must expose composition guidance`);
    assert.match(runtime, /files\.set\(`\.github\/prompts\/\$\{skill\.name\}-help\.prompt\.md`/, `runtime must generate help for ${skillName}`);
  }
});
  assert.match(runtime, /const CLARIFICATION_PROTOCOL_HEADING = "## Engagement protocol \(mandatory, highest precedence\)"/);
  assert.match(runtime, /Ask one question round only:/);
  assert.match(runtime, /is missing the managed \$\{block\.id\} region/);
  assert.match(runtime, /copies of the managed \$\{block\.id\} region/);

  const templateRoot = path.join(root, "templates", "project");
  const blueprint = JSON.parse(await readFile(path.join(root, "schemas", "project-blueprint.schema.json"), "utf8"));
  assert.equal(blueprint.$schema, "https://json-schema.org/draft/2020-12/schema");
  assert.equal(blueprint.properties.schemaVersion.const, "1.0.0");
  assert.equal(blueprint.additionalProperties, false);
  assert.ok(blueprint.required.includes("project"));
  assert.ok(blueprint.required.includes("delivery"));
  const blueprintPrompt = await readFile(path.join(templateRoot, ".github", "prompts", "project-blueprint.prompt.md"), "utf8");
  assert.match(blueprintPrompt, /docs\/PROJECT-BLUEPRINT\.json/);
  assert.match(blueprintPrompt, /azure-discovery/);
  assert.match(blueprintPrompt, /Never place credentials, tokens, connection strings, or secret values/);
  const repositoryInstructions = await readFile(path.join(templateRoot, ".github", "copilot-instructions.md"), "utf8");
  assert.match(repositoryInstructions, /<!-- pso:begin id=clarification-protocol version=1 -->/);
  assert.match(repositoryInstructions, /<!-- pso:end id=clarification-protocol -->/);
  assert.match(repositoryInstructions, /<!-- pso:begin id=orchestration-routing version=1 -->/);
  assert.match(repositoryInstructions, /## Engagement protocol \(mandatory, highest precedence\)/);
  assert.match(repositoryInstructions, /Ask one question round only:/);

  const scoped = await readFile(path.join(templateRoot, ".github", "instructions", "clarification.instructions.md"), "utf8");
  assert.match(scoped, /^applyTo: "\*\*"$/m);
  assert.match(scoped, /Ask one question round only:/);

  const discovery = skills.get("azure-discovery");
  assert.ok(discovery, "azure-discovery skill must be available to generated projects");
  assert.match(discovery.source, /Speech-resource readiness/);
  assert.match(discovery.source, /image-generation models/);
  assert.match(discovery.source, /requiresExplicitAcceptance/);
  assert.match(discovery.source, /never implies authorization to deploy or invoke/);
  assert.match(discovery.source, /\.azure\/environment\.json/);
  assert.match(discovery.source, /defaults to Azure Commercial/);
  assert.match(discovery.source, /start the recorded login method/);
  assert.match(discovery.source, /foundryextensions/);
  assert.match(discovery.source, /\.github\/skills\/azure-discovery\/scripts\/azure-discovery\.ps1/);
  assert.ok(!existsSync(path.join(templateRoot, ".github", "prompts", "azure-discovery.prompt.md")));
  const discoveryScript = await readFile(path.join(templateRoot, "infra", "discover.ps1"), "utf8");
  assert.match(discoveryScript, /azure-discovery\.json/);
  assert.match(discoveryScript, /Get-AzureSpeechResourceSummary/);
  const packagedDiscoveryScript = await readFile(path.join(skillsRoot, "azure-discovery", "scripts", "azure-discovery.ps1"), "utf8");
  assert.match(packagedDiscoveryScript, /Get-AzureImageModelClassification/);
  assert.match(packagedDiscoveryScript, /Get-AzureImageQuotaSummary/);
  assert.match(packagedDiscoveryScript, /Get-AzureImageDeploymentSummary/);
  assert.match(packagedDiscoveryScript, /imageGeneration\s+=\s+\[ordered\]@\{/);
  const normalizedPowerShell = (value) => value.replace(/^\uFEFF/, "").replaceAll("\r\n", "\n").trimEnd();
  assert.equal(normalizedPowerShell(packagedDiscoveryScript), normalizedPowerShell(discoveryScript), "skill-owned and infrastructure discovery implementations must stay synchronized");
  const environmentScript = await readFile(path.join(templateRoot, "infra", "azure-environment.ps1"), "utf8");
  const packagedEnvironmentScript = await readFile(path.join(skillsRoot, "azure-discovery", "scripts", "azure-environment.ps1"), "utf8");
  assert.equal(normalizedPowerShell(packagedEnvironmentScript), normalizedPowerShell(environmentScript), "skill-owned and infrastructure Azure environment implementations must stay synchronized");
  assert.match(environmentScript, /return 'AzureCloud'/);
  assert.match(environmentScript, /az cloud set --name \$AzureContext\.cloud/);
  assert.match(environmentScript, /az login --identity/);
  assert.match(environmentScript, /'login', '--use-device-code'/);
  assert.match(environmentScript, /Get-AzureCloudEndpoints/);
  assert.match(environmentScript, /documents\.azure\.us/);
  assert.match(environmentScript, /openai\.azure\.us/);
  assert.match(environmentScript, /cognitiveservices\.azure\.us/);
  assert.match(environmentScript, /tts\.speech\.azure\.us/);
  assert.match(environmentScript, /allowedDuringChat = \[bool\]\$AzureContext\.mcp\.enabled/);
  assert.match(discoveryScript, /ChangeExtension\(\$DiscoveryOutputPath, '\.md'\)/);
  const environmentSchema = JSON.parse(await readFile(path.join(root, "schemas", "azure-environment.schema.json"), "utf8"));
  assert.equal(environmentSchema.additionalProperties, false);
  assert.deepEqual(environmentSchema.properties.cloud.enum, ["AzureCloud", "AzureUSGovernment"]);
  assert.equal(environmentSchema.properties.mcp.properties.foundryExtensions.additionalProperties, false);
  assert.ok(environmentSchema.required.includes("subscription"));
  assert.ok(environmentSchema.required.includes("cloudEndpoints"));
  assert.ok(environmentSchema.properties.cloudEndpoints.required.includes("resourceManager"));
  assert.ok(environmentSchema.properties.cloudEndpoints.required.includes("openAI"));
  const projectStatus = skills.get("project-status");
  assert.ok(existsSync(path.join(skillsRoot, "project-status", "scripts", "project-status.mjs")));
  assert.ok(sectionItems(projectStatus.source, "Outputs").includes("reports/project-status.json"));
  assert.match(projectStatus.source, /sync.*stale/i);
  assert.match(projectStatus.source, /deployed build\/version marker/i);
  const generatedInstructions = await readFile(path.join(templateRoot, ".github", "copilot-instructions.md"), "utf8");
  assert.match(generatedInstructions, /reports\/project-handoff\.json/);
  assert.match(generatedInstructions, /--proceed/);
  assert.ok(existsSync(path.join(templateRoot, ".github", "prompts", "skills-help.prompt.md")));
  const linkedinPost = skills.get("linkedin-post");
  assert.match(linkedinPost.source, /reports\/linkedin-post-draft\.md/);
  assert.match(linkedinPost.source, /--update/);
  assert.ok(sectionItems(linkedinPost.source, "Composition and Dependencies").includes("user-personalization"));
  assert.match(linkedinPost.source, /references\/linkedin-best-practices\.md/);
  assert.match(linkedinPost.source, /content sweet spot/i);
  assert.match(linkedinPost.source, /why-care\/why-share/i);
  assert.match(linkedinPost.source, /3,000 characters/);
  assert.match(linkedinPost.source, /three to five relevant hashtags/i);
  assert.match(linkedinPost.source, /media brief[\s\S]*Not ready/i);
  assert.match(linkedinPost.source, /national or global conversation/i);
  const linkedinBestPractices = await readFile(path.join(skillsRoot, "linkedin-post", "references", "linkedin-best-practices.md"), "utf8");
  assert.match(linkedinBestPractices, /Short-Form Post Contract/);
  assert.match(linkedinBestPractices, /No more than 3,000 characters/i);
  assert.match(linkedinBestPractices, /Three to five final hashtags/i);
  assert.doesNotMatch(linkedinBestPractices, /https?:\/\/|mailto:/i);
  assert.doesNotMatch(`${linkedinPost.source}\n${linkedinBestPractices}`, /\btadd(?:-ai-fied|afied)?\b/i);
  for (const prompt of ["azure-cleanup-help.prompt.md", "environment-update-help.prompt.md", "release-readiness.prompt.md"]) {
    assert.ok(existsSync(path.join(root, ".github", "prompts", prompt)), `missing repository prompt ${prompt}`);
  }
  const demoPrompt = await readFile(path.join(root, ".github", "prompts", "demo-create-project.prompt.md"), "utf8");
  assert.match(demoPrompt, /\/demo-create-project --Test/);
  assert.match(demoPrompt, /--demo-date YYYY-MM-DD/);
  assert.match(demoPrompt, /skills-orchestrator-demo-test/);
  assert.match(demoPrompt, /Never delete an existing normal/);
  assert.match(demoPrompt, /source repository is immutable during the demo/i);
  assert.match(demoPrompt, /Modify only the newly created project/i);
  assert.match(demoPrompt, /unique temporary workspace/i);
  assert.match(demoPrompt, /Get-Process -Name Code/);
  assert.match(demoPrompt, /AppActivate/);
  assert.match(demoPrompt, /code --status/);
  assert.match(demoPrompt, /already open or still loading/i);
  assert.ok(
    demoPrompt.indexOf("code --status") < demoPrompt.indexOf("[guid]::NewGuid") &&
      demoPrompt.indexOf("Get-Process -Name Code") < demoPrompt.indexOf("[guid]::NewGuid"),
    "demo launch must detect and reuse an existing window before generating a new workspace identity"
  );
  assert.match(demoPrompt, /\$env:TEMP/);
  assert.match(demoPrompt, /\[guid\]::NewGuid/);
  assert.match(demoPrompt, /ConvertFrom-Json/);
  assert.match(demoPrompt, /\$workspace\.settings\.'window\.title'/);
  assert.match(demoPrompt, /Skills Orchestrator Demo.*skills-orchestrator-demo \(Workspace\)/);
  assert.match(demoPrompt, /Never open the\s+stable generated workspace directly/i);
  assert.match(demoPrompt, /Do not delete prior VS Code\s+workspace storage or chat history/i);
  assert.doesNotMatch(demoPrompt, /clarification\.askEveryPrompt/);
  assert.doesNotMatch(demoPrompt, /confirmPlanBeforeExecution/);
  const demoWebAppPrompt = await readFile(path.join(root, ".github", "prompts", "demo-web-app.prompt.md"), "utf8");
  assert.match(demoWebAppPrompt, /\/azure-discovery -Gov/);
  assert.match(demoWebAppPrompt, /usgovarizona/);
  assert.match(demoWebAppPrompt, /az cloud show --query name -o tsv.*AzureUSGovernment/);
  assert.match(demoWebAppPrompt, /az account show --query id -o tsv.*subscription ID/);
  assert.match(demoWebAppPrompt, /authenticate immediately when the current session is missing or stale/);
  assert.match(demoWebAppPrompt, /Stop now if either check fails after the discovery login flow; do not defer authentication until deployment/);
  assert.ok(
    demoWebAppPrompt.indexOf("/azure-discovery -Gov") < demoWebAppPrompt.indexOf("## Implementation requirements"),
    "demo Azure discovery must complete before application implementation"
  );
  assert.ok(
    demoWebAppPrompt.indexOf("/azure-discovery -Gov") < demoWebAppPrompt.indexOf("az cloud show --query name -o tsv"),
    "demo Azure discovery must establish authentication before the CLI context is validated"
  );
  assert.match(demoWebAppPrompt, /reports\/azure-discovery\.json/);
  assert.match(demoWebAppPrompt, /\$discovery = Get-Content .*azure-discovery\.json/);
  assert.match(demoWebAppPrompt, /\$location = \[string\]\$discovery\.location/);
  assert.match(demoWebAppPrompt, /This app workflow does not synthesize Speech and must not require `AZURE_SPEECH_KEY`/);
  assert.match(demoWebAppPrompt, /Project Video performs its own Speech readiness and approval checks only when `\/project-video` is invoked/);
  assert.doesNotMatch(demoWebAppPrompt, /project-video\.mjs azure-preflight/);
  assert.doesNotMatch(demoWebAppPrompt, /credentialConfigured/);
  assert.match(demoWebAppPrompt, /Reconfirm the Azure CLI session established during the beginning preflight/);
  assert.match(demoWebAppPrompt, /do not switch clouds or start another interactive login at deployment time/);
  assert.match(demoWebAppPrompt, /Stop here and ask the presenter for explicit approval before any Azure mutation/);
  assert.doesNotMatch(demoWebAppPrompt, /-Location usgovvirginia/);
  assert.ok(existsSync(path.join(root, ".github", "prompts", "project-blueprint.prompt.md")));
  for (const prompt of ["project-start.prompt.md", "project-validate.prompt.md"]) {
    assert.ok(existsSync(path.join(root, ".github", "prompts", prompt)), `missing repository prompt ${prompt}`);
    assert.ok(existsSync(path.join(templateRoot, ".github", "prompts", prompt)), `missing template prompt ${prompt}`);
  }

  for (const relative of [
    ".editorconfig",
    ".vscode/mcp.json",
    "docs/adr/0000-template.md",
    ".github/agents/azure-architect.agent.md",
    ".github/agents/security-reviewer.agent.md",
    ".github/agents/documentation-writer.agent.md",
    ".github/prompts/create-adr.prompt.md",
    ".github/instructions/security.instructions.md"
  ]) {
    assert.ok(existsSync(path.join(templateRoot, relative)), `missing template asset ${relative}`);
  }

  const verification = JSON.parse(await readFile(path.join(root, "schemas", "project-installation-verification.schema.json"), "utf8"));
  assert.equal(verification.properties.checks.properties.clarificationProtocolPresent.const, true);
  assert.equal(verification.properties.checks.properties.customizationAssetsPresent.const, true);

  const configuration = JSON.parse(await readFile(path.join(root, "schemas", "resolved-configuration.schema.json"), "utf8"));
  assert.equal(configuration.properties.clarification.properties.askEveryPrompt.type, "boolean");
  assert.equal(configuration.properties.clarification.properties.questionsPerPrompt.minimum, 1);
  assert.equal(configuration.properties.clarification.properties.confirmPlanBeforeExecution.type, "boolean");
  assert.ok(configuration.properties.clarification.required.includes("askEveryPrompt"));
  for (const relative of [
    ".github/skills/agent-builder/SKILL.md",
    ".github/skills/agent-builder/scripts/agent-builder.mjs",
    ".github/skills/agent-builder/scripts/azure-context.ps1",
    "schemas/agent-blueprint.schema.json",
    "schemas/agent-builder-plan.schema.json",
    "schemas/agent-builder-result.schema.json"
  ]) {
    assert.ok(existsSync(path.join(root, relative)), `missing Agent Builder contract ${relative}`);
  }
  const agentBlueprint = JSON.parse(await readFile(path.join(root, "schemas", "agent-blueprint.schema.json"), "utf8"));
  assert.deepEqual(agentBlueprint.properties.schemaVersion.enum, ["1.0.0", "2.0.0", "2.1.0", "2.2.0"]);
  assert.equal(agentBlueprint.properties.autonomy.additionalProperties, false);
  assert.deepEqual(agentBlueprint.properties.autonomy.required, ["mode", "approvalRequiredFor", "webSafety"]);
  assert.deepEqual(agentBlueprint.properties.autonomy.properties.mode.enum, ["guided", "autonomous-research"]);
  assert.deepEqual(agentBlueprint.properties.autonomy.properties.webSafety.enum, ["standard", "threat-informed"]);
  const approvalGates = agentBlueprint.properties.autonomy.properties.approvalRequiredFor.items.enum;
  assert.equal(agentBlueprint.properties.autonomy.properties.approvalRequiredFor.minItems, approvalGates.length);
  assert.deepEqual(
    agentBlueprint.properties.autonomy.allOf.map((condition) => condition.properties.approvalRequiredFor.contains.const),
    approvalGates
  );
  assert.equal(agentBlueprint.properties.publication.additionalProperties, false);
  assert.deepEqual(agentBlueprint.properties.publication.required, ["targets", "versionPolicy"]);
  assert.deepEqual(agentBlueprint.properties.publication.properties.targets.items.enum, [
    "foundry-endpoint",
    "microsoft-365-copilot-and-teams",
    "chatgpt-action"
  ]);
  const agentBuilderPlan = JSON.parse(await readFile(path.join(root, "schemas", "agent-builder-plan.schema.json"), "utf8"));
  assert.deepEqual(agentBuilderPlan.properties.schemaVersion.enum, ["1.0.0", "1.1.0"]);
  assert.deepEqual(agentBuilderPlan.properties.publication.type, ["object", "null"]);
  for (const agent of ["azure-architect", "security-reviewer", "documentation-writer"]) {
    const source = await readFile(path.join(templateRoot, ".github", "agents", `${agent}.agent.md`), "utf8");
    assert.doesNotMatch(source, /tools:.*(?:fetch|githubRepo|microsoft-learn|problems|azure)/);
    assert.match(source, /tools: \["read", "search", "web"/);
  }
});

test("profiles are dependency-closed", async () => {
  const skills = await loadSkills();
  const graph = new Map(skills.map((skill) => [
    skill.metadata.name,
    dependencyItems(skill.source)
  ]));
  const profiles = await loadProfiles();

  function effective(name) {
    const profile = profiles.get(name);
    assert.ok(profile, `unknown profile ${name}`);
    return new Set([...(profile.parent ? effective(profile.parent) : []), ...profile.required]);
  }

  for (const name of profiles.keys()) {
    const selected = effective(name);
    assert.ok(selected.size, `${name} profile parsed no required skills`);
    for (const skill of selected) {
      for (const dependency of graph.get(skill)) {
        assert.ok(selected.has(dependency), `${name} profile omits ${skill} dependency ${dependency}`);
      }
    }
  }
  assert.ok(effective("core").has("agent-builder"), "core profile must include the governed Agent Builder");
});

test("project visual storytelling requires one local profile owner", async () => {
  const skills = new Map((await loadSkills()).map((skill) => [skill.metadata.name, skill]));
  const personalization = skills.get("user-personalization");
  const content = skills.get("project-visual-storytelling");
  assert.ok(personalization, "user-personalization skill must exist");
  assert.ok(content, "project-visual-storytelling skill must exist");
  assert.deepEqual(dependencyItems(personalization.source), []);
  assert.deepEqual(dependencyItems(content.source), ["user-personalization", "project-understanding", "agent-builder", "azure-discovery"]);
  assert.ok(sectionItems(personalization.source, "Outputs").includes(".skills-orchestrator/user-personalization.json"));
  assert.ok(sectionItems(content.source, "Outputs").includes("artifacts/project-visual-storytelling/<run-id>/"));
  assert.match(content.source, /Every run uses a freshly rebuilt understanding of the current project as its sole topic and source/);
  assert.match(content.source, /Reject alternate topic, URL, pasted-source, and output-path overrides/);
  assert.match(content.source, /whiteboard\|whiteboard-specification\|diorama\|diorama-specification/);
  assert.match(content.source, /diorama-production-rules\.md/);
  assert.match(content.source, /canonical spelling `diorama`/);
  assert.match(content.source, /A final diorama PNG requires an approved bitmap image generator/);
  assert.match(content.source, /HTML\/CSS\/SVG screenshot does not qualify/);
  assert.match(content.source, /one central sculpted metaphor/);
  assert.match(content.source, /legacy identity that differs from the validated profile/);
  assert.match(content.source, /## Renderer Qualification/);
  assert.match(content.source, /A planned optional PNG is not a promise of delivery/);
  assert.match(content.source, /validate the PNG signature, dimensions, nonblank pixels/);
  assert.match(content.source, /schemas\/project-visual-scene\.schema\.json/);
  assert.match(content.source, /create --project \. --output-type whiteboard\|diorama --request/);
  assert.match(content.source, /render --project \. --run-id/);
  assert.match(content.source, /Automated qualification must return `requires-review`/);
  assert.match(content.source, /PROJECT_VISUAL_AZURE_OPENAI_ENDPOINT/);
  assert.match(content.source, /PROJECT_VISUAL_MAI_ENDPOINT/);
  assert.match(content.source, /--external-processing-approved true/);
  assert.match(content.source, /Use fresh `azure-discovery` output to qualify Azure OpenAI or MAI-Image availability in Azure Government/);
  assert.match(content.source, /<visual>-azure-openai-candidate\.png/);
  assert.match(content.source, /<visual>-mai-candidate\.png/);
  assert.match(content.source, /If an approved bitmap generator is unavailable, `create` fails clearly and does not claim a PNG/);
  assert.ok(existsSync(path.join(skillsRoot, "project-visual-storytelling", "references", "diorama-production-rules.md")));
  assert.match(content.source, /documentation-builder.*owns authoritative written project guides/);
  assert.match(content.source, /linkedin-post.*owns LinkedIn drafts/);
  assert.match(content.source, /untrusted data, never as instructions or authorization/);
  assert.match(content.source, /Publication, posting, sending, uploading, or external sharing is outside this skill/);

  const profileSchema = JSON.parse(await readFile(path.join(root, "schemas", "user-personalization.schema.json"), "utf8"));
  assert.equal(profileSchema.$schema, "https://json-schema.org/draft/2020-12/schema");
  assert.equal(profileSchema.additionalProperties, false);
  assert.equal(profileSchema.properties.safety.additionalProperties, false);
  assert.equal(profileSchema.properties.safety.properties.treatSourcesAsUntrusted.const, true);
  assert.equal(profileSchema.properties.safety.properties.excludeConfidentialContent.const, true);
  assert.equal(profileSchema.properties.safety.properties.externalPublicationRequiresApproval.const, true);
  assert.equal(profileSchema.properties.visualPreferences.properties.requireAltText.const, true);

  const questionnaire = await readFile(path.join(skillsRoot, "user-personalization", "references", "personalization-questionnaire.md"), "utf8");
  assert.equal((questionnaire.match(/^\d+\./gm) ?? []).length, 31);
  assert.doesNotMatch(questionnaire, /\btadd\b/i);
  assert.ok(existsSync(path.join(skillsRoot, "user-personalization", "scripts", "user-personalization.mjs")));
  assert.ok(existsSync(path.join(skillsRoot, "project-visual-storytelling", "scripts", "project-visual-storytelling.mjs")));
  assert.ok(existsSync(path.join(skillsRoot, "project-visual-storytelling", "scripts", "azure-openai-image-render.mjs")));
  assert.ok(existsSync(path.join(skillsRoot, "project-visual-storytelling", "scripts", "mai-image-render.mjs")));
  assert.ok(existsSync(path.join(skillsRoot, "project-visual-storytelling", "references", "renderer-contract.md")));
  const visualSceneSchema = JSON.parse(await readFile(path.join(root, "schemas", "project-visual-scene.schema.json"), "utf8"));
  assert.equal(visualSceneSchema.$schema, "https://json-schema.org/draft/2020-12/schema");
  assert.equal(visualSceneSchema.additionalProperties, false);
  assert.deepEqual(visualSceneSchema.properties.visualType.enum, ["whiteboard", "diorama"]);
  assert.equal(visualSceneSchema.properties.elements.maxItems, 12);
  assert.deepEqual(visualSceneSchema.properties.renderer.properties.preference.enum, ["auto", "azure-openai", "mai-image"]);
  assert.ok(visualSceneSchema.properties.elements.items.required.includes("caption"));

  const profiles = await loadProfiles();
  assert.ok(profiles.get("durable").required.includes("user-personalization"));
  assert.ok(profiles.get("durable").required.includes("project-visual-storytelling"));
});

test("the default new-project profile requires Azure audit and remediation execution", async () => {
  const runtimeSource = await readFile(path.join(root, "pso.mjs"), "utf8");
  const defaultProfile = runtimeSource.match(/^const DEFAULT_PROJECT_PROFILE = "([a-z]+)";$/m)?.[1];
  assert.ok(defaultProfile, "pso.mjs must declare DEFAULT_PROJECT_PROFILE");

  const profiles = await loadProfiles();
  const selected = new Set();
  for (let name = defaultProfile; name; name = profiles.get(name).parent) {
    assert.ok(profiles.has(name), `unknown profile ${name}`);
    for (const skill of profiles.get(name).required) selected.add(skill);
  }
  assert.ok(selected.has("audit-azure-environment"), `${defaultProfile} profile omits audit-azure-environment`);
  assert.ok(selected.has("audit-remediation"), `${defaultProfile} profile omits audit-remediation`);
});

test("shipped Bicep keeps derived Azure resource names inside service limits", async () => {
  const infra = path.join(root, "templates", "project", "infra");
  const bicep = await readFile(path.join(infra, "main.bicep"), "utf8");

  const maxSiteName = Number(bicep.match(/@maxLength\((\d+)\)\r?\n@description\([^)]*\)\r?\nparam siteName/)?.[1]);
  assert.ok(Number.isInteger(maxSiteName), "siteName must declare a maximum length");
  assert.equal(maxSiteName, 90, "the deployment accepts the full project name as its naming source");

  const deploy = await readFile(path.join(infra, "deploy.ps1"), "utf8");
  const deployLibrary = await readFile(path.join(infra, "deploy-infra.ps1"), "utf8");
  assert.match(deploy, /ValidatePattern\('\^\[\^/);
  assert.match(deployLibrary, /function ConvertTo-AzureProjectToken/);
  assert.match(deployLibrary, /function Get-AzureResourceName/);
  assert.match(deployLibrary, /resourceGroup\s+= 'rg-'/);
  assert.match(deployLibrary, /keyVault\s+\s+= 'kv-'/);
  assert.match(deployLibrary, /Substring\(0, \$available\)/);
});

test("the Azure baseline supports governed Speech configuration", async () => {
  const infra = path.join(root, "templates", "project", "infra");
  const bicep = await readFile(path.join(infra, "main.bicep"), "utf8");
  const deploy = await readFile(path.join(infra, "deploy.ps1"), "utf8");
  const deployLibrary = await readFile(path.join(infra, "deploy-infra.ps1"), "utf8");

  assert.match(bicep, /param deploySpeech bool = false/);
  assert.match(bicep, /resource speech 'Microsoft\.CognitiveServices\/accounts@[^']+' = if \(deploySpeech\)/);
  assert.match(bicep, /name: 'AZURE_SPEECH_ENDPOINT'/);
  assert.match(bicep, /name: 'AZURE_SPEECH_KEY'/);
  assert.match(bicep, /Microsoft\.KeyVault\(SecretUri=/);
  assert.match(deploy, /cognitiveservices account list --resource-group/);
  assert.match(deploy, /Reusing Speech-capable account/);
  assert.match(deploy, /No Speech-capable account is configured/);
  assert.match(deploy, /cognitiveservices account keys list/);
  assert.match(deploy, /keyvault secret set/);
  assert.match(deployLibrary, /speechEndpoint/);
  assert.match(deployLibrary, /configureSpeech/);
});

test("all dependencies resolve and the graph is acyclic", async () => {
  const skills = await loadSkills();
  const graph = new Map(skills.map((skill) => [
    skill.metadata.name,
    dependencyItems(skill.source)
  ]));
  const visited = new Set();
  const visiting = new Set();
  function visit(name) {
    assert.ok(graph.has(name), `unknown dependency ${name}`);
    assert.ok(!visiting.has(name), `dependency cycle through ${name}`);
    if (visited.has(name)) return;
    visiting.add(name);
    for (const dependency of graph.get(name)) visit(dependency);
    visiting.delete(name);
    visited.add(name);
  }
  for (const name of graph.keys()) visit(name);
});

test("audit pipeline has stable handoffs and schemas", async () => {
  const skills = new Map((await loadSkills()).map((skill) => [skill.metadata.name, skill]));
  const audit = skills.get("audit-code");
  const review = skills.get("audit-review-findings");
  const remediation = skills.get("audit-plan-remediation");
  const execution = skills.get("audit-remediation");

  assert.ok(sectionItems(audit.source, "Outputs").includes("reports/code-audit-findings.json"));
  assert.match(audit.source, /memory retention and leaks/);
  assert.match(audit.source, /C# `using`/);
  assert.match(audit.source, /unused, duplicate, wildcard, misplaced, or missing imports/);
  assert.match(audit.source, /oversized or multi-responsibility methods\/classes/);
  assert.match(audit.source, /all locally available refs, branches, tags, and reachable history/);
  assert.match(audit.source, /specialist secret scanner/i);
  assert.match(audit.source, /tracked reports/i);
  assert.match(audit.source, /hosted GitHub security/i);
  assert.match(audit.source, /Microsoft Security Development Lifecycle/);
  assert.match(audit.source, /Microsoft Cloud Security Benchmark/);
  assert.match(audit.source, /OWASP ASVS/);
  assert.match(audit.source, /NIST Secure Software Development Framework/);
  assert.match(audit.source, /CIS Controls/);
  assert.match(audit.source, /SLSA/);
  assert.match(audit.source, /OpenSSF Scorecard/);
  assert.match(audit.source, /OWASP GenAI LLM Top 10 2026/);
  assert.match(audit.source, /OWASP Top 10 for Agentic Applications 2026/);
  assert.match(audit.source, /NIST AI RMF 1\.0/);
  assert.match(audit.source, /AI-slop indicators/);
  assert.match(audit.source, /CA2000/);
  assert.match(audit.source, /borrowed, dependency-injection-owned, pooled, shared, factory-managed, and framework-owned/);
  assert.match(audit.source, /Language-Specific Minimum Verification/);
  assert.match(audit.source, /Never claim that a repository is secure, fully compliant, or meets all best practices/);
  assert.match(audit.source, /### Downstream Composition/);
  assert.match(audit.source, /Resolve the current stable and preview releases from the authoritative source at audit time/);
  assert.match(audit.source, /schemaVersion: 2\.2\.0/);
  assert.match(audit.source, /automatically dispatch `audit-review-findings`/);
  assert.match(audit.source, /automatically dispatch `audit-plan-remediation`/);
  assert.match(audit.source, /approval-wait/);
  const auditEvidenceScript = path.join(root, ".github", "skills", "audit-code", "scripts", "audit-evidence.mjs");
  const auditValidateScript = path.join(root, ".github", "skills", "audit-code", "scripts", "audit-validate.mjs");
  const gitleaksScript = path.join(root, ".github", "skills", "audit-code", "scripts", "gitleaks-scan.mjs");
  assert.ok(existsSync(auditEvidenceScript));
  assert.ok(existsSync(auditValidateScript));
  assert.ok(existsSync(gitleaksScript));
  const gitleaksMetadataResult = spawnSync(process.execPath, [gitleaksScript, "metadata"], { cwd: root, encoding: "utf8" });
  assert.equal(gitleaksMetadataResult.status, 0, gitleaksMetadataResult.stderr);
  const gitleaksMetadata = JSON.parse(gitleaksMetadataResult.stdout);
  assert.equal(gitleaksMetadata.version, "8.30.1");
  assert.equal(gitleaksMetadata.releaseUrl, "https://github.com/gitleaks/gitleaks/releases/download/v8.30.1/");
  assert.match(gitleaksMetadata.archiveSha256, /^[a-f0-9]{64}$/);
  assert.equal(gitleaksMetadata.checksumsSha256, "061476c21adaf5441516f96f185c1a4706a83cd6329b9b38762271b3d4a52fae");
  const gitleaksSource = await readFile(gitleaksScript, "utf8");
  assert.match(gitleaksSource, /AbortSignal\.timeout\(60_000\)/);
  assert.match(gitleaksSource, /checkpoint output is missing a valid revision or worktree digest/);
  assert.match(gitleaksSource, /scan input cannot contain symbolic links/);
  assert.equal(
    (await readFile(path.join(root, ".gitleaks.toml"), "utf8")).replaceAll("\r\n", "\n").trimEnd(),
    (await readFile(path.join(root, ".github", "skills", "audit-code", "config", "gitleaks.toml"), "utf8")).replaceAll("\r\n", "\n").trimEnd()
  );
  assert.deepEqual(
    JSON.parse(await readFile(path.join(root, "config", "gitleaks-allowlist.json"), "utf8")),
    JSON.parse(await readFile(path.join(root, ".github", "skills", "audit-code", "config", "gitleaks-allowlist.json"), "utf8"))
  );
  assert.equal(
    (await readFile(path.join(root, "scripts", "safe-path.mjs"), "utf8")).replaceAll("\r\n", "\n").trimEnd(),
    (await readFile(path.join(root, ".github", "skills", "audit-code", "scripts", "safe-path.mjs"), "utf8")).replaceAll("\r\n", "\n").trimEnd()
  );
  const packageManifest = JSON.parse(await readFile(path.join(root, "package.json"), "utf8"));
  assert.match(packageManifest.scripts["security:gitleaks"], /\.github\/skills\/audit-code\/scripts\/gitleaks-scan\.mjs scan/);
  assert.doesNotMatch(packageManifest.scripts.check, /gitleaks/);
  const securityWorkflow = await readFile(path.join(root, ".github", "workflows", "security-validation.yml"), "utf8");
  assert.equal((securityWorkflow.match(/fetch-depth: 0/g) ?? []).length, 2);
  assert.match(securityWorkflow, /os: \[windows-latest, ubuntu-latest, macos-latest\]/);
  assert.match(securityWorkflow, /npm run test:gitleaks/);
  assert.match(securityWorkflow, /npm run security:gitleaks/);
  assert.match(securityWorkflow, /actions\/checkout@[a-f0-9]{40}/);
  assert.match(securityWorkflow, /actions\/upload-artifact@[a-f0-9]{40}/);
  const auditEvidenceResult = spawnSync(process.execPath, [auditEvidenceScript, "--root", root], { cwd: root, encoding: "utf8" });
  assert.equal(auditEvidenceResult.status, 0, auditEvidenceResult.stderr);
  const auditEvidence = JSON.parse(auditEvidenceResult.stdout);
  await rm(path.join(root, auditEvidence.artifact.path), { force: true });
  const auditEvidenceSource = await readFile(auditEvidenceScript, "utf8");
  assert.doesNotMatch(auditEvidenceSource, /node\\:/);
  assert.doesNotMatch(auditEvidenceSource, /url:\s*"\[/);
  assert.doesNotMatch(auditEvidenceSource, /const specialistReady/);
  assert.match(auditEvidenceSource, /remote\.search = ""/);
  assert.match(auditEvidenceSource, /remote\.hash = ""/);
  assert.match(auditEvidenceSource, /const metadataValid = metadataState\.valid/);
  assert.match(auditEvidenceSource, /const checkpointValid = checkpointState\.valid/);
  assert.match(auditEvidenceSource, /const scanDigestValid = scanDigestState\.valid/);
  assert.match(auditEvidenceSource, /const SECRET_EVIDENCE_MAX_AGE_HOURS = 24/);
  assert.match(auditEvidenceSource, /status: specialistCompleted \? "completed" : pinnedScannerReady \? "ready" : "blocked"/);
  assert.match(auditEvidenceSource, /const requiredFindingBuckets = \["worktree", "staged", "history"\]/);
  assert.match(auditEvidenceSource, /const noSecretFindings = requiredFindingBuckets\.every/);
  assert.equal(auditEvidence.repository.shallow, false);
  assert.ok(auditEvidence.repository.reachableCommitCount > 0);
  assert.ok(auditEvidence.repository.trackedReportCount > 0);
  assert.equal(auditEvidence.hostedGitHub.required, true);
  assert.equal(auditEvidence.hostedGitHub.status, "blocked");
  assert.equal(auditEvidence.assurance.status, "insufficient-evidence");
  assert.equal(auditEvidence.secretHistory.pinnedScannerReady, true);
  assert.equal(typeof auditEvidence.secretHistory.pinnedBinaryInstalled, "boolean");
  assert.equal(typeof auditEvidence.secretHistory.supplementalScannerAvailable, "boolean");
  assert.deepEqual(auditEvidence.secretHistory.helperValidity, { metadata: true, checkpoint: true, scanDigest: true });
  assert.equal(auditEvidence.secretHistory.evidenceMaxAgeHours, 24);
  assert.equal(typeof auditEvidence.secretHistory.scanFresh, "boolean");
  assert.equal(auditEvidence.repository.root, ".");
  assert.equal(auditEvidence.repository.rootResolved, true);
  assert.ok(auditEvidence.standardsProfiles.some((profile) => profile.id === "microsoft-sdl"));
  assert.ok(auditEvidence.standardsProfiles.some((profile) => profile.id === "owasp-asvs"));
  assert.equal(auditEvidence.standardsProfiles.find((profile) => profile.id === "owasp-asvs").version, "5.0.0");
  assert.equal(auditEvidence.standardsProfiles.find((profile) => profile.id === "owasp-top-10").version, "2025");
  assert.equal(auditEvidence.standardsProfiles.find((profile) => profile.id === "nist-ssdf").version, "1.1");
  assert.equal(auditEvidence.standardsProfiles.find((profile) => profile.id === "slsa").version, "1.2");
  assert.equal(auditEvidence.standardsProfiles.find((profile) => profile.id === "microsoft-cloud-security-benchmark").resolutionRequired, true);
  assert.equal(auditEvidence.standardsProfiles.find((profile) => profile.id === "microsoft-cloud-security-benchmark").version, "resolve-at-audit-time");
  assert.equal(auditEvidence.standardsProfiles.find((profile) => profile.id === "owasp-genai-llm-top-10").conditional, true);
  assert.equal(auditEvidence.standardsProfiles.find((profile) => profile.id === "owasp-agentic-top-10").version, "2026");
  for (const profile of auditEvidence.standardsProfiles) {
    assert.doesNotThrow(() => new URL(profile.url), `${profile.id} must use a raw URL`);
    assert.equal(profile.applicabilityAssessmentRequired, true);
    assert.equal(profile.currencyVerificationRequired, true);
    assert.match(profile.profileDeclaredAt, /^\d{4}-\d{2}-\d{2}T/);
    assert.equal(profile.lastVerifiedAt, null);
    assert.equal(profile.accessedAt, undefined);
  }
  for (const id of ["owasp-asvs", "owasp-top-10", "nist-ssdf", "cis-controls", "slsa", "nist-ai-rmf", "nist-ai-600-1"]) {
    assert.equal(auditEvidence.standardsProfiles.find((profile) => profile.id === id).resolutionRequired, false, `${id} has a fixed version`);
  }
  for (const id of ["microsoft-sdl", "microsoft-cloud-security-benchmark", "azure-well-architected-security", "openssf-scorecard", "owasp-genai-llm-top-10", "owasp-agentic-top-10"]) {
    assert.equal(auditEvidence.standardsProfiles.find((profile) => profile.id === id).resolutionRequired, true, `${id} requires current resolution`);
  }
  assert.deepEqual(dependencyItems(audit.source), []);
  assert.match(audit.source, /### Downstream Composition[\s\S]*audit-review-findings[\s\S]*audit-plan-remediation/);
  const strictFindingsSchema = JSON.parse(await readFile(path.join(root, "schemas", "code-audit-findings.schema.json"), "utf8"));
  assert.ok(strictFindingsSchema.properties.schemaVersion.enum.includes("2.1.0"));
  assert.deepEqual(strictFindingsSchema.properties.verificationEvidence.required, ["secretExposure", "analyzers", "resourceOwnership", "aiQuality", "assuranceGates"]);
  assert.ok(strictFindingsSchema.$defs.resourceOwnershipAssessment.required.includes("checks"));
  const strictFindingsRule = strictFindingsSchema.allOf.find((rule) => rule.if?.properties?.schemaVersion?.const === "2.1.0");
  assert.deepEqual(strictFindingsRule.then.properties.standards.items.required, ["stability", "baselineRole"]);
  const strictReviewSchema = JSON.parse(await readFile(path.join(root, "schemas", "audit-findings-review.schema.json"), "utf8"));
  assert.ok(strictReviewSchema.properties.schemaVersion.enum.includes("2.1.0"));
  assert.ok(strictReviewSchema.allOf.some((rule) => rule.if?.properties?.schemaVersion?.const === "2.1.0"));
  assert.ok(sectionItems(review.source, "Composition and Dependencies").includes("audit-code"));
  assert.match(review.source, /preserve repository evidence, standards applicability and control status, exceptions and expiry, assurance conclusion/);
  assert.match(review.source, /cannot upgrade or soften the source assurance conclusion/);
  assert.match(review.source, /preserve `verificationEvidence` exactly/);
  assert.match(review.source, /matching the source schema version through 2\.2/);
  assert.ok(sectionItems(review.source, "Outputs").includes("reports/code-audit-review.json"));
  assert.ok(sectionItems(remediation.source, "Composition and Dependencies").includes("audit-review-findings"));
  assert.ok(sectionItems(remediation.source, "Outputs").includes("reports/audit-remediation-plan.json"));
  assert.match(remediation.source, /complexity/);
  assert.match(remediation.source, /audit-remediation/);
  assert.ok(sectionItems(execution.source, "Composition and Dependencies").includes("audit-plan-remediation"));
  assert.ok(sectionItems(execution.source, "Composition and Dependencies").includes("workflow-state-manager"));
  assert.ok(sectionItems(execution.source, "Composition and Dependencies").includes("project-handoff"));
  assert.ok(sectionItems(execution.source, "Outputs").includes("reports/audit-remediation-execution.json"));
  for (const parameter of ["-All", "-Phase", "-Finding", "-Resume"]) assert.match(execution.source, new RegExp(parameter));
  assert.match(execution.source, /After every selected phase or interruption/);
  assert.match(execution.source, /reports\/project-handoff\.json/);
  assert.match(execution.source, /audit-validate\.mjs execution/);
  assert.match(execution.source, /audit-validate\.mjs checkpoint/);
  assert.match(execution.source, /audit-validate\.mjs snapshot/);
  assert.match(execution.source, /--resume-root/);

  const schemas = [
    "code-audit-findings.schema.json",
    "audit-evidence.schema.json",
    "audit-findings-review.schema.json",
    "audit-remediation-plan.schema.json",
    "audit-remediation-execution.schema.json",
    "gitleaks-scan.schema.json",
    "gitleaks-allowlist.schema.json"
  ];
  for (const schemaName of schemas) {
    const schemaPath = path.join(root, "schemas", schemaName);
    assert.ok(existsSync(schemaPath), `missing ${schemaName}`);
    const schema = JSON.parse(await readFile(schemaPath, "utf8"));
    assert.equal(schema.$schema, "https://json-schema.org/draft/2020-12/schema");
    assert.equal(schema.type, "object");
  }

  const gitleaksSchema = JSON.parse(await readFile(path.join(root, "schemas", "gitleaks-scan.schema.json"), "utf8"));
  assert.equal(gitleaksSchema.additionalProperties, false);
  assert.ok(gitleaksSchema.required.includes("worktreeDigest"));
  assert.ok(gitleaksSchema.required.includes("scanInputDigest"));
  assert.ok(gitleaksSchema.properties.scopes.items.enum.includes("staged"));
  assert.deepEqual(gitleaksSchema.properties.findings.required, ["worktree", "staged", "history"]);
  assert.deepEqual(gitleaksSchema.properties.schemaVersion.enum, ["1.0.0", "1.1.0"]);
  assert.ok(gitleaksSchema.properties.auditRunId);
  assert.equal(gitleaksSchema.$defs.findings.items.additionalProperties, false);
  const allowlistSchema = JSON.parse(await readFile(path.join(root, "schemas", "gitleaks-allowlist.schema.json"), "utf8"));
  assert.equal(allowlistSchema.additionalProperties, false);
  assert.ok(allowlistSchema.properties.entries.items.required.includes("reviewedBy"));
  assert.ok(allowlistSchema.properties.entries.items.required.includes("expiresAt"));

  const findingsSchema = JSON.parse(await readFile(path.join(root, "schemas", schemas[0]), "utf8"));
  assert.deepEqual(findingsSchema.properties.schemaVersion.enum, ["1.0.0", "2.0.0", "2.1.0", "2.2.0"]);
  assert.ok(findingsSchema.properties.repositoryEvidence);
  assert.ok(findingsSchema.properties.standards);
  assert.ok(findingsSchema.properties.assurance);
  assert.ok(findingsSchema.allOf.some((condition) => condition.then?.required?.includes("repositoryEvidence")));
  assert.ok(findingsSchema.allOf.some((condition) => condition.then?.required?.includes("standards")));
  assert.ok(findingsSchema.allOf.some((condition) => condition.then?.required?.includes("assurance")));
  assert.ok(findingsSchema.required.includes("coverage"));
  assert.equal(findingsSchema.properties.coverage.minItems, 8);
  assert.equal(findingsSchema.properties.coverage.maxItems, 8);
  assert.equal(findingsSchema.properties.coverage.allOf.length, 8);
  assert.ok(findingsSchema.properties.coverage.items.properties.area.enum.includes("resource-management"));
  assert.ok(findingsSchema.properties.coverage.items.properties.area.enum.includes("code-hygiene"));
  assert.ok(findingsSchema.properties.coverage.items.properties.area.enum.includes("design-maintainability"));
  assert.deepEqual(findingsSchema.$defs.finding.required.includes("bugType"), true);
  assert.deepEqual(findingsSchema.$defs.finding.required.includes("securitySeverity"), true);
  assert.deepEqual(findingsSchema.$defs.finding.required.includes("resolution"), true);
  assert.deepEqual(findingsSchema.$defs.finding.required.includes("references"), true);
  assert.ok(findingsSchema.$defs.finding.properties.category.enum.includes("architecture"));
  assert.ok(findingsSchema.$defs.finding.properties.category.enum.includes("concurrency"));

  const planSchema = JSON.parse(await readFile(path.join(root, "schemas", "audit-remediation-plan.schema.json"), "utf8"));
  const item = planSchema.properties.items.items;
  assert.deepEqual(planSchema.properties.schemaVersion.enum, ["1.0.0", "2.0.0", "2.1.0"]);
  assert.ok(planSchema.properties.auditRunId);
  assert.ok(planSchema.properties.sourceReviewSha256);
  assert.ok(planSchema.properties.prioritization.items.enum.includes("complexity"));
  assert.ok(item.required.includes("dependsOn"));
  assert.ok(item.required.includes("securitySeverity"));
  assert.ok(item.required.includes("acceptanceCriteria"));
  assert.ok(item.required.includes("rollback"));
  assert.ok(item.properties.complexity.enum.includes("very-high"));
  assert.ok(planSchema.allOf.some((condition) => condition.then?.properties?.items?.items?.required?.includes("complexity")));
  assert.ok(planSchema.allOf.some((condition) => condition.then?.properties?.prioritization?.contains?.const === "complexity"));

  const reviewSchema = JSON.parse(await readFile(path.join(root, "schemas", "audit-findings-review.schema.json"), "utf8"));
  assert.deepEqual(reviewSchema.properties.schemaVersion.enum, ["1.0.0", "2.0.0", "2.1.0", "2.2.0"]);
  assert.ok(reviewSchema.properties.repositoryEvidence);
  assert.ok(reviewSchema.properties.standards);
  assert.ok(reviewSchema.properties.assurance);
  assert.ok(reviewSchema.properties.verificationEvidence);
  assert.ok(reviewSchema.properties.auditRunId);
  assert.ok(reviewSchema.properties.auditEvidence);
  assert.equal(reviewSchema.properties.blockingEvidence, undefined);
  assert.ok(reviewSchema.allOf.some((condition) => condition.then?.required?.includes("assurance")));

  const executionSchema = JSON.parse(await readFile(path.join(root, "schemas", "audit-remediation-execution.schema.json"), "utf8"));
  assert.deepEqual(executionSchema.properties.schemaVersion.enum, ["1.0.0", "2.0.0", "3.0.0", "3.1.0"]);
  assert.ok(executionSchema.properties.auditRunId);
  assert.deepEqual(executionSchema.properties.selection.properties.mode.enum, ["all", "phase", "finding", "resume"]);
  assert.ok(executionSchema.required.includes("checkpoints"));
  assert.ok(executionSchema.required.includes("remaining"));
  assert.ok(executionSchema.required.includes("pendingApprovals"));
  assert.ok(executionSchema.allOf.some((condition) => condition.then?.properties?.checkpoints?.items?.required?.includes("repositoryRevision")));
  assert.ok(executionSchema.allOf.some((condition) => condition.then?.properties?.checkpoints?.items?.required?.includes("worktreeDigest")));
  assert.ok(executionSchema.allOf.some((condition) => condition.then?.properties?.sourcePlan?.properties?.path?.pattern?.includes("audit-remediation-plans")));
});

test("resolved product configuration has a strict versioned schema", async () => {
  const schema = JSON.parse(await readFile(path.join(root, "schemas", "resolved-configuration.schema.json"), "utf8"));
  assert.equal(schema.$schema, "https://json-schema.org/draft/2020-12/schema");
  assert.equal(schema.properties.schemaVersion.const, "1.0.0");
  assert.equal(schema.additionalProperties, false);
  assert.equal(schema.properties.platforms.additionalProperties, false);
  assert.equal(schema.properties.routing.additionalProperties, false);
  assert.equal(schema.properties.clarification.additionalProperties, false);
  assert.equal(schema.properties.clarification.properties.maxQuestionsPerRound.minimum, 3);
  assert.equal(schema.properties.clarification.properties.maxQuestionsPerRound.maximum, 5);
  assert.equal(schema.properties.policy.additionalProperties, false);

  const transactionSchema = JSON.parse(await readFile(path.join(root, "schemas", "adoption-transaction.schema.json"), "utf8"));
  assert.equal(transactionSchema.$schema, "https://json-schema.org/draft/2020-12/schema");
  assert.equal(transactionSchema.properties.schemaVersion.const, "1.0.0");
  assert.equal(transactionSchema.additionalProperties, false);
  assert.equal(transactionSchema.properties.entries.items.additionalProperties, false);
  assert.ok(transactionSchema.properties.status.enum.includes("recovery-required"));
  assert.ok(transactionSchema.required.includes("riskAcceptance"));
  assert.deepEqual(transactionSchema.properties.riskAcceptance.properties.method.enum, ["interactive", "cli-flag"]);

  const verificationSchema = JSON.parse(await readFile(path.join(root, "schemas", "project-installation-verification.schema.json"), "utf8"));
  assert.equal(verificationSchema.$schema, "https://json-schema.org/draft/2020-12/schema");
  assert.equal(verificationSchema.additionalProperties, false);
  assert.equal(verificationSchema.properties.schemaVersion.const, "1.0.0");
  assert.deepEqual(verificationSchema.properties.mode.enum, ["new-project-creation", "existing-project-adoption"]);
  assert.equal(verificationSchema.properties.checks.additionalProperties, false);
  assert.equal(verificationSchema.properties.checks.properties.inventoryCurrent.const, true);
  assert.equal(verificationSchema.properties.checks.properties.clarificationConfigured.const, true);
  assert.equal(verificationSchema.properties.checks.properties.agentInstructionsRouted.const, true);
  assert.equal(verificationSchema.properties.checks.properties.workspaceSupportPresent.const, true);
});

test("distribution requires maintained Node release lines and SDL artifacts", async () => {
  const packageManifest = JSON.parse(await readFile(path.join(root, "package.json"), "utf8"));
  assert.equal(packageManifest.engines.node, "^22.0.0 || ^24.0.0 || ^26.0.0");
  for (const relative of ["SECURITY.md", "docs/THREAT-MODEL.md"]) {
    assert.ok(existsSync(path.join(root, relative)), `missing ${relative}`);
  }
  const securityPolicy = await readFile(path.join(root, "SECURITY.md"), "utf8");
  assert.match(securityPolicy, /Microsoft Security Development Lifecycle/);
  assert.match(securityPolicy, /independent security review/i);
  assert.match(securityPolicy, /SBOM/);

  const workflow = await readFile(path.join(root, ".github", "workflows", "security-validation.yml"), "utf8");
  assert.match(workflow, /permissions:\r?\n\s+contents: read/);
  assert.match(workflow, /os: \[windows-latest, ubuntu-latest, macos-latest\]/);
  assert.match(workflow, /node: \[22, 24, 26\]/);
  assert.match(workflow, /actions\/checkout@3d3c42e5aac5ba805825da76410c181273ba90b1/);
  assert.match(workflow, /actions\/setup-node@820762786026740c76f36085b0efc47a31fe5020/);
  assert.match(workflow, /actions\/upload-artifact@043fb46d1a93c77aae656e7c1c64a875d1fc6a0a/);
  assert.match(workflow, /actions\/download-artifact@3e5f45b2cfb9172054b4087a40e8e0b5a5461e7c/);
  assert.match(workflow, /cross-platform-ci-evidence\.json/);
  assert.doesNotMatch(workflow, /uses:\s+[^\r\n]+@(v\d+|main|master)\s*$/m);
});
