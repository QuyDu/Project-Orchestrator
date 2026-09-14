---
name: linkedin-post
description: Analyze the current project and prepare an evidence-grounded, profile-aware LinkedIn short-form post draft that follows platform best practices, including update posts based on project history.
lifecycle: draft
confidence: low
---

# linkedin-post

## Purpose

Analyze the current project and prepare a concise, accurate, profile-aware LinkedIn short-form post draft that explains what the project is, why it matters, and what has changed. The default audience is Microsoft employees and the broader Microsoft technical community. Every draft must identify the author's content sweet spot, follow the packaged LinkedIn best-practices baseline, and remain reviewable rather than being published.

## Preconditions

- Read repository instructions and the current project handoff first.
- Validate `.skills-orchestrator/user-personalization.json` through `user-personalization`. If it is missing or invalid, invoke that skill and keep drafting blocked until the profile is valid.
- Read the current `docs/PROJECT-GUIDE.md` and `reports/project-guide.json` before drafting. They are the canonical shared project narrative; refresh them through `documentation-builder` when missing or stale.
- Inspect the project README, architecture documentation, current status, recent changes, and relevant validation evidence.
- Read `reports/linkedin-post-history.md` when present.
- Read `references/linkedin-best-practices.md` and treat its short-form post rules as the LinkedIn-specific baseline. Current safety requirements and current-turn instructions still take precedence.
- Determine whether an approved, public-safe image or video is available for direct upload with the post.
- Confirm that the output is a draft; never publish directly to LinkedIn.

## Inputs

- Current project files and authoritative reports.
- A valid `.skills-orchestrator/user-personalization.json`, using only the fields needed to establish role, expertise, interests, target audience, voice, content defaults, and safety boundaries.
- Optional `--update` parameter.
- Optional tone: `--technical`, `--executive`, or `--community`.
- Optional audience, objective, length direction, or approved public-safe media from the user.

## Approved Tools and Resources

- Read-only repository inspection.
- Git history and diffs when available.
- Existing project documentation, handoff, audit, test, and release reports.
- `reports/linkedin-post-history.md` as the previous-post history source for updates.
- `references/linkedin-best-practices.md` as the packaged drafting and readiness baseline.
- User-approved media metadata or repository-local public-safe media evidence. This skill may prepare a media brief but may not upload or publish an asset.

## Read and Write Boundaries

- Read project files, reports, the packaged reference, and only the personalization fields needed to ground the draft and voice.
- Write only `reports/linkedin-post-draft.md`.
- Do not publish, schedule, send, or submit content to LinkedIn or any other external service.
- Do not expose the profile itself or quote non-output profile metadata; apply approved voice and perspective as behavior.
- Do not include secrets, private credentials, private URLs, sensitive personal data, unsupported claims, internal-only information, or confidential project details.

## Procedure

1. Validate the User Personalization profile and read the project handoff and canonical project guide, identifying the current objective, status, audience, and notable evidence.
2. Verify the guide's material claims against current README, architecture, recent changes, tests, and release evidence; do not treat a stale guide as authoritative.
3. Establish one content sweet spot at the intersection of the author's approved role, expertise or interests, the relevant Microsoft mission or business outcome, and a specific target audience. Narrow or block the draft when that intersection is unsupported.
4. Without `--update`, describe the project, its problem, approach, current capabilities, and next step. With `--update`, read `reports/linkedin-post-history.md` and describe only verified new features, improvements, milestones, or lessons since the latest recorded post.
5. Select the requested tone; default to community-focused and technically accessible. Apply the profile's voice without inventing personal experience, opinions, relationships, customer impact, or executive endorsement.
6. Select one primary topic and one reader outcome. Assess whether the available evidence is sufficient to review the post against the current national or global conversation; when it is not, add a publication-review item and mark the draft `Not ready`.
7. Draft one LinkedIn short-form post that opens with a brief why-care/why-share hook, expresses an authentic and evidence-supported point of view, presents key points as readable bullets, and ends with a call to action or discussion question.
8. Keep the complete publishable post body, including whitespace, links, and hashtags, at or below 3,000 characters. End with three to five relevant hashtags. This LinkedIn-specific range overrides a conflicting profile hashtag count, while compatible profile length and style preferences still apply.
9. Identify an approved, public-safe image or video intended for direct upload with the post. If none is available, include an actionable media brief with format, concept, evidence boundary, and alt text, and mark the draft `Not ready`; never imply that media was created, approved, or embedded when it was not.
10. Structure `reports/linkedin-post-draft.md` with draft metadata, the publishable post, media plan, evidence and claims review, and publication review. Metadata must state tone, audience, objective, content sweet spot, primary topic, character count, hashtag count, media status, and readiness.
11. Review the draft for confidentiality, unsupported claims, sensitive timing, cultural context, negative references to coworkers or brand initiatives, venting, echo-chamber framing, and employee concerns that belong in internal channels. Remove unsafe content or mark unresolved items `Not ready`.
12. List claims and assets that require user review, including internal names, metrics, links, screenshots, publication wording, context assumptions, and media rights or approval.
13. Recount characters and hashtags after final edits, verify that hashtags are the final post content, then save the draft and present it to the user for approval or revision.
14. After the user publishes a post outside this skill, record its date, summary, and approved public link in `reports/linkedin-post-history.md` only when the user requests that record update.

## Validation

- The User Personalization profile is valid, and the draft records one supported content sweet spot joining role, expertise or interests, business or mission relevance, and target audience.
- Every material claim is supported by current project evidence.
- An update draft distinguishes new changes from the previous history entry.
- The publishable post focuses on one primary topic, opens with a concise why-care/why-share hook, uses readable bullets, and ends with a call to action or discussion question.
- Personal experience and point of view are used only when supported by the validated profile or user-provided evidence; no experience, opinion, relationship, or endorsement is invented.
- The complete publishable post is no more than 3,000 characters, and its final content is three to five relevant hashtags even when the profile requests another count.
- An approved public-safe image or video is identified for direct upload, or the draft contains a media brief with alt text and has readiness Not ready.
- The publication review addresses the national or global conversation, confidentiality, sensitive timing, cultural context, media rights, and whether employee concerns belong in internal channels.
- The draft contains no secrets, confidential or internal-only details, private URLs, sensitive personal data, invented metrics, venting, or unsupported negative claims about coworkers or brand initiatives.
- The selected tone, audience, objective, content sweet spot, primary topic, character count, hashtag count, media status, and readiness are stated in the draft metadata.
- The output exists at `reports/linkedin-post-draft.md`.
- No external publication action was performed.

## Outputs

- `reports/linkedin-post-draft.md`

## Failure Behavior

- Stop and invoke `user-personalization` when the profile is missing or invalid; never substitute a built-in persona.
- Stop and identify missing evidence when the project cannot support a factual post.
- Narrow or block a draft whose content sweet spot, single-topic focus, authentic point of view, or public context cannot be supported.
- Do not infer unpublished outcomes, adoption, customer impact, performance, or security assurance.
- When approved media is unavailable, preserve the useful text draft and media brief but mark it Not ready rather than claiming the post package is complete.
- When media rights, confidentiality, sensitive timing, or national or global context remains unresolved, mark the draft Not ready and name the required review.
- If `--update` is requested but no history file exists, state that comparison is unavailable and prepare a clearly labeled first-post draft only with user approval.
- Preserve existing history; never overwrite it as part of draft generation.

## Approval Gates

The skill produces a draft only. The user must review and explicitly approve the post text, public claims, context assessment, links, and media before copying or publishing it. LinkedIn publication, media upload, external sharing, analytics retrieval, and public disclosure are outside this skill and require separate approval.

## Composition and Dependencies

- project-handoff
- documentation-builder
- user-personalization

## Examples

- `/linkedin-post`
- `/linkedin-post --technical`
- `/linkedin-post --update --community`
- `/linkedin-post --update --executive`
- Draft a technical update with a public-safe architecture image; when the image is not yet approved, include its media brief and return `Not ready`.
