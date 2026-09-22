param(
    [Parameter(Mandatory = $true)]
    [ValidateSet("version", "cloud", "account", "token", "token-arm")]
    [string] $Operation,

    [Parameter(Mandatory = $true)]
    [string] $AzureCliPath
)

$ErrorActionPreference = "Stop"
[Console]::OutputEncoding = [System.Text.UTF8Encoding]::new($false)

try {
    if (-not [System.IO.Path]::IsPathRooted($AzureCliPath) -or
        $AzureCliPath -match '["%!\r\n&|<>^]' -or
        -not (Test-Path -LiteralPath $AzureCliPath -PathType Leaf)) {
        throw "Invalid launcher"
    }
    $launcher = Get-Item -LiteralPath $AzureCliPath
    if ($launcher.BaseName -ine "az" -or $launcher.Extension -notin @(".cmd", ".exe")) {
        throw "Unsupported launcher"
    }

    $commandArguments = switch ($Operation) {
        "version" { @("version", "--output", "json") }
        "cloud" { @("cloud", "show", "--output", "json") }
        "account" { @("account", "show", "--output", "json", "--only-show-errors") }
        "token" { @("account", "get-access-token", "--resource", "https://ai.azure.com", "--output", "json", "--only-show-errors") }
        "token-arm" { @("account", "get-access-token", "--resource", "https://management.azure.com/", "--output", "json", "--only-show-errors") }
    }

    # The resolved executable path is data, and every argument comes from the fixed operation table.
    $output = & $AzureCliPath @commandArguments 2>$null
    if ($LASTEXITCODE -ne 0) {
        throw "CLI rejected the operation"
    }
    $output | ForEach-Object { [Console]::Out.WriteLine($_) }
    exit 0
}
catch {
    [Console]::Error.WriteLine("Azure CLI execution failed; details redacted.")
    exit 1
}
