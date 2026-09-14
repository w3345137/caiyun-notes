use base64::Engine;
use futures_util::StreamExt;
use minisign_verify::{PublicKey, Signature};
use reqwest::header::{ACCEPT, CONTENT_LENGTH, CONTENT_RANGE, ETAG, IF_RANGE, RANGE};
use serde::Serialize;
use std::{fs::OpenOptions, io::Write, path::PathBuf, time::Duration};
use tauri::{Emitter, Manager};
use tauri_plugin_updater::UpdaterExt;

const UPDATE_PROGRESS_EVENT: &str = "caiyun-update-progress";
const UPDATER_PUBLIC_KEY: &str = "dW50cnVzdGVkIGNvbW1lbnQ6IG1pbmlzaWduIHB1YmxpYyBrZXk6IEMxNzI5OEQ3M0M5MjYyQzEKUldUQllwSTgxNWh5d1JKQ3p3dFJOcTNxRmdIZHBNY2F0WDJaVVczRWh5SHR1b0ZVL2Y4eVNkUEcK";
const MAX_DOWNLOAD_ATTEMPTS: usize = 6;

#[derive(Clone, Serialize)]
#[serde(rename_all = "camelCase")]
struct UpdateProgress {
    phase: &'static str,
    downloaded_bytes: u64,
    total_bytes: Option<u64>,
    attempt: usize,
}

#[derive(serde::Deserialize, serde::Serialize, Default)]
struct PartialMetadata {
    url: String,
    etag: Option<String>,
    total_bytes: Option<u64>,
}

fn decode_minisign(value: &str) -> Result<String, String> {
    let bytes = base64::engine::general_purpose::STANDARD
        .decode(value)
        .map_err(|error| format!("更新签名 Base64 无效：{error}"))?;
    String::from_utf8(bytes).map_err(|_| "更新签名不是有效文本".to_string())
}

fn verify_package(bytes: &[u8], release_signature: &str) -> Result<(), String> {
    let public_key = PublicKey::decode(&decode_minisign(UPDATER_PUBLIC_KEY)?)
        .map_err(|error| format!("更新公钥无效：{error}"))?;
    let signature = Signature::decode(&decode_minisign(release_signature)?)
        .map_err(|error| format!("更新签名无效：{error}"))?;
    public_key
        .verify(bytes, &signature, true)
        .map_err(|error| format!("更新包签名校验失败：{error}"))
}

fn partial_paths(
    app: &tauri::AppHandle,
    version: &str,
    target: &str,
) -> Result<(PathBuf, PathBuf), String> {
    let safe = format!("{}-{}", version, target)
        .chars()
        .map(|value| {
            if value.is_ascii_alphanumeric() || matches!(value, '.' | '-') {
                value
            } else {
                '_'
            }
        })
        .collect::<String>();
    let root = app
        .path()
        .app_cache_dir()
        .map_err(|error| error.to_string())?
        .join("updates");
    std::fs::create_dir_all(&root).map_err(|error| error.to_string())?;
    Ok((
        root.join(format!("{safe}.part")),
        root.join(format!("{safe}.json")),
    ))
}

fn parse_total(response: &reqwest::Response, offset: u64) -> Option<u64> {
    if let Some(range) = response
        .headers()
        .get(CONTENT_RANGE)
        .and_then(|value| value.to_str().ok())
    {
        if let Some(total) = range
            .rsplit('/')
            .next()
            .and_then(|value| value.parse::<u64>().ok())
        {
            return Some(total);
        }
    }
    response
        .headers()
        .get(CONTENT_LENGTH)
        .and_then(|value| value.to_str().ok())
        .and_then(|value| value.parse::<u64>().ok())
        .map(|length| length.saturating_add(offset))
}

#[tauri::command]
pub async fn download_and_install_resumable_update(app: tauri::AppHandle) -> Result<(), String> {
    let update = app
        .updater()
        .map_err(|error| error.to_string())?
        .check()
        .await
        .map_err(|error| format!("检查更新失败：{error}"))?
        .ok_or_else(|| "当前已经是最新版本".to_string())?;
    let (partial_path, metadata_path) = partial_paths(&app, &update.version, &update.target)?;
    let url = update.download_url.to_string();
    let mut metadata = std::fs::read(&metadata_path)
        .ok()
        .and_then(|bytes| serde_json::from_slice::<PartialMetadata>(&bytes).ok())
        .filter(|value| value.url == url)
        .unwrap_or_default();
    if metadata.url != url {
        let _ = std::fs::remove_file(&partial_path);
        metadata = PartialMetadata {
            url: url.clone(),
            etag: None,
            total_bytes: None,
        };
    }

    let client = reqwest::Client::builder()
        .connect_timeout(Duration::from_secs(15))
        .read_timeout(Duration::from_secs(45))
        .redirect(reqwest::redirect::Policy::limited(8))
        .build()
        .map_err(|error| error.to_string())?;
    let mut completed = false;
    let mut last_error = String::new();

    for attempt in 1..=MAX_DOWNLOAD_ATTEMPTS {
        let offset = std::fs::metadata(&partial_path)
            .map(|value| value.len())
            .unwrap_or(0);
        if offset > 0 && metadata.total_bytes == Some(offset) {
            completed = true;
            break;
        }
        let mut request = client.get(&url).header(ACCEPT, "application/octet-stream");
        if offset > 0 {
            request = request.header(RANGE, format!("bytes={offset}-"));
            if let Some(etag) = metadata.etag.as_deref() {
                request = request.header(IF_RANGE, etag);
            }
        }
        match request.send().await {
            Ok(response) if response.status().is_success() => {
                let valid_content_range = response
                    .headers()
                    .get(CONTENT_RANGE)
                    .and_then(|value| value.to_str().ok())
                    .map(|value| value.starts_with(&format!("bytes {offset}-")))
                    .unwrap_or(false);
                let resumed = offset > 0
                    && response.status() == reqwest::StatusCode::PARTIAL_CONTENT
                    && valid_content_range;
                let write_offset = if resumed { offset } else { 0 };
                if !resumed && offset > 0 {
                    let _ = std::fs::remove_file(&partial_path);
                }
                metadata.etag = response
                    .headers()
                    .get(ETAG)
                    .and_then(|value| value.to_str().ok())
                    .map(str::to_string);
                std::fs::write(
                    &metadata_path,
                    serde_json::to_vec(&metadata).map_err(|error| error.to_string())?,
                )
                .map_err(|error| error.to_string())?;
                let total = parse_total(&response, write_offset);
                metadata.total_bytes = total;
                std::fs::write(
                    &metadata_path,
                    serde_json::to_vec(&metadata).map_err(|error| error.to_string())?,
                )
                .map_err(|error| error.to_string())?;
                let mut downloaded = write_offset;
                let mut file = OpenOptions::new()
                    .create(true)
                    .write(true)
                    .append(resumed)
                    .truncate(!resumed)
                    .open(&partial_path)
                    .map_err(|error| error.to_string())?;
                let _ = app.emit(
                    UPDATE_PROGRESS_EVENT,
                    UpdateProgress {
                        phase: "downloading",
                        downloaded_bytes: downloaded,
                        total_bytes: total,
                        attempt,
                    },
                );
                let mut stream = response.bytes_stream();
                let mut stream_failed = false;
                while let Some(chunk) = stream.next().await {
                    match chunk {
                        Ok(chunk) => {
                            file.write_all(&chunk).map_err(|error| error.to_string())?;
                            downloaded = downloaded.saturating_add(chunk.len() as u64);
                            let _ = app.emit(
                                UPDATE_PROGRESS_EVENT,
                                UpdateProgress {
                                    phase: "downloading",
                                    downloaded_bytes: downloaded,
                                    total_bytes: total,
                                    attempt,
                                },
                            );
                        }
                        Err(error) => {
                            last_error = error.to_string();
                            stream_failed = true;
                            break;
                        }
                    }
                }
                file.sync_all().map_err(|error| error.to_string())?;
                if !stream_failed && total.map(|value| value == downloaded).unwrap_or(true) {
                    completed = true;
                    break;
                }
                if !stream_failed {
                    last_error = format!("更新包下载不完整（{downloaded}/{}）", total.unwrap_or(0));
                }
            }
            Ok(response) => last_error = format!("下载服务返回 {}", response.status()),
            Err(error) => last_error = error.to_string(),
        }
        if attempt < MAX_DOWNLOAD_ATTEMPTS {
            tokio::time::sleep(Duration::from_millis(
                500 * (1_u64 << (attempt - 1)).min(16),
            ))
            .await;
        }
    }
    if !completed {
        return Err(format!("弱网续传仍未完成：{last_error}"));
    }

    let bytes = std::fs::read(&partial_path).map_err(|error| error.to_string())?;
    if let Err(error) = verify_package(&bytes, &update.signature) {
        let _ = std::fs::remove_file(&partial_path);
        let _ = std::fs::remove_file(&metadata_path);
        return Err(error);
    }
    let _ = app.emit(
        UPDATE_PROGRESS_EVENT,
        UpdateProgress {
            phase: "installing",
            downloaded_bytes: bytes.len() as u64,
            total_bytes: Some(bytes.len() as u64),
            attempt: 0,
        },
    );
    update
        .install(&bytes)
        .map_err(|error| format!("安装更新失败：{error}"))?;
    let _ = std::fs::remove_file(partial_path);
    let _ = std::fs::remove_file(metadata_path);
    Ok(())
}
