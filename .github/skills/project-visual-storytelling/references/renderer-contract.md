# Local Renderer Contract

## Purpose

Render a validated project whiteboard or miniature diorama as a repository-local PNG through Blender Cycles without accepting executable project content, arbitrary output paths, downloaded assets, or network processing.

## Capability

- `doctor` reports both adapters: it detects an operator-installed Blender executable and checks whether MAI-Image has safe configuration plus fresh Azure Government discovery evidence.
- `preflight` reserves a unique run directory and writes `render-context.json`, which binds the run ID, output type, Project Understanding digest, destination, and profile digest.
- The agent creates `render-plan.json` inside that assigned directory using `schemas/project-visual-scene.schema.json`.
- `render` validates the context, current profile, source digest, dimensions, provider preference, bounded prompt, palette, labels, evidence paths, geometry bounds, and current profile-timezone date before selecting an adapter.
- `auto` may call MAI-Image only when qualification succeeds and the current invocation contains `--external-processing-approved true`; otherwise it calls Blender. `mai-image` fails closed when unavailable, while `blender-cycles` never invokes cloud processing.
- Blender starts with factory settings, consumes only the validated JSON plan, creates procedural geometry and materials, and writes the fixed PNG and `renderer-qualification.json` paths.
- `verify` checks the PNG signature and dimensions, meaningful pixel variation, plan digest, renderer class, Cycles engine, geometry, materials, lights, perspective camera, and the renderer's exact text record.

## Trust Boundary

- Blender is an optional operator-installed prerequisite and is never downloaded, bundled, or installed by this skill.
- MAI-Image is an optional Microsoft Foundry deployment, not a capability inherited from the VS Code model picker. The adapter never deploys a model or resource.
- MAI-Image accepts only an `https://<resource>.services.ai.azure.us` endpoint, a supported MAI model identifier, fresh Azure Government discovery evidence for the configured region, and Microsoft Entra tokens obtained from Azure CLI. API keys are unsupported.
- `BLENDER_EXECUTABLE` may identify an operator-approved executable when Blender is not on `PATH`; repository content cannot set it.
- Render plans are data, never Python or Blender expressions. Unknown fields, absolute paths, parent traversal, control characters, excessive elements, and out-of-range geometry fail validation.
- The renderer uses no reference pixels, external textures, plugins, scripts, URLs, network services, npm packages, or pip packages.
- Blender uses no network service. MAI uses only its qualified Government endpoint, submits the bounded prompt with web grounding disabled, and supplies no reference pixels.
- Output remains beneath the preflight-assigned `artifacts/project-visual-storytelling/<run-id>/` directory.

## Render Plan

The plan contains one visual type, source digest, canvas, provider preference, bounded image prompt, title, exact profile signature, current date, semantic palette, and one to twelve evidence-bound elements. Each element has a unique ID, short label, repository-relative evidence path, semantic role, supported primitive shape, bounded position, and bounded size.

Whiteboards render as physical framed boards with raised notes and deterministic text. Dioramas render as bounded handcrafted miniature exhibits with procedural paper, wood, clay, and painted-card materials. Both use modeled geometry, a perspective camera, multiple area lights, physical occlusion, cast shadows, contact shadows, and Cycles denoising.

## Qualification And Review

Automated verification returns `requires-review`, not `complete`. Blender output can become the final PNG after a reviewer confirms physical depth, tactile material fidelity, cast and contact shadows, clipping, overlap, label legibility, exact signature and date, and evidence-mapping coverage. MAI output is named `<visual>-mai-candidate.png`; it cannot be delivered as the final visual until deterministic attribution and exact-text checks are completed. A failed render or verification removes or rejects the PNG and preserves the specification-and-alt-text fallback.