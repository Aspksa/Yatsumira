# YATSUMIRA web launcher. Windows PowerShell 5.1+.
$ErrorActionPreference = 'Stop'
$ProgressPreference = 'SilentlyContinue'
$root = (Resolve-Path (Join-Path $PSScriptRoot '..')).Path
Set-Location -LiteralPath $root

function Get-UsableNode {
    $node = Get-Command 'node.exe' -ErrorAction SilentlyContinue
    $npm = Get-Command 'npm.cmd' -ErrorAction SilentlyContinue
    if ($null -eq $node -or $null -eq $npm) { return $false }
    try {
        $version = & $node.Source --version
        if ($LASTEXITCODE -ne 0) { return $false }
        $major = [int](($version -replace '^v', '').Split('.')[0])
        return ($major -ge 20)
    } catch { return $false }
}

function Install-PortableNode {
    $architecture = [System.Runtime.InteropServices.RuntimeInformation]::OSArchitecture.ToString().ToLowerInvariant()
    if ($architecture -eq 'x64') { $arch = 'x64' }
    elseif ($architecture -eq 'arm64') { $arch = 'arm64' }
    else { throw "Unsupported CPU architecture: $architecture" }

    $tools = Join-Path $root '.tools'
    $destination = Join-Path $tools 'node'
    $nodeExe = Join-Path $destination 'node.exe'
    $npmCmd = Join-Path $destination 'npm.cmd'
    if ((Test-Path -LiteralPath $nodeExe) -and (Test-Path -LiteralPath $npmCmd)) {
        $env:Path = "$destination;$env:Path"
        if (Get-UsableNode) { return }
    }

    Write-Host '[YATSUMIRA] Downloading official portable Node.js LTS...'
    [Net.ServicePointManager]::SecurityProtocol = [Net.SecurityProtocolType]::Tls12
    $versions = Invoke-RestMethod -Uri 'https://nodejs.org/dist/index.json'
    $release = $versions | Where-Object {
        $_.lts -and $_.lts -ne $false -and
        $_.files -contains "win-$arch-zip" -and
        [int](($_.version -replace '^v', '').Split('.')[0]) -ge 20
    } | Select-Object -First 1
    if (-not $release) { throw 'No compatible Node.js LTS release was found.' }

    $name = "node-$($release.version)-win-$arch"
    $baseUrl = "https://nodejs.org/dist/$($release.version)"
    $zipName = "$name.zip"
    New-Item -ItemType Directory -Force -Path $tools | Out-Null
    $temp = Join-Path $tools ('download-' + [guid]::NewGuid().ToString('N'))
    New-Item -ItemType Directory -Path $temp | Out-Null
    try {
        $zipFile = Join-Path $temp $zipName
        Invoke-WebRequest -Uri "$baseUrl/$zipName" -OutFile $zipFile -UseBasicParsing
        $sumsFile = Join-Path $temp 'SHASUMS256.txt'
        Invoke-WebRequest -Uri "$baseUrl/SHASUMS256.txt" -OutFile $sumsFile -UseBasicParsing
        $line = Get-Content -LiteralPath $sumsFile | Where-Object { $_ -match ('\s+' + [regex]::Escape($zipName) + '$') } | Select-Object -First 1
        if (-not $line) { throw 'Node.js archive checksum entry is missing.' }
        $expected = ($line -split '\s+')[0].ToLowerInvariant()
        $actual = (Get-FileHash -LiteralPath $zipFile -Algorithm SHA256).Hash.ToLowerInvariant()
        if ($expected -ne $actual) { throw 'Node.js archive checksum mismatch.' }

        Expand-Archive -LiteralPath $zipFile -DestinationPath $temp -Force
        $unpacked = Join-Path $temp $name
        if (-not (Test-Path -LiteralPath (Join-Path $unpacked 'node.exe'))) {
            throw 'The Node.js archive did not contain node.exe.'
        }
        if (Test-Path -LiteralPath $destination) {
            Remove-Item -LiteralPath $destination -Recurse -Force
        }
        Move-Item -LiteralPath $unpacked -Destination $destination
    } finally {
        Remove-Item -LiteralPath $temp -Recurse -Force -ErrorAction SilentlyContinue
    }
    $env:Path = "$destination;$env:Path"
    if (-not (Get-UsableNode)) { throw 'Portable Node.js installation failed.' }
}

function Find-AvailablePort([int]$start) {
    for ($port = $start; $port -le 65535 -and $port -lt ($start + 100); $port++) {
        $listener = $null
        try {
            $listener = [Net.Sockets.TcpListener]::new([Net.IPAddress]::Loopback, $port)
            $listener.Start()
            return $port
        } catch [Net.Sockets.SocketException] {
            continue
        } finally {
            if ($null -ne $listener) { $listener.Stop() }
        }
    }
    throw 'No free local port found in the selected range.'
}

try {
    if (-not (Get-UsableNode)) { Install-PortableNode }
    $nodeVersion = & node.exe --version
    Write-Host "[YATSUMIRA] Node.js $nodeVersion"

    $vite = Join-Path $root 'node_modules\vite\bin\vite.js'
    if (-not (Test-Path -LiteralPath $vite)) {
        Write-Host '[YATSUMIRA] Installing web dependencies...'
        & npm.cmd install --no-audit --no-fund
        if ($LASTEXITCODE -ne 0) { throw 'npm install failed.' }
    }

    $startPort = 5173
    if ($env:YATSUMIRA_PORT) {
        $parsedPort = 0
        if (-not [int]::TryParse($env:YATSUMIRA_PORT, [ref]$parsedPort) -or $parsedPort -lt 1024 -or $parsedPort -gt 65435) {
            throw 'YATSUMIRA_PORT must be an integer between 1024 and 65435.'
        }
        $startPort = $parsedPort
    }
    $port = Find-AvailablePort $startPort
    Write-Host "[YATSUMIRA] Opening website on http://127.0.0.1:$port/"
    # Vite also falls back to the next available port if one becomes occupied.
    & npm.cmd run dev -- --host 127.0.0.1 --port $port --open
    if ($LASTEXITCODE -ne 0) { throw "Vite exited with code $LASTEXITCODE." }
    exit 0
} catch {
    Write-Host "[YATSUMIRA] ERROR: $($_.Exception.Message)" -ForegroundColor Red
    exit 1
}
