# Standard-user pilot for the website-to-Store bridge. Run on a disposable
# Windows desktop; -Acquire explicitly enables installation of the Store app.
[CmdletBinding()]
param([switch]$Acquire)

$ErrorActionPreference = 'Stop'
$family = 'BinApp.547813EA77836_hex6nfb75njyr'
$minimum = [version]'10.2.18.0'
function Get-CaiyunStoreVersion {
    $pkg = Get-AppxPackage -Name 'BinApp.547813EA77836' |
        Where-Object { $_.PackageFamilyName -eq $family -and $_.Architecture -eq 'X64' -and
            $_.Status -eq 'Ok' -and $_.SignatureKind -eq 'Store' } |
        Sort-Object { [version]$_.Version } -Descending | Select-Object -First 1
    if ($pkg) { return [version]$pkg.Version }
}
$before = Get-CaiyunStoreVersion
if ($before -and $before -ge $minimum) {
    Write-Output "Store package already registered: $before"
    exit 0
}
$installer = Get-AppxPackage -Name Microsoft.DesktopAppInstaller |
    Where-Object { $_.PackageFamilyName -eq 'Microsoft.DesktopAppInstaller_8wekyb3d8bbwe' -and $_.Status -eq 'Ok' } |
    Select-Object -First 1
if (!$installer) { Write-Output 'App Installer unavailable for current user'; exit 2 }
$winget = Join-Path $installer.InstallLocation 'winget.exe'
if (!(Test-Path -LiteralPath $winget -PathType Leaf)) { Write-Output 'WinGet unavailable'; exit 2 }
if (!$Acquire) { Write-Output 'WinGet present; acquisition has not been tested'; exit 0 }
& $winget install --id 9P2VQP7JKVLN --exact --source msstore --silent --disable-interactivity
$exitCode = $LASTEXITCODE
$after = Get-CaiyunStoreVersion
if ($after -and $after -ge $minimum) { Write-Output "Verified Store registration: $after"; exit 0 }
Write-Output "Store registration not verified; WinGet exit $exitCode"
exit 3
