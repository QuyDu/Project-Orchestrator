---
applyTo: "**/*.ts,**/*.tsx,**/*.js,**/*.mjs,**/*.cjs"
description: "JavaScript and TypeScript language safety, module compatibility, promises, input validation, and resource cleanup."
---

# TypeScript and JavaScript Instructions

Reviewed: 2026-10-28

## Language and Compatibility

- Use modern syntax supported by the project's runtime/browser targets. Prefer ES modules for new compatible boundaries, but preserve existing CommonJS, bundler, and public import/export contracts rather than performing an implicit migration.
- Prefer `const`, use `let` for reassignment, and use descriptive names and strict equality unless intentional coercion is documented. Model absent, empty, zero, and false values explicitly; use nullish operations when truthiness would discard valid data.
- For TypeScript, prefer `strict` checking, `unknown` plus narrowing at trust boundaries, and justified exceptions rather than blanket `any` or unchecked assertions. Preserve the existing migration plan; JavaScript does not require adding a TypeScript toolchain.
- Treat types as compile-time checks, not runtime input validation. Validate external data with the project's schema/validation tools before use and guard untrusted object merges and dynamic property access.

## Async and Resource Safety

- Await promises or explicitly handle success and rejection; do not create floating background work. Bound concurrent work and use supported cancellation/timeouts.
- Catch only failures that can be handled meaningfully; otherwise propagate sanitized context and preserve the cause. Do not hide unexpected errors in empty handlers.
- Release owned files, streams, timers, listeners, and transports in `finally` or supported disposal APIs. Test failure and cancellation paths, not only successful cleanup.
- Avoid dynamic evaluation, string-bodied timers, unsafe HTML insertion, and shell interpolation of untrusted data. Apply browser-safe DOM APIs or validated process argument arrays as appropriate to the actual runtime.
- Keep modules and functions cohesive and follow existing formatting. Do not rewrite unrelated code or add abstractions solely to satisfy a style preference.

## Verification

Use the project's configured tests, linter, and type checker. Verify runtime/browser support for new APIs; typechecking, formatting, and unit tests address different risks. Consult `node.instructions.md` for Node.js runtime and package-management work.

## References

- [MDN JavaScript guide](https://developer.mozilla.org/en-US/docs/Web/JavaScript/Guide)
- [Microsoft TypeScript strict checking](https://www.typescriptlang.org/tsconfig/strict.html)
