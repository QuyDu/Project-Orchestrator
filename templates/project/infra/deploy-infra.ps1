# Bicep deployment.
# Library, not an entry point. Dot-source it and call Invoke-InfrastructureDeploy.

Set-StrictMode -Version Latest

function ConvertTo-AzureProjectToken {
    param([Parameter(Mandatory)][string]$ProjectName)

    $token = $ProjectName.Trim().ToLowerInvariant() -replace '[^a-z0-9]+', '-'
    $token = $token.Trim('-')
    if (-not $token) { throw 'Project name must contain at least one letter or number.' }
    return $token
}

function Get-AzureResourceName {
    param(
        [Parameter(Mandatory)][string]$ProjectName,
        [Parameter(Mandatory)][ValidateSet('resourceGroup', 'appServicePlan', 'webApp', 'keyVault', 'openAI', 'speech')][string]$ResourceType
    )

    $token = ConvertTo-AzureProjectToken $ProjectName
    $prefixes = @{
        resourceGroup  = 'rg-'
        appServicePlan = 'asp-'
        webApp         = 'app-'
        keyVault       = 'kv-'
        openAI         = 'oai-'
        speech         = 'speech-'
    }
    $limits = @{
        resourceGroup  = 90
        appServicePlan = 40
        webApp         = 60
        keyVault       = 24
        openAI         = 64
        speech         = 64
    }
    $prefix = $prefixes[$ResourceType]
    $limit = $limits[$ResourceType]
    if ($ResourceType -eq 'resourceGroup') {
        $name = "$prefix$token"
        if ($name.Length -gt $limit) { $name = "$prefix$($token.Substring(0, $limit - $prefix.Length).Trim('-'))" }
        return $name
    }
    $hash = [Convert]::ToHexString([Security.Cryptography.SHA256]::HashData([Text.Encoding]::UTF8.GetBytes($token))).ToLowerInvariant().Substring(0, 6)
    $available = $limit - $prefix.Length - 1 - $hash.Length
    $shortToken = if ($token.Length -le $available) { $token } else { $token.Substring(0, $available).Trim('-') }
    $name = "$prefix$shortToken-$hash"

    return $name
}

function Invoke-InfrastructureDeploy {
    <#
    .SYNOPSIS  Create the resource group if needed and deploy main.bicep into it.

    .DESCRIPTION
        Uses the signed-in `az` context. Nothing here reads a credential, a subscription id,
        or a tenant id from source: the deployment targets whatever `az account show`
        reports, which is why the caller is expected to confirm before this runs.
    #>
    param(
        [Parameter(Mandatory)][string]$SiteName,
        [Parameter(Mandatory)][string]$Location,
        [Parameter(Mandatory)][hashtable]$Discovery,
        [string]$AppServiceSku = 'S1',
        [string]$LinuxFxVersion = 'NODE|22-lts',
        [bool]$DeployKeyVault = $true,
        [bool]$DeploySpeech = $false,
        [string]$SpeechKind = 'AIServices',
        [string]$SpeechEndpoint = '',
        [string]$SpeechRegion = '',
        [bool]$ConfigureSpeech = $false,
        [switch]$AzureGov,
        [switch]$WhatIf
    )

    $resourceGroup = Get-AzureResourceName -ProjectName $SiteName -ResourceType resourceGroup
    $names = @{
        appServicePlan = Get-AzureResourceName -ProjectName $SiteName -ResourceType appServicePlan
        webApp         = Get-AzureResourceName -ProjectName $SiteName -ResourceType webApp
        keyVault       = Get-AzureResourceName -ProjectName $SiteName -ResourceType keyVault
        openAI         = Get-AzureResourceName -ProjectName $SiteName -ResourceType openAI
        speech         = Get-AzureResourceName -ProjectName $SiteName -ResourceType speech
    }
    $templatePath = Join-Path $PSScriptRoot 'main.bicep'
    if (-not (Test-Path $templatePath)) { throw "main.bicep not found beside deploy-infra.ps1" }

    $account = az account show -o json 2>$null | ConvertFrom-Json
    if (-not $account) { throw "No active Azure account. Run deployment through deploy.ps1 so the saved environment can authenticate automatically." }
    Write-Host "Subscription: $($account.name) [$($account.id)]" -ForegroundColor Cyan

    Write-Host "Ensuring resource group '$resourceGroup' in '$Location'..." -ForegroundColor Gray
    if (-not $WhatIf) {
        az group create --name $resourceGroup --location $Location -o none
        if ($LASTEXITCODE -ne 0) { throw "Resource group creation failed." }
    }

    $parameterFile = Join-Path ([System.IO.Path]::GetTempPath()) "pso-bicep-$([guid]::NewGuid()).json"
    $parameterValues = [ordered]@{
        siteName = $SiteName
        appServicePlanName = $names.appServicePlan
        webAppName = $names.webApp
        keyVaultName = $names.keyVault
        openAIName = $names.openAI
        speechName = $names.speech
        location = $Location
        appServiceSku = $AppServiceSku
        linuxFxVersion = $LinuxFxVersion
        isAzureGov = [bool]$AzureGov
        deployKeyVault = [bool]$DeployKeyVault
        deploySpeech = [bool]$DeploySpeech
        speechKind = $SpeechKind
        speechEndpoint = $SpeechEndpoint
        speechRegion = $SpeechRegion
        configureSpeech = [bool]$ConfigureSpeech
        deployOpenAI = [bool]$Discovery.openAIAvailable
        openAIModelName = $Discovery.openAIModelName
        openAIModelVersion = $Discovery.openAIModelVersion
        openAIModelSku = $Discovery.openAIModelSku
    }
    $parameterDocument = [ordered]@{ '$schema' = 'https://schema.management.azure.com/schemas/2019-04-01/deploymentParameters.json#'; contentVersion = '1.0.0.0'; parameters = [ordered]@{} }
    foreach ($entry in $parameterValues.GetEnumerator()) { $parameterDocument.parameters[$entry.Key] = @{ value = $entry.Value } }
    $parameterDocument | ConvertTo-Json -Depth 6 | Set-Content -Path $parameterFile -Encoding utf8

    $operation = if ($WhatIf) { 'what-if' } else { 'create' }
    Write-Host "Running az deployment group $operation..." -ForegroundColor Gray
    try {
        az deployment group $operation `
            --resource-group $resourceGroup `
            --template-file $templatePath `
            --parameters "@$parameterFile" `
            -o json | Tee-Object -Variable deploymentJson | Out-Null

        if ($LASTEXITCODE -ne 0) { throw "Bicep deployment failed." }
        if ($WhatIf) { return $null }

        $deployment = $deploymentJson | ConvertFrom-Json
        return $deployment.properties.outputs
    } finally {
        Remove-Item -LiteralPath $parameterFile -Force -ErrorAction SilentlyContinue
    }
}
