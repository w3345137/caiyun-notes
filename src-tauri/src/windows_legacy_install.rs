use sha2::{Digest, Sha256};
use std::fs;
use std::os::windows::fs::MetadataExt;
use std::path::{Path, PathBuf};
use std::sync::Mutex;
use windows::core::{w, PCWSTR, PWSTR};
use windows::Win32::Foundation::ERROR_SUCCESS;
use windows::Win32::Storage::Packaging::Appx::GetCurrentPackageFamilyName;
use windows::Win32::System::Registry::{
    RegCloseKey, RegGetValueW, RegOpenKeyExW, HKEY, HKEY_CURRENT_USER, REG_SAM_FLAGS, RRF_RT_REG_SZ,
};
use windows::Win32::System::SystemInformation::OSVERSIONINFOW;
const LEGACY_UNINSTALL_KEY: PCWSTR =
    w!("Software\\Microsoft\\Windows\\CurrentVersion\\Uninstall\\彩云笔记");
const STORE_FAMILY: &str = "BinApp.547813EA77836_hex6nfb75njyr";
const REPARSE_POINT: u32 = 0x400;
static RETIRE_LOCK: Mutex<()> = Mutex::new(());

#[link(name = "ntdll")]
extern "system" {
    fn RtlGetVersion(info: *mut OSVERSIONINFOW) -> i32;
    fn NtDeleteKey(key: HKEY) -> i32;
}

fn supports_targeted_virtualization() -> bool {
    let mut version = OSVERSIONINFOW {
        dwOSVersionInfoSize: std::mem::size_of::<OSVERSIONINFOW>() as u32,
        ..Default::default()
    };
    // On older systems the scoped manifest exclusions are ignored.
    (unsafe { RtlGetVersion(&mut version) }) == 0 && version.dwBuildNumber >= 22_000
}

struct LegacyRegistration(HKEY);

impl LegacyRegistration {
    fn open_for_delete() -> Result<Self, String> {
        const DELETE_ACCESS: REG_SAM_FLAGS = REG_SAM_FLAGS(0x0001_0000);
        let mut key = HKEY::default();
        // Open the exact excluded key. Opening its virtualized parent for the
        // delete can hide the old registration without removing it externally.
        let status = unsafe {
            RegOpenKeyExW(
                HKEY_CURRENT_USER,
                LEGACY_UNINSTALL_KEY,
                None,
                DELETE_ACCESS,
                &mut key,
            )
        };
        if status != ERROR_SUCCESS {
            return Err(format!(
                "Legacy registration open failed: Win32 {}",
                status.0
            ));
        }
        Ok(Self(key))
    }

    fn delete(self) -> Result<(), String> {
        let status = unsafe { NtDeleteKey(self.0) };
        if status != 0 {
            return Err(format!(
                "Legacy registration removal failed: NTSTATUS {status:#010x}"
            ));
        }
        Ok(())
    }
}

impl Drop for LegacyRegistration {
    fn drop(&mut self) {
        let _ = unsafe { RegCloseKey(self.0) };
    }
}

fn is_packaged_caiyun() -> bool {
    let mut name = [0_u16; 256];
    let mut len = name.len() as u32;
    let status = unsafe { GetCurrentPackageFamilyName(&mut len, Some(PWSTR(name.as_mut_ptr()))) };
    status == ERROR_SUCCESS
        && len > 1
        && len as usize <= name.len()
        && String::from_utf16_lossy(&name[..len as usize - 1]).eq_ignore_ascii_case(STORE_FAMILY)
}

fn registry_string(field: PCWSTR) -> Option<String> {
    let mut buf = [0_u16; 1024];
    let mut bytes = std::mem::size_of_val(&buf) as u32;
    let status = unsafe {
        RegGetValueW(
            HKEY_CURRENT_USER,
            LEGACY_UNINSTALL_KEY,
            field,
            RRF_RT_REG_SZ,
            None,
            Some(buf.as_mut_ptr().cast()),
            Some(&mut bytes),
        )
    };
    let len = (bytes / 2) as usize;
    if status != ERROR_SUCCESS || len < 2 || len > buf.len() || buf[len - 1] != 0 {
        return None;
    }
    String::from_utf16(&buf[..len - 1]).ok()
}

fn known_legacy_files(version: &str) -> Option<&'static [(&'static str, &'static str)]> {
    // SHA-256 values extracted from the published x64 NSIS release assets.
    match version {
        "10.2.8" => Some(&[(
            "app.exe",
            "9113397c153afc3866816bb1023d0c4c51d4314a6d35062dfcc0c205fccc562b",
        )]),
        "10.2.12" => Some(&[(
            "app.exe",
            "bbfb27442a4a46fd5989d0b87a0f2960981a060c0f8edb0918260c8632a1c7f7",
        )]),
        "10.2.13" => Some(&[
            (
                "app.exe",
                "c6a432fff64a2d012a64322b3cb0512802acdcd61d59a30e9178432904bb9cf1",
            ),
            (
                "CaiyunQwenCpu.exe",
                "9fa607bce18b29dcfc39d34bb7078fbe4adb34ce25995b32df1040f9027d0f13",
            ),
            (
                "SpeechCpuThirdPartyNotices.txt",
                "dc3b03f49bbb3f3760662c2a6b81682e7a55907d620821f54dadd57d01c15f95",
            ),
        ]),
        _ => None,
    }
}

fn matches_registered_path(field: PCWSTR, expected: &Path) -> bool {
    registry_string(field).is_some_and(|value| {
        let path = value
            .strip_prefix('"')
            .and_then(|value| value.strip_suffix('"'))
            .unwrap_or(&value);
        path.eq_ignore_ascii_case(&expected.to_string_lossy())
    })
}

fn matches_legacy_registration(dir: &Path, version: &str) -> bool {
    registry_string(w!("DisplayVersion")).as_deref() == Some(version)
        && registry_string(w!("MainBinaryName")).as_deref() == Some("app.exe")
        && matches_registered_path(w!("InstallLocation"), dir)
        && matches_registered_path(w!("UninstallString"), &dir.join("uninstall.exe"))
}

fn is_plain_directory(dir: &Path) -> bool {
    fs::symlink_metadata(dir)
        .is_ok_and(|metadata| metadata.is_dir() && metadata.file_attributes() & REPARSE_POINT == 0)
}

fn is_verified_program_dir(dir: &Path, expected: &[(&str, &str)]) -> bool {
    if !is_plain_directory(dir) {
        return false;
    }
    let Ok(entries) = fs::read_dir(dir).and_then(|entries| entries.collect::<Result<Vec<_>, _>>())
    else {
        return false;
    };
    if entries.len() != expected.len() + 1
        || !entries.iter().all(|entry| {
            fs::symlink_metadata(entry.path()).is_ok_and(|metadata| {
                metadata.is_file()
                    && metadata.file_attributes() & REPARSE_POINT == 0
                    && metadata.len() <= 64 * 1024 * 1024
            })
        })
    {
        return false;
    }
    dir.join("uninstall.exe").is_file()
        && expected.iter().all(|(file, hash)| {
            fs::read(dir.join(file)).is_ok_and(|bytes| hex::encode(Sha256::digest(bytes)) == *hash)
        })
}

#[tauri::command]
pub fn has_legacy_windows_install() -> bool {
    is_packaged_caiyun()
        && supports_targeted_virtualization()
        && registry_string(w!("UninstallString")).is_some()
}

fn retire_registered_legacy() -> Result<bool, String> {
    let _lock = RETIRE_LOCK
        .lock()
        .map_err(|_| "Legacy migration lock failed")?;
    if !is_packaged_caiyun() || !supports_targeted_virtualization() {
        return Ok(false);
    }
    let Some(version) = registry_string(w!("DisplayVersion")) else {
        return Ok(false);
    };
    let Some(files) = known_legacy_files(&version) else {
        return Ok(false);
    };
    let Some(local) = std::env::var_os("LOCALAPPDATA").map(PathBuf::from) else {
        return Ok(false);
    };
    if !local.is_absolute() {
        return Ok(false);
    }
    let dir = local.join("彩云笔记");
    let backup_root = local.join(format!("彩云笔记.legacy-program-{version}"));
    let backup = backup_root.join("program");
    let exe = dir.join("app.exe");
    if !matches_legacy_registration(&dir, &version) {
        return Ok(false);
    }
    let registration = LegacyRegistration::open_for_delete()?;
    // MSIX may create the excluded directory at install. Place the
    // recoverable program under it so an empty directory is not a collision.
    match fs::create_dir(&backup_root) {
        Ok(()) => (),
        Err(error) if error.kind() == std::io::ErrorKind::AlreadyExists => (),
        Err(error) => return Err(format!("Legacy backup directory creation failed: {error}")),
    }
    if !is_plain_directory(&backup_root) {
        return Err("Legacy backup directory is not a plain directory".into());
    }
    // The old NSIS uninstaller can terminate any app.exe by process name.
    // Retire only the verified program directory and its registration. The
    // sibling com.caiyun.notes data folders and migrated pins are independent.
    let target = if dir.exists() {
        exe
    } else {
        backup.join("app.exe")
    };
    let _program_guard = match super::windows_legacy_program_lock::lock_program(&target) {
        Ok(file) => file,
        Err(error) if matches!(error.raw_os_error(), Some(32 | 33)) => return Ok(false),
        Err(error) => return Err(format!("Legacy executable lock failed: {error}")),
    };
    if dir.exists() {
        if backup.exists() {
            return Err("Legacy program and backup both exist".into());
        }
        if !is_verified_program_dir(&dir, files) {
            return Err("Legacy program directory could not be verified".into());
        }
        fs::rename(&dir, &backup)
            .map_err(|error| format!("Legacy program move failed: {error}"))?;
    } else if !is_verified_program_dir(&backup, files) {
        return Err("Legacy program and verified backup are unavailable".into());
    }
    let retired = (|| {
        if !is_verified_program_dir(&backup, files) {
            return Err("Legacy program backup could not be verified after the move".into());
        }
        if !matches_legacy_registration(&dir, &version) {
            return Err("Legacy installation registration changed during retirement".into());
        }
        registration.delete()?;
        if registry_string(w!("UninstallString")).is_some() {
            return Err("Legacy registration still visible after removal".into());
        }
        Ok(true)
    })();
    if !matches!(retired, Ok(true)) && !dir.exists() {
        fs::rename(&backup, &dir)
            .map_err(|error| format!("Legacy program rollback failed: {error}"))?;
    }
    retired
}

#[tauri::command]
pub async fn retire_legacy_windows_install(window: tauri::WebviewWindow) -> Result<bool, String> {
    if window.label() != "main" {
        return Ok(false);
    }
    tauri::async_runtime::spawn_blocking(retire_registered_legacy)
        .await
        .map_err(|error| error.to_string())?
}
