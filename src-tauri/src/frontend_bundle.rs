use base64::{engine::general_purpose::STANDARD as BASE64, Engine as _};
use ed25519_dalek::{Signature, Verifier, VerifyingKey};
use semver::Version;
use serde::{Deserialize, Serialize};
use sha2::{Digest, Sha256};
use std::borrow::Cow;
use std::collections::BTreeSet;
use std::fs::{self, File};
use std::io::{self, Cursor, Read, Write};
use std::path::{Component, Path, PathBuf};
use std::sync::{
    atomic::{AtomicBool, Ordering},
    Arc, RwLock,
};
use std::time::Duration;
use tauri::http::{
    header::{CACHE_CONTROL, CONTENT_ENCODING, CONTENT_LENGTH, CONTENT_TYPE, ETAG, LAST_MODIFIED},
    Request, Response, StatusCode,
};
use tauri::{AppHandle, Manager, State};
use walkdir::WalkDir;
use zip::ZipArchive;

const FRONTEND_RELEASE_ENDPOINT: &str = "https://notes.binapp.top/app-frontend/latest.json";
const FRONTEND_RELEASE_PUBLIC_KEY_BASE64: &str = "AjIDb9Cq1Jhy/GlIo9IGl2+LASJuBT6qGjTz5OuD+q4=";
const PRODUCT_VERSION: &str = "v2.8";
const MAX_MANIFEST_BYTES: usize = 128 * 1024;
const MAX_ARCHIVE_BYTES: usize = 32 * 1024 * 1024;
const MAX_EXPANDED_BYTES: u64 = 128 * 1024 * 1024;
const MAX_ARCHIVE_FILES: usize = 4096;

#[derive(Clone, Debug, Deserialize, Serialize)]
pub struct SignedEnvelope {
    payload: String,
    signature: String,
}

#[derive(Clone, Debug, Deserialize, Serialize, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
pub struct FrontendReleasePayload {
    schema_version: u32,
    release_id: String,
    product_version: String,
    min_shell_version: String,
    published_at: String,
    url: String,
    sha256: String,
    size: u64,
}

#[derive(Clone, Debug, Default, Deserialize, Serialize, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
struct FrontendStateFile {
    active_release: Option<String>,
    previous_release: Option<String>,
    pending_release: Option<String>,
}

#[derive(Clone, Debug)]
struct ActiveRelease {
    release_id: String,
    www_root: PathBuf,
}

#[derive(Clone)]
pub struct FrontendBundleManager {
    root: PathBuf,
    verifying_key: VerifyingKey,
    shell_version: Version,
    active: Arc<RwLock<Option<ActiveRelease>>>,
    update_in_progress: Arc<AtomicBool>,
    client: reqwest::Client,
}

#[derive(Clone)]
pub struct FrontendBundleState {
    manager: Option<FrontendBundleManager>,
}

impl FrontendBundleState {
    pub fn new(manager: Option<FrontendBundleManager>) -> Self {
        Self { manager }
    }
}

#[derive(Clone, Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct FrontendUpdateResult {
    status: &'static str,
    release_id: Option<String>,
    min_shell_version: Option<String>,
}

impl FrontendUpdateResult {
    fn up_to_date(release_id: Option<String>) -> Self {
        Self {
            status: "upToDate",
            release_id,
            min_shell_version: None,
        }
    }

    fn installed(release_id: String) -> Self {
        Self {
            status: "installed",
            release_id: Some(release_id),
            min_shell_version: None,
        }
    }

    fn requires_shell_update(release_id: String, min_shell_version: String) -> Self {
        Self {
            status: "requiresShellUpdate",
            release_id: Some(release_id),
            min_shell_version: Some(min_shell_version),
        }
    }

    fn busy(release_id: Option<String>) -> Self {
        Self {
            status: "busy",
            release_id,
            min_shell_version: None,
        }
    }
}

struct UpdateGuard<'a>(&'a AtomicBool);

impl Drop for UpdateGuard<'_> {
    fn drop(&mut self) {
        self.0.store(false, Ordering::Release);
    }
}

impl FrontendBundleManager {
    pub fn from_app(app: &AppHandle) -> Result<Self, String> {
        let root = app
            .path()
            .app_data_dir()
            .map_err(|error| format!("无法定位应用数据目录：{error}"))?
            .join("frontend");
        let key_bytes = BASE64
            .decode(FRONTEND_RELEASE_PUBLIC_KEY_BASE64)
            .map_err(|_| "前端发布公钥编码无效".to_string())?;
        let key_array: [u8; 32] = key_bytes
            .try_into()
            .map_err(|_| "前端发布公钥长度无效".to_string())?;
        let verifying_key =
            VerifyingKey::from_bytes(&key_array).map_err(|_| "前端发布公钥无效".to_string())?;
        Self::new(root, verifying_key, env!("CARGO_PKG_VERSION"))
    }

    fn new(
        root: PathBuf,
        verifying_key: VerifyingKey,
        shell_version: &str,
    ) -> Result<Self, String> {
        fs::create_dir_all(root.join("releases"))
            .map_err(|error| format!("无法创建前端资源目录：{error}"))?;
        let manager = Self {
            root,
            verifying_key,
            shell_version: Version::parse(shell_version)
                .map_err(|_| "桌面壳版本无效".to_string())?,
            active: Arc::new(RwLock::new(None)),
            update_in_progress: Arc::new(AtomicBool::new(false)),
            client: reqwest::Client::builder()
                .connect_timeout(Duration::from_secs(4))
                .timeout(Duration::from_secs(20))
                .user_agent(format!("CaiyunNotes/{shell_version}"))
                .build()
                .map_err(|error| format!("无法初始化前端更新连接：{error}"))?,
        };
        manager.recover_active_release()?;
        Ok(manager)
    }

    #[cfg(test)]
    fn new_for_test(
        root: PathBuf,
        verifying_key: VerifyingKey,
        shell_version: &str,
    ) -> Result<Self, String> {
        Self::new(root, verifying_key, shell_version)
    }

    pub fn override_response(
        &self,
        request: &Request<Vec<u8>>,
        response: &mut Response<Cow<'static, [u8]>>,
    ) {
        let request_path = request.uri().path();
        let Some((relative_path, bytes)) = self.read_active_resource(request_path) else {
            return;
        };
        let headers = response.headers_mut();
        headers.remove(CONTENT_ENCODING);
        headers.remove(CONTENT_LENGTH);
        headers.remove(ETAG);
        headers.remove(LAST_MODIFIED);
        let mime = mime_guess::from_path(&relative_path)
            .first_or_octet_stream()
            .to_string();
        if let Ok(value) = mime.parse() {
            headers.insert(CONTENT_TYPE, value);
        }
        let cache_control = if relative_path == "index.html" {
            "no-store"
        } else {
            "public, max-age=31536000, immutable"
        };
        if let Ok(value) = cache_control.parse() {
            headers.insert(CACHE_CONTROL, value);
        }
        *response.status_mut() = StatusCode::OK;
        *response.body_mut() = Cow::Owned(bytes);
    }

    fn read_active_resource(&self, request_path: &str) -> Option<(String, Vec<u8>)> {
        let clean = request_path
            .split('?')
            .next()
            .unwrap_or(request_path)
            .trim_start_matches('/');
        let relative = if clean.is_empty() {
            "index.html"
        } else {
            clean
        };
        if let Some(bytes) = self.read_active_file(relative) {
            return Some((relative.to_string(), bytes));
        }
        if !relative.contains('.') {
            return self
                .read_active_file("index.html")
                .map(|bytes| ("index.html".to_string(), bytes));
        }
        None
    }

    fn read_active_file(&self, relative_path: &str) -> Option<Vec<u8>> {
        let relative = safe_relative_path(relative_path).ok()?;
        let active = self.active.read().ok()?.clone()?;
        fs::read(active.www_root.join(relative)).ok()
    }

    fn active_release_id(&self) -> Option<String> {
        self.active
            .read()
            .ok()?
            .as_ref()
            .map(|active| active.release_id.clone())
    }

    fn newest_local_release_id(&self) -> Option<String> {
        [self.active_release_id(), self.read_state_file().pending_release]
            .into_iter()
            .flatten()
            .max()
    }

    fn recover_active_release(&self) -> Result<(), String> {
        let mut state = self.read_state_file();
        let active = state
            .active_release
            .as_deref()
            .and_then(|release_id| self.validate_installed_release(release_id).ok());
        let pending = state
            .pending_release
            .as_deref()
            .and_then(|release_id| self.validate_installed_release(release_id).ok());

        if let Some(pending) = pending {
            let previous_release = active
                .as_ref()
                .map(|release| release.release_id.clone())
                .filter(|release_id| release_id != &pending.release_id);
            state = FrontendStateFile {
                active_release: Some(pending.release_id.clone()),
                previous_release,
                pending_release: None,
            };
            self.write_state_file(&state)?;
            *self
                .active
                .write()
                .map_err(|_| "前端活动版本锁定失败".to_string())? = Some(pending);
            self.prune_releases(&state)?;
            return Ok(());
        }

        if state.pending_release.is_some() {
            state.pending_release = None;
            self.write_state_file(&state)?;
        }
        if let Some(active) = active {
            *self
                .active
                .write()
                .map_err(|_| "前端活动版本锁定失败".to_string())? = Some(active);
            return Ok(());
        }
        let previous = state
            .previous_release
            .as_deref()
            .and_then(|release_id| self.validate_installed_release(release_id).ok());
        if let Some(previous) = previous {
            let recovered_state = FrontendStateFile {
                active_release: Some(previous.release_id.clone()),
                previous_release: None,
                pending_release: None,
            };
            self.write_state_file(&recovered_state)?;
            *self
                .active
                .write()
                .map_err(|_| "前端活动版本锁定失败".to_string())? = Some(previous);
        }
        Ok(())
    }

    fn validate_installed_release(&self, release_id: &str) -> Result<ActiveRelease, String> {
        validate_release_id(release_id)?;
        let release_root = self.root.join("releases").join(release_id);
        let envelope: SignedEnvelope = serde_json::from_slice(
            &fs::read(release_root.join("envelope.json"))
                .map_err(|_| "前端发布签名记录缺失".to_string())?,
        )
        .map_err(|_| "前端发布签名记录无效".to_string())?;
        let payload = decode_signed_payload(&envelope, &self.verifying_key)?;
        self.validate_payload(&payload)?;
        if payload.release_id != release_id {
            return Err("前端发布编号不一致".to_string());
        }
        let archive = fs::read(release_root.join("release.zip"))
            .map_err(|_| "前端发布原始包缺失".to_string())?;
        verify_archive_bytes(&payload, &archive)?;
        let trusted_manifest = read_dist_manifest_from_archive(&archive)?;
        let www_root = release_root.join("www");
        verify_dist_directory(&www_root, &trusted_manifest)?;
        Ok(ActiveRelease {
            release_id: release_id.to_string(),
            www_root,
        })
    }

    fn validate_payload(&self, payload: &FrontendReleasePayload) -> Result<(), String> {
        if payload.schema_version != 1 {
            return Err("前端发布清单版本不受支持".to_string());
        }
        validate_release_id(&payload.release_id)?;
        if payload.product_version != PRODUCT_VERSION {
            return Err("前端发布产品版本不匹配".to_string());
        }
        let minimum = Version::parse(&payload.min_shell_version)
            .map_err(|_| "前端发布最低桌面壳版本无效".to_string())?;
        if minimum > self.shell_version {
            return Err(format!("需要桌面壳 {}", payload.min_shell_version));
        }
        if !payload.published_at.contains('T') || !payload.published_at.ends_with('Z') {
            return Err("前端发布时间无效".to_string());
        }
        let url = reqwest::Url::parse(&payload.url).map_err(|_| "前端发布地址无效".to_string())?;
        if url.scheme() != "https"
            || url.host_str() != Some("notes.binapp.top")
            || !url.path().starts_with("/app-frontend/releases/")
        {
            return Err("前端发布地址不受信任".to_string());
        }
        if payload.size == 0 || payload.size > MAX_ARCHIVE_BYTES as u64 {
            return Err("前端发布包大小超出限制".to_string());
        }
        if payload.sha256.len() != 64
            || !payload.sha256.bytes().all(|byte| byte.is_ascii_hexdigit())
        {
            return Err("前端发布哈希无效".to_string());
        }
        Ok(())
    }

    fn install_archive(
        &self,
        envelope: &SignedEnvelope,
        payload: &FrontendReleasePayload,
        archive: &[u8],
    ) -> Result<(), String> {
        let decoded = decode_signed_payload(envelope, &self.verifying_key)?;
        if &decoded != payload {
            return Err("前端发布清单内容不一致".to_string());
        }
        self.validate_payload(payload)?;
        verify_archive_bytes(payload, archive)?;
        let trusted_manifest = read_dist_manifest_from_archive(archive)?;

        let releases_root = self.root.join("releases");
        let final_root = releases_root.join(&payload.release_id);
        let staging_root = self.root.join(format!(
            "staging-{}-{}",
            payload.release_id,
            std::process::id()
        ));
        if staging_root.exists() {
            fs::remove_dir_all(&staging_root)
                .map_err(|error| format!("无法清理前端更新临时目录：{error}"))?;
        }
        fs::create_dir_all(staging_root.join("www"))
            .map_err(|error| format!("无法创建前端更新临时目录：{error}"))?;
        let install_result = (|| {
            extract_zip(archive, &staging_root.join("www"))?;
            verify_dist_directory(&staging_root.join("www"), &trusted_manifest)?;
            fs::write(staging_root.join("release.zip"), archive)
                .map_err(|error| format!("无法保存前端发布包：{error}"))?;
            fs::write(
                staging_root.join("envelope.json"),
                serde_json::to_vec(envelope).map_err(|_| "无法保存前端发布签名记录".to_string())?,
            )
            .map_err(|error| format!("无法保存前端发布签名记录：{error}"))?;
            Ok::<(), String>(())
        })();
        if let Err(error) = install_result {
            let _ = fs::remove_dir_all(&staging_root);
            return Err(error);
        }

        if final_root.exists() {
            self.validate_installed_release(&payload.release_id)?;
            fs::remove_dir_all(&staging_root).ok();
        } else {
            fs::rename(&staging_root, &final_root)
                .map_err(|error| format!("无法激活前端发布目录：{error}"))?;
        }

        let mut state = self.read_state_file();
        state.pending_release = Some(payload.release_id.clone());
        self.write_state_file(&state)?;
        self.prune_releases(&state)?;
        Ok(())
    }

    fn prune_releases(&self, state: &FrontendStateFile) -> Result<(), String> {
        let keep: BTreeSet<&str> = [
            state.active_release.as_deref(),
            state.previous_release.as_deref(),
            state.pending_release.as_deref(),
        ]
        .into_iter()
        .flatten()
        .collect();
        for entry in fs::read_dir(self.root.join("releases"))
            .map_err(|error| format!("无法读取前端版本目录：{error}"))?
        {
            let entry = entry.map_err(|error| format!("无法读取前端版本目录：{error}"))?;
            if entry.file_type().map(|kind| kind.is_dir()).unwrap_or(false) {
                let name = entry.file_name().to_string_lossy().to_string();
                if !keep.contains(name.as_str()) {
                    fs::remove_dir_all(entry.path())
                        .map_err(|error| format!("无法清理旧前端版本：{error}"))?;
                }
            }
        }
        Ok(())
    }

    fn read_state_file(&self) -> FrontendStateFile {
        for file_name in ["state.json", "state.backup.json"] {
            if let Ok(bytes) = fs::read(self.root.join(file_name)) {
                if let Ok(state) = serde_json::from_slice(&bytes) {
                    return state;
                }
            }
        }
        FrontendStateFile::default()
    }

    fn write_state_file(&self, state: &FrontendStateFile) -> Result<(), String> {
        let bytes = serde_json::to_vec(state).map_err(|_| "无法编码前端活动版本".to_string())?;
        let next = self.root.join("state.next.json");
        let current = self.root.join("state.json");
        let backup = self.root.join("state.backup.json");
        let mut file =
            File::create(&next).map_err(|error| format!("无法写入前端活动版本：{error}"))?;
        file.write_all(&bytes)
            .map_err(|error| format!("无法写入前端活动版本：{error}"))?;
        file.sync_all()
            .map_err(|error| format!("无法同步前端活动版本：{error}"))?;
        if backup.exists() {
            fs::remove_file(&backup)
                .map_err(|error| format!("无法清理前端活动版本备份：{error}"))?;
        }
        if current.exists() {
            fs::rename(&current, &backup)
                .map_err(|error| format!("无法备份前端活动版本：{error}"))?;
        }
        if let Err(error) = fs::rename(&next, &current) {
            if backup.exists() {
                let _ = fs::rename(&backup, &current);
            }
            return Err(format!("无法切换前端活动版本：{error}"));
        }
        if backup.exists() {
            fs::remove_file(backup).ok();
        }
        Ok(())
    }

    pub async fn check_for_update(&self) -> Result<FrontendUpdateResult, String> {
        if self
            .update_in_progress
            .compare_exchange(false, true, Ordering::AcqRel, Ordering::Acquire)
            .is_err()
        {
            return Ok(FrontendUpdateResult::busy(self.newest_local_release_id()));
        }
        let _guard = UpdateGuard(&self.update_in_progress);
        let response = self
            .client
            .get(FRONTEND_RELEASE_ENDPOINT)
            .send()
            .await
            .map_err(|error| format!("暂时无法检查界面更新：{error}"))?;
        if !response.status().is_success() {
            return Err(format!(
                "暂时无法检查界面更新：服务器返回 {}",
                response.status().as_u16()
            ));
        }
        if response.content_length().unwrap_or(0) > MAX_MANIFEST_BYTES as u64 {
            return Err("界面更新清单过大".to_string());
        }
        let manifest_bytes = response
            .bytes()
            .await
            .map_err(|error| format!("无法读取界面更新清单：{error}"))?;
        if manifest_bytes.len() > MAX_MANIFEST_BYTES {
            return Err("界面更新清单过大".to_string());
        }
        let envelope: SignedEnvelope = serde_json::from_slice(&manifest_bytes)
            .map_err(|_| "界面更新清单格式无效".to_string())?;
        let payload = decode_signed_payload(&envelope, &self.verifying_key)?;
        if payload.schema_version != 1 || payload.product_version != PRODUCT_VERSION {
            return Err("界面更新清单与当前产品不匹配".to_string());
        }
        let minimum = Version::parse(&payload.min_shell_version)
            .map_err(|_| "界面更新最低桌面壳版本无效".to_string())?;
        if minimum > self.shell_version {
            return Ok(FrontendUpdateResult::requires_shell_update(
                payload.release_id,
                payload.min_shell_version,
            ));
        }
        self.validate_payload(&payload)?;
        if self
            .newest_local_release_id()
            .as_deref()
            .is_some_and(|local| local >= payload.release_id.as_str())
        {
            return Ok(FrontendUpdateResult::up_to_date(
                self.newest_local_release_id(),
            ));
        }
        let response = self
            .client
            .get(&payload.url)
            .send()
            .await
            .map_err(|error| format!("暂时无法下载界面更新：{error}"))?;
        if !response.status().is_success() {
            return Err(format!(
                "暂时无法下载界面更新：服务器返回 {}",
                response.status().as_u16()
            ));
        }
        if response.content_length().unwrap_or(0) > MAX_ARCHIVE_BYTES as u64 {
            return Err("界面更新包过大".to_string());
        }
        let archive = response
            .bytes()
            .await
            .map_err(|error| format!("无法读取界面更新包：{error}"))?;
        if archive.len() > MAX_ARCHIVE_BYTES {
            return Err("界面更新包过大".to_string());
        }
        self.install_archive(&envelope, &payload, &archive)?;
        Ok(FrontendUpdateResult::installed(payload.release_id))
    }
}

#[tauri::command]
pub async fn check_frontend_bundle_update(
    state: State<'_, FrontendBundleState>,
) -> Result<FrontendUpdateResult, String> {
    match state.manager.as_ref() {
        Some(manager) => manager.check_for_update().await,
        None => Ok(FrontendUpdateResult::up_to_date(None)),
    }
}

fn decode_signed_payload(
    envelope: &SignedEnvelope,
    key: &VerifyingKey,
) -> Result<FrontendReleasePayload, String> {
    let payload_bytes = BASE64
        .decode(&envelope.payload)
        .map_err(|_| "前端发布清单编码无效".to_string())?;
    let signature_bytes = BASE64
        .decode(&envelope.signature)
        .map_err(|_| "前端发布签名编码无效".to_string())?;
    let signature =
        Signature::from_slice(&signature_bytes).map_err(|_| "前端发布签名格式无效".to_string())?;
    key.verify(&payload_bytes, &signature)
        .map_err(|_| "前端发布清单签名无效".to_string())?;
    let payload: FrontendReleasePayload =
        serde_json::from_slice(&payload_bytes).map_err(|_| "前端发布清单内容无效".to_string())?;
    let canonical =
        serde_json::to_vec(&payload).map_err(|_| "前端发布清单无法规范化".to_string())?;
    if canonical != payload_bytes {
        return Err("前端发布清单编码不规范".to_string());
    }
    Ok(payload)
}

fn verify_archive_bytes(payload: &FrontendReleasePayload, archive: &[u8]) -> Result<(), String> {
    if payload.size != archive.len() as u64 {
        return Err("前端发布包大小不一致".to_string());
    }
    let actual = hex::encode(Sha256::digest(archive));
    if !actual.eq_ignore_ascii_case(&payload.sha256) {
        return Err("前端发布包哈希不一致".to_string());
    }
    Ok(())
}

fn extract_zip(archive: &[u8], target: &Path) -> Result<(), String> {
    let mut zip =
        ZipArchive::new(Cursor::new(archive)).map_err(|_| "前端发布包不是有效 ZIP".to_string())?;
    if zip.len() > MAX_ARCHIVE_FILES {
        return Err("前端发布包文件数量超出限制".to_string());
    }
    let mut expanded = 0_u64;
    for index in 0..zip.len() {
        let mut entry = zip
            .by_index(index)
            .map_err(|_| "无法读取前端发布包文件".to_string())?;
        let enclosed = entry
            .enclosed_name()
            .ok_or_else(|| "前端发布包包含不安全路径".to_string())?
            .to_path_buf();
        safe_relative_path(enclosed.to_string_lossy().as_ref())?;
        if entry
            .unix_mode()
            .is_some_and(|mode| mode & 0o170000 == 0o120000)
        {
            return Err("前端发布包不能包含符号链接".to_string());
        }
        expanded = expanded
            .checked_add(entry.size())
            .ok_or_else(|| "前端发布包解压大小无效".to_string())?;
        if expanded > MAX_EXPANDED_BYTES {
            return Err("前端发布包解压大小超出限制".to_string());
        }
        let output = target.join(&enclosed);
        if entry.is_dir() {
            fs::create_dir_all(&output)
                .map_err(|error| format!("无法创建前端资源目录：{error}"))?;
            continue;
        }
        if let Some(parent) = output.parent() {
            fs::create_dir_all(parent).map_err(|error| format!("无法创建前端资源目录：{error}"))?;
        }
        let mut file =
            File::create(&output).map_err(|error| format!("无法写入前端资源：{error}"))?;
        let copied = io::copy(&mut entry, &mut file)
            .map_err(|error| format!("无法写入前端资源：{error}"))?;
        if copied != entry.size() {
            return Err("前端资源解压大小不一致".to_string());
        }
    }
    Ok(())
}

#[derive(Deserialize)]
#[serde(rename_all = "camelCase")]
struct DistManifest {
    schema_version: u32,
    entry_assets: Vec<String>,
    files: Vec<DistManifestFile>,
}

#[derive(Deserialize)]
struct DistManifestFile {
    path: String,
    size: u64,
    sha256: String,
}

fn read_dist_manifest_from_archive(archive: &[u8]) -> Result<Vec<u8>, String> {
    let mut zip =
        ZipArchive::new(Cursor::new(archive)).map_err(|_| "前端发布包不是有效 ZIP".to_string())?;
    let manifest_indexes: Vec<usize> = (0..zip.len())
        .filter(|index| {
            zip.by_index(*index)
                .map(|entry| entry.name() == "app-dist-manifest.json")
                .unwrap_or(false)
        })
        .collect();
    if manifest_indexes.len() != 1 {
        return Err("前端发布包完整性清单数量无效".to_string());
    }
    let mut entry = zip
        .by_index(manifest_indexes[0])
        .map_err(|_| "无法读取前端发布包完整性清单".to_string())?;
    if entry.size() == 0 || entry.size() > MAX_MANIFEST_BYTES as u64 {
        return Err("前端发布包完整性清单大小无效".to_string());
    }
    let mut bytes = Vec::with_capacity(entry.size() as usize);
    entry
        .read_to_end(&mut bytes)
        .map_err(|_| "无法读取前端发布包完整性清单".to_string())?;
    Ok(bytes)
}

fn verify_dist_directory(root: &Path, trusted_manifest: &[u8]) -> Result<(), String> {
    let local_manifest = fs::read(root.join("app-dist-manifest.json"))
        .map_err(|_| "前端资源缺少完整性清单".to_string())?;
    if local_manifest != trusted_manifest {
        return Err("前端资源完整性清单与签名发布包不一致".to_string());
    }
    let manifest: DistManifest = serde_json::from_slice(trusted_manifest)
        .map_err(|_| "前端资源完整性清单无效".to_string())?;
    if manifest.schema_version != 1
        || !root.join("index.html").is_file()
        || manifest.entry_assets.is_empty()
    {
        return Err("前端资源入口无效".to_string());
    }
    let expected: BTreeSet<String> = manifest
        .files
        .iter()
        .map(|file| file.path.clone())
        .collect();
    if expected.len() != manifest.files.len() || !expected.contains("index.html") {
        return Err("前端资源清单文件列表无效".to_string());
    }
    for entry_asset in &manifest.entry_assets {
        safe_relative_path(entry_asset)?;
        if !expected.contains(entry_asset) {
            return Err("前端资源入口未包含在完整性清单中".to_string());
        }
    }
    let mut actual = BTreeSet::new();
    for entry in WalkDir::new(root).follow_links(false) {
        let entry = entry.map_err(|error| format!("无法读取前端资源：{error}"))?;
        if entry.file_type().is_symlink() {
            return Err("前端资源不能包含符号链接".to_string());
        }
        if entry.file_type().is_file() {
            let relative = entry
                .path()
                .strip_prefix(root)
                .map_err(|_| "前端资源路径无效".to_string())?
                .to_string_lossy()
                .replace('\\', "/");
            if relative != "app-dist-manifest.json" {
                actual.insert(relative);
            }
        }
    }
    if actual != expected {
        return Err("前端资源文件列表与完整性清单不一致".to_string());
    }
    for expected_file in manifest.files {
        let relative = safe_relative_path(&expected_file.path)?;
        let path = root.join(relative);
        let metadata =
            fs::metadata(&path).map_err(|_| format!("前端资源缺失：{}", expected_file.path))?;
        if metadata.len() != expected_file.size {
            return Err(format!("前端资源大小不一致：{}", expected_file.path));
        }
        let actual_hash = sha256_file(&path)?;
        if !actual_hash.eq_ignore_ascii_case(&expected_file.sha256) {
            return Err(format!("前端资源哈希不一致：{}", expected_file.path));
        }
    }
    Ok(())
}

fn sha256_file(path: &Path) -> Result<String, String> {
    let mut file = File::open(path).map_err(|error| format!("无法读取前端资源：{error}"))?;
    let mut hasher = Sha256::new();
    let mut buffer = [0_u8; 64 * 1024];
    loop {
        let read = file
            .read(&mut buffer)
            .map_err(|error| format!("无法读取前端资源：{error}"))?;
        if read == 0 {
            break;
        }
        hasher.update(&buffer[..read]);
    }
    Ok(hex::encode(hasher.finalize()))
}

fn safe_relative_path(value: &str) -> Result<PathBuf, String> {
    let path = Path::new(value);
    if value.is_empty() || path.is_absolute() {
        return Err("前端资源路径无效".to_string());
    }
    if path
        .components()
        .any(|component| !matches!(component, Component::Normal(_)))
    {
        return Err("前端资源包含不安全路径".to_string());
    }
    Ok(path.to_path_buf())
}

fn validate_release_id(release_id: &str) -> Result<(), String> {
    if !(8..=96).contains(&release_id.len())
        || !release_id
            .bytes()
            .all(|byte| byte.is_ascii_alphanumeric() || b"._-".contains(&byte))
    {
        return Err("前端发布编号无效".to_string());
    }
    Ok(())
}

#[cfg(test)]
mod tests {
    use super::*;
    use ed25519_dalek::{Signer, SigningKey};
    use serde_json::json;
    use sha2::{Digest, Sha256};
    use std::fs;
    use std::io::{Cursor, Write};
    use tempfile::TempDir;
    use zip::{write::SimpleFileOptions, ZipWriter};

    fn test_signing_key() -> SigningKey {
        SigningKey::from_bytes(&[7_u8; 32])
    }

    fn test_payload(release_id: &str, archive: &[u8]) -> FrontendReleasePayload {
        FrontendReleasePayload {
            schema_version: 1,
            release_id: release_id.to_string(),
            product_version: "v2.8".to_string(),
            min_shell_version: "10.2.0".to_string(),
            published_at: "2026-07-12T12:00:00Z".to_string(),
            url: format!("https://notes.binapp.top/app-frontend/releases/{release_id}.zip"),
            sha256: hex::encode(Sha256::digest(archive)),
            size: archive.len() as u64,
        }
    }

    fn sign_payload(payload: &FrontendReleasePayload) -> SignedEnvelope {
        let bytes = serde_json::to_vec(payload).unwrap();
        let signature = test_signing_key().sign(&bytes);
        SignedEnvelope {
            payload: BASE64.encode(bytes),
            signature: BASE64.encode(signature.to_bytes()),
        }
    }

    fn build_archive(marker: &str, extra_entry: Option<&str>) -> Vec<u8> {
        let index = format!("<!doctype html><script type=\"module\" src=\"/assets/main.js\"></script><main>{marker}</main>");
        let main = format!("document.body.dataset.release={marker:?};");
        let files = [
            ("assets/main.js", main.as_bytes()),
            ("index.html", index.as_bytes()),
        ];
        let manifest_files: Vec<_> = files
            .iter()
            .map(|(path, bytes)| {
                json!({
                    "path": path,
                    "size": bytes.len(),
                    "sha256": hex::encode(Sha256::digest(bytes)),
                })
            })
            .collect();
        let manifest = serde_json::to_vec(&json!({
            "schemaVersion": 1,
            "appVersion": "10.2.0",
            "gitCommit": "test",
            "entryAssets": ["assets/main.js"],
            "files": manifest_files,
        }))
        .unwrap();
        let cursor = Cursor::new(Vec::new());
        let mut zip = ZipWriter::new(cursor);
        let options =
            SimpleFileOptions::default().compression_method(zip::CompressionMethod::Deflated);
        for (path, bytes) in files {
            zip.start_file(path, options).unwrap();
            zip.write_all(bytes).unwrap();
        }
        zip.start_file("app-dist-manifest.json", options).unwrap();
        zip.write_all(&manifest).unwrap();
        if let Some(path) = extra_entry {
            zip.start_file(path, options).unwrap();
            zip.write_all(b"escape").unwrap();
        }
        zip.finish().unwrap().into_inner()
    }

    #[test]
    fn signed_payload_rejects_tampering() {
        let archive = build_archive("one", None);
        let payload = test_payload("20260712T120000Z-one", &archive);
        let mut envelope = sign_payload(&payload);
        let key = test_signing_key().verifying_key();
        assert_eq!(decode_signed_payload(&envelope, &key).unwrap(), payload);
        let mut bytes = BASE64.decode(&envelope.payload).unwrap();
        let index = bytes.len() - 2;
        bytes[index] ^= 1;
        envelope.payload = BASE64.encode(bytes);
        assert!(decode_signed_payload(&envelope, &key)
            .unwrap_err()
            .contains("签名"));
    }

    #[test]
    fn extraction_rejects_parent_paths() {
        let archive = build_archive("bad", Some("../outside.txt"));
        let temp = TempDir::new().unwrap();
        assert!(extract_zip(&archive, temp.path())
            .unwrap_err()
            .contains("路径"));
        assert!(!temp.path().join("outside.txt").exists());
    }

    #[test]
    fn pending_release_activates_only_on_restart_and_invalid_pending_falls_back() {
        let temp = TempDir::new().unwrap();
        let key = test_signing_key().verifying_key();
        let manager =
            FrontendBundleManager::new_for_test(temp.path().to_path_buf(), key, "10.2.0").unwrap();

        let first_archive = build_archive("first", None);
        let first_payload = test_payload("20260712T120000Z-first", &first_archive);
        manager
            .install_archive(
                &sign_payload(&first_payload),
                &first_payload,
                &first_archive,
            )
            .unwrap();
        assert_eq!(manager.active_release_id(), None);
        let manager =
            FrontendBundleManager::new_for_test(temp.path().to_path_buf(), key, "10.2.0").unwrap();
        assert_eq!(
            manager.active_release_id().as_deref(),
            Some("20260712T120000Z-first")
        );
        assert!(
            String::from_utf8(manager.read_active_file("index.html").unwrap())
                .unwrap()
                .contains("first")
        );

        let second_archive = build_archive("second", None);
        let second_payload = test_payload("20260712T130000Z-second", &second_archive);
        manager
            .install_archive(
                &sign_payload(&second_payload),
                &second_payload,
                &second_archive,
            )
            .unwrap();
        assert_eq!(
            manager.active_release_id().as_deref(),
            Some("20260712T120000Z-first")
        );

        fs::write(
            temp.path()
                .join("releases/20260712T130000Z-second/www/index.html"),
            "corrupted",
        )
        .unwrap();
        let recovered =
            FrontendBundleManager::new_for_test(temp.path().to_path_buf(), key, "10.2.0").unwrap();
        assert_eq!(
            recovered.active_release_id().as_deref(),
            Some("20260712T120000Z-first")
        );
        assert!(
            String::from_utf8(recovered.read_active_file("index.html").unwrap())
                .unwrap()
                .contains("first")
        );
    }

    #[test]
    fn installed_release_rejects_www_and_local_manifest_tampering() {
        let temp = TempDir::new().unwrap();
        let key = test_signing_key().verifying_key();
        let manager =
            FrontendBundleManager::new_for_test(temp.path().to_path_buf(), key, "10.2.0").unwrap();
        let release_id = "20260712T135000Z-tamper";
        let archive = build_archive("original", None);
        let payload = test_payload(release_id, &archive);
        manager
            .install_archive(&sign_payload(&payload), &payload, &archive)
            .unwrap();

        let www = temp.path().join("releases").join(release_id).join("www");
        let changed = b"document.body.dataset.release='tampered';";
        fs::write(www.join("assets/main.js"), changed).unwrap();
        let manifest_path = www.join("app-dist-manifest.json");
        let mut manifest: serde_json::Value =
            serde_json::from_slice(&fs::read(&manifest_path).unwrap()).unwrap();
        let files = manifest["files"].as_array_mut().unwrap();
        let main = files
            .iter_mut()
            .find(|file| file["path"] == "assets/main.js")
            .unwrap();
        main["size"] = json!(changed.len());
        main["sha256"] = json!(hex::encode(Sha256::digest(changed)));
        fs::write(&manifest_path, serde_json::to_vec(&manifest).unwrap()).unwrap();

        assert!(manager.validate_installed_release(release_id).is_err());
    }

    #[test]
    fn activation_retains_only_current_and_previous_release() {
        let temp = TempDir::new().unwrap();
        let key = test_signing_key().verifying_key();
        let mut manager =
            FrontendBundleManager::new_for_test(temp.path().to_path_buf(), key, "10.2.0").unwrap();
        for (release_id, marker) in [
            ("20260712T120000Z-one", "one"),
            ("20260712T130000Z-two", "two"),
            ("20260712T140000Z-three", "three"),
        ] {
            let archive = build_archive(marker, None);
            let payload = test_payload(release_id, &archive);
            manager
                .install_archive(&sign_payload(&payload), &payload, &archive)
                .unwrap();
            manager = FrontendBundleManager::new_for_test(
                temp.path().to_path_buf(),
                key,
                "10.2.0",
            )
            .unwrap();
        }
        let releases = fs::read_dir(temp.path().join("releases")).unwrap().count();
        assert_eq!(releases, 2);
        assert!(!temp.path().join("releases/20260712T120000Z-one").exists());
    }
}
