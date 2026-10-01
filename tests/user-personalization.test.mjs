import assert from "node:assert/strict";
import { mkdtemp, mkdir, readFile, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { spawnSync } from "node:child_process";
import test from "node:test";
import { existsSync } from "node:fs";
import { randomBytes } from "node:crypto";

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

test("profile privacy follows effective ignore rules, index tracking and transaction paths", async (context) => {
  for (const mode of ["non-git-control", "negation", "nested-negation", "profile-only", "profile-and-lock-only", "tracked", "tracked-backup"]) {
    await context.test(mode, async () => {
      const project = await mkdtemp(path.join(os.tmpdir(), "pso-profile-ignore-"));
      try {
        const privateDirectory = path.join(project, ".skills-orchestrator");
        await mkdir(privateDirectory);
        await writeFile(path.join(privateDirectory, "candidate.json"), JSON.stringify(validProfile()));
        const profile = path.join(privateDirectory, "user-personalization.json");
        const ignored = mode === "profile-only" ? ".skills-orchestrator/user-personalization.json\n"
          : mode === "profile-and-lock-only" ? ".skills-orchestrator/user-personalization.json\n.skills-orchestrator/user-personalization.lock\n"
          : mode === "negation" ? ".skills-orchestrator/\n!.skills-orchestrator/\n!.skills-orchestrator/user-personalization.json\n"
          : mode === "nested-negation" ? ".skills-orchestrator/*\n" : ".skills-orchestrator/\n";
        await writeFile(path.join(project, ".gitignore"), ignored);
        if (mode === "nested-negation") await writeFile(path.join(privateDirectory, ".gitignore"), "!user-personalization.json\n");
        if (mode === "tracked" || mode === "tracked-backup") {
          await writeFile(profile, JSON.stringify(validProfile()));
          const trackedPath = mode === "tracked" ? ".skills-orchestrator/user-personalization.json" : ".skills-orchestrator/user-personalization.json.earlier.bak";
          if (mode === "tracked-backup") await writeFile(path.join(project, trackedPath), JSON.stringify(validProfile()));
          for (const args of [["init", "--quiet"], ["add", "--force", "--", trackedPath]]) {
            const result = spawnSync("git", args, { cwd: project, encoding: "utf8", timeout: 30000 });
            assert.equal(result.status, 0, "Isolated Git fixture setup must succeed");
          }
        }
        const before = existsSync(profile) ? await readFile(profile) : null;
        const result = run(["apply", "--project", project, "--input", ".skills-orchestrator/candidate.json", "--approve"]);
        if (mode === "non-git-control") {
          assert.equal(result.status, 0, result.stderr);
          assert.ok(existsSync(profile));
          assert.equal(existsSync(path.join(project, ".git")), false, "Do not initialize the target repository to check its privacy");
        } else {
          assert.notEqual(result.status, 0, `${mode} must block profile persistence`);
          assert.match(result.stderr, /ignored|tracked/);
          if (before) assert.deepEqual(await readFile(profile), before);
          else assert.equal(existsSync(profile), false);
        }
      } finally {
        await rm(project, { recursive: true, force: true });
      }
    });
  }
});

test("rejected private inputs never appear in CLI or status diagnostics", async () => {
  const project = await mkdtemp(path.join(os.tmpdir(), "pso-profile-diagnostics-"));
  try {
    await mkdir(path.join(project, ".skills-orchestrator"));
    await writeFile(path.join(project, ".gitignore"), ".skills-orchestrator/\n");
    const canary = `api_key=${randomBytes(24).toString("hex")}`;
    const fragment = canary.slice(0, 14);
    const invalidEnum = validProfile();
    invalidEnum.communication.preferredPatterns = [canary];
    const invalidKey = validProfile({ [canary]: true });
    for (const content of [JSON.stringify(invalidEnum), JSON.stringify(invalidKey), canary]) {
      await writeFile(path.join(project, ".skills-orchestrator", "candidate.json"), content);
      const validation = run(["validate", "--project", project, "--input", ".skills-orchestrator/candidate.json"]);
      assert.equal(validation.status, 1);
      assert.equal(`${validation.stdout}${validation.stderr}`.includes(fragment), false, "A rejected input must not be echoed, even partially");
      await writeFile(path.join(project, ".skills-orchestrator", "user-personalization.json"), content);
      const status = run(["status", "--project", project]);
      assert.equal(status.status, 0);
      assert.equal(JSON.parse(status.stdout).status, "invalid");
      assert.equal(`${status.stdout}${status.stderr}`.includes(fragment), false, "Status diagnostics must not echo private values");
    }
  } finally {
    await rm(project, { recursive: true, force: true });
  }
});

test("profile privacy verification fails closed when Git is unavailable", async () => {
  const project = await mkdtemp(path.join(os.tmpdir(), "pso-profile-no-git-"));
  try {
    await mkdir(path.join(project, ".skills-orchestrator"));
    await writeFile(path.join(project, ".gitignore"), ".skills-orchestrator/\n");
    await writeFile(path.join(project, ".skills-orchestrator", "candidate.json"), JSON.stringify(validProfile()));
    const result = spawnSync(process.execPath, [helper, "apply", "--project", project, "--input", ".skills-orchestrator/candidate.json", "--approve"], {
      cwd: project, encoding: "utf8", env: { ...process.env, PATH: "" }, timeout: 30000
    });
    assert.equal(result.status, 1);
    assert.match(result.stderr, /Git is required/);
    assert.equal(existsSync(path.join(project, ".skills-orchestrator", "user-personalization.json")), false);
  } finally {
    await rm(project, { recursive: true, force: true });
  }
});