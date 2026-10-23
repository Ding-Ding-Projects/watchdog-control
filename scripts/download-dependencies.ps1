param([switch] $Silent)
Set-StrictMode -Version Latest
$ErrorActionPreference = 'Stop'
. (Join-Path $PSScriptRoot 'DependencyBootstrap.ps1')
try {
    $dotnet = Get-DotnetSdkPath
    $node = Get-NodePath
    $manifest = Get-Content (Join-Path (Get-ProjectRoot) 'build-tools.json') -Raw | ConvertFrom-Json
    if (-not $Silent) { Write-Host "Verified .NET SDK $($manifest.dotnetSdk.version) at $dotnet" }
    if (-not $Silent) { Write-Host "Verified Node.js $($manifest.node.version) at $node" }
    exit 0
}
catch {
    [Console]::Error.WriteLine("Dependency setup failed: $($_.Exception.Message)")
    exit 1
}
