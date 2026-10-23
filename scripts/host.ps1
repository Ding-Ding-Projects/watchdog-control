param([Parameter(Mandatory=$true)][ValidateSet('--detached','--logs','--stop')][string] $Mode)
Set-StrictMode -Version Latest
$ErrorActionPreference = 'Stop'
$root = Split-Path -Parent $PSScriptRoot
$compose = Join-Path $root 'compose.yaml'
$envFile = Join-Path $root '.env'
$project = 'watchdog-control'

function Invoke-Docker([string[]] $Arguments, [switch] $Capture) {
    $full = @('compose', '--env-file', $envFile, '-p', $project, '-f', $compose) + $Arguments
    if ($Capture) {
        $output = & docker @full 2>&1
        $code = $LASTEXITCODE
        return [pscustomobject]@{ ExitCode = $code; Output = ($output -join [Environment]::NewLine) }
    }
    & docker @full
    if ($LASTEXITCODE -ne 0) { throw "Docker Compose exited with code $LASTEXITCODE." }
}

function Read-Configuration {
    if (-not (Test-Path -LiteralPath $compose -PathType Leaf)) { throw 'The tracked compose.yaml file is missing.' }
    if (-not (Test-Path -LiteralPath $envFile -PathType Leaf)) { throw 'Copy default.env.example from the release, or .env.example from the source checkout, to .env and fill in the published digest, host port, storage path and protected file paths.' }
    $values = @{}
    foreach ($line in Get-Content -LiteralPath $envFile) {
        $trimmed = $line.Trim()
        if (-not $trimmed -or $trimmed.StartsWith('#')) { continue }
        if ($trimmed -notmatch '^([A-Z0-9_]+)=(.*)$') { throw 'The .env file contains a line outside the supported KEY=VALUE format.' }
        $raw = $Matches[2].Trim()
        if ($raw.StartsWith('"') -and $raw.EndsWith('"') -and $raw.Length -ge 2) {
            $escapedQuote = [string]([char]92) + '"'
            $raw = $raw.Substring(1, $raw.Length - 2).Replace($escapedQuote, '"', [StringComparison]::Ordinal).Replace('$$', '$', [StringComparison]::Ordinal)
        }
        $values[$Matches[1]] = $raw
    }
    if ($values['WATCHDOG_IMAGE'] -notmatch '^ghcr\.io/ding-ding-projects/watchdog-control@sha256:[0-9a-f]{64}$') { throw 'WATCHDOG_IMAGE must name an immutable published image digest.' }
    if (-not $values.ContainsKey('WATCHDOG_HOST_BIND_IP') -or -not (Test-PrivateIPv4 $values['WATCHDOG_HOST_BIND_IP'])) { throw 'WATCHDOG_HOST_BIND_IP must be a private IPv4 address assigned to an active physical network adapter.' }
    $port = 0
    if (-not [int]::TryParse($values['WATCHDOG_HOST_PORT'], [ref] $port) -or $port -lt 1024 -or $port -gt 65535) { throw 'WATCHDOG_HOST_PORT must be an unused port from 1024 through 65535.' }
    foreach ($name in @('WATCHDOG_DATA_PATH','WATCHDOG_TLS_CERTIFICATE_HOST_FILE','WATCHDOG_TLS_PASSWORD_HOST_FILE','WATCHDOG_PAIRING_CODE_HOST_FILE','WATCHDOG_AGENT_ENROLLMENT_CODE_HOST_FILE')) {
        if ([string]::IsNullOrWhiteSpace($values[$name])) { throw "$name must be set in .env." }
    }
    foreach ($name in @('WATCHDOG_TLS_CERTIFICATE_HOST_FILE','WATCHDOG_TLS_PASSWORD_HOST_FILE','WATCHDOG_PAIRING_CODE_HOST_FILE','WATCHDOG_AGENT_ENROLLMENT_CODE_HOST_FILE')) {
        if (-not (Test-Path -LiteralPath $values[$name] -PathType Leaf)) { throw "$name points to a missing protected file." }
    }
    $resolvedData = [IO.Path]::GetFullPath([Environment]::ExpandEnvironmentVariables($values['WATCHDOG_DATA_PATH']))
    $values['WATCHDOG_DATA_PATH'] = $resolvedData
    return [pscustomobject]@{ Values = $values; Port = $port; BindAddress = $values['WATCHDOG_HOST_BIND_IP']; DataPath = $values['WATCHDOG_DATA_PATH'] }
}

function Test-PrivateIPv4([string] $Address) {
    if ($Address -notmatch '^\d{1,3}(\.\d{1,3}){3}$') { return $false }
    $parsed = $null
    if (-not [Net.IPAddress]::TryParse($Address, [ref] $parsed) -or $parsed.AddressFamily -ne [Net.Sockets.AddressFamily]::InterNetwork -or $parsed.ToString() -cne $Address) { return $false }
    $octets = $Address.Split('.')
    $first = [int]$octets[0]
    $second = [int]$octets[1]
    return ($first -eq 10) -or ($first -eq 172 -and $second -ge 16 -and $second -le 31) -or ($first -eq 192 -and $second -eq 168)
}

function Get-ActivePrivateLanAddresses {
    $interfaces = Get-NetAdapter -Physical -ErrorAction SilentlyContinue | Where-Object { $_.Status -eq 'Up' }
    $addresses = foreach ($adapter in $interfaces) {
        Get-NetIPAddress -InterfaceIndex $adapter.ifIndex -AddressFamily IPv4 -ErrorAction SilentlyContinue |
            Where-Object { Test-PrivateIPv4 $_.IPAddress } |
            Select-Object -ExpandProperty IPAddress
    }
    return @($addresses | Sort-Object -Unique)
}

function Assert-LocalEngine {
    $context = & docker context show 2>&1
    if ($LASTEXITCODE -ne 0) { throw 'Docker could not read the active context.' }
    $endpointJson = & docker context inspect --format '{{json .Endpoints.docker.Host}}' 2>&1
    if ($LASTEXITCODE -ne 0) { throw 'Docker could not identify the active engine endpoint.' }
    try { $endpoint = ConvertFrom-Json -InputObject (($endpointJson -join '').Trim()) -ErrorAction Stop }
    catch { throw 'Docker returned an unreadable engine endpoint.' }
    if ($endpoint -isnot [string] -or -not $endpoint.StartsWith('npipe://',[StringComparison]::OrdinalIgnoreCase)) {
        throw 'This host entrypoint accepts only a local Windows named-pipe Docker engine. No remote context was changed.'
    }
    $composeVersion = & docker compose version 2>&1
    if ($LASTEXITCODE -ne 0) { throw 'The Docker Compose plugin is unavailable.' }
    $serverVersion = & docker info --format '{{.ServerVersion}}' 2>&1
    if ($LASTEXITCODE -ne 0) { throw 'Docker Engine is not reachable. Start Docker Desktop, then retry.' }
    Write-Host "Docker Engine: $($serverVersion -join ' ')"
    Write-Host "Compose: $($composeVersion -join ' ')"
    Write-Host "Local context: $($context -join ' ')"
}

function Get-Sha256Hex([byte[]] $Bytes) {
    $algorithm = [Security.Cryptography.SHA256]::Create()
    try { return ([BitConverter]::ToString($algorithm.ComputeHash($Bytes))).Replace('-', '') }
    finally { $algorithm.Dispose() }
}

function Get-PinnedClient([string] $CertificateFile, [string] $PasswordFile) {
    $password = [IO.File]::ReadAllText($PasswordFile).Trim()
    $certificate = New-Object Security.Cryptography.X509Certificates.X509Certificate2($CertificateFile, $password, [Security.Cryptography.X509Certificates.X509KeyStorageFlags]::EphemeralKeySet)
    try { $expected = Get-Sha256Hex $certificate.RawData }
    finally { $certificate.Dispose() }
    $handler = [Net.Http.HttpClientHandler]::new()
    $handler.ServerCertificateCustomValidationCallback = {
        param($request, $remoteCertificate, $chain, $errors)
        if ($null -eq $remoteCertificate) { return $false }
        $actual = Get-Sha256Hex $remoteCertificate.GetRawCertData()
        $nameMismatch = ($errors -band [Net.Security.SslPolicyErrors]::RemoteCertificateNameMismatch) -ne [Net.Security.SslPolicyErrors]::None
        $certificateUnavailable = ($errors -band [Net.Security.SslPolicyErrors]::RemoteCertificateNotAvailable) -ne [Net.Security.SslPolicyErrors]::None
        return (-not $nameMismatch) -and (-not $certificateUnavailable) -and [string]::Equals($expected, $actual, [StringComparison]::OrdinalIgnoreCase)
    }.GetNewClosure()
    $client = [Net.Http.HttpClient]::new($handler)
    $client.Timeout = [TimeSpan]::FromSeconds(4)
    return $client
}

function Wait-ForHealth([int] $Port) {
    $deadline = [DateTimeOffset]::UtcNow.AddSeconds(90)
    while ([DateTimeOffset]::UtcNow -lt $deadline) {
        $id = Invoke-Docker @('ps','-q','watchdog') -Capture
        if ($id.ExitCode -ne 0 -or [string]::IsNullOrWhiteSpace($id.Output)) { Start-Sleep -Seconds 3; continue }
        $health = & docker inspect --format '{{if .State.Health}}{{.State.Health.Status}}{{else}}{{.State.Status}}{{end}}' $id.Output.Trim() 2>&1
        if ($LASTEXITCODE -eq 0 -and (($health -join '').Trim() -eq 'healthy')) { return }
        $state = & docker inspect --format '{{.State.Status}}' $id.Output.Trim() 2>&1
        if ($LASTEXITCODE -eq 0 -and (($state -join '').Trim() -in @('exited','dead'))) {
            $logs = Invoke-Docker @('logs','--tail','40','watchdog') -Capture
            throw "The Watchdog Control container did not become healthy. Recent service output:`n$($logs.Output)"
        }
        Start-Sleep -Seconds 3
    }
    throw 'The service did not become healthy within 90 seconds. It may still be running; no automatic removal was attempted.'
}

function Get-LanAddress([string] $BindAddress, [int] $Port, [string] $CertificateFile, [string] $PasswordFile) {
    if ($BindAddress -notin (Get-ActivePrivateLanAddresses)) { return $null }
    $client = Get-PinnedClient $CertificateFile $PasswordFile
    try {
        try {
            $response = $client.GetAsync("https://$BindAddress`:$Port/health").GetAwaiter().GetResult()
            if ($response.IsSuccessStatusCode) { return "https://$BindAddress`:$Port/" }
        }
        catch [Net.Http.HttpRequestException] { }
        catch [System.Threading.Tasks.TaskCanceledException] { }
    }
    finally { $client.Dispose() }
    return $null
}

function Start-ServiceStack([int] $Port, [string] $BindAddress, [string] $CertificateFile, [string] $PasswordFile, [string] $DataPath) {
    if ($BindAddress -notin (Get-ActivePrivateLanAddresses)) { throw 'The configured private LAN address is no longer assigned to an active physical adapter. Reopen setup and select a current address.' }
    New-Item -ItemType Directory -Force -Path $DataPath | Out-Null
    Write-Host 'Validating the tracked Compose configuration…'
    Invoke-Docker @('config','--quiet')
    Write-Host 'Pulling the immutable Watchdog Control image…'
    Invoke-Docker @('pull','watchdog')
    Write-Host 'Starting only the Watchdog Control service…'
    Invoke-Docker @('up','-d','watchdog')
    Write-Host 'Waiting up to 90 seconds for container health…'
    Wait-ForHealth $Port
    $url = Get-LanAddress $BindAddress $Port $CertificateFile $PasswordFile
    if ($null -eq $url) { throw 'The container is healthy, but this host could not verify a LAN-interface health response. Check the firewall and retry. The container remains running.' }
    Write-Host ''
    Write-Host "Verified from this computer: $url"
    Write-Host "Container port: 8443; published host port: $Port"
    Write-Host 'Check the complete HTTPS URL from another LAN device before treating LAN client reachability as verified.'
}

function Show-LogsTui {
    $config = Invoke-Docker @('config','--services') -Capture
    if ($config.ExitCode -ne 0) { throw "Could not list Compose services: $($config.Output)" }
    $services = @($config.Output -split "`r?`n" | Where-Object { -not [string]::IsNullOrWhiteSpace($_) })
    if ($services.Count -eq 0) { throw 'The Compose file defines no service.' }
    $selected = 0
    $follow = $true
    $lines = [Collections.Generic.List[string]]::new()
    $logProcess = $null
    $queue = [Collections.Concurrent.ConcurrentQueue[string]]::new()
    $script:watchdogLogUi = [pscustomobject]@{
        EnvFile = $envFile; Project = $project; Compose = $compose; Services = $services; Selected = $selected;
        Follow = $follow; Process = $null; Queue = $queue
    }
    function Start-SelectedLogs {
        $state = $script:watchdogLogUi
        if ($state.Process -and -not $state.Process.HasExited) { $state.Process.Kill(); $state.Process.WaitForExit() }
        $args = @('compose','--env-file',$state.EnvFile,'-p',$state.Project,'-f',$state.Compose,'logs','--tail','80')
        if ($state.Follow) { $args += '-f' }
        $args += $state.Services[$state.Selected]
        $start = [Diagnostics.ProcessStartInfo]::new('docker')
        $start.UseShellExecute = $false; $start.RedirectStandardOutput = $true; $start.RedirectStandardError = $true; $start.CreateNoWindow = $true
        foreach ($arg in $args) { [void]$start.ArgumentList.Add($arg) }
        $state.Process = [Diagnostics.Process]::new(); $state.Process.StartInfo = $start
        $outputAction = { param($sender, $eventArgs) if ($eventArgs.Data) { [void]$state.Queue.Enqueue($eventArgs.Data) } }.GetNewClosure()
        $errorAction = { param($sender, $eventArgs) if ($eventArgs.Data) { [void]$state.Queue.Enqueue($eventArgs.Data) } }.GetNewClosure()
        $outputHandler = [Diagnostics.DataReceivedEventHandler]$outputAction
        $errorHandler = [Diagnostics.DataReceivedEventHandler]$errorAction
        $state.Process.add_OutputDataReceived($outputHandler)
        $state.Process.add_ErrorDataReceived($errorHandler)
        if (-not $state.Process.Start()) { throw 'The Docker Compose log process could not start.' }
        $state.Process.BeginOutputReadLine(); $state.Process.BeginErrorReadLine()
    }
    try {
        Start-SelectedLogs
        [Console]::CursorVisible = $false
        while ($true) {
            $script:watchdogLogUi.Selected = $selected
            $script:watchdogLogUi.Follow = $follow
            $id = Invoke-Docker @('ps','-q',$services[$selected]) -Capture
            $status = if ($id.ExitCode -eq 0 -and $id.Output.Trim()) { (& docker inspect --format '{{.State.Status}}{{if .State.Health}} · {{.State.Health.Status}}{{end}}' $id.Output.Trim() 2>$null) -join '' } else { 'stopped or not created' }
            $queued = $null
            while ($queue.TryDequeue([ref]$queued)) { $lines.Add(("{0:HH:mm:ss} {1}" -f [DateTime]::Now,$queued)); if ($lines.Count -gt 300) { $lines.RemoveAt(0) } }
            $width = [Math]::Max(20, [Console]::WindowWidth - 1)
            [Console]::SetCursorPosition(0,0)
            [Console]::WriteLine(("Watchdog Control | service {0}/{1}: {2} | {3} | Up/Down switch · F follow {4} · R refresh · Esc return" -f ($selected+1),$services.Count,$services[$selected],$status,($(if($follow){'on'}else{'off'}))).PadRight($width))
            [Console]::WriteLine(('─' * $width))
            $visible = [Math]::Max(1,[Console]::WindowHeight-4)
            $tail = @($lines | Select-Object -Last $visible)
            foreach ($line in $tail) { [Console]::WriteLine(($line.Substring(0,[Math]::Min($line.Length,$width))).PadRight($width)) }
            for ($row=$tail.Count; $row -lt $visible; $row++) { [Console]::WriteLine(''.PadRight($width)) }
            if ([Console]::KeyAvailable) {
                $key = [Console]::ReadKey($true).Key
                $shouldExit = $false
                switch ($key) {
                    'Escape' { $shouldExit = $true }
                    'UpArrow' { $selected = ($selected - 1 + $services.Count) % $services.Count; $lines.Clear(); Start-SelectedLogs }
                    'DownArrow' { $selected = ($selected + 1) % $services.Count; $lines.Clear(); Start-SelectedLogs }
                    'F' { $follow = -not $follow; Start-SelectedLogs }
                    'R' { $lines.Clear(); Start-SelectedLogs }
                }
                if ($shouldExit) { break }
            }
            Start-Sleep -Milliseconds 300
        }
    }
    finally {
        if ($script:watchdogLogUi.Process -and -not $script:watchdogLogUi.Process.HasExited) { $script:watchdogLogUi.Process.Kill(); $script:watchdogLogUi.Process.WaitForExit() }
        [Console]::CursorVisible = $true
        [Console]::Clear()
        Write-Host 'The log view closed. The container remains running.'
    }
}

try {
    $configuration = Read-Configuration
    Assert-LocalEngine
    if ($Mode -eq '--stop') {
        Invoke-Docker @('stop','watchdog')
        Write-Host 'Watchdog Control was stopped. Persistent data was preserved.'
        exit 0
    }
    if ($Mode -eq '--logs') { Show-LogsTui; exit 0 }
    Start-ServiceStack $configuration.Port $configuration.BindAddress $configuration.Values['WATCHDOG_TLS_CERTIFICATE_HOST_FILE'] $configuration.Values['WATCHDOG_TLS_PASSWORD_HOST_FILE'] $configuration.DataPath
    exit 0
}
catch {
    [Console]::Error.WriteLine("Watchdog Control host action did not complete: $($_.Exception.Message)")
    exit 1
}
