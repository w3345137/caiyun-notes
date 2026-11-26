// Only built into direct Windows shells. The webview cannot supply a command or URL.
use std::os::windows::process::CommandExt;
use std::process::{Command, Stdio};
use std::sync::atomic::{AtomicBool, Ordering};

static RUNNING: AtomicBool = AtomicBool::new(false);

#[link(name = "kernel32")]
extern "system" {
    fn GetSystemDirectoryW(buffer: *mut u16, size: u32) -> u32;
}

fn acquire(minimum: String) -> &'static str {
    let mut buffer = [0u16; 260];
    let size = unsafe { GetSystemDirectoryW(buffer.as_mut_ptr(), buffer.len() as u32) } as usize;
    if size == 0 || size >= buffer.len() {
        return "unavailable";
    }
    let system = std::path::PathBuf::from(String::from_utf16_lossy(&buffer[..size]));
    let result = Command::new(system.join(r"WindowsPowerShell\v1.0\powershell.exe"))
        .args([
            "-NoProfile",
            "-NonInteractive",
            "-Command",
            include_str!("windows_store_acquisition.ps1"),
        ])
        .env("CAIYUN_STORE_MINIMUM", minimum)
        .creation_flags(0x08000000)
        .stdin(Stdio::null())
        .stdout(Stdio::null())
        .stderr(Stdio::null())
        .status();
    if result.is_ok_and(|status| status.success()) {
        "ready"
    } else {
        "unavailable"
    }
}

#[tauri::command]
pub async fn acquire_windows_store_update(minimum: String) -> Result<&'static str, String> {
    let mut parts = minimum
        .split('.')
        .map(str::parse::<u16>)
        .collect::<Result<Vec<_>, _>>()
        .map_err(|_| "Invalid Store version")?;
    if !(3..=4).contains(&parts.len()) {
        return Err("Invalid Store version".into());
    }
    parts.resize(4, 0);
    if parts.as_slice() < [10, 2, 18, 0].as_slice() {
        return Err("Unsupported Store version".into());
    }
    if RUNNING.swap(true, Ordering::AcqRel) {
        return Ok("busy");
    }
    let job = tauri::async_runtime::spawn_blocking(move || {
        let result = acquire(
            parts
                .iter()
                .map(u16::to_string)
                .collect::<Vec<_>>()
                .join("."),
        );
        RUNNING.store(false, Ordering::Release);
        result
    });
    // A slow Microsoft installation may still finish. Never start another installer over it.
    match tokio::time::timeout(std::time::Duration::from_secs(120), job).await {
        Ok(result) => result.map_err(|e| e.to_string()),
        Err(_) => Ok("busy"),
    }
}
