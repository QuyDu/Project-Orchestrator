import assert from "node:assert/strict";
import { lstat, mkdtemp, mkdir, readFile, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { spawnSync } from "node:child_process";
import test from "node:test";

const root = path.resolve(import.meta.dirname, "..");
const helper = path.join(root, ".github", "skills", "personalized-content", "scripts", "personalized-content.mjs");

function run(args, cwd = root) {
  return spawnSync(process.execPath, [helper, ...args], { cwd, encoding: "utf8", env: process.env });
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

test("Personalized Content blocks until User Personalization is valid", async () => {
  const project = await mkdtemp(path.join(os.tmpdir(), "pso-personalized-content-"));
  try {
    const unsupported = run(["preflight", "--project", project, "--output-type", "press-release"]);
    assert.notEqual(unsupported.status, 0);
    assert.match(unsupported.stderr, /Unsupported --output-type/);

    const missing = run(["preflight", "--project", project, "--output-type", "article"]);
    assert.notEqual(missing.status, 0);
    assert.match(missing.stderr, /profile is missing/);

    await mkdir(path.join(project, ".skills-orchestrator"), { recursive: true });
    await mkdir(path.join(project, "src"), { recursive: true });
    await writeFile(path.join(project, ".gitignore"), ".skills-orchestrator/\n");
    await writeFile(path.join(project, "README.md"), "# Current Project Alpha\n\nA governed project used as the personalized-content source.\n");
    await writeFile(path.join(project, "src", "index.js"), "export const project = 'alpha';\n");
    await writeFile(path.join(project, ".skills-orchestrator", "user-personalization.json"), "{\"schemaVersion\":\"1.0.0\"}\n");
    const invalidProfile = run(["preflight", "--project", project, "--output-type", "whiteboard", "--visual-style", "diorama"]);
    assert.notEqual(invalidProfile.status, 0);
    assert.match(invalidProfile.stderr, /profile\.updatedAt/);

    await writeFile(path.join(project, ".skills-orchestrator", "user-personalization.json"), `${JSON.stringify(profile(), null, 2)}\n`);
    const ready = run(["preflight", "--project", project, "--output-type", "full-package"]);
    assert.equal(ready.status, 0, ready.stderr);
    const result = JSON.parse(ready.stdout);
    assert.equal(result.status, "ready");
    assert.equal(result.outputType, "full-package");
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
    assert.match(result.destination.directory, /^artifacts\/personalized-content\/[A-Za-z0-9-]+$/);
    assert.deepEqual(result.destination.files.required, ["content-package.md", "whiteboard-specification.md", "whiteboard-alt-text.md"]);
    assert.deepEqual(result.destination.files.optional, ["whiteboard.png"]);
    assert.equal((await lstat(path.join(project, ...result.destination.directory.split("/")))).isDirectory(), true);
    await readFile(path.join(project, "reports", "project-understanding.json"), "utf8");

    await writeFile(path.join(project, "README.md"), "# Current Project Beta\n\nThe changed repository must become the next run's source.\n");
    const refreshed = run(["preflight", "--project", project, "--output-type", "whiteboard"]);
    assert.equal(refreshed.status, 0, refreshed.stderr);
    const refreshedResult = JSON.parse(refreshed.stdout);
    assert.equal(refreshedResult.source.topic, "Current Project Beta");
    assert.notEqual(refreshedResult.source.repositoryDigestSha256, result.source.repositoryDigestSha256);
    assert.notEqual(refreshedResult.destination.directory, result.destination.directory);
    assert.deepEqual(refreshedResult.destination.files.required, ["whiteboard-specification.md", "whiteboard-alt-text.md"]);
    assert.equal((await lstat(path.join(project, ...refreshedResult.destination.directory.split("/")))).isDirectory(), true);

    const diorama = run(["preflight", "--project", project, "--output-type", "whiteboard", "--visual-style", "diorama"]);
    assert.equal(diorama.status, 0, diorama.stderr);
    const dioramaResult = JSON.parse(diorama.stdout);
    assert.equal(dioramaResult.visualStyle, "diorama");
    assert.equal(dioramaResult.visualTreatment, "conceptual");
    assert.deepEqual(dioramaResult.destination.files.required, ["diorama-specification.md", "diorama-alt-text.md"]);
    assert.deepEqual(dioramaResult.destination.files.optional, ["diorama.png"]);
    assert.match(dioramaResult.destination.directory, /-whiteboard-diorama-/);

    const dioramaPackage = run(["preflight", "--project", project, "--output-type", "full-package", "--visual-style", "diorama"]);
    assert.equal(dioramaPackage.status, 0, dioramaPackage.stderr);
    const dioramaPackageResult = JSON.parse(dioramaPackage.stdout);
    assert.deepEqual(dioramaPackageResult.destination.files.required, ["content-package.md", "diorama-specification.md", "diorama-alt-text.md"]);
    assert.deepEqual(dioramaPackageResult.destination.files.optional, ["diorama.png"]);

    await writeFile(path.join(project, "README.md"), "# Service Handbook\n\nA practical guide for operators.\n");
    const weakArchitecturalSignal = run(["preflight", "--project", project, "--output-type", "whiteboard", "--visual-style", "diorama"]);
    assert.equal(weakArchitecturalSignal.status, 0, weakArchitecturalSignal.stderr);
    assert.equal(JSON.parse(weakArchitecturalSignal.stdout).visualTreatment, "conceptual");

    await writeFile(path.join(project, "README.md"), "# Cloud Architecture Platform\n\nCloud infrastructure components and service dependencies.\n");
    const architectural = run(["preflight", "--project", project, "--output-type", "whiteboard-specification", "--visual-style", "diorama"]);
    assert.equal(architectural.status, 0, architectural.stderr);
    const architecturalResult = JSON.parse(architectural.stdout);
    assert.equal(architecturalResult.visualTreatment, "architectural");
    assert.deepEqual(architecturalResult.destination.files.optional, []);

    const misspelled = run(["preflight", "--project", project, "--output-type", "whiteboard", "--visual-style", "diarama"]);
    assert.notEqual(misspelled.status, 0);
    assert.match(misspelled.stderr, /use whiteboard or diorama/);

    const invalidStyle = run(["preflight", "--project", project, "--output-type", "whiteboard", "--visual-style", "isometric"]);
    assert.notEqual(invalidStyle.status, 0);
    assert.match(invalidStyle.stderr, /use whiteboard or diorama/);

    const nonvisual = run(["preflight", "--project", project, "--output-type", "article", "--visual-style", "diorama"]);
    assert.notEqual(nonvisual.status, 0);
    assert.match(nonvisual.stderr, /available only for whiteboard/);

    const plainArticle = run(["preflight", "--project", project, "--output-type", "article"]);
    assert.equal(plainArticle.status, 0, plainArticle.stderr);
    const plainArticleResult = JSON.parse(plainArticle.stdout);
    assert.equal(plainArticleResult.visualStyle, null);
    assert.equal(plainArticleResult.visualTreatment, null);

    for (const [option, value] of [["source", "https://example.com"], ["topic", "Another project"], ["output-path", "elsewhere"]]) {
      const override = run(["preflight", "--project", project, "--output-type", "article", `--${option}`, value]);
      assert.notEqual(override.status, 0);
      assert.match(override.stderr, new RegExp(`Unknown parameter: --${option}`));
    }
  } finally {
    await rm(project, { recursive: true, force: true });
  }
});

test("Personalized Content references are generic and close reviewed package gaps", async () => {
  const skillRoot = path.join(root, ".github", "skills", "personalized-content");
  const files = [
    "SKILL.md",
    "references/source-evaluation-playbook.md",
    "references/translation-patterns.md",
    "references/content-package-rules.md",
    "references/diorama-production-rules.md",
    "references/whiteboard-production-rules.md"
  ];
  const sources = await Promise.all(files.map((file) => readFile(path.join(skillRoot, file), "utf8")));
  const combined = sources.join("\n");
  const dioramaRules = sources[4];
  assert.doesNotMatch(combined, /\btadd\b/i);
  assert.match(combined, /untrusted data/i);
  assert.match(combined, /external publication requires approval/i);
  assert.match(combined, /alt text/i);
  assert.match(combined, /no finished image was produced/i);
  assert.match(combined, /copyright/i);
  assert.match(dioramaRules, /photograph of a deliberately handcrafted miniature exhibit/i);
  assert.match(dioramaRules, /bitmap-generation/);
  assert.match(dioramaRules, /physically-based-3d/);
  assert.match(dioramaRules, /HTML, CSS, SVG.*prohibited as final diorama output/is);
  assert.match(dioramaRules, /one central sculpted metaphor/i);
  assert.match(dioramaRules, /fewer, larger labels/i);
  assert.match(dioramaRules, /no finished image was produced/i);
  assert.match(dioramaRules, /must never be delivered, renamed, or described as `diorama\.png`/i);
  assert.match(dioramaRules, /profile\.attribution\.visualSignature/);
  assert.match(dioramaRules, /Do not imitate a reference image's exact composition/i);
  assert.match(dioramaRules, /## Renderer Qualification Record/);
  assert.match(dioramaRules, /A renderer label is not evidence/);
  assert.match(dioramaRules, /geometry types, perspective camera, physically based material model, light sources, cast shadows, and contact shadows/);
  assert.match(dioramaRules, /## Render Status[\s\S]*No finished image produced/);
  assert.match(dioramaRules, /## Reference Use Record/);
  assert.match(dioramaRules, /their pixels must not be submitted to an image-to-image or training workflow/);
  assert.match(dioramaRules, /## Final Artifact Validation/);
  assert.match(dioramaRules, /Validate the file signature is PNG/);
  assert.match(dioramaRules, /meaningful nonblank pixel variation/);
  assert.match(dioramaRules, /every visible project label has a row in the evidence-mapping table/);
  assert.match(dioramaRules, /profile signature appears exactly once/);
});