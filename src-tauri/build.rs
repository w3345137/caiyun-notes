use std::env;
use std::error::Error;
use std::fs;
use std::path::Path;

fn main() {
    if env::var("CARGO_CFG_TARGET_OS").as_deref() == Ok("windows")
        && env::var_os("CARGO_FEATURE_MSSTORE_DISTRIBUTION").is_some()
    {
        println!("cargo:rerun-if-changed=src/windows_store_handoff.c");
        cc::Build::new()
            .file("src/windows_store_handoff.c")
            .flag_if_supported("/utf-8")
            .compile("caiyun_store_handoff");
        println!("cargo:rustc-link-lib=shell32");
        println!("cargo:rustc-link-lib=user32");
    }
    if env::var("CARGO_CFG_TARGET_OS").as_deref() == Ok("windows")
        && env::var_os("CARGO_FEATURE_SELF_UPDATE").is_some()
        && env::var_os("CARGO_FEATURE_MSSTORE_DISTRIBUTION").is_none()
    {
        println!("cargo:rerun-if-changed=src/windows_direct_launch.c");
        cc::Build::new().file("src/windows_direct_launch.c").compile("caiyun_direct_launch");
        println!("cargo:rustc-link-lib=ole32");
        println!("cargo:rustc-link-lib=uuid");
        println!("cargo:rustc-link-lib=user32");
    }
    if env::var("CARGO_CFG_TARGET_OS").as_deref() == Ok("macos") {
        println!("cargo:rerun-if-changed=src/macos_notifications.m");
        println!("cargo:rustc-link-lib=framework=UserNotifications");
        cc::Build::new()
            .file("src/macos_notifications.m")
            .flag("-fobjc-arc")
            .flag("-fblocks")
            .compile("caiyun_macos_notifications");
    }
    if env::var("CARGO_CFG_TARGET_OS").as_deref() == Ok("ios") {
        println!("cargo:rerun-if-changed=src/ios_mail.mm");
        println!("cargo:rerun-if-changed=src/ios_viewport.mm");
        println!("cargo:rustc-link-lib=framework=UIKit");
        println!("cargo:rustc-link-lib=framework=UserNotifications");
        cc::Build::new().file("src/ios_mail.mm").flag("-fobjc-arc").flag("-fblocks").compile("caiyun_ios_mail");
        cc::Build::new().file("src/ios_viewport.mm").flag("-fobjc-arc").compile("caiyun_ios_viewport");
    }
    let mut attributes =
        tauri_build::Attributes::new().app_manifest(tauri_build::AppManifest::new().commands(&[
            "plugin_host_version",
            "plugin_http_request",
            "plugin_http_cancel",
            "plugin_website_open",
            "plugin_website_close",
            "check_frontend_bundle_update",
            "confirm_frontend_bundle_ready",
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
            "get_app_distribution_channel",
            "save_download_file",
            "ios_mail_register_push",
            "ios_mail_stop_push",
            "ios_mail_take_actions",
            "app_notification_bridge",
            "restart_app",
            "qwen_models",
            "qwen_verify",
            "qwen_open_folder",
            "qwen_remove",
            "qwen_transcribe",
        ]));
    if env::var_os("CARGO_FEATURE_SELF_UPDATE").is_none() {
        let pattern = store_capabilities_pattern().expect("failed to generate store capabilities");
        attributes = attributes.capabilities_path_pattern(pattern);
    }
    tauri_build::try_build(attributes)
        .expect("failed to build explicit application command permissions")
}

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
