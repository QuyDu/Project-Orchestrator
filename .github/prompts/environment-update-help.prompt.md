---
mode: agent
description: Help for the environment-update skill.
---

# environment-update Help

Inventory installed development tools and present available updates, then update only existing tools selected by the user with complete findings and error reporting.

Explain this contract as help only. Do not execute its procedures or treat examples as action approval.
Read the complete contract at .github/skills/environment-update/SKILL.md before using this skill.

## Purpose

Inspect the current development machine for installed tools used by the project, identify available updates from approved sources, and apply only the updates the user selects. It does not install tools that are not already present.

## Preconditions

- Read project instructions, tool-version files, workspace settings, and relevant setup reports.
- Identify the operating system and whether the project is using VS Code, Azure CLI, Bicep, Node.js, language runtimes, package managers, or other tooling.
- Confirm approved software sources and whether administrator privileges are permitted.
- Do not request or record passwords, tokens, or credentials.

## Inputs

- Optional `-All` to select every detected update.
- A number selecting one detected update after the full update list is displayed.
- Optional tool filters such as `-Tool "Bicep"` when supported by the host workflow.
- Optional `-WhatIf` for inventory-only behavior. This is the default.

## Approved Tools and Resources

- Official vendor update mechanisms already available on the machine.
- VS Code extension update metadata and the VS Code CLI when installed.
- Azure CLI and Bicep version/status commands.
- Project-local tool manifests and lockfiles.

## Read and Write Boundaries

- Read installed versions, update availability, and tool configuration.
- Write only `reports/environment-update.json` and `reports/environment-update.md`.
- Update only tools already installed and explicitly selected by the user.
- Never alter project source, Git configuration, credentials, cloud resources, or organization policy.

## Procedure

1. Inventory installed tools and record versions using read-only commands.
2. Query approved update sources and build a numbered list of available updates, including current version, target version, source, scope, privilege requirement, and restart requirement.
3. Present the complete list before asking the user to choose `-All` or a number. Accept only the listed choices.
4. In `-WhatIf` mode, report the list and stop without updating anything.
5. After explicit selection and confirmation, update one existing tool at a time.
6. Verify each updated tool, record successes and failures, and continue only when the next update is independent and safe.
7. Write the final JSON and readable Markdown reports with all findings, errors, skipped updates, and verification results.

## Validation

- No update occurs in `-WhatIf` mode.
- Every selected tool was installed before the operation.
- Every update has before/after versions, source, command, status, and error details when applicable.
- The report distinguishes unavailable, current, skipped, failed, and updated tools.
- Project files and cloud resources remain unchanged.

## Outputs

- `reports/environment-update.json`
- `reports/environment-update.md`

## Failure Behavior

- Stop before mutation when an update source is untrusted, a tool is not already installed, or administrator privileges are required but unavailable.
- Report the exact tool and error without hiding failures.
- Do not retry destructive or privileged operations automatically.
- Preserve partial results and leave unselected tools unchanged.

## Approval Gates

Inventory and `-WhatIf` are read-only. Applying updates requires explicit user selection and confirmation. Administrator elevation, system-wide changes, extension installation, authentication, cloud mutation, and policy changes require separate explicit approval and are never assumed.

## Composition and Dependencies

- development-environment-readiness
- policy-engine

## Examples

- `/environment-update -WhatIf`
- `/environment-update` then review the numbered update list and select one number.
- `/environment-update -All` then confirm every detected existing-tool update.

## Related commands

- Run the skill with /environment-update.
- Open this help with /environment-update-help.
- Inspect the full contract with @.github/skills/environment-update/SKILL.md.
