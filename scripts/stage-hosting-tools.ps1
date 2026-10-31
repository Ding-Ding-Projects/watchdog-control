param([Parameter(Mandatory=$true)][string] $NodePath)
Set-StrictMode -Version Latest
$ErrorActionPreference = 'Stop'
$projectRoot = Split-Path -Parent $PSScriptRoot
$manifest = Get-Content -LiteralPath (Join-Path $projectRoot 'build-tools.json') -Raw | ConvertFrom-Json
$pin = $manifest.cloudflared
if ($pin.version -notmatch '^\d{4}\.\d+\.\d+$' -or
    $pin.url -ne "https://github.com/cloudflare/cloudflared/releases/download/$($pin.version)/cloudflared-windows-amd64.exe" -or
    $pin.sha256 -notmatch '^[a-f0-9]{64}$') { throw 'The cloudflared manifest is invalid.' }
$destination = Join-Path $projectRoot 'artifacts/tools'
New-Item -ItemType Directory -Force -Path $destination | Out-Null
$cloudflared = Join-Path $destination 'cloudflared.exe'
if (-not (Test-Path -LiteralPath $cloudflared) -or
    (Get-FileHash -LiteralPath $cloudflared -Algorithm SHA256).Hash.ToLowerInvariant() -ne $pin.sha256) {
    $temporary = Join-Path $destination ('cloudflared-' + [guid]::NewGuid().ToString('N') + '.download')
    $previousProgress = $ProgressPreference
    try {
        $ProgressPreference = 'SilentlyContinue'
        Invoke-WebRequest -UseBasicParsing -Uri $pin.url -OutFile $temporary
        if ((Get-FileHash -LiteralPath $temporary -Algorithm SHA256).Hash.ToLowerInvariant() -ne $pin.sha256) { throw 'The cloudflared download hash did not match.' }
        Move-Item -LiteralPath $temporary -Destination $cloudflared -Force
    }
    finally { $ProgressPreference = $previousProgress }
}
$nodeDestination = Join-Path $destination 'node.exe'
Copy-Item -LiteralPath $NodePath -Destination $nodeDestination -Force
if ((Get-FileHash -LiteralPath $nodeDestination).Hash -ne (Get-FileHash -LiteralPath $NodePath).Hash) { throw 'Node.js staging verification failed.' }
Write-Host "Verified bundled hosting tools: Node.js $($manifest.node.version), cloudflared $($pin.version)."
