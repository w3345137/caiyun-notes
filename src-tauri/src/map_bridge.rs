use tauri::Manager;
type Sessions = std::sync::Mutex<crate::map_sessions::MapSessions>;

const MAX_MESSAGE_BYTES: usize = 4 * 1024 * 1024;

fn bridge_enabled(webview: &tauri::Webview, child: bool) -> bool {
    let id = webview.app_handle().config().identifier.as_str();
    let allowed_app = id == "com.caiyun.notes" || id == "com.caiyun.notes.route-e2e";
    allowed_app
        && if child {
            webview.label().starts_with("map-session-")
        } else {
            webview.label() == "main"
        }
}

#[cfg(desktop)]
fn create_map_view(window: &tauri::Window, label: &str) -> Result<(), String> {
    if window.app_handle().get_webview(label).is_some() {
        return Ok(());
    }
    #[cfg(target_os = "windows")]
    let url = "http://caiyun-map-probe.localhost/runtime.html?embedded=1";
    #[cfg(not(target_os = "windows"))]
    let url = "caiyun-map-probe://localhost/runtime.html?embedded=1";
    let child = window
        .add_child(
            tauri::webview::WebviewBuilder::new(
                label,
                tauri::WebviewUrl::External(url.parse().map_err(|_| "invalid map URL")?),
            )
            .on_navigation(crate::map_navigation::allowed)
            .on_new_window(|_, _| tauri::webview::NewWindowResponse::Deny),
            tauri::LogicalPosition::new(-10_000.0, -10_000.0),
            tauri::LogicalSize::new(1.0, 1.0),
        )
        .map_err(|_| "map creation failed")?;
    if child.hide().is_err() {
        let _ = child.close();
        return Err("map initial hide failed".into());
    }
    Ok(())
}

// Async command avoids blocking the WebView2 IPC thread during view creation.
#[tauri::command]
pub async fn map_view_open(webview: tauri::Webview, session: String) -> Result<(), String> {
    if !bridge_enabled(&webview, false) {
        return Err("map bridge unavailable".into());
    }
    #[cfg(desktop)]
    {
        let state = webview.state::<Sessions>();
        let label = state
            .lock()
            .map_err(|_| "map registry unavailable")?
            .reserve(webview.label(), &session)?;
        if let Err(error) = create_map_view(&webview.window(), &label) {
            let _ = state
                .lock()
                .map_err(|_| "map registry unavailable")?
                .creation_failed(webview.label(), &session);
            return Err(error);
        }
        state
            .lock()
            .map_err(|_| "map registry unavailable")?
            .created(webview.label(), &session)?;
        Ok(())
    }
    #[cfg(not(desktop))]
    {
        Err("map bridge unavailable".into())
    }
}

#[tauri::command]
pub fn map_view_close(webview: tauri::Webview, session: String) -> Result<(), String> {
    if !bridge_enabled(&webview, false) {
        return Err("map bridge unavailable".into());
    }
    #[cfg(desktop)]
    {
        let state = webview.state::<Sessions>();
        let mut sessions = state.lock().map_err(|_| "map registry unavailable")?;
        let label = sessions.resolve(webview.label(), &session)?;
        if let Some(child) = webview.app_handle().get_webview(&label) {
            child.close().map_err(|_| "map close failed")?;
        }
        sessions.release(webview.label(), &session)?;
    }
    Ok(())
}

#[derive(serde::Deserialize)]
pub struct MapBounds {
    x: f64,
    y: f64,
    width: f64,
    height: f64,
    visible: bool,
}

fn clipped_bounds(bounds: &MapBounds, width: f64, height: f64) -> Option<(f64, f64, f64, f64)> {
    if !bounds.visible
        || [
            bounds.x,
            bounds.y,
            bounds.width,
            bounds.height,
            width,
            height,
        ]
        .iter()
        .any(|v| !v.is_finite())
        || bounds.width <= 0.0
        || bounds.height <= 0.0
        || width <= 0.0
        || height <= 0.0
    {
        return None;
    }
    let x = bounds.x.max(0.0);
    let y = bounds.y.max(0.0);
    let right = (bounds.x + bounds.width).min(width);
    let bottom = (bounds.y + bounds.height).min(height);
    if right - x < 1.0 || bottom - y < 1.0 {
        None
    } else {
        Some((x, y, right - x, bottom - y))
    }
}

#[tauri::command]
pub fn map_view_set_bounds(
    webview: tauri::Webview,
    bounds: MapBounds,
    session: String,
) -> Result<(), String> {
    if !bridge_enabled(&webview, false) {
        return Err("map bridge unavailable".into());
    }
    #[cfg(desktop)]
    {
        let state = webview.state::<Sessions>();
        let sessions = state.lock().map_err(|_| "map registry unavailable")?;
        let label = sessions.resolve(webview.label(), &session)?;
        let child = webview
            .app_handle()
            .get_webview(&label)
            .ok_or("map view unavailable")?;
        let window = webview.window();
        let scale = window
            .scale_factor()
            .map_err(|_| "map window unavailable")?;
        let size = window
            .inner_size()
            .map_err(|_| "map window unavailable")?
            .to_logical::<f64>(scale);
        if let Some((x, y, width, height)) = clipped_bounds(&bounds, size.width, size.height) {
            child
                .set_bounds(tauri::Rect {
                    position: tauri::LogicalPosition::new(x, y).into(),
                    size: tauri::LogicalSize::new(width, height).into(),
                })
                .map_err(|_| "map positioning failed")?;
            child.show().map_err(|_| "map show failed")?;
        } else {
            child.hide().map_err(|_| "map hide failed")?;
        }
        Ok(())
    }
    #[cfg(not(desktop))]
    {
        let _ = bounds;
        Err("map bridge unavailable".into())
    }
}

fn parse_message(payload: &str) -> Result<serde_json::Value, String> {
    if payload.len() > MAX_MESSAGE_BYTES {
        return Err("map message too large".into());
    }
    let value: serde_json::Value =
        serde_json::from_str(payload).map_err(|_| "invalid map message")?;
    let session = value
        .get("session")
        .and_then(|v| v.as_str())
        .ok_or("missing map session")?;
    if !(16..=128).contains(&session.len())
        || !session
            .bytes()
            .all(|c| c.is_ascii_alphanumeric() || c == b'_' || c == b'-')
        || value.get("protocol").and_then(|v| v.as_u64()) != Some(1)
        || !matches!(
            value.get("request").and_then(|v| v.as_u64()),
            Some(1..=9_007_199_254_740_991)
        )
    {
        return Err("invalid map envelope".into());
    }
    Ok(value)
}

#[tauri::command]
pub fn map_view_request(webview: tauri::Webview, payload: String) -> Result<(), String> {
    if !bridge_enabled(&webview, false) {
        return Err("map bridge unavailable".into());
    }
    let message = parse_message(&payload)?;
    if !message.get("command").is_some_and(|v| v.is_object()) {
        return Err("missing map command".into());
    }
    #[cfg(desktop)]
    {
        let state = webview.state::<Sessions>();
        let sessions = state.lock().map_err(|_| "map registry unavailable")?;
        let label = sessions.resolve(
            webview.label(),
            message["session"].as_str().ok_or("missing map session")?,
        )?;
        let child = webview
            .app_handle()
            .get_webview(&label)
            .ok_or("map view unavailable")?;
        // JSON serialization is mandatory: never concatenate user strings as JS source.
        child
            .eval(format!("window.__caiyunMapReceive?.({});", message))
            .map_err(|_| "map delivery failed".into())
    }
    #[cfg(not(desktop))]
    Err("map bridge unavailable".into())
}

#[tauri::command]
pub fn map_view_reply(webview: tauri::Webview, payload: String) -> Result<(), String> {
    use tauri::Emitter;
    if !bridge_enabled(&webview, true) {
        return Err("map bridge unavailable".into());
    }
    let message = parse_message(&payload)?;
    if !message.get("result").is_some_and(|v| v.is_object()) {
        return Err("missing map result".into());
    }
    let state = webview.state::<Sessions>();
    let sessions = state.lock().map_err(|_| "map registry unavailable")?;
    if !sessions.accepts_reply(
        webview.label(),
        message["session"].as_str().ok_or("missing map session")?,
    ) {
        return Err("map session unavailable".into());
    }
    webview
        .app_handle()
        .emit_to("main", "isolated-map-reply", message)
        .map_err(|_| "map reply failed".into())
}

#[cfg(test)]
mod tests {
    use super::*;
    #[test]
    fn map_bounds_stay_inside_window() {
        let mut bounds = MapBounds {
            x: -20.0,
            y: 30.0,
            width: 100.0,
            height: 200.0,
            visible: true,
        };
        assert_eq!(
            clipped_bounds(&bounds, 500.0, 150.0),
            Some((0.0, 30.0, 80.0, 120.0))
        );
        bounds.visible = false;
        assert_eq!(clipped_bounds(&bounds, 500.0, 150.0), None);
        bounds.visible = true;
        bounds.x = 600.0;
        assert_eq!(clipped_bounds(&bounds, 500.0, 150.0), None);
        bounds.x = f64::NAN;
        assert_eq!(clipped_bounds(&bounds, 500.0, 150.0), None);
    }
    #[test]
    fn envelope_is_bounded_and_validated() {
        assert!(
            parse_message(r#"{"protocol":1,"session":"map_test_session","request":1}"#).is_ok()
        );
        for payload in [
            "null",
            "[]",
            "{}",
            r#"{"protocol":2,"session":"map_test_session","request":1}"#,
            r#"{"protocol":1,"session":"map_test_session","request":0}"#,
        ] {
            assert!(parse_message(payload).is_err());
        }
        assert!(parse_message(&" ".repeat(MAX_MESSAGE_BYTES + 1)).is_err());
    }
}
