---
mode: agent
description: Help for the visual-companion-builder skill.
---

# visual-companion-builder Help

Create original pixel-grid sprites or validate licensed local PNG atlases, then package accessible companions for owned local browser surfaces, standalone VS Code extension source, licensed VS Code Pets fork handoffs, or static icons. Use for sprite creation and companion packaging, not project diagrams or native host overlays.

Explain this contract as help only. Do not execute its procedures or treat examples as action approval.
Read the complete contract at .github/skills/visual-companion-builder/SKILL.md before using this skill.

## Purpose

Create a new original sprite from operator-supplied pixel grids and RGBA palette entries, or import a licensed local PNG atlas. Produce deterministic, integrity-bound packages in an explicit target project. Do not promise image-model generation, arbitrary native host avatars, automatic VSIX packaging, or stock VS Code Pets registration.

## Preconditions

- Complete clarification and policy evaluation before building. The requested capability and new-skill boundary must be approved.
- Use Node.js supported by the framework; no runtime npm dependency or package installation is required.
- Select an existing target project outside the Project Orchestrator launch pad, including its descendants. Generated/adopted projects may use their own installed helper.
- Confirm original-art rights or local-asset redistribution rights. Imports need an explicit local license notice; a licensed fork needs its own notice and rights confirmation.

## Inputs

- A target-relative UTF-8 request conforming to `schemas/visual-companion-request.schema.json`.
- A unique lowercase companion ID; public name, creator, attribution, license, alt text, frame dimensions, pixel anchors, timed state animations, and a static reduced-motion fallback.
- Either `source.kind: pixel-grid` with up to 64 rectangular frames and a single-character-to-`#RRGGBBAA` palette, or `source.kind: png` with a contained local PNG path, atlas column count, and frame count.
- For build: an unchanged, operator-reviewed plan from `plan`, saved outside the generated package, plus current `--accept-risk` approval.

## Approved Tools and Resources

- Use the packaged Node.js helper, local filesystem APIs, SHA-256, and bounded built-in PNG compression/decompression.
- Use a local browser preview or an existing VS Code Extension Development Host for manual surface checks. Do not install tools.
- Never call image services, remote asset URLs, extension installers, cloud tools, GitHub mutation commands, or publication APIs.

## Read and Write Boundaries

- Read only the explicit target request, referenced local assets/notices, reviewed plan, installed package, and the helper's own deterministic runtime.
- Build writes only `artifacts/visual-companions/<id>/<target>/` in the target project, using a sibling `.<target>.transaction/` staging/journal/backup directory.
- Reject absolute/escaping asset paths, URLs, device paths, alternate streams, symbolic links, junctions, hard-linked input files, unsafe path components, and credentials. The project root itself must exist and be symlink-free.
- Do not modify existing live-chat controllers, host applications, forks, `.agent.md` files, project documentation, or any unrelated artifact. Integration is a separate reviewed action.

## Procedure

1. Run `node .github\skills\visual-companion-builder\scripts\visual-companion-builder.mjs capabilities --json` and state the exact target support level. `capabilities`, `help`, and `--help` require no project and perform no project inspection, writes, provisioning, or network activity; `<action> --help` is also supported.
2. Prepare the explicit request in the target project. Require attested redistribution permission; never substitute stock copyrighted pet assets.
3. Run `validate --project <target> --request <relative-request.json> --json`. This checks every field, source image, frame bound, visible/transparent content, anchor, state, duration, notice, and static fallback without writes.
4. Run `plan --project <target> --request <relative-request.json> --json`. Save its stdout as a target-relative reviewed plan. Plan is read-only; its SHA-256 binds inputs, generator output, exact destination, current destination files/directories, and expected package digests.
5. Review the plan's complete before/after inventories and approval classes. Planning or a prior approval is not build authorization.
6. Run `build --project <target> --request <relative-request.json> --plan <relative-reviewed-plan.json> --accept-risk --json`. This revalidates the request, source files, plan, and target immediately before a staged directory swap. An exact already-built package is an idempotent no-op.
7. Run `verify --project <target> --request <relative-request.json> --json`, or use `--plan <relative-reviewed-plan.json>` for an exact reviewed-package check. Verification regenerates expected bytes and checks all installed paths/digests, including the manifest; self-rehashed tampered manifests do not pass.
8. Report local-package integrity separately from host integration. For the local browser bundle, run its `node preview-server.mjs` and open the loopback URL. For extension source, open the package in VS Code and use its F5 launch configuration. For a licensed fork, stop at its manual integration checklist.

## Validation

- Request and command result/plan conform to the request and result schemas; unknown fields fail closed.
- PNGs are non-interlaced 8-bit RGBA, CRC-valid, fully decompressed within limits, and canonically re-encoded without metadata. RGB, indexed, interlaced, APNG, truncated, and oversized inputs are rejected.
- Limits: 2 MiB request; 512 KiB plan; 64 KiB notices; 8 MiB PNG; 2048-pixel maximum atlas edge; 1,048,576 atlas pixels; 256-pixel frame edges; 64 frames; 16 states; 100–60,000 ms per animation step.
- Every used frame contains both visible and fully transparent pixels; unused atlas cells are transparent. Idle state is required; all referenced frames, default state, anchors, and fallback are in bounds.
- The manifest records provenance, geometry, timing, anchors, accessibility, and per-file digests. Its package digest is SHA-256 of canonical key-sorted manifest JSON excluding `packageDigestSha256`; the plan also hashes the full manifest bytes.
- Browser labels use text-only DOM setters, not HTML insertion. Generated configuration escapes script delimiters. The webview has an asset-only resource root, nonce CSP, no remote resource permission, and no host message bridge.
- Browser playback respects reduced-motion and visibility changes, offers keyboard pause controls, exposes static fallback and accessible descriptions, and disposes event listeners/timers.

## Outputs

The target-project companion package contains `companion-manifest.json`, canonical `assets/sprite.png`, `assets/static.png`, and an asset license notice.

- `artifacts/visual-companions/<id>/<target>/`
- `local-chat-webview`: browser bundle with an embeddable external classic-script API and loopback-only preview server; not a native chat overlay.
- `standalone-vscode-extension`: working source package with VS Code command/webview code and an Extension Development Host launch configuration; never a claimed installed extension or generated VSIX.
- `vscode-pets-fork`: manual asset kit with fork notice, state/geometry mapping, and revision-specific patch guidance. Stock VS Code Pets has no supported third-party pet contribution point.
- `static-agent-icon`: selected static `icon.png`, usable manually only where the host supports static icons.
- Machine-readable stdout conforming to `schemas/visual-companion-result.schema.json`; unsupported targets and failures return `status: blocked` and a nonzero exit code. No dedicated shared report is owned.

## Failure Behavior

- Reject ChatGPT-specific exports because this builder does not implement a plugin/MCP Apps UI wrapper. OpenAI supports animated content inside an independently built plugin iframe; that is not a global ChatGPT avatar or overlay. See the [MCP Apps UI documentation](https://developers.openai.com/plugins/build/chatgpt-ui). Reject stock VS Code Pets registration requests.
- Require a new review after any input, generator-output, target, or plan drift. No force-overwrite flag exists.
- Restore exact previous bytes on normal install failure. Preserve the journal/backup when safe restoration is impossible; never delete unknown or altered recovery artifacts.
- An interrupted transaction can be resumed only with its original matching plan and fresh `--accept-risk`, once the recorded owner process has exited. The build restores the original target or finalizes an already-verified install before continuing. An active owner, missing journal, changed backup, or conflicting target requires explicit manual recovery; do not steal its lock.
- Directory renames provide transactional cutover/rollback, not simultaneous reader continuity or guarantees against power-loss filesystem corruption. License assertions are not legal verification.

## Approval Gates

The local build, including replacing any previously reviewed package files, requires current `--accept-risk` and a matching reviewed plan. Creating that plan never grants approval. Fork modification, host integration, VSIX tooling installation, packaging, extension installation, external asset upload, publication, commits, pushes, and deployment remain separate approvals and are not executed here.

## Composition and Dependencies

### Prerequisite Dependencies

- clarify-the-ask
- policy-engine

### Optional Composition

`user-personalization` may supply already-approved visual preferences, but no profile is required for operator-supplied grids. `project-visual-storytelling` remains the owner of project diagrams and generated project visuals; it is not a core sprite dependency and supplies no automatic remote-image path. `agent-builder` may consume the static icon handoff without gaining sprite-generation or host-integration authority.

## Examples

Use `pso companion <capabilities|validate|plan|build|verify|help>` when dispatched through the framework CLI; the helper accepts the same remaining flags. `pso companion --help` is an equivalent read-only help entry point. All commands emit JSON, including help and errors; `--json` is accepted explicitly. All requests, plans, and output packages belong to the target project.

Minimal original-art request:

```json
{
  "schemaVersion": "1.0.0",
  "id": "little-lantern",
  "name": "Little Lantern",
  "target": "local-chat-webview",
  "provenance": {
    "kind": "original", "creator": "Your public artist name", "license": "CC0-1.0",
    "redistributionAllowed": true, "rightsConfirmed": true,
    "attribution": "Original artwork created for this project."
  },
  "frameWidth": 3, "frameHeight": 3, "anchor": { "x": 1, "y": 3 },
  "source": {
    "kind": "pixel-grid",
    "palette": { ".": "#00000000", "o": "#FFA000FF", "y": "#FFE080FF" },
    "frames": [[".o.", "oyo", ".o."], [".y.", "yoy", ".y."]]
  },
  "animations": {
    "idle": { "frames": [{ "index": 0, "durationMs": 200 }, { "index": 1, "durationMs": 300 }], "loop": true }
  },
  "defaultState": "idle",
  "altText": "An original gold pixel lantern with a transparent background.",
  "accessibility": { "reducedMotion": "static", "staticFrame": 0 }
}
```

For a PNG import, use `provenance.kind: licensed-local`, set `provenance.licenseFile` to a local notice, and replace `source` with `{"kind":"png","path":"art/sprite.png","columns":2,"frameCount":2}`. Keep every other geometry, animation, rights, and accessibility requirement.

## Related commands

- Run the skill with /visual-companion-builder.
- Open this help with /visual-companion-builder-help.
- Inspect the full contract with @.github/skills/visual-companion-builder/SKILL.md.
