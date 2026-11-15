# Windows PowerShell 5.1+ launcher; keep ASCII source for compatibility.
$ErrorActionPreference = 'Stop'
$ProgressPreference = 'SilentlyContinue'
$root = (Resolve-Path -LiteralPath (Join-Path $PSScriptRoot '..')).Path
. (Join-Path $PSScriptRoot 'diagnostics.ps1')
$state = New-YatsumiraState $root
Set-Location -LiteralPath $root

function Fail-Yatsumira([int]$Code, [string]$Category, [string]$Description) {
    Add-YatsumiraCheck $state 'startup' $false $Description $true $Category
    [void](Save-YatsumiraReport $state 'failed')
    exit $Code
}
function Find-Node {
    $node = Get-Command node.exe -ErrorAction SilentlyContinue
    if (-not $node) { return $false }
    $npm = Join-Path (Split-Path -Parent $node.Source) 'npm.cmd'
    if (-not (Test-Path -LiteralPath $npm)) { return $false }
    try {
        $v = & $node.Source --version
        if ($LASTEXITCODE -ne 0) { return $false }
        $major = [int](($v -replace '^v','').Split('.')[0])
        return $major -ge 20
    } catch { return $false }
}
function Install-Node {
    $arch = [System.Runtime.InteropServices.RuntimeInformation]::OSArchitecture.ToString().ToLowerInvariant()
    if ($arch -notin @('x64','arm64')) { throw 'Unsupported CPU architecture' }
    $tools = Join-Path $root '.tools'
    $dest = Join-Path $tools 'node'
    if (Test-Path -LiteralPath (Join-Path $dest 'node.exe')) {
        $env:Path = "$dest;$env:Path"
        if (Find-Node) { return }
    }
    Test-YatsumiraNetwork $state @('nodejs.org')
    if (@($state.Issues | Where-Object { $_.fatal }).Count) { throw 'Node.js download DNS failed' }
    [Net.ServicePointManager]::SecurityProtocol = [Net.SecurityProtocolType]::Tls12
    $release = Invoke-RestMethod 'https://nodejs.org/dist/index.json' | Where-Object {
        $_.lts -and $_.files -contains "win-$arch-zip" -and [int](($_.version -replace '^v','').Split('.')[0]) -ge 20
    } | Select-Object -First 1
    if (-not $release) { throw 'No compatible official Node.js LTS release' }
    New-Item -ItemType Directory -Path $tools -Force | Out-Null
    $temp = Join-Path $tools ('download-' + [guid]::NewGuid().ToString('N'))
    New-Item -ItemType Directory -Path $temp | Out-Null
    try {
        $name = "node-$($release.version)-win-$arch"
        $archiveName = "$name.zip"
        $url = "https://nodejs.org/dist/$($release.version)"
        $archive = Join-Path $temp $archiveName
        Invoke-WebRequest "$url/$archiveName" -OutFile $archive -UseBasicParsing
        $sumFile = Join-Path $temp 'SHASUMS256.txt'
        Invoke-WebRequest "$url/SHASUMS256.txt" -OutFile $sumFile -UseBasicParsing
        $line = Get-Content -LiteralPath $sumFile | Where-Object { $_ -match ('\s+' + [regex]::Escape($archiveName) + '$') } | Select-Object -First 1
        if (-not $line) { throw 'Node.js checksum missing' }
        $expected = ($line -split '\s+')[0].ToLowerInvariant()
        if ((Get-FileHash -LiteralPath $archive -Algorithm SHA256).Hash.ToLowerInvariant() -ne $expected) { throw 'Node.js SHA-256 mismatch' }
        Expand-Archive -LiteralPath $archive -DestinationPath $temp
        $source = Join-Path $temp $name
        if (-not (Test-Path -LiteralPath (Join-Path $source 'npm.cmd'))) { throw 'Node.js archive invalid' }
        if (Test-Path -LiteralPath $dest) { Remove-Item -LiteralPath $dest -Recurse -Force }
        Move-Item -LiteralPath $source -Destination $dest
    } finally { Remove-Item -LiteralPath $temp -Recurse -Force -ErrorAction SilentlyContinue }
    $env:Path = "$dest;$env:Path"
    if (-not (Find-Node)) { throw 'Node.js installation failed' }
}
function Find-Port([int]$Start) {
    for ($i=$Start; $i -lt [Math]::Min(65536,$Start+100); $i++) {
        $server = $null
        try {
            $server = [Net.Sockets.TcpListener]::new([Net.IPAddress]::Loopback,$i)
            $server.Start()
            return $i
        } catch [Net.Sockets.SocketException] { continue }
        finally { if ($null -ne $server) { $server.Stop() } }
    }
    throw 'No free port in range'
}

try {
    Assert-YatsumiraPreflight $state
    if (@($state.Issues | Where-Object { $_.fatal }).Count) { Fail-Yatsumira 30 'filesystem' 'Preflight failed' }
    if (-not (Find-Node)) {
        Install-Node
    }
    $vite = Join-Path $root 'node_modules/vite/bin/vite.js'
    $tsc = Join-Path $root 'node_modules/typescript/bin/tsc'
    if (-not (Test-Path -LiteralPath $vite) -or -not (Test-Path -LiteralPath $tsc)) {
        Test-YatsumiraNetwork $state @('registry.npmjs.org')
        if (@($state.Issues | Where-Object { $_.fatal }).Count) { Fail-Yatsumira 20 'network' 'npm registry DNS failed' }
        & npm.cmd install --no-audit --no-fund
        if ($LASTEXITCODE -ne 0) { Fail-Yatsumira 50 'runtime' 'npm install failed' }
    }
    & node.exe (Join-Path $root 'scripts/check-project.mjs')
    if ($LASTEXITCODE -ne 0) { Fail-Yatsumira 40 'configuration' 'Vite/TypeScript project preflight failed' }
    $startPort = 5173
    if ($env:YATSUMIRA_PORT) {
        $value = 0
        if (-not [int]::TryParse($env:YATSUMIRA_PORT,[ref]$value) -or $value -lt 1024 -or $value -gt 65435) {
            Fail-Yatsumira 40 'configuration' 'Invalid YATSUMIRA_PORT: expected 1024..65435'
        }
        $startPort = $value
    }
    $port = Find-Port $startPort
    Add-YatsumiraCheck $state 'port-selection' $true "Selected port $port"
    [void](Save-YatsumiraReport $state 'running' $port)
    Write-Host "[YATSUMIRA] Starting local website (port $port)"
    & node.exe $vite --host 127.0.0.1 --port $port --open
    if ($LASTEXITCODE -ne 0) { Fail-Yatsumira 50 'runtime' "Vite exited with code $LASTEXITCODE" }
    exit 0
} catch {
    $message = $_.Exception.Message
    $category = 'runtime'
    $code = 50
    if ($message -match '(DNS|download|network|HTTP|connection)') { $category = 'network'; $code = 20 }
    elseif ($message -match '(access|denied|path|directory|disk|file|SHA-256)') { $category='filesystem'; $code=30 }
    elseif ($message -match '(configuration|port|package.json|typescript)') { $category='configuration'; $code=40 }
    Fail-Yatsumira $code $category $message
}
