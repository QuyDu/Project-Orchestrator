# Azure service and model discovery.
# Library, not an entry point. Dot-source it and call Invoke-AzureDiscovery.
# Side effects: live read-only `az` queries against the signed-in subscription.

Set-StrictMode -Version Latest

. (Join-Path $PSScriptRoot 'azure-environment.ps1')

function Get-AzureDiscoveryProjectRoot {
    $directoryName = Split-Path -Leaf $PSScriptRoot
    $relativeRoot = if ($directoryName -eq 'infra') { '..' } else { '..\..\..\..' }
    return [IO.Path]::GetFullPath((Join-Path $PSScriptRoot $relativeRoot))
}

function Test-AzureCognitiveKind {
    <#
    .SYNOPSIS  Report whether a Cognitive Services kind offers any SKU in one region.
    #>
    param(
        [Parameter(Mandatory)][string]$Kind,
        [Parameter(Mandatory)][string]$Location
    )
    try {
        $skus = az cognitiveservices account list-skus --kind $Kind --location $Location `
            --query "[].{sku:sku.name}" -o json 2>$null | ConvertFrom-Json
        return ($skus -and $skus.Count -gt 0)
    } catch { return $false }
}

function Get-AzureCognitiveKindRegion {
    <#
    .SYNOPSIS  Return every region offering a Cognitive Services kind in the current cloud.

    .DESCRIPTION
        Probing a single region reports a false negative whenever a kind is region-limited,
        and creating an account in a region that does not list the SKU fails preflight with
        SpecialFeatureOrQuotaIdRequired. Azure US Government is the common case: several
        kinds are offered in only one Gov region.

        `az cognitiveservices account list-skus` without --location is already scoped by the
        active `az cloud` context, so this returns the correct regions for whichever cloud
        you are signed in to.
    #>
    param(
        [Parameter(Mandatory)][string]$Kind
    )
    try {
        $locationSets = az cognitiveservices account list-skus --kind $Kind `
            --query "[].locations" -o json 2>$null | ConvertFrom-Json
        $regions = @()
        foreach ($set in @($locationSets)) {
            foreach ($region in @($set)) {
                if ($region) { $regions += ([string]$region).ToLower() }
            }
        }
        return @($regions | Select-Object -Unique)
    } catch { return @() }
}

function Get-AzureSpeechResourceSummary {
    <#
    .SYNOPSIS  Summarize existing Speech-capable accounts without persisting names or identifiers.
    #>
    try {
        $accounts = az cognitiveservices account list `
            --query "[?kind=='SpeechServices' || kind=='AIServices' || kind=='CognitiveServices'].{kind:kind, location:location}" `
            -o json 2>$null | ConvertFrom-Json
        $items = @($accounts)
        return @{
            querySucceeded = $true
            available      = ($items.Count -gt 0)
            count          = $items.Count
            regions        = @($items | ForEach-Object { ([string]$_.location).ToLower() } | Where-Object { $_ } | Select-Object -Unique)
            kinds          = @($items | ForEach-Object { [string]$_.kind } | Where-Object { $_ } | Select-Object -Unique)
        }
    } catch {
        return @{
            querySucceeded = $false
            available      = $false
            count          = 0
            regions        = @()
            kinds          = @()
        }
    }
}

function Get-AzureImageModelClassification {
    param([Parameter(Mandatory)][string]$ModelName)

    switch -Regex ($ModelName) {
        '^gpt-image-2(?:$|[-.])' {
            return [pscustomobject]@{ provider = 'azure-openai'; maturity = 'generally-available'; rank = 0 }
        }
        '^gpt-image-1\.5(?:$|[-.])' {
            return [pscustomobject]@{ provider = 'azure-openai'; maturity = 'limited-access'; rank = 10 }
        }
        '^gpt-image-1-mini(?:$|[-.])' {
            return [pscustomobject]@{ provider = 'azure-openai'; maturity = 'limited-access'; rank = 11 }
        }
        '^gpt-image-1$' {
            return [pscustomobject]@{ provider = 'azure-openai'; maturity = 'limited-access'; rank = 12 }
        }
        '^MAI-Image-' {
            return [pscustomobject]@{ provider = 'mai-image'; maturity = 'preview'; rank = 20 }
        }
        default { return $null }
    }
}

function ConvertTo-AzureImageModelSummary {
    param(
        [AllowEmptyCollection()][object[]]$Models,
        [Parameter(Mandatory)][string]$Location
    )

    $ranked = @()
    $seen = @{}
    $skuPreference = @('GlobalStandard', 'DataZoneStandard', 'Standard')
    foreach ($model in @($Models)) {
        if (-not $model) { continue }
        $name = [string]$model.name
        $version = [string]$model.version
        $classification = Get-AzureImageModelClassification -ModelName $name
        if (-not $classification -or [string]::IsNullOrWhiteSpace($version)) { continue }

        $format = [string]$model.format
        if ([string]::IsNullOrWhiteSpace($format)) {
            $format = if ($classification.provider -eq 'mai-image') { 'Microsoft' } else { 'OpenAI' }
        }
        $skuNames = @($model.skus | ForEach-Object {
            if ($_ -is [string]) { [string]$_ } elseif ($_.name) { [string]$_.name }
        } | Where-Object { $_ } | Select-Object -Unique)
        $skuName = ''
        foreach ($preferredSku in $skuPreference) {
            if ($skuNames -contains $preferredSku) {
                $skuName = $preferredSku
                break
            }
        }
        if (-not $skuName) { continue }

        $key = "$name|$version|$format|$skuName".ToLowerInvariant()
        if ($seen.ContainsKey($key)) { continue }
        $seen[$key] = $true
        $ranked += [pscustomobject]@{
            rank  = [int]$classification.rank
            value = [pscustomobject][ordered]@{
                name      = $name
                version   = $version
                format    = $format
                sku       = $skuName
                provider  = [string]$classification.provider
                maturity  = [string]$classification.maturity
                available = $true
                regions   = @($Location.ToLowerInvariant())
            }
        }
    }

    return @($ranked |
        Sort-Object @{ Expression = 'rank'; Ascending = $true }, @{ Expression = { $_.value.name }; Ascending = $true }, @{ Expression = { $_.value.version }; Descending = $true } |
        Select-Object -First 20 |
        ForEach-Object { $_.value })
}

function Get-AzureImageQuotaSummary {
    param(
        [Parameter(Mandatory)][string]$Location,
        [AllowEmptyString()][string]$ModelName,
        [AllowEmptyString()][string]$SkuName
    )

    $unknown = [ordered]@{
        querySucceeded = $false
        matchFound     = $false
        status         = 'unknown'
        currentValue   = $null
        limit          = $null
        unit           = ''
    }
    if ([string]::IsNullOrWhiteSpace($ModelName)) { return $unknown }

    try {
        $usage = az cognitiveservices usage list --location $Location `
            --query "[].{name:name.value,localizedName:name.localizedValue,currentValue:currentValue,limit:limit,unit:unit}" `
            -o json 2>$null | ConvertFrom-Json
        if ($LASTEXITCODE -ne 0) { throw 'Azure Cognitive Services quota query failed.' }
        $unknown.querySucceeded = $true

        $modelToken = ($ModelName -replace '[^A-Za-z0-9]', '').ToLowerInvariant()
        $skuToken = ($SkuName -replace '[^A-Za-z0-9]', '').ToLowerInvariant()
        $quotaMatches = @($usage | Where-Object {
            $usageToken = ("$($_.name) $($_.localizedName)" -replace '[^A-Za-z0-9]', '').ToLowerInvariant()
            $usageToken.Contains($modelToken)
        })
        $match = $quotaMatches | Where-Object {
            if (-not $skuToken) { return $true }
            $usageToken = ("$($_.name) $($_.localizedName)" -replace '[^A-Za-z0-9]', '').ToLowerInvariant()
            return $usageToken.Contains($skuToken)
        } | Select-Object -First 1
        if (-not $match) { $match = $quotaMatches | Select-Object -First 1 }
        if (-not $match) { return $unknown }

        $unknown.matchFound = $true
        if ($null -eq $match.currentValue -or $null -eq $match.limit) { return $unknown }
        $currentValue = [double]$match.currentValue
        $limit = [double]$match.limit
        if ($currentValue -lt 0 -or $limit -lt 0) { return $unknown }
        return [ordered]@{
            querySucceeded = $true
            matchFound     = $true
            status         = if ($limit -gt $currentValue) { 'available' } else { 'exhausted' }
            currentValue   = $currentValue
            limit          = $limit
            unit           = [string]$match.unit
        }
    } catch {
        return $unknown
    }
}

function Get-AzureImageDeploymentSummary {
    $empty = [ordered]@{
        querySucceeded = $false
        available      = $false
        count          = 0
        regions        = @()
        models         = @()
        formats        = @()
    }

    try {
        $accounts = az cognitiveservices account list `
            --query "[?kind=='OpenAI' || kind=='AIServices' || kind=='CognitiveServices'].{accountName:name,resourceGroup:resourceGroup,location:location}" `
            -o json 2>$null | ConvertFrom-Json
        if ($LASTEXITCODE -ne 0) { throw 'Azure AI account query failed.' }

        $imageDeployments = @()
        foreach ($account in @($accounts)) {
            if (-not $account) { continue }
            $deployments = az cognitiveservices account deployment list --name $account.accountName --resource-group $account.resourceGroup `
                --query "[].{modelName:properties.model.name,modelFormat:properties.model.format}" `
                -o json 2>$null | ConvertFrom-Json
            if ($LASTEXITCODE -ne 0) { throw 'Azure AI deployment query failed.' }
            foreach ($deployment in @($deployments)) {
                if (-not $deployment) { continue }
                if (-not (Get-AzureImageModelClassification -ModelName ([string]$deployment.modelName))) { continue }
                $imageDeployments += [pscustomobject]@{
                    region = ([string]$account.location).ToLowerInvariant()
                    model  = [string]$deployment.modelName
                    format = [string]$deployment.modelFormat
                }
            }
        }

        return [ordered]@{
            querySucceeded = $true
            available      = ($imageDeployments.Count -gt 0)
            count          = $imageDeployments.Count
            regions        = @($imageDeployments | ForEach-Object { $_.region } | Where-Object { $_ } | Select-Object -Unique)
            models         = @($imageDeployments | ForEach-Object { $_.model } | Where-Object { $_ } | Select-Object -Unique)
            formats        = @($imageDeployments | ForEach-Object { $_.format } | Where-Object { $_ } | Select-Object -Unique)
        }
    } catch {
        return $empty
    }
}

function Resolve-AzureOpenAIApiVersion {
    param([Parameter(Mandatory)][AllowEmptyString()][string]$ModelName)
    switch -Wildcard ($ModelName) {
        'gpt-5*'   { '2025-04-01-preview' }
        'gpt-4.1*' { '2025-04-01-preview' }
        'o3*'      { '2025-04-01-preview' }
        'o1*'      { '2024-12-01-preview' }
        default    { '2024-10-01' }
    }
}

function Invoke-AzureDiscovery {
    <#
    .SYNOPSIS  Probe a region for available services and the best available OpenAI model.

    .DESCRIPTION
        Keeps a repository portable across subscriptions, regions and clouds: nothing about
        the target environment is hard-coded, so the same source deploys anywhere the
        signed-in account can reach.

    .OUTPUTS
        Hashtable with keys: cloud, location, cognitiveAvailable, cognitiveRegions,
        openAIAvailable, openAIModelName, openAIModelVersion, openAIModelSku, openAIApiVersion.
    #>
    param(
        [string]$Location,
        [Alias('AzureGov')][switch]$Gov,
        [switch]$Commercial,
        [string]$PreferModel,
        [switch]$InteractiveSetup,
        [string]$DiscoveryOutputPath = (Join-Path (Get-AzureDiscoveryProjectRoot) 'reports\azure-discovery.json')
    )

    $environmentProfile = Initialize-AzureEnvironmentProfile -Gov:$Gov -Commercial:$Commercial -Location $Location -InteractiveSetup:$InteractiveSetup
    Connect-AzureEnvironment -AzureContext $environmentProfile | Out-Null
    $cloud = [string]$environmentProfile.cloud
    $Location = [string]$environmentProfile.location
    Write-Host "`n=== Azure discovery ($Location, $cloud) ===" -ForegroundColor Cyan

    $cognitiveAvailable = Test-AzureCognitiveKind -Kind 'AIServices' -Location $Location
    if (-not $cognitiveAvailable) {
        $cognitiveAvailable = Test-AzureCognitiveKind -Kind 'CognitiveServices' -Location $Location
    }
    $cognitiveRegions = @(Get-AzureCognitiveKindRegion -Kind 'AIServices')
    if ($cognitiveAvailable) {
        Write-Host "  Cognitive Services: available in '$Location'" -ForegroundColor Green
    } else {
        Write-Host "  Cognitive Services: not listed in '$Location'" -ForegroundColor Yellow
        if ($cognitiveRegions.Count -gt 0) {
            Write-Host "  Offered in this cloud at: $($cognitiveRegions -join ', ')" -ForegroundColor Yellow
        }
    }

    $modelPreference = @('gpt-5.1', 'gpt-4.1', 'gpt-4.1-mini', 'gpt-4o', 'gpt-4o-mini', 'gpt-4', 'gpt-35-turbo')
    if ($PreferModel) {
        $modelPreference = @($PreferModel) + ($modelPreference | Where-Object { $_ -ne $PreferModel })
        Write-Host "  Preference override: trying '$PreferModel' first" -ForegroundColor Cyan
    }

    $openAIAvailable = $false
    $openAIModelName = ''
    $openAIModelVersion = ''
    $openAIModelSku = 'Standard'

    $modelFilter = ($modelPreference | ForEach-Object { "model.name=='$_'" }) -join ' || '
    $availableModels = $null
    try {
        $availableModels = az cognitiveservices model list --location $Location `
            --query "[?$modelFilter].{name:model.name, version:model.version, sku:model.skus[0].name}" `
            -o json 2>$null | ConvertFrom-Json
    } catch {
        Write-Host "  Could not query OpenAI models (non-fatal): $_" -ForegroundColor Yellow
    }

    if ($availableModels -and $availableModels.Count -gt 0) {
        $openAIAvailable = $true
        foreach ($preferred in $modelPreference) {
            $candidates = $availableModels | Where-Object { $_.name -eq $preferred }
            if (-not $candidates) { continue }
            # A provisioned SKU cannot be deployed on demand, so prefer the pay-as-you-go tiers.
            $standard = $candidates | Where-Object { $_.sku -in @('Standard', 'DataZoneStandard', 'GlobalStandard') } |
                Sort-Object version -Descending
            $selected = if ($standard) { $standard[0] } else { ($candidates | Sort-Object version -Descending)[0] }
            $openAIModelName = $preferred
            $openAIModelVersion = [string]$selected.version
            $openAIModelSku = [string]$selected.sku
            Write-Host "  >> Selected: $openAIModelName version=$openAIModelVersion sku=$openAIModelSku" -ForegroundColor Cyan
            break
        }
    } else {
        Write-Host "  Azure OpenAI: no preferred model available in '$Location'" -ForegroundColor Yellow
    }

    $openAIApiVersion = Resolve-AzureOpenAIApiVersion -ModelName $openAIModelName
    if ($openAIAvailable) {
        Write-Host "  API version: $openAIApiVersion" -ForegroundColor Cyan
    }

    $imageCatalogQuerySucceeded = $false
    $imageModels = @()
    try {
        $catalogModels = az cognitiveservices model list --location $Location `
            --query "[].{name:model.name,version:model.version,format:model.format,skus:model.skus}" `
            -o json 2>$null | ConvertFrom-Json
        if ($LASTEXITCODE -ne 0) { throw 'Azure image model catalog query failed.' }
        $imageCatalogQuerySucceeded = $true
        $imageModels = @(ConvertTo-AzureImageModelSummary -Models @($catalogModels) -Location $Location)
    } catch {
        Write-Host "  Could not query image-generation models (non-fatal): $_" -ForegroundColor Yellow
    }
    $selectedImageModel = $imageModels | Select-Object -First 1
    $imageAvailable = ($null -ne $selectedImageModel)
    $imageQuota = Get-AzureImageQuotaSummary -Location $Location `
        -ModelName $(if ($selectedImageModel) { [string]$selectedImageModel.name } else { '' }) `
        -SkuName $(if ($selectedImageModel) { [string]$selectedImageModel.sku } else { '' })
    $imageDeployments = Get-AzureImageDeploymentSummary
    if ($imageAvailable) {
        Write-Host "  Image generation: selected $($selectedImageModel.name) ($($selectedImageModel.maturity), $($selectedImageModel.sku))" -ForegroundColor Cyan
        Write-Host "  Image quota: $($imageQuota.status)" -ForegroundColor $(if ($imageQuota.status -eq 'available') { 'Green' } else { 'Yellow' })
    } elseif ($imageCatalogQuerySucceeded) {
        Write-Host "  Image generation: no compatible model found in '$Location'" -ForegroundColor Yellow
    }
    if ($imageDeployments.available) {
        Write-Host "  Existing image deployments: $($imageDeployments.count) in $($imageDeployments.regions -join ', ')" -ForegroundColor Green
    } elseif (-not $imageDeployments.querySucceeded) {
        Write-Host '  Existing image deployment query unavailable' -ForegroundColor Yellow
    }

    $speechServiceRegions = @(Get-AzureCognitiveKindRegion -Kind 'SpeechServices')
    $speechResources = Get-AzureSpeechResourceSummary
    if ($speechResources.available) {
        Write-Host "  Speech resources: $($speechResources.count) existing in $($speechResources.regions -join ', ')" -ForegroundColor Green
    } elseif ($speechResources.querySucceeded) {
        Write-Host '  Speech resources: none found in the active subscription' -ForegroundColor Yellow
    } else {
        Write-Host '  Speech resources: account query unavailable' -ForegroundColor Yellow
    }

    $result = @{
        schemaVersion      = '1.0.0'
        discoveredAt       = (Get-Date).ToUniversalTime().ToString('o')
        cloud              = $cloud
        location           = $Location
        cognitiveAvailable = $cognitiveAvailable
        cognitiveRegions   = $cognitiveRegions
        openAIAvailable    = $openAIAvailable
        openAIModelName    = $openAIModelName
        openAIModelVersion = $openAIModelVersion
        openAIModelSku     = $openAIModelSku
        openAIApiVersion   = $openAIApiVersion
        imageGeneration    = [ordered]@{
            catalogQuerySucceeded      = $imageCatalogQuerySucceeded
            available                  = $imageAvailable
            models                     = @($imageModels)
            selectedModelName          = if ($selectedImageModel) { [string]$selectedImageModel.name } else { '' }
            selectedModelVersion       = if ($selectedImageModel) { [string]$selectedImageModel.version } else { '' }
            selectedModelFormat        = if ($selectedImageModel) { [string]$selectedImageModel.format } else { '' }
            selectedModelSku           = if ($selectedImageModel) { [string]$selectedImageModel.sku } else { '' }
            selectedProvider           = if ($selectedImageModel) { [string]$selectedImageModel.provider } else { 'none' }
            selectedMaturity           = if ($selectedImageModel) { [string]$selectedImageModel.maturity } else { 'none' }
            requiresExplicitAcceptance = [bool]($selectedImageModel -and $selectedImageModel.maturity -ne 'generally-available')
            quota                      = $imageQuota
            existingDeployments        = $imageDeployments
        }
        speech             = @{
            serviceAvailable               = ($speechServiceRegions.Count -gt 0)
            serviceRegions                 = $speechServiceRegions
            existingResourceQuerySucceeded = $speechResources.querySucceeded
            existingResourceAvailable      = $speechResources.available
            existingResourceCount          = $speechResources.count
            existingResourceRegions        = $speechResources.regions
            existingResourceKinds          = $speechResources.kinds
        }
    }

    if ($DiscoveryOutputPath) {
        $outputDirectory = Split-Path -Parent $DiscoveryOutputPath
        New-Item -ItemType Directory -Path $outputDirectory -Force | Out-Null
        $result | ConvertTo-Json -Depth 5 | Set-Content -Path $DiscoveryOutputPath -Encoding utf8
        $markdownPath = [IO.Path]::ChangeExtension($DiscoveryOutputPath, '.md')
        $availability = if ($result.openAIAvailable) { 'available' } else { 'not available' }
        @(
            '# Azure Discovery'
            ''
            "- Discovered at (UTC): $($result.discoveredAt)"
            "- Cloud: $($result.cloud)"
            "- Location: $($result.location)"
            "- Cognitive Services: $($result.cognitiveAvailable)"
            "- Azure OpenAI: $availability"
            "- Selected model: $($result.openAIModelName)"
            "- Model version: $($result.openAIModelVersion)"
            "- Model SKU: $($result.openAIModelSku)"
            "- API version: $($result.openAIApiVersion)"
            "- Cognitive regions: $($result.cognitiveRegions -join ', ')"
            "- Image catalog query succeeded: $($result.imageGeneration.catalogQuerySucceeded)"
            "- Image generation available: $($result.imageGeneration.available)"
            "- Selected image model: $($result.imageGeneration.selectedModelName)"
            "- Selected image model version: $($result.imageGeneration.selectedModelVersion)"
            "- Selected image model format: $($result.imageGeneration.selectedModelFormat)"
            "- Selected image model SKU: $($result.imageGeneration.selectedModelSku)"
            "- Selected image provider: $($result.imageGeneration.selectedProvider)"
            "- Selected image model maturity: $($result.imageGeneration.selectedMaturity)"
            "- Image model requires explicit acceptance: $($result.imageGeneration.requiresExplicitAcceptance)"
            "- Image quota query succeeded: $($result.imageGeneration.quota.querySucceeded)"
            "- Image quota status: $($result.imageGeneration.quota.status)"
            "- Existing image deployment query succeeded: $($result.imageGeneration.existingDeployments.querySucceeded)"
            "- Existing image deployments: $($result.imageGeneration.existingDeployments.count)"
            "- Existing image deployment regions: $($result.imageGeneration.existingDeployments.regions -join ', ')"
            "- Existing image deployment models: $($result.imageGeneration.existingDeployments.models -join ', ')"
            "- Speech service regions: $($result.speech.serviceRegions -join ', ')"
            "- Existing Speech resource query succeeded: $($result.speech.existingResourceQuerySucceeded)"
            "- Existing Speech resources: $($result.speech.existingResourceCount)"
            "- Existing Speech resource regions: $($result.speech.existingResourceRegions -join ', ')"
            "- Existing Speech resource kinds: $($result.speech.existingResourceKinds -join ', ')"
            '- Speech credentials: environment only; never written to discovery reports'
        ) | Set-Content -Path $markdownPath -Encoding utf8
        Write-Host "  Discovery written to $DiscoveryOutputPath" -ForegroundColor Gray
        Write-Host "  Readable report written to $markdownPath" -ForegroundColor Gray
    }

    return $result
}