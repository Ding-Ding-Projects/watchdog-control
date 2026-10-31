Set-StrictMode -Version Latest
$ErrorActionPreference = 'Stop'
. (Join-Path $PSScriptRoot 'DependencyBootstrap.ps1')
$root = Get-ProjectRoot
$dotnet = Get-DotnetSdkPath
$node = Get-NodePath
$npm = Join-Path (Split-Path -Parent $node) 'npm.cmd'
$previousPath = $env:PATH
$env:PATH = (Split-Path -Parent $node) + [IO.Path]::PathSeparator + $previousPath
$artifacts = Join-Path $root 'artifacts'
New-Item -ItemType Directory -Force -Path $artifacts | Out-Null

function Invoke-Dotnet([string[]] $Arguments, [string] $Label) {
    Write-Host "Building $Label"
    & $script:dotnet @Arguments
    if ($LASTEXITCODE -ne 0) { throw "$Label exited with code $LASTEXITCODE." }
}

try {
    Push-Location $root
    Invoke-Dotnet @('restore', 'src/Watchdog.Web/Watchdog.Web.csproj', '-r', 'win-x64', '--locked-mode') 'controller restore'
    Invoke-Dotnet @('restore', 'src/Watchdog.Agent/Watchdog.Agent.csproj', '-r', 'win-x64', '--locked-mode') 'host agent restore'
    Invoke-Dotnet @('publish', 'src/Watchdog.Web/Watchdog.Web.csproj', '-c', 'Release', '-r', 'win-x64', '--self-contained', 'true', '--no-restore', '-o', 'artifacts/controller') 'the native controller'
    Invoke-Dotnet @('publish', 'src/Watchdog.Agent/Watchdog.Agent.csproj', '-c', 'Release', '-r', 'win-x64', '--self-contained', 'true', '--no-restore', '-p:PublishSingleFile=true', '-p:IncludeNativeLibrariesForSelfExtract=true', '-o', 'artifacts/agent') 'the Windows host agent'
    & (Join-Path $PSScriptRoot 'stage-hosting-tools.ps1') -NodePath $node
    Set-Location (Join-Path $root 'installer/Watchdog.SetupWizard')
    & $npm ci --no-audit --no-fund
    if ($LASTEXITCODE -ne 0) { throw "Setup dependency restore exited with code $LASTEXITCODE." }
    & $npm run build
    if ($LASTEXITCODE -ne 0) { throw "Setup renderer build exited with code $LASTEXITCODE." }
    Write-Host 'Build completed. The portable setup assistant bundles its native controller and hosting tools.'
    exit 0
}
catch {
    [Console]::Error.WriteLine("Build failed: $($_.Exception.Message)")
    exit 1
}
finally { $env:PATH = $previousPath; Pop-Location -ErrorAction SilentlyContinue }
