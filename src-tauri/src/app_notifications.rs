#[derive(serde::Deserialize)]
#[serde(tag = "type", rename_all = "camelCase")]
pub enum NotificationOperation {
    Status,
    Request,
    Send { title: String, body: String },
}

#[tauri::command]
pub async fn app_notification_bridge(
    operation: NotificationOperation,
    app: tauri::AppHandle,
) -> Result<&'static str, String> {
    if let NotificationOperation::Send { title, body } = &operation {
        if title.trim().is_empty()
            || title.len() > 512
            || body.len() > 2048
            || title.contains('\0')
            || body.contains('\0')
        {
            return Err("Invalid notification content".into());
        }
    }
    #[cfg(target_os = "macos")]
    {
        let _ = app;
        crate::macos_notifications::dispatch(operation)
            .await
            .map_err(str::to_owned)
    }
    #[cfg(target_os = "windows")]
    {
        let identifier = app.config().identifier.clone();
        tauri::async_runtime::spawn_blocking(move || {
            crate::windows_notifications::dispatch(operation, &identifier)
        })
        .await
        .map_err(|error| error.to_string())?
    }
}
