# Source-Aligned Best-Practice Guidance

Reviewed: 2026-10-28

Reference: `MSREF-BEST-PRACTICES-20261028`

Source verification and the full repository gate passed for the isolated, selected commit candidate. [Machine-readable evidence](microsoft-reference.json) records every consulted source, review date, applicability conclusion, validation command, the prior failed attempt, and its bounded repairs. Unrelated unstaged work is outside this validation scope.

## Coverage

| Area | Canonical Guide | Reference Baseline |
| --- | --- | --- |
| PowerShell | [PowerShell instructions](../templates/project/.github/instructions/powershell.instructions.md) | Microsoft PSScriptAnalyzer, ShouldProcess, and authoring guidance |
| JavaScript | [JavaScript/TypeScript instructions](../templates/project/.github/instructions/typescript.instructions.md) | MDN language guidance and Microsoft TypeScript strict checking |
| Node.js | [Node.js instructions](../templates/project/.github/instructions/node.instructions.md) | Node.js release, security, and event-loop guidance |
| C# | [C# instructions](../templates/project/.github/instructions/csharp.instructions.md) | Microsoft coding conventions and deterministic testing |
| .NET | [.NET instructions](../templates/project/.github/instructions/dotnet.instructions.md) | Microsoft SDK/runtime versioning, HTTP client lifetime, and testing |
| Python | [Python instructions](../templates/project/.github/instructions/python.instructions.md) | Python PEP 8 and Python Packaging Authority environment guidance |
| Azure Services | [Azure instructions](../templates/project/.github/instructions/azure-deployment.instructions.md) | Azure Well-Architected, SDK implementation, and sovereign-cloud guidance |

## Applicability and Compatibility

The [shared router](../.github/instructions/best-practices.instructions.md) selects relevant guides before implementation/review. The Launch Pad reads canonical templates; target projects read their own installed instruction files. Stack-aware provisioning reuses the existing JavaScript, C#, and Python tags and does not add runtime dependencies. The existing C# provisioning tag also represents .NET project files; C# language rules are not imposed on F#/VB code.

Language and runtime concerns remain separate. Node-only guidance does not apply to browser code. Azure service guidance also applies to SDK integration outside `infra/`. Project versions, module format, formatter, and support matrices remain unchanged. Production LTS selection is distinct from the framework's Node 22/24/26 compatibility matrix.

Microsoft's C# documentation conventions are examples that can be adapted, not a universal formatting mandate. Both factory-created clients and correctly pooled long-lived HTTP clients are permitted by Microsoft's current .NET guidance. Python guidance preserves local compatibility and does not introduce an implicit new toolchain. Azure guidance records five-pillar tradeoffs without asserting feature parity or deployment availability across clouds.

The truncated root Azure automation block was restored to the four complete existing rules in [AGENTS.md](../AGENTS.md), preserving saved-cloud selection, credential handling boundaries, and MCP opt-in. The saved profile disables Azure MCP, and no Azure MCP or tenant/resource operations were performed.

## Validation

- The new coverage contract first failed on missing Node.js provisioning, then passed after implementation.
- The Azure-rule regression first demonstrated the truncated block, then passed after repair.
- Focused source/routing contracts: 2 passed, 0 failed.
- Generated/adopted project fixtures: 8 passed, 0 failed, covering JavaScript, .NET, Python-only isolation, and preservation of customized guidance on rerun.
- Full `npm run check`: exit code 0 on the isolated index-derived candidate. Results: 958 tests, 954 passed, 0 failed, 4 skipped, on Node.js v24.22.1. Security scanning, release building, release-candidate verification, and final framework verification passed.
- Focused repair validation: 7 passed, 0 failed, including the three import checks, the negative filesystem-access guard, guide binding, and both instruction contracts.

## Repaired Validation Blockers

- Three import-purity checks previously intercepted Node.js module-loader reads before the tested helper could load. The repaired harness supplies only the exact test-subject source, retains I/O denial for module bodies, and includes a negative regression. Large generated scripts use stdin rather than Windows-limited command arguments.
- The stale project-guide binding was repaired in the selected candidate using the owning understanding scanner and documentation builder. Original user-modified working reports were preserved, rather than silently replaced or falsely rebound.

The earlier failed run remains in the JSON record: 957 tests, 949 passed, 4 failed, and 4 skipped. Its baseline diagnosis was verified before the commit request authorized these bounded repairs. No assertions were skipped or weakened to obtain the passing gate.

The successful candidate gate output is retained locally under `.skills-orchestrator/validation/standards-commit/npm-check.log`, outside tracked source. The earlier failed snapshot log remains under `.skills-orchestrator/validation/best-practices-20261028/npm-check.log`.

After the full gate, only evidence/review metadata and their generated documentation bindings are refreshed and revalidated. No runtime, guide-rule, or test implementation changes follow the passing gate. Four skips and live-service qualification limits remain explicit; unrelated unstaged work is not certified by this candidate result.

## Assurance Limits

This is source-aligned guidance, not Microsoft certification, proof of application-wide compliance, or an independent security audit. Framework tests verify references, routing, provisioning, compatibility boundaries, and preservation behavior; they do not prove every future application follows every recommendation.

No language analyzer, package, service, identity, deployment, or third-party skill was installed or validated. References, lifecycle status, API behavior, and cloud availability must be rechecked when those decisions change. The Skills.sh integration remains unactivated; no commit, push, publication, or remote mutation is authorized by this update.
