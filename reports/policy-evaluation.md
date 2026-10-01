# Versioned Delivery Policy

Decision: **allow with controls** for the current explicit version/date, commit and normal upstream push request.

Target: existing public QuyDu/Project-Orchestrator, origin/release/1.1.2.

- Current bounded review and required full validation must pass.
- Stage an explicit reviewed path list; exclude ignored profiles, credentials, temporary outputs and unrelated changes.
- No force push, branch rename, history rewrite, tag, GitHub Release, package publication or deployment.
- Stop on authentication/protection/non-fast-forward rejection; do not bypass protections.
- Include the required Copilot co-author trailer.
- Retain historical records and pending PNG scope honestly.
