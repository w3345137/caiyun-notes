# Disposable Windows runner. Bundle the actual direct-launch code in an NSIS
# installer without using publisher keys or creating a distributable release.
param([string]$Probe, [string]$LegacyExe, [string]$StoreExe, [string]$Marker)
$ErrorActionPreference = 'Stop'
$desktop = [Environment]::GetFolderPath('DesktopDirectory')
$programs = [Environment]::GetFolderPath('Programs')
$links = @(Get-ChildItem -Path $desktop,$programs -Filter '彩云笔记.lnk' -Recurse)
if ($links.Count -lt 2) { throw 'Expected both historical shortcuts' }
npm ci
if ($LASTEXITCODE) { throw 'Tauri CLI install failed' }
$binDir = 'src-tauri/target/x86_64-pc-windows-msvc/release'
New-Item -Type Directory -Path $binDir -Force | Out-Null
Copy-Item $Probe "$binDir/app.exe"
@{ bundle = @{ createUpdaterArtifacts = $false; windows = @{ nsis = @{ template='windows/installer.nsi' } } } } |
    ConvertTo-Json -Depth 6 | Set-Content fixture-config.json
npx tauri bundle --target x86_64-pc-windows-msvc --bundles nsis --config fixture-config.json
if ($LASTEXITCODE) { throw 'NSIS bundle failed' }
$setups = @(Get-ChildItem "$binDir/bundle/nsis/*-setup.exe")
if ($setups.Count -ne 1) { throw 'Expected one QA installer' }
$oldHash = (Get-FileHash $LegacyExe).Hash
$canaryDir = New-Item -Type Directory -Path (Join-Path $env:RUNNER_TEMP 'unrelated-running-program')
$canaryFile = Join-Path $canaryDir.FullName 'app.exe'
Copy-Item (Join-Path $env:SystemRoot 'System32/ping.exe') $canaryFile
$canary = Start-Process $canaryFile -ArgumentList '-t','127.0.0.1' -PassThru -WindowStyle Hidden
try {
    $lock = [IO.File]::Open($LegacyExe,'Open','Read','Read')
    try {
        $blocked = Start-Process $setups[0].FullName -ArgumentList '/P','/R','/UPDATE' -PassThru -Wait
        if ($blocked.ExitCode -ne 32) { throw "Expected a busy target exit, got $($blocked.ExitCode)" }
    } finally { $lock.Dispose() }
    if ((Get-FileHash $LegacyExe).Hash -ne $oldHash -or $canary.HasExited) { throw 'Busy target or unrelated program changed' }
    $intentDir = New-Item -ItemType Directory -Path (Join-Path $env:APPDATA 'com.caiyun.notes') -Force
    $intent = Join-Path $intentDir.FullName 'website-update-quit-10.2.18.json'
    Set-Content -Path $intent -Value '{"normalQuit":true}'
    $setup = Start-Process $setups[0].FullName -ArgumentList '/P','/R','/UPDATE' -PassThru -Wait
    if ($setup.ExitCode -ne 0 -or (Get-FileHash $LegacyExe).Hash -ne (Get-FileHash $Probe).Hash) { throw 'In-place upgrade failed' }
    $key = 'HKCU:\Software\Microsoft\Windows\CurrentVersion\Uninstall\彩云笔记'
    if ((Get-ItemProperty $key).DisplayVersion -ne '10.2.18') { throw 'New NSIS registration missing' }
    if (Test-Path $intent) { throw 'Normal-quit flag not consumed' }
    Start-Sleep -Seconds 3
    if (Get-CimInstance Win32_Process -Filter "Name='app.exe'" | Where-Object ExecutablePath -eq $StoreExe) { throw 'Normal quit relaunched app' }
    $explicit = Start-Process $setups[0].FullName -ArgumentList '/P','/R','/UPDATE' -PassThru
    $explicit.WaitForExit(60000) | Out-Null
    if (!$explicit.HasExited -or $explicit.ExitCode) { throw 'Explicit restart update failed' }
    Start-Sleep -Seconds 10
    $restarted = @(Get-CimInstance Win32_Process -Filter "Name='app.exe'" | Where-Object ExecutablePath -eq $StoreExe)
    if ($restarted.Count -ne 1) { throw 'Explicit restart missing Store window' }
    if (!(Get-CimInstance Win32_Process -Filter "Name='msedgewebview2.exe' AND ParentProcessId=$($restarted[0].ProcessId)")) { throw 'Explicit restart missing WebView' }
    taskkill /PID $restarted[0].ProcessId /T /F | Out-Null
    foreach ($link in $links) {
        Start-Process $link.FullName
        Start-Sleep -Seconds 10
        $owner = @(Get-CimInstance Win32_Process -Filter "Name='app.exe'" | Where-Object ExecutablePath -eq $StoreExe)
        if ($owner.Count -ne 1) { throw "Shortcut did not launch Store: $($link.FullName)" }
        if (!(Get-CimInstance Win32_Process -Filter "Name='msedgewebview2.exe' AND ParentProcessId=$($owner[0].ProcessId)")) { throw 'Store WebView missing' }
        taskkill /PID $owner[0].ProcessId /T /F | Out-Null
    }
    if ($canary.HasExited) { throw 'New installer stopped an unrelated process' }
    $dir = Split-Path $LegacyExe
    $remove = Start-Process (Join-Path $dir 'uninstall.exe') -ArgumentList "/S _?=$dir" -PassThru -Wait
    if ($remove.ExitCode -or (Test-Path $LegacyExe) -or (Test-Path $key) -or $canary.HasExited -or !(Test-Path $StoreExe)) { throw 'New uninstaller failed isolation checks' }
    if ((Get-Content $Marker) -ne 'keep-legacy-profile') { throw 'User profile fixture changed' }
    Write-Host 'PASS: locked target preserved, in-place upgrade, original shortcuts launch Store, new uninstaller scoped, unrelated program and profile retained.'
} finally { if (!$canary.HasExited) { $canary.Kill(); $canary.WaitForExit() } }
