param([switch]$Stop, [switch]$LocalOnly, [int]$Port = 8788)
$ErrorActionPreference = 'Stop'
$trial = Join-Path $PSScriptRoot "data\online-$Port"
$processFile = Join-Path $trial 'processes.json'

function Get-LiveTrialProcesses($record) {
    foreach ($item in $record) {
        $process = Get-Process -Id $item.Id -ErrorAction SilentlyContinue
        if ($process -and $process.StartTime.ToFileTimeUtc().ToString() -eq $item.Started) {
            $process
        }
    }
}

function Stop-Trial($record) {
    Get-LiveTrialProcesses $record | Stop-Process
}

if ($Stop) {
    if (Test-Path $processFile) {
        Stop-Trial (Get-Content -Raw $processFile | ConvertFrom-Json)
        Remove-Item -LiteralPath $processFile
    }
    return
}

if (Test-Path $processFile) {
    $record = Get-Content -Raw $processFile | ConvertFrom-Json
    if (Get-LiveTrialProcesses $record) {
        throw 'Trial already running. Use -Stop before restarting.'
    }
    Remove-Item -LiteralPath $processFile
}
$tunnel = Join-Path $PSScriptRoot 'data\tools\cloudflared.exe'
if (!$LocalOnly -and !(Test-Path $tunnel)) {
    throw 'Download the official Windows cloudflared executable to game/data/tools/cloudflared.exe.'
}
New-Item -ItemType Directory -Force $trial | Out-Null
$env:GAME_PUBLIC = '1'
$env:HOST = '127.0.0.1'
$env:PORT = [string]$Port
$env:GAME_DATA = Join-Path $trial 'rooms.json'
$origin = "http://127.0.0.1:$Port"
$nodeOptions = @{
    FilePath = (Get-Command node).Source
    ArgumentList = @('server.mjs')
    WorkingDirectory = $PSScriptRoot
    WindowStyle = 'Hidden'
    RedirectStandardOutput = (Join-Path $trial 'server.log')
    RedirectStandardError = (Join-Path $trial 'server.err.log')
    PassThru = $true
}
$started = @()
try {
    $server = Start-Process @nodeOptions
    $started += @{ Id = $server.Id; Started = $server.StartTime.ToFileTimeUtc().ToString() }
    $ready = $false
    for ($attempt = 0; $attempt -lt 20; $attempt++) {
        if ($server.HasExited) { throw "Game server exited. See $($nodeOptions.RedirectStandardError)." }
        try {
            $ready = (Invoke-WebRequest $origin -UseBasicParsing -TimeoutSec 1).StatusCode -eq 200
            if ($ready) { break }
        } catch { Start-Sleep -Milliseconds 200 }
    }
    if (!$ready) { throw 'Local gameplay server did not respond.' }
    if ($LocalOnly) {
        ConvertTo-Json -InputObject $started | Set-Content -Encoding UTF8 $processFile
        Write-Output $origin
        return
    }
    $tunnelLog = Join-Path $trial 'tunnel.err.log'
    $proxy = Start-Process -FilePath $tunnel -ArgumentList @('tunnel', '--protocol', 'http2', '--url', $origin) -WorkingDirectory $PSScriptRoot -WindowStyle Hidden -RedirectStandardOutput (Join-Path $trial 'tunnel.log') -RedirectStandardError $tunnelLog -PassThru
    $started += @{ Id = $proxy.Id; Started = $proxy.StartTime.ToFileTimeUtc().ToString() }
    for ($attempt = 0; $attempt -lt 45; $attempt++) {
        if ($proxy.HasExited) { throw "Cloudflare Tunnel exited. See $tunnelLog." }
        $log = [string](Get-Content -Raw $tunnelLog)
        $url = [regex]::Match($log, 'https://[a-z0-9]+(?:-[a-z0-9]+)+\.trycloudflare\.com').Value
        if ($url -and $log -match 'Registered tunnel connection') {
            ConvertTo-Json -InputObject $started | Set-Content -Encoding UTF8 $processFile
            Write-Output $url
            return
        }
        Start-Sleep -Milliseconds 500
    }
    throw "Cloudflare Tunnel did not connect. See $tunnelLog."
} catch {
    Stop-Trial $started
    throw
}
