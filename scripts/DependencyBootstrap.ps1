Set-StrictMode -Version Latest
$ErrorActionPreference = 'Stop'

function Get-ProjectRoot {
    return (Split-Path -Parent $PSScriptRoot)
}

function Test-SdkVersion([string] $Executable, [string] $ExpectedVersion) {
    if (-not (Test-Path -LiteralPath $Executable -PathType Leaf)) { return $false }
    $prior = Get-Location
    try {
        Set-Location (Get-ProjectRoot)
        $actual = (& $Executable --version 2>$null | Select-Object -Last 1).Trim()
        return $LASTEXITCODE -eq 0 -and $actual -eq $ExpectedVersion
    }
    finally { Set-Location $prior }
}

function Get-DotnetSdkPath {
    $root = Get-ProjectRoot
    $manifestPath = Join-Path $root 'build-tools.json'
    $manifest = Get-Content -LiteralPath $manifestPath -Raw | ConvertFrom-Json
    if ($manifest.schemaVersion -ne 1 -or $manifest.dotnetSdk.version -notmatch '^10\.0\.[0-9]+$' -or
        $manifest.dotnetSdk.rid -ne 'win-x64' -or $manifest.dotnetSdk.archiveUrl -notmatch '^https://builds\.dotnet\.microsoft\.com/' -or
        $manifest.dotnetSdk.sha512 -notmatch '^[a-f0-9]{128}$') {
        throw 'The pinned .NET SDK manifest is invalid.'
    }

    $localSdk = Join-Path $root '.tools\dotnet\dotnet.exe'
    if (Test-SdkVersion $localSdk $manifest.dotnetSdk.version) { return $localSdk }

    $existing = Get-Command dotnet.exe -ErrorAction SilentlyContinue
    if ($existing -and (Test-SdkVersion $existing.Source $manifest.dotnetSdk.version)) { return $existing.Source }

    $toolsRoot = Join-Path $root '.tools'
    $cacheRoot = Join-Path $toolsRoot 'cache'
    $archive = Join-Path $cacheRoot "dotnet-sdk-$($manifest.dotnetSdk.version)-win-x64.zip"
    $staging = Join-Path $toolsRoot ('.dotnet-stage-' + [guid]::NewGuid().ToString('N'))
    New-Item -ItemType Directory -Force -Path $cacheRoot | Out-Null
    if (-not (Test-Path -LiteralPath $archive -PathType Leaf) -or
        (Get-FileHash -LiteralPath $archive -Algorithm SHA512).Hash.ToLowerInvariant() -ne $manifest.dotnetSdk.sha512) {
        Remove-Item -LiteralPath $archive -Force -ErrorAction SilentlyContinue
        Write-Host "Downloading .NET SDK $($manifest.dotnetSdk.version) into the project cache."
        Invoke-WebRequest -Uri $manifest.dotnetSdk.archiveUrl -OutFile $archive
    }
    $actualHash = (Get-FileHash -LiteralPath $archive -Algorithm SHA512).Hash.ToLowerInvariant()
    if ($actualHash -ne $manifest.dotnetSdk.sha512) {
        Remove-Item -LiteralPath $archive -Force -ErrorAction SilentlyContinue
        throw ".NET SDK archive SHA-512 did not match the pinned manifest. Expected $($manifest.dotnetSdk.sha512), received $actualHash."
    }

    try {
        New-Item -ItemType Directory -Path $staging | Out-Null
        Expand-Archive -LiteralPath $archive -DestinationPath $staging -Force
        $stagedExecutable = Join-Path $staging 'dotnet.exe'
        if (-not (Test-Path -LiteralPath $stagedExecutable -PathType Leaf)) { throw 'The pinned SDK archive did not contain dotnet.exe.' }
        $installed = Join-Path $toolsRoot 'dotnet'
        if (Test-Path -LiteralPath $installed) {
            $backup = Join-Path $toolsRoot ('.dotnet-old-' + [guid]::NewGuid().ToString('N'))
            Move-Item -LiteralPath $installed -Destination $backup
            Move-Item -LiteralPath $staging -Destination $installed
            Remove-Item -LiteralPath $backup -Recurse -Force
        }
        else { Move-Item -LiteralPath $staging -Destination $installed }
    }
    finally {
        if (Test-Path -LiteralPath $staging) { Remove-Item -LiteralPath $staging -Recurse -Force }
    }

    $resolved = Join-Path $toolsRoot 'dotnet\dotnet.exe'
    if (-not (Test-SdkVersion $resolved $manifest.dotnetSdk.version)) { throw "The installed project-local .NET SDK did not report version $($manifest.dotnetSdk.version)." }
    return $resolved
}

function Test-NodeVersion([string] $Executable, [string] $ExpectedVersion) {
    if (-not (Test-Path -LiteralPath $Executable -PathType Leaf)) { return $false }
    try {
        $actual = (& $Executable --version 2>$null | Select-Object -Last 1).Trim()
        return $LASTEXITCODE -eq 0 -and $actual -eq "v$ExpectedVersion"
    }
    catch { return $false }
}

function Get-NodePath {
    $root = Get-ProjectRoot
    $manifestPath = Join-Path $root 'build-tools.json'
    $manifest = Get-Content -LiteralPath $manifestPath -Raw | ConvertFrom-Json
    if ($manifest.schemaVersion -ne 1 -or $manifest.node.version -notmatch '^24\.[0-9]+\.[0-9]+$' -or
        $manifest.node.rid -ne 'win-x64' -or $manifest.node.archiveUrl -notmatch '^https://nodejs\.org/dist/v24\.[0-9]+\.[0-9]+/node-v24\.[0-9]+\.[0-9]+-win-x64\.zip$' -or
        $manifest.node.sha256 -notmatch '^[a-f0-9]{64}$') {
        throw 'The pinned Node.js build-runtime manifest is invalid.'
    }

    $localNode = Join-Path $root '.tools\node\node.exe'
    if (Test-NodeVersion $localNode $manifest.node.version) { return $localNode }
    $existing = Get-Command node.exe -ErrorAction SilentlyContinue
    if ($existing -and (Test-NodeVersion $existing.Source $manifest.node.version)) { return $existing.Source }

    $toolsRoot = Join-Path $root '.tools'
    $cacheRoot = Join-Path $toolsRoot 'cache'
    $archive = Join-Path $cacheRoot "node-$($manifest.node.version)-win-x64.zip"
    $staging = Join-Path $toolsRoot ('.node-stage-' + [guid]::NewGuid().ToString('N'))
    New-Item -ItemType Directory -Force -Path $cacheRoot | Out-Null
    if (-not (Test-Path -LiteralPath $archive -PathType Leaf) -or
        (Get-FileHash -LiteralPath $archive -Algorithm SHA256).Hash.ToLowerInvariant() -ne $manifest.node.sha256) {
        Remove-Item -LiteralPath $archive -Force -ErrorAction SilentlyContinue
        Write-Host "Downloading pinned Node.js $($manifest.node.version) into the project cache."
        Invoke-WebRequest -Uri $manifest.node.archiveUrl -OutFile $archive
    }
    $actualHash = (Get-FileHash -LiteralPath $archive -Algorithm SHA256).Hash.ToLowerInvariant()
    if ($actualHash -ne $manifest.node.sha256) {
        Remove-Item -LiteralPath $archive -Force -ErrorAction SilentlyContinue
        throw "Node.js archive SHA-256 did not match the pinned manifest. Expected $($manifest.node.sha256), received $actualHash."
    }

    try {
        New-Item -ItemType Directory -Path $staging | Out-Null
        Expand-Archive -LiteralPath $archive -DestinationPath $staging -Force
        $stagedRoot = Join-Path $staging "node-v$($manifest.node.version)-win-x64"
        $stagedExecutable = Join-Path $stagedRoot 'node.exe'
        $stagedNpm = Join-Path $stagedRoot 'npm.cmd'
        if (-not (Test-Path -LiteralPath $stagedExecutable -PathType Leaf) -or -not (Test-Path -LiteralPath $stagedNpm -PathType Leaf)) {
            throw 'The pinned Node.js archive did not contain node.exe and npm.cmd.'
        }
        $installed = Join-Path $toolsRoot 'node'
        $replacement = Join-Path $toolsRoot ('.node-new-' + [guid]::NewGuid().ToString('N'))
        Move-Item -LiteralPath $stagedRoot -Destination $replacement
        if (Test-Path -LiteralPath $installed) {
            $backup = Join-Path $toolsRoot ('.node-old-' + [guid]::NewGuid().ToString('N'))
            Move-Item -LiteralPath $installed -Destination $backup
            Move-Item -LiteralPath $replacement -Destination $installed
            Remove-Item -LiteralPath $backup -Recurse -Force
        }
        else { Move-Item -LiteralPath $replacement -Destination $installed }
    }
    finally {
        if (Test-Path -LiteralPath $staging) { Remove-Item -LiteralPath $staging -Recurse -Force }
    }

    $resolved = Join-Path $toolsRoot 'node\node.exe'
    if (-not (Test-NodeVersion $resolved $manifest.node.version)) { throw "The installed project-local Node.js runtime did not report version $($manifest.node.version)." }
    if (-not (Test-Path -LiteralPath (Join-Path (Split-Path -Parent $resolved) 'npm.cmd') -PathType Leaf)) { throw 'The installed project-local Node.js archive did not retain npm.cmd.' }
    return $resolved
}
