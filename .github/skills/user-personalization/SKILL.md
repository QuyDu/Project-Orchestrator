---
name: user-personalization
description: Build, validate, and maintain the local User Personalization file that supplies reusable voice, perspective, content, visual, and safety preferences. Use before any skill creates personalized output when the profile is missing or invalid.
lifecycle: draft
confidence: low
---

# user-personalization

## Purpose

Own the reusable User Personalization profile at `.skills-orchestrator/user-personalization.json` so other skills can apply consistent, user-approved preferences without embedding one person's identity or style in reusable instructions.

## Preconditions

- Read repository instructions before collecting or writing preferences.
- Run `node .github/skills/user-personalization/scripts/user-personalization.mjs status --project .` before a consuming skill uses personalization.
- Treat a missing or invalid profile as a blocking prerequisite for personalized output.
- Collect only non-secret, publishable preferences and professional context; never request credentials, private identifiers, customer data, health or financial data, or protected personal attributes.

## Inputs

- User-approved answers to `references/personalization-questionnaire.md`.
- Optional existing `.skills-orchestrator/user-personalization.json` when the user requests an update.
- The target project's `schemas/user-personalization.schema.json`.
- Explicit approval to create or replace the local profile.

## Approved Tools and Resources

- Use the platform's human-input mechanism to ask one bounded batch of unanswered questions at a time.
- Use `.github/skills/user-personalization/scripts/user-personalization.mjs` for status, validation, and transactional writes.
- Use local file inspection only; this skill does not browse for personal information or infer preferences from external accounts.
- Do not call publishing, messaging, deployment, identity, or cloud-mutation tools.

## Read and Write Boundaries

- Read the questionnaire, schema, and existing local profile when present.
- Write only `.skills-orchestrator/user-personalization.json` and temporary files under `.skills-orchestrator/` during an approved transaction.
- Keep the profile local and Git-ignored. Never copy profile values into framework reports, logs, fixtures, examples, source control, or unrelated documentation; consuming skills may use only the fields required by the user's requested personalized output.
- Other skills may read the validated profile but must not create, repair, or update it.

## Procedure

1. Run `status --project .`. Continue immediately when the profile is valid; do not repeat the interview.
2. When the profile is missing or invalid, stop the requesting personalized workflow and explain that this prerequisite must be completed first.
3. Read `references/personalization-questionnaire.md` and ask unanswered questions in bounded batches permitted by the host's clarification policy. Allow `skip` for every optional question and never infer an answer from browsing, account data, or unrelated repository content.
4. Use an attribution label or pseudonym supplied by the user wherever reusable source material previously contained a person's name. Do not embed a real person's identity in this skill package.
5. Map the answers to schema fields, set `schemaVersion` to `1.0.0`, set `updatedAt` to the current ISO 8601 date-time, apply documented defaults only where the questionnaire permits them, and show a concise profile summary without exposing unnecessary detail.
6. Require explicit approval before the first write or any replacement. A request to generate personalized content does not itself approve profile persistence.
7. Create a candidate JSON file inside `.skills-orchestrator/`, run `validate --project . --input <candidate>`, and correct every reported defect without weakening validation.
8. Run `apply --project . --input <candidate> --approve`. The helper rejects unknown fields, secret-like content, unsafe paths, symbolic links, concurrent writes, and invalid profile values.
9. Run `status --project .` again and resume the dependent workflow only when it reports `valid`.

## Validation

- The profile validates against `schemas/user-personalization.schema.json` and contains no unknown fields.
- Required safety controls remain `true`: untrusted sources cannot provide instructions, confidential content is excluded, external publication requires approval, attribution is required, and accessible alternatives are required.
- The profile contains no secret-like material, private identifiers, tenant or subscription IDs, email addresses, or credential-bearing URLs.
- The final file is a real file under `.skills-orchestrator/`, is not a symbolic link, and was written transactionally with a lock.
- The project `.gitignore` explicitly ignores `.skills-orchestrator/` or the exact profile path before a profile is created or consumed.
- No profile value appears in tracked repository files or generated reports.

## Outputs

- `.skills-orchestrator/user-personalization.json`

## Failure Behavior

- Fail closed and leave the prior valid profile unchanged when validation or writing fails.
- If the interview is incomplete, identify the unanswered required questions and keep the dependent workflow blocked.
- If a user supplies sensitive material, do not persist or repeat it; ask for a non-sensitive preference or public-facing substitute.
- If the profile is invalid, never silently fall back to a built-in persona.

## Approval Gates

- Require explicit approval before creating or replacing `.skills-orchestrator/user-personalization.json`.
- Require separate approval before any dependent skill publishes, sends, uploads, or externally shares personalized content.
- Updating preferences never authorizes external publication or disclosure.

## Composition and Dependencies

- None

## Examples

- A missing profile causes the agent to ask the questionnaire before drafting a personalized article.
- A user chooses a public attribution label, professional lenses, voice traits, evidence standards, output defaults, and visual preferences, reviews the summary, and approves the local profile write.
- An existing valid profile is reused without repeating questions; the user can invoke this skill explicitly to revise it.