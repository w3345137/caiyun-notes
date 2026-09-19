use std::env;
use std::error::Error;
use std::fs;
use std::path::Path;

fn main() {
    let mut attributes =
        tauri_build::Attributes::new().app_manifest(tauri_build::AppManifest::new().commands(&[
            "check_frontend_bundle_update",
            "set_app_exit_handler_ready",
            "complete_app_exit",
            "request_app_exit",
            "map_view_request",
            "map_view_reply",
            "map_view_set_bounds",
            "map_view_close",
            "map_view_open",
            "cancel_app_exit",
            "inspect_legacy_webkit_origin",
            "quarantine_legacy_webkit_origin",
            "download_and_install_resumable_update",
        ]));
    // 商店版（未启用 self-update 特性）编译期不包含 tauri-plugin-updater，
    // capabilities/default.json 中的 updater:* 权限会失去来源、构建失败。
    // 这里在 OUT_DIR 生成一份剔除 updater:* 的能力清单副本供其解析；
    // 官网直发版（默认特性）仍直接解析 capabilities/ 目录，行为不变。
    if env::var_os("CARGO_FEATURE_SELF_UPDATE").is_none() {
        let pattern =
            store_capabilities_pattern().expect("failed to generate store capability files");
        attributes = attributes.capabilities_path_pattern(pattern);
    }
    tauri_build::try_build(attributes)
        .expect("failed to build explicit application command permissions")
}

/// 把 capabilities/*.json 复制到 OUT_DIR/store-capabilities 并剔除 updater:* 权限，
/// 返回供 tauri-build 使用的 glob 模式（统一为正斜杠，兼容 Windows 路径）。
fn store_capabilities_pattern() -> Result<&'static str, Box<dyn Error>> {
    println!("cargo:rerun-if-changed=capabilities");
    let out_dir = env::var_os("OUT_DIR").ok_or("OUT_DIR is not set")?;
    let store_dir = Path::new(&out_dir).join("store-capabilities");
    fs::create_dir_all(&store_dir)?;
    for entry in fs::read_dir("capabilities")? {
        let entry = entry?;
        let path = entry.path();
        let target = store_dir.join(entry.file_name());
        if path.extension().and_then(|e| e.to_str()) != Some("json") {
            fs::copy(&path, &target)?;
            continue;
        }
        let mut capability: serde_json::Value = serde_json::from_str(&fs::read_to_string(&path)?)?;
        if let Some(permissions) = capability
            .get_mut("permissions")
            .and_then(|value| value.as_array_mut())
        {
            permissions.retain(|permission| {
                permission
                    .as_str()
                    .map(|id| !id.starts_with("updater:"))
                    .unwrap_or(true)
            });
        }
        fs::write(&target, serde_json::to_string_pretty(&capability)?)?;
    }
    let pattern = format!("{}/**/*", store_dir.to_string_lossy().replace('\\', "/"));
    Ok(Box::leak(pattern.into_boxed_str()))
}
