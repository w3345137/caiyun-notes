//! A write-only bridge to the OS Downloads directory. The renderer never chooses a path.
use base64::{engine::general_purpose::STANDARD, Engine};
use serde::Serialize;
use std::{io::Write, path::Path};
use tauri::Manager;

const MAX_DOWNLOAD_BYTES: usize = 100 * 1024 * 1024;
const MAX_NAME_BYTES: usize = 180;

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub struct SavedDownload {
    file_name: String,
    bytes: usize,
}

fn safe_file_name(input: &str) -> String {
    let cleaned: String = input
        .chars()
        .map(|c| {
            if c.is_control() || "/\\:*?\"<>|".contains(c) {
                '_'
            } else {
                c
            }
        })
        .collect();
    let cleaned = cleaned.trim().trim_matches('.').trim();
    let mut name = if cleaned.is_empty() {
        "attachment".to_owned()
    } else {
        cleaned.to_owned()
    };
    let base = name
        .split('.')
        .next()
        .unwrap_or("")
        .trim()
        .to_ascii_uppercase();
    if matches!(base.as_str(), "CON" | "PRN" | "AUX" | "NUL")
        || (base.len() == 4
            && (base.starts_with("COM") || base.starts_with("LPT"))
            && matches!(base.as_bytes()[3], b'1'..=b'9'))
    {
        name.insert(0, '_');
    }
    if name.len() > MAX_NAME_BYTES {
        let (stem, ext) = split_extension(&name);
        let mut kept = String::new();
        for c in stem.chars() {
            if kept.len() + c.len_utf8() + ext.len() > MAX_NAME_BYTES {
                break;
            }
            kept.push(c);
        }
        name = format!("{kept}{ext}");
    }
    name
}

fn split_extension(name: &str) -> (&str, &str) {
    match name.rfind('.') {
        Some(index) if index > 0 && name.len() - index <= 20 => (&name[..index], &name[index..]),
        _ => (name, ""),
    }
}

fn save_into_dir(directory: &Path, name: &str, data: &[u8]) -> Result<SavedDownload, String> {
    if data.len() > MAX_DOWNLOAD_BYTES {
        return Err("download_too_large".into());
    }
    // Do not invent a fallback app-private directory: success must mean real Downloads.
    if !directory.is_dir() {
        return Err("downloads_directory_unavailable".into());
    }
    let name = safe_file_name(name);
    let (stem, ext) = split_extension(&name);
    let mut temporary = tempfile::Builder::new()
        .prefix(".caiyun-download-")
        .tempfile_in(directory)
        .map_err(|_| "download_write_failed".to_string())?;
    temporary
        .write_all(data)
        .map_err(|_| "download_write_failed".to_string())?;
    temporary
        .as_file()
        .sync_all()
        .map_err(|_| "download_write_failed".to_string())?;
    for number in 0..10_000 {
        let file_name = if number == 0 {
            name.clone()
        } else {
            format!("{stem} ({number}){ext}")
        };
        // Atomic no-clobber handles concurrent clicks and existing files/symlinks safely.
        match temporary.persist_noclobber(directory.join(&file_name)) {
            Ok(_) => {
                return Ok(SavedDownload {
                    file_name,
                    bytes: data.len(),
                })
            }
            Err(error) if error.error.kind() == std::io::ErrorKind::AlreadyExists => {
                temporary = error.file;
            }
            Err(_) => return Err("download_write_failed".into()),
        }
    }
    Err("download_name_conflict".into())
}

fn request_bytes(body: &tauri::ipc::InvokeBody) -> Result<Vec<u8>, String> {
    match body {
        tauri::ipc::InvokeBody::Raw(data) if data.len() <= MAX_DOWNLOAD_BYTES => Ok(data.clone()),
        tauri::ipc::InvokeBody::Raw(_) => Err("download_too_large".into()),
        // WebKit can reject custom-protocol fetch and Tauri then uses postMessage.
        // That transport serializes Uint8Array as a JSON array, not InvokeBody::Raw.
        tauri::ipc::InvokeBody::Json(serde_json::Value::Array(data))
            if data.len() <= MAX_DOWNLOAD_BYTES =>
        {
            data.iter()
                .map(|byte| {
                    byte.as_u64()
                        .filter(|value| *value <= 255)
                        .map(|value| value as u8)
                        .ok_or_else(|| "download_invalid_body".to_string())
                })
                .collect()
        }
        tauri::ipc::InvokeBody::Json(serde_json::Value::Array(_)) => {
            Err("download_too_large".into())
        }
        _ => Err("download_invalid_body".into()),
    }
}

#[tauri::command]
pub async fn save_download_file(
    app: tauri::AppHandle,
    webview: tauri::Webview,
    request: tauri::ipc::Request<'_>,
) -> Result<SavedDownload, String> {
    if webview.label() != "main" {
        return Err("download_not_allowed".into());
    }
    let name_header = request
        .headers()
        .get("x-caiyun-download-name")
        .and_then(|header| header.to_str().ok())
        .ok_or("download_invalid_name")?;
    if name_header.len() > 8192 {
        return Err("download_invalid_name".into());
    }
    let name = STANDARD
        .decode(name_header)
        .ok()
        .and_then(|bytes| String::from_utf8(bytes).ok())
        .ok_or("download_invalid_name")?;
    let data = request_bytes(request.body())?;
    let directory = app
        .path()
        .download_dir()
        .map_err(|_| "downloads_directory_unavailable")?;
    tauri::async_runtime::spawn_blocking(move || save_into_dir(&directory, &name, &data))
        .await
        .map_err(|_| "download_write_failed".to_string())?
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn raw_and_webkit_fallback_are_byte_identical_and_strict() {
        use tauri::ipc::InvokeBody;
        assert_eq!(
            request_bytes(&InvokeBody::Raw(vec![0, 255, 42])).unwrap(),
            [0, 255, 42]
        );
        assert_eq!(
            request_bytes(&InvokeBody::Json(serde_json::json!([0, 255, 42]))).unwrap(),
            [0, 255, 42]
        );
        for json in [
            serde_json::json!([256]),
            serde_json::json!([-1]),
            serde_json::json!([1.5]),
            serde_json::json!(["1"]),
            serde_json::json!({"path":"/outside"}),
        ] {
            assert!(request_bytes(&InvokeBody::Json(json)).is_err());
        }
    }

    #[test]
    fn exact_bytes_collision_and_zero_length() {
        let dir = tempfile::tempdir().unwrap();
        let data = [0, 255, 10, 13, 42];
        let first = save_into_dir(dir.path(), "发票.pdf", &data).unwrap();
        let second = save_into_dir(dir.path(), "发票.pdf", b"second").unwrap();
        assert_eq!(first.bytes, data.len());
        assert_eq!(second.file_name, "发票 (1).pdf");
        assert_eq!(std::fs::read(dir.path().join("发票.pdf")).unwrap(), data);
        assert_eq!(save_into_dir(dir.path(), "empty", b"").unwrap().bytes, 0);
        assert_eq!(std::fs::read_dir(dir.path()).unwrap().count(), 3);
    }

    #[test]
    fn untrusted_names_cannot_choose_paths() {
        let dir = tempfile::tempdir().unwrap();
        for name in [
            "../../escape.pdf",
            "C:\\outside.zip",
            "..",
            "\0\n",
            "CON.txt",
            "LPT1.pdf",
            "　",
        ] {
            let saved = save_into_dir(dir.path(), name, b"test").unwrap();
            assert_eq!(Path::new(&saved.file_name).components().count(), 1);
            assert!(dir.path().join(saved.file_name).is_file());
        }
        assert_eq!(safe_file_name(".."), "attachment");
        assert_eq!(safe_file_name("CON.txt"), "_CON.txt");
        assert_eq!(safe_file_name("normal.pdf"), "normal.pdf");
        let long = safe_file_name(&format!("{}.pdf", "长".repeat(200)));
        assert!(long.len() <= MAX_NAME_BYTES);
        assert!(long.ends_with(".pdf"));
    }

    #[test]
    fn concurrent_saves_do_not_overwrite() {
        let dir = tempfile::tempdir().unwrap();
        let handles: Vec<_> = (0..12)
            .map(|i| {
                let path = dir.path().to_owned();
                std::thread::spawn(move || {
                    let saved = save_into_dir(&path, "file.zip", &[i]).unwrap();
                    assert_eq!(std::fs::read(path.join(&saved.file_name)).unwrap(), [i]);
                    saved.file_name
                })
            })
            .collect();
        let mut names: Vec<_> = handles.into_iter().map(|h| h.join().unwrap()).collect();
        names.sort();
        names.dedup();
        assert_eq!(names.len(), 12);
        assert_eq!(std::fs::read_dir(dir.path()).unwrap().count(), 12);
    }

    #[test]
    fn missing_directory_is_not_a_false_success() {
        let dir = tempfile::tempdir().unwrap();
        assert!(save_into_dir(&dir.path().join("missing"), "file", b"data").is_err());
        assert_eq!(std::fs::read_dir(dir.path()).unwrap().count(), 0);
    }

    #[cfg(unix)]
    #[test]
    fn existing_symlink_is_never_followed_or_replaced() {
        let dir = tempfile::tempdir().unwrap();
        let original = dir.path().join("original");
        std::fs::write(&original, "original").unwrap();
        std::os::unix::fs::symlink(&original, dir.path().join("file.pdf")).unwrap();
        let saved = save_into_dir(dir.path(), "file.pdf", b"new").unwrap();
        assert_eq!(saved.file_name, "file (1).pdf");
        assert_eq!(std::fs::read(original).unwrap(), b"original");
    }
}
