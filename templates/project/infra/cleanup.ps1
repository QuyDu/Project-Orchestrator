# Azure resource cleanup.
# Read-only by default. Use -Apply only after reviewing the listed targets and confirming.

[CmdletBinding(DefaultParameterSetName = 'WhatIf')]
param(
    [Parameter(ParameterSetName = 'All', Mandatory)][switch]$All,
    [Parameter(ParameterSetName = 'All', Mandatory)][string]$SiteName,
    [Parameter(ParameterSetName = 'Resource', Mandatory)][string]$Resource,
    [Parameter(ParameterSetName = 'Resource', Mandatory)][string]$RG,
    [Parameter(ParameterSetName = 'Group', Mandatory)][string]$ResourceGroup,
    [switch]$Gov,
    [switch]$Commercial,
    [switch]$Apply,
    [switch]$WhatIf
)

Set-StrictMode -Version Latest
$ErrorActionPreference = 'Stop'

if ($Gov -and $Commercial) { throw 'Choose only one Azure cloud: -Gov or -Commercial.' }
if ($Apply -and $WhatIf) { throw 'Choose either -Apply or -WhatIf, not both.' }

. (Join-Path $PSScriptRoot 'azure-environment.ps1')
. (Join-Path $PSScriptRoot 'deploy-infra.ps1')

$profilePath = Get-AzureEnvironmentProfilePath
$environmentProfile = Initialize-AzureEnvironmentProfile -Gov:$Gov -Commercial:$Commercial `
    -InteractiveSetup:(-not (Test-Path $profilePath)) -ProfilePath $profilePath
$cloud = [string]$environmentProfile.cloud
$account = Connect-AzureEnvironment -AzureContext $environmentProfile -ProfilePath $profilePath

$targetGroup = if ($All) { Get-AzureResourceName -ProjectName $SiteName -ResourceType resourceGroup } elseif ($ResourceGroup) { $ResourceGroup } else { $RG }
if (-not $targetGroup) { throw 'Specify -All -ResourceGroup <name>, -Resource <name> -RG <name>, or -ResourceGroup <name>.' }

$resources = @(az resource list --resource-group $targetGroup -o json 2>$null | ConvertFrom-Json)
if (-not $resources) { throw "Resource group '$targetGroup' was not found or contains no resources." }
if ($Resource) {
    $resourceMatches = @($resources | Where-Object { $_.name -eq $Resource -or $_.id -eq $Resource })
    if ($resourceMatches.Count -ne 1) { throw "Expected exactly one resource named '$Resource' in '$targetGroup'; found $($resourceMatches.Count)." }
    $resources = $resourceMatches
}

$targetDescription = if ($All) { "resource group '$targetGroup' and all $($resources.Count) resources" } elseif ($Resource) { "resource '$($resources[0].name)'" } else { "resource group '$targetGroup'" }
Write-Host "Cloud: $cloud" -ForegroundColor Cyan
Write-Host "Subscription: $($account.name) [$($account.id)]" -ForegroundColor Cyan
Write-Host "Target: $targetDescription" -ForegroundColor Yellow
$resources | Select-Object name, type, location, id | Format-Table -AutoSize

if (-not $Apply) {
    Write-Host "`nWhat-if only. Nothing was deleted. Use -Apply after reviewing this list and confirming the exact target." -ForegroundColor Green
    return
}

$confirmation = Read-Host "Type DELETE to confirm deletion of $targetDescription"
if ($confirmation -cne 'DELETE') { throw 'Cleanup cancelled; no resources were deleted.' }

if ($All) {
    az group delete --name $targetGroup --yes
} elseif ($Resource) {
    az resource delete --ids $resources[0].id
} else {
    az group delete --name $targetGroup --yes
}
if ($LASTEXITCODE -ne 0) { throw "Azure cleanup failed for $targetDescription." }
Write-Host "Cleanup completed for $targetDescription." -ForegroundColor Green
