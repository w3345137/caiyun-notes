# Linux 官方商店上架 Runbook（Flathub 主 / Snap 辅）

> 目标：把彩云笔记 Linux 版（Tauri / WebKitGTK）提交到 Linux 官方商店。
> 结论：**Flathub 为主渠道、Snap Store 为辅**；官网 deb/AppImage 直发继续保留。
> 依据：Flathub 提交文档与 Snapcraft 文档（2026-09 核）。

## 渠道对比

| | ✅ Flathub（主渠道） | Snap Store（辅渠道） |
|---|---|---|
| 包格式 / 构建器 | Flatpak + flatpak-builder（manifest 草案见 `flatpak/top.binapp.notes.yml`） | snap + snapcraft |
| 构建期网络 | **全程离线**：crates 必须 vendored（用 flatpak-cargo-generator 从 `src-tauri/Cargo.lock` 生成 cargo-sources.json） | 构建期可联网，无需 vendoring，上手门槛低 |
| WebKitGTK 栈 | org.gnome.Platform 运行时自带 webkit2gtk-4.1（soup3），GTK3 随之可用，无需自行打包 | gnome-42-2204 扩展（content snap）提供 GTK3/WebKitGTK 栈 |
| tray 依赖 | libappindicator 不在 GNOME Platform，需加 module 构建 libayatana-appindicator（manifest 中已标 TODO） | 同左，需在 snap 内打包 |
| 沙盒 | Flatpak 沙盒 + XDG portal | strict confinement + interfaces（不得申请 classic） |
| 审核 | **人工审核**（向 flathub 组织提 PR），有"有意义的开发历史"要求和 AI 生成内容披露政策 | 自动审核为主 |
| 更新机制 | 商店托管（OSTree），禁止应用内整包自更新 | 商店托管、自动推送，同样禁止应用内整包自更新 |
| 分发覆盖 | 跨发行版事实标准（Fedora/Ubuntu/Arch 均原生支持） | Ubuntu 系最强；其他发行版需先装 snapd |
| 费用 | 免费 | 免费 |

## 对本应用的适配要点（沙盒 / 门户）

- **网络**：云同步、前端热更新签名包下载、地图 API → flatpak `--share=network` / snap `network` plug。
- **WebView**：WKWebView 对应 Linux 的 WebKitGTK 沙盒多进程由运行时自带，开箱可用；
  `--device=dri` 开启图形加速。
- **通知**：tauri-plugin-notification 走 `org.freedesktop.Notifications`（D-Bus），
  flatpak 需 `--talk-name=org.freedesktop.Notifications`。
- **文件对话框**：tauri-plugin-dialog 是 GTK 原生对话框，沙盒内需经 XDG portal
  （`GTK_USE_PORTAL=1`），用户选择的文件自动获得访问权，无需静态文件系统授权。
- **数据目录**：capabilities 的 fs scope 只覆盖 `$APPLOCALDATA`/`$APPDATA`/`$APPCONFIG`，
  flatpak 下落在 `~/.var/app/top.binapp.notes/` 容器内，无需额外授权。
- **剪贴板 / 打开链接**：经 wayland/x11 socket 与系统服务正常工作。
- **自更新**：两家商店都要求更新由商店托管 → 商店构建与 Apple/MS 渠道一致，
  用 `--no-default-features --features frontend-hot-update`（前端热更新在 Linux 商店无限制，
  见 hot-update-policy.md）。updater 权限剥离已由 build.rs 按特性自动处理，无需包装脚本。

## 分阶段路线

1. **官网 deb/AppImage 直发（现状，继续）**：tauri.conf.json 的 bundle targets 已含
   `deb`、`appimage`，无需改动，随 `npm run build` 一并产出、走既有自更新体系。
2. **Flathub（主渠道）**：manifest 草案 `flatpak/top.binapp.notes.yml`，
   成熟后向 flathub/top.binapp.notes 仓库提 PR。前置 TODO：
   - **离线 vendoring**：flatpak-cargo-generator 生成 cargo-sources.json（Flathub 硬性要求）；
   - **metainfo 与 desktop 文件**（`top.binapp.notes.metainfo.xml` / `.desktop`）：提审硬性要求，
     含截图链接、发行说明、内容分级；
   - **域名验证**：app-id `top.binapp.notes` 是官网 notes.binapp.top 的反向域名，
     需在 binapp.top 站点完成 Flathub 域名验证；
   - **tray 依赖**：libayatana-appindicator module（见 manifest TODO）；
   - 审核 PR 的文案与交互不得由 AI agent 自动生成（见 README 已记录的披露政策）。
3. **Snap（辅渠道）**：snapcraft.yaml（strict + gnome 扩展），可全程在 Launchpad/CI 联网构建，
   延后于 Flathub 实施。

## 推荐结论

**Flathub 主、Snap 辅**。Flathub 是跨发行版事实标准，且 GNOME Platform 自带本应用所需的
WebKitGTK 4.1 栈、契合度最高；Snap 构建门槛低（构建期可联网）但分发偏 Ubuntu 系，作为补充渠道。
