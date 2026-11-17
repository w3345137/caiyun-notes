use crate::app_notifications::NotificationOperation;
use std::ffi::{c_char, c_int, c_void, CString};
use tokio::sync::oneshot;

type Callback = extern "C" fn(*mut c_void, c_int);

extern "C" {
    fn caiyun_macos_notification_status(context: *mut c_void, result: Callback);
    fn caiyun_macos_notification_request(context: *mut c_void, result: Callback);
    fn caiyun_macos_notification_send(
        title: *const c_char,
        body: *const c_char,
        context: *mut c_void,
        result: Callback,
    );
}

extern "C" fn complete(context: *mut c_void, status: c_int) {
    // Each native operation calls this exactly once, with the pointer created below.
    let sender = unsafe { Box::from_raw(context.cast::<oneshot::Sender<c_int>>()) };
    let _ = sender.send(status);
}

pub async fn dispatch(operation: NotificationOperation) -> Result<&'static str, &'static str> {
    let (sender, receiver) = oneshot::channel::<c_int>();
    let context = Box::new(sender);
    match operation {
        NotificationOperation::Status => unsafe {
            caiyun_macos_notification_status(Box::into_raw(context).cast(), complete);
        },
        NotificationOperation::Request => unsafe {
            caiyun_macos_notification_request(Box::into_raw(context).cast(), complete);
        },
        NotificationOperation::Send { title, body } => {
            let title = CString::new(title).map_err(|_| "Invalid notification title")?;
            let body = CString::new(body).map_err(|_| "Invalid notification body")?;
            unsafe {
                caiyun_macos_notification_send(
                    title.as_ptr(),
                    body.as_ptr(),
                    Box::into_raw(context).cast(),
                    complete,
                );
            }
        }
    }
    match receiver.await {
        Ok(0) => Ok("prompt"),
        Ok(1) => Ok("denied"),
        Ok(2..=4) => Ok("granted"),
        _ => Err("macOS notification operation failed"),
    }
}
