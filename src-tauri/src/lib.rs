mod frontend_bundle;

use frontend_bundle::{check_frontend_bundle_update, FrontendBundleManager, FrontendBundleState};
use tauri::Manager;

#[cfg(target_os = "windows")]
use tauri::{
    menu::{Menu, MenuItem},
    tray::{MouseButton, MouseButtonState, TrayIconBuilder, TrayIconEvent},
};

fn show_main_window<R: tauri::Runtime>(app: &tauri::AppHandle<R>) {
    if let Some(window) = app.get_webview_window("main") {
        let _ = window.show();
        let _ = window.unminimize();
        let _ = window.set_focus();
    }
}

fn install_hide_on_close<R: tauri::Runtime>(main_window: &tauri::WebviewWindow<R>) {
    #[cfg(any(target_os = "macos", target_os = "windows"))]
    {
        let window = main_window.clone();
        main_window.on_window_event(move |event| {
            if let tauri::WindowEvent::CloseRequested { api, .. } = event {
                api.prevent_close();
                let _ = window.hide();
            }
        });
    }

    #[cfg(not(any(target_os = "macos", target_os = "windows")))]
    let _ = main_window;
}

#[cfg(target_os = "windows")]
fn install_windows_tray(app: &tauri::App) -> tauri::Result<()> {
    let show_item = MenuItem::with_id(app, "show", "显示彩云笔记", true, None::<&str>)?;
    let quit_item = MenuItem::with_id(app, "quit", "退出彩云笔记", true, None::<&str>)?;
    let menu = Menu::with_items(app, &[&show_item, &quit_item])?;
    let mut tray = TrayIconBuilder::with_id("caiyun-notes")
        .tooltip("彩云笔记")
        .menu(&menu)
        .show_menu_on_left_click(false)
        .on_menu_event(|app, event| match event.id().as_ref() {
            "show" => show_main_window(app),
            "quit" => app.exit(0),
            _ => {}
        })
        .on_tray_icon_event(|tray, event| {
            if let TrayIconEvent::Click {
                button: MouseButton::Left,
                button_state: MouseButtonState::Up,
                ..
            } = event
            {
                show_main_window(tray.app_handle());
            }
        });
    if let Some(icon) = app.default_window_icon() {
        tray = tray.icon(icon.clone());
    }
    tray.build(app)?;
    Ok(())
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    let app = tauri::Builder::default()
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
            let main_window =
                tauri::WebviewWindowBuilder::from_config(app.handle(), &window_config)?
                    .on_web_resource_request(move |request, response| {
                        if let Some(manager) = frontend_manager.as_ref() {
                            manager.override_response(&request, response);
                        }
                    })
                    .build()?;
            install_hide_on_close(&main_window);
            #[cfg(target_os = "windows")]
            install_windows_tray(app)?;
            Ok(())
        })
        .build(tauri::generate_context!())
        .expect("error while running tauri application");

    app.run(|app_handle, event| {
        #[cfg(target_os = "macos")]
        if let tauri::RunEvent::Reopen { .. } = event {
            show_main_window(app_handle);
        }

        #[cfg(not(target_os = "macos"))]
        let _ = (app_handle, event);
    });
}
