Set-StrictMode -Version Latest
$ErrorActionPreference = 'Stop'
$bootstrap = Join-Path $PSScriptRoot 'DependencyBootstrap.ps1'
. $bootstrap
$root = Split-Path -Parent $PSScriptRoot
$setupDirectory = Join-Path $root 'installer\Watchdog.SetupWizard'
$project = Join-Path $setupDirectory 'Watchdog.SetupWizard.csproj'
$publishDirectory = Join-Path $root ('artifacts\setup-wizard-publish-' + [guid]::NewGuid().ToString('N'))
$source = Join-Path $publishDirectory 'WatchdogControlSetup.exe'
$destinationDirectory = Join-Path $root 'release'
$destination = Join-Path $destinationDirectory 'WatchdogControlSetup.exe'
$sourceSha = $null
$buildUtc = (Get-Date).ToUniversalTime().ToString("yyyy-MM-dd'T'HH:mm:ss.fff'Z'", [System.Globalization.CultureInfo]::InvariantCulture)
try {
    $dotnet = Get-DotnetSdkPath
    $git = Get-Command git -ErrorAction Stop
    $sourceSha = (& $git.Source -C $root rev-parse --verify HEAD).Trim()
    if ($LASTEXITCODE -ne 0 -or $sourceSha -notmatch '^[a-f0-9]{40}$') { throw 'The source revision could not be resolved to a full Git commit SHA.' }
    $dirtySource = @(& $git.Source -C $root status --porcelain --untracked-files=all -- 'installer/Watchdog.SetupWizard')
    if ($LASTEXITCODE -ne 0) { throw 'The setup assistant source state could not be checked before packaging.' }
    if ($dirtySource.Count -gt 0) { throw 'The setup assistant source must be committed before packaging so the embedded source revision is exact.' }

    New-Item -ItemType Directory -Force -Path $publishDirectory | Out-Null
    Write-Host "Publishing the tailored WPF setup assistant as a self-contained single file from source $sourceSha."
    & $dotnet publish $project --configuration Release --runtime win-x64 --self-contained true --no-restore --output $publishDirectory `
        '-p:PublishSingleFile=true' '-p:IncludeNativeLibrariesForSelfExtract=true' '-p:EnableCompressionInSingleFile=true' `
        "-p:WatchdogBuildUtc=$buildUtc" "-p:WatchdogSourceSha=$sourceSha"
    if ($LASTEXITCODE -ne 0) { throw "The tailored setup assistant publish exited with code $LASTEXITCODE." }
    if (-not (Test-Path -LiteralPath $source -PathType Leaf)) { throw 'The single-file setup assistant output is missing.' }
    $publishedFiles = @(Get-ChildItem -LiteralPath $publishDirectory -File -Recurse)
    $publishedDirectories = @(Get-ChildItem -LiteralPath $publishDirectory -Directory -Recurse)
    if ($publishedFiles.Count -ne 1 -or $publishedFiles[0].FullName -ne $source -or $publishedDirectories.Count -ne 0) {
        throw 'The portable assistant output contains files beside the required single executable.'
    }
    New-Item -ItemType Directory -Force -Path $destinationDirectory | Out-Null
    $stagedDestination = "$destination.$PID.tmp"
    Copy-Item -LiteralPath $source -Destination $stagedDestination -Force
    if (Test-Path -LiteralPath $destination -PathType Leaf) {
        [System.IO.File]::Replace($stagedDestination, $destination, $null)
    }
    else {
        [System.IO.File]::Move($stagedDestination, $destination)
    }
    $item = Get-Item -LiteralPath $destination
    if ($item.Length -lt 10MB) { throw 'The packaged setup assistant is smaller than the minimum validated bundle size.' }
    $algorithm = [System.Security.Cryptography.SHA256]::Create()
    $stream = [System.IO.File]::OpenRead($destination)
    try {
        $digest = $algorithm.ComputeHash($stream)
        $hash = ([System.BitConverter]::ToString($digest)).Replace('-', '')
    }
    finally {
        $stream.Dispose()
        $algorithm.Dispose()
    }
    Set-Content -LiteralPath "$destination.sha256" -Value "$hash  WatchdogControlSetup.exe" -Encoding ascii
    Write-Host "Packaged single-file setup assistant: $destination ($($item.Length) bytes, SHA-256 $hash, source $sourceSha, built $buildUtc)."
    exit 0
}
catch {
    [Console]::Error.WriteLine("Installer packaging failed: $($_.Exception.Message)")
    exit 1
}
