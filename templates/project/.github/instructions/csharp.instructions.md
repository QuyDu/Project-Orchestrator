---
applyTo: "**/*.cs"
description: "C# language conventions, nullable analysis, asynchronous APIs, ownership, and safe public-boundary design."
---

# C# Instructions

Reviewed: 2026-10-28

## Language and API Design

- Follow the repository's `.editorconfig`, naming, and layout conventions; Microsoft sample conventions are a useful baseline, not a requirement to reformat established code. Use only language features supported by the declared language version and target frameworks.
- Keep nullable reference analysis enabled where configured and validate public-boundary inputs. Do not silence nullable or analyzer findings with unjustified suppression or null-forgiving operators.
- Prefer cohesive methods, meaningful names, and immutable data where value semantics fit. Choose classes, records, interfaces, and inheritance according to behavior and compatibility rather than applying a blanket type preference.
- Use dependency injection when appropriate; do not replace explicit dependencies with a service locator. Preserve public API contracts and ownership conventions.

## Async, Ownership, and Security

- Use async I/O through the call chain, return `Task`/`Task<T>` for asynchronous APIs, and reserve `async void` for supported event handlers. Avoid blocking on tasks; propagate `CancellationToken` and distinguish cancellation from failure.
- Dispose resources that the current scope owns with `using`, `await using`, or `finally`. Do not dispose borrowed resources or services owned by a dependency-injection container.
- Catch specific exceptions that can be handled; preserve stack traces with `throw;` when rethrowing. Use suitable framework argument exceptions and keep sensitive details out of outward-facing errors.
- Use structured `ILogger` message templates and parameterized database access. Do not log credentials, personal data, or sensitive bodies, and do not construct SQL or shell commands from untrusted input.
- Follow `dotnet.instructions.md` for SDK/TFM policy, HTTP client lifetimes, hosting, dependency restoration, and platform validation.

## Verification

Run configured build, nullable/analyzer checks, and focused tests, including invalid input, disposal, cancellation, and async failure paths. Do not equate style conformity with correctness or security.

## References

- [Microsoft C# coding conventions and their scope](https://learn.microsoft.com/en-us/dotnet/csharp/fundamentals/coding-style/coding-conventions)
- [.NET testing best practices](https://learn.microsoft.com/en-us/dotnet/core/testing/unit-testing-best-practices)
