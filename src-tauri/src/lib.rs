mod frontend_bundle;

use frontend_bundle::{
    check_frontend_bundle_update, FrontendBundleManager, FrontendBundleState,
};
use tauri::Manager;

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_fs::init())
        .plugin(tauri_plugin_log::Builder::new().build())
        .plugin(tauri_plugin_dialog::init())
        .plugin(tauri_plugin_process::init())
        .plugin(tauri_plugin_clipboard_manager::init())
        .plugin(tauri_plugin_notification::init())
        .plugin(tauri_plugin_shell::init())
        .plugin(tauri_plugin_store::Builder::default().build())
        .invoke_handler(tauri::generate_handler![check_frontend_bundle_update])
        .setup(|app| {
            #[cfg(desktop)]
            {
                app.handle()
                    .plugin(tauri_plugin_updater::Builder::new().build())?;
            }
            let frontend_manager = match FrontendBundleManager::from_app(app.handle()) {
                Ok(manager) => Some(manager),
                Err(error) => {
                    eprintln!("[FrontendBundle] 本地前端更新不可用，继续使用壳内置资源：{error}");
                    None
                }
            };
            app.manage(FrontendBundleState::new(frontend_manager.clone()));
            let window_config = app
                .config()
                .app
                .windows
                .first()
                .ok_or_else(|| {
                    std::io::Error::new(std::io::ErrorKind::NotFound, "missing main window config")
                })?
                .clone();
            tauri::WebviewWindowBuilder::from_config(app.handle(), &window_config)?
                .on_web_resource_request(move |request, response| {
                    if let Some(manager) = frontend_manager.as_ref() {
                        manager.override_response(&request, response);
                    }
                })
                .build()?;
            Ok(())
        })
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
