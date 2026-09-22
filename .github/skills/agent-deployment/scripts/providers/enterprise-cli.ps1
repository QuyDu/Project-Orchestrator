param(
    [Parameter(Mandatory = $true)]
    [ValidateSet("pac", "atk")]
    [string] $Tool,

    [Parameter(Mandatory = $true)]
    [string] $LauncherPath,

    [Parameter(Mandatory = $true)]
    [string] $ArgumentsBase64
)

$ErrorActionPreference = "Stop"
[Console]::OutputEncoding = [System.Text.UTF8Encoding]::new($false)

try {
    if (-not [System.IO.Path]::IsPathRooted($LauncherPath) -or
        $LauncherPath -match '[^a-zA-Z0-9._:/\\ -]' -or
        -not (Test-Path -LiteralPath $LauncherPath -PathType Leaf)) {
        throw "Invalid launcher"
    }
    $launcher = Get-Item -LiteralPath $LauncherPath
    if ($launcher.BaseName -ine $Tool -or $launcher.Extension -notin @(".cmd", ".exe")) {
        throw "Unsupported launcher"
    }
    $ancestor = $launcher
    while ($null -ne $ancestor) {
        if (($ancestor.Attributes -band [System.IO.FileAttributes]::ReparsePoint) -ne 0) {
            throw "Linked launcher"
        }
        if ($ancestor -is [System.IO.FileInfo]) { $ancestor = $ancestor.Directory }
        else { $ancestor = $ancestor.Parent }
    }
    if ($ArgumentsBase64.Length -gt 60000) { throw "Arguments too large" }
    $decoded = [System.Text.Encoding]::UTF8.GetString([System.Convert]::FromBase64String($ArgumentsBase64))
    if (-not $decoded.TrimStart().StartsWith("[")) { throw "Expected argument array" }
    $parsed = ConvertFrom-Json -InputObject $decoded
    # Windows PowerShell 5 emits a JSON array as one pipeline object; expand it explicitly.
    $arguments = @($parsed)
    if ($arguments.Count -lt 1 -or $arguments.Count -gt 20) { throw "Invalid arguments" }
    foreach ($argument in $arguments) {
        if ($argument -isnot [string] -or $argument.Length -lt 1 -or
            $argument.Length -gt 2048 -or $argument -match '[^a-zA-Z0-9._:/\\ -]') {
            throw "Invalid argument"
        }
    }
    $shapes = @("--version")
    if ($Tool -eq "pac") {
        $shapes += @(
            "auth|who", "auth|list",
            "copilot|pack|--publisher-prefix|*|--project-dir|*|--output-path|*|--solution-name|*",
            "solution|import|--path|*|--environment|*",
            "solution|import|--path|*|--environment|*|--settings-file|*",
            "copilot|publish|--bot|*|--environment|*",
            "copilot|status|--bot-id|*|--environment|*",
            "solution|export|--name|*|--environment|*|--managed|--path|*"
        )
    } else {
        $shapes += @(
            "auth|list", "launchinfo|--manifest-id|*",
            "provision|--env|*|--folder|*|--ignore-env-file|-i|false",
            "deploy|--env|*|--folder|*|--config-file-path|*|--ignore-env-file|-i|false",
            "package|--env|*|--manifest-file|*|--output-folder|*|--output-package-file|*|--folder|*|-i|false",
            "publish|--env|*|--package-file|*|--output-folder|*|--output-package-file|*|--folder|*|-i|false",
            "update|--env|*|--package-file|*|--output-folder|*|--output-package-file|*|--folder|*|-i|false"
        )
    }
    $allowed = $false
    foreach ($candidate in $shapes) {
        $shape = $candidate.Split("|")
        if ($shape.Count -ne $arguments.Count) { continue }
        $matched = $true
        for ($index = 0; $index -lt $shape.Count; $index++) {
            if ($shape[$index] -eq "*") {
                if ($arguments[$index].StartsWith("-")) { $matched = $false }
            } elseif ($shape[$index] -cne $arguments[$index]) {
                $matched = $false
            }
        }
        if ($matched) { $allowed = $true; break }
    }
    if (-not $allowed) { throw "Unreviewed operation" }
    # PowerShell's call operator receives the launcher and arguments as data, never shell text.
    & $LauncherPath @arguments
    if ($LASTEXITCODE -ne 0) { throw "CLI failure" }
    exit 0
}
catch {
    [Console]::Error.WriteLine("Enterprise CLI execution failed; details redacted.")
    exit 1
}
