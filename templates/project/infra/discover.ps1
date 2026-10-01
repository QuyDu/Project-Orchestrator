# Compatibility entrypoint; discovery and cache policy belong to azure-discovery.
$discoveryModule = Join-Path $PSScriptRoot '..\.github\skills\azure-discovery\scripts\azure-discovery.ps1'
if (-not (Test-Path $discoveryModule -PathType Leaf)) {
    throw 'The azure-discovery skill package is missing. Restore the project framework before running discovery.'
}
. $discoveryModule
