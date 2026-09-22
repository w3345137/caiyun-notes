use serde::Serialize;
use tauri::State;

#[derive(Clone, Default)]
pub struct FrontendBundleState;

impl FrontendBundleState {
    pub fn new() -> Self {
        Self
    }
}

#[derive(Clone, Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct FrontendUpdateResult {
    status: &'static str,
    release_id: Option<String>,
    min_shell_version: Option<String>,
}

#[tauri::command]
pub async fn check_frontend_bundle_update(
    _state: State<'_, FrontendBundleState>,
) -> Result<FrontendUpdateResult, String> {
    Ok(FrontendUpdateResult {
        status: "upToDate",
        release_id: None,
        min_shell_version: None,
    })
}
