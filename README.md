# 彩云笔记客户端壳

这个公开仓库只包含彩云笔记 p24 桌面 App 的 Tauri 壳、经过生产构建的内置前端资源和发布工作流，不包含 TypeScript 源码、后端、数据库脚本、江苏公司专属逻辑、HCM 集成或任何生产凭据。

## 下载与商店

| 平台 | 入口 |
| --- | --- |
| iPhone / iPad / Mac | [App Store](https://apps.apple.com/app/id6815136930)（同一 App 记录，按平台分发） |
| Windows 10/11 | [Microsoft Store](https://apps.microsoft.com/detail/9P2VQP7JKVLN) |
| Android | [官网下载](https://notes.binapp.top/download) · [APK 版本清单](https://notes.binapp.top/updates/android/latest.json) |
| Linux x86_64 | [官网下载](https://notes.binapp.top/download)（AppImage / deb） |

商店页面的可见版本以各地区审核与逐步放量为准；官网下载页始终给出当前可分发的安装包与版本号。

## 版本边界

- Web / 服务版本：`v2.8`
- 桌面发布标签：`p24`
- Tauri SemVer：`10.2.12`
- Android：`10.2.12`（versionCode `10021200`）

p24 使用内置前端入口，并为行程规划提供受限的内嵌地图子 WebView。App 启动时先从本机加载 UI 和缓存，再通过 HTTPS / WSS 连接 `https://notes.binapp.top`。官网直装版壳更新从国内 OSS 分发，支持持久化断点续传、整包签名校验和稳定设备分批发布；Microsoft Store 构建不包含原生自更新、前端热更新及第三方安装包下载入口，更新只通过 Microsoft Store 分发。macOS 红色关闭按钮与 Windows ×/Alt+F4 会隐藏主窗口；macOS 可从 Dock 恢复并通过 Cmd+Q 退出，Windows 可从系统托盘恢复或退出。真正退出前，桌面壳会等待页面、CRDT 日志和本地队列刷入本地库；Windows 再次启动时会恢复已有窗口而不是创建第二个进程。远程网页不获得通用 Tauri 文件、Store、剪贴板、窗口关闭或进程退出权限。

## 近期更新

### 10.2.12 / p24

- 邮箱笔记本里的链接恢复可点：壳层接管 `target=_blank` / `window.open`，用系统默认浏览器打开，邮件正文所在的 sandbox iframe 仍然不启用脚本。
- 思维导图、路线、录音等导出改用系统下载代理，文件直接落到“下载”文件夹，不再出现点了没反应。
- 放行 `macappstore://` 与 `ms-windows-store://`，商店版的“检查更新”可以正常跳到对应商店页面。
- 开放旧版本地数据的只读文本读取，迁移和恢复旧备份时不再被权限拦下。
- 商店版前端热更新后的重启改走 NSWorkspace / LaunchServices，绕开 App Sandbox 里直接拉起可执行文件导致的崩溃。
- Android 10.2.12（versionCode `10021200`）同步发布；Windows / macOS / Linux 直装由 p24 候选发布。

## 发布流程

发布分为两个独立阶段：

1. `build-release.yml` 构建 Windows、macOS x64 / arm64 和 Linux 签名候选，只创建 draft release，并输出候选哈希报告；两个 macOS updater tar 解包后的 `.app` 还必须通过 `codesign --deep --strict`。
2. 人工核对安装包、updater 签名和 SHA-256 后，使用 `promote-release.yml` 让生产服务器凭本次作业的短期令牌直接拉取 draft 资产并逐包验哈希；Gitee 只发布指向该服务器的小型 `latest.json`，最后发布 GitHub release。

禁止直接手工改写 `updates/latest.json`，也不能用本地 ad-hoc 签名包替代 GitHub Actions 的正式候选。

## 隐私边界

- `dist/` 只包含压缩后的通用前端运行资源及 `app-dist-manifest.json`。
- `src-tauri/` 只包含桌面壳源码、图标、权限与 updater 配置。
- 业务后端、私有扩展、组织数据和密钥不进入本仓库。
