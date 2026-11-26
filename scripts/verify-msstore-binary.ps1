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

# A fresh Windows installation has the OS UCRT but need not have VC++ redist.
$vswhere = Join-Path ${env:ProgramFiles(x86)} 'Microsoft Visual Studio\Installer\vswhere.exe'
$dumpbin = & $vswhere -latest -products '*' -requires Microsoft.VisualStudio.Component.VC.Tools.x86.x64 -find 'VC\Tools\MSVC\*\bin\Hostx64\x64\dumpbin.exe' | Select-Object -First 1
if (-not $dumpbin) { throw '找不到用于检查 Windows 导入表的 dumpbin' }
$imports = & $dumpbin /dependents $fullExePath
if ($LASTEXITCODE -ne 0) { throw '读取商店程序导入表失败' }
if ($imports -match '^\s*(?:VCRUNTIME|MSVCP)\d[^\s]*\.dll\s*$') {
  throw '商店程序仍依赖另行安装的 Visual C++ 运行库'
}

Write-Host "Microsoft Store binary channel scan passed: $fullExePath"
