use crate::app_notifications::NotificationOperation;
use windows::core::{HSTRING, PWSTR};
use windows::Data::Xml::Dom::XmlDocument;
use windows::Win32::Storage::Packaging::Appx::GetCurrentApplicationUserModelId;
use windows::Win32::System::WinRT::{RoInitialize, RoUninitialize, RO_INIT_MULTITHREADED};
use windows::UI::Notifications::{
    NotificationSetting, ToastNotification, ToastNotificationManager,
};

struct WinRtApartment;

impl Drop for WinRtApartment {
    fn drop(&mut self) {
        unsafe { RoUninitialize() }
    }
}

fn notification_app_id(direct_identifier: &str) -> HSTRING {
    let mut value = [0_u16; 256];
    let mut length = value.len() as u32;
    let status =
        unsafe { GetCurrentApplicationUserModelId(&mut length, Some(PWSTR(value.as_mut_ptr()))) };
    if status.is_ok() && length > 1 && length as usize <= value.len() {
        // MSIX uses PackageFamilyName!ApplicationId, which differs from Tauri's identifier.
        return HSTRING::from_wide(&value[..length as usize - 1]);
    }
    HSTRING::from(direct_identifier)
}

pub fn dispatch(
    operation: NotificationOperation,
    direct_identifier: &str,
) -> Result<&'static str, String> {
    deliver(operation, direct_identifier).map_err(|error| error.to_string())
}

fn deliver(
    operation: NotificationOperation,
    direct_identifier: &str,
) -> windows::core::Result<&'static str> {
    unsafe { RoInitialize(RO_INIT_MULTITHREADED)? };
    let _apartment = WinRtApartment;
    let notifier = ToastNotificationManager::CreateToastNotifierWithId(&notification_app_id(
        direct_identifier,
    ))?;
    if notifier.Setting()? != NotificationSetting::Enabled {
        return Ok("denied");
    }
    if let NotificationOperation::Send { title, body } = operation {
        let xml = XmlDocument::new()?;
        xml.LoadXml(&HSTRING::from("<toast><visual><binding template=\"ToastGeneric\"><text/><text/></binding></visual></toast>"))?;
        let text_nodes = xml.GetElementsByTagName(&HSTRING::from("text"))?;
        for (index, value) in [title, body].iter().enumerate() {
            let text = xml.CreateTextNode(&HSTRING::from(value))?;
            text_nodes.Item(index as u32)?.AppendChild(&text)?;
        }
        notifier.Show(&ToastNotification::CreateToastNotification(&xml)?)?;
    }
    Ok("granted")
}
