# Compatibility entrypoint; Azure profile handling belongs to azure-discovery.
$environmentModule = Join-Path $PSScriptRoot '..\.github\skills\azure-discovery\scripts\azure-environment.ps1'
if (-not (Test-Path $environmentModule -PathType Leaf)) {
    throw 'The azure-discovery skill package is missing. Restore the project framework before selecting an Azure environment.'
}
. $environmentModule
