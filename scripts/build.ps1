Set-StrictMode -Version Latest
$ErrorActionPreference = 'Stop'
. (Join-Path $PSScriptRoot 'DependencyBootstrap.ps1')
$root = Get-ProjectRoot
$dotnet = Get-DotnetSdkPath
$artifacts = Join-Path $root 'artifacts'
New-Item -ItemType Directory -Force -Path $artifacts | Out-Null

function Invoke-Dotnet([string[]] $Arguments, [string] $Label) {
    Write-Host "Building $Label"
    & $script:dotnet @Arguments
    if ($LASTEXITCODE -ne 0) { throw "$Label exited with code $LASTEXITCODE." }
}

try {
    Push-Location $root
    Invoke-Dotnet @('restore', 'src/Watchdog.Web/Watchdog.Web.csproj', '--locked-mode') 'controller restore'
    Invoke-Dotnet @('restore', 'src/Watchdog.Agent/Watchdog.Agent.csproj', '-r', 'win-x64', '--locked-mode') 'host agent restore'
    Invoke-Dotnet @('restore', 'installer/Watchdog.SetupWizard/Watchdog.SetupWizard.csproj', '--locked-mode') 'setup assistant restore'
    Invoke-Dotnet @('build', 'src/Watchdog.Web/Watchdog.Web.csproj', '-c', 'Release', '--no-restore') 'the controller'
    Invoke-Dotnet @('publish', 'src/Watchdog.Agent/Watchdog.Agent.csproj', '-c', 'Release', '-r', 'win-x64', '--self-contained', 'true', '--no-restore', '-p:PublishSingleFile=true', '-p:IncludeNativeLibrariesForSelfExtract=true', '-o', 'artifacts/agent') 'the Windows host agent'
    Invoke-Dotnet @('build', 'installer/Watchdog.SetupWizard/Watchdog.SetupWizard.csproj', '-c', 'Release', '--no-restore') 'the tailored setup assistant'
    Write-Host 'Build completed. The tailored setup assistant is ready for single-file publishing through build-installer.bat.'
    exit 0
}
catch {
    [Console]::Error.WriteLine("Build failed: $($_.Exception.Message)")
    exit 1
}
finally { Pop-Location -ErrorAction SilentlyContinue }
