Set-StrictMode -Version Latest
$ErrorActionPreference = 'Stop'
. (Join-Path $PSScriptRoot 'DependencyBootstrap.ps1')
$projectRoot = Get-ProjectRoot
$previousPath = $env:PATH
try {
    $node = Get-NodePath
    $env:PATH = (Split-Path -Parent $node) + [IO.Path]::PathSeparator + $previousPath
    $npm = Join-Path (Split-Path -Parent $node) 'npm.cmd'
    $sourceSha = (& git -C $projectRoot rev-parse HEAD).Trim()
    if ($LASTEXITCODE -ne 0 -or $sourceSha -notmatch '^[a-f0-9]{40}$') { throw 'The source revision is unavailable.' }
    $dirty = @(& git -C $projectRoot status --porcelain --untracked-files=all)
    if ($LASTEXITCODE -ne 0 -or $dirty.Count -gt 0) { throw 'Commit the source before packaging so the embedded revision identifies the complete build.' }
    $setupDirectory = Join-Path $projectRoot 'installer/Watchdog.SetupWizard'
    $provenance = Get-Content -LiteralPath (Join-Path $setupDirectory 'build-provenance.json') -Raw | ConvertFrom-Json
    if ($provenance.sourceCommit -ne $sourceSha) { throw 'The renderer build belongs to a different source revision.' }
    Push-Location $setupDirectory
    & $npm run package:portable
    if ($LASTEXITCODE -ne 0) { throw "Portable packaging exited with code $LASTEXITCODE." }
    $source = Join-Path $projectRoot 'artifacts/electron-setup/WatchdogControlSetup.exe'
    if (-not (Test-Path -LiteralPath $source -PathType Leaf) -or (Get-Item -LiteralPath $source).Length -lt 10MB) { throw 'The portable setup executable is missing or incomplete.' }
    $destinationDirectory = Join-Path $projectRoot 'release'
    New-Item -ItemType Directory -Force -Path $destinationDirectory | Out-Null
    $destination = Join-Path $destinationDirectory 'WatchdogControlSetup.exe'
    if (Test-Path -LiteralPath $destination) {
        Copy-Item -LiteralPath $destination -Destination (Join-Path $projectRoot ('artifacts/WatchdogControlSetup.previous-' + [guid]::NewGuid().ToString('N') + '.exe'))
    }
    Copy-Item -LiteralPath $source -Destination $destination -Force
    $hash = (Get-FileHash -LiteralPath $destination -Algorithm SHA256).Hash
    Set-Content -LiteralPath "$destination.sha256" -Value "$hash  WatchdogControlSetup.exe" -Encoding ascii
    $receipt = @{ schemaVersion=1; sourceCommit=$sourceSha; version=$provenance.version; builtAtUtc=$provenance.builtAtUtc; sha256=$hash; file='WatchdogControlSetup.exe'; bundledController=$true; bundledTunnel=$true }
    $receipt | ConvertTo-Json | Set-Content -LiteralPath (Join-Path $destinationDirectory 'setup-build.json') -Encoding UTF8
    Write-Host "Packaged portable setup assistant: $destination, source $sourceSha, SHA-256 $hash."
    exit 0
}
catch { [Console]::Error.WriteLine("Installer packaging failed: $($_.Exception.Message)"); exit 1 }
finally { $env:PATH=$previousPath; Pop-Location -ErrorAction SilentlyContinue }
