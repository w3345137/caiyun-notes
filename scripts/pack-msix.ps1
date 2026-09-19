# 彩云笔记 MSIX 打包脚本（在 Windows 构建机上运行）
#
# 前提：先执行 npm run build:msstore 生成 target\release\*.exe
# 用法：
#   powershell -ExecutionPolicy Bypass -File scripts\pack-msix.ps1 `
#     -IdentityName "你的Package/Identity/Name" `
#     -Publisher "CN=XXXXXXXX-XXXX-XXXX-XXXX-XXXXXXXXXXXX" `
#     -PublisherDisplayName "你的发布者显示名" [-Sign]
#
# IdentityName / Publisher / PublisherDisplayName 在 Partner Center
# 「产品管理 → 应用标识」页面复制。-Sign 会用 Publisher 主题自建
# 自签名证书给包签名（本地测试安装需要；提交商店后微软会代签替换）。

param(
  [string]$Version = "",
  [Parameter(Mandatory=$true)][string]$IdentityName,
  [Parameter(Mandatory=$true)][string]$Publisher,
  [Parameter(Mandatory=$true)][string]$PublisherDisplayName,
  [string]$DisplayName = "彩云笔记",
  [switch]$Sign
)

$ErrorActionPreference = "Stop"
$root = Split-Path -Parent $PSScriptRoot
Set-Location $root

# --- 版本号：未指定则从 tauri.conf.json 读取，并补齐为四段 ---
if (-not $Version) {
  $conf = Get-Content "src-tauri\tauri.conf.json" -Raw | ConvertFrom-Json
  $Version = $conf.version
}
$parts = $Version.Split(".")
while ($parts.Count -lt 4) { $parts += "0" }
if ($parts.Count -gt 4) { throw "MSIX 版本号最多四段: $Version" }
$Version = $parts -join "."
Write-Host "[msix] 版本: $Version"

# --- 定位主程序（Tauri 前端资源已内嵌进 exe，单文件即可） ---
$exeCandidates = @("target\release\$DisplayName.exe", "target\release\app.exe",
                   "src-tauri\target\release\$DisplayName.exe", "src-tauri\target\release\app.exe")
$exe = $exeCandidates | Where-Object { Test-Path $_ } | Select-Object -First 1
if (-not $exe) { throw "未找到构建产物，请先运行 npm run build:msstore" }
$exeName = "$DisplayName.exe"
Write-Host "[msix] 主程序: $exe"

# --- 准备打包目录 ---
$layout = "build\msix\layout"
if (Test-Path "build\msix") { Remove-Item "build\msix" -Recurse -Force }
New-Item -ItemType Directory -Force -Path "$layout\app", "$layout\Assets" | Out-Null
Copy-Item $exe "$layout\app\$exeName"

# 商店图标资产（复用 src-tauri/icons 里的 Square*/StoreLogo 系列）
$assets = @("StoreLogo.png","Square44x44Logo.png","Square71x71Logo.png",
            "Square150x150Logo.png","Square310x310Logo.png")
foreach ($a in $assets) {
  $src = "src-tauri\icons\$a"
  if (Test-Path $src) { Copy-Item $src "$layout\Assets\$a" }
  else { throw "缺少图标资产: $src" }
}

# --- 渲染 AppxManifest ---
$manifest = Get-Content "src-tauri\msix\AppxManifest.xml" -Raw
$manifest = $manifest.Replace("{{IDENTITY_NAME}}", $IdentityName) `
                     .Replace("{{PUBLISHER}}", $Publisher) `
                     .Replace("{{PUBLISHER_DISPLAY_NAME}}", $PublisherDisplayName) `
                     .Replace("{{VERSION}}", $Version) `
                     .Replace("{{DISPLAY_NAME}}", $DisplayName) `
                     .Replace("{{EXE_NAME}}", $exeName)
Set-Content "$layout\AppxManifest.xml" $manifest -Encoding UTF8

# --- 定位 makeappx（Windows SDK 自带） ---
$makeappx = Get-ChildItem "C:\Program Files (x86)\Windows Kits\10\bin" -Recurse -Filter makeappx.exe -ErrorAction SilentlyContinue |
  Where-Object { $_.FullName -match "x64" } | Sort-Object FullName | Select-Object -Last 1
if (-not $makeappx) { throw "未找到 makeappx.exe，请安装 Windows SDK" }

$out = "build\msix\CaiyunNotes_${Version}_x64.msix"
& $makeappx.FullName pack /d $layout /p $out /o | Out-Host
if ($LASTEXITCODE -ne 0) { throw "makeappx pack 失败 ($LASTEXITCODE)" }
Write-Host "[msix] 已生成: $out"

# --- 可选：自签名（本地测试安装用；商店收录时微软代签替换） ---
if ($Sign) {
  $cert = Get-ChildItem Cert:\CurrentUser\My | Where-Object { $_.Subject -eq $Publisher } | Select-Object -First 1
  if (-not $cert) {
    $cert = New-SelfSignedCertificate -Type Custom -Subject $Publisher `
      -KeyUsage DigitalSignature -CertStoreLocation "Cert:\CurrentUser\My" `
      -TextExtension @("2.5.29.37={text}1.3.6.1.5.5.7.3.3", "2.5.29.19={text}")
    Write-Host "[msix] 已创建自签名证书: $($cert.Thumbprint)"
    Write-Host "[msix] 本地安装测试前需信任该证书: Export 后导入到『受信任的根证书颁发机构』"
  }
  $signtool = Get-ChildItem "C:\Program Files (x86)\Windows Kits\10\bin" -Recurse -Filter signtool.exe -ErrorAction SilentlyContinue |
    Where-Object { $_.FullName -match "x64" } | Sort-Object FullName | Select-Object -Last 1
  & $signtool.FullName sign /fd sha256 /sha1 $cert.Thumbprint /td sha256 `
    /tr http://timestamp.digicert.com $out | Out-Host
  if ($LASTEXITCODE -ne 0) { throw "signtool 签名失败 ($LASTEXITCODE)" }
  Write-Host "[msix] 签名完成: $out"
}

Write-Host "[msix] 完成。提交 Partner Center 时上传 $out"
