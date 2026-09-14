fn main() {
    tauri_build::try_build(tauri_build::Attributes::new().app_manifest(
        tauri_build::AppManifest::new().commands(&[
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
        ]),
    ))
    .expect("failed to build explicit application command permissions")
}
