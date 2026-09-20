param(
  [string]$UnpackagedExePath = 'src-tauri/target/x86_64-pc-windows-msvc/release/app.exe'
)

$ErrorActionPreference = 'Stop'

$identityName = 'BinApp.547813EA77836'
$publisher = 'CN=49D17C52-EB55-4439-9F79-0DFACFCB393C'
$exe = if ([System.IO.Path]::IsPathRooted($UnpackagedExePath)) {
  [System.IO.Path]::GetFullPath($UnpackagedExePath)
} else {
  [System.IO.Path]::GetFullPath((Join-Path (Get-Location).Path $UnpackagedExePath))
}
$screenshots = Join-Path $env:RUNNER_TEMP 'caiyun-indexeddb-probe'
New-Item -ItemType Directory -Path $screenshots -Force | Out-Null
if (-not (Test-Path -LiteralPath $exe -PathType Leaf)) { throw "Diagnostic exe missing: $exe" }

Add-Type -AssemblyName System.Drawing
Add-Type @'
using System;
using System.Runtime.InteropServices;
public static class CaiyunProfileProbeCapture {
  [StructLayout(LayoutKind.Sequential)]
  public struct Rect { public int Left, Top, Right, Bottom; }
  [DllImport("user32.dll")]
  public static extern bool GetWindowRect(IntPtr handle, out Rect rect);
  [DllImport("user32.dll")]
  public static extern bool PrintWindow(IntPtr handle, IntPtr hdc, uint flags);
}
'@

function Capture-AppWindow($process, $path) {
  Start-Sleep -Seconds 9
  $process.Refresh()
  if ($process.HasExited) { throw "Probe process exited early: $($process.ExitCode)" }
  if ($process.MainWindowHandle -eq [IntPtr]::Zero) { throw 'Probe main window was not visible' }
  Write-Host "Probe window title: $($process.MainWindowTitle)"
  $rect = New-Object CaiyunProfileProbeCapture+Rect
  if (-not [CaiyunProfileProbeCapture]::GetWindowRect($process.MainWindowHandle, [ref]$rect)) {
    throw 'GetWindowRect failed'
  }
  $width = $rect.Right - $rect.Left
  $height = $rect.Bottom - $rect.Top
  if ($width -lt 300 -or $height -lt 200 -or $width -gt 4096 -or $height -gt 4096) {
    throw "Unexpected probe window dimensions: ${width}x${height}"
  }
  $bitmap = New-Object System.Drawing.Bitmap($width, $height)
  $graphics = [System.Drawing.Graphics]::FromImage($bitmap)
  try {
    $deviceContext = $graphics.GetHdc()
    try {
      if (-not [CaiyunProfileProbeCapture]::PrintWindow($process.MainWindowHandle, $deviceContext, 2)) {
        throw 'PrintWindow failed'
      }
    } finally {
      $graphics.ReleaseHdc($deviceContext)
    }
    $bitmap.Save($path, [System.Drawing.Imaging.ImageFormat]::Png)
    Write-Host "Captured probe window: $path"
  } finally {
    $graphics.Dispose()
    $bitmap.Dispose()
  }
}

function Stop-AppTree($process) {
  if ($process -and -not $process.HasExited) {
    taskkill /PID $process.Id /T /F | Out-Null
  }
}

$oldProfile = Join-Path $env:LOCALAPPDATA 'com.caiyun.notes\EBWebView'
$direct = Start-Process -FilePath $exe -PassThru
try {
  Capture-AppWindow $direct (Join-Path $screenshots '01-unpackaged.png')
  if (-not (Test-Path -LiteralPath $oldProfile -PathType Container)) {
    throw 'Unpackaged WebView2 profile was not created'
  }
  Write-Host "Unpackaged WebView2 profile: $oldProfile"
} finally {
  Stop-AppTree $direct
}

pwsh -NoProfile -ExecutionPolicy Bypass -File scripts/pack-msix.ps1 `
  -IdentityName $identityName -Publisher $publisher -PublisherDisplayName 'BinApp' `
  -ExePath 'src-tauri/target/x86_64-pc-windows-msvc/release/app.exe'
if ($LASTEXITCODE -ne 0) { throw "Diagnostic MSIX packing failed: $LASTEXITCODE" }
$msix = Get-ChildItem build/msix -Filter *.msix | Sort-Object LastWriteTime -Descending | Select-Object -First 1
if (-not $msix) { throw 'Diagnostic MSIX missing' }
$qaCopy = Join-Path $env:RUNNER_TEMP 'caiyun-profile-probe-signed.msix'
Copy-Item -LiteralPath $msix.FullName -Destination $qaCopy
$cert = New-SelfSignedCertificate -Type CodeSigningCert -Subject $publisher `
  -CertStoreLocation Cert:\CurrentUser\My -KeyExportPolicy Exportable
$certPath = Join-Path $env:RUNNER_TEMP 'caiyun-profile-probe.cer'
Export-Certificate -FilePath $certPath -Cert $cert | Out-Null
Import-Certificate -FilePath $certPath -CertStoreLocation Cert:\LocalMachine\TrustedPeople | Out-Null
Import-Certificate -FilePath $certPath -CertStoreLocation Cert:\LocalMachine\Root | Out-Null
$signTool = Get-ChildItem 'C:\Program Files (x86)\Windows Kits\10\bin' -Recurse -Filter signtool.exe |
  Where-Object { $_.FullName -match '\\x64\\' } |
  Sort-Object FullName | Select-Object -Last 1
if (-not $signTool) { throw 'SignTool missing on CI runner' }
& $signTool.FullName sign /fd sha256 /sha1 $cert.Thumbprint $qaCopy
if ($LASTEXITCODE -ne 0) { throw "Diagnostic MSIX signing failed: $LASTEXITCODE" }
Add-AppxPackage -Path $qaCopy -ErrorAction Stop
$package = Get-AppxPackage -Name $identityName
if (-not $package) { throw 'Diagnostic MSIX was not registered' }
$packagedExe = Join-Path $package.InstallLocation 'app\app.exe'
$packaged = Start-Process -FilePath $packagedExe -PassThru
try {
  Capture-AppWindow $packaged (Join-Path $screenshots '02-packaged.png')
  Write-Host "Old host profile remains: $(Test-Path -LiteralPath $oldProfile)"
  $privateProfile = Join-Path $env:LOCALAPPDATA "Packages\$($package.PackageFamilyName)\LocalCache\Local\com.caiyun.notes\EBWebView"
  Write-Host "MSIX-private profile exists: $(Test-Path -LiteralPath $privateProfile)"
} finally {
  Stop-AppTree $packaged
}
