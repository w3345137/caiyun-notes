param(
  [Parameter(Mandatory=$true)][string]$IdentityName,
  [Parameter(Mandatory=$true)][string]$Publisher,
  [Parameter(Mandatory=$true)][string]$PublisherDisplayName,
  [string]$ExePath = "src-tauri\target\x86_64-pc-windows-msvc\release\app.exe",
  [string]$DisplayName = "彩云笔记",
  [switch]$Sign
)

$ErrorActionPreference = "Stop"
$projectRoot = Split-Path -Parent $PSScriptRoot
Set-Location $projectRoot

$config = Get-Content "src-tauri\tauri.conf.json" -Raw | ConvertFrom-Json
if ($config.version -notmatch '^\d+\.\d+\.\d+$') { throw "无效的应用版本: $($config.version)" }
$version = "$($config.version).0"
$fullExePath = [System.IO.Path]::GetFullPath((Join-Path $projectRoot $ExePath))
if (-not (Test-Path -LiteralPath $fullExePath -PathType Leaf)) {
  throw "找不到指定的商店构建产物: $fullExePath"
}
if ([System.IO.Path]::GetExtension($fullExePath).ToLowerInvariant() -ne '.exe') {
  throw "商店构建产物必须是 EXE: $fullExePath"
}

$layout = "build\msix\layout"
if (Test-Path "build\msix") { Remove-Item "build\msix" -Recurse -Force }
New-Item -ItemType Directory -Force -Path "$layout\app", "$layout\Assets" | Out-Null
$exeName = "app.exe"
Copy-Item -LiteralPath $fullExePath -Destination "$layout\app\$exeName"

foreach ($asset in @("StoreLogo.png", "Square44x44Logo.png", "Square71x71Logo.png", "Square150x150Logo.png", "Square310x310Logo.png")) {
  $source = "src-tauri\icons\$asset"
  if (-not (Test-Path $source)) { throw "缺少商店图标: $source" }
  Copy-Item $source "$layout\Assets\$asset"
}

$manifest = Get-Content "src-tauri\msix\AppxManifest.xml" -Raw
$replacements = [ordered]@{
  "{{IDENTITY_NAME}}" = $IdentityName
  "{{PUBLISHER}}" = $Publisher
  "{{PUBLISHER_DISPLAY_NAME}}" = $PublisherDisplayName
  "{{VERSION}}" = $version
  "{{DISPLAY_NAME}}" = $DisplayName
  "{{EXE_NAME}}" = $exeName
}
foreach ($key in $replacements.Keys) {
  $escaped = [System.Security.SecurityElement]::Escape([string]$replacements[$key])
  $manifest = $manifest.Replace($key, $escaped)
}
if ($manifest -match '\{\{[^}]+\}\}') { throw "MSIX 清单仍有未填写的占位符" }
try { [void][xml]$manifest } catch { throw "生成的 MSIX 清单不是合法 XML: $_" }
Set-Content "$layout\AppxManifest.xml" $manifest -Encoding UTF8

$sdkDir = "C:\Program Files (x86)\Windows Kits\10\bin"
$makeAppx = Get-ChildItem $sdkDir -Recurse -Filter makeappx.exe -ErrorAction SilentlyContinue |
  Where-Object { $_.FullName -match '\\x64\\' } | Sort-Object FullName | Select-Object -Last 1
if (-not $makeAppx) { throw "未找到 Windows SDK makeappx.exe" }
$output = "build\msix\CaiyunNotes_${version}_x64.msix"
& $makeAppx.FullName pack /d $layout /p $output /o | Out-Host
if ($LASTEXITCODE -ne 0) { throw "MSIX 打包失败 ($LASTEXITCODE)" }

if ($Sign) {
  $cert = Get-ChildItem Cert:\CurrentUser\My | Where-Object { $_.Subject -eq $Publisher } | Select-Object -First 1
  if (-not $cert) {
    $cert = New-SelfSignedCertificate -Type Custom -Subject $Publisher `
      -KeyUsage DigitalSignature -CertStoreLocation "Cert:\CurrentUser\My" `
      -TextExtension @("2.5.29.37={text}1.3.6.1.5.5.7.3.3", "2.5.29.19={text}")
  }
  $signTool = Get-ChildItem $sdkDir -Recurse -Filter signtool.exe -ErrorAction SilentlyContinue |
    Where-Object { $_.FullName -match '\\x64\\' } | Sort-Object FullName | Select-Object -Last 1
  if (-not $signTool) { throw "未找到 Windows SDK signtool.exe" }
  & $signTool.FullName sign /fd sha256 /sha1 $cert.Thumbprint /td sha256 `
    /tr http://timestamp.digicert.com $output | Out-Host
  if ($LASTEXITCODE -ne 0) { throw "MSIX 自签名失败 ($LASTEXITCODE)" }
}

$hash = (Get-FileHash $output -Algorithm SHA256).Hash.ToLowerInvariant()
Write-Host "MSIX: $output"
Write-Host "EXE: $fullExePath"
Write-Host "SHA256: $hash"
