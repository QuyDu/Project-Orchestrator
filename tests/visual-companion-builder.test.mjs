import assert from "node:assert/strict";
import fs from "node:fs";
import { mkdtemp, mkdir, readFile, realpath, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { spawnSync } from "node:child_process";
import { createHash } from "node:crypto";
import { pathToFileURL } from "node:url";
import { deflateSync, inflateSync } from "node:zlib";
import { request as httpRequest } from "node:http";
import { once } from "node:events";
import vm from "node:vm";
import test from "node:test";
import { capabilities, createCompanionBuilder } from "../.github/skills/visual-companion-builder/scripts/visual-companion-builder.mjs";
import { decodePng, encodePng, PNG_LIMITS } from "../.github/skills/visual-companion-builder/scripts/png.mjs";

const root = path.resolve(import.meta.dirname, "..");
const skillRoot = path.join(root, ".github", "skills", "visual-companion-builder");
const helper = path.join(skillRoot, "scripts", "visual-companion-builder.mjs");
const sha = (value) => createHash("sha256").update(value).digest("hex");
const canonical = (value) => JSON.stringify(sort(value));
function sort(value) {
  if (Array.isArray(value)) return value.map(sort);
  return value && typeof value === "object"
    ? Object.fromEntries(Object.keys(value).sort().map((key) => [key, sort(value[key])]))
    : value;
}

function request(target = "local-chat-webview") {
  return {
    schemaVersion: "1.0.0",
    id: "little-lantern",
    name: "Little Lantern",
    target,
    provenance: {
      kind: "original",
      creator: "Fixture artist",
      license: "CC0-1.0",
      redistributionAllowed: true,
      rightsConfirmed: true,
      attribution: "Original pixel grids created for this fixture."
    },
    frameWidth: 3,
    frameHeight: 3,
    anchor: { x: 1, y: 3 },
    source: {
      kind: "pixel-grid",
      palette: { ".": "#00000000", o: "#FFA000FF", y: "#FFE080FF" },
      frames: [[".o.", "oyo", ".o."], [".y.", "yoy", ".y."]]
    },
    animations: {
      idle: { frames: [{ index: 0, durationMs: 200 }, { index: 1, durationMs: 300 }], loop: true },
      success: { frames: [{ index: 1, durationMs: 400 }], loop: false }
    },
    defaultState: "idle",
    altText: "An original gold pixel lantern with a transparent background.",
    accessibility: { reducedMotion: "static", staticFrame: 0 }
  };
}

async function fixture(t, target = "local-chat-webview") {
  const directory = await realpath(await mkdtemp(path.join(os.tmpdir(), "pso-companion-fixture-")));
  t.after(() => rm(directory, { recursive: true, force: true }));
  const project = path.join(directory, "target");
  const launchPadRoot = path.join(directory, "launch-pad");
  await mkdir(project);
  await mkdir(launchPadRoot);
  const value = request(target);
  await writeFile(path.join(project, "companion.json"), JSON.stringify(value));
  const builder = createCompanionBuilder({ launchPadRoot });
  const options = { project, request: "companion.json" };
  async function save(next = value) {
    await writeFile(path.join(project, "companion.json"), JSON.stringify(next));
  }
  function plan() {
    const result = builder.plan(options);
    fs.writeFileSync(path.join(project, "reviewed-plan.json"), `${JSON.stringify(result, null, 2)}\n`);
    return result;
  }
  function build() {
    return builder.build({ ...options, plan: "reviewed-plan.json", acceptRisk: true });
  }
  return { directory, project, launchPadRoot, value, builder, options, save, plan, build };
}

function assertSchema(schema, value, document = schema, location = "$") {
  if (schema.$ref) {
    const target = schema.$ref.split("/").slice(1).reduce((node, key) => node[key], document);
    assertSchema(target, value, document, location);
    return;
  }
  if (schema.const !== undefined) assert.deepEqual(value, schema.const, location);
  if (schema.enum) assert.ok(schema.enum.includes(value), location);
  if (schema.oneOf) {
    const matches = schema.oneOf.filter((item) => {
      try { assertSchema(item, value, document, location); return true; } catch { return false; }
    });
    assert.equal(matches.length, 1, `${location} must match exactly one variant`);
  }
  if (schema.allOf) schema.allOf.forEach((item) => assertSchema(item, value, document, location));
  if (schema.not) {
    let matched = true;
    try { assertSchema(schema.not, value, document, location); } catch { matched = false; }
    assert.equal(matched, false, `${location} matches a forbidden variant`);
  }
  if (schema.if) {
    let matches = true;
    try { assertSchema(schema.if, value, document, location); } catch { matches = false; }
    if (matches && schema.then) assertSchema(schema.then, value, document, location);
    if (!matches && schema.else) assertSchema(schema.else, value, document, location);
  }
  const type = schema.type;
  if (type === "object") assert.ok(value && typeof value === "object" && !Array.isArray(value), location);
  if (type === "array") assert.ok(Array.isArray(value), location);
  if (type === "string") assert.equal(typeof value, "string", location);
  if (type === "boolean") assert.equal(typeof value, "boolean", location);
  if (type === "integer") assert.ok(Number.isInteger(value), location);
  if (type === "number") assert.equal(typeof value, "number", location);
  if (typeof value === "string") {
    if (schema.pattern) assert.match(value, new RegExp(schema.pattern), location);
    if (schema.minLength !== undefined) assert.ok(value.length >= schema.minLength, location);
    if (schema.maxLength !== undefined) assert.ok(value.length <= schema.maxLength, location);
  }
  if (typeof value === "number") {
    if (schema.minimum !== undefined) assert.ok(value >= schema.minimum, location);
    if (schema.maximum !== undefined) assert.ok(value <= schema.maximum, location);
  }
  if (Array.isArray(value)) {
    if (schema.minItems !== undefined) assert.ok(value.length >= schema.minItems, location);
    if (schema.maxItems !== undefined) assert.ok(value.length <= schema.maxItems, location);
    if (schema.uniqueItems) assert.equal(new Set(value.map(canonical)).size, value.length, location);
    if (schema.items) value.forEach((item, index) => assertSchema(schema.items, item, document, `${location}[${index}]`));
  } else if (value && typeof value === "object") {
    if (schema.minProperties !== undefined) assert.ok(Object.keys(value).length >= schema.minProperties, location);
    if (schema.maxProperties !== undefined) assert.ok(Object.keys(value).length <= schema.maxProperties, location);
    for (const required of schema.required || []) assert.ok(Object.hasOwn(value, required), `${location}.${required}`);
    for (const [key, item] of Object.entries(value)) {
      const property = schema.properties?.[key];
      if (schema.propertyNames) assertSchema(schema.propertyNames, key, document, `${location} key`);
      if (property) assertSchema(property, item, document, `${location}.${key}`);
      else if (schema.additionalProperties === false) assert.fail(`${location}.${key} is not allowed`);
      else if (schema.additionalProperties && typeof schema.additionalProperties === "object") {
        assertSchema(schema.additionalProperties, item, document, `${location}.${key}`);
      }
    }
  }
}

test("companion capabilities distinguish supported local surfaces from unsupported host claims", () => {
  const result = capabilities();
  assert.equal(result.command, "capabilities");
  assert.equal(result.targets.find((entry) => entry.id === "local-chat-webview").support, "supported");
  assert.equal(result.targets.find((entry) => entry.id === "standalone-vscode-extension").artifactKind, "source-package");
  assert.equal(result.targets.find((entry) => entry.id === "vscode-pets-fork").support, "manual");
  const chatgpt = result.targets.find((entry) => entry.id === "chatgpt-animated-sprite");
  assert.equal(chatgpt.support, "unsupported");
  assert.match(chatgpt.limitations.join(" "), /does not implement.*MCP Apps UI/);
  assert.match(chatgpt.limitations.join(" "), /sprite can render inside a separately built plugin component/);
  assert.equal(result.targets.find((entry) => entry.id === "vscode-pets").support, "unsupported");
  assert.equal(result.extensionInstalled, false);
  assert.equal(result.published, false);
});

test("companion fixtures never modify or live inside the shipped framework package", async (t) => {
  const before = fs.readdirSync(skillRoot).sort();
  const f = await fixture(t);
  const relative = path.relative(root, f.directory);
  assert.ok(relative === ".." || relative.startsWith(`..${path.sep}`) || path.isAbsolute(relative), "test projects must be outside the framework source tree");
  f.plan();
  f.build();
  assert.deepEqual(fs.readdirSync(skillRoot).sort(), before, "parallel inventory must observe an unchanged skill package");
});

test("companion request, plan, build, and verify conform to complete public schemas and digest contracts", async (t) => {
  const f = await fixture(t);
  const requestSchema = JSON.parse(await readFile(path.join(root, "schemas", "visual-companion-request.schema.json")));
  const resultSchema = JSON.parse(await readFile(path.join(root, "schemas", "visual-companion-result.schema.json")));
  assertSchema(requestSchema, f.value);
  const validation = f.builder.validate(f.options);
  const plan = f.plan();
  assert.deepEqual(plan, f.plan());
  assert.equal(fs.existsSync(path.join(f.project, "artifacts")), false, "planning is read-only");
  const built = f.build();
  const verified = f.builder.verify(f.options);
  for (const result of [capabilities(), validation, plan, built, verified]) assertSchema(resultSchema, result);
  assert.equal(built.status, "built");
  assert.equal(verified.status, "verified");
  assert.equal(verified.packageDigestSha256, built.packageDigestSha256);
  assert.equal(built.packageDigestSha256, plan.expected.packageDigestSha256);
  const destination = path.join(f.project, built.destination);
  const manifest = JSON.parse(await readFile(path.join(destination, "companion-manifest.json")));
  const { packageDigestSha256, ...manifestBody } = manifest;
  assert.equal(sha(canonical(manifestBody)), packageDigestSha256);
  assert.equal(manifest.accessibility.reducedMotion, "static");
  assert.equal(manifest.accessibility.staticFrame, 0);
  assert.deepEqual(manifest.sprite.anchor, { x: 1, y: 3 });
  assert.deepEqual(manifest.animations, f.value.animations);
  for (const artifact of built.artifacts) {
    const data = await readFile(path.join(destination, artifact.path));
    assert.equal(data.length, artifact.size);
    assert.equal(sha(data), artifact.sha256);
  }
  const atlas = decodePng(await readFile(path.join(destination, "assets", "sprite.png")));
  const still = decodePng(await readFile(path.join(destination, "assets", "static.png")));
  assert.equal(atlas.width, 6);
  assert.equal(atlas.height, 3);
  assert.equal(still.width, 3);
  assert.equal(still.height, 3);
  assert.equal(still.pixels[3], 0);
  assert.deepEqual([...still.pixels.subarray(4, 8)], [255, 160, 0, 255]);
  const replay = f.build();
  assert.equal(replay.packageDigestSha256, built.packageDigestSha256);
  assert.equal(replay.unchanged, true);
});

test("companion build requires an exact reviewed plan and current explicit risk acceptance", async (t) => {
  const f = await fixture(t);
  assert.throws(() => f.builder.build({ ...f.options, acceptRisk: true }), /plan/i);
  f.plan();
  assert.throws(() => f.builder.build({ ...f.options, plan: "reviewed-plan.json" }), /accept-risk|approval/i);
  assert.equal(fs.existsSync(path.join(f.project, "artifacts")), false);
  const altered = JSON.parse(await readFile(path.join(f.project, "reviewed-plan.json")));
  altered.destination = "unrelated";
  const { planDigestSha256, ...body } = altered;
  altered.planDigestSha256 = sha(canonical(body));
  await writeFile(path.join(f.project, "reviewed-plan.json"), JSON.stringify(altered));
  assert.throws(f.build, /tamper|reviewed|plan/i);
  assert.equal(fs.existsSync(path.join(f.project, "unrelated")), false);
});

test("companion plans reject request, source, and existing target drift without overwriting", async (t) => {
  const f = await fixture(t);
  f.plan();
  f.value.name = "Changed name";
  await f.save();
  assert.throws(f.build, /drift|stale|plan/i);
  const plan = f.plan();
  const destination = path.join(f.project, plan.destination);
  await mkdir(destination, { recursive: true });
  await writeFile(path.join(destination, "keep.txt"), "do not overwrite");
  assert.throws(f.build, /drift|stale|plan/i);
  assert.equal(await readFile(path.join(destination, "keep.txt"), "utf8"), "do not overwrite");
  const reviewed = f.plan();
  assert.equal(reviewed.before.exists, true);
  assert.ok(reviewed.before.files.some((file) => file.path === "keep.txt"));
  f.build();
  assert.equal(fs.existsSync(path.join(destination, "keep.txt")), false);
});

test("companion installed integrity catches changed assets, changed metadata, extra files, and manifest rehashing", async (t) => {
  const f = await fixture(t);
  f.plan();
  const built = f.build();
  const destination = path.join(f.project, built.destination);
  const asset = path.join(destination, "assets", "static.png");
  const original = await readFile(asset);
  await writeFile(asset, Buffer.from("not an image"));
  assert.throws(() => f.builder.verify(f.options), /integrity|digest|changed/i);
  await writeFile(asset, original);
  const manifestPath = path.join(destination, "companion-manifest.json");
  const originalManifest = await readFile(manifestPath);
  const manifest = JSON.parse(originalManifest);
  manifest.name = "Changed after review";
  const { packageDigestSha256, ...body } = manifest;
  manifest.packageDigestSha256 = sha(canonical(body));
  await writeFile(manifestPath, canonical(manifest));
  assert.throws(() => f.builder.verify(f.options), /integrity|digest|changed/i);
  await writeFile(manifestPath, originalManifest);
  await writeFile(path.join(destination, "extra.js"), "unreviewed");
  assert.throws(() => f.builder.verify(f.options), /integrity|unexpected|changed/i);
});

test("licensed local PNG import verifies notice, dimensions, transparency, and raw input drift", async (t) => {
  const f = await fixture(t);
  await mkdir(path.join(f.project, "art"));
  const pixels = Buffer.alloc(6 * 3 * 4);
  pixels.set([20, 30, 40, 255], 4);
  pixels.set([50, 60, 70, 255], 4 * 4);
  await writeFile(path.join(f.project, "art", "sprite.png"), encodePng(6, 3, pixels));
  await writeFile(path.join(f.project, "art", "LICENSE.txt"), "Fixture artist grants redistribution under CC0-1.0.");
  f.value.provenance.kind = "licensed-local";
  f.value.provenance.licenseFile = "art/LICENSE.txt";
  f.value.source = { kind: "png", path: "art/sprite.png", columns: 2, frameCount: 2 };
  await f.save();
  const plan = f.plan();
  assert.ok(plan.inputs.some((input) => input.path === "art/sprite.png"));
  assert.ok(plan.inputs.some((input) => input.path === "art/LICENSE.txt"));
  const built = f.build();
  const output = path.join(f.project, built.destination);
  assert.match(await readFile(path.join(output, "ASSET-LICENSE.txt"), "utf8"), /grants redistribution/);
  assert.equal(f.builder.verify({ project: f.project, plan: "reviewed-plan.json" }).status, "verified");
  pixels[4] = 21;
  await writeFile(path.join(f.project, "art", "sprite.png"), encodePng(6, 3, pixels));
  assert.throws(f.build, /stale|drift|plan/i);
  f.value.source.columns = 1;
  await f.save();
  assert.throws(() => f.builder.validate(f.options), /dimensions|atlas/i);
});

test("companion refuses ambiguous licensing, absent notices, blank frames, unsafe timing, and out-of-range anchors", async (t) => {
  const f = await fixture(t);
  const cases = [
    [(value) => { value.provenance.redistributionAllowed = false; }, /redistribution/i],
    [(value) => { value.provenance.rightsConfirmed = false; }, /rights/i],
    [(value) => { value.provenance.license = "UNLICENSED"; }, /license/i],
    [(value) => { value.provenance.kind = "licensed-local"; }, /license|source|original/i],
    [(value) => { value.source.frames[0] = ["...", "...", "..."]; }, /visible|transparent|blank/i],
    [(value) => { value.source.frames[0] = ["ooo", "ooo", "ooo"]; }, /transparent/i],
    [(value) => { value.animations.idle.frames[0].index = 2; }, /frame|bounds/i],
    [(value) => { value.animations.idle.frames[0].durationMs = 0; }, /duration|timing/i],
    [(value) => { value.anchor.x = 4; }, /anchor/i],
    [(value) => { value.accessibility.staticFrame = 2; }, /static|frame/i],
    [(value) => { value.accessibility.reducedMotion = "animate"; }, /reducedMotion|static/i],
    [(value) => { value.altText = ""; }, /altText/i],
    [(value) => { value.defaultState = "unknown"; }, /defaultState|animation/i],
    [(value) => { value.source.frames[0][0] = ".?."; }, /palette/i]
  ];
  for (const [alter, expected] of cases) {
    const value = request();
    alter(value);
    await f.save(value);
    assert.throws(() => f.builder.validate(f.options), expected);
  }
});

test("companion rejects URL, credential, traversal, absolute, drive, control, and reserved-name input paths", async (t) => {
  const f = await fixture(t);
  for (const bad of ["../sprite.png", "/sprite.png", "C:\\sprite.png", "C:sprite.png", "\\\\host\\share.png", "https://example.invalid/a.png", "data:image/png;base64,x", "file:///x", "art/%2e%2e/a.png", "art/CON.png", "art/a.png:secret", "art/a.png ", "art/./a.png", "art//a.png"]) {
    const value = request();
    value.provenance.kind = "licensed-local";
    value.provenance.licenseFile = "LICENSE.txt";
    value.source = { kind: "png", path: bad, columns: 2, frameCount: 2 };
    await writeFile(path.join(f.project, "LICENSE.txt"), "Redistribution permitted.");
    await f.save(value);
    assert.throws(() => f.builder.validate(f.options), /path|relative|URL|unsafe|reserved/i, bad);
  }
  const value = request();
  value.apiKey = "never-store-this-value";
  await f.save(value);
  assert.throws(() => f.builder.validate(f.options), /unsupported|unknown|credential/i);
  delete value.apiKey;
  value.provenance.attribution = "Authorization: Bearer " + "x".repeat(32);
  await f.save(value);
  assert.throws(() => f.builder.validate(f.options), /credential|secret/i);
  assert.throws(() => f.builder.validate({ ...f.options, request: "../companion.json" }), /path|relative/i);
});

test("companion rejects symlinked roots, input directories, and output directories", async (t) => {
  const f = await fixture(t);
  const outside = path.join(f.directory, "other");
  await mkdir(outside);
  fs.symlinkSync(outside, path.join(f.project, "linked"), process.platform === "win32" ? "junction" : "dir");
  await writeFile(path.join(outside, "request.json"), JSON.stringify(f.value));
  assert.throws(() => f.builder.validate({ ...f.options, request: "linked/request.json" }), /symbolic|symlink|junction/i);
  const alias = path.join(f.directory, "target-alias");
  fs.symlinkSync(f.project, alias, process.platform === "win32" ? "junction" : "dir");
  assert.throws(() => f.builder.plan({ ...f.options, project: alias }), /symbolic|symlink|junction/i);
  fs.symlinkSync(outside, path.join(f.project, "artifacts"), process.platform === "win32" ? "junction" : "dir");
  assert.throws(f.plan, /symbolic|symlink|junction/i);
  assert.equal(fs.existsSync(path.join(outside, "visual-companions")), false);
});

test("real CLI refuses launch-pad output and unknown commands/flags, with precise unsupported-host diagnostics", async (t) => {
  const f = await fixture(t);
  for (const target of ["chatgpt-animated-sprite", "chatgpt", "vscode-pets"]) {
    const value = request(target);
    await f.save(value);
    assert.throws(() => f.builder.validate(f.options), target.includes("chatgpt") ? /ChatGPT.*unsupported|unsupported.*ChatGPT/i : /third.party|contribution|stock/i);
  }
  for (const args of [
    ["build", "--project", root, "--request", "companion.json", "--accept-risk", "--json"],
    ["capabilities", "--unknown", "--json"],
    ["publish", "--json"],
    ["capabilities", "--project", root, "--project", f.project, "--json"]
  ]) {
    const result = spawnSync(process.execPath, [helper, ...args], { cwd: root, encoding: "utf8" });
    assert.notEqual(result.status, 0);
    const output = JSON.parse(result.stdout);
    assert.equal(output.status, "blocked");
    assert.equal(output.extensionInstalled, false);
  }
  const response = spawnSync(process.execPath, [helper, "capabilities", "--json"], { cwd: root, encoding: "utf8" });
  assert.equal(response.status, 0, response.stderr);
  assert.equal(JSON.parse(response.stdout).status, "ready");
  for (const project of [root, skillRoot]) {
    const rejected = spawnSync(process.execPath, [helper, "validate", "--project", project, "--request", "companion.json", "--json"], { cwd: root, encoding: "utf8" });
    assert.equal(rejected.status, 1);
    assert.equal(JSON.parse(rejected.stdout).code, "launch-pad-boundary");
  }
});

test("companion help aliases and capability listing are read-only and require no project", async (t) => {
  const f = await fixture(t);
  const schema = JSON.parse(await readFile(path.join(root, "schemas", "visual-companion-result.schema.json")));
  for (const args of [[], ["help"], ["--help"], ["help", "--json"], ["build", "--help", "--json"], ["verify", "--project", "not-a-project", "--help", "--json"]]) {
    const result = spawnSync(process.execPath, [helper, ...args], { cwd: f.project, encoding: "utf8" });
    assert.equal(result.status, 0, `${args.join(" ")}: ${result.stdout}\n${result.stderr}`);
    const output = JSON.parse(result.stdout);
    assertSchema(schema, output);
    assert.equal(output.command, "help");
    assert.equal(output.status, "ready");
    assert.ok(output.commands.includes("capabilities"));
    assert.ok(output.usage.some((line) => /build.*--accept-risk/.test(line)));
    assert.deepEqual(Object.keys(output.options).sort(), ["--accept-risk", "--help", "--json", "--plan", "--project", "--request"]);
    assert.equal(output.extensionInstalled, false);
    assert.equal(output.published, false);
  }
  const capabilitiesResult = spawnSync(process.execPath, [helper, "capabilities", "--json"], { cwd: f.project, encoding: "utf8" });
  assert.equal(capabilitiesResult.status, 0);
  assertSchema(schema, JSON.parse(capabilitiesResult.stdout));
  assert.deepEqual(fs.readdirSync(f.project), ["companion.json"]);
});

test("extension scaffold uses narrow resource roots, escaped data, external nonce scripts, and no native installation claim", async (t) => {
  const f = await fixture(t, "standalone-vscode-extension");
  f.value.name = "</script><img src=x onerror=alert(1)>";
  f.value.altText = "\" autofocus onfocus=\"alert(2) <script>bad()</script>";
  await f.save();
  f.plan();
  const result = f.build();
  assert.equal(result.artifactKind, "source-package");
  assert.equal(result.extensionInstalled, false);
  assert.equal(result.published, false);
  const directory = path.join(f.project, result.destination);
  const extension = await readFile(path.join(directory, "extension.cjs"), "utf8");
  assert.match(extension, /createWebviewPanel/);
  assert.match(extension, /localResourceRoots/);
  assert.match(extension, /"assets"|'assets'/);
  assert.match(extension, /asWebviewUri/);
  assert.match(extension, /nonce/);
  assert.doesNotMatch(extension, /unsafe-inline|eval\(|onDidReceiveMessage|child_process|executeCommand/);
  const configuration = await readFile(path.join(directory, "assets", "companion-data.js"), "utf8");
  assert.doesNotMatch(configuration, /<\/script>|<img/);
  const extensionPackage = JSON.parse(await readFile(path.join(directory, "package.json")));
  assert.equal(extensionPackage.main, "./extension.cjs");
  assert.equal(extensionPackage.dependencies, undefined);
  assert.ok(result.artifacts.some((file) => file.path === ".vscode/launch.json"));
  assert.ok(result.artifacts.every((file) => !file.path.endsWith(".vsix")));
  assert.equal(f.builder.verify(f.options).status, "verified");
});

test("extension activation is executable and untrusted labels cannot substitute resource placeholders", async (t) => {
  const f = await fixture(t, "standalone-vscode-extension");
  f.value.altText = "__ASSETS__/companion-data.js __ASSETS__/companion.js __NONCE__ __CSP__ \" <img>";
  await f.save();
  f.plan();
  const result = f.build();
  const extension = await readFile(path.join(f.project, result.destination, "extension.cjs"), "utf8");
  const captured = {};
  const fakeVscode = {
    Uri: { joinPath(base, ...parts) { return { path: `${base.path}/${parts.join("/")}` }; } },
    ViewColumn: { Beside: 2 },
    commands: { registerCommand(id, callback) { captured.command = id; captured.open = callback; return { dispose() {} }; } },
    window: {
      createWebviewPanel(id, title, column, options) {
        captured.options = options;
        const panel = { webview: { cspSource: "https://local-resources.invalid", asWebviewUri(uri) { return { toString: () => `https://local-resources.invalid${uri.path}` }; } } };
        captured.panel = panel;
        return panel;
      }
    }
  };
  const context = vm.createContext({
    exports: {},
    require(name) {
      if (name === "vscode") return fakeVscode;
      if (name === "node:crypto") return { randomBytes: (size) => Buffer.alloc(size, 1) };
      throw new Error(`Unexpected module ${name}`);
    }
  });
  vm.runInContext(extension, context);
  const extensionContext = { extensionUri: { path: "/local-extension" }, subscriptions: [] };
  context.exports.activate(extensionContext);
  captured.open();
  assert.equal(captured.command, "visualCompanion.little-lantern.open");
  assert.equal(captured.options.localResourceRoots.length, 1);
  assert.equal(captured.options.localResourceRoots[0].path, "/local-extension/assets");
  const html = captured.panel.webview.html;
  const scriptSources = [...html.matchAll(/<script[^>]*\ssrc="([^"]+)"/g)].map((match) => match[1]);
  assert.deepEqual(scriptSources, [
    "https://local-resources.invalid/local-extension/assets/companion-data.js",
    "https://local-resources.invalid/local-extension/assets/companion.js"
  ]);
  assert.match(html, /alt="__ASSETS__\/companion-data.js __ASSETS__\/companion.js __NONCE__ __CSP__ &quot; &lt;img&gt;"/);
  assert.doesNotMatch(html, /unsafe-inline|<img>/);
});

test("generated preview server serves a functional loopback bundle and refuses traversal, foreign hosts, and writes", async (t) => {
  const f = await fixture(t);
  f.plan();
  const result = f.build();
  const serverPath = path.join(f.project, result.destination, "preview-server.mjs");
  const { createPreviewServer } = await import(pathToFileURL(serverPath).href);
  const server = createPreviewServer();
  server.listen(0, "127.0.0.1");
  await once(server, "listening");
  t.after(() => new Promise((resolve, reject) => server.close((error) => error ? reject(error) : resolve())));
  const port = server.address().port;
  async function response(urlPath, headers = {}, method = "GET") {
    return new Promise((resolve, reject) => {
      const request = httpRequest({ host: "127.0.0.1", port, path: urlPath, headers, method, agent: false }, (message) => {
        const chunks = [];
        message.on("data", (chunk) => chunks.push(chunk));
        message.on("end", () => resolve({ status: message.statusCode, headers: message.headers, text: Buffer.concat(chunks).toString() }));
      });
      request.on("error", reject);
      request.end();
    });
  }
  const page = await response("/");
  assert.equal(page.status, 200);
  assert.match(page.headers["content-security-policy"], /default-src 'none'/);
  assert.match(page.text, /assets\/companion.js/);
  assert.equal((await response("/assets/companion.js")).status, 200);
  assert.equal((await response("/%2e%2e/companion.json")).status, 404);
  assert.equal((await response("/", { Host: "external.invalid" })).status, 403);
  assert.equal((await response("/", { Origin: "https://external.invalid" })).status, 403);
  assert.equal((await response("/", {}, "POST")).status, 405);
  const head = await response("/", {}, "HEAD");
  assert.equal(head.status, 200);
  assert.equal(head.text, "");
});

test("VS Code Pets output requires a licensed fork and remains manual; static icons make no animated-host claim", async (t) => {
  const f = await fixture(t, "vscode-pets-fork");
  assert.throws(() => f.builder.validate(f.options), /fork|license/i);
  await writeFile(path.join(f.project, "FORK-LICENSE"), "Local fork licensed under MIT; redistribution permitted.");
  f.value.fork = { license: "MIT", licenseFile: "FORK-LICENSE", redistributionAllowed: true, rightsConfirmed: true };
  await f.save();
  f.plan();
  const handoff = f.build();
  assert.equal(handoff.status, "manual-handoff");
  assert.equal(handoff.targetSupport, "manual");
  assert.equal(handoff.artifactKind, "asset-kit");
  const guidance = await readFile(path.join(f.project, handoff.destination, "FORK-HANDOFF.md"), "utf8");
  assert.match(guidance, /no third-party.*contribution|no supported.*contribution/i);
  assert.match(guidance, /manual/i);
  assert.equal(handoff.extensionInstalled, false);
  f.value.target = "static-agent-icon";
  delete f.value.fork;
  await f.save();
  f.plan();
  const icon = f.build();
  assert.equal(icon.artifactKind, "static-icon");
  assert.equal(decodePng(await readFile(path.join(f.project, icon.destination, "icon.png"))).width, 3);
  assert.ok(icon.limitations.some((item) => /host.*support|supported.*host/i.test(item)));
});

function browserEnvironment(reducedMotion) {
  const scheduled = [];
  const listeners = {};
  class Element {
    constructor(tag) { this.tagName = tag; this.children = []; this.attributes = {}; this.hidden = false; this.textContent = ""; this.listeners = {}; }
    append(...items) { this.children.push(...items); }
    appendChild(item) { this.children.push(item); return item; }
    replaceChildren(...items) { this.children = items; }
    setAttribute(key, value) { this.attributes[key] = String(value); }
    addEventListener(key, callback) { this.listeners[key] = callback; }
    removeEventListener(key) { delete this.listeners[key]; }
    getContext() { return { clearRect() {}, drawImage(...args) { scheduled.push(["draw", ...args]); } }; }
  }
  const media = { matches: reducedMotion, addEventListener(key, callback) { listeners[`media-${key}`] = callback; }, removeEventListener(key) { delete listeners[`media-${key}`]; } };
  const document = {
    currentScript: { src: "http://127.0.0.1:1234/assets/companion.js" },
    baseURI: "http://127.0.0.1:1234/",
    hidden: false,
    createElement: (tag) => new Element(tag),
    addEventListener(key, callback) { listeners[key] = callback; },
    removeEventListener(key) { delete listeners[key]; },
    getElementById() { return null; }
  };
  const context = {
    document, URL, console, performance: { now: () => 0 },
    matchMedia: () => media,
    requestAnimationFrame(callback) { scheduled.push(["raf", callback]); return scheduled.length; },
    cancelAnimationFrame(id) { scheduled.push(["cancel", id]); },
    Image: class { set src(value) { this.value = value; this.onload?.(); } },
    addEventListener(key, callback) { listeners[key] = callback; },
    removeEventListener(key) { delete listeners[key]; }
  };
  return { context, scheduled, document, media, listeners, Element };
}

test("browser companion uses safe DOM, validates state names, pauses, disposes, and honors reduced motion/static fallback", async (t) => {
  const f = await fixture(t);
  f.value.name = "<img src=x onerror=alert(1)>";
  await f.save();
  f.plan();
  const result = f.build();
  const directory = path.join(f.project, result.destination, "assets");
  const runtime = await readFile(path.join(directory, "companion.js"), "utf8");
  const data = await readFile(path.join(directory, "companion-data.js"), "utf8");
  assert.doesNotMatch(runtime, /\.innerHTML|insertAdjacentHTML|eval\(|new Function/);
  for (const reduced of [false, true]) {
    const environment = browserEnvironment(reduced);
    const context = vm.createContext(environment.context);
    vm.runInContext(data, context);
    vm.runInContext(runtime, context);
    const host = new environment.Element("section");
    const instance = context.VisualCompanion.mount(host, context.VISUAL_COMPANION_DATA);
    assert.ok(host.children.length > 0);
    assert.equal(instance.getState(), "idle");
    if (!reduced) {
      environment.scheduled.find((entry) => entry[0] === "raf")[1](250);
      assert.equal(environment.scheduled.filter((entry) => entry[0] === "draw").at(-1)[2], 3, "timing selects the second frame");
    }
    instance.setState("success");
    assert.equal(instance.getState(), "success");
    assert.equal(environment.scheduled.filter((entry) => entry[0] === "draw").at(-1)[2], reduced ? 0 : 3);
    assert.throws(() => instance.setState("<img onerror=alert(1)>"), /state/i);
    assert.equal(environment.scheduled.some((entry) => entry[0] === "raf"), !reduced);
    const rafCount = () => environment.scheduled.filter((entry) => entry[0] === "raf").length;
    const beforeHide = rafCount();
    environment.document.hidden = true;
    environment.listeners.visibilitychange();
    assert.equal(rafCount(), beforeHide, "hidden pages stop scheduling frames");
    environment.document.hidden = false;
    environment.media.matches = true;
    environment.listeners["media-change"]();
    assert.equal(rafCount(), beforeHide, "live reduced-motion changes stop scheduling frames");
    instance.setPaused(true);
    instance.dispose();
    assert.equal(Object.keys(environment.listeners).length, 0);
  }
  f.value.animations["<svg/onload=alert(1)>"] = f.value.animations.idle;
  await f.save();
  assert.throws(() => f.builder.validate(f.options), /state|animation/i);
  const html = await readFile(path.join(f.project, result.destination, "index.html"), "utf8");
  assert.match(html, /Content-Security-Policy/);
  assert.match(html, /<noscript>/);
  assert.doesNotMatch(html, /<img src=x onerror=alert/);
});

test("companion transaction restores prior bytes after a staged install failure", async (t) => {
  const f = await fixture(t);
  f.plan();
  const first = f.build();
  const manifestPath = path.join(f.project, first.destination, "companion-manifest.json");
  const before = await readFile(manifestPath);
  f.value.name = "Revised Lantern";
  await f.save();
  f.plan();
  const injected = createCompanionBuilder({
    launchPadRoot: f.launchPadRoot,
    io: {
      ...fs,
      renameSync(from, to) {
        if (path.basename(from) === "stage") throw new Error("injected staged rename failure");
        return fs.renameSync(from, to);
      }
    }
  });
  assert.throws(() => injected.build({ ...f.options, plan: "reviewed-plan.json", acceptRisk: true }), /injected/);
  assert.deepEqual(await readFile(manifestPath), before);
  const siblings = fs.readdirSync(path.dirname(path.dirname(manifestPath)));
  assert.ok(siblings.every((name) => !name.endsWith(".transaction")));
  assert.equal(f.build().status, "built");
});

test("companion recovers an interrupted backup move only with the matching approved plan", async (t) => {
  const f = await fixture(t);
  f.plan();
  f.build();
  f.value.name = "After recovery";
  await f.save();
  f.plan();
  const crashScript = path.join(f.directory, "interrupt.mjs");
  await writeFile(crashScript, `import fs from "node:fs";
import path from "node:path";
import { createCompanionBuilder } from ${JSON.stringify(pathToFileURL(helper).href)};
const builder = createCompanionBuilder({launchPadRoot: ${JSON.stringify(f.launchPadRoot)}, io: {...fs,
  renameSync(from, to) { fs.renameSync(from, to); if (path.basename(to) === "backup") process.exit(77); }
}});
builder.build(${JSON.stringify({ ...f.options, plan: "reviewed-plan.json", acceptRisk: true })});
`);
  const interrupted = spawnSync(process.execPath, [crashScript], { cwd: f.directory, encoding: "utf8" });
  assert.equal(interrupted.status, 77, interrupted.stderr);
  assert.throws(() => f.builder.build({ ...f.options, plan: "reviewed-plan.json" }), /accept-risk|approval/i);
  const reviewed = await readFile(path.join(f.project, "reviewed-plan.json"));
  const alteredPlan = JSON.parse(reviewed);
  alteredPlan.planDigestSha256 = "0".repeat(64);
  await writeFile(path.join(f.project, "reviewed-plan.json"), JSON.stringify(alteredPlan));
  assert.throws(f.build, /plan|tamper|hash/i);
  await writeFile(path.join(f.project, "reviewed-plan.json"), reviewed);
  const recovered = f.build();
  assert.equal(recovered.recovery, "rolled-back");
  assert.equal(recovered.status, "built");
  assert.equal(f.builder.verify(f.options).status, "verified");
});

test("recovery never deletes a staged file that changed after an interrupted build", async (t) => {
  const f = await fixture(t);
  f.plan();
  f.build();
  f.value.name = "Recovery conflict";
  await f.save();
  const plan = f.plan();
  const crashScript = path.join(f.directory, "interrupt.mjs");
  await writeFile(crashScript, `import fs from "node:fs";
import path from "node:path";
import { createCompanionBuilder } from ${JSON.stringify(pathToFileURL(helper).href)};
createCompanionBuilder({launchPadRoot: ${JSON.stringify(f.launchPadRoot)}, io: {...fs,
  renameSync(from, to) { fs.renameSync(from, to); if (path.basename(to) === "backup") process.exit(78); }
}}).build(${JSON.stringify({ ...f.options, plan: "reviewed-plan.json", acceptRisk: true })});
`);
  const interrupted = spawnSync(process.execPath, [crashScript], { cwd: f.directory, encoding: "utf8" });
  assert.equal(interrupted.status, 78, interrupted.stderr);
  const transaction = path.join(f.project, path.dirname(plan.destination), ".local-chat-webview.transaction");
  const alteredStage = path.join(transaction, "stage", "README.md");
  await writeFile(alteredStage, "Operator work added during interruption; preserve this.");
  assert.throws(f.build, /changed|recovery|integrity/i);
  assert.match(await readFile(alteredStage, "utf8"), /Operator work/);
  assert.equal(fs.existsSync(path.join(transaction, "backup", "companion-manifest.json")), true);
});

test("companion replacement handles a large reviewed old package without exceeding transaction-only limits", async (t) => {
  const f = await fixture(t, "static-agent-icon");
  const destination = path.join(f.project, "artifacts", "visual-companions", f.value.id, f.value.target);
  await mkdir(destination, { recursive: true });
  for (let index = 0; index < 124; index++) await writeFile(path.join(destination, `old-${String(index).padStart(3, "0")}.txt`), "old");
  const plan = f.plan();
  assert.equal(plan.before.files.length, 124);
  assert.equal(f.build().status, "built");
  assert.equal(f.builder.verify(f.options).status, "verified");
});

test("companion active transaction owners are never fenced out or stolen", async (t) => {
  const f = await fixture(t);
  const plan = f.plan();
  const transaction = path.join(f.project, path.dirname(plan.destination), ".local-chat-webview.transaction");
  await mkdir(transaction, { recursive: true });
  const journal = { schemaVersion: "1.0.0", planDigestSha256: plan.planDigestSha256, pid: process.pid, phase: "prepared" };
  await writeFile(path.join(transaction, "journal.json"), JSON.stringify(journal));
  assert.throws(f.build, /still active|owner|lock/i);
  assert.deepEqual(JSON.parse(await readFile(path.join(transaction, "journal.json"))), journal);
  assert.equal(fs.existsSync(path.join(f.project, plan.destination)), false);
});

function pngChunk(type, data) {
  const bytes = Buffer.alloc(data.length + 12);
  bytes.writeUInt32BE(data.length);
  bytes.write(type, 4, "ascii");
  data.copy(bytes, 8);
  let crc = 0xffffffff;
  for (const byte of bytes.subarray(4, -4)) {
    crc ^= byte;
    for (let bit = 0; bit < 8; bit++) crc = (crc >>> 1) ^ ((crc & 1) ? 0xedb88320 : 0);
  }
  bytes.writeUInt32BE((crc ^ 0xffffffff) >>> 0, bytes.length - 4);
  return bytes;
}

function rawPng(width, height, scanlines, { bitDepth = 8, colorType = 6, filter = 0, interlace = 0 } = {}) {
  const header = Buffer.alloc(13);
  header.writeUInt32BE(width);
  header.writeUInt32BE(height, 4);
  header[8] = bitDepth;
  header[9] = colorType;
  header[11] = filter;
  header[12] = interlace;
  return Buffer.concat([Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]), pngChunk("IHDR", header), pngChunk("IDAT", deflateSync(scanlines)), pngChunk("IEND", Buffer.alloc(0))]);
}

test("PNG codec emits independent valid RGBA PNGs and rejects truncation, CRC errors, oversized expansion, and unsupported formats", () => {
  const pixels = Buffer.from([0, 0, 0, 0, 255, 40, 80, 255]);
  const encoded = encodePng(2, 1, pixels);
  assert.equal(encoded.readUInt32BE(16), 2);
  assert.equal(encoded.readUInt32BE(20), 1);
  const compressedSize = encoded.readUInt32BE(33);
  const raw = inflateSync(encoded.subarray(41, 41 + compressedSize));
  assert.equal(raw[0], 0);
  assert.deepEqual(raw.subarray(1), pixels);
  assert.deepEqual(decodePng(encoded).pixels, pixels);
  const corrupt = Buffer.from(encoded);
  corrupt[corrupt.length - 1] ^= 1;
  for (const invalid of [
    encoded.subarray(0, -1),
    Buffer.concat([encoded, Buffer.from("extra")]),
    corrupt,
    rawPng(2, 1, Buffer.alloc(100000)),
    rawPng(PNG_LIMITS.maxDimension + 1, 1, Buffer.alloc(1)),
    rawPng(2, 1, Buffer.alloc(9), { colorType: 2 }),
    rawPng(2, 1, Buffer.alloc(9), { bitDepth: 16 }),
    rawPng(2, 1, Buffer.alloc(9), { interlace: 1 }),
    rawPng(2, 1, Buffer.from([5, ...pixels]))
  ]) assert.throws(() => decodePng(invalid), /PNG|limit|CRC|format|filter|inflate|data|truncat|RGBA/i);
});

test("PNG decoder reconstructs all five PNG scanline filters", () => {
  const a = [10, 20, 30, 0, 40, 50, 60, 255];
  const b = [11, 21, 31, 0, 41, 51, 61, 255];
  function paeth(left, up, upperLeft) {
    const p = left + up - upperLeft;
    const choices = [left, up, upperLeft];
    const distances = choices.map((value) => Math.abs(p - value));
    return choices[distances.indexOf(Math.min(...distances))];
  }
  for (let filter = 0; filter < 5; filter++) {
    const filtered = b.map((byte, index) => {
      const left = index >= 4 ? b[index - 4] : 0;
      const up = a[index];
      const upperLeft = index >= 4 ? a[index - 4] : 0;
      const predictor = [0, left, up, Math.floor((left + up) / 2), paeth(left, up, upperLeft)][filter];
      return (byte - predictor + 256) % 256;
    });

    const image = rawPng(2, 2, Buffer.from([0, ...a, filter, ...filtered]));
    assert.deepEqual(decodePng(image).pixels, Buffer.from([...a, ...b]));
  }
});

test("PNG decoder rejects non-ASCII chunk types rather than interpreting their masked ASCII names", () => {
  const valid = encodePng(2, 1, Buffer.from([0, 0, 0, 0, 255, 255, 255, 255]));
  const image = Buffer.from(valid);
  const header = image.subarray(12, 29);
  header[0] |= 0x80;
  let crc = 0xffffffff;
  for (const byte of header) {
    crc ^= byte;
    for (let bit = 0; bit < 8; bit++) crc = (crc >>> 1) ^ ((crc & 1) ? 0xedb88320 : 0);
  }
  image.writeUInt32BE((crc ^ 0xffffffff) >>> 0, 29);
  assert.throws(() => decodePng(image), /chunk|PNG|type/i);
});
