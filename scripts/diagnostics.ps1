# ASCII-only PowerShell source to avoid Windows PowerShell 5.1 UTF-8 BOM issues.
Set-StrictMode -Version Latest

function New-YatsumiraState([string]$Root) {
    $data = Join-Path $Root '.yatsumira'
    if (-not (Test-Path -LiteralPath $data)) { [IO.Directory]::CreateDirectory($data) | Out-Null }
    return @{ Root = $Root; Directory = $data; Checks = [System.Collections.ArrayList]::new(); Issues = [System.Collections.ArrayList]::new(); Started = (Get-Date).ToUniversalTime().ToString('o') }
}

function Add-YatsumiraCheck($State, [string]$Name, [bool]$Passed, [string]$Detail, [bool]$Fatal = $false, [string]$Category = 'system') {
    [void]$State.Checks.Add(@{ name=$Name; passed=$Passed; detail=$Detail; fatal=$Fatal })
    if (-not $Passed) {
        $code = switch ($Category) { 'network' { 20 }; 'filesystem' { 30 }; 'configuration' { 40 }; 'runtime' { 50 }; default { 10 } }
        [void]$State.Issues.Add(@{ code=$code; category=$Category; name=$Name; message=$Detail; fatal=$Fatal })
        $label = if ($Fatal) { 'ERROR' } else { 'WARN' }
        Write-Host "[YATSUMIRA][$label][$code] $Name - $Detail"
    }
}

function Assert-YatsumiraPreflight($State) {
    $root = $State.Root
    Add-YatsumiraCheck $State 'powershell-version' ($PSVersionTable.PSVersion.Major -ge 5) ([string]$PSVersionTable.PSVersion) $true 'runtime'
    try {
        [Console]::OutputEncoding = [Text.UTF8Encoding]::new($false)
        $text = ([char]0x042F).ToString() + [char]0x0446 + [char]0x0443 + [char]0x043C + [char]0x0438 + [char]0x0440 + [char]0x0430 + ' & % ! ^ ( )'
        $filename = Join-Path $root ('.yatsumira-utf8-' + [guid]::NewGuid().ToString('N') + '.txt')
        try {
            [IO.File]::WriteAllText($filename, $text, [Text.UTF8Encoding]::new($false))
            $back = [IO.File]::ReadAllText($filename, [Text.UTF8Encoding]::new($false, $true))
            Add-YatsumiraCheck $State 'utf8-cyrillic' ($back -ceq $text) 'UTF-8 Cyrillic roundtrip' $true 'filesystem'
        } finally { Remove-Item -LiteralPath $filename -Force -ErrorAction SilentlyContinue }
    } catch { Add-YatsumiraCheck $State 'utf8-cyrillic' $false $_.Exception.Message $true 'filesystem' }
    try {
        $probe = Join-Path $root ('.yatsumira-write-' + [guid]::NewGuid().ToString('N'))
        try { [IO.File]::WriteAllText($probe, 'ok'); Add-YatsumiraCheck $State 'write-permission' $true 'Project directory writable' }
        finally { Remove-Item -LiteralPath $probe -Force -ErrorAction SilentlyContinue }
    } catch { Add-YatsumiraCheck $State 'write-permission' $false $_.Exception.Message $true 'filesystem' }
    foreach ($key in @('TEMP','TMP')) {
        $value = [Environment]::GetEnvironmentVariable($key)
        $good = (-not [string]::IsNullOrWhiteSpace($value)) -and (Test-Path -LiteralPath $value -PathType Container)
        Add-YatsumiraCheck $State ("environment-" + $key) $good "Directory: $value" (-not $good) 'filesystem'
    }
    try {
        $diskRoot = [IO.Path]::GetPathRoot($root)
        $disk = [IO.DriveInfo]::new($diskRoot)
        $free = $disk.AvailableFreeSpace
        Add-YatsumiraCheck $State 'disk-space' ($free -ge 1GB) ("Available bytes: " + $free) ($free -lt 1GB) 'filesystem'
    } catch { Add-YatsumiraCheck $State 'disk-space' $false $_.Exception.Message $false 'filesystem' }
    $oneDrive = [Environment]::GetEnvironmentVariable('OneDrive')
    if ($oneDrive -and $root.StartsWith($oneDrive.TrimEnd([char]92) + [char]92, [StringComparison]::OrdinalIgnoreCase)) {
        Add-YatsumiraCheck $State 'onedrive' $false 'Project is under OneDrive; file syncing may lock dependencies' $false 'filesystem'
    } else { Add-YatsumiraCheck $State 'onedrive' $true 'No OneDrive path detected' }
    if ($root.Length -gt 180) {
        Add-YatsumiraCheck $State 'long-path' $false ("Project path is " + $root.Length + " chars; nested dependencies may exceed Windows limits") $false 'filesystem'
    } else { Add-YatsumiraCheck $State 'long-path' $true ("Path length " + $root.Length) }
    try {
        $special = Join-Path $State.Directory ('special & % ! ^ ( ) ' + [guid]::NewGuid().ToString('N'))
        try {
            [IO.Directory]::CreateDirectory($special) | Out-Null
            [IO.File]::WriteAllText((Join-Path $special 'test file.txt'), 'ok')
            $ok = [IO.File]::ReadAllText((Join-Path $special 'test file.txt')) -eq 'ok'
            Add-YatsumiraCheck $State 'special-path-characters' $ok 'File IO with spaces, &, %, !, ^, parentheses' $true 'filesystem'
        } finally { Remove-Item -LiteralPath $special -Recurse -Force -ErrorAction SilentlyContinue }
    } catch { Add-YatsumiraCheck $State 'special-path-characters' $false $_.Exception.Message $true 'filesystem' }
    try {
        $p = Get-Content -LiteralPath (Join-Path $root 'package.json') -Raw | ConvertFrom-Json
        $ok = $p.scripts.dev -and $p.scripts.build -and $p.devDependencies.vite -and $p.devDependencies.typescript
        Add-YatsumiraCheck $State 'vite-configuration' ([bool]$ok) 'package.json Vite and TypeScript scripts/dependencies' $true 'configuration'
    } catch { Add-YatsumiraCheck $State 'vite-configuration' $false $_.Exception.Message $true 'configuration' }
}

function Test-YatsumiraNetwork($State, [string[]]$Hosts) {
    foreach ($hostname in $Hosts) {
        try {
            $addresses = [Net.Dns]::GetHostAddresses($hostname)
            Add-YatsumiraCheck $State ("dns-" + $hostname) ($addresses.Count -gt 0) 'DNS resolution' $true 'network'
        } catch { Add-YatsumiraCheck $State ("dns-" + $hostname) $false $_.Exception.Message $true 'network' }
    }
}

function Save-YatsumiraReport($State, [string]$Phase, [int]$Port = 0) {
    $dir = $State.Directory
    $historyPath = Join-Path $dir 'last-success.json'
    $previous = $null
    if (Test-Path -LiteralPath $historyPath) {
        try { $previous = Get-Content -LiteralPath $historyPath -Raw | ConvertFrom-Json } catch { }
    }
    $nodeVersion = ''
    $npmVersion = ''
    try { $nodeVersion = (& node.exe --version 2>$null | Select-Object -First 1) } catch {}
    try { $npmVersion = (& npm.cmd --version 2>$null | Select-Object -First 1) } catch {}
    $viteInstalled = Test-Path -LiteralPath (Join-Path $State.Root 'node_modules/vite/bin/vite.js')
    $snapshot = @{ node=$nodeVersion; npm=$npmVersion; viteInstalled=$viteInstalled; port=$Port; pathLength=$State.Root.Length }
    $changes = @()
    if ($previous -and $previous.snapshot) {
        foreach ($field in @('node','npm','viteInstalled','port','pathLength')) {
            if ([string]$previous.snapshot.$field -cne [string]$snapshot.$field) {
                $changes += "$field changed"
            }
        }
    }
    $groups = @()
    $old = @()
    $previousReportPath = Join-Path $dir 'report.json'
    if (Test-Path -LiteralPath $previousReportPath) {
        try { $old = @((Get-Content -LiteralPath $previousReportPath -Raw | ConvertFrom-Json).issues) } catch {}
    }
    foreach ($issue in $State.Issues) {
        $count = 1 + @($old | Where-Object { $_.code -eq $issue.code -and $_.name -eq $issue.name -and $_.message -eq $issue.message }).Count
        $groups += @{ code=$issue.code; category=$issue.category; name=$issue.name; message=$issue.message; occurrences=$count; fatal=$issue.fatal }
    }
    $ok = @($State.Issues | Where-Object { $_.fatal }).Count -eq 0
    $report = @{ schemaVersion=1; project='YATSUMIRA'; phase=$Phase; timestamp=(Get-Date).ToUniversalTime().ToString('o'); success=$ok; checks=@($State.Checks.ToArray()); issues=$groups; snapshot=$snapshot; changes=$changes }
    $json = ConvertTo-Json -InputObject $report -Depth 8
    [IO.File]::WriteAllText($previousReportPath, $json, [Text.UTF8Encoding]::new($false))
    if ($ok -and $Phase -eq 'running') {
        [IO.File]::WriteAllText($historyPath, $json, [Text.UTF8Encoding]::new($false))
    }
    Write-Host "[YATSUMIRA] Report: $previousReportPath"
    return $ok
}
