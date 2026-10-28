---
applyTo: "**/*.cs,**/*.csproj,**/*.fsproj,**/*.vbproj,**/*.sln,**/*.slnx,**/global.json,**/Directory.Build.props,**/Directory.Build.targets,**/Directory.Packages.props,**/NuGet.Config,**/nuget.config"
description: ".NET SDK, target-framework compatibility, hosting, analyzers, dependency management, and HTTP resource-lifetime standards."
---

# .NET Instructions

Reviewed: 2026-10-28

These are platform rules for .NET projects, including F# and Visual Basic. Apply the C# guide only to C# code; the framework's existing `csharp` provisioning tag also represents .NET project files.

## Compatibility and Build

- Respect `global.json`, target frameworks, runtime identifiers, SDK roll-forward policy, NuGet sources, central package management, and the project's support matrix. SDK and runtime versions are distinct; do not retarget or raise minimums as a style cleanup.
- Select supported releases using current Microsoft lifecycle guidance and the deployment platform's support. Prefer LTS for new production baselines when requirements allow; preserve approved STS or legacy compatibility explicitly.
- Keep nullable analysis and configured .NET analyzers effective. Use the repository's `.editorconfig` and warning policy; stage new warnings-as-errors deliberately rather than suppressing diagnostics or breaking unrelated builds.
- Review dependency advisories, licenses, and trusted sources; use lock/locked restore where configured. Keep credentials out of NuGet configuration and checked-in output.

## Hosting and Resource Lifetimes

- Match dependency-injection lifetimes to ownership. Do not capture scoped services in singletons or dispose services owned by the container.
- Use async I/O and propagate cancellation. Configure bounded timeouts and retry budgets; only retry operations that are safe to repeat and avoid multiplying SDK and application retries.
- Reuse HTTP connection pools: use short-lived clients from `IHttpClientFactory`, or appropriately long-lived clients with `SocketsHttpHandler.PooledConnectionLifetime`. Do not create and dispose an independently pooled client per request. Review cookie-container sharing and DNS changes for the chosen strategy.
- Use structured logging, validated configuration, and the host's graceful-shutdown lifecycle. Do not log secrets, personal data, or sensitive payloads. Validate untrusted input at application boundaries.

## Verification

Run the project's configured restore, build, analyzer/format checks, and tests for each supported target framework. Keep unit tests deterministic and separate from explicitly approved integration/cloud tests. A successful build or coverage percentage alone is not proof of correctness or security.

## References

- [.NET SDK and runtime versioning](https://learn.microsoft.com/en-us/dotnet/core/versions/)
- [Microsoft HttpClient lifetime guidance](https://learn.microsoft.com/en-us/dotnet/fundamentals/networking/http/httpclient-guidelines)
- [.NET testing best practices](https://learn.microsoft.com/en-us/dotnet/core/testing/unit-testing-best-practices)
