use serde::Serialize;
use std::collections::BTreeMap;
use tauri::AppHandle;

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub struct ModelStatus {
    installed: bool,
    downloaded_bytes: u64,
    total_bytes: u64,
    directory: String,
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub struct SpeechStatus {
    protocol: u8,
    engine: &'static str,
    available: bool,
    busy: bool,
    models: BTreeMap<String, ModelStatus>,
}

#[tauri::command]
pub fn qwen_models(app: AppHandle) -> SpeechStatus {
    #[cfg(any(target_os = "macos", target_os = "windows"))]
    return desktop::status(&app);
    #[cfg(not(any(target_os = "macos", target_os = "windows")))]
    {
        let _ = app;
        SpeechStatus {
            protocol: 2,
            engine: "unsupported",
            available: false,
            busy: false,
            models: BTreeMap::new(),
        }
    }
}

#[tauri::command]
pub async fn qwen_verify(app: AppHandle, model: String) -> Result<(), String> {
    #[cfg(any(target_os = "macos", target_os = "windows"))]
    return desktop::verify(&app, &model).await;
    #[cfg(not(any(target_os = "macos", target_os = "windows")))]
    {
        let _ = (app, model);
        Err("QWEN_UNAVAILABLE".into())
    }
}

#[tauri::command]
pub fn qwen_open_folder(app: AppHandle, model: String) -> Result<(), String> {
    #[cfg(any(target_os = "macos", target_os = "windows"))]
    return desktop::open_folder(&app, &model);
    #[cfg(not(any(target_os = "macos", target_os = "windows")))]
    {
        let _ = (app, model);
        Err("QWEN_UNAVAILABLE".into())
    }
}

#[tauri::command]
pub async fn qwen_remove(app: AppHandle, model: String) -> Result<(), String> {
    #[cfg(any(target_os = "macos", target_os = "windows"))]
    return desktop::remove(&app, &model).await;
    #[cfg(not(any(target_os = "macos", target_os = "windows")))]
    {
        let _ = (app, model);
        Err("QWEN_UNAVAILABLE".into())
    }
}

#[tauri::command]
pub async fn qwen_transcribe(app: AppHandle, model: String, pcm: String) -> Result<String, String> {
    #[cfg(any(target_os = "macos", target_os = "windows"))]
    return desktop::transcribe(&app, &model, pcm).await;
    #[cfg(not(any(target_os = "macos", target_os = "windows")))]
    {
        let _ = (app, model, pcm);
        Err("QWEN_UNAVAILABLE".into())
    }
}

#[cfg(any(target_os = "macos", target_os = "windows"))]
mod desktop {
    use super::*;
    use crate::speech_model::{catalog, installed, verify_directory};
    use base64::{engine::general_purpose::STANDARD, Engine as _};
    use serde::Deserialize;
    use std::{
        io::Write,
        path::{Path, PathBuf},
        time::Duration,
    };
    use tauri::Manager;
    use tauri_plugin_shell::ShellExt;
    use tokio::sync::Mutex;

    const MAX_PCM_BYTES: usize = 16_000 * 2 * 55;
    static JOB: Mutex<()> = Mutex::const_new(());

    fn root(app: &AppHandle) -> Result<PathBuf, String> {
        app.path()
            .app_local_data_dir()
            .map(|path| path.join("speech-models").join(runtime().0))
            .map_err(|_| "QWEN_STORAGE".into())
    }

    fn runtime() -> (&'static str, Option<PathBuf>) {
        let executable = std::env::current_exe().ok();
        #[cfg(all(target_os = "macos", target_arch = "aarch64"))]
        {
            let mlx = executable
                .as_ref()
                .map(|exe| exe.with_file_name("CaiyunQwen"));
            if mlx.as_ref().is_some_and(|path| path.is_file()) {
                return ("mlx", mlx);
            }
        }
        let cpu = executable.map(|exe| {
            exe.with_file_name(if cfg!(target_os = "windows") {
                "CaiyunQwenCpu.exe"
            } else {
                "CaiyunQwenCpu"
            })
        });
        if cpu.as_ref().is_some_and(|path| path.is_file()) {
            return ("cpu", cpu);
        }
        (
            if cfg!(all(target_os = "macos", target_arch = "aarch64")) {
                "mlx"
            } else {
                "cpu"
            },
            None,
        )
    }

    fn size(path: &Path) -> u64 {
        std::fs::metadata(path)
            .ok()
            .filter(|meta| meta.is_file())
            .map_or(0, |meta| meta.len())
    }

    pub fn status(app: &AppHandle) -> SpeechStatus {
        let root = root(app).ok();
        let (engine, helper) = runtime();
        SpeechStatus {
            protocol: 2,
            engine,
            available: helper.is_some() && root.is_some(),
            busy: JOB.try_lock().is_err(),
            models: catalog(engine == "mlx")
                .iter()
                .map(|(id, model)| {
                    let total_bytes = model.files.iter().map(|file| file.bytes).sum();
                    let ready = root
                        .as_ref()
                        .is_some_and(|root| installed(&root.join(id), model));
                    let downloaded_bytes = root.as_ref().map_or(0, |root| {
                        model
                            .files
                            .iter()
                            .map(|file| size(&root.join(id).join(&file.name)))
                            .sum()
                    });
                    (
                        id.clone(),
                        ModelStatus {
                            installed: ready,
                            downloaded_bytes,
                            total_bytes,
                            directory: root
                                .as_ref()
                                .map(|root| root.join(id).to_string_lossy().to_string())
                                .unwrap_or_default(),
                        },
                    )
                })
                .collect(),
        }
    }

    pub async fn verify(app: &AppHandle, id: &str) -> Result<(), String> {
        let _job = JOB.try_lock().map_err(|_| "QWEN_BUSY")?;
        let (engine, helper) = runtime();
        if helper.is_none() {
            return Err("QWEN_UNAVAILABLE".into());
        }
        let model = catalog(engine == "mlx")
            .remove(id)
            .ok_or("QWEN_UNKNOWN_MODEL")?;
        let directory = root(app)?.join(id);
        tauri::async_runtime::spawn_blocking(move || verify_directory(&directory, &model))
            .await
            .map_err(|_| "QWEN_STORAGE")?
    }

    #[allow(deprecated)] // Keep compatibility with the shell plugin already shipped by this app.
    pub fn open_folder(app: &AppHandle, id: &str) -> Result<(), String> {
        catalog(runtime().0 == "mlx")
            .get(id)
            .ok_or("QWEN_UNKNOWN_MODEL")?;
        let directory = root(app)?.join(id);
        std::fs::create_dir_all(&directory).map_err(|_| "QWEN_STORAGE")?;
        app.shell()
            .open(directory.to_string_lossy().to_string(), None)
            .map_err(|_| "QWEN_STORAGE".to_string())
    }

    pub async fn remove(app: &AppHandle, id: &str) -> Result<(), String> {
        let _job = JOB.try_lock().map_err(|_| "QWEN_BUSY")?;
        catalog(runtime().0 == "mlx")
            .get(id)
            .ok_or("QWEN_UNKNOWN_MODEL")?;
        let root = root(app)?;
        match tokio::fs::remove_dir_all(root.join(id)).await {
            Ok(()) => {}
            Err(error) if error.kind() == std::io::ErrorKind::NotFound => {}
            Err(_) => return Err("QWEN_STORAGE".into()),
        }
        Ok(())
    }

    #[derive(Deserialize)]
    struct Transcript {
        text: String,
    }

    pub async fn transcribe(app: &AppHandle, id: &str, pcm: String) -> Result<String, String> {
        let _job = JOB.try_lock().map_err(|_| "QWEN_BUSY")?;
        let (engine, executable) = runtime();
        let model = catalog(engine == "mlx")
            .remove(id)
            .ok_or("QWEN_UNKNOWN_MODEL")?;
        let executable = executable.ok_or("QWEN_UNAVAILABLE")?;
        let directory = root(app)?.join(id);
        if !installed(&directory, &model) {
            return Err("QWEN_MODEL_UNAVAILABLE".into());
        }
        if pcm.len() > MAX_PCM_BYTES.div_ceil(3) * 4 {
            return Err("INVALID_SPEECH_AUDIO".into());
        }
        let audio = STANDARD.decode(pcm).map_err(|_| "INVALID_SPEECH_AUDIO")?;
        if audio.is_empty() || audio.len() > MAX_PCM_BYTES || audio.len() % 2 != 0 {
            return Err("INVALID_SPEECH_AUDIO".into());
        }
        let mut wave = tempfile::Builder::new()
            .suffix(".wav")
            .tempfile()
            .map_err(|_| "QWEN_STORAGE")?;
        write_wave(&mut wave, &audio).map_err(|_| "QWEN_STORAGE")?;
        let mut child = tokio::process::Command::new(&executable);
        child.arg(directory).arg(wave.path()).kill_on_drop(true);
        #[cfg(target_os = "windows")]
        child.creation_flags(0x08000000); // CREATE_NO_WINDOW: keep helper console hidden.
        let timeout = if engine == "cpu" { 900 } else { 180 };
        let output = tokio::time::timeout(Duration::from_secs(timeout), child.output())
            .await
            .map_err(|_| "QWEN_TIMEOUT")?
            .map_err(|_| "QWEN_INFERENCE")?;
        if !output.status.success() {
            return Err("QWEN_INFERENCE".into());
        }
        String::from_utf8_lossy(&output.stdout)
            .lines()
            .rev()
            .find_map(|line| serde_json::from_str::<Transcript>(line).ok())
            .map(|result| result.text)
            .ok_or_else(|| "QWEN_INFERENCE".into())
    }

    fn write_wave(output: &mut impl Write, pcm: &[u8]) -> std::io::Result<()> {
        let bytes = pcm.len() as u32;
        output.write_all(b"RIFF")?;
        output.write_all(&(36 + bytes).to_le_bytes())?;
        output.write_all(b"WAVEfmt ")?;
        output.write_all(&16u32.to_le_bytes())?;
        output.write_all(&1u16.to_le_bytes())?; // PCM
        output.write_all(&1u16.to_le_bytes())?; // Mono
        output.write_all(&16_000u32.to_le_bytes())?;
        output.write_all(&32_000u32.to_le_bytes())?;
        output.write_all(&2u16.to_le_bytes())?;
        output.write_all(&16u16.to_le_bytes())?;
        output.write_all(b"data")?;
        output.write_all(&bytes.to_le_bytes())?;
        output.write_all(pcm)?;
        output.flush()
    }
}
