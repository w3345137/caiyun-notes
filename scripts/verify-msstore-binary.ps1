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
  'app-frontend/latest.json',
  'updates/latest.json',
  '暂时无法下载界面更新'
)
foreach ($needle in $forbidden) {
  if ($ascii.Contains($needle)) {
    throw "Microsoft Store EXE 仍包含禁止的运行时代码下载路径: $needle"
  }
}

Write-Host "Microsoft Store binary compliance scan passed: $fullExePath"
