# Run under a new standard account on a disposable Windows runner.
param([Parameter(Mandatory)][string]$FixtureDir)
$ErrorActionPreference = 'Stop'
Set-Location -LiteralPath $FixtureDir
try {
    $identity = [Security.Principal.WindowsIdentity]::GetCurrent()
    $principal = [Security.Principal.WindowsPrincipal]::new($identity)
    if ($principal.IsInRole([Security.Principal.WindowsBuiltInRole]::Administrator)) { throw 'Test must run as a standard user' }
    # Secondary-logon inherited the runner's textual environment. Resolve the
    # profile from the actual token and never read or launch the runner's files.
    $profileKey = "HKLM:\SOFTWARE\Microsoft\Windows NT\CurrentVersion\ProfileList\$($identity.User.Value)"
    $env:USERPROFILE = (Get-ItemProperty -LiteralPath $profileKey).ProfileImagePath
    $env:LOCALAPPDATA = Join-Path $env:USERPROFILE 'AppData\Local'
    $env:APPDATA = Join-Path $env:USERPROFILE 'AppData\Roaming'
    $env:TEMP = Join-Path $env:LOCALAPPDATA 'Temp'
    $env:TMP = $env:TEMP
    New-Item -ItemType Directory -Force -Path $env:TEMP | Out-Null
    $env:WEBVIEW2_ADDITIONAL_BROWSER_ARGUMENTS = '--remote-debugging-port=19227'
    $nonce = [guid]::NewGuid().ToString()
    function Check-Draft($mode) {
        & $node ./verify-windows-draft.mjs $mode 19227 $nonce
        if ($LASTEXITCODE -ne 0) { throw "Draft action failed: $mode" }
    }
    function Stop-Normally($process) {
        Check-Draft 'quit'
        if (!$process.WaitForExit(30000)) { throw 'Client did not exit through its save handler' }
    }
    $node = (Get-Command node.exe).Source
    $installed = Start-Process -FilePath "$FixtureDir\legacy.exe" -ArgumentList '/S' -PassThru -Wait
    if ($installed.ExitCode -ne 0) { throw 'Standard user could not install the historical EXE' }
    $old = Start-Process -FilePath (Join-Path $env:LOCALAPPDATA '彩云笔记\app.exe') -PassThru
    Check-Draft 'write'
    Stop-Normally $old
    Add-AppxPackage -Path "$FixtureDir\candidate.msix"
    $new = Get-AppxPackage -Name BinApp.547813EA77836
    if ($new.Version -ne [version]'10.2.18.0' -or $new.PackageFamilyName -ne 'BinApp.547813EA77836_hex6nfb75njyr') { throw 'Unexpected package identity' }
    $fresh = Start-Process -FilePath (Join-Path $new.InstallLocation 'app\app.exe') -PassThru
    Check-Draft 'read'
    Stop-Normally $fresh
    Write-Output 'PASS: a standard-user official legacy app wrote a synthetic offline draft, quit normally, and the installed Store candidate read the exact record.'
} catch { Write-Error $_ -ErrorAction Continue; exit 1 }
