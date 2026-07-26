mod frontend_bundle;

use frontend_bundle::{check_frontend_bundle_update, FrontendBundleManager, FrontendBundleState};
use std::sync::atomic::{AtomicBool, Ordering};
use tauri::{Emitter, Manager};

#[cfg(target_os = "windows")]
use tauri::{
    menu::{Menu, MenuItem},
    tray::{MouseButton, MouseButtonState, TrayIconBuilder, TrayIconEvent},
};

const APP_EXIT_REQUESTED_EVENT: &str = "app-exit-requested";

#[derive(Default)]
struct ExitCoordinator {
    frontend_ready: AtomicBool,
    pending: AtomicBool,
    approved: AtomicBool,
}

fn show_main_window<R: tauri::Runtime>(app: &tauri::AppHandle<R>) {
    if let Some(window) = app.get_webview_window("main") {
        let _ = window.show();
        let _ = window.unminimize();
        let _ = window.set_focus();
    }
}

fn approve_exit<R: tauri::Runtime>(app: &tauri::AppHandle<R>, coordinator: &ExitCoordinator) {
    coordinator.pending.store(false, Ordering::Release);
    coordinator.approved.store(true, Ordering::Release);
    app.exit(0);
}

fn request_controlled_exit<R: tauri::Runtime>(app: &tauri::AppHandle<R>) {
    let coordinator = app.state::<ExitCoordinator>();
    if coordinator.approved.load(Ordering::Acquire) {
        app.exit(0);
        return;
    }
    if !coordinator.frontend_ready.load(Ordering::Acquire) {
        approve_exit(app, &coordinator);
        return;
    }
    if coordinator
        .pending
        .compare_exchange(false, true, Ordering::AcqRel, Ordering::Acquire)
        .is_err()
    {
        return;
    }

    let delivered = app
        .get_webview_window("main")
        .ok_or_else(|| "main window is unavailable".to_string())
        .and_then(|window| {
            window
                .emit(APP_EXIT_REQUESTED_EVENT, ())
                .map_err(|error| error.to_string())
        });
    if let Err(error) = delivered {
        coordinator.pending.store(false, Ordering::Release);
        eprintln!("[NativeExit] 无法请求前端刷盘，已取消退出：{error}");
        show_main_window(app);
    }
}

#[tauri::command]
fn set_app_exit_handler_ready(state: tauri::State<'_, ExitCoordinator>) {
    state.frontend_ready.store(true, Ordering::Release);
}

#[tauri::command]
fn complete_app_exit(
    app: tauri::AppHandle,
    state: tauri::State<'_, ExitCoordinator>,
) -> Result<(), String> {
    if !state.pending.load(Ordering::Acquire) {
        return Err("没有待确认的退出请求".to_string());
    }
    approve_exit(&app, &state);
    Ok(())
}

#[tauri::command]
fn cancel_app_exit(state: tauri::State<'_, ExitCoordinator>) {
    state.pending.store(false, Ordering::Release);
}

fn install_window_close_behavior<R: tauri::Runtime>(main_window: &tauri::WebviewWindow<R>) {
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

    #[cfg(target_os = "linux")]
    {
        let app = main_window.app_handle().clone();
        main_window.on_window_event(move |event| {
            if let tauri::WindowEvent::CloseRequested { api, .. } = event {
                api.prevent_close();
                request_controlled_exit(&app);
            }
        });
    }

    #[cfg(not(any(target_os = "macos", target_os = "windows", target_os = "linux")))]
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
            "quit" => request_controlled_exit(app),
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
    let builder = tauri::Builder::default();
    #[cfg(target_os = "windows")]
    let builder = builder.plugin(tauri_plugin_single_instance::init(|app, _args, _cwd| {
        show_main_window(app);
    }));

    let app = builder
        .plugin(tauri_plugin_fs::init())
        .plugin(tauri_plugin_log::Builder::new().build())
        .plugin(tauri_plugin_dialog::init())
        .plugin(tauri_plugin_process::init())
        .plugin(tauri_plugin_clipboard_manager::init())
        .plugin(tauri_plugin_notification::init())
        .plugin(tauri_plugin_shell::init())
        .plugin(tauri_plugin_store::Builder::default().build())
        .manage(ExitCoordinator::default())
        .invoke_handler(tauri::generate_handler![
            check_frontend_bundle_update,
            set_app_exit_handler_ready,
            complete_app_exit,
            cancel_app_exit
        ])
        .setup(|app| {
            #[cfg(desktop)]
            {
                app.handle()
                    .plugin(tauri_plugin_updater::Builder::new().build())?;
            }
            // 本地库验收包必须运行本次编译进壳的资源；若复用生产前端热更新目录，
            // WebKit 会加载旧 release，导致验收结果与当前源码脱节。
            let frontend_manager = if app.config().identifier == "com.caiyun.notes.e2e" {
                None
            } else {
                match FrontendBundleManager::from_app(app.handle()) {
                    Ok(manager) => Some(manager),
                    Err(error) => {
                        eprintln!(
                            "[FrontendBundle] 本地前端更新不可用，继续使用壳内置资源：{error}"
                        );
                        None
                    }
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
            install_window_close_behavior(&main_window);
            #[cfg(target_os = "windows")]
            install_windows_tray(app)?;
            Ok(())
        })
        .build(tauri::generate_context!())
        .expect("error while running tauri application");

    app.run(|app_handle, event| {
        #[cfg(desktop)]
        if let tauri::RunEvent::ExitRequested { api, .. } = &event {
            let coordinator = app_handle.state::<ExitCoordinator>();
            if coordinator.approved.swap(false, Ordering::AcqRel) {
                return;
            }
            api.prevent_exit();
            request_controlled_exit(app_handle);
        }

        #[cfg(target_os = "macos")]
        if let tauri::RunEvent::Reopen { .. } = &event {
            show_main_window(app_handle);
        }

        #[cfg(not(desktop))]
        let _ = (app_handle, event);
    });
}
