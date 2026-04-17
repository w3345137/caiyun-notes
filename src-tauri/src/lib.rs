use tauri::Manager;

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_fs::init())
        .plugin(tauri_plugin_log::Builder::new().build())
        .plugin(tauri_plugin_dialog::init())
        .plugin(tauri_plugin_updater::Builder::new().build())
        .setup(|app| {
            // 启动时检查更新（后台静默）
            let handle = app.handle().clone();
            tauri::async_runtime::spawn(async move {
                check_for_update(handle).await;
            });
            Ok(())
        })
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}

async fn check_for_update(app: tauri::AppHandle) {
    match app.updater_builder().check().await {
        Ok(Some(update)) => {
            let version = update.version.clone();
            let body = update.body.clone().unwrap_or_default();
            let date = update.date.map(|d| d.to_string()).unwrap_or_default();

            // 通过事件通知前端有新版本
            let _ = app.emit("update-available", serde_json::json!({
                "version": version,
                "body": body,
                "date": date,
            }));
        }
        Ok(None) => {
            // 已是最新版本
        }
        Err(e) => {
            eprintln!("检查更新失败: {}", e);
        }
    }
}
