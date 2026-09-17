# Whiteboard Production Rules

These rules apply when preflight reports `visualStyle: whiteboard`. Use `diorama-production-rules.md` when it reports `visualStyle: diorama`.

## Content Contract

- Ground every visible claim in the source and preserve uncertainty.
- Use the profile's public label and exact visual signature rather than any embedded person's name.
- Include readable source attribution without exposing private URLs or confidential locations.
- Provide concise alt text or an equivalent accessible description for every final visual.

## Composition

- Use the profile's preferred format and aesthetic.
- When enabled, use one dominant metaphor and no more than the configured maximum zones.
- Keep labels short, legible, and free of clipping. Put nuance in accompanying text rather than shrinking paragraphs onto the board.
- Use useful connectors, icons, figures, diagrams, or technical objects instead of decorative clutter.
- Render a front-facing product photograph of a handmade foam-board or workshop display with dimensional cut-paper panels, natural black marker lettering, restrained semantic accents, tactile fibers, small evidence-backed props, cast and contact shadows, and a clean information hierarchy.
- Avoid flat vector art, web dashboards, generic infographics, glossy interface cards, excessive text, or decorative objects that do not explain the project.

## Semantic Color

Map actual content to the profile's focus, positive, risk, and neutral colors before generation. Do not invent benefits or risks to force a color. Accents must not obscure, overwrite, recolor, or cross through text or objects.

## Signature And Date

1. Reserve one readable attribution card in the composition.
2. Resolve the live calendar date in `profile.contentDefaults.timezone` immediately before the final image is created or edited.
3. Insert `profile.attribution.visualSignature` and the full creation date exactly once.
4. Never copy the date from source text, metadata, examples, prior turns, or earlier images.
5. Inspect the final render character by character for missing, duplicated, stale, or clipped text.

## Generation And Fallback

- Generate or edit an image only through a qualified Azure Government image model after current-invocation approval.
- A discovery-selected Azure Government Azure OpenAI GPT Image 2 deployment may create the photorealistic raster candidate. Prompt it with the exact bounded title, labels, captions, attribution, and date from the render plan. Never deliver that candidate until all required text and evidence mappings are inspected at full size.
- A discovery-confirmed Azure Government MAI-Image deployment may create the photorealistic raster candidate under the same exact-text and review requirements.
- Put every title, label, caption, signature, and date in the validated render plan. Ask the image model to reproduce only that bounded text and reject invented claims, counts, identities, branding, or source lines.
- Treat automated renderer verification as `requires-review`; inspect the board at full size for text fidelity, clipping, overlap, reflections, physical depth, and evidence coverage.
- Retry one failed generation with a simplified prompt that preserves the message, attribution, accessibility, layout, and signature area.
- If generation or exact text correction still fails, fail the render and state clearly that no finished image was produced. Use `whiteboard-specification` explicitly when written content and alt text are the requested deliverables.
- Never represent an image specification, placeholder, or inaccessible render as a completed image.

## Final Review

- Source and uncertainty match the written output.
- Text is legible and unclipped.
- Attribution, signature, and creation date are exact.
- Color semantics match actual content.
- Alt text conveys the central idea, flow, risks, and takeaway.
- Confidential content and private source locations are absent.