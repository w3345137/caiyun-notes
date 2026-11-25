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

$exe = Join-Path $env:RUNNER_TEMP 'official-10.2.13.exe'
Invoke-WebRequest 'https://github.com/w3345137/caiyun-notes/releases/download/p25/_10.2.13_x64-setup.exe' -OutFile $exe
if ((Get-FileHash -LiteralPath $exe).Hash -ne '7dad87f4e18698973bcf4a12b382aed726c06b7fcd36527e57351f4dce201a3a') {
    throw 'Unexpected official EXE fixture'
}
$install = Start-Process -FilePath $exe -ArgumentList '/S' -PassThru -Wait
if ($install.ExitCode -ne 0) { throw 'Legacy EXE installation failed' }
$registration = 'HKCU:\Software\Microsoft\Windows\CurrentVersion\Uninstall\彩云笔记'
$legacy = Get-ItemProperty -LiteralPath $registration
$legacyDir = ([string]$legacy.InstallLocation).Trim('"').TrimEnd('\')
if ($legacyDir -ine (Join-Path $env:LOCALAPPDATA '彩云笔记')) { throw 'Unexpected legacy install location' }
$legacyExe = Join-Path $legacyDir 'app.exe'
$legacySha = (Get-FileHash -LiteralPath $legacyExe).Hash
$legacyProfile = Get-LaunchedProfile $legacyExe
if (!(Test-Path -LiteralPath $legacyProfile -PathType Container)) { throw 'Missing legacy WebView2 profile' }
$legacyMarker = Join-Path $legacyProfile 'isolated-legacy-upgrade-fixture.txt'
Set-Content -LiteralPath $legacyMarker -Value 'keep-legacy-profile'

$old = Install-QaPackage $baseline '10.2.15.0'
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

# Exercise the existing official uninstaller only after both test apps have exited.
$uninstaller = Join-Path $legacyDir 'uninstall.exe'
if (([string]$legacy.UninstallString).Trim('"') -ine $uninstaller) {
    throw 'Legacy uninstall registration does not match the installed fixture'
}
$remove = Start-Process -FilePath $uninstaller -ArgumentList '/S' -PassThru -Wait
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
