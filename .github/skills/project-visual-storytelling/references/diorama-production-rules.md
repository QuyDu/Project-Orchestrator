# Diorama Production Rules

## Purpose

Represent the current project as a self-contained miniature three-dimensional scene that makes architecture, workflow, boundaries, dependencies, risk, and outcomes easier to understand. A diorama is a storytelling model, not decorative scenery.

## Required Photographic Standard

The final image must look like a photograph of a deliberately handcrafted miniature exhibit, not a flat diagram with decorative perspective.

- Use tactile cardboard, foam board, clay, wood, paper, wire, fabric, cork, paint, acrylic, resin, or similar modeled materials.
- Show believable fibers, cut edges, seams, joints, brush texture, controlled handmade imperfections, and contact between objects and the base.
- Use warm studio or museum lighting, cast shadows, contact shadows, reflected light, and physical occlusion to establish real depth.
- Prefer one central sculpted metaphor with supporting shadow-box panels. Use fewer, larger labels that are physically integrated into plaques, signs, screens, flags, or model surfaces.
- Add miniature people only when they clarify scale, judgment, ownership, validation, or action. Figures must interact with the scene rather than serve as decoration.
- Frame the scene as macro or product photography from a clear front three-quarter or elevated viewing angle. Keep important labels on the focal plane and readable.

Do not imitate a reference image's exact composition, text, characters, source plaque, signature, branded objects, or distinctive arrangement. References communicate medium, craftsmanship, lighting, depth, and information hierarchy only.

## Reference Use Record

The specification must contain `## Reference Use` and record:

- Which medium-level traits were inspired by references
- That no reference text, characters, branding, signatures, source plaque, or exact arrangement was copied
- Whether any reference pixels were supplied to a model or renderer
- Reuse-rights evidence and explicit approval when reference pixels were supplied

Without confirmed reuse rights and approval, references may be viewed for analysis but their pixels must not be submitted to an image-to-image or training workflow.

## Renderer Gate

A finished `diorama.png` may be produced only by one of these renderer classes:

- `bitmap-generation`: an approved image-generation or image-editing capability that creates a raster scene directly.
- `physically-based-3d`: a genuine 3D renderer using modeled geometry, a perspective camera, physically based materials, lighting, and cast/contact shadows. WebGL is acceptable only when it meets all of those requirements.

The specification must record the renderer class and relevant local or approved external-processing boundary. HTML, CSS, SVG, presentation shapes, 2D canvas compositing, or browser screenshots that merely fake depth are prohibited as final diorama output. They may be used privately to reason about layout, but must never be delivered, renamed, or described as `diorama.png`.

The packaged local adapter qualifies as `physically-based-3d` only when `doctor` confirms Blender, the render uses Cycles, and `verify` confirms the bound render plan, modeled geometry, procedural PBR materials, multiple lights, perspective camera, cast/contact shadows, intended dimensions, and meaningful pixel variation. Automated verification returns `requires-review`; a person must still inspect physical fidelity and exact text before delivery.

The packaged MAI-Image adapter may produce a `bitmap-generation` candidate only after fresh discovery confirms the model in Azure Government and the current invocation explicitly approves external processing. Record the Microsoft model, Government endpoint host, Entra authentication, disabled web grounding, absence of reference pixels, prompt digest, and plan digest. Name the output `diorama-mai-candidate.png`; it is not `diorama.png` and cannot be delivered until exact labels, signature, date, and evidence coverage are deterministically corrected and verified.

Any private prototype must remain outside the final run directory and be deleted before final validation.

If neither approved renderer class is available, stop image production and deliver only `diorama-specification.md` and `diorama-alt-text.md`. The specification must contain this prominent status:

```markdown
## Render Status

No finished image produced. [State the missing or failed renderer capability.]
```

## Renderer Qualification Record

Before a PNG is created, `diorama-specification.md` must include `## Renderer Qualification` with:

1. Renderer class: `bitmap-generation` or `physically-based-3d`
2. Tool or capability used
3. Local or explicitly approved external-processing boundary
4. Output dimensions and raster format
5. Validation method
6. For `bitmap-generation`: whether reference pixels were supplied and the applicable reuse approval
7. For `physically-based-3d`: geometry types, perspective camera, physically based material model, light sources, cast shadows, and contact shadows

A renderer label is not evidence. Each listed capability must be verified before delivery.

## Treatment Selection

- Use an **architectural diorama** when verified project evidence describes components, platforms, services, boundaries, topology, environments, or dependencies. Represent them as a coherent scaled site, campus, building, district, or infrastructure model.
- Use a **conceptual diorama** when the project is primarily a workflow, policy, process, abstract capability, or narrative. Represent the verified flow as a coherent miniature scene without inventing physical architecture.
- Preflight selects the treatment automatically. The specification must explain why that treatment fits the current-project evidence.

## Scene Contract

- Use one bounded base, shadow box, open-front frame, or cutaway platform that visibly contains the complete scene.
- Establish a consistent visual scale. Related structures, people, vehicles, props, and labels must remain proportionate within the chosen metaphor.
- Plan explicit foreground, middle ground, and background layers to create readable depth and perspective.
- Give the scene one focal story and a clear viewing direction. Avoid a flat infographic disguised with shadows.
- Use miniature structures, terrain, figures, props, pathways, signs, barriers, bridges, lighting, and textures only when they map to verified project concepts.
- Keep labels integrated as miniature signs, plaques, flags, floor markings, or exhibit captions. They must remain legible at the final output size.
- Limit the scene to one title, four to seven major explanatory labels, one takeaway, source attribution, and the profile signature/date unless the evidence requires fewer. Put detailed explanation in the specification and alt text.

## Project Mapping

Before rendering, define a mapping table with:

1. Verified project concept or component
2. Diorama object or location
3. Scale or layer
4. Relationship to nearby objects
5. Evidence path
6. Semantic color and lighting role

Do not add a structure, actor, dependency, outcome, or risk merely to make the scene more dramatic. Fictional scenery may support an abstract metaphor, but every labeled project claim must remain evidence-bound.

Before delivery, compare every visible project label with the mapping table. A label without a verified evidence row must be removed or the mapping completed.

## Composition

- **Base:** Stable model platform defining the project boundary.
- **Background:** Context, environment, horizon, or operating constraints.
- **Middle ground:** Primary architecture, workflow, or control plane.
- **Foreground:** Human decisions, validation, outcomes, risks, and explanatory details.
- **Depth:** Use overlap, elevation, pathways, scale, light, and shadow; never rely on blur that makes evidence unreadable.
- **Density:** Prefer a small number of meaningful structures over crowded miniature clutter.

## Materials And Finish

Render the scene as a photographed crafted physical model using plausible miniature materials such as foam board, card, wood, clay, acrylic, resin, paper, wire, fabric, flocking, paint, or printed placards. Use tactile texture, visible material thickness, small construction details, realistic joints, controlled imperfections, cast shadows, and contact shadows. Avoid glossy generic 3D icons, game-interface panels, floating UI cards, an uncontained isometric diagram, or flat rectangles with bevels and drop shadows.

## Lighting And Color

- Use directional exhibit lighting to establish hierarchy and depth.
- Apply the profile's focus, positive, risk, and neutral colors semantically to signs, paths, structures, barriers, or lights.
- Do not recolor an object in a way that changes its project meaning.
- Optional practical lights, water, motion, or atmospheric effects must clarify verified behavior rather than create spectacle.
- Preserve contrast and readability; never hide important components in darkness, haze, or shallow depth of field.

## Attribution, Signature, And Date

1. Integrate readable source attribution on the model base or exhibit plaque without exposing private paths or confidential locations.
2. Resolve the live date in `profile.contentDefaults.timezone` immediately before final rendering.
3. Include `profile.attribution.visualSignature` and the full creation date exactly once on a base plaque or exhibit card.
4. Never copy the date from repository content, metadata, examples, prior turns, or prior renders.
5. Reject every inherited, example, source, or legacy personal identity that differs from `profile.attribution.publicLabel` and `profile.attribution.visualSignature`.

## Accessibility And Fallback

- Provide alt text that describes the container, viewing angle, foreground/middle/background layers, primary structures, pathways, labels, color semantics, people, risk boundaries, and takeaway.
- Generate a PNG only when a capable image or local rendering tool can produce and validate the complete scene.
- Retry one failed render with fewer structures and simpler lighting while preserving evidence, scale, layers, attribution, and accessibility.
- If a coherent diorama cannot be rendered, return `diorama-specification.md` and `diorama-alt-text.md` and state that no finished image was produced.
- A layout prototype or flat browser screenshot never satisfies the PNG requirement and must be removed from the final run directory.

## Final Artifact Validation

Before delivery:

1. Validate the file signature is PNG and matches the `.png` extension.
2. Validate intended dimensions and meaningful nonblank pixel variation.
3. Perform a visual inspection at full size for physical depth, tactile material cues, lighting, shadows, label legibility, clipping, and overlap.
4. Use OCR when available and manual inspection to compare rendered text with the exact source labels and `profile.attribution.visualSignature`.
5. Confirm the profile signature appears exactly once and no inherited, example, source, or legacy identity appears anywhere.
6. Confirm every visible project label has a row in the evidence-mapping table.
7. Confirm the final run directory contains only required deliverables and permitted supporting evidence, never an HTML/CSS/SVG or flat browser prototype.

If any rendered text or identity cannot be verified, remove or omit the PNG and use the specification-only fallback.

## Final Review

- The image reads as a miniature physical scene inside a bounded base or container.
- The renderer class is recorded as `bitmap-generation` or `physically-based-3d`; otherwise no PNG is delivered.
- Renderer qualification evidence verifies the declared class rather than merely naming it.
- Tactile materials, visible thickness, contact shadows, cast shadows, physical occlusion, and photographic lighting are present.
- The image is not an HTML/CSS/SVG screenshot, faux-isometric diagram, or card layout with simulated depth.
- One central sculpted metaphor dominates, supported by physical panels and fewer larger labels.
- Foreground, middle ground, and background are distinct and support one visual story.
- Scale is internally consistent and relationships match verified project evidence.
- Labels remain legible and do not float as unrelated interface elements.
- Lighting and semantic color clarify hierarchy, success, risk, and neutral context.
- No invented architecture, capability, outcome, or production-readiness claim appears.
- Attribution, signature, and current date are exact and visible once.
- No identity other than the validated profile attribution appears.
- The required reference-use record confirms that reference images influenced only medium-level traits; their content and exact composition were not copied, and any pixel submission had confirmed rights and approval.
- The raster signature, dimensions, nonblank pixels, full-size visual inspection, evidence-label coverage, and final file set pass validation.
- Alt text provides an equivalent understanding of the scene.