#!/usr/bin/env node
import fs from "node:fs";
import path from "node:path";
import { createHash } from "node:crypto";
import { fileURLToPath } from "node:url";
import { decodePng, encodePng, PNG_LIMITS } from "./png.mjs";

const VERSION = "1.0.0";
const PACKAGE_ROOT = path.resolve(import.meta.dirname, "..", "..", "..", "..");
const LIMITS = Object.freeze({
  ...PNG_LIMITS,
  maxRequestBytes: 2 * 1024 * 1024,
  maxPlanBytes: 512 * 1024,
  maxNoticeBytes: 64 * 1024,
  maxFrameDimension: 256,
  maxFrames: 64,
  maxStates: 16,
  minDurationMs: 100,
  maxDurationMs: 60_000,
  maxPackageFiles: 128,
  maxPackageBytes: 32 * 1024 * 1024
});
const TARGETS = Object.freeze([
  { id: "local-chat-webview", support: "supported", artifactKind: "browser-bundle", limitations: [
    "An owned local browser surface, not an overlay or a native ChatGPT/VS Code chat extension.",
    "Embedding and state wiring into another application are explicit host integration work."
  ] },
  { id: "standalone-vscode-extension", support: "supported", artifactKind: "source-package", limitations: [
    "Working extension source for an Extension Development Host; no VSIX is generated or installed.",
    "VSIX packaging, Marketplace publication, and installation require separate tooling verification and approval."
  ] },
  { id: "vscode-pets-fork", support: "manual", artifactKind: "asset-kit", limitations: [
    "Stock VS Code Pets has no supported third-party pet contribution API.",
    "Manual licensed-fork integration and fork-specific tests are required; no stock registration or patch is applied."
  ] },
  { id: "static-agent-icon", support: "supported", artifactKind: "static-icon", limitations: [
    "Static PNG export only; upload or integration is manual and only where the host supports static icons.",
    "This does not add an animated avatar to ChatGPT or any other host."
  ] },
  { id: "chatgpt-animated-sprite", support: "unsupported", artifactKind: "none", limitations: [
    "This builder does not implement ChatGPT plugin/MCP Apps UI export. A sprite can render inside a separately built plugin component; a global ChatGPT avatar or overlay is a different, unsupported integration."
  ] },
  { id: "vscode-pets", support: "unsupported", artifactKind: "none", limitations: [
    "Stock VS Code Pets has no supported third-party pet contribution API. Use a licensed fork handoff."
  ] }
]);

function fail(message, code = "invalid-companion") {
  const error = new Error(message);
  error.code = code;
  throw error;
}
function sorted(value) {
  if (Array.isArray(value)) return value.map(sorted);
  return value && typeof value === "object"
    ? Object.fromEntries(Object.keys(value).sort().map((key) => [key, sorted(value[key])]))
    : value;
}
function canonical(value) { return JSON.stringify(sorted(value)); }
function json(value) { return `${JSON.stringify(sorted(value), null, 2)}\n`; }
function digest(value) { return createHash("sha256").update(value).digest("hex"); }
function compare(a, b) { return a < b ? -1 : a > b ? 1 : 0; }
function record(value, fields, required, label) {
  if (!value || typeof value !== "object" || Array.isArray(value)) fail(`${label} must be an object.`);
  for (const key of Object.keys(value)) if (!fields.includes(key)) fail(`${label} contains an unknown or unsupported field.`);
  for (const key of required) if (!Object.hasOwn(value, key)) fail(`${label}.${key} is required.`);
}
function text(value, maximum, label, minimum = 1) {
  if (typeof value !== "string" || value.trim().length < minimum || value.length > maximum || /[\u0000-\u001f\u007f]/u.test(value)) {
    fail(`${label} must be nonempty bounded plain text without control characters.`);
  }
  rejectCredentials(value);
  return value;
}
function integer(value, minimum, maximum, label) {
  if (!Number.isInteger(value) || value < minimum || value > maximum) fail(`${label} is outside the supported integer bounds.`);
}
function rejectCredentials(value) {
  if (typeof value === "string") {
    if (/-----BEGIN (?:[A-Z ]* )?PRIVATE KEY-----|(?:authorization\s*[:=]\s*bearer\s+\S+)|(?:\b(?:api[-_]?key|password|client[-_]?secret|access[-_]?token|refresh[-_]?token|connection[-_]?string)\s*[:=]\s*\S+)|\b(?:gh[pousr]_[A-Za-z0-9]{20,}|github_pat_[A-Za-z0-9_]{20,}|sk-[A-Za-z0-9_-]{20,})|\beyJ[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]+|https?:\/\/[^/\s]*@/i.test(value)) {
      fail("Credential or secret-like content is forbidden; supply only public asset metadata.", "credential-rejected");
    }
  } else if (value && typeof value === "object") {
    for (const item of Object.values(value)) rejectCredentials(item);
  }
}
function relative(value, label = "Path") {
  if (typeof value !== "string" || !value || value.length > 240 || path.isAbsolute(value)
      || /^[A-Za-z]:|^[\\/]|[:%?*<>|"~\u0000-\u001f\u007f]/u.test(value)) fail(`${label} must be a safe project-relative path; URLs and absolute paths are forbidden.`);
  const normalized = value.replaceAll("\\", "/");
  const segments = normalized.split("/");
  for (const segment of segments) {
    if (!segment || segment === "." || segment === ".." || !/^[A-Za-z0-9_. -]+$/.test(segment)
        || /[. ]$/.test(segment) || /^(?:con|prn|aux|nul|com[1-9]|lpt[1-9])(?:\.|$)/i.test(segment)) {
      fail(`${label} contains an unsafe or reserved path component.`);
    }
  }
  return normalized;
}
function inside(parent, candidate) {
  const rel = path.relative(parent, candidate);
  return rel === "" || (!rel.startsWith(`..${path.sep}`) && rel !== ".." && !path.isAbsolute(rel));
}
function license(value, label) {
  text(value, 100, `${label}.license`);
  if (!/^(?:CC0-1\.0|CC-BY(?:-SA)?-4\.0|MIT|Apache-2\.0|BSD-[23]-Clause|ISC|MPL-2\.0|GPL-[23]\.0-(?:only|or-later)|LGPL-(?:2\.1|3\.0)-(?:only|or-later)|LicenseRef-[A-Za-z0-9.-]+)$/.test(value)) {
    fail(`${label}.license must identify a supported redistributable license or an explicit LicenseRef with a local notice.`);
  }
}
function targetFor(id) {
  if (typeof id === "string" && /chatgpt/i.test(id)) fail("ChatGPT animated-sprite export is unsupported by this builder; use a separately implemented plugin/MCP Apps UI integration, or static-agent-icon where the host supports static icons.", "unsupported-target");
  const target = TARGETS.find((item) => item.id === id);
  if (!target) fail("Unknown visual companion target.", "unsupported-target");
  if (target.support === "unsupported") fail(target.limitations.join(" "), "unsupported-target");
  return target;
}
function envelope(command, status) {
  return { schemaVersion: VERSION, command, status, extensionInstalled: false, published: false };
}
export function capabilities() {
  return {
    ...envelope("capabilities", "ready"),
    targets: structuredClone(TARGETS),
    limits: { ...LIMITS },
    limitations: [
      "Deterministic local pixel-grid creation or licensed local PNG import only; no image model or network calls.",
      "PNG import is restricted to non-interlaced 8-bit RGBA images; metadata is stripped on canonical re-encoding.",
      "License declarations are operator attestations, not automated legal verification."
    ]
  };
}
export function help() {
  return {
    ...envelope("help", "ready"),
    commands: ["capabilities", "validate", "plan", "build", "verify", "help"],
    usage: [
      "pso companion capabilities [--json]",
      "pso companion validate --project <target> --request <relative-request.json> [--json]",
      "pso companion plan --project <target> --request <relative-request.json> [--json]",
      "pso companion build --project <target> --request <relative-request.json> --plan <relative-reviewed-plan.json> --accept-risk [--json]",
      "pso companion verify --project <target> (--request <relative-request.json> | --plan <relative-reviewed-plan.json>) [--json]",
      "pso companion help [--json] | pso companion --help"
    ],
    options: {
      "--project": "Existing target project directory. Required except for capabilities and help; never the launch pad or its descendants.",
      "--request": "Contained target-relative UTF-8 request path. Required for validate, plan, and build; optional for verify when --plan is present.",
      "--plan": "Contained target-relative saved reviewed plan. Required for build; can identify and bind the package for verify.",
      "--accept-risk": "Current explicit local build approval. Never authorizes installation, external publication, or cloud operations.",
      "--json": "Machine-readable stdout; all companion commands already emit JSON, including errors and help.",
      "--help": "Show read-only help, including after an action name, without validating inputs or requiring --project."
    },
    limitations: [
      "Capabilities and help use static local contracts only; they do not inspect a project, provision resources, or write files.",
      "Plan is read-only JSON stdout. Save it outside the generated package and review it before an explicitly approved build."
    ]
  };
}
function escaped(value) {
  return String(value).replace(/[&<>"']/g, (character) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[character]);
}
function javascriptData(value) {
  return JSON.stringify(value).replace(/[<>&\u2028\u2029]/g, (character) => `\\u${character.charCodeAt(0).toString(16).padStart(4, "0")}`);
}
const CSS = `:root { color-scheme: light dark; font-family: system-ui, sans-serif; }
body { margin: 1.5rem; color: var(--vscode-editor-foreground, CanvasText); background: var(--vscode-editor-background, Canvas); }
main { max-width: 42rem; margin: auto; }
.companion-stage { min-height: 16rem; display: grid; place-items: center; }
.companion-stage img, .companion-stage canvas { width: min(60vw, 256px); height: auto; image-rendering: pixelated; object-fit: contain; }
.companion-controls { display: flex; flex-wrap: wrap; gap: 1rem; align-items: center; }
button, select { font: inherit; padding: .5rem; }
:focus-visible { outline: 3px solid Highlight; outline-offset: 3px; }
[hidden] { display: none !important; }
@media (prefers-reduced-motion: reduce) { *, *::before, *::after { animation: none !important; transition: none !important; scroll-behavior: auto !important; } }
`;
const BROWSER_CSP = "default-src 'none'; img-src 'self'; style-src 'self'; script-src 'self'; base-uri 'none'; form-action 'none'";

function viewHtml(altText, assets = "assets/", csp = BROWSER_CSP, nonce = "") {
  return `<!doctype html>
<html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1">
<meta http-equiv="Content-Security-Policy" content="${escaped(csp)}"><title>Local visual companion</title>
<link rel="stylesheet" href="${assets}companion.css"></head>
<body><main><section id="visual-companion" aria-label="Visual companion">
<h1>Visual companion</h1><div class="companion-stage"><img src="${assets}static.png" alt="${escaped(altText)}"></div>
</section><noscript>Animation is disabled. The static image and its description remain available.</noscript></main>
<script${nonce} src="${assets}companion-data.js" defer></script><script${nonce} src="${assets}companion.js" defer></script>
</body></html>
`;
}
function serverSource() {
  return `import { createServer } from "node:http";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import path from "node:path";
const routes = new Map([
  ["/", ["index.html", "text/html; charset=utf-8"]], ["/index.html", ["index.html", "text/html; charset=utf-8"]],
  ["/assets/companion.js", ["assets/companion.js", "text/javascript; charset=utf-8"]],
  ["/assets/companion-data.js", ["assets/companion-data.js", "text/javascript; charset=utf-8"]],
  ["/assets/companion.css", ["assets/companion.css", "text/css; charset=utf-8"]],
  ["/assets/sprite.png", ["assets/sprite.png", "image/png"]], ["/assets/static.png", ["assets/static.png", "image/png"]]
]);
export function createPreviewServer() {
  return createServer((request, response) => {
    const host = request.headers.host || "";
    if (!/^(?:127\\.0\\.0\\.1|localhost):[0-9]+$/.test(host)
        || (request.headers.origin && request.headers.origin !== "http://" + host)) {
      response.writeHead(403); response.end("Loopback preview only."); return;
    }
    if (!["GET", "HEAD"].includes(request.method)) { response.writeHead(405, { Allow: "GET, HEAD" }); response.end(); return; }
    const route = routes.get(request.url);
    if (!route) { response.writeHead(404); response.end("Not found."); return; }
    try {
      const bytes = readFileSync(new URL(route[0], import.meta.url));
      response.writeHead(200, { "Content-Type": route[1], "Content-Length": bytes.length,
        "Content-Security-Policy": ${JSON.stringify(`${BROWSER_CSP}; frame-ancestors 'none'`)},
        "X-Content-Type-Options": "nosniff", "X-Frame-Options": "DENY", "Cache-Control": "no-store" });
      response.end(request.method === "HEAD" ? undefined : bytes);
    } catch { response.writeHead(500); response.end("Local asset unavailable."); }
  });
}
if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const args = process.argv.slice(2);
  const valid = args.length === 0 || (args.length === 2 && args[0] === "--port" && /^[0-9]+$/.test(args[1]));
  const port = args.length ? Number(args[1]) : 0;
  if (!valid || !Number.isInteger(port) || port < 0 || port > 65535) { console.error("Use: node preview-server.mjs [--port 0..65535]"); process.exitCode = 1; }
  else {
    const server = createPreviewServer();
    server.on("error", () => { console.error("Local preview could not start."); process.exitCode = 1; });
    server.listen(port, "127.0.0.1", () => console.log("Preview: http://127.0.0.1:" + server.address().port + "/"));
  }
}
`;
}
function extensionSource(id, altText) {
  const html = viewHtml(altText, "__ASSETS__/", "__CSP__", ' nonce="__NONCE__"');
  return `"use strict";
const vscode = require("vscode");
const crypto = require("node:crypto");
function escapeAttribute(value) {
  return String(value).replace(/[&<>"']/g, (character) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[character]);
}
function activate(context) {
  context.subscriptions.push(vscode.commands.registerCommand(${JSON.stringify(`visualCompanion.${id}.open`)}, () => {
    const assets = vscode.Uri.joinPath(context.extensionUri, "assets");
    const panel = vscode.window.createWebviewPanel("localVisualCompanion", "Visual Companion", vscode.ViewColumn.Beside, {
      enableScripts: true, localResourceRoots: [assets], retainContextWhenHidden: false
    });
    const nonce = crypto.randomBytes(24).toString("hex");
    const source = panel.webview.cspSource;
    const csp = "default-src 'none'; img-src " + source + "; style-src " + source
      + "; script-src 'nonce-" + nonce + "'; base-uri 'none'; form-action 'none'";
    let html = ${JSON.stringify(html)};
    html = html.replace('content="__CSP__"', 'content="' + escapeAttribute(csp) + '"')
      .replaceAll('nonce="__NONCE__"', 'nonce="' + nonce + '"');
    for (const name of ["companion.css", "static.png", "companion-data.js", "companion.js"]) {
      html = html.replace('"__ASSETS__/' + name + '"', '"' + escapeAttribute(panel.webview.asWebviewUri(vscode.Uri.joinPath(assets, name)).toString()) + '"');
    }
    panel.webview.html = html;
    context.subscriptions.push(panel);
  }));
}
exports.activate = activate;
exports.deactivate = function () {};
`;
}

export function createCompanionBuilder({ launchPadRoot, io = fs } = {}) {
  const explicitBoundary = launchPadRoot !== undefined;
  if (launchPadRoot === undefined) {
    launchPadRoot = frameworkAt(PACKAGE_ROOT) ? PACKAGE_ROOT : null;
  }
  function stat(file) {
    try { return io.lstatSync(file); } catch (error) { if (error.code === "ENOENT") return null; throw error; }
  }
  function noLinks(file) {
    const absolute = path.resolve(file);
    const { root } = path.parse(absolute);
    let cursor = root;
    const pieces = absolute.slice(root.length).split(path.sep).filter(Boolean);
    for (const [index, piece] of pieces.entries()) {
      cursor = path.join(cursor, piece);
      const metadata = stat(cursor);
      if (!metadata) return null;
      if (metadata.isSymbolicLink()) fail("Symbolic links and junctions are forbidden in companion paths.", "unsafe-path");
      if (index < pieces.length - 1 && !metadata.isDirectory()) fail("An ancestor path is not a directory.", "unsafe-path");
    }
    return stat(absolute);
  }
  function frameworkAt(directory) {
    const filename = path.join(directory, "package.json");
    const metadata = noLinks(filename);
    if (!metadata?.isFile() || metadata.nlink !== 1 || metadata.size > LIMITS.maxRequestBytes) return false;
    try {
      return JSON.parse(io.readFileSync(filename, "utf8")).name === "project-skills-orchestrator";
    } catch { return false; }
  }
  function projectRoot(value) {
    if (typeof value !== "string" || !value.trim()) fail("An explicit --project target directory is required.");
    const absolute = path.resolve(value);
    const metadata = noLinks(absolute);
    if (!metadata?.isDirectory()) fail("The explicit target project must already exist as a real directory.", "unsafe-path");
    const resolved = io.realpathSync.native ? io.realpathSync.native(absolute) : io.realpathSync(absolute);
    if (launchPadRoot && inside(path.resolve(launchPadRoot), resolved)) {
      fail("Companions must be created in an explicit target project, never in or beneath the Project Orchestrator launch pad.", "launch-pad-boundary");
    }
    if (!explicitBoundary) {
      for (let parent = resolved; ; parent = path.dirname(parent)) {
        if (frameworkAt(parent)) fail("The explicit target project is inside a Project Orchestrator launch pad.", "launch-pad-boundary");
        if (parent === path.dirname(parent)) break;
      }
    }
    return resolved;
  }
  function local(project, item) {
    const normalized = relative(item);
    const file = path.join(project, ...normalized.split("/"));
    if (!inside(project, file)) fail("Path escapes the target project.", "unsafe-path");
    noLinks(file);
    return file;
  }
  function read(project, item, maximum) {
    const file = local(project, item);
    const before = noLinks(file);
    if (!before?.isFile() || before.nlink !== 1 || before.size > maximum) fail("Input must be a bounded regular file without hard links.", "unsafe-input");
    const handle = io.openSync(file, fs.constants.O_RDONLY | (fs.constants.O_NOFOLLOW || 0));
    try {
      const opened = io.fstatSync(handle);
      if (!opened.isFile() || opened.size > maximum || opened.nlink !== 1 || opened.ino !== before.ino || opened.dev !== before.dev) fail("Input changed while opening.", "input-drift");
      const bytes = io.readFileSync(handle);
      if (bytes.length !== before.size) fail("Input changed while reading.", "input-drift");
      return bytes;
    } finally { io.closeSync(handle); }
  }
  function parse(bytes, label) {
    try { return JSON.parse(new TextDecoder("utf-8", { fatal: true }).decode(bytes).replace(/^\uFEFF/u, "")); }
    catch { fail(`${label} must contain valid UTF-8 JSON.`); }
  }
  function tree(project, directory, transaction = false) {
    const absolute = local(project, directory);
    const rootStat = noLinks(absolute);
    const files = [];
    const directories = [];
    if (rootStat && !rootStat.isDirectory()) fail("Package destination must be a directory.", "unsafe-path");
    let entries = 0;
    let size = 0;
    function visit(current, prefix, depth) {
      if (depth > 12) fail("Package directory nesting exceeds the limit.", "size-limit");
      for (const entry of io.readdirSync(current).sort(compare)) {
        if (++entries > (transaction ? LIMITS.maxPackageFiles * 2 + 5 : LIMITS.maxPackageFiles)) fail("Package file count exceeds the limit.", "size-limit");
        const item = prefix ? `${prefix}/${entry}` : entry;
        relative(item);
        const metadata = noLinks(path.join(current, entry));
        if (metadata?.isDirectory()) {
          directories.push(item);
          visit(path.join(current, entry), item, depth + 1);
        } else if (metadata?.isFile()) {
          if ((size += metadata.size) > (transaction ? LIMITS.maxPackageBytes * 2 + LIMITS.maxPlanBytes * 2 : LIMITS.maxPackageBytes)) fail("Package size exceeds the limit.", "size-limit");
          const bytes = read(project, `${directory}/${item}`, LIMITS.maxPackageBytes);
          files.push({ path: item, size: bytes.length, sha256: digest(bytes) });
        } else fail("Package contains an unsafe non-regular file.", "unsafe-path");
      }
    }
    if (rootStat) visit(absolute, "", 0);
    files.sort((a, b) => compare(a.path, b.path));
    directories.sort(compare);
    const snapshot = { exists: Boolean(rootStat), files, directories };
    return { ...snapshot, digestSha256: digest(canonical(snapshot)) };
  }
  function metadata(files) {
    return [...files].map(([file, bytes]) => ({ path: file, size: bytes.length, sha256: digest(bytes) })).sort((a, b) => compare(a.path, b.path));
  }
  function expectedTree(files) {
    const directories = new Set();
    for (const name of files.keys()) {
      const pieces = name.split("/");
      for (let count = 1; count < pieces.length; count++) directories.add(pieces.slice(0, count).join("/"));
    }
    const snapshot = { exists: true, files: metadata(files), directories: [...directories].sort(compare) };
    return { ...snapshot, digestSha256: digest(canonical(snapshot)) };
  }
  function load(options) {
    const project = projectRoot(options.project);
    const requestPath = relative(options.request, "Request path");
    const bytes = read(project, requestPath, LIMITS.maxRequestBytes);
    const value = parse(bytes, "Request");
    rejectCredentials(value);
    const required = ["schemaVersion", "id", "name", "target", "provenance", "frameWidth", "frameHeight", "anchor", "source", "animations", "defaultState", "altText", "accessibility"];
    record(value, [...required, "fork"], required, "request");
    if (value.schemaVersion !== VERSION) fail("Unsupported companion request schemaVersion.");
    if (typeof value.id !== "string" || !/^[a-z][a-z0-9]*(?:-[a-z0-9]+)*$/.test(value.id) || value.id.length > 50) fail("Companion id must be a lowercase kebab-case identifier of at most 50 characters.");
    relative(value.id, "Companion id");
    text(value.name, 100, "name");
    text(value.altText, 500, "altText");
    const target = targetFor(value.target);
    const destination = `artifacts/visual-companions/${value.id}/${value.target}`;
    local(project, destination);
    const inputs = new Map([[requestPath, { path: requestPath, sha256: digest(bytes), size: bytes.length }]]);
    function input(file, maximum) {
      const name = relative(file, "Asset or license path");
      if (name === destination || name.startsWith(`${destination}/`) || name.includes(".transaction/")) fail("Inputs may not reside in generated package or transaction paths.", "unsafe-path");
      const content = read(project, name, maximum);
      inputs.set(name, { path: name, sha256: digest(content), size: content.length });
      return content;
    }
    if (requestPath === destination || requestPath.startsWith(`${destination}/`) || requestPath.includes(".transaction/")) fail("Request must remain outside generated package and transaction paths.");
    function notice(file, label) {
      const content = input(file, LIMITS.maxNoticeBytes);
      let decoded;
      try { decoded = new TextDecoder("utf-8", { fatal: true }).decode(content); }
      catch { fail(`${label} must be a UTF-8 license notice.`); }
      if (!decoded.trim() || /[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f]/u.test(decoded)) fail(`${label} must contain a nonempty text notice.`);
      rejectCredentials(decoded);
      return content;
    }
    const provenanceFields = ["kind", "creator", "license", "redistributionAllowed", "rightsConfirmed", "attribution", "licenseFile"];
    record(value.provenance, provenanceFields, provenanceFields.slice(0, 6), "provenance");
    const provenance = value.provenance;
    if (!["original", "licensed-local"].includes(provenance.kind)) fail("provenance.kind must be original or licensed-local.");
    text(provenance.creator, 100, "provenance.creator");
    text(provenance.attribution, 1000, "provenance.attribution");
    license(provenance.license, "provenance");
    if (provenance.redistributionAllowed !== true) fail("Asset redistribution must be explicitly allowed by its license.");
    if (provenance.rightsConfirmed !== true) fail("The operator must explicitly confirm rights to create or redistribute this asset.");
    if ((provenance.kind === "licensed-local" || provenance.license.startsWith("LicenseRef-")) && !provenance.licenseFile) {
      fail("Licensed local assets and custom licenses require a local licenseFile notice.");
    }
    const assetNotice = provenance.licenseFile ? notice(provenance.licenseFile, "Asset license")
      : Buffer.from(`Original artwork license declaration\nLicense: ${provenance.license}\nCreator: ${provenance.creator}\nAttribution: ${provenance.attribution}\nRedistribution permitted and rights confirmed by the request author.\nThis declaration records the author's attestation; verify applicable license terms before external distribution.\n`);
    let forkNotice = null;
    if (value.target === "vscode-pets-fork") {
      const fields = ["license", "licenseFile", "redistributionAllowed", "rightsConfirmed"];
      record(value.fork, fields, fields, "fork");
      license(value.fork.license, "fork");
      if (value.fork.redistributionAllowed !== true || value.fork.rightsConfirmed !== true) fail("Licensed fork redistribution and rights must be explicitly confirmed.");
      forkNotice = notice(value.fork.licenseFile, "Fork license");
    } else if (value.fork !== undefined) fail("fork metadata is only valid for the vscode-pets-fork target.");
    integer(value.frameWidth, 1, LIMITS.maxFrameDimension, "frameWidth");
    integer(value.frameHeight, 1, LIMITS.maxFrameDimension, "frameHeight");
    record(value.anchor, ["x", "y"], ["x", "y"], "anchor");
    integer(value.anchor.x, 0, value.frameWidth, "anchor.x");
    integer(value.anchor.y, 0, value.frameHeight, "anchor.y");
    const source = value.source;
    let frameCount;
    let columns;
    let atlas;
    let sourceDigest;
    if (source?.kind === "pixel-grid") {
      record(source, ["kind", "palette", "frames"], ["kind", "palette", "frames"], "source");
      if (provenance.kind !== "original") fail("Pixel grids require original provenance; imported sprites require licensed-local provenance.");
      if (!source.palette || typeof source.palette !== "object" || Array.isArray(source.palette)) fail("source.palette must map single-character symbols to RGBA colors.");
      const palette = Object.entries(source.palette);
      if (palette.length < 2 || palette.length > 64) fail("source.palette requires 2 to 64 entries.");
      for (const [symbol, color] of palette) {
        if (!/^[.A-Za-z0-9_-]$/.test(symbol) || typeof color !== "string" || !/^#[A-Fa-f0-9]{8}$/.test(color)) fail("Palette symbols must be single ASCII tokens and colors must be #RRGGBBAA.");
      }
      if (!Array.isArray(source.frames)) fail("source.frames must contain pixel-grid frames.");
      frameCount = source.frames.length;
      integer(frameCount, 1, LIMITS.maxFrames, "source.frames length");
      columns = Math.min(frameCount, Math.floor(PNG_LIMITS.maxDimension / value.frameWidth));
      const width = columns * value.frameWidth;
      const height = Math.ceil(frameCount / columns) * value.frameHeight;
      if (width * height > PNG_LIMITS.maxPixels || height > PNG_LIMITS.maxDimension) fail("Pixel-grid atlas exceeds the bounded pixel limit.");
      atlas = { width, height, pixels: Buffer.alloc(width * height * 4) };
      const colors = Object.fromEntries(palette.map(([symbol, color]) => [symbol, Buffer.from(color.slice(1), "hex")]));
      source.frames.forEach((frame, index) => {
        if (!Array.isArray(frame) || frame.length !== value.frameHeight) fail("Every pixel-grid frame must match frameHeight.");
        frame.forEach((row, y) => {
          if (typeof row !== "string" || row.length !== value.frameWidth) fail("Every pixel-grid row must match frameWidth.");
          [...row].forEach((symbol, x) => {
            if (!Object.hasOwn(colors, symbol)) fail("A pixel-grid symbol has no palette entry.");
            const offset = (((Math.floor(index / columns) * value.frameHeight + y) * width) + ((index % columns) * value.frameWidth + x)) * 4;
            colors[symbol].copy(atlas.pixels, offset);
          });
        });
      });
      sourceDigest = digest(canonical(source));
    } else if (source?.kind === "png") {
      const fields = ["kind", "path", "columns", "frameCount"];
      record(source, fields, fields, "source");
      if (provenance.kind !== "licensed-local") fail("PNG import requires licensed-local provenance and an explicit license notice.");
      relative(source.path, "PNG asset path");
      if (!/\.png$/i.test(source.path)) fail("PNG asset path must end in .png.");
      integer(source.frameCount, 1, LIMITS.maxFrames, "source.frameCount");
      integer(source.columns, 1, source.frameCount, "source.columns");
      frameCount = source.frameCount;
      columns = source.columns;
      const png = input(source.path, PNG_LIMITS.maxEncodedBytes);
      try { atlas = decodePng(png); } catch (error) { fail(error.message, "invalid-png"); }
      sourceDigest = digest(png);
      if (atlas.width !== columns * value.frameWidth || atlas.height !== Math.ceil(frameCount / columns) * value.frameHeight) fail("PNG atlas dimensions do not match declared frame geometry.");
    } else fail("source.kind must be pixel-grid or png; URLs and remote generators are not supported.");
    const frames = [];
    const rows = Math.ceil(frameCount / columns);
    for (let index = 0; index < columns * rows; index++) {
      const frame = { index, x: (index % columns) * value.frameWidth, y: Math.floor(index / columns) * value.frameHeight, width: value.frameWidth, height: value.frameHeight };
      let visible = false;
      let transparent = false;
      for (let y = frame.y; y < frame.y + frame.height; y++) {
        for (let x = frame.x; x < frame.x + frame.width; x++) {
          const alpha = atlas.pixels[(y * atlas.width + x) * 4 + 3];
          if (alpha > 0) visible = true;
          if (alpha === 0) transparent = true;
        }
      }
      if (index < frameCount) {
        if (!visible) fail("Every sprite frame must contain visible pixels, not a blank transparent frame.");
        if (!transparent) fail("Every sprite frame must contain at least one fully transparent pixel.");
        frames.push(frame);
      } else if (visible) fail("Unused atlas cells must be fully transparent.");
    }
    const animations = value.animations;
    if (!animations || typeof animations !== "object" || Array.isArray(animations)) fail("animations must be a state mapping.");
    const states = Object.keys(animations);
    if (!Object.hasOwn(animations, "idle") || states.length > LIMITS.maxStates) fail("animations must include idle and no more than 16 states.");
    for (const state of states) {
      if (!/^[a-z][a-z0-9]*(?:-[a-z0-9]+)*$/.test(state) || state.length > 32) fail("Animation state names must be bounded lowercase kebab-case identifiers.");
      const animation = animations[state];
      record(animation, ["frames", "loop"], ["frames", "loop"], "animation");
      if (typeof animation.loop !== "boolean" || !Array.isArray(animation.frames) || animation.frames.length < 1 || animation.frames.length > 64) fail("Animation needs loop and 1 to 64 timed frames.");
      for (const frame of animation.frames) {
        record(frame, ["index", "durationMs"], ["index", "durationMs"], "animation frame");
        integer(frame.index, 0, frameCount - 1, "animation frame index");
        integer(frame.durationMs, LIMITS.minDurationMs, LIMITS.maxDurationMs, "animation frame durationMs");
      }
    }
    if (typeof value.defaultState !== "string" || !Object.hasOwn(animations, value.defaultState)) fail("defaultState must name an existing animation.");
    record(value.accessibility, ["reducedMotion", "staticFrame"], ["reducedMotion", "staticFrame"], "accessibility");
    if (value.accessibility.reducedMotion !== "static") fail("accessibility.reducedMotion must be static.");
    integer(value.accessibility.staticFrame, 0, frameCount - 1, "accessibility.staticFrame");
    const still = Buffer.alloc(value.frameWidth * value.frameHeight * 4);
    const frame = frames[value.accessibility.staticFrame];
    for (let y = 0; y < value.frameHeight; y++) {
      atlas.pixels.copy(still, y * value.frameWidth * 4, ((frame.y + y) * atlas.width + frame.x) * 4, ((frame.y + y) * atlas.width + frame.x + value.frameWidth) * 4);
    }
    const sprite = {
      atlas: "assets/sprite.png", staticImage: "assets/static.png",
      width: atlas.width, height: atlas.height, frameWidth: value.frameWidth, frameHeight: value.frameHeight,
      frameCount, columns, rows, frames, anchor: value.anchor
    };
    const definition = { name: value.name, sprite, animations, defaultState: value.defaultState, accessibility: { ...value.accessibility, altText: value.altText } };
    const files = new Map();
    const put = (name, content) => files.set(name, Buffer.isBuffer(content) ? content : Buffer.from(content));
    put("assets/sprite.png", encodePng(atlas.width, atlas.height, atlas.pixels));
    put("assets/static.png", encodePng(value.frameWidth, value.frameHeight, still));
    put("ASSET-LICENSE.txt", assetNotice);
    if (["local-chat-webview", "standalone-vscode-extension"].includes(value.target)) {
      put("assets/companion.css", CSS);
      put("assets/companion-data.js", `"use strict";\nglobalThis.VISUAL_COMPANION_DATA = ${javascriptData(definition)};\n`);
      put("assets/companion.js", fs.readFileSync(path.join(import.meta.dirname, "browser-runtime.js")));
    }
    if (value.target === "local-chat-webview") {
      put("index.html", viewHtml(value.altText));
      put("preview-server.mjs", serverSource());
      put("README.md", `# Local visual companion\n\nRun \`node preview-server.mjs\` in this package and open the printed loopback URL. Stop with Ctrl+C. No dependencies, external service, model, or remote server is used.\n\nTo embed in a surface you own, serve the assets under the same local origin, load companion.css, companion-data.js, and companion.js as external classic scripts, and call \`VisualCompanion.mount(element, VISUAL_COMPANION_DATA)\`. The return value exposes \`setState(name)\`, \`getState()\`, \`setPaused(boolean)\`, and \`dispose()\`. Mounting the #visual-companion element is automatic. Call dispose on host teardown; pagehide also disposes it.\n\nThe browser honors reduced motion, supports a keyboard pause control, announces state changes, and retains a static PNG fallback. This bundle does not modify the existing live-chat reducer or inject itself into any product UI.\n\nThis is not a native ChatGPT avatar or VS Code chat overlay. Host integration and external publication are separate approvals. Verify package digests before use.\n`);
    } else if (value.target === "standalone-vscode-extension") {
      put("extension.cjs", extensionSource(value.id, value.altText));
      put("package.json", json({
        name: `visual-companion-${value.id}`, displayName: `Visual Companion: ${value.name}`, version: "0.0.1",
        description: "A local visual companion in its own limited-resource VS Code webview.",
        publisher: "local-development", private: true, license: "UNLICENSED", engines: { vscode: "^1.90.0" },
        main: "./extension.cjs", activationEvents: [`onCommand:visualCompanion.${value.id}.open`],
        contributes: { commands: [{ command: `visualCompanion.${value.id}.open`, title: `Open Visual Companion: ${value.name}` }] }
      }));
      put(".vscode/launch.json", json({ version: "0.2.0", configurations: [{
        name: "Run Local Visual Companion", type: "extensionHost", request: "launch",
        runtimeExecutable: "${execPath}", args: ["--extensionDevelopmentPath=${workspaceFolder}"]
      }] }));
      put("README.md", `# Standalone VS Code companion source package\n\nOpen this directory in VS Code and press F5 using Run Local Visual Companion. In the Extension Development Host, run the Open Visual Companion command. No npm install or compilation is required. The command opens a separate webview, not a native chat overlay.\n\nThis is source only, not a VSIX; nothing is installed or published. The local-development publisher is a development placeholder, not a claimed Marketplace identity. Verify an already-available offline VSIX packager, establish source licensing and a publisher identity, review the final package, and obtain separate approval before packaging, installation, or publication. This builder deliberately runs no package tool.\n\nThe webview has an asset-only localResourceRoots allowlist, nonce-restricted external scripts, no host message bridge, no remote resource access, and static/reduced-motion fallback. ASSET-LICENSE.txt records the artwork rights only; generated extension source licensing must be decided before distribution.\n`);
    } else if (value.target === "vscode-pets-fork") {
      put("FORK-LICENSE.txt", forkNotice);
      put("fork-integration.json", json({ schemaVersion: VERSION, mode: "manual-handoff", stockContributionApi: false, sprite, animations, defaultState: value.defaultState, accessibility: definition.accessibility, forkLicense: value.fork.license }));
      put("FORK-HANDOFF.md", `# Manual licensed-fork asset kit\n\nStock VS Code Pets has no supported third-party pet contribution API. This kit does not register a pet with the stock extension, apply a patch, install an extension, or publish a fork.\n\n1. Confirm the actual fork license, upstream notices, asset license, and permission to redistribute. FORK-LICENSE.txt and ASSET-LICENSE.txt preserve the supplied notices; their presence is not legal verification.\n2. Inspect the licensed fork revision locally. Locate its pet-type enumeration, asset lookup, state machine, sprite frame geometry, scale, and anchor conventions.\n3. Manually map fork-integration.json to that fork's conventions. Add a new type and asset mapping, port supported animation states, and retain the static reduced-motion fallback. Do not copy stock copyrighted pet artwork or claim a generic patch is compatible with every revision.\n4. Add fork-specific rendering, state-transition, timing, accessibility, and license tests. Review the diff and run that fork's build/test commands.\n5. Obtain separate approval for fork modification, VSIX packaging, installation, and any external distribution. This handoff is not an applied or published result.\n`);
    } else if (value.target === "static-agent-icon") {
      put("icon.png", files.get("assets/static.png"));
      put("README.md", "# Static agent icon\n\nicon.png is the selected static frame, with the supplied alt text in companion-manifest.json. Import it manually only where a host explicitly supports static icons. This package does not add an animated ChatGPT avatar or perform any upload, installation, or publication.\n");
    }
    const manifestBody = {
      schemaVersion: VERSION, id: value.id, name: value.name, target: value.target, artifactKind: target.artifactKind,
      targetSupport: target.support, generator: { id: "visual-companion-builder", version: VERSION },
      provenance: { ...provenance, licenseFile: "ASSET-LICENSE.txt", sourceDigestSha256: sourceDigest, sourceKind: source.kind },
      ...(value.fork ? { fork: { ...value.fork, licenseFile: "FORK-LICENSE.txt" } } : {}),
      requestDigestSha256: digest(bytes), sprite, animations, defaultState: value.defaultState,
      accessibility: definition.accessibility, extensionInstalled: false, published: false,
      files: metadata(files), limitations: target.limitations
    };
    const packageDigestSha256 = digest(canonical(manifestBody));
    const manifest = { ...manifestBody, packageDigestSha256 };
    put("companion-manifest.json", json(manifest));
    const expected = expectedTree(files);
    if (expected.files.length + expected.directories.length > LIMITS.maxPackageFiles
        || expected.files.reduce((total, file) => total + file.size, 0) > LIMITS.maxPackageBytes) fail("Generated package exceeds bounded limits.");
    return { project, requestPath, value, target, destination, inputs: [...inputs.values()].sort((a, b) => compare(a.path, b.path)), files, manifest, expected };
  }
  function summary(context) {
    return {
      id: context.value.id, target: context.value.target, targetSupport: context.target.support,
      artifactKind: context.target.artifactKind, destination: context.destination, limitations: context.target.limitations
    };
  }
  function makePlan(context, before) {
    const body = {
      ...envelope("plan", "approval-required"), ...summary(context), project: context.project,
      requestPath: context.requestPath, inputs: context.inputs, before,
      expected: { packageDigestSha256: context.manifest.packageDigestSha256, treeDigestSha256: context.expected.digestSha256, files: context.expected.files, directories: context.expected.directories },
      approval: { required: true, classes: before.exists ? ["local-write", "replace-existing-package"] : ["local-write"] }
    };
    return { ...body, planDigestSha256: digest(canonical(body)) };
  }
  function readPlan(options, project) {
    const filename = relative(options.plan, "Reviewed plan path");
    return { filename, value: parse(read(project, filename, LIMITS.maxPlanBytes), "Reviewed plan") };
  }
  function verifyPlanShape(value) {
    if (!value || typeof value !== "object" || Array.isArray(value) || typeof value.planDigestSha256 !== "string") fail("A valid reviewed plan is required.", "invalid-plan");
    const { planDigestSha256, ...body } = value;
    if (digest(canonical(body)) !== planDigestSha256) fail("Reviewed plan hash mismatch; the plan was tampered with.", "invalid-plan");
    const before = value.before;
    record(before, ["exists", "files", "directories", "digestSha256"], ["exists", "files", "directories", "digestSha256"], "plan.before");
    if (typeof before.exists !== "boolean" || !Array.isArray(before.files) || !Array.isArray(before.directories)
        || before.files.length + before.directories.length > LIMITS.maxPackageFiles) fail("Invalid reviewed plan target snapshot.", "invalid-plan");
    const { digestSha256, ...snapshot } = before;
    if (digest(canonical(snapshot)) !== digestSha256 || (!before.exists && (before.files.length || before.directories.length))) fail("Invalid reviewed target snapshot digest.", "invalid-plan");
    for (const file of before.files) {
      record(file, ["path", "sha256", "size"], ["path", "sha256", "size"], "plan file");
      relative(file.path);
      if (!/^[a-f0-9]{64}$/.test(file.sha256)) fail("Invalid plan file digest.", "invalid-plan");
      integer(file.size, 0, LIMITS.maxPackageBytes, "plan file size");
    }
    before.directories.forEach((item) => relative(item));
  }
  function matchingPlan(context, plan) {
    verifyPlanShape(plan);
    if (canonical(makePlan(context, plan.before)) !== canonical(plan)) fail("Reviewed plan is stale or tampered with: request, inputs, generator output, project, or destination changed.", "plan-drift");
  }
  function installed(context) {
    const actual = tree(context.project, context.destination);
    if (actual.digestSha256 !== context.expected.digestSha256) fail("Installed package integrity changed: missing, altered, or unexpected files/directories.", "integrity-mismatch");
    return actual;
  }
  function result(context, command, { unchanged = false, recovery = "none" } = {}) {
    installed(context);
    return {
      ...envelope(command, command === "verify" ? "verified" : context.target.support === "manual" ? "manual-handoff" : "built"),
      ...summary(context), packageDigestSha256: context.manifest.packageDigestSha256,
      manifestDigestSha256: digest(context.files.get("companion-manifest.json")),
      artifacts: context.expected.files, verification: { status: "passed", fileCount: context.expected.files.length, scope: "local-package-integrity-only" },
      unchanged, recovery
    };
  }
  function ensureDirectory(project, directory) {
    let cursor = project;
    for (const part of relative(directory).split("/")) {
      cursor = path.join(cursor, part);
      const metadata = noLinks(cursor);
      if (!metadata) io.mkdirSync(cursor, { mode: 0o700 });
      else if (!metadata.isDirectory()) fail("Output ancestor is not a directory.", "unsafe-path");
    }
  }
  function removeChecked(project, directory, expectedDigest) {
    const snapshot = tree(project, directory, directory.endsWith(".transaction"));
    if (expectedDigest && snapshot.digestSha256 !== expectedDigest) fail("Recovery refuses to remove changed files.", "recovery-required");
    noLinks(local(project, directory));
    io.rmSync(local(project, directory), { recursive: true, force: false });
  }
  function transactionPath(context) {
    return `artifacts/visual-companions/${context.value.id}/.${context.value.target}.transaction`;
  }
  function journalWrite(context, transaction, journal) {
    const candidate = `${transaction}/journal.next`;
    const destination = `${transaction}/journal.json`;
    if (stat(local(context.project, candidate))) fail("Unexpected pending transaction journal.", "recovery-required");
    const text = json(journal);
    const handle = io.openSync(local(context.project, candidate), "wx", 0o600);
    try { io.writeFileSync(handle, text); io.fsyncSync(handle); } finally { io.closeSync(handle); }
    io.renameSync(local(context.project, candidate), local(context.project, destination));
  }
  function transactionContents(context, transaction, plan) {
    const snapshot = tree(context.project, transaction, true);
    const expectedNames = new Map(context.expected.files.map((file) => [`stage/${file.path}`, file]));
    const oldNames = new Map(plan.before.files.map((file) => [`backup/${file.path}`, file]));
    const permittedDirectories = new Set(["stage", "backup", ...context.expected.directories.map((name) => `stage/${name}`), ...plan.before.directories.map((name) => `backup/${name}`)]);
    for (const item of snapshot.files) {
      const expected = expectedNames.get(item.path) || oldNames.get(item.path);
      if (expected) {
        if (item.sha256 !== expected.sha256 || item.size !== expected.size) fail("Transaction content integrity changed; preserve it for manual recovery.", "recovery-required");
      } else if (["journal.json", "journal.next"].includes(item.path)) {
        const journal = parse(read(context.project, `${transaction}/${item.path}`, LIMITS.maxPlanBytes), "Transaction journal");
        record(journal, ["schemaVersion", "planDigestSha256", "pid", "phase"], ["schemaVersion", "planDigestSha256", "pid", "phase"], "journal");
        if (journal.schemaVersion !== VERSION || journal.planDigestSha256 !== plan.planDigestSha256
            || !Number.isInteger(journal.pid) || journal.pid < 1
            || !["prepared", "backed-up", "installed"].includes(journal.phase)) fail("Transaction journal changed; manual recovery is required.", "recovery-required");
      } else fail("Unexpected transaction content; manual recovery is required.", "recovery-required");
    }
    for (const item of snapshot.directories) if (!permittedDirectories.has(item)) fail("Unexpected transaction directory; manual recovery is required.", "recovery-required");
    const backup = tree(context.project, `${transaction}/backup`);
    if (backup.exists && backup.digestSha256 !== plan.before.digestSha256) fail("Backup integrity changed; manual recovery is required.", "recovery-required");
    return snapshot;
  }
  function recover(context, plan, transaction) {
    const existing = noLinks(local(context.project, transaction));
    if (!existing) return "none";
    if (!existing.isDirectory()) fail("Invalid transaction path; manual recovery is required.", "recovery-required");
    transactionContents(context, transaction, plan);
    const raw = parse(read(context.project, `${transaction}/journal.json`, LIMITS.maxPlanBytes), "Transaction journal");
    record(raw, ["schemaVersion", "planDigestSha256", "pid", "phase"], ["schemaVersion", "planDigestSha256", "pid", "phase"], "journal");
    if (raw.schemaVersion !== VERSION || raw.planDigestSha256 !== plan.planDigestSha256
        || !["prepared", "backed-up", "installed"].includes(raw.phase)
        || !Number.isInteger(raw.pid) || raw.pid < 1) fail("An interrupted transaction requires its exact original reviewed plan.", "recovery-required");
    let alive = true;
    try { process.kill(raw.pid, 0); } catch (error) { if (error.code === "ESRCH") alive = false; }
    if (alive) fail("A companion transaction owner is still active; do not steal its lock.", "transaction-busy");
    const backup = tree(context.project, `${transaction}/backup`);
    const current = tree(context.project, context.destination);
    if (backup.exists && backup.digestSha256 !== plan.before.digestSha256) fail("Backup integrity changed; manual recovery is required.", "recovery-required");
    if (current.digestSha256 === context.expected.digestSha256 && (backup.exists || !plan.before.exists || raw.phase === "installed")) {
      removeChecked(context.project, transaction, transactionContents(context, transaction, plan).digestSha256);
      return "finalized";
    }
    if (backup.exists && !current.exists) {
      io.renameSync(local(context.project, `${transaction}/backup`), local(context.project, context.destination));
      removeChecked(context.project, transaction, transactionContents(context, transaction, plan).digestSha256);
      return "rolled-back";
    }
    if (!backup.exists && current.digestSha256 === plan.before.digestSha256) {
      removeChecked(context.project, transaction, transactionContents(context, transaction, plan).digestSha256);
      return "rolled-back";
    }
    fail("Interrupted transaction has conflicting target state; preserve its journal and backup for manual recovery.", "recovery-required");
  }
  function validate(options) {
    const context = load(options);
    return {
      ...envelope("validate", "validated"), ...summary(context), inputs: context.inputs,
      packageDigestSha256: context.manifest.packageDigestSha256, manifest: context.manifest
    };
  }
  function plan(options) {
    const context = load(options);
    const transaction = transactionPath(context);
    if (noLinks(local(context.project, transaction))) fail("Recover the interrupted build with its original approved plan before creating a new plan.", "recovery-required");
    return makePlan(context, tree(context.project, context.destination));
  }
  function verify(options) {
    let context;
    if (options.plan) {
      const project = projectRoot(options.project);
      const reviewed = readPlan(options, project);
      const request = options.request || reviewed.value.requestPath;
      context = load({ ...options, request });
      matchingPlan(context, reviewed.value);
    } else context = load(options);
    if (noLinks(local(context.project, transactionPath(context)))) fail("Transaction is incomplete; recover with the original approved build plan before verifying.", "recovery-required");
    return result(context, "verify");
  }
  function build(options) {
    if (options.acceptRisk !== true) fail("Build requires current explicit --accept-risk approval for the exact reviewed plan.", "approval-required");
    if (!options.plan) fail("Build requires --plan with the saved, reviewed plan.", "invalid-plan");
    const context = load(options);
    const reviewed = readPlan(options, context.project);
    if (reviewed.filename === context.destination || reviewed.filename.startsWith(`${context.destination}/`) || reviewed.filename.includes(".transaction/")) fail("Reviewed plan must remain outside output and transaction paths.", "unsafe-path");
    matchingPlan(context, reviewed.value);
    const transaction = transactionPath(context);
    const recovery = recover(context, reviewed.value, transaction);
    const current = tree(context.project, context.destination);
    if (current.digestSha256 === context.expected.digestSha256) return result(context, "build", { unchanged: true, recovery });
    if (current.digestSha256 !== reviewed.value.before.digestSha256) fail("Target drift made the reviewed plan stale; review a new plan before any overwrite.", "target-drift");
    const parent = context.destination.slice(0, context.destination.lastIndexOf("/"));
    ensureDirectory(context.project, parent);
    try { io.mkdirSync(local(context.project, transaction), { mode: 0o700 }); }
    catch (error) { if (error.code === "EEXIST") fail("A companion transaction is already active.", "transaction-busy"); throw error; }
    const journal = { schemaVersion: VERSION, planDigestSha256: reviewed.value.planDigestSha256, pid: process.pid, phase: "prepared" };
    let backedUp = false;
    let movedStage = false;
    let committed = false;
    try {
      journalWrite(context, transaction, journal);
      ensureDirectory(context.project, `${transaction}/stage`);
      for (const [name, bytes] of context.files) {
        const parentIndex = name.lastIndexOf("/");
        if (parentIndex >= 0) ensureDirectory(context.project, `${transaction}/stage/${name.slice(0, parentIndex)}`);
        const handle = io.openSync(local(context.project, `${transaction}/stage/${name}`), "wx", 0o600);
        try { io.writeFileSync(handle, bytes); io.fsyncSync(handle); } finally { io.closeSync(handle); }
      }
      if (tree(context.project, `${transaction}/stage`).digestSha256 !== context.expected.digestSha256) fail("Staged package integrity failed.", "integrity-mismatch");
      matchingPlan(load(options), reviewed.value);
      if (tree(context.project, context.destination).digestSha256 !== reviewed.value.before.digestSha256) fail("Target drift detected immediately before install.", "target-drift");
      if (current.exists) {
        io.renameSync(local(context.project, context.destination), local(context.project, `${transaction}/backup`));
        backedUp = true;
        journal.phase = "backed-up";
        journalWrite(context, transaction, journal);
      }
      io.renameSync(local(context.project, `${transaction}/stage`), local(context.project, context.destination));
      movedStage = true;
      installed(context);
      journal.phase = "installed";
      journalWrite(context, transaction, journal);
      committed = true;
      removeChecked(context.project, transaction, transactionContents(context, transaction, reviewed.value).digestSha256);
      return result(context, "build", { recovery });
    } catch (error) {
      if (committed) fail("Package installed but transaction cleanup failed; preserve journal and retry with the same approved plan after the owner exits.", "recovery-required");
      try {
        const backupExists = Boolean(noLinks(local(context.project, `${transaction}/backup`)));
        if (movedStage) removeChecked(context.project, context.destination, context.expected.digestSha256);
        if (backedUp || backupExists) {
          if (tree(context.project, `${transaction}/backup`).digestSha256 !== reviewed.value.before.digestSha256 || noLinks(local(context.project, context.destination))) fail("Backup or target changed during rollback.", "recovery-required");
          io.renameSync(local(context.project, `${transaction}/backup`), local(context.project, context.destination));
        }
        if (noLinks(local(context.project, transaction))) removeChecked(context.project, transaction, transactionContents(context, transaction, reviewed.value).digestSha256);
      } catch { fail("Build failed and exact rollback could not finish; preserve the transaction for same-plan recovery.", "recovery-required"); }
      throw error;
    }
  }
  return Object.freeze({ validate, plan, build, verify });
}

function argumentsFor(argv) {
  let [command = "help", ...args] = argv;
  if (command === "--help") command = "help";
  if (!["capabilities", "validate", "plan", "build", "verify", "help"].includes(command)) fail("Use companion <capabilities|validate|plan|build|verify|help>.", "invalid-command");
  const options = {};
  const names = new Map([["--project", "project"], ["--request", "request"], ["--plan", "plan"]]);
  for (let index = 0; index < args.length; index++) {
    const argument = args[index];
    const name = names.get(argument) || (argument === "--accept-risk" ? "acceptRisk" : argument === "--json" ? "json" : argument === "--help" ? "help" : null);
    if (!name || Object.hasOwn(options, name)) fail("Unknown or duplicate companion CLI flag.", "invalid-arguments");
    if (["acceptRisk", "json", "help"].includes(name)) options[name] = true;
    else {
      const value = args[++index];
      if (!value || value.startsWith("--")) fail("A companion CLI path flag is missing its value.", "invalid-arguments");
      options[name] = value;
    }
  }
  if (command === "help" || options.help) return { command: "help", options };
  if (command === "capabilities" && (options.request || options.plan || options.acceptRisk)) fail("Capabilities accepts only --json and optional --project.", "invalid-arguments");
  if (command !== "capabilities" && !options.project) fail("An explicit --project target is required.", "invalid-arguments");
  if (["validate", "plan", "build"].includes(command) && !options.request) fail("This command requires --request.", "invalid-arguments");
  if (command === "verify" && !options.request && !options.plan) fail("Verify requires --request or --plan.", "invalid-arguments");
  if (["validate", "plan"].includes(command) && (options.plan || options.acceptRisk)) fail("Validate and plan are read-only and do not accept --plan or --accept-risk.", "invalid-arguments");
  if (command === "verify" && options.acceptRisk) fail("Verify is read-only and does not accept --accept-risk.", "invalid-arguments");
  return { command, options };
}
export function main(argv = process.argv.slice(2)) {
  let command = ["capabilities", "validate", "plan", "build", "verify", "help"].includes(argv[0]) ? argv[0] : "unknown";
  try {
    const parsed = argumentsFor(argv);
    command = parsed.command;
    const result = command === "help" ? help() : command === "capabilities" ? capabilities() : createCompanionBuilder()[command](parsed.options);
    process.stdout.write(json(result));
    return 0;
  } catch (error) {
    process.stdout.write(json({
      ...envelope(command, "blocked"),
      code: typeof error.code === "string" && /^[a-z][a-z-]+$/.test(error.code) ? error.code : "companion-failed",
      error: typeof error.code === "string" && /^[a-z][a-z-]+$/.test(error.code) ? error.message : "Companion operation failed; no installation or publication is claimed. Check bounded local inputs and transaction state.",
      limitations: ["No external publication, extension installation, cloud generation, or remote mutation was performed."]
    }));
    return 1;
  }
}
if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) process.exitCode = main();
