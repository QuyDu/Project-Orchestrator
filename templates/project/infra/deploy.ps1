<#
.SYNOPSIS
    Discovers what the target Azure region offers, then deploys this project's infrastructure.

.DESCRIPTION
    The entry point. It dot-sources the focused modules beside it and runs them in order:

        discover.ps1      - skill-owned cached discovery; refreshes when required
        deploy-infra.ps1  - az deployment group create against main.bicep

    Those modules are libraries. Running one directly does nothing.

    Azure preferences and public subscription identifiers are kept in the ignored local
    `.azure/environment.json` profile. The script selects the recorded cloud and subscription,
    and starts the configured Azure CLI login flow when authentication is missing or stale.

.PARAMETER SiteName
    2-20 characters, letters, numbers and hyphens. Drives every resource name, so two
    deployments with different names are fully isolated.
.PARAMETER Location
    Target region. Defaults to eastus, or usgovvirginia with -AzureGov.
.PARAMETER Gov
    Deploy to Azure US Government. Sets AZURE_CLOUD so the app resolves sovereign endpoints.
.PARAMETER Commercial
    Deploy to Azure Commercial. Otherwise reuse the saved cloud, defaulting to Commercial.
.PARAMETER PreferModel
    Try this OpenAI model first, falling back to the normal preference order if the region
    does not offer it.
.PARAMETER NoKeyVault
    Skip the Key Vault. Use this when the project keeps no secrets of its own.
.PARAMETER DeploySpeech
    Provision an approved Azure Speech-capable account when discovery did not find a reusable account.
.PARAMETER SpeechKind
    Speech account kind selected from discovery: SpeechServices or AIServices.
.PARAMETER WhatIf
    Run discovery and a Bicep what-if without creating or changing anything.

.EXAMPLE
    ./deploy.ps1 -SiteName contoso-api -WhatIf

.EXAMPLE
    ./deploy.ps1 -SiteName contoso-api -AzureGov -Location usgovvirginia
#>
[CmdletBinding()]
param(
    [Parameter(Mandatory)]
    [ValidatePattern('^[^\\/:*?"<>|]+$')]
    [string]$SiteName,

    [string]$Location,

    [ValidateSet('B1', 'B2', 'S1', 'P1v3')]
    [string]$AppServiceSku = 'S1',

    [string]$LinuxFxVersion = 'NODE|22-lts',

    [string]$PreferModel,

    [string]$DiscoveryOutputPath,

    [switch]$NoKeyVault,

    [switch]$DeploySpeech,

    [ValidateSet('SpeechServices', 'AIServices')]
    [string]$SpeechKind = 'AIServices',

    [Alias('AzureGov')][switch]$Gov,

    [switch]$Commercial,

    [switch]$WhatIf
)

Set-StrictMode -Version Latest
$ErrorActionPreference = 'Stop'

if (-not (Get-Command az -ErrorAction SilentlyContinue)) {
    throw "The Azure CLI is required. Install it, then rerun this script to start the saved authentication flow."
}

. (Join-Path $PSScriptRoot 'discover.ps1')
. (Join-Path $PSScriptRoot 'deploy-infra.ps1')

$profilePath = Get-AzureEnvironmentProfilePath
$environmentProfile = Initialize-AzureEnvironmentProfile -Gov:$Gov -Commercial:$Commercial -Location $Location `
    -InteractiveSetup:(-not (Test-Path $profilePath)) -ProfilePath $profilePath
Connect-AzureEnvironment -AzureContext $environmentProfile -ProfilePath $profilePath | Out-Null
$expectedCloud = [string]$environmentProfile.cloud
if (-not $Location) {
    $Location = [string]$environmentProfile.location
}

$discoveryParameters = @{
    Location = $Location
    Gov = ($expectedCloud -eq 'AzureUSGovernment')
    PreferModel = $PreferModel
}
if ($PSBoundParameters.ContainsKey('DiscoveryOutputPath')) {
    $discoveryParameters.DiscoveryOutputPath = $DiscoveryOutputPath
}
$discovery = Invoke-AzureDiscovery @discoveryParameters

$resourceGroup = Get-AzureResourceName -ProjectName $SiteName -ResourceType resourceGroup
$existingSpeech = @()
$groupExists = az group exists --name $resourceGroup 2>$null
if ($groupExists -eq 'true') {
    $existingSpeech = @(az cognitiveservices account list --resource-group $resourceGroup `
        --query "[?kind=='SpeechServices' || kind=='AIServices' || kind=='CognitiveServices'].{name:name,kind:kind,location:location,endpoint:properties.endpoint}" `
        -o json 2>$null | ConvertFrom-Json)
}

if ($existingSpeech.Count -gt 1) {
    throw "Multiple Speech-capable accounts were found in '$resourceGroup'. Select exactly one before continuing."
}
$selectedSpeech = $existingSpeech | Select-Object -First 1
$speechEndpoint = if ($selectedSpeech) { [string]$selectedSpeech.endpoint } else { '' }
$speechRegion = if ($selectedSpeech) { [string]$selectedSpeech.location } else { '' }
$deploySpeechNow = [bool]$DeploySpeech -and -not [bool]$selectedSpeech
$configureSpeech = [bool]$selectedSpeech -or $deploySpeechNow
if ($configureSpeech -and $NoKeyVault) {
    throw 'Speech configuration requires Key Vault. Remove -NoKeyVault before continuing.'
}
if ($configureSpeech -and -not $selectedSpeech -and -not $discovery.speech.serviceAvailable) {
    throw "Speech is not available in the discovered cloud and region '$Location'."
}

if ($selectedSpeech) {
    Write-Host "Reusing Speech-capable account in '$resourceGroup' ($($selectedSpeech.kind), $($selectedSpeech.location))." -ForegroundColor Gray
} elseif ($deploySpeechNow) {
    Write-Host "No Speech-capable account is configured in '$resourceGroup'; provisioning '$SpeechKind' from discovery." -ForegroundColor Gray
}

$outputs = Invoke-InfrastructureDeploy -SiteName $SiteName -Location $Location -Discovery $discovery `
    -AppServiceSku $AppServiceSku -LinuxFxVersion $LinuxFxVersion -DeployKeyVault:(-not $NoKeyVault) `
    -DeploySpeech:$deploySpeechNow -SpeechKind $(if ($selectedSpeech) { $selectedSpeech.kind } else { $SpeechKind }) `
    -SpeechEndpoint $speechEndpoint -SpeechRegion $speechRegion -ConfigureSpeech:$configureSpeech `
    -AzureGov:($expectedCloud -eq 'AzureUSGovernment') -WhatIf:$WhatIf

if ($WhatIf) {
    Write-Host "`nWhat-if complete. Nothing was created or changed." -ForegroundColor Cyan
    return
}

$speechAccountName = if ($selectedSpeech) { [string]$selectedSpeech.name } else { [string]$outputs.speechAccountName.value }
if ($configureSpeech -and $speechAccountName) {
    $keyVaultName = [string]$outputs.keyVaultName.value
    if (-not $keyVaultName) { throw 'The deployment did not return a Key Vault name for Speech configuration.' }
    $keyVaultId = az keyvault show --name $keyVaultName --resource-group $resourceGroup --query id -o tsv 2>$null
    $callerObjectId = az ad signed-in-user show --query id -o tsv 2>$null
    if ($keyVaultId -and $callerObjectId) {
        az role assignment create --assignee-object-id $callerObjectId --assignee-principal-type User `
            --role 'Key Vault Secrets Officer' --scope $keyVaultId -o none 2>$null | Out-Null
        if ($LASTEXITCODE -ne 0) { throw 'Could not grant the authenticated deployment identity permission to store the Speech key in Key Vault.' }
    }
    $existingKey = az keyvault secret show --vault-name $keyVaultName --name 'AzureSpeechKey' --query value -o tsv 2>$null
    if ($LASTEXITCODE -eq 0 -and $existingKey) {
        Write-Host "Speech key already exists in Key Vault '$keyVaultName'." -ForegroundColor Gray
    } else {
        $speechKey = (az cognitiveservices account keys list --name $speechAccountName --resource-group $resourceGroup `
            --query key1 -o tsv 2>$null)
        if (-not $speechKey) { throw "Could not retrieve the Speech key for Key Vault storage." }
        az keyvault secret set --vault-name $keyVaultName --name 'AzureSpeechKey' --value $speechKey --query id -o tsv 2>$null | Out-Null
        if ($LASTEXITCODE -ne 0) { throw 'Could not store the Speech key in Key Vault.' }
        Write-Host "Speech key stored in Key Vault '$keyVaultName' as secret 'AzureSpeechKey'." -ForegroundColor Gray
    }
}

Write-Host "`n=== Deployment complete ===" -ForegroundColor Green
Write-Host "Web app:   https://$($outputs.webAppHostName.value)" -ForegroundColor Cyan
if ($outputs.keyVaultUri.value) { Write-Host "Key Vault: $($outputs.keyVaultUri.value)" -ForegroundColor Cyan }
Write-Host "Identity:  $($outputs.managedIdentityPrincipalId.value)" -ForegroundColor Cyan
Write-Host "`nThe web app authenticates with its managed identity. Do not add service keys to app settings." -ForegroundColor Gray
