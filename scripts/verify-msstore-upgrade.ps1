# Run on a disposable Windows test runner only.
$ErrorActionPreference = 'Stop'
$publisher = 'CN=49D17C52-EB55-4439-9F79-0DFACFCB393C'
$name = 'BinApp.547813EA77836'
$family = "${name}_hex6nfb75njyr"
$baseline = Get-Item -LiteralPath 'baseline/CaiyunNotes_10.2.15.0_x64.msix'
$candidate = Get-Item -LiteralPath 'candidate/CaiyunNotes_10.2.18.0_x64.msix'
if ((Get-FileHash -LiteralPath $baseline.FullName).Hash -ne '6fa0bb4f60923e5503356776bf99f4242e044d6f1a4430547516a9c5aad911d3') {
    throw 'Unexpected baseline artifact'
}
$cert = New-SelfSignedCertificate -Type CodeSigningCert -Subject $publisher -CertStoreLocation Cert:\CurrentUser\My
$certificatePath = Join-Path $env:RUNNER_TEMP 'store-qa.cer'
Export-Certificate -Cert $cert -FilePath $certificatePath | Out-Null
Import-Certificate -FilePath $certificatePath -CertStoreLocation Cert:\LocalMachine\TrustedPeople | Out-Null
$sdk = 'C:\Program Files (x86)\Windows Kits\10\bin'
$signtool = Get-ChildItem $sdk -Recurse -Filter signtool.exe |
    Where-Object { $_.FullName -match '\\x64\\' } | Sort-Object FullName | Select-Object -Last 1
if (!$signtool) { throw 'Missing Windows SDK signtool' }

function Install-QaPackage($file, $version) {
    $copy = Join-Path $env:RUNNER_TEMP $file.Name
    Copy-Item -LiteralPath $file.FullName -Destination $copy -Force
    & $signtool.FullName sign /fd sha256 /sha1 $cert.Thumbprint $copy | Out-Host
    if ($LASTEXITCODE -ne 0) { throw "Failed to sign QA copy $($file.Name)" }
    Add-AppxPackage -Path $copy
    $package = Get-AppxPackage -Name $name
    if (!$package -or $package.Version.ToString() -ne $version -or $package.Publisher -ne $publisher -or $package.PackageFamilyName -ne $family) {
        throw "Unexpected installed identity or version for $version"
    }
    $package
}

function Get-LaunchedProfile($binary) {
    $process = Start-Process -FilePath $binary -PassThru
    try {
        Start-Sleep -Seconds 10
        $process.Refresh()
        if ($process.HasExited) { throw "Packaged app exited with $($process.ExitCode)" }
        $webview = @(Get-CimInstance Win32_Process -Filter "ParentProcessId = $($process.Id)" |
            Where-Object Name -eq 'msedgewebview2.exe')
        if ($webview.Count -eq 0) { throw 'Packaged app did not start WebView2' }
        $profile = $webview | ForEach-Object {
            if ($_.CommandLine -match '--user-data-dir=(?:"([^"]+)"|([^\s"]+))') {
                if ($Matches[1]) { $Matches[1] } else { $Matches[2] }
            }
        } | Select-Object -First 1
        if (!$profile) { throw 'WebView2 profile path not found' }
        $profile
    } finally {
        if (!$process.HasExited) { taskkill /PID $process.Id /T /F | Out-Null }
    }
}

$zip = Join-Path $env:RUNNER_TEMP 'appx.zip'
$layout = Join-Path $env:RUNNER_TEMP 'candidate-layout'
Copy-Item -LiteralPath $candidate.FullName -Destination $zip
Expand-Archive -LiteralPath $zip -DestinationPath $layout
$manifestPath = Join-Path $layout 'AppxManifest.xml'
$manifest = [xml](Get-Content -LiteralPath $manifestPath -Raw)
if ($manifest.Package.Identity.Version -ne '10.2.18.0' -or $manifest.Package.Applications.Application.Id -ne 'CaiyunNotes' -or
    (Get-Content -LiteralPath $manifestPath -Raw) -match 'unvirtualizedResources|WriteVirtualization|ExcludedKey|ExcludedDirectory') {
    throw 'Candidate manifest did not satisfy certification checks'
}
Write-Host "Candidate SHA-256: $((Get-FileHash -LiteralPath $candidate.FullName).Hash)"

$assetName = "_${env:LEGACY_VERSION}_x64-setup.exe"
$exe = Join-Path $env:RUNNER_TEMP $assetName
gh release download $env:LEGACY_TAG -R w3345137/caiyun-notes --pattern $assetName --dir $env:RUNNER_TEMP
if ($LASTEXITCODE -ne 0 -or (Get-FileHash -LiteralPath $exe).Hash -ne $env:LEGACY_SHA256) { throw 'Unexpected legacy EXE fixture' }
$install = Start-Process -FilePath $exe -ArgumentList '/S' -PassThru -Wait
if ($install.ExitCode -ne 0) { throw 'Legacy EXE installation failed' }
$registration = 'HKCU:\Software\Microsoft\Windows\CurrentVersion\Uninstall\彩云笔记'
$legacy = Get-ItemProperty -LiteralPath $registration
if ($legacy.DisplayVersion -ne $env:LEGACY_VERSION) { throw 'Unexpected registered EXE version' }
$legacyDir = ([string]$legacy.InstallLocation).Trim('"').TrimEnd('\')
if ($legacyDir -ine (Join-Path $env:LOCALAPPDATA '彩云笔记')) { throw 'Unexpected legacy install location' }
$legacyExe = Join-Path $legacyDir 'app.exe'
$legacySha = (Get-FileHash -LiteralPath $legacyExe).Hash
$legacyProfile = Get-LaunchedProfile $legacyExe
if (!(Test-Path -LiteralPath $legacyProfile -PathType Container)) { throw 'Missing legacy WebView2 profile' }
$legacyMarker = Join-Path $legacyProfile 'isolated-legacy-upgrade-fixture.txt'
Set-Content -LiteralPath $legacyMarker -Value 'keep-legacy-profile'

if ($env:LAUNCH_PROBE -eq 'true') {
    $vswhere = Join-Path ${env:ProgramFiles(x86)} 'Microsoft Visual Studio/Installer/vswhere.exe'
    $vs = & $vswhere -latest -products '*' -requires Microsoft.VisualStudio.Component.VC.Tools.x86.x64 -property installationPath
    $devcmd = Join-Path $vs 'Common7/Tools/VsDevCmd.bat'
    $probe = Join-Path $env:RUNNER_TEMP 'caiyun-direct-entry.exe'
    $compile = 'call "{0}" -arch=x64 -host_arch=x64 >nul && cl /nologo /utf-8 /std:c11 src-tauri/src/windows_direct_launch.c tests/windows-handoff/direct-entry.c /Fe:"{1}" /link user32.lib ole32.lib uuid.lib kernel32.lib' -f $devcmd,$probe
    cmd /c $compile | Out-Host
    if ($LASTEXITCODE -ne 0 -or ![IO.File]::Exists($probe)) { throw 'Direct entry fixture compile failed' }
    if ((& $probe) -ne 'DIRECT') { throw 'No Store installed: expected normal direct startup' }
}
$old = Install-QaPackage $baseline '10.2.15.0'
if ($env:LAUNCH_PROBE -eq 'true' -and (& $probe) -ne 'DIRECT') {
    throw 'Old Store package must not capture the direct entry'
}
$oldProfile = Get-LaunchedProfile (Join-Path $old.InstallLocation 'app\app.exe')
$localState = Join-Path $env:LOCALAPPDATA "Packages\$family\LocalState"
New-Item -Path $localState -ItemType Directory -Force | Out-Null
$marker = Join-Path $localState 'isolated-package-upgrade-fixture.txt'
Set-Content -LiteralPath $marker -Value 'keep-local-state'

$new = Install-QaPackage $candidate '10.2.18.0'
$newProfile = Get-LaunchedProfile (Join-Path $new.InstallLocation 'app\app.exe')
if ($newProfile -ne $oldProfile) { throw 'WebView2 profile changed on Store upgrade' }
if ((Get-Content -LiteralPath $marker) -ne 'keep-local-state') { throw 'Package local state did not survive upgrade' }
$current = Get-ItemProperty -LiteralPath $registration
if ($current.UninstallString -ne $legacy.UninstallString -or (Get-FileHash -LiteralPath $legacyExe).Hash -ne $legacySha) {
    throw 'Store package unexpectedly changed the legacy EXE or uninstall registration'
}
if ((Get-Content -LiteralPath $legacyMarker) -ne 'keep-legacy-profile') { throw 'The unpackaged WebView2 profile changed' }
Write-Host "Both channels report the same WebView2 profile path: $($legacyProfile -eq $newProfile)"
Write-Host 'PASS: same-family upgrade, WebView2 startup and identical profile, package local-state preservation and intact legacy EXE.'

if ($env:LAUNCH_PROBE -eq 'true') {
    Add-Type -TypeDefinition @'
using System;
using System.Runtime.InteropServices;

[ComImport, InterfaceType(ComInterfaceType.InterfaceIsIUnknown), Guid("2e941141-7f97-4756-ba1d-9decde894a3d")]
interface IApplicationActivationManager {
    int ActivateApplication([MarshalAs(UnmanagedType.LPWStr)] string appUserModelId, [MarshalAs(UnmanagedType.LPWStr)] string arguments, uint options);
}
public static class CaiyunStoreActivation {
    [DllImport("user32.dll")] public static extern bool IsWindowVisible(IntPtr window);
    [DllImport("user32.dll", SetLastError=true)] static extern bool PostMessage(IntPtr window, uint msg, IntPtr wparam, IntPtr lparam);
    public static void CloseWindow(IntPtr window) {
        if (window == IntPtr.Zero || !PostMessage(window, 0x10, IntPtr.Zero, IntPtr.Zero))
            throw new InvalidOperationException("Could not request a normal window close");
    }
    public static int Launch(string appUserModelId) {
        var clsid = new Guid("45ba127d-10a8-46ea-8ab7-56ea9078943c");
        var manager = (IApplicationActivationManager)Activator.CreateInstance(Type.GetTypeFromCLSID(clsid));
        return manager.ActivateApplication(appUserModelId, null, 2);
    }
}
'@
    $aumid = "$family!CaiyunNotes"
    $expectedExe = Join-Path $new.InstallLocation 'app\app.exe'
    $shortcutFolders = @([Environment]::GetFolderPath('DesktopDirectory'), [Environment]::GetFolderPath('Programs'))
    $links = foreach ($folder in $shortcutFolders) {
        Get-ChildItem -LiteralPath $folder -Recurse -Filter '彩云笔记.lnk'
    }
    $shell = New-Object -ComObject WScript.Shell
    foreach ($link in $links) {
        $shortcut = $shell.CreateShortcut($link.FullName)
        Write-Host "Legacy shortcut after update: $($link.FullName) -> $($shortcut.TargetPath)"
    }
    # Only the directly-launched QA process inherits this loopback test port.
    $env:WEBVIEW2_ADDITIONAL_BROWSER_ARGUMENTS = '--remote-debugging-port=19227'
    $nonce = [guid]::NewGuid().ToString()
    function Invoke-DraftTest($mode) {
        node scripts/verify-windows-draft.mjs $mode 19227 $nonce
        if ($LASTEXITCODE -ne 0) { throw "QA WebView draft test failed: $mode" }
    }
    function Wait-WebView($process) {
        $deadline = (Get-Date).AddSeconds(35)
        do {
            if ($process.HasExited) { throw 'App exited before WebView startup' }
            if (Get-CimInstance Win32_Process -Filter "ParentProcessId = $($process.Id) AND Name = 'msedgewebview2.exe'") { return }
            Start-Sleep -Milliseconds 400
        } while ((Get-Date) -lt $deadline)
        throw 'Expected WebView did not start'
    }
    function Assert-CleanExit($process) {
        Invoke-DraftTest 'quit'
        if (!$process.WaitForExit(30000)) { throw 'Normal exit did not complete' }
    }
    function Start-TestApp($exePath) {
        # Hosted runners are elevated. WebView2 ignores environment test flags
        # for elevated hosts. Launch the real client as the ordinary desktop user.
        $name = 'CaiyunQa-' + [guid]::NewGuid()
        $launcher = Join-Path $env:RUNNER_TEMP ($name + '.ps1')
        $pidPath = Join-Path $env:RUNNER_TEMP ($name + '.pid')
        $body = @'
param($exePath,$pidPath)
$env:WEBVIEW2_ADDITIONAL_BROWSER_ARGUMENTS = '--remote-debugging-port=19227'
$start = [Diagnostics.ProcessStartInfo]::new()
$start.FileName = $exePath
$start.UseShellExecute = $false
$app = [Diagnostics.Process]::Start($start)
[IO.File]::WriteAllText($pidPath,$app.Id.ToString())
$app.WaitForExit()
'@
        Set-Content -LiteralPath $launcher -Value $body -Encoding utf8BOM
        $arguments = '-NoProfile -File "{0}" "{1}" "{2}"' -f $launcher,$exePath,$pidPath
        $action = New-ScheduledTaskAction -Execute (Get-Command pwsh).Source -Argument $arguments
        $principal = New-ScheduledTaskPrincipal -UserId ([Security.Principal.WindowsIdentity]::GetCurrent().Name) -LogonType Interactive -RunLevel Limited
        Register-ScheduledTask -TaskName $name -Action $action -Principal $principal | Out-Null
        Start-ScheduledTask -TaskName $name
        for ($i = 0; $i -lt 80; $i++) {
            if ([IO.File]::Exists($pidPath)) {
                $launched = Get-Process -Id ([int][IO.File]::ReadAllText($pidPath))
                if ($launched.Path -ine $exePath) { throw 'Unexpected scheduled test process identity' }
                return $launched
            }
            Start-Sleep -Milliseconds 250
        }
        throw 'Ordinary-user QA launch did not report a PID' 
    }
    $entryOnly = $env:ENTRY_ONLY -eq 'true'
    $oldProcess = if ($entryOnly) { Start-Process -FilePath $legacyExe -PassThru } else { Start-TestApp $legacyExe }
    Wait-WebView $oldProcess
    $webviewProcess = Get-CimInstance Win32_Process -Filter "ParentProcessId = $($oldProcess.Id) AND Name='msedgewebview2.exe'" | Select-Object -First 1
    Write-Host "QA WebView runtime received requested test port: $($webviewProcess.CommandLine -match 'remote-debugging-port=19227')"
    if (!$entryOnly) { Invoke-DraftTest 'write' }
    $oldProcess.Refresh()
    $oldWindow = $oldProcess.MainWindowHandle
    [CaiyunStoreActivation]::CloseWindow($oldWindow)
    Start-Sleep -Seconds 1
    if ($oldProcess.HasExited -or [CaiyunStoreActivation]::IsWindowVisible($oldWindow)) {
        throw 'Closing old window did not leave the old client in its tray'
    }
    $first = Get-Process -Id ([CaiyunStoreActivation]::Launch($aumid))
    Start-Sleep -Seconds 2
    $first.Refresh()
    if ($first.Path -ine $expectedExe -or $first.MainWindowTitle -ne '彩云笔记 · 等待旧版退出') { throw "Missing cancelable waiting dialog (title=$($first.MainWindowTitle))" }
    [CaiyunStoreActivation]::CloseWindow($first.MainWindowHandle)
    if (!$first.WaitForExit(10000) -or $oldProcess.HasExited) { throw 'Cancel must leave old process running' }
    if (!$entryOnly) { Invoke-DraftTest 'read' }
    $activationPid = [CaiyunStoreActivation]::Launch($aumid)
    Start-Sleep -Seconds 3
    $waiting = Get-Process -Id $activationPid -ErrorAction Stop
    if ($waiting.Path -ine $expectedExe -or $waiting.MainWindowTitle -ne '彩云笔记 · 等待旧版退出' -or
        (Get-CimInstance Win32_Process -Filter "ParentProcessId = $activationPid AND Name = 'msedgewebview2.exe'")) {
        throw "Expected a waiting native dialog and no second editor, observed title '$($waiting.MainWindowTitle)'"
    }
    if ($entryOnly) {
        # Fixture has no user account or edits. This tests detection of process
        # exit only. The separate draft test uses the real controlled quit.
        taskkill /PID $oldProcess.Id /T /F | Out-Null
    } else { Assert-CleanExit $oldProcess }
    Wait-WebView $waiting
    Write-Host "PASS: same waiting Store process started WebView after legacy exited (entry-only=$entryOnly)."
    # AUMID activation can be brokered without inheriting the calling process environment.
    # Reopen the same installed package with the QA port to inspect its business data.
    taskkill /PID $waiting.Id /T /F | Out-Null
    if (!$entryOnly) {
        $fresh = Start-TestApp $expectedExe
        Wait-WebView $fresh
        Invoke-DraftTest 'read'
        Assert-CleanExit $fresh
        Write-Host 'PASS: exact newly installed package read the old synthetic offline draft.'
    }
    if ((& $probe) -ne 'STORE') { throw 'New direct entry failed to reach the eligible Store window' }
    $redirected = @(Get-CimInstance Win32_Process -Filter "Name='app.exe'" | Where-Object ExecutablePath -eq $expectedExe)
    if ($redirected.Count -ne 1) { throw 'Direct handoff did not leave exactly one packaged app' }
    if ((& $probe) -ne 'STORE') { throw 'Relaunch failed with Store already running' }
    taskkill /PID $redirected[0].ProcessId /T /F | Out-Null
    Write-Host 'PASS: direct entry fallback on missing/old package and redirection on eligible package (cold and already running).'
    foreach ($link in $links) {
        Start-Process -FilePath $link.FullName
        Start-Sleep -Seconds 7
        $owners = @(Get-CimInstance Win32_Process -Filter "Name = 'app.exe'" |
            Where-Object { $_.ExecutablePath -in @($legacyExe, $expectedExe) })
        if ($owners.Count -ne 1) { throw "Ambiguous shortcut outcome: $($link.FullName), count=$($owners.Count)" }
        Write-Host "Shell-open shortcut $($link.FullName) opened Store=$($owners[0].ExecutablePath -eq $expectedExe)"
        taskkill /PID $owners[0].ProcessId /T /F | Out-Null
    }
    exit 0
}

# Exercise the existing official uninstaller only after both test apps have exited.
$uninstaller = Join-Path $legacyDir 'uninstall.exe'
if (([string]$legacy.UninstallString).Trim('"') -ine $uninstaller) {
    throw 'Legacy uninstall registration does not match the installed fixture'
}
Write-Host "Legacy uninstaller SHA-256: $((Get-FileHash -LiteralPath $uninstaller).Hash)"
# In this disposable job the only extra app.exe is our canary. A production
# migration must preserve unrelated applications that use this common name.
$canaryDir = Join-Path $env:RUNNER_TEMP 'caiyun-unrelated-process'
New-Item -ItemType Directory -Path $canaryDir | Out-Null
$canaryExe = Join-Path $canaryDir 'app.exe'
Copy-Item (Join-Path $env:SystemRoot 'System32/ping.exe') $canaryExe
$canary = Start-Process $canaryExe -ArgumentList '-t','127.0.0.1' -WindowStyle Hidden -PassThru
try {
    Start-Sleep -Milliseconds 500
    if ($canary.HasExited) { throw 'Canary failed to start' }
    $remove = Start-Process -FilePath $uninstaller -ArgumentList '/S' -PassThru
    if (!$remove.WaitForExit(45000)) { throw 'Official silent uninstall did not finish within 45 seconds with unrelated app.exe running' }
    Start-Sleep -Seconds 2
    if ($canary.HasExited) { throw 'BLOCK automatic uninstall: official NSIS stopped an unrelated app.exe' }
    Write-Host 'PASS: unrelated test app.exe survived official NSIS uninstall.'
} finally {
    if (!$canary.HasExited) { $canary.Kill(); $canary.WaitForExit() }
}
if ($remove.ExitCode -ne 0 -or (Test-Path -LiteralPath $legacyExe) -or (Test-Path -LiteralPath $registration)) {
    throw 'The verified legacy uninstaller did not retire its own registration'
}
if ((Get-Content -LiteralPath $marker) -ne 'keep-local-state' -or (Get-Content -LiteralPath $legacyMarker) -ne 'keep-legacy-profile') {
    throw 'Local data fixture did not survive the legacy uninstall'
}
$final = Get-AppxPackage -Name $name
if ($final.Version.ToString() -ne '10.2.18.0' -or (Get-LaunchedProfile (Join-Path $final.InstallLocation 'app\app.exe')) -ne $newProfile) {
    throw 'The Store package did not restart with its existing profile after removing the EXE'
}
Write-Host 'PASS: official legacy uninstaller removed its old installation with both clients closed and both data fixtures preserved.'
