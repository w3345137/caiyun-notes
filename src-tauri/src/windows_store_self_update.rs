// Store builds can only stage and apply updates for the current Store product.
use std::sync::atomic::{AtomicBool, Ordering};
use windows::ApplicationModel::Package;
use windows::Services::Store::{StoreContext, StorePackageUpdateState};

static RUNNING: AtomicBool = AtomicBool::new(false);
static STAGED: AtomicBool = AtomicBool::new(false);
use windows::Win32::System::WinRT::{RoInitialize, RoUninitialize, RO_INIT_MULTITHREADED};

struct Apartment;
impl Drop for Apartment {
    fn drop(&mut self) {
        unsafe { RoUninitialize() };
    }
}

struct Running;
impl Drop for Running {
    fn drop(&mut self) {
        RUNNING.store(false, Ordering::Release);
    }
}

fn perform(install: bool) -> windows::core::Result<&'static str> {
    if install && !STAGED.load(Ordering::Acquire) {
        return Ok("idle");
    }
    // This job runs on a blocking worker, never on the UI apartment.
    unsafe { RoInitialize(RO_INIT_MULTITHREADED)? };
    let _apartment = Apartment;
    if Package::Current()?.Id()?.FamilyName()? != "BinApp.547813EA77836_hex6nfb75njyr" {
        return Ok("unavailable");
    }
    let store = StoreContext::GetDefault()?;
    if !store.CanSilentlyDownloadStorePackageUpdates()? {
        return Ok("retry");
    }
    let updates = store.GetAppAndOptionalStorePackageUpdatesAsync()?.get()?;
    if updates.Size()? == 0 {
        STAGED.store(false, Ordering::Release);
        return Ok("idle");
    }
    let operation = if install {
        store.TrySilentDownloadAndInstallStorePackageUpdatesAsync(&updates)?
    } else {
        store.TrySilentDownloadStorePackageUpdatesAsync(&updates)?
    };
    if operation.get()?.OverallState()? != StorePackageUpdateState::Completed {
        return Ok("retry");
    }
    STAGED.store(!install, Ordering::Release);
    Ok(if install { "installed" } else { "staged" })
}

#[tauri::command]
pub async fn update_current_store_package(install: bool) -> Result<&'static str, String> {
    if RUNNING.swap(true, Ordering::AcqRel) {
        return Ok("busy");
    }
    tauri::async_runtime::spawn_blocking(move || {
        let _running = Running;
        perform(install).map_err(|error| error.to_string())
    }).await.map_err(|error| error.to_string())?
}
