import assert from "node:assert/strict";
import { existsSync } from "node:fs";
import { lstat, mkdtemp, mkdir, readFile, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { spawnSync } from "node:child_process";
import test from "node:test";
import { pathToFileURL } from "node:url";
import { generateAzureOpenAIImage, inspectAzureOpenAIImage, supportsAzureOpenAIImageDimensions } from "../.github/skills/project-visual-storytelling/scripts/azure-openai-image-render.mjs";
import { generateMaiImage, inspectMaiImage, supportsMaiImageDimensions } from "../.github/skills/project-visual-storytelling/scripts/mai-image-render.mjs";

const root = path.resolve(import.meta.dirname, "..");
const helper = path.join(root, ".github", "skills", "project-visual-storytelling", "scripts", "project-visual-storytelling.mjs");

function run(args, cwd = root, env = process.env) {
  return spawnSync(process.execPath, [helper, ...args], { cwd, encoding: "utf8", env });
}

async function installMockAzureImageProvider(project) {
  const preload = path.join(project, "mock-image-fetch.mjs");
  await mkdir(path.join(project, ".azure"), { recursive: true });
  await mkdir(path.join(project, "reports"), { recursive: true });
  await writeFile(path.join(project, ".azure", "environment.json"), `${JSON.stringify({ cloud: "AzureUSGovernment", location: "usgovarizona" })}\n`);
  await writeFile(path.join(project, "reports", "azure-discovery.json"), `${JSON.stringify({
    cloud: "AzureUSGovernment",
    discoveredAt: new Date().toISOString(),
    imageGeneration: {
      catalogQuerySucceeded: true,
      available: true,
      selectedModelName: "gpt-image-2",
      selectedProvider: "azure-openai",
      selectedMaturity: "generally-available",
      requiresExplicitAcceptance: false,
      models: [{ name: "gpt-image-2", format: "OpenAI", provider: "azure-openai", maturity: "generally-available", available: true, regions: ["usgovarizona"] }],
      existingDeployments: { querySucceeded: true, available: true, count: 1, regions: ["usgovarizona"], models: ["gpt-image-2"], formats: ["OpenAI"] }
    }
  })}\n`);
  await writeFile(preload, `import childProcess from "node:child_process";
import { syncBuiltinESMExports } from "node:module";
const originalSpawnSync = childProcess.spawnSync;
childProcess.spawnSync = (command, ...args) => command === "az"
  ? { status: 0, stdout: "test-government-token\\n", stderr: "" }
  : originalSpawnSync(command, ...args);
syncBuiltinESMExports();
globalThis.fetch = async () => {
  const image = Buffer.alloc(1024);
  Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]).copy(image, 0);
  image.write("IHDR", 12, "ascii");
  image.writeUInt32BE(1200, 16);
  image.writeUInt32BE(800, 20);
  return { ok: true, status: 200, json: async () => ({ data: [{ b64_json: image.toString("base64") }] }), text: async () => "" };
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
    await writeFile(path.join(project, ".azure", "environment.json"), `${JSON.stringify({ cloud: "AzureUSGovernment", location: "usgovarizona" })}\n`);
    await writeFile(path.join(project, ".skills-orchestrator", "user-personalization.json"), `${JSON.stringify(profile(), null, 2)}\n`);
    await writeFile(path.join(project, "reports", "azure-discovery.json"), `${JSON.stringify({
      cloud: "AzureUSGovernment",
      discoveredAt: new Date().toISOString(),
      imageGeneration: {
        catalogQuerySucceeded: true,
        available: true,
        selectedModelName: "gpt-image-2",
        selectedProvider: "azure-openai",
        selectedMaturity: "generally-available",
        requiresExplicitAcceptance: false,
        models: [{ name: "gpt-image-2", format: "OpenAI", provider: "azure-openai", maturity: "generally-available", available: true, regions: ["usgovarizona"] }],
        existingDeployments: { querySucceeded: true, available: true, count: 1, regions: ["usgovarizona"], models: ["gpt-image-2"], formats: ["OpenAI"] }
      }
    })}\n`);
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
    await writeFile(path.join(project, ".azure", "environment.json"), `${JSON.stringify({ cloud: "AzureUSGovernment", location: "usgovarizona" })}\n`);
    await writeFile(path.join(project, "reports", "azure-discovery.json"), `${JSON.stringify({
      cloud: "AzureUSGovernment",
      discoveredAt: new Date().toISOString(),
      imageGeneration: { models: [{ name: "MAI-Image-2.6", available: true, regions: ["usgovarizona"] }] }
    })}\n`);
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
        return { ok: true, status: 200, json: async () => ({ data: [{ b64_json: image.toString("base64") }] }) };
      }
    });
    assert.equal(request.url, "https://visual.services.ai.azure.us/mai/v1/images/generations");
    assert.equal(request.options.headers.Authorization, "Bearer test-government-token");
    assert.equal(report.authentication, "microsoft-entra");
    assert.equal(report.provider, "mai-image");

    await writeFile(path.join(project, "reports", "azure-discovery.json"), `${JSON.stringify({
      cloud: "AzureUSGovernment",
      discoveredAt: "2026-01-01T00:00:00.000Z",
      imageGeneration: { models: [{ name: "MAI-Image-2.6", available: true, regions: ["usgovarizona"] }] }
    })}\n`);
    const stale = await inspectMaiImage(project);
    assert.equal(stale.available, false);
    assert.match(stale.reason, /older than 14 days/);
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
    await writeFile(path.join(project, ".azure", "environment.json"), `${JSON.stringify({ cloud: "AzureUSGovernment", location: "usgovarizona" })}\n`);
    const discovery = {
      cloud: "AzureUSGovernment",
      discoveredAt: new Date().toISOString(),
      imageGeneration: {
        catalogQuerySucceeded: true,
        available: true,
        selectedModelName: "gpt-image-2",
        selectedProvider: "azure-openai",
        selectedMaturity: "generally-available",
        requiresExplicitAcceptance: false,
        models: [{ name: "gpt-image-2", format: "OpenAI", provider: "azure-openai", maturity: "generally-available", available: true, regions: ["usgovarizona"] }],
        existingDeployments: { querySucceeded: true, available: true, count: 1, regions: ["usgovarizona"], models: ["gpt-image-2"], formats: ["OpenAI"] }
      }
    };
    await writeFile(path.join(project, "reports", "azure-discovery.json"), `${JSON.stringify(discovery)}\n`);
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
        return { ok: true, status: 200, json: async () => ({ data: [{ b64_json: image.toString("base64") }] }) };
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

    discovery.discoveredAt = "2026-01-01T00:00:00.000Z";
    await writeFile(path.join(project, "reports", "azure-discovery.json"), `${JSON.stringify(discovery)}\n`);
    const stale = await inspectAzureOpenAIImage(project);
    assert.equal(stale.available, false);
    assert.match(stale.reason, /older than 14 days/);
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