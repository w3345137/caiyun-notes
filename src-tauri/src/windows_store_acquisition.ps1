$ErrorActionPreference = 'Stop'
$minimum = [version]$env:CAIYUN_STORE_MINIMUM
function Get-VerifiedPackage {
    Get-AppxPackage -Name 'BinApp.547813EA77836' | Where-Object {
        $_.PackageFamilyName -eq 'BinApp.547813EA77836_hex6nfb75njyr' -and
        $_.Status -eq 'Ok' -and $_.Architecture -eq 'X64' -and $_.SignatureKind -eq 'Store'
    } | Sort-Object { [version]$_.Version } -Descending | Select-Object -First 1
}
$before = Get-VerifiedPackage
if ($before -and [version]$before.Version -ge $minimum) { exit 0 }
$installer = Get-AppxPackage -Name 'Microsoft.DesktopAppInstaller' | Where-Object {
    $_.PackageFamilyName -eq 'Microsoft.DesktopAppInstaller_8wekyb3d8bbwe' -and $_.Status -eq 'Ok'
} | Select-Object -First 1
if (!$installer) { exit 2 }
$winget = Join-Path $installer.InstallLocation 'winget.exe'
if (!(Test-Path -LiteralPath $winget -PathType Leaf)) { exit 2 }
$verb = if ($before) { 'upgrade' } else { 'install' }
& $winget $verb --id 9P2VQP7JKVLN --exact --source msstore --silent --disable-interactivity
$after = Get-VerifiedPackage
if ($after -and [version]$after.Version -ge $minimum) { exit 0 }
exit 2
