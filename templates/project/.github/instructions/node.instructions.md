---
applyTo: "**/package.json,**/package-lock.json,**/npm-shrinkwrap.json,**/.npmrc,**/.node-version,**/.nvmrc,**/*.mjs,**/*.cjs"
description: "Node.js runtime, package management, asynchronous resource safety, and server security standards; not browser-only JavaScript rules."
---

# Node.js Instructions

Reviewed: 2026-10-28

Apply these rules to code that actually runs in Node.js, including build tools. Use the JavaScript guide for language rules; do not apply Node-only APIs to browser code.

## Runtime and Dependencies

- Respect `engines`, the package manager declaration, lockfiles, CI matrix, and existing ESM/CommonJS boundaries. Do not silently change the minimum runtime or module system.
- Use a supported release and prefer Active or Maintenance LTS for production. Verify the official schedule before selection; a framework's compatibility matrix is not a production LTS recommendation.
- Prefer built-ins when adequate. Review package provenance, maintenance, advisories, licenses, and install scripts before adding a dependency. Commit the selected package manager's lockfile and use its frozen/CI install mode, such as `npm ci` for npm.
- Do not run fetched package executables, lifecycle scripts, or package publication without the applicable approval. Never put tokens in package files, command arguments, or logs.

## Resource and Process Safety

- Keep request handlers nonblocking. Bound input sizes, regex work, concurrency, and CPU work; synchronous APIs can be reasonable for bounded startup/CLI tasks, not hot server paths.
- Handle rejected promises and stream/socket errors. Use cancellation and timeouts, respect stream backpressure, and release listeners, handles, and transports on success, failure, and cancellation.
- Invoke known executables with argument arrays and shell interpretation disabled. Validate paths and options, handle platform-specific launchers deliberately, and check exit codes, signals, timeouts, and output limits.
- Shut down servers and workers gracefully on supported termination signals. Do not claim cross-platform signal behavior without tests.
- Set explicit server timeout and payload limits, validate untrusted data before merging it, and keep debug inspectors off public production interfaces. Preserve TLS and authentication.

## Verification

Use the project's existing test runner and lint/typecheck commands. Exercise supported runtimes and failure/cancellation paths; audit dependencies using the approved workflow. Do not install new tooling or equate a clean dependency audit with application security assurance.

## References

- [Node.js release policy](https://nodejs.org/en/about/previous-releases)
- [Node.js security best practices](https://nodejs.org/en/learn/getting-started/security-best-practices)
- [Event-loop and worker-pool guidance](https://nodejs.org/en/learn/asynchronous-work/dont-block-the-event-loop)
