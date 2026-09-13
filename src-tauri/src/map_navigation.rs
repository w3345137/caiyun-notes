/// Navigation is narrower than resource loading: SDK subresources use CSP,
/// while this native view may never become the main editor or a remote site.
pub fn allowed(url: &tauri::Url) -> bool {
    let origin_allowed = if cfg!(target_os = "windows") {
        url.scheme() == "http" && url.host_str() == Some("caiyun-map-probe.localhost")
    } else {
        url.scheme() == "caiyun-map-probe" && url.host_str() == Some("localhost")
    };
    origin_allowed
        && url.path() == "/runtime.html"
        && matches!(url.query(), None | Some("embedded=1"))
        && url.port().is_none()
        && url.username().is_empty()
        && url.password().is_none()
}

#[cfg(test)]
mod tests {
    use super::allowed;
    #[test]
    fn map_navigation_stays_in_its_own_document() {
        let origin = if cfg!(target_os = "windows") {
            "http://caiyun-map-probe.localhost"
        } else {
            "caiyun-map-probe://localhost"
        };
        for suffix in [
            "/runtime.html",
            "/runtime.html?embedded=1",
            "/runtime.html#map",
        ] {
            assert!(allowed(&format!("{origin}{suffix}").parse().unwrap()));
        }
        for suffix in ["/", "/index.html", "/runtime.html?embedded=2"] {
            assert!(!allowed(&format!("{origin}{suffix}").parse().unwrap()));
        }
        for target in [
            "https://webapi.amap.com/",
            "tauri://localhost/index.html",
            "https://notes.binapp.top/app",
            "caiyun-map-probe://other/runtime.html",
            "caiyun-map-probe://user@localhost/runtime.html",
            "about:blank",
            "javascript:alert(1)",
        ] {
            assert!(!allowed(&target.parse().unwrap()));
        }
    }
}
