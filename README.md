# 彩云笔记桌面客户端壳

这个仓库只包含彩云笔记的 Tauri 桌面客户端壳，用于构建 macOS、Windows 和 Linux 安装包。

真实业务系统加载自：

```text
https://notes.binapp.top
```

本仓库不包含网页前端、后端服务、数据库脚本、江苏公司专属逻辑、HCM 集成或任何私有业务代码。

## 版本边界

- 服务/网页版本：显示在 `https://notes.binapp.top`，例如 `v2.7`。
- 桌面客户端版本：由 `src-tauri/tauri.conf.json` 管理，例如 `p9（内部 SemVer 为 9.0.0，仅用于 Tauri updater 比较）`。

只有 Tauri 插件、权限、CSP、窗口、更新能力或加载地址变化时，才需要发布新的桌面客户端版本。

## 发布

推送 `p*` 标签后，GitHub Actions 会构建三端安装包、生成 Tauri updater 所需签名产物和 `latest.json`，并同步到 Gitee 与 `https://notes.binapp.top/updates/`。
