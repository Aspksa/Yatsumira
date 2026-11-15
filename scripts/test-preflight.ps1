$ErrorActionPreference = 'Stop'
$root = (Resolve-Path -LiteralPath (Join-Path $PSScriptRoot '..')).Path
. (Join-Path $PSScriptRoot 'diagnostics.ps1')
$state = New-YatsumiraState $root
Assert-YatsumiraPreflight $state
$ok = Save-YatsumiraReport $state 'test'
if (-not $ok) { exit 1 }
Write-Host '[YATSUMIRA] Windows preflight tests: OK'
