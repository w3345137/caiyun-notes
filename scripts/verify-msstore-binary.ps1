param(
  [string]$ExePath = "src-tauri\target\release\app.exe"
)

$ErrorActionPreference = "Stop"
$projectRoot = Split-Path -Parent $PSScriptRoot
$fullExePath = [System.IO.Path]::GetFullPath((Join-Path $projectRoot $ExePath))
if (-not (Test-Path -LiteralPath $fullExePath -PathType Leaf)) {
  throw "找不到 Microsoft Store EXE: $fullExePath"
}

$bytes = [System.IO.File]::ReadAllBytes($fullExePath)
$ascii = [System.Text.Encoding]::ASCII.GetString($bytes)
$forbidden = @('updates/latest.json')
foreach ($needle in $forbidden) {
  if ($ascii.Contains($needle)) {
    throw "Microsoft Store EXE 仍包含原生安装包更新路径: $needle"
  }
}

if (-not $ascii.Contains('app-frontend/latest.json')) {
  throw "Microsoft Store EXE 缺少签名前端更新清单路径"
}

Write-Host "Microsoft Store binary channel scan passed: $fullExePath"
