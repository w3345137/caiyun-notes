param(
  [string]$ExePath = "src-tauri\target\x86_64-pc-windows-msvc\release\app.exe"
)

$ErrorActionPreference = "Stop"
$projectRoot = Split-Path -Parent $PSScriptRoot
$fullExePath = [System.IO.Path]::GetFullPath((Join-Path $projectRoot $ExePath))
if (-not (Test-Path -LiteralPath $fullExePath -PathType Leaf)) {
  throw "找不到 Microsoft Store EXE: $fullExePath"
}

$bytes = [System.IO.File]::ReadAllBytes($fullExePath)
$ascii = [System.Text.Encoding]::ASCII.GetString($bytes)
$forbidden = @(
  'updates/latest.json',
  'updates/windows/latest.json',
  'app-frontend/latest.json',
  'app-frontend/msstore/latest.json',
  'windows-store-legacy-handoff',
  'retire_legacy_windows_install',
  'has_legacy_windows_install'
)
foreach ($needle in $forbidden) {
  if ($ascii.Contains($needle)) {
    throw "Microsoft Store EXE 仍包含禁止的运行时代码下载路径: $needle"
  }
}

Write-Host "Microsoft Store binary channel scan passed: $fullExePath"
