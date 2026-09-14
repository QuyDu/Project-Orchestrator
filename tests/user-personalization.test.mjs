import assert from "node:assert/strict";
import { mkdtemp, mkdir, readFile, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { spawnSync } from "node:child_process";
import test from "node:test";

const root = path.resolve(import.meta.dirname, "..");
const helper = path.join(root, ".github", "skills", "user-personalization", "scripts", "user-personalization.mjs");

function run(args, cwd = root) {
  return spawnSync(process.execPath, [helper, ...args], { cwd, encoding: "utf8", env: process.env });
}

function validProfile(overrides = {}) {
  return {
    schemaVersion: "1.0.0",
    updatedAt: "2026-09-14T12:00:00.000Z",
    attribution: { publicLabel: "Platform Guide", visualSignature: "AI-assisted for Platform Guide" },
    perspective: {
      roles: ["technologist", "teacher"],
      expertise: ["automation", "architecture"],
      interests: ["human-centered AI"],
      audiences: ["technical practitioners"]
    },
    communication: {
      voiceTraits: ["practical", "curious", "direct"],
      tone: "Peer-to-peer and technically grounded.",
      detailLevel: "balanced",
      paragraphStyle: "short",
      humor: "light",
      challengeStyle: "socratic",
      firstPerson: "when-relevant",
      preferredPatterns: ["contrast", "validation-checklist"],
      signatureLines: ["Useful beats impressive."],
      preferredTerms: ["validate"],
      avoidedTerms: ["revolutionary"]
    },
    reasoning: {
      coreValues: ["clarity", "supportability"],
      aiStance: "AI accelerates drafts while humans retain responsibility.",
      evidenceStandards: "Attribute claims and preserve uncertainty.",
      validationApproach: "Check sources, test consequential advice, and require human review.",
      incompleteEvidenceAction: "Recommend a bounded experiment before adoption."
    },
    contentDefaults: {
      outputTypes: ["article", "whiteboard-specification"],
      defaultAudience: "Technical practitioners",
      postWordRange: { minimum: 150, maximum: 250 },
      hashtagCount: 6,
      timezone: "America/New_York",
      includeDiscussionQuestion: true
    },
    visualPreferences: {
      format: "landscape",
      aesthetic: "Hand-drawn workshop whiteboard",
      useDominantMetaphor: true,
      maximumZones: 5,
      palette: { focus: "purple", positive: "dark green", risk: "red", neutral: "black" },
      requireAltText: true
    },
    safety: {
      treatSourcesAsUntrusted: true,
      excludeConfidentialContent: true,
      externalPublicationRequiresApproval: true,
      requireAttribution: true,
      additionalBoundaries: []
    },
    ...overrides
  };
}

test("User Personalization is missing until an approved valid profile is applied", async () => {
  const project = await mkdtemp(path.join(os.tmpdir(), "pso-user-personalization-"));
  try {
    const missing = run(["status", "--project", project]);
    assert.equal(missing.status, 0, missing.stderr);
    assert.equal(JSON.parse(missing.stdout).status, "missing");

    const candidateDirectory = path.join(project, ".skills-orchestrator");
    await mkdir(candidateDirectory, { recursive: true });
    await writeFile(path.join(project, ".gitignore"), ".skills-orchestrator/\n");
    await writeFile(path.join(candidateDirectory, "candidate.json"), `${JSON.stringify(validProfile(), null, 2)}\n`);

    const validation = run(["validate", "--project", project, "--input", ".skills-orchestrator/candidate.json"]);
    assert.equal(validation.status, 0, validation.stderr);
    assert.equal(JSON.parse(validation.stdout).status, "valid");

    const utcProfile = validProfile();
    utcProfile.contentDefaults.timezone = "UTC";
    await writeFile(path.join(candidateDirectory, "utc.json"), `${JSON.stringify(utcProfile, null, 2)}\n`);
    const utcValidation = run(["validate", "--project", project, "--input", ".skills-orchestrator/utc.json"]);
    assert.equal(utcValidation.status, 0, utcValidation.stderr);

    const unapproved = run(["apply", "--project", project, "--input", ".skills-orchestrator/candidate.json"]);
    assert.notEqual(unapproved.status, 0);
    assert.match(unapproved.stderr, /explicit --approve/);

    const applied = run(["apply", "--project", project, "--input", ".skills-orchestrator/candidate.json", "--approve"]);
    assert.equal(applied.status, 0, applied.stderr);
    const saved = JSON.parse(await readFile(path.join(candidateDirectory, "user-personalization.json"), "utf8"));
    assert.equal(saved.attribution.publicLabel, "Platform Guide");
    const present = run(["status", "--project", project]);
    assert.equal(JSON.parse(present.stdout).status, "valid");
  } finally {
    await rm(project, { recursive: true, force: true });
  }
});

test("User Personalization rejects unknown fields and sensitive-looking content", async () => {
  const project = await mkdtemp(path.join(os.tmpdir(), "pso-user-personalization-invalid-"));
  try {
    await mkdir(path.join(project, ".skills-orchestrator"), { recursive: true });
    await writeFile(path.join(project, ".gitignore"), ".skills-orchestrator/\n");
    const unknown = validProfile({ unexpected: true });
    await writeFile(path.join(project, ".skills-orchestrator", "unknown.json"), JSON.stringify(unknown));
    const unknownResult = run(["validate", "--project", project, "--input", ".skills-orchestrator/unknown.json"]);
    assert.notEqual(unknownResult.status, 0);
    assert.match(unknownResult.stderr, /Unknown profile field/);

    const sensitive = validProfile();
    sensitive.communication.signatureLines = ["api_key=abcdefghijklmnopqrstuvwxyz123456"];
    await writeFile(path.join(project, ".skills-orchestrator", "sensitive.json"), JSON.stringify(sensitive));
    const sensitiveResult = run(["validate", "--project", project, "--input", ".skills-orchestrator/sensitive.json"]);
    assert.notEqual(sensitiveResult.status, 0);
    assert.match(sensitiveResult.stderr, /sensitive-looking content/);
  } finally {
    await rm(project, { recursive: true, force: true });
  }
});

test("User Personalization refuses persistence when local state is not ignored", async () => {
  const project = await mkdtemp(path.join(os.tmpdir(), "pso-user-personalization-tracked-"));
  try {
    await mkdir(path.join(project, ".skills-orchestrator"), { recursive: true });
    await writeFile(path.join(project, ".skills-orchestrator", "candidate.json"), `${JSON.stringify(validProfile(), null, 2)}\n`);
    const result = run(["apply", "--project", project, "--input", ".skills-orchestrator/candidate.json", "--approve"]);
    assert.notEqual(result.status, 0);
    assert.match(result.stderr, /\.gitignore must ignore \.skills-orchestrator/);
  } finally {
    await rm(project, { recursive: true, force: true });
  }
});

test("User Personalization source is generic and exposes the full interview", async () => {
  const skill = await readFile(path.join(root, ".github", "skills", "user-personalization", "SKILL.md"), "utf8");
  const questionnaire = await readFile(path.join(root, ".github", "skills", "user-personalization", "references", "personalization-questionnaire.md"), "utf8");
  const schema = JSON.parse(await readFile(path.join(root, "schemas", "user-personalization.schema.json"), "utf8"));
  assert.doesNotMatch(`${skill}\n${questionnaire}`, /\btadd\b/i);
  assert.equal((questionnaire.match(/^\d+\./gm) ?? []).length, 31);
  assert.equal(schema.additionalProperties, false);
  assert.equal(schema.properties.safety.properties.treatSourcesAsUntrusted.const, true);
  assert.equal(schema.properties.visualPreferences.properties.requireAltText.const, true);
});