# 彩云笔记桌面客户端壳

这个公开仓库只包含彩云笔记 p15 桌面 App 的 Tauri 壳、经过生产构建的内置前端资源和发布工作流，不包含 TypeScript 源码、后端、数据库脚本、江苏公司专属逻辑、HCM 集成或任何生产凭据。

## 版本边界

- Web / 服务版本：`v2.8`
- 桌面发布标签：`p15`
- Tauri SemVer：`10.2.3`

p15 使用内置前端入口。App 启动时先从本机加载 UI 和缓存，再通过 HTTPS / WSS 连接 `https://notes.binapp.top`。macOS 红色关闭按钮与 Windows ×/Alt+F4 会隐藏主窗口；macOS 可从 Dock 恢复并通过 Cmd+Q 退出，Windows 可从系统托盘恢复或退出。远程网页不获得 Tauri 文件、Store、剪贴板、窗口关闭或进程退出权限。

## 发布流程

发布分为两个独立阶段：

1. `build-release.yml` 构建 Windows、macOS x64 / arm64 和 Linux 签名候选，只创建 draft release，并输出候选哈希报告；两个 macOS updater tar 解包后的 `.app` 还必须通过 `codesign --deep --strict`。
2. 人工核对安装包、updater 签名和 SHA-256 后，使用 `promote-release.yml` 让生产服务器凭本次作业的短期令牌直接拉取 draft 资产并逐包验哈希；Gitee 只发布指向该服务器的小型 `latest.json`，最后发布 GitHub release。

禁止直接手工改写 `updates/latest.json`，也不能用本地 ad-hoc 签名包替代 GitHub Actions 的正式候选。

## 隐私边界

- `dist/` 只包含压缩后的通用前端运行资源及 `app-dist-manifest.json`。
- `src-tauri/` 只包含桌面壳源码、图标、权限与 updater 配置。
- 业务后端、私有扩展、组织数据和密钥不进入本仓库。
