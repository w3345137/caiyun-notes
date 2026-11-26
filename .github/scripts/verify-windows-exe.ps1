# Run only on a disposable Windows test account with no Caiyun installation.
param(
    [Parameter(Mandatory)][string]$Installer,
    [Parameter(Mandatory)][string]$PublisherThumbprint,
    [Parameter(Mandatory)][string]$ExpectedVersion,
    [ValidateSet('clean','10.2.8','10.2.13')][string]$Scenario = 'clean'
)
$ErrorActionPreference = 'Stop'
$installerPath = (Resolve-Path -LiteralPath $Installer).Path
$outer = Get-AuthenticodeSignature -LiteralPath $installerPath
if ($outer.Status -ne 'Valid' -or $outer.SignerCertificate.Thumbprint -ne $PublisherThumbprint -or !$outer.TimeStamperCertificate) {
    throw 'The installer needs a valid timestamped publisher signature'
}
$key = 'HKCU:\Software\Microsoft\Windows\CurrentVersion\Uninstall\彩云笔记'
$root = Join-Path $env:LOCALAPPDATA '彩云笔记'
if ((Test-Path -LiteralPath $key) -or (Test-Path -LiteralPath $root)) { throw 'Use a fresh Windows test account' }
$installArgs = @('/S')
$quitIntent = $null
if ($Scenario -ne 'clean') {
    $tag, $sha = switch ($Scenario) {
        '10.2.8'  { 'p20', '658bba8c12ecbc794977077f4360c63eb2c24f0a1e207e5a10498bab7eab970a' }
        '10.2.13' { 'p25', '7dad87f4e18698973bcf4a12b382aed726c06b7fcd36527e57351f4dce201a3a' }
    }
    $legacy = Join-Path $env:RUNNER_TEMP "caiyun-$Scenario-setup.exe"
    Invoke-WebRequest "https://github.com/w3345137/caiyun-notes/releases/download/$tag/_${Scenario}_x64-setup.exe" -OutFile $legacy
    if ((Get-FileHash -LiteralPath $legacy).Hash -ne $sha) { throw 'Unexpected historical website installer' }
    $old = Start-Process -FilePath $legacy -ArgumentList '/S' -PassThru -Wait
    if ($old.ExitCode -ne 0 -or (Get-ItemProperty -LiteralPath $key).DisplayVersion -ne $Scenario) { throw 'Legacy fixture installation failed' }
    $intentDir = Join-Path $env:APPDATA 'com.caiyun.notes'
    New-Item -ItemType Directory -Path $intentDir -Force | Out-Null
    $quitIntent = Join-Path $intentDir "website-update-quit-$ExpectedVersion.json"
    Set-Content -LiteralPath $quitIntent -Value '{"normalQuit":true}'
    $installArgs = @('/P','/R','/UPDATE')
}
# Historical NSIS packages have stopped programs outside their installation
# directory solely because the executable was named app.exe.
$canaryDir = Join-Path $env:RUNNER_TEMP ("caiyun-install-canary-" + [guid]::NewGuid())
New-Item -ItemType Directory -Path $canaryDir | Out-Null
$canaryPath = Join-Path $canaryDir 'app.exe'
Copy-Item -LiteralPath (Join-Path $env:SystemRoot 'System32/ping.exe') -Destination $canaryPath
$canary = Start-Process $canaryPath -ArgumentList '-t','127.0.0.1' -WindowStyle Hidden -PassThru
try {
    Start-Sleep -Milliseconds 500
    if ($canary.HasExited) { throw 'Unrelated process fixture failed to start' }
    $process = Start-Process -FilePath $installerPath -ArgumentList $installArgs -PassThru -Wait
    if ($process.ExitCode -ne 0) { throw "Silent install failed with exit code $($process.ExitCode)" }
    if ($canary.HasExited) { throw 'Installer stopped an unrelated app.exe' }
    if ($quitIntent) {
        if (Test-Path -LiteralPath $quitIntent) { throw 'Installer did not consume the normal-quit intent' }
        $appPath = Join-Path $root 'app.exe'
        if (Get-CimInstance Win32_Process -Filter "Name='app.exe'" | Where-Object ExecutablePath -eq $appPath) {
            throw 'A normal quit must not relaunch the application'
        }
    }
} finally {
    if (!$canary.HasExited) { $canary.Kill(); $canary.WaitForExit() }
    if ($quitIntent -and (Test-Path -LiteralPath $quitIntent)) { Remove-Item -LiteralPath $quitIntent }
    Remove-Item -LiteralPath $canaryPath
    Remove-Item -LiteralPath $canaryDir
}
$registration = Get-ItemProperty -LiteralPath $key
if ($registration.DisplayVersion -ne $ExpectedVersion -or !(Test-Path -LiteralPath (Join-Path $root 'app.exe'))) {
    throw 'Installed version or installation directory differs from the published candidate'
}
$entries = @(Get-ItemProperty 'HKCU:\Software\Microsoft\Windows\CurrentVersion\Uninstall\*' | Where-Object DisplayName -eq '彩云笔记')
if ($entries.Count -ne 1) { throw 'Expected one registered Caiyun Notes application' }
$evidence = foreach ($file in Get-ChildItem -LiteralPath $root -File -Recurse) {
    $stream = $file.OpenRead()
    try { $hasMzHeader = $stream.ReadByte() -eq 77 -and $stream.ReadByte() -eq 90 } finally { $stream.Dispose() }
    if (!$hasMzHeader) { continue }
    $signature = Get-AuthenticodeSignature -LiteralPath $file.FullName
    if ($signature.Status -ne 'Valid') { throw "Untrusted installed binary: $($file.Name)" }
    if ($file.FullName -eq (Join-Path $root 'app.exe') -and $signature.SignerCertificate.Thumbprint -ne $PublisherThumbprint) {
        throw 'Application publisher differs from installer publisher'
    }
    [pscustomobject]@{ path = [IO.Path]::GetRelativePath($root, $file.FullName); publisher = $signature.SignerCertificate.Subject; sha256 = (Get-FileHash -LiteralPath $file.FullName).Hash }
}
[pscustomobject]@{ scenario = $Scenario; quietExitVerified = [bool]$quitIntent; version = $ExpectedVersion; publisherThumbprint = $outer.SignerCertificate.Thumbprint; installerSha256 = (Get-FileHash -LiteralPath $installerPath).Hash; files = @($evidence) } | ConvertTo-Json -Depth 4
