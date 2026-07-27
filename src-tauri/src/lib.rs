mod frontend_bundle;

use frontend_bundle::{check_frontend_bundle_update, FrontendBundleManager, FrontendBundleState};
use serde::Serialize;
use std::sync::atomic::{AtomicBool, Ordering};
use tauri::{Emitter, Manager};

#[cfg(target_os = "windows")]
use tauri::{
    menu::{Menu, MenuItem},
    tray::{MouseButton, MouseButtonState, TrayIconBuilder, TrayIconEvent},
};

const APP_EXIT_REQUESTED_EVENT: &str = "app-exit-requested";
const LEGACY_WEBKIT_ORIGIN_HOST: &str = "notes.binapp.top";

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
struct LegacyWebkitOriginInfo {
    supported: bool,
    exists: bool,
    total_size: u64,
    file_count: u64,
    latest_modified_ms: Option<u64>,
    quarantined_entries: u64,
}

#[cfg(target_os = "macos")]
fn directory_stats(path: &std::path::Path) -> (u64, u64, Option<u64>) {
    let mut total_size = 0_u64;
    let mut file_count = 0_u64;
    let mut latest_modified_ms = None;
    for entry in walkdir::WalkDir::new(path)
        .into_iter()
        .filter_map(Result::ok)
    {
        let Ok(metadata) = entry.metadata() else {
            continue;
        };
        if metadata.is_file() {
            total_size = total_size.saturating_add(metadata.len());
            file_count = file_count.saturating_add(1);
        }
        if let Ok(modified) = metadata.modified() {
            if let Ok(duration) = modified.duration_since(std::time::UNIX_EPOCH) {
                let millis = duration.as_millis().min(u128::from(u64::MAX)) as u64;
                latest_modified_ms = Some(latest_modified_ms.unwrap_or(0).max(millis));
            }
        }
    }
    (total_size, file_count, latest_modified_ms)
}

#[cfg(target_os = "macos")]
fn find_legacy_webkit_origin() -> Result<Option<std::path::PathBuf>, String> {
    let user_home = std::env::var_os("HOME").ok_or_else(|| "无法定位用户目录".to_string())?;
    let default_root = std::path::PathBuf::from(user_home)
        .join("Library/WebKit/com.caiyun.notes/WebsiteData/Default");
    if !default_root.is_dir() {
        return Ok(None);
    }
    let entries = std::fs::read_dir(&default_root).map_err(|error| error.to_string())?;
    for entry in entries.filter_map(Result::ok) {
        let candidate_root = entry.path();
        if !candidate_root.is_dir() {
            continue;
        }
        let origin = candidate_root.join(entry.file_name()).join("origin");
        let Ok(bytes) = std::fs::read(&origin) else {
            continue;
        };
        if bytes
            .windows(LEGACY_WEBKIT_ORIGIN_HOST.len())
            .any(|window| window == LEGACY_WEBKIT_ORIGIN_HOST.as_bytes())
        {
            return Ok(Some(candidate_root));
        }
    }
    Ok(None)
}

#[tauri::command]
fn inspect_legacy_webkit_origin(app: tauri::AppHandle) -> Result<LegacyWebkitOriginInfo, String> {
    #[cfg(target_os = "macos")]
    {
        let quarantine_root = app
            .path()
            .app_local_data_dir()
            .map_err(|error| error.to_string())?
            .join("legacy-origin-quarantine");
        let quarantined_entries = std::fs::read_dir(&quarantine_root)
            .map(|entries| entries.filter_map(Result::ok).count() as u64)
            .unwrap_or(0);
        let Some(origin_root) = find_legacy_webkit_origin()? else {
            return Ok(LegacyWebkitOriginInfo {
                supported: true,
                exists: false,
                total_size: 0,
                file_count: 0,
                latest_modified_ms: None,
                quarantined_entries,
            });
        };
        let (total_size, file_count, latest_modified_ms) = directory_stats(&origin_root);
        return Ok(LegacyWebkitOriginInfo {
            supported: true,
            exists: true,
            total_size,
            file_count,
            latest_modified_ms,
            quarantined_entries,
        });
    }
    #[cfg(not(target_os = "macos"))]
    {
        let _ = app;
        Ok(LegacyWebkitOriginInfo {
            supported: false,
            exists: false,
            total_size: 0,
            file_count: 0,
            latest_modified_ms: None,
            quarantined_entries: 0,
        })
    }
}

#[tauri::command]
fn quarantine_legacy_webkit_origin(
    app: tauri::AppHandle,
) -> Result<LegacyWebkitOriginInfo, String> {
    #[cfg(target_os = "macos")]
    {
        let Some(origin_root) = find_legacy_webkit_origin()? else {
            return inspect_legacy_webkit_origin(app);
        };
        let quarantine_root = app
            .path()
            .app_local_data_dir()
            .map_err(|error| error.to_string())?
            .join("legacy-origin-quarantine");
        std::fs::create_dir_all(&quarantine_root).map_err(|error| error.to_string())?;
        let timestamp = std::time::SystemTime::now()
            .duration_since(std::time::UNIX_EPOCH)
            .map_err(|error| error.to_string())?
            .as_secs();
        let target = quarantine_root.join(format!("{timestamp}-notes-binapp-top"));
        std::fs::rename(&origin_root, &target).map_err(|error| error.to_string())?;
        return inspect_legacy_webkit_origin(app);
    }
    #[cfg(not(target_os = "macos"))]
    {
        inspect_legacy_webkit_origin(app)
    }
}

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
            cancel_app_exit,
            inspect_legacy_webkit_origin,
            quarantine_legacy_webkit_origin
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
