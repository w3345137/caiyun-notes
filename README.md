# 彩云笔记 (CaiYun Notes)

> 面向个人和小团队知识管理的全栈笔记应用，支持富文本编辑、表格、思维导图、录音、共享笔记、页面锁和 CRDT 实时同步。

在线体验：[https://notes.binapp.top](https://notes.binapp.top)

---

## 仓库状态

本地已对 GitHub 与 Gitee 远端做过对比：

- Gitee：`gitee/main` 与 `gitee/master` 当前指向 `p7`，包含自动保存、录音、更新源、云盘等最近发布内容。
- GitHub：`origin/main` 当前落后于 Gitee，缺少 `p7` 之后的内容，后续发布时需要同步推送。
- 本地工作区：已新增 v2.5 相关改动，包括 CRDT 协同后端、30 天登录滑动续期、Android 验证版工程、录音/云盘权限逻辑与同步体验优化。

当前 README 以“Gitee 最新内容 + 本地 v2.5 新增内容”为准。

---

## 最近更新

### v2.5 协同与同步

- 编辑器统一进入 CRDT 协同模式，正文内容通过 Yjs/Hocuspocus 实时同步。
- 保留页面锁机制：被他人锁定时不可编辑，但仍可实时看到远端内容更新和协同状态。
- 页面切换先显示本地快照，再后台连接协同文档，降低空白等待和切页跳动。
- 修复共享根笔记本与子页面权限不一致导致的协同 `Forbidden`。
- “最后修改”在 CRDT 输入时先使用本地乐观时间展示，服务端保存后再校准。
- 移除用户菜单里的“保存到云端”，日常编辑走自动保存和实时同步。

### 登录滑动续期

- JWT 有效期从 7 天调整为 30 天。
- 新增后端接口：`POST /api/auth/v1/refresh`。
- 前端每小时检查 token，剩余不足 7 天时静默续期；连续 30 天不使用才需要重新登录。
- CRDT WebSocket 和普通 API 请求都从 `localStorage.notesapp_token` 读取最新 token。

### 录音与转写

- 录音入口会检查当前笔记本的云盘绑定状态，未绑定时给出明确提示。
- 大模型只影响录音后的自动转写；未配置或不支持语音转写时，录音保存逻辑仍按云盘规则处理。
- Web / Tauri / Android WebView 均按浏览器能力请求麦克风权限。

### Tauri 与 Android 验证版

- 桌面端基于 Tauri 2，首选更新源为 `https://notes.binapp.top/updates/latest.json`，并保留 Gitee/GitHub 作为备用更新源。
- 已初始化 Tauri Android 工程，Android 壳加载线上 Web 前端，因此前端发布可直接在 Android 壳内生效。
- Android 已配置网络和录音权限：`INTERNET`、`RECORD_AUDIO`。
- 已生成验证 APK：
  - Debug 侧载包：`src-tauri/gen/android/app/build/outputs/apk/universal/debug/app-universal-debug.apk`
  - Release 未签名包：`src-tauri/gen/android/app/build/outputs/apk/universal/release/app-universal-release-unsigned.apk`

---

## 功能特性

### 富文本编辑

基于 TipTap / ProseMirror：

- 标题、段落、引用块、代码块
- 有序列表、无序列表、待办事项
- 粗体、斜体、删除线、下划线、高亮
- 表格、单元格背景色、列宽拖拽、合并单元格
- 图片、附件、文件夹、路线、录音块
- 思维导图，当前主要使用 `simple-mind-map`
- 选中内容复制为图片

### 笔记本与共享

- 树形笔记本结构，支持多级页面
- 拖拽排序和侧边栏折叠
- 页面锁，减少多人误编辑
- 根笔记本共享、邀请加入、共享用户只读/可编辑权限
- 共享页面实时同步，锁定页面仍可观看更新

### 云端与本地保护

- PostgreSQL 云端存储
- 本地 IndexedDB 草稿/备份保护
- 大文档输入时避免每次按键全量保存正文
- 云盘集成用于附件、录音等文件持久化

### 账户与安全

- 邮箱注册、验证码验证、登录、密码重置
- JWT HMAC-SHA256 + bcrypt
- 30 天滑动续期
- 管理后台：用户管理、笔记管理、数据统计
- 邮件正文渲染已引入 HTML 净化能力

### 客户端

- Web 浏览器
- Tauri 桌面端：Windows、macOS、Linux
- Tauri Android 验证版：首版用于登录、同步、编辑、录音权限和 APK 安装验证

---

## 技术栈

| 层级 | 技术选型 |
| --- | --- |
| 前端框架 | React 18 + TypeScript + Vite |
| 富文本引擎 | TipTap / ProseMirror |
| 实时协同 | Yjs + Hocuspocus |
| 状态管理 | Zustand |
| 思维导图 | simple-mind-map |
| 桌面/移动壳 | Tauri 2 + Rust |
| 后端 | Node.js 原生 HTTP 服务 |
| 数据库 | PostgreSQL |
| 认证 | JWT HMAC-SHA256 + bcrypt |
| 邮件服务 | nodemailer |
| 反向代理 | Nginx |
| 进程管理 | PM2 |
| 自动更新 | Tauri updater + notes.binapp.top / Gitee / GitHub |

---

## 架构概览

```text
┌────────────────────────────────────────────────────────────┐
│                         客户端                              │
│  Web 浏览器        Tauri 桌面端        Tauri Android 验证版   │
└──────────────┬────────────────┬────────────────────────────┘
               │ HTTPS / WSS
               ▼
┌────────────────────────────────────────────────────────────┐
│                    Nginx / 静态资源 / 代理                  │
└──────────────┬─────────────────────────────────────────────┘
               │
               ▼
┌────────────────────────────────────────────────────────────┐
│ Node.js 后端                                                │
│ 认证 / 笔记 API / 分享权限 / 云盘 / 邮件 / 管理后台           │
└──────────────┬───────────────────────┬─────────────────────┘
               │                       │
               ▼                       ▼
┌────────────────────────────┐   ┌───────────────────────────┐
│ PostgreSQL                  │   │ Hocuspocus + Yjs CRDT      │
│ 用户 / 笔记 / 共享 / 设置    │   │ 实时协同文档与快照持久化     │
└────────────────────────────┘   └───────────────────────────┘
```

---

## 开发与验证

常用命令：

```bash
npm run dev
npm run build:prod
npm run lint
npx tsc -b --noEmit
node --check backend/server.js
```

Android 验证版：

```bash
npm run android:init
npm run android:dev
npm run android:build
npm run android:build:debug
```

Android 本地构建需要 JDK、Android SDK、NDK 和 Rust Android targets。当前验证环境使用：

- JDK 17
- Android SDK Platform 36
- Android Build Tools 36.0.0
- NDK 28.2.13676358
- Rust targets：`aarch64-linux-android`、`armv7-linux-androideabi`、`i686-linux-android`、`x86_64-linux-android`

---

## 发布注意

- Gitee 国内访问更稳定，适合作为热更新 JSON 和下载的备用源。
- GitHub 当前相对 Gitee 落后，发布后需要同步推送，避免远端内容漂移。
- Android 首版复用线上 Web 前端；原生权限、Tauri 配置或签名变化才需要重新打 APK。
- Release APK 需要正式签名后再分发；debug APK 仅用于验证和侧载测试。

---

© 2026 彩云笔记
