---
applyTo: "**"
description: "Select source-backed PowerShell, JavaScript, Node.js, C#, .NET, Python, and Azure standards before implementation or review."
---

# Best-Practice Routing

Reviewed: 2026-10-28

Before implementation or review, read the applicable guide below. In the Project Orchestrator Launch Pad, canonical guides are in `templates/project/.github/instructions/`. In generated or adopted projects, use that project's installed `.github/instructions/`; do not read another project's private files or reach back to the Launch Pad.

| Work | Guide |
| --- | --- |
| PowerShell scripts and modules | `powershell.instructions.md` |
| JavaScript or TypeScript, in any runtime | `typescript.instructions.md` |
| Node.js code, package management, or server tooling | `node.instructions.md` plus the JavaScript guide |
| C# language and API design | `csharp.instructions.md` |
| .NET projects, SDKs, hosting, or HTTP clients | `dotnet.instructions.md` plus the applicable language guide |
| Python source, typing, environments, or packaging | `python.instructions.md` |
| Azure service selection, SDK integration, identity, or deployment | `azure-deployment.instructions.md`; add `bicep.instructions.md` for Bicep |

Read only guides relevant to the task and installed for the detected stack. If required guidance is absent, report the gap and use approved setup rather than claiming coverage. Security and test instructions remain applicable at their own boundaries. Azure guidance applies to application SDK work as well as `infra/`; reading it never authorizes cloud access or mutation.

Preserve the project's supported versions, module format, formatter, and compatibility requirements. Recheck official lifecycle and API guidance before upgrades; record justified local exceptions. Do not silently install linters, change dependencies, rewrite unrelated code, or weaken security to match an example.

These are source-aligned instructions, not Microsoft certification or proof of application compliance. Report the exact checks actually run, their results, and remaining gaps. References and review dates support traceability; they do not prove that every recommendation is continuously enforced.
