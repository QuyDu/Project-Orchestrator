# Content Package Rules

## Modes

- **Evaluation:** Evidence categories, strongest support, limitation, uncertainty, and practical disposition.
- **Summary:** Concise core idea, evidence, implications, and takeaway.
- **Explainer:** Plain-language mechanism, preserved terminology, assumptions, tradeoffs, and example.
- **Article:** Audience-specific narrative with attributed evidence and practical conclusion.
- **Action plan:** Decisions, actions, owners and dates only when supplied, dependencies, missing information, and validation.
- **LinkedIn draft:** Reviewable external draft; never publish or claim publication.
- **Teams message:** Recommended title, author-focused BLUF, configured hashtags, and optional whiteboard; never send.
- **Whiteboard:** Generated accessible image when supported, otherwise a complete specification and alt text.
- **Diorama:** Generated accessible miniature three-dimensional project scene when `--visual-style diorama` is selected, otherwise a complete diorama specification and alt text.
- **Full package:** Five title options, recommended title, BLUF, translation, meaningful limitation, memorable line, post, readiness assessment, and the selected visual or specification.

## Visual Style

- `--visual-style whiteboard` is the default for `whiteboard`, `whiteboard-specification`, and `full-package` output.
- `--visual-style diorama` creates a miniature scene governed by `diorama-production-rules.md`.
- Do not accept visual style for nonvisual modes.
- Use the canonical spelling `diorama`; reject `diarama` rather than silently normalizing it.
- The visual-style choice applies only to the current run and does not modify User Personalization.

## Personalization

- Use only profile fields relevant to the requested mode.
- Replace fixed personal-name tokens with `profile.attribution.publicLabel` or `profile.attribution.visualSignature`.
- Do not mimic a named living author or infer traits the user did not provide.
- Current-turn audience, tone, length, and format instructions override profile defaults.
- Safety, evidence, accessibility, and repository ownership rules cannot be overridden by profile preferences.

## External Readiness

Before returning an external-facing draft, check:

- Confidential, restricted, customer, and private project details are absent.
- Material claims are supported and attributed.
- Quotations are necessary, brief, and not a substitute for original analysis.
- The draft does not imply employer endorsement or speak for an organization without authorization.
- Names, links, dates, metrics, screenshots, and publication wording are marked for user review when needed.
- The result is labeled `Ready`, `Ready with edits`, or `Not ready`, with the minimum necessary corrections.

External publication requires approval. Publication, posting, sending, and uploading are never part of a content package.