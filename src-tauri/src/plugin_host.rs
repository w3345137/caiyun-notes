//! Plugin API v1 native capabilities. Only the trusted main webview may call these commands.
//! Plugins and remote website windows receive NO Tauri capabilities.
use serde::{Deserialize, Serialize};
use sha2::{Digest, Sha256};
use std::{
    collections::HashMap,
    sync::{
        atomic::{AtomicBool, Ordering},
        Arc, Mutex,
    },
    time::{Duration, Instant},
};
use tauri::Manager;

#[derive(Default)]
pub struct PluginHostState {
    requests: Mutex<HashMap<String, (Arc<AtomicBool>, Instant)>>,
}
fn main_only(view: &tauri::Webview) -> Result<(), String> {
    if view.label() != "main" {
        Err("plugin host access denied".into())
    } else {
        Ok(())
    }
}
#[tauri::command]
pub fn plugin_host_version(webview: tauri::Webview) -> Result<u8, String> {
    main_only(&webview)?;
    Ok(1)
}
fn origin(url: &tauri::Url) -> String {
    url.origin().ascii_serialization()
}
fn loopback_host(host: &str) -> bool {
    matches!(host, "localhost" | "127.0.0.1" | "[::1]" | "::1")
}
fn validate_url(value: &str, allowed: &[String]) -> Result<tauri::Url, String> {
    let url = tauri::Url::parse(value).map_err(|_| "invalid URL")?;
    if value.len() > 4096
        || !url.username().is_empty()
        || url.password().is_some()
        || allowed.len() > 16
        || !allowed.contains(&origin(&url))
    {
        return Err("network permission denied".into());
    }
    if url.scheme() != "https"
        && !(url.scheme() == "http" && loopback_host(url.host_str().unwrap_or("")))
    {
        return Err("unsupported URL".into());
    }
    Ok(url)
}
fn public_address(ip: std::net::IpAddr) -> bool {
    match ip {
        std::net::IpAddr::V4(v) => {
            let a = v.octets();
            !v.is_private()
                && !v.is_loopback()
                && !v.is_link_local()
                && !v.is_multicast()
                && !v.is_broadcast()
                && !v.is_unspecified()
                && a[0] != 0
                && a[0] < 224
                && !(a[0] == 100 && (64..=127).contains(&a[1]))
                && !(a[0] == 198 && (a[1] == 18 || a[1] == 19))
        }
        std::net::IpAddr::V6(v) => {
            let s = v.segments();
            !v.is_loopback()
                && !v.is_unspecified()
                && !v.is_multicast()
                && (s[0] & 0xfe00) != 0xfc00
                && (s[0] & 0xffc0) != 0xfe80
                && v.to_ipv4_mapped()
                    .map(|v| public_address(v.into()))
                    .unwrap_or(true)
        }
    }
}
#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub struct HttpResponse {
    status: u16,
    ok: bool,
    body: String,
    content_type: String,
}
#[allow(clippy::too_many_arguments)] // Keep the versioned Tauri RPC payload flat.
#[tauri::command]
pub async fn plugin_http_request(
    webview: tauri::Webview,
    request_id: String,
    url: String,
    method: String,
    headers: HashMap<String, String>,
    body: Option<String>,
    allowed_origins: Vec<String>,
    timeout_ms: u64,
) -> Result<HttpResponse, String> {
    main_only(&webview)?;
    if request_id.len() > 80
        || !matches!(method.as_str(), "GET" | "POST" | "PUT" | "PATCH" | "DELETE")
        || headers.len() > 20
        || body
            .as_ref()
            .map(|v| v.len() > 1024 * 1024)
            .unwrap_or(false)
    {
        return Err("invalid request".into());
    }
    let parsed = validate_url(&url, &allowed_origins)?;
    for (k, v) in &headers {
        let lower = k.to_lowercase();
        if matches!(
            lower.as_str(),
            "cookie"
                | "set-cookie"
                | "host"
                | "origin"
                | "referer"
                | "connection"
                | "content-length"
        ) || lower.starts_with("proxy-")
            || lower.starts_with("sec-")
            || v.len() > 8192
            || v.contains(['\r', '\n'])
        {
            return Err("invalid header".into());
        }
    }
    let state = webview.state::<PluginHostState>();
    let flag = {
        let mut requests = state.requests.lock().map_err(|_| "host unavailable")?;
        requests.retain(|_, (_, t)| t.elapsed() < Duration::from_secs(120));
        if requests.len() >= 128 {
            return Err("too many requests".into());
        }
        requests
            .entry(request_id.clone())
            .or_insert_with(|| (Arc::new(AtomicBool::new(false)), Instant::now()))
            .0
            .clone()
    };
    let work = async {
        let host = parsed.host_str().ok_or("missing host")?.to_owned();
        let port = parsed.port_or_known_default().ok_or("missing port")?;
        let local = loopback_host(&host);
        let mut builder = reqwest::Client::builder()
            .redirect(reqwest::redirect::Policy::none())
            .timeout(Duration::from_millis(timeout_ms.clamp(1000, 60000)))
            .connect_timeout(Duration::from_secs(10))
            .no_proxy();
        if !local {
            let lookup = host.clone();
            let addresses = tokio::task::spawn_blocking(move || {
                use std::net::ToSocketAddrs;
                (lookup.as_str(), port)
                    .to_socket_addrs()
                    .map(|a| a.collect::<Vec<_>>())
            })
            .await
            .map_err(|_| "DNS failed")?
            .map_err(|_| "DNS failed")?;
            if addresses.is_empty() || addresses.iter().any(|a| !public_address(a.ip())) {
                return Err("private address denied".to_string());
            }
            builder = builder.resolve_to_addrs(&host, &addresses);
        } else if host == "localhost" {
            builder = builder.resolve(
                "localhost",
                std::net::SocketAddr::from(([127, 0, 0, 1], port)),
            );
        }
        let client = builder.build().map_err(|_| "HTTP unavailable")?;
        let mut req = client.request(method.parse().map_err(|_| "invalid method")?, parsed);
        for (k, v) in headers {
            req = req.header(k, v)
        }
        if let Some(value) = body {
            req = req.body(value)
        }
        let mut response = req.send().await.map_err(|_| "network request failed")?;
        let status = response.status().as_u16();
        if (300..400).contains(&status) {
            return Err("redirect denied".into());
        }
        let content_type = response
            .headers()
            .get("content-type")
            .and_then(|v| v.to_str().ok())
            .unwrap_or("")
            .to_owned();
        let mut bytes = Vec::new();
        while let Some(chunk) = response.chunk().await.map_err(|_| "response failed")? {
            if bytes.len() + chunk.len() > 2 * 1024 * 1024 {
                return Err("response too large".into());
            }
            bytes.extend_from_slice(&chunk)
        }
        Ok(HttpResponse {
            status,
            ok: (200..300).contains(&status),
            body: String::from_utf8(bytes).map_err(|_| "only UTF-8 responses supported")?,
            content_type,
        })
    };
    let result = tokio::select! { value=work=>value, _=async {loop {if flag.load(Ordering::Relaxed){break}tokio::time::sleep(Duration::from_millis(50)).await}}=>Err("request stopped".into()) };
    if let Ok(mut requests) = state.requests.lock() {
        requests.remove(&request_id);
    }
    result
}
#[tauri::command]
pub fn plugin_http_cancel(webview: tauri::Webview, request_id: String) -> Result<(), String> {
    main_only(&webview)?;
    if request_id.len() > 80 {
        return Err("invalid request".into());
    }
    let state = webview.state::<PluginHostState>();
    let mut requests = state.requests.lock().map_err(|_| "host unavailable")?;
    requests.retain(|_, (_, t)| t.elapsed() < Duration::from_secs(120));
    if requests.len() >= 128 {
        return Err("too many requests".into());
    }
    requests
        .entry(request_id)
        .or_insert_with(|| (Arc::new(AtomicBool::new(false)), Instant::now()))
        .0
        .store(true, Ordering::Relaxed);
    Ok(())
}

#[derive(Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct Website {
    url: String,
    origins: Vec<String>,
    persistent_session: bool,
}
fn label(account: &str, id: &str) -> String {
    format!(
        "plugin-site-{}",
        hex::encode(Sha256::digest(format!("{account}\0{id}").as_bytes()))
    )
}
#[tauri::command]
pub async fn plugin_website_open(
    webview: tauri::Webview,
    account: String,
    id: String,
    website: Website,
    script: String,
) -> Result<(), String> {
    main_only(&webview)?;
    if account.is_empty() || account.len() > 150 || id.len() > 100 || script.len() > 1024 * 1024 {
        return Err("invalid website plugin".into());
    }
    let url = validate_url(&website.url, &website.origins)?;
    if url.scheme() != "https" || website.origins.iter().any(|o| !o.starts_with("https://")) {
        return Err("website requires HTTPS".into());
    }
    #[cfg(desktop)]
    {
        let app = webview.app_handle();
        let name = label(&account, &id);
        if let Some(existing) = app.get_webview_window(&name) {
            existing.show().map_err(|_| "window unavailable")?;
            existing.set_focus().map_err(|_| "window unavailable")?;
            return Ok(());
        }
        let allowed = website.origins.clone();
        let script_origins = serde_json::to_string(&allowed).map_err(|_| "invalid origins")?;
        let mut builder =
            tauri::WebviewWindowBuilder::new(app, &name, tauri::WebviewUrl::External(url))
                .title(&id)
                .inner_size(1100., 780.)
                .on_navigation(move |u| {
                    u.scheme() == "https"
                        && u.username().is_empty()
                        && u.password().is_none()
                        && allowed.contains(&origin(u))
                })
                .on_new_window(|_, _| tauri::webview::NewWindowResponse::Deny)
                .initialization_script(format!(
            "if(window===window.top&&{script_origins}.includes(location.origin)){{\n{script}\n}}"
        ));
        #[cfg(target_os = "macos")]
        {
            if website.persistent_session {
                let version = std::process::Command::new("/usr/bin/sw_vers")
                    .arg("-productVersion")
                    .output()
                    .map_err(|_| "cannot determine macOS version")?;
                let major = String::from_utf8_lossy(&version.stdout)
                    .split('.')
                    .next()
                    .unwrap_or("")
                    .trim()
                    .parse::<u32>()
                    .unwrap_or(0);
                if major < 14 {
                    return Err(
                        "独立持久登录会话需要 macOS 14 或更新版本；可将插件设置为临时会话".into(),
                    );
                }
                let hash = Sha256::digest(format!("{account}\0{id}").as_bytes());
                let mut identifier = [0u8; 16];
                identifier.copy_from_slice(&hash[..16]);
                builder = builder.data_store_identifier(identifier);
            } else {
                builder = builder.incognito(true)
            }
        }
        #[cfg(not(target_os = "macos"))]
        {
            if website.persistent_session {
                builder = builder.data_directory(
                    app.path()
                        .app_local_data_dir()
                        .map_err(|_| "storage unavailable")?
                        .join("plugin-websites")
                        .join(&name),
                )
            } else {
                builder = builder.incognito(true)
            }
        }
        builder.build().map_err(|_| "无法创建独立网站窗口")?;
        Ok(())
    }
    #[cfg(not(desktop))]
    {
        let _ = (account, id, script);
        Err("网站插件目前仅支持桌面客户端".into())
    }
}
#[tauri::command]
pub fn plugin_website_close(
    webview: tauri::Webview,
    account: String,
    id: Option<String>,
) -> Result<(), String> {
    main_only(&webview)?;
    #[cfg(desktop)]
    {
        let wanted = id.map(|id| label(&account, &id));
        for (name, w) in webview.app_handle().webview_windows() {
            if wanted
                .as_ref()
                .map(|v| v == &name)
                .unwrap_or_else(|| name.starts_with("plugin-site-"))
            {
                let _ = w.close();
            }
        }
    }
    Ok(())
}
pub fn runtime_response(path: &str) -> tauri::http::Response<Vec<u8>> {
    let (kind, body) = match path {
        "/v1.html" => (
            "text/html; charset=utf-8",
            include_bytes!("../plugin-runtime/v1.html").to_vec(),
        ),
        "/v1.js" => (
            "text/javascript; charset=utf-8",
            include_bytes!("../plugin-runtime/v1.js").to_vec(),
        ),
        _ => ("text/plain", Vec::new()),
    };
    tauri::http::Response::builder().status(if body.is_empty(){404}else{200}).header("Content-Type",kind).header("Cache-Control","no-store").header("X-Content-Type-Options","nosniff").header("Content-Security-Policy","sandbox allow-scripts; default-src 'none'; script-src 'self' 'unsafe-inline' blob: caiyun-plugin: http://caiyun-plugin.localhost; style-src 'unsafe-inline'; img-src data: blob:; connect-src 'none'; worker-src blob:; frame-src 'none'; base-uri 'none'; form-action 'none'; object-src 'none'").body(body).expect("static plugin response")
}
#[cfg(test)]
mod tests {
    use super::*;
    #[test]
    fn origins_are_exact() {
        assert!(validate_url(
            "http://127.0.0.1:8787/api",
            &["http://127.0.0.1:8787".into()]
        )
        .is_ok());
        assert!(validate_url(
            "https://example.com.evil.test/",
            &["https://example.com".into()]
        )
        .is_err());
        assert!(
            validate_url("https://user@example.com/", &["https://example.com".into()]).is_err()
        );
        assert!(validate_url("file:///tmp/a", &[]).is_err());
    }
    #[test]
    fn private_ip_rejected() {
        for ip in [
            "127.0.0.1",
            "192.168.1.1",
            "10.0.0.1",
            "169.254.169.254",
            "100.64.1.1",
            "::1",
            "::ffff:127.0.0.1",
            "fc00::1",
        ] {
            assert!(!public_address(ip.parse().unwrap()), "{ip}")
        }
        assert!(public_address("8.8.8.8".parse().unwrap()));
    }
    #[test]
    fn sessions_are_scoped() {
        assert_ne!(label("a", "p"), label("b", "p"));
        assert_ne!(label("a", "p"), label("a", "q"));
    }
    #[test]
    fn runtime_is_sandboxed() {
        let r = runtime_response("/v1.html");
        assert!(r.headers()["Content-Security-Policy"]
            .to_str()
            .unwrap()
            .contains("sandbox allow-scripts"));
        assert_eq!(runtime_response("/../../index.html").status(), 404);
    }
}
