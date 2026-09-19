# 彩云笔记 · 应用商店上架总览

> 维护：随上架进度更新。最近更新：2026-09-18

## 渠道构建矩阵

同一份代码通过 Cargo 特性开关区分分发渠道（见 `src-tauri/Cargo.toml`）：

| 渠道 | 构建命令 | 整包自更新 | 前端热更新 |
|---|---|---|---|
| 官网直发版（dmg/nsis/deb/appimage） | `npm run build` | ✅ 保留 | ✅ 开启 |
| Microsoft Store 版 | `npm run build:msstore` | ❌ 已剥离 | ✅ 开启 |
| 商店保守版（审核问询时备用） | `npm run build:msstore:no-hotupdate` | ❌ 已剥离 | ❌ 关闭（回退壳内置资源） |
| Mac App Store 版（待做） | 待定（mas 配置 + entitlements） | ❌ 剥离 | 默认开启 |

特性开关语义：

- `self-update`（默认开启）：编译并注册 `tauri-plugin-updater` 与自研断点续传更新器。
  关闭后 `download_and_install_resumable_update` 命令降级为提示"请在应用商店中检查更新"，
  前端无需改动。
- `frontend-hot-update`（默认开启）：允许 `FrontendBundleManager` 从 notes.binapp.top
  拉取签名前端包。关闭后始终使用壳内置资源。
- 商店版构建时 `scripts/with-msstore-capabilities.mjs` 会在构建期间临时从
  `capabilities/default.json` 过滤 `updater:*` 权限（Tauri 2 编译期无条件加载
  capabilities 目录，权限来源被裁剪后必须同步移除引用），构建结束自动恢复。

## 三店政策要点（已核实，2026-09）

| | Mac App Store | Microsoft Store | Flathub / Snap |
|---|---|---|---|
| 入驻费用 | $99/年（已购，**待生效**，状态见 developer.apple.com/account） | 个人开发者免费（2025-06 起） | 免费 |
| 包格式 | .pkg（强制沙盒） | **MSIX（商店代签，零证书）**；MSI/EXE 直链备选 | Flatpak / snapcraft |
| 整包自更新 | 禁止 | 禁止 | 禁止（商店托管更新） |
| 前端热更新 | 允许（WebKit 解释型代码豁免，见 hot-update-policy.md） | 允许（10.2.2，不得根本改变已描述功能） | 无限制 |
| 审核 | 1–3 天，最严 | 15 分钟–3 天 | 人工审核 |

## 上架顺序

1. **Microsoft Store**（进行中，见 microsoft-store.md）——账号已注册 ✅；走 MSIX 商店代签路线，零费用。
2. **Mac App Store**——等开发者会员生效后做：entitlements + 沙盒 + pkg + 发布证书。
3. **Flathub**——缓办。注意其"有意义的开发历史"要求和 AI 生成内容披露政策
   （提交 PR 的文案/交互不得由 AI agent 自动生成）。

## 跨店共同纪律

- 商店版的应用更新全部由商店托管；不得在商店版中提示用户去官网下载更新。
- 热更新边界纪律见 [hot-update-policy.md](./hot-update-policy.md)。
- 老用户数据：彩云笔记是 local-first 架构，已同步内容在云端；
  切换渠道前引导用户确认所有页面显示"已同步"、附件"无待上传"即可，无需迁移工具。
- "彩云笔记"名称与"彩云天气/彩云小译"品牌接近，上架前需评估商标风险并准备备选名。
