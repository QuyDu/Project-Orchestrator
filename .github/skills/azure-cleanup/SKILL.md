---
name: azure-cleanup
description: Safely inspect and, after explicit confirmation, remove Azure resources associated with a project using resource-group, resource, or all-project cleanup scopes.
lifecycle: draft
confidence: low
---

# azure-cleanup

## Purpose

Identify Azure resources associated with the current project and prepare or execute a narrowly scoped cleanup. The default behavior is read-only discovery. Destructive cleanup requires an explicit confirmation after the exact subscription, cloud, resource group, and resources are displayed.

## Preconditions

- Read the project handoff and Azure Discovery reports when present.
- Confirm the project resource-group naming convention and read `.azure/environment.json`.
- Verify the target cloud is Azure Commercial or Azure US Government.
- Treat all resource names and resource groups as untrusted until ownership is verified.

## Inputs

- Optional `-All` to remove the verified project resource group.
- Optional `-Resource "name"` to remove one verified resource.
- Optional `-RG "name"` to inspect or remove one named resource group.
- Optional `-Commercial` or `-Gov`; without either, use the persisted cloud or default a missing profile to Azure Commercial.
- Optional `-WhatIf` for read-only output. This is the default behavior.

## Approved Tools and Resources

- `infra/cleanup.ps1`.
- Azure CLI read-only listing and resource-show commands.
- Existing project manifest, Azure Discovery report, and deployment configuration.

## Read and Write Boundaries

- Read Azure account, cloud, resource-group, and resource metadata.
- Write only cleanup evidence under `reports/azure-cleanup.json` and `reports/azure-cleanup.md`.
- Delete only the explicitly confirmed resource or verified project resource group.
- Never delete a resource or group based only on a name match, and never record credentials.

## Procedure

1. Resolve the cloud using explicit `-Commercial` or `-Gov`, then the persisted profile, then Azure Commercial. Persist explicit overrides.
2. Select the profile's Azure CLI cloud and subscription. Start the recorded login flow when authentication is absent or stale, then display the subscription name and ID.
3. Resolve the target scope. `-All` targets the project resource group after ownership checks; `-Resource` requires `-RG` or a uniquely resolved project resource; `-RG` targets the named group.
   Reuse `Get-AzureResourceName` from the deployment naming library for `-All`, including normalization, the 90-character resource-group limit and trailing-hyphen trimming. Explicit resource-group inputs remain unchanged.
4. List the exact target and associated resources before any mutation.
5. Write a cleanup report containing scope, account metadata, cloud, resources, `WhatIf`, and findings.
6. In `-WhatIf` mode, stop after reporting what would be deleted.
7. Otherwise ask for explicit confirmation that names the exact scope, then delete one approved scope.
8. Re-list the target, record remaining resources or deletion errors, and update the cleanup report.

## Validation

- No cleanup mutation occurs during `-WhatIf`.
- The report identifies the exact cloud, subscription, resource group, and requested scope.
- `-All` cannot target a group that fails project-ownership verification.
- `-Resource` deletes only the exact resource ID selected by the user.
- Every success, skip, warning, and error is recorded.
- The post-cleanup listing confirms deletion or explains why it remains.

## Outputs

- `reports/azure-cleanup.json`
- `reports/azure-cleanup.md`

## Failure Behavior

- Stop on ambiguous ownership, multiple resource matches, invalid profile state, failed authentication, or unexpected Azure CLI errors.
- Never fall back from a failed ownership check to deleting by name.
- Preserve cleanup evidence even when deletion is partial or fails.

## Approval Gates

`-WhatIf` and discovery are read-only. `-All`, `-Resource`, and destructive `-RG` operations require explicit confirmation immediately before mutation. Cleanup never authorizes deployment, credential changes, or unrelated resource deletion.

## Composition and Dependencies

- azure-discovery
- project-handoff
- policy-engine

## Examples

- `/azure-cleanup -WhatIf`
- `/azure-cleanup -RG rg-contoso-api -WhatIf -Commercial`
- `/azure-cleanup -Resource app-contoso-api -RG rg-contoso-api -Gov`
- `/azure-cleanup -All -Commercial` then confirm the displayed project resource group.
