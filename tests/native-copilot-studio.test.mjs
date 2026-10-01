import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { spawnSync } from "node:child_process";
import { existsSync } from "node:fs";
import { cp, mkdir, mkdtemp, readFile, readdir, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import * as runtime from "../pso.mjs";

const root = path.resolve(import.meta.dirname, "..");
const guideRelative = ".github/instructions/copilot-studio.instructions.md";
const guideScope = "copilot-studio/**,**/*.mcs.yml,**/*.mcs.yaml,scripts/*studio*.ts,tests/studio-*.test.ts";
const guideFile = path.join(root, guideRelative);
const run = (args, cwd = root) => spawnSync(process.execPath, [path.join(root, "pso.mjs"), ...args], { cwd, encoding: "utf8" });
const sha256 = (bytes) => createHash("sha256").update(bytes).digest("hex");

test("native and compatibility schemas keep composition keywords at schema nodes", async () => {
  function check(node, label) {
    if (typeof node === "boolean") return;
    assert.ok(node && typeof node === "object" && !Array.isArray(node), `${label} must be an object or boolean schema`);
    for (const name of ["properties", "patternProperties", "$defs", "definitions", "dependentSchemas"]) {
      for (const [key, child] of Object.entries(node[name] ?? {})) check(child, `${label}.${name}.${key}`);
    }
    for (const name of ["allOf", "anyOf", "oneOf", "prefixItems"]) {
      if (node[name] === undefined) continue;
      assert.ok(Array.isArray(node[name]) && node[name].length, `${label}.${name} must contain schemas`);
      node[name].forEach((child, index) => check(child, `${label}.${name}[${index}]`));
    }
    for (const name of ["if", "then", "else", "not", "items", "contains", "additionalProperties", "unevaluatedProperties", "propertyNames"]) {
      if (node[name] !== undefined) check(node[name], `${label}.${name}`);
    }
    if (node.required !== undefined) assert.ok(Array.isArray(node.required) && node.required.every((key) => typeof key === "string"), `${label}.required must be field names`);
  }
  for (const name of [
    "project-blueprint", "agent-blueprint", "agent-builder-plan", "agent-builder-result", "copilot-studio-handoff",
    "agent-deployment-request", "agent-deployment-plan", "agent-deployment-result", "agent-deployment-state"
  ]) {
    check(JSON.parse(await readFile(path.join(root, "schemas", `${name}.schema.json`), "utf8")), name);
  }
});

test("native Studio routing resolves explicit operations without reinterpreting other Copilot runtimes", () => {
  assert.equal(typeof runtime.classifyNativeStudioIntent, "function");
  for (const [intent, operation] of [
    ["Create a native Copilot Studio agent", "create"],
    ["Update an existing Copilot Studio agent", "update"],
    ["Import a solution for Copilot Studio", "import"],
    ["Evaluate the native Copilot Studio agent", "evaluate"],
    ["Troubleshoot a Copilot Studio agent", "troubleshoot"],
    ["Publish an agent to Microsoft Copilot Studio", "publish"]
  ]) {
    const route = runtime.classifyNativeStudioIntent(intent);
    assert.equal(route.runtime, "native-copilot-studio");
    assert.ok(route.operations.includes(operation));
  }
  for (const intent of ["Build a web app", "Build a Foundry agent", "Create a GitHub Copilot custom agent", "Build a Copilot SDK application"]) {
    assert.equal(runtime.classifyNativeStudioIntent(intent), null, intent);
  }
  assert.equal(runtime.classifyNativeStudioIntent("Push to Copilot").status, "clarification-required");
  assert.equal(runtime.classifyNativeStudioIntent("Deploy to Copilot Studio").status, "clarification-required");
  assert.equal(runtime.classifyNativeStudioIntent("Create and deploy to Copilot Studio").status, "clarification-required");
  assert.equal(runtime.classifyNativeStudioIntent("Update native Copilot Studio but never publish").status, "clarification-required");
});

test("native instructions preserve narrow frontmatter and have one synchronized template source", async () => {
  assert.equal(existsSync(guideFile), true, "the canonical scoped instruction must exist in the main repository");
  const source = await readFile(guideFile, "utf8");
  assert.match(source, /^---\r?\n/);
  assert.match(source, /^description: ".+"$/m);
  assert.ok(source.includes(`applyTo: "${guideScope}"`));
  assert.doesNotMatch(source, /^applyTo: "\*\*"$/m);
  const template = await readFile(path.join(root, "templates", "project", guideRelative), "utf8");
  assert.equal(template, source, "the distributable guide is an exact generated mirror, not a separately authored workflow");
  const manifest = JSON.parse(await readFile(path.join(root, "templates", "scaffold-manifest.json"), "utf8"));
  const entry = manifest.templates.find((item) => item.path === guideRelative);
  assert.deepEqual(entry.requires, ["copilot-studio"]);
  assert.equal(entry.applyTo, guideScope);
  assert.equal(entry.mandatory, true);
});

test("guide loading fails closed before native preparation when missing, broad or malformed", async () => {
  assert.equal(typeof runtime.loadNativeStudioInstructions, "function");
  const project = await mkdtemp(path.join(os.tmpdir(), "pso-studio-guide-"));
  try {
    await assert.rejects(runtime.loadNativeStudioInstructions(project), /instruction.*missing/i);
    await mkdir(path.join(project, ".github", "instructions"), { recursive: true });
    const file = path.join(project, guideRelative);
    const source = await readFile(guideFile, "utf8");
    await writeFile(file, source.replace(guideScope, "**"));
    await assert.rejects(runtime.loadNativeStudioInstructions(project), /applyTo|scope/);
    await writeFile(file, source.replace(/^description:.*\r?\n/m, ""));
    await assert.rejects(runtime.loadNativeStudioInstructions(project), /description/);
    await writeFile(file, source);
    const result = await runtime.loadNativeStudioInstructions(project);
    assert.equal(result.path, guideRelative);
    assert.equal(result.sha256, sha256(source));
    assert.equal(result.applyTo, guideScope);
    assert.equal(existsSync(path.join(project, "reports")), false);
  } finally {
    await rm(project, { recursive: true, force: true });
  }
});

test("the actual create-project command refuses absent or broadened native instructions before any scaffold writes", async () => {
  const parent = await mkdtemp(path.join(os.tmpdir(), "pso-studio-before-scaffold-"));
  try {
    const source = path.join(parent, "minimal-framework");
    await mkdir(source);
    await cp(path.join(root, "pso.mjs"), path.join(source, "pso.mjs"));
    const invoke = () => spawnSync(process.execPath, [path.join(source, "pso.mjs"), "create-project", "--name", "Must Not Exist", "--destination", parent, "--stack", "copilot-studio", "--accept-risk"], { encoding: "utf8" });
    const missing = invoke();
    assert.notEqual(missing.status, 0);
    assert.match(missing.stderr, /instructions are missing/);
    const templateDirectory = path.join(source, "templates", "project", ".github", "instructions");
    await mkdir(templateDirectory, { recursive: true });
    await writeFile(path.join(templateDirectory, "copilot-studio.instructions.md"), (await readFile(guideFile, "utf8")).replace(guideScope, "**"));
    const broad = invoke();
    assert.notEqual(broad.status, 0);
    assert.match(broad.stderr, /applyTo scope/);
    assert.deepEqual(await readdir(parent), ["minimal-framework"]);
  } finally {
    await rm(parent, { recursive: true, force: true });
  }
});

test("new native projects inherit the guide independently and never acquire an Azure app scaffold", async () => {
  const parent = await mkdtemp(path.join(os.tmpdir(), "pso-studio-project-"));
  try {
    const created = run(["create-project", "--name", "Native Studio", "--destination", parent, "--stack", "copilot-studio", "--intent", "Create a native Copilot Studio agent", "--accept-risk"]);
    assert.equal(created.status, 0, created.stderr);
    const project = path.join(parent, "native-studio");
    const guide = await readFile(path.join(project, guideRelative), "utf8");
    assert.equal(guide, await readFile(guideFile, "utf8"));
    const instructions = await readFile(path.join(project, ".github", "copilot-instructions.md"), "utf8");
    assert.match(instructions, /native Copilot Studio/);
    assert.ok(instructions.includes(guideRelative));
    assert.equal(existsSync(path.join(project, "infra")), false);
    assert.equal(existsSync(path.join(project, ".azure", "environment.json")), false);
    assert.equal(existsSync(path.join(project, ".skills-orchestrator", "live-chat")), false);
    const blueprint = JSON.parse(await readFile(path.join(project, "docs", "PROJECT-BLUEPRINT.json"), "utf8"));
    assert.equal(blueprint.schemaVersion, "1.1.0");
    assert.equal(blueprint.project.type, "copilot-studio");
    assert.equal(blueprint.stack.runtime, "native-copilot-studio");
    assert.equal(blueprint.delivery.target, "power-platform");
    assert.equal(blueprint.delivery.cloud, undefined);
    assert.match(blueprint.assumptions.join("\n"), /not.*(?:implemented|published|verified)/i);
    assert.doesNotMatch(guide, /C:[\\/](?:repos|Users)[\\/]/i);
    const inspection = await runtime.loadNativeStudioInstructions(project);
    assert.equal(inspection.sha256, sha256(guide));

    const ordinary = run(["create-project", "--name", "Ordinary App", "--destination", parent, "--stack", "javascript", "--accept-risk"]);
    assert.equal(ordinary.status, 0, ordinary.stderr);
    const ordinaryRoot = path.join(parent, "ordinary-app");
    assert.equal(existsSync(path.join(ordinaryRoot, guideRelative)), false);
    assert.equal(existsSync(path.join(ordinaryRoot, "infra", "main.bicep")), true);
    assert.equal(JSON.parse(await readFile(path.join(ordinaryRoot, "docs", "PROJECT-BLUEPRINT.json"), "utf8")).schemaVersion, "1.0.0");
  } finally {
    await rm(parent, { recursive: true, force: true });
  }
});

test("a generated native project builds and applies real native source through the existing pso entry point", async () => {
  const parent = await mkdtemp(path.join(os.tmpdir(), "pso-studio-end-to-end-"));
  try {
    const created = run(["create-project", "--name", "Native CLI", "--destination", parent, "--stack", "copilot-studio", "--accept-risk"]);
    assert.equal(created.status, 0, created.stderr);
    const project = path.join(parent, "native-cli");
    const guide = await readFile(path.join(project, guideRelative), "utf8");
    const topic = "kind: AdaptiveDialog\nmodelDescription: Respond to a greeting without tools or persistent state.\nbeginDialog:\n  kind: OnRecognizedIntent\n  id: greeting\n  intent:\n    triggerQueries:\n      - hello reviewer\n  actions:\n    - kind: SendActivity\n      id: sendGreeting\n      activity: Hello from the native reviewer.\ninputType: {}\noutputType: {}\n";
    const metadata = "mcs.metadata:\n  componentName: Native Reviewer\n  description: A bounded native greeting without verified remote capabilities.\nkind: GptComponentMetadata\ninstructions: |-\n  Use the configured native greeting topic.\n  Do not claim tools, persistence or channel readiness.\n";
    await mkdir(path.join(project, "authoring"));
    await writeFile(path.join(project, "authoring", "greeting.mcs.yml"), topic);
    const spec = {
      schemaVersion: "1.0.0", runtime: "native-copilot-studio", intent: { agent: "new", operation: "prepare" },
      agent: { id: "native-reviewer", name: "Native Reviewer", schemaName: "pso_nativeReviewer", publisherPrefix: "pso" },
      target: { cloud: "unknown", solutionUniqueName: null },
      security: { authentication: "microsoft-single-tenant", audience: "private", channels: ["teams"], toolIdentity: "invoker", requirements: ["Preserve required user authentication."] },
      tooling: { pacVersion: "2.12.2" },
      source: { directory: "copilot-studio/native-reviewer", files: [{ path: "authoring/greeting.mcs.yml", target: "topics/greeting.mcs.yml" }] },
      capabilities: [{
        id: "greeting", scope: "required", description: "Respond to a native greeting.", sourcePaths: ["topics/greeting.mcs.yml"],
        acceptanceCriteria: ["A fresh intended-channel conversation receives the native greeting."], persistence: { mode: "none", operations: [] }
      }]
    };
    await writeFile(path.join(project, "native-spec.json"), JSON.stringify(spec));
    const fake = path.join(project, "fake-pac.cjs");
    const log = path.join(project, "pac-operations.jsonl");
    await writeFile(fake, `const fs=require("node:fs"),path=require("node:path");
const args=process.argv.slice(2);
fs.appendFileSync(process.env.PSO_FAKE_PAC_LOG,JSON.stringify(args)+"\\n");
if(args.includes("--environment")||["auth","env","solution"].includes(args[0])) process.exit(98);
if(args[0]==="--version"){console.log("Microsoft PowerPlatform CLI Version: 2.12.2");process.exit(0);}
if(args.join(" ")==="copilot init help"){console.log("--name --publisher-prefix --schema-name --project-dir [--environment]");process.exit(0);}
if(args[0]!=="copilot"||args[1]!=="init") process.exit(97);
const destination=args[args.indexOf("--project-dir")+1];fs.mkdirSync(destination,{recursive:true});fs.writeFileSync(path.join(destination,"agent.mcs.yml"),${JSON.stringify(metadata)});
`);
    const invoke = (args) => spawnSync(process.execPath, [path.join(root, "pso.mjs"), "agent", ...args, "--project", project], {
      encoding: "utf8", env: { ...process.env, PSO_PAC_PATH: fake, PSO_FAKE_PAC_LOG: log }
    });
    const built = invoke(["build", "--type", "copilot-studio", "--native-spec", "native-spec.json", "--accept-risk", "--json"]);
    assert.equal(built.status, 0, `${built.stderr}\n${built.stdout}`);
    const blueprintPath = "reports/agent-blueprints/native-reviewer.json";
    const planPath = "reports/agent-builder-plan.json";
    const blueprint = JSON.parse(await readFile(path.join(project, blueprintPath), "utf8"));
    assert.equal(blueprint.schemaVersion, "3.0.0");
    assert.equal(blueprint.guide.sha256, sha256(guide));
    const plan = JSON.parse(await readFile(path.join(project, planPath), "utf8"));
    assert.equal(plan.schemaVersion, "2.0.0");
    assert.equal(existsSync(path.join(project, "copilot-studio", "native-reviewer")), false);
    const applied = invoke(["apply", "--blueprint", blueprintPath, "--plan", planPath, "--accept-risk", "--json"]);
    assert.equal(applied.status, 0, `${applied.stderr}\n${applied.stdout}`);
    const handoff = JSON.parse(await readFile(path.join(project, "copilot-studio", "native-reviewer", "native-handoff.json"), "utf8"));
    assert.equal(handoff.runtime, "native-copilot-studio");
    assert.equal(handoff.intent.operation, "prepare");
    assert.equal(handoff.complete, false);
    assert.notEqual(handoff.evidence.serverPublished.state, "verified");
    assert.notEqual(handoff.evidence.channelVerified.state, "verified");
    assert.equal(await readFile(path.join(project, "copilot-studio", "native-reviewer", "topics", "greeting.mcs.yml"), "utf8"), topic);
    assert.equal(existsSync(path.join(project, ".github", "agents", "native-reviewer.agent.md")), false);
    assert.equal(existsSync(path.join(project, ".azure", "environment.json")), false);
    const validation = invoke(["validate", "--blueprint", blueprintPath, "--json"]);
    assert.equal(validation.status, 0, validation.stderr);
    const calls = (await readFile(log, "utf8")).trim().split(/\r?\n/).map((line) => JSON.parse(line));
    assert.ok(calls.some((args) => args[0] === "copilot" && args[1] === "init" && args[2] !== "help"));
    assert.ok(calls.every((args) => args[0] === "--version" || args[0] === "copilot" && args[1] === "init"));
    assert.ok(calls.every((args) => !args.includes("--environment")));
    assert.equal(await readFile(path.join(project, guideRelative), "utf8"), guide);
  } finally {
    await rm(parent, { recursive: true, force: true });
  }
});

test("native adoption preserves an existing instruction conflict even when templates are forced", async () => {
  const project = await mkdtemp(path.join(os.tmpdir(), "pso-studio-adopt-"));
  try {
    await mkdir(path.join(project, ".github", "instructions"), { recursive: true });
    await writeFile(path.join(project, "agent.mcs.yml"), "kind: GptComponentMetadata\ninstructions: Review local source.\n");
    const existing = "---\ndescription: Project-owned Studio controls\napplyTo: \"copilot-studio/**\"\n---\nPreserve the user's rules.\n";
    await writeFile(path.join(project, guideRelative), existing);
    const planned = run(["adopt", "--project", project, "--stack", "copilot-studio", "--force-templates", "--json"]);
    assert.equal(planned.status, 0, planned.stderr);
    const plan = JSON.parse(planned.stdout);
    assert.ok(plan.actions.some((action) => action.path === guideRelative && action.action === "conflict"));
    const applied = run(["adopt", "--project", project, "--stack", "copilot-studio", "--force-templates", "--apply", "--accept-risk"]);
    assert.notEqual(applied.status, 0);
    assert.equal(await readFile(path.join(project, guideRelative), "utf8"), existing);
    assert.equal(existsSync(path.join(project, "project-orchestrator.json")), false);
    await rm(path.join(project, guideRelative));
    const accepted = run(["adopt", "--project", project, "--stack", "copilot-studio", "--apply", "--accept-risk"]);
    assert.equal(accepted.status, 0, accepted.stderr);
    assert.equal(await readFile(path.join(project, guideRelative), "utf8"), await readFile(guideFile, "utf8"));
    assert.equal(existsSync(path.join(project, ".azure", "environment.json")), false);
  } finally {
    await rm(project, { recursive: true, force: true });
  }
});

test("native workflow planning binds the loaded instruction before its first native owner step", async () => {
  const project = await mkdtemp(path.join(os.tmpdir(), "pso-studio-route-"));
  try {
    const missing = run(["plan", "--root", project, "--intent", "Create a native Copilot Studio agent"]);
    assert.notEqual(missing.status, 0);
    assert.equal(existsSync(path.join(project, "reports")), false, "missing guide must fail before plan/state mutation");
    const ambiguous = run(["plan", "--root", project, "--intent", "Push to Copilot"]);
    assert.notEqual(ambiguous.status, 0);
    assert.match(ambiguous.stderr, /destination/i);
    assert.deepEqual(await readdir(project), []);
    await mkdir(path.join(project, ".github"), { recursive: true });
    await cp(path.join(root, ".github", "skills"), path.join(project, ".github", "skills"), { recursive: true });
    await mkdir(path.join(project, ".github", "instructions"));
    await cp(guideFile, path.join(project, guideRelative));
    const planned = run(["plan", "--root", project, "--intent", "Create a native Copilot Studio agent"]);
    assert.equal(planned.status, 0, planned.stderr);
    const plan = JSON.parse(await readFile(path.join(project, "reports", "workflow-plan.json"), "utf8"));
    assert.ok(plan.steps[0].inputs.includes(guideRelative));
    assert.ok(plan.steps[0].inputs.includes(`sha256:${sha256(await readFile(guideFile))}`));
    assert.ok(plan.steps.some((step) => step.owner.id === "agent-builder"));
    assert.equal(plan.steps.some((step) => step.owner.id === "agent-deployment"), false);
    const delivery = run(["plan", "--root", project, "--intent", "Import then publish a Copilot Studio agent"]);
    assert.equal(delivery.status, 0, delivery.stderr);
    const deliveryPlan = JSON.parse(await readFile(path.join(project, "reports", "workflow-plan.json"), "utf8"));
    const nativeSteps = deliveryPlan.steps.filter((step) => step.owner.id === "agent-deployment");
    assert.equal(nativeSteps.length, 2, "import and publication need separate operation steps");
    assert.deepEqual(nativeSteps.map((step) => step.approvalClasses), [["external"], ["external", "publication"]]);
    assert.ok(nativeSteps[1].prerequisites.includes(nativeSteps[0].id));
  } finally {
    await rm(project, { recursive: true, force: true });
  }
});

test("older managed instructions can acquire native routing without weakening deletion or conflict checks", async () => {
  const parent = await mkdtemp(path.join(os.tmpdir(), "pso-studio-routing-update-"));
  try {
    const created = run(["create-project", "--name", "Old Routing", "--destination", parent, "--accept-risk"]);
    assert.equal(created.status, 0, created.stderr);
    const project = path.join(parent, "old-routing");
    const file = path.join(project, "AGENTS.md");
    const current = await readFile(file, "utf8");
    const older = current.replace(/<!-- pso:begin id=native-studio-routing version=1 -->[\s\S]*?<!-- pso:end id=native-studio-routing -->\r?\n?/u, "");
    await writeFile(file, older);
    const lockFile = path.join(project, "project-orchestrator.lock.json");
    const lock = JSON.parse(await readFile(lockFile, "utf8"));
    const oldRegions = [...older.matchAll(/<!-- pso:begin id=[a-z-]+ version=\d+ -->[\s\S]*?<!-- pso:end id=[a-z-]+ -->/g)].map((match) => match[0]).join("\n");
    lock.entries.find((entry) => entry.path === "AGENTS.md").normalizedBaseDigest = runtime.digestManagedBuffer(Buffer.from(oldRegions), { kind: "text" });
    await writeFile(lockFile, JSON.stringify(lock));
    const planned = await runtime.buildUpdatePlan(project, "all");
    const asset = planned.assets.find((item) => item.path === "AGENTS.md");
    assert.equal(asset.classification, "upstream-only");
    assert.equal(asset.proposedAction, "replace");
    assert.equal(await readFile(file, "utf8"), older, "planning must not rewrite existing instructions");

    await writeFile(file, older.replace("Require approval", "Require independent approval"));
    const changed = await runtime.buildUpdatePlan(project, "all");
    assert.equal(changed.canApply, false, "a changed old managed baseline still requires explicit resolution");
  } finally {
    await rm(parent, { recursive: true, force: true });
  }
});

test("improved evaluation after multiple changes cannot manufacture a uniquely proven cause", async () => {
  const { assessEvaluationRun } = await import("../.github/skills/agent-deployment/scripts/providers/studio-evidence.mjs");
  const target = {
    cloud: "AzureCloud", tenantId: "00000000-0000-0000-0000-000000000001",
    environmentId: "00000000-0000-0000-0000-000000000002",
    dataverseUrl: "https://fixture.crm.dynamics.com", botId: "00000000-0000-0000-0000-000000000003"
  };
  const spec = {
    target, testSetId: "00000000-0000-0000-0000-000000000004", testSetSha256: "a".repeat(64),
    definitionSha256: "b".repeat(64), version: { kind: "draft", id: "draft-one" },
    requiredToolBindings: [], body: { evaluationRunName: "Stable fixture", mcsConnectionId: "profile-one", runOnPublishedBot: false, toolsConnections: [] },
    cases: [{ id: "greeting", expectedSubstring: "Ready to help", requiresSideEffect: false }]
  };
  const response = (bound, text) => ({
    runId: "00000000-0000-0000-0000-000000000005", state: "Completed", executionState: "Completed",
    target: bound.target, testSetId: bound.testSetId, testSetSha256: bound.testSetSha256,
    definitionSha256: bound.definitionSha256, version: bound.version,
    mcsConnectionId: bound.body.mcsConnectionId, toolsConnections: bound.requiredToolBindings,
    cases: [{ id: "greeting", responseText: text, graderResult: "Pass", quality: "Relevant" }]
  });
  assert.equal(assessEvaluationRun(spec, response(spec, "Let's get you connected first")).status, "failed");
  const changed = { ...spec, definitionSha256: "c".repeat(64), body: { ...spec.body, mcsConnectionId: "profile-two" } };
  const improved = assessEvaluationRun(changed, response(changed, "Ready to help with the requested native workflow."));
  assert.equal(improved.status, "verified");
  assert.deepEqual(Object.keys(improved).sort(), ["code", "evidenceSha256", "status"], "case verification cannot add causal attribution");
  const guide = await readFile(guideFile, "utf8");
  assert.match(guide, /report improvement as correlation with explicit limitations, not a uniquely proven root cause/);
  assert.match(guide, /Per-run evidence validation is not automated causal diagnosis/);
  assert.equal(await readFile(path.join(root, "templates", "project", guideRelative), "utf8"), guide);
});
