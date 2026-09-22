# Microsoft Store 提交材料（彩云笔记 Windows 版）

> 提交时在 Partner Center 按此表填写。最后更新：2026-09-19。
> 隐私政策 URL（必填）：https://notes.binapp.top/privacy

## 基本信息

| 项 | 值 |
|---|---|
| 类别 | 生产力（Productivity） |
| 年龄分级 | 开发者已确认并保存 IARC 条款；Partner Center 回读 Microsoft 12+、IARC 12+，分级 ID 暂为待定 |
| 隐私政策 | https://notes.binapp.top/privacy |
| 支持联系 | 767493611@qq.com 或 https://notes.binapp.top |
| 系统要求 | Windows 10 1809+（x64）；依赖 WebView2 运行时（Win11 自带；Win10 大多已装，认证备注说明） |
| 定价 | 免费 |

## 认证备注（Notes for certification）

- 审核使用已验证可登录且仅含演示数据的 `test01@notes.app`；邮箱与密码分别保存在 Partner Center 的非公开测试凭据字段，公开描述和本文件均不记录密码。
- 注明：笔记数据云端同步，需要联网；应用内部分功能（邮箱、网盘、大模型、地图）需要用户自行配置第三方服务凭据，不配置不影响核心笔记功能。
- 应用为桌面桥全信任进程（Tauri/WebView2）；原生壳和内置前端代码均由 Microsoft Store 审核包分发，应用内不含其他平台安装包下载入口。

## 中文（简体）列表

**简短描述**（≤ 280 字符）：

彩云笔记——本地优先、云端同步的笔记与协作空间。打开就是刚才的内容，断网也能继续记录；多人编辑自动合并，会议结论自然长成督办。

**详细描述**：

彩云笔记是一款本地优先的云端笔记应用。

【可靠记录】
- 页面、页签常态化保存本地副本，打开应用即是上次内容
- 断网、弱网下继续记录，连接恢复后自动同步
- 恢复中心保留本地恢复副本，异常时有迹可循

【结构化整理】
- 笔记本 → 分区 → 页面 → 页签，熟悉的层级
- 表格、待办、思维导图、文件附件与图片，都在同一份内容里
- 周计划与会议督办联动：@成员 的事项自动进入对应周计划

【实时协作】
- 多人编辑自动合并，共享权限与页面锁划定清晰边界
- 同事实时看到更新，互不打扰

【一个空间，更多工作】
- 邮箱笔记：把有价值的邮件留在笔记里
- 行程规划：内嵌地图、路线与时间安排
- AI 助手：语音转写与内容整理（自行配置大模型服务）
- 网盘附件：OneDrive、百度网盘、七牛云、AnyShare

数据安全：HTTPS 加密传输、本地副本、共享权限边界。隐私政策：https://notes.binapp.top/privacy

**搜索关键词建议**：笔记, 云笔记, 协作, 思维导图, 周计划, 待办, 备忘录, notes

## English listing

**Short description**:

Caiyun Notes — a local-first, cloud-synced note and collaboration space. Your content is right where you left it; keep writing offline and sync when back online. Multiplayer editing merges automatically.

**Description**:

Caiyun Notes is a local-first cloud note-taking app.

RELIABLE CAPTURE
- Local copies of pages and tabs; open the app and continue instantly
- Keep writing on flaky networks; sync resumes automatically
- Recovery center keeps local recovery copies

STRUCTURED ORGANIZATION
- Notebooks → sections → pages → tabs
- Tables, todos, mind maps, attachments and images in one document
- Weekly plans linked with meeting action items

REAL-TIME COLLABORATION
- Automatic merge for multiplayer editing
- Clear sharing permissions and page locks

ONE SPACE FOR MORE
- Email notes, trip planning with maps, AI transcription (bring your own key), cloud-drive attachments

Security: HTTPS encryption in transit, local copies, permission boundaries. Privacy policy: https://notes.binapp.top/privacy

**Keywords**: notes, cloud notes, collaboration, mind map, weekly plan, todo

## 截图清单（1366×768 或更大，PNG，1–5 张）

已备妥（`docs/store/screenshots/`，真实应用界面、演示数据、已隐去真人信息）：

1. `01-weekly-plan-table.png` — 主工作区：双栏树 + 页签 + 周计划（待办勾选 + 彩色表格）
2. `02-mindmap.png` — 思维导图块（中心主题 + 三分支）
3. `03-app-downloads.png` — 应用内下载弹窗（四平台安装包入口）

如需替换/追加（建议候选）：协作权限弹窗、行程规划地图块（需配置高德密钥后截图）、邮箱笔记线程（需配置测试邮箱）。
