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

if ($env:SCENARIO -in @('entries','website-installer')) {
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
if ($env:SCENARIO -eq 'entries' -and (& $probe) -ne 'DIRECT') {
    throw 'Old Store package must not capture the direct entry'
}
$oldProfile = Get-LaunchedProfile (Join-Path $old.InstallLocation 'app\app.exe')
$localState = Join-Path $env:LOCALAPPDATA "Packages\$family\LocalState"
New-Item -Path $localState -ItemType Directory -Force | Out-Null
$marker = Join-Path $localState 'isolated-package-upgrade-fixture.txt'
Set-Content -LiteralPath $marker -Value 'keep-local-state'

if ($env:SCENARIO -eq 'profile-persistence') {
    # Use the runner's existing console session. Both records are synthetic and
    # scoped to the runner's test profile. Use the same WebView URL as the app.
    $env:WEBVIEW2_ADDITIONAL_BROWSER_ARGUMENTS = '--remote-debugging-port=19227'
    $browserPolicy = 'HKLM:\Software\Policies\Microsoft\Edge\WebView2\AdditionalBrowserArguments'
    New-Item -Path $browserPolicy -Force | Out-Null
    # The package broker can use a different environment. Scope the test
    # override to the exact packaged application identity.
    New-ItemProperty -Path $browserPolicy -Name "$family!CaiyunNotes" -PropertyType String -Value $env:WEBVIEW2_ADDITIONAL_BROWSER_ARGUMENTS -Force | Out-Null
    # The normal runner has only the two isolated Caiyun test app.exe binaries.
    New-ItemProperty -Path $browserPolicy -Name 'app.exe' -PropertyType String -Value $env:WEBVIEW2_ADDITIONAL_BROWSER_ARGUMENTS -Force | Out-Null
    $legacyDraft = [guid]::NewGuid().ToString()
    $storeDraft = [guid]::NewGuid().ToString()
    function Invoke-DraftCheck($binary, $action, $key) {
        $channel = if ($binary -like '*WindowsApps*') { 'Store' } else { 'website' }
        Write-Host "Starting $action draft check in $channel"
        $process = Start-Process -FilePath $binary -PassThru
        try {
            for ($j = 0; $j -lt 20; $j++) {
                $wv = Get-CimInstance Win32_Process -Filter "Name='msedgewebview2.exe' AND ParentProcessId=$($process.Id)" | Select-Object -First 1
                if ($wv) { break }
                Start-Sleep -Milliseconds 250
            }
            Write-Host ("Has WebView process: {0}, has QA debug flag: {1}" -f [bool]$wv, ($wv.CommandLine -match 'remote-debugging-port=19227'))
            node ./scripts/verify-windows-draft.mjs $action 19227 $key
            if ($LASTEXITCODE -ne 0) { throw "$action draft check failed" }
            node ./scripts/verify-windows-draft.mjs quit 19227 $key
            if ($LASTEXITCODE -ne 0 -or !$process.WaitForExit(30000)) { throw 'Controlled exit failed' }
        } finally { if (!$process.HasExited) { taskkill /PID $process.Id /T /F | Out-Null } }
    }
    Invoke-DraftCheck $legacyExe write $legacyDraft
    Invoke-DraftCheck (Join-Path $old.InstallLocation 'app/app.exe') write $storeDraft
    Write-Host 'Wrote synthetic drafts in the official website and Store baseline WebViews and exited normally.'
}

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

if ($env:SCENARIO -eq 'profile-persistence') {
    Invoke-DraftCheck (Join-Path $new.InstallLocation 'app/app.exe') read $storeDraft
    Invoke-DraftCheck $legacyExe read $legacyDraft
    Remove-ItemProperty -Path $browserPolicy -Name @("$( $family )!CaiyunNotes", "app.exe")
    Write-Host 'PASS: the upgraded Store app read its original draft, and the coexisting official website app read its untouched draft.'
    exit 0
}

if ($env:SCENARIO -eq 'website-installer') {
    if ((Get-FileHash $candidate.FullName).Hash -ne 'FF83314873E04A7D66326ABB062A23E69A1E9BE291E062A2D118E790E16CE672') { throw 'Unexpected Store handoff candidate' }
    & ./scripts/verify-website-installer.ps1 -Probe $probe -LegacyExe $legacyExe -StoreExe (Join-Path $new.InstallLocation 'app/app.exe') -Marker $legacyMarker
    exit 0
}

if ($env:SCENARIO -eq 'offline-draft') {
    # No real user data or credentials are used. Keep application launches and
    # WebView automation at normal user integrity, including the package install.
    $qaUser = 'CaiyunDraftQA'
    $secret = ConvertTo-SecureString (([guid]::NewGuid().ToString('N')) + 'Zz!8') -AsPlainText -Force
    $account = New-LocalUser -Name $qaUser -Password $secret
    $usersGroup = Get-LocalGroup -SID 'S-1-5-32-545'
    if (!(Get-LocalGroupMember $usersGroup | Where-Object SID -eq $account.SID)) { Add-LocalGroupMember -Group $usersGroup -Member $account }
    $fixtureDir = Join-Path $env:PUBLIC ('CaiyunDraftTest-' + [guid]::NewGuid())
    New-Item -ItemType Directory -Path $fixtureDir | Out-Null
    Copy-Item -LiteralPath $exe -Destination "$fixtureDir\legacy.exe"
    Copy-Item -LiteralPath (Join-Path $env:RUNNER_TEMP $candidate.Name) -Destination "$fixtureDir\candidate.msix"
    Copy-Item scripts/verify-windows-draft.mjs,scripts/verify-standard-user-draft.ps1 -Destination $fixtureDir
    icacls $fixtureDir /grant ("*{0}:(OI)(CI)RX" -f $account.SID.Value) | Out-Null
    if ($LASTEXITCODE -ne 0) { throw 'Could not grant the test user fixture read access' }
    $cred = [PSCredential]::new("$env:COMPUTERNAME\$qaUser",$secret)
    $log = Join-Path $env:RUNNER_TEMP 'standard-draft-out.log'
    $errlog = Join-Path $env:RUNNER_TEMP 'standard-draft-err.log'
    Remove-Item Env:GH_TOKEN -ErrorAction SilentlyContinue
    $arguments = '-NoProfile -File "{0}\verify-standard-user-draft.ps1" -FixtureDir "{0}"' -f $fixtureDir
    $run = Start-Process (Get-Command pwsh).Source -ArgumentList $arguments -Credential $cred -LoadUserProfile -WorkingDirectory $fixtureDir -RedirectStandardOutput $log -RedirectStandardError $errlog -PassThru
    if (!$run.WaitForExit(150000)) { throw 'Timed out waiting for standard-user draft test' }
    Get-Content -LiteralPath $log,$errlog
    if ($run.ExitCode -ne 0) { throw "Standard-user draft test exit $($run.ExitCode)" }
    exit 0
}

if ($env:SCENARIO -eq 'entries') {
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
    delegate bool EnumProc(IntPtr hwnd, IntPtr param);
    [DllImport("user32.dll")] static extern bool EnumWindows(EnumProc callback, IntPtr arg);
    [DllImport("user32.dll")] static extern uint GetWindowThreadProcessId(IntPtr hwnd, out uint pid);
    [DllImport("user32.dll", CharSet=CharSet.Unicode)] static extern int GetClassName(IntPtr hwnd,System.Text.StringBuilder buffer,int size);
    public static IntPtr EditorWindow(int pid) {
        IntPtr result = IntPtr.Zero;
        EnumWindows((hwnd,param) => {
            uint owner; GetWindowThreadProcessId(hwnd,out owner);
            if(owner != pid || !IsWindowVisible(hwnd)) return true;
            var name = new System.Text.StringBuilder(256);
            GetClassName(hwnd,name,256);
            if(name.ToString() != "Tauri Window") return true;
            result = hwnd; return false;
        },IntPtr.Zero);
        return result;
    }
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
    function Wait-WebView($process) {
        $deadline = (Get-Date).AddSeconds(35)
        do {
            if ($process.HasExited) { throw 'App exited before WebView startup' }
            if (Get-CimInstance Win32_Process -Filter "ParentProcessId = $($process.Id) AND Name = 'msedgewebview2.exe'") { return }
            Start-Sleep -Milliseconds 400
        } while ((Get-Date) -lt $deadline)
        throw 'Expected WebView did not start'
    }
    $oldProcess = Start-Process -FilePath $legacyExe -PassThru
    Wait-WebView $oldProcess
    $oldProcess.Refresh()
    for ($i = 0; $i -lt 45; $i++) {
        $oldWindow = [CaiyunStoreActivation]::EditorWindow($oldProcess.Id)
        if ($oldWindow -ne [IntPtr]::Zero) { break }
        Start-Sleep -Milliseconds 400
    }
    Start-Sleep -Seconds 3
    [CaiyunStoreActivation]::CloseWindow($oldWindow)
    for ($i = 0; $i -lt 35 -and [CaiyunStoreActivation]::IsWindowVisible($oldWindow); $i++) { Start-Sleep -Milliseconds 300 }
    if ($oldProcess.HasExited -or [CaiyunStoreActivation]::IsWindowVisible($oldWindow)) {
        throw 'Closing old window did not leave the old client in its tray'
    }
    $first = Get-Process -Id ([CaiyunStoreActivation]::Launch($aumid))
    Start-Sleep -Seconds 2
    $first.Refresh()
    if ($first.Path -ine $expectedExe -or $first.MainWindowTitle -ne '彩云笔记 · 等待旧版退出') { throw "Missing cancelable waiting dialog (title=$($first.MainWindowTitle))" }
    [CaiyunStoreActivation]::CloseWindow($first.MainWindowHandle)
    if (!$first.WaitForExit(10000) -or $oldProcess.HasExited) { throw 'Cancel must leave old process running' }
    $activationPid = [CaiyunStoreActivation]::Launch($aumid)
    Start-Sleep -Seconds 3
    $waiting = Get-Process -Id $activationPid -ErrorAction Stop
    if ($waiting.Path -ine $expectedExe -or $waiting.MainWindowTitle -ne '彩云笔记 · 等待旧版退出' -or
        (Get-CimInstance Win32_Process -Filter "ParentProcessId = $activationPid AND Name = 'msedgewebview2.exe'")) {
        throw "Expected a waiting native dialog and no second editor, observed title '$($waiting.MainWindowTitle)'"
    }
    # This fixture contains no user edits. The offline-draft scenario separately
    # exercises normal controlled quit and checks its committed data.
    taskkill /PID $oldProcess.Id /T /F | Out-Null
    Wait-WebView $waiting
    Write-Host 'PASS: same waiting Store process started its WebView after the legacy process exited.'
    taskkill /PID $waiting.Id /T /F | Out-Null
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
    if ($links.Count -lt 2) { throw 'Expected both original test shortcuts' }
    # Emulate delivery of the new direct-entry code in this disposable NSIS
    # installation. Keep the original binary for the unmodified comparison.
    $original = Join-Path $env:RUNNER_TEMP 'original-installed-app.exe'
    Move-Item -LiteralPath $legacyExe -Destination $original
    try {
        Copy-Item -LiteralPath $probe -Destination $legacyExe
        foreach ($link in $links) {
            Start-Process -FilePath $link.FullName
            $owners = @()
            for ($i = 0; $i -lt 40; $i++) {
                $owners = @(Get-CimInstance Win32_Process -Filter "Name = 'app.exe'" |
                    Where-Object ExecutablePath -eq $expectedExe)
                if ($owners.Count -eq 1 -and (Get-CimInstance Win32_Process -Filter "ParentProcessId = $($owners[0].ProcessId) AND Name = 'msedgewebview2.exe'")) { break }
                Start-Sleep -Milliseconds 300
            }
            if ($i -eq 40) { throw "Updated direct-entry fixture failed from $($link.FullName)" }
            Write-Host "PASS: unchanged shortcut $($link.FullName) opened the Store WebView through the updated direct-entry fixture."
            taskkill /PID $owners[0].ProcessId /T /F | Out-Null
            Start-Sleep -Seconds 1
        }
    } finally {
        Copy-Item -LiteralPath $original -Destination $legacyExe -Force
    }
    exit 0
}

if ($env:SCENARIO -ne 'legacy-uninstall') { throw 'Unknown Windows acceptance scenario' }
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
