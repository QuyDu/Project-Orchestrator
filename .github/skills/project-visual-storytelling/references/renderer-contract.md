# Image Generation Contract

## Purpose

Render a validated project whiteboard or miniature diorama as a repository-local PNG through a qualified Azure Government image deployment without accepting executable project content, arbitrary output paths, or downloaded assets.

## Capability

- `doctor` reports Azure OpenAI and MAI-Image qualification from safe configuration plus fresh Azure Government discovery evidence.
- `create` accepts one bounded natural-language request and performs project refresh, preflight, plan creation, rendering, and verification in one invocation. It requires current-invocation external-processing approval and fails clearly when no image model qualifies.
- `preflight` reserves a unique run directory and writes `render-context.json`, which binds the run ID, output type, Project Understanding digest, destination, and profile digest.
- The agent creates `render-plan.json` inside that assigned directory using `schemas/project-visual-scene.schema.json`.
- `render` validates the context, current profile, source digest, dimensions, provider preference, bounded prompt, palette, labels, evidence paths, geometry bounds, and current profile-timezone date before selecting an adapter.
- `auto` selects qualified dimension-compatible Azure OpenAI first, then MAI-Image. An adapter is called only when the current invocation contains `--external-processing-approved true`; explicit provider selections fail closed when unavailable or dimension-incompatible.
- `verify` checks the PNG signature and dimensions, plan digest, provider class, Government processing boundary, Microsoft Entra authentication, web-grounding state, and reference-pixel state.

## Trust Boundary

- Azure OpenAI image generation is an optional existing deployment, not a capability inherited from the VS Code model picker. It accepts only an `https://<resource>.openai.azure.us` endpoint, a discovery-selected generally available GPT Image 2 model with a matching existing deployment aggregate, exact supported dimensions, and Microsoft Entra tokens obtained from Azure CLI. API keys are unsupported.
- MAI-Image is an optional Microsoft Foundry deployment, not a capability inherited from the VS Code model picker. The adapter never deploys a model or resource.
- MAI-Image accepts only an `https://<resource>.services.ai.azure.us` endpoint, a supported MAI model identifier, fresh Azure Government discovery evidence for the configured region, and Microsoft Entra tokens obtained from Azure CLI. API keys are unsupported.
- Render plans are bounded data, never executable expressions. Unknown fields, absolute paths, parent traversal, control characters, excessive elements, and out-of-range geometry fail validation.
- The adapters use no reference pixels, external textures, plugins, user-supplied scripts, arbitrary URLs, or downloaded rendering assets.
- Azure OpenAI and MAI use only their qualified Government endpoints, submit the bounded prompt with web grounding disabled, and supply no reference pixels.
- Output remains beneath the preflight-assigned `artifacts/project-visual-storytelling/<run-id>/` directory.

## Render Plan

The plan contains one visual type, source digest, canvas, provider preference, bounded image prompt, title, exact profile signature, current date, semantic palette, and one to twelve evidence-bound elements. Each element has a unique ID, short label, concise caption, repository-relative evidence path, semantic role, supported physical metaphor, bounded position, and bounded size.

Whiteboards render as photographed handmade foam-board displays with raised notes, dimensional props, natural marker lettering, and clear visual hierarchy. Dioramas render as macro photographs of bounded handcrafted miniature exhibits made from paper, wood, clay, foam, and painted card. Both require physical occlusion, cast and contact shadows, coherent scale, legible bounded labels, and evidence-backed captions.

## Qualification And Review

Automated verification returns `requires-review`, not `complete`. Azure OpenAI and MAI output is named `<visual>-azure-openai-candidate.png` or `<visual>-mai-candidate.png`; it cannot be delivered as the final visual until a reviewer confirms photographic realism, tactile material fidelity, physical depth, clipping, overlap, label and caption legibility, exact signature and date, and evidence-mapping coverage. A failed render or verification removes or rejects the PNG and returns a failed render result.