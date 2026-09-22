# Microsoft Store 上架 Runbook（MSIX 零证书路线）

> 目标：把彩云笔记 Windows 版（Tauri / WebView2）提交到 Microsoft Store。
> 路线：**MSIX 包 + 微软商店代签，全程零费用**（账号免费 + 无需购买代码签名证书）。
> 商店条款、提交表单和安装行为会变化；每次提交前重新核验当前规则及真实包。

## 路线选择

| | ✅ MSIX（本路线） | MSI/EXE 直链（10.2.9，备选） |
|---|---|---|
| 签名 | 微软商店收录时代签，**不用买证书** | 需自购 OV 证书（$100–400/年） |
| 下载/更新 | 商店全托管 | 自己托管带版本号 URL，每次发版手动更新 |
| 打包 | makeappx 一道转换（脚本已备好） | `npm run build:msstore:msi` 直接出 MSI |
| 运行环境 | 程序目录只读；WebView2 本地资料目录可能受 MSIX 文件虚拟化影响，旧版离线数据迁移必须单独验收 | 无 |

何时退回备选路线：MSIX 转换/审核遇到不可解问题时，走 MSI 直链 + 购买 OV 证书
（证书顺带可用于官网直发安装包签名）。MSI 构建命令已就绪：`npm run build:msstore:msi`
（`build:msstore` 默认 `--no-bundle` 只产 exe 供 MSIX 打包，云端无 WiX 也能跑通）。

## 一、账号（✅ 已完成）

个人开发者，已注册（2025-06 起免费）。

## 二、获取应用标识信息

Partner Center → 创建应用（先"保留名称"：彩云笔记，如被占用准备备选名）→
**产品管理 → 应用标识**，复制三个值，打包时要用：

- `Package/Identity/Name`（形如 `12345YourName.CaiyunNotes`）
- `Package/Identity/Publisher`（形如 `CN=XXXXXXXX-XXXX-XXXX-XXXX-XXXXXXXXXXXX`）
- `Package/Identity/PublisherDisplayName`

## 三、云端构建 + 打包 MSIX（GitHub Actions，无需 Windows 机器）

工作流已备好：`.github/workflows/build-msstore.yml`（与现有 build-release.yml 同套约定）。

**一次性设置**：仓库 → Settings → Secrets and variables → Actions → **Variables**，添加：

- `MSSTORE_IDENTITY_NAME` ← Package/Identity/Name
- `MSSTORE_PUBLISHER` ← Package/Identity/Publisher（CN=...）
- `MSSTORE_PUBLISHER_DISPLAY_NAME` ← 发布者显示名

**每次构建**：Actions → "Build MS Store (MSIX)" → Run workflow → 填 tag → 几分钟后在
Artifacts 下载 `caiyun-notes-msix-<tag>`。

流水线自动完成：商店版构建（编译剥离整包自更新器与前端 ZIP 代码更新器）→ 二进制合规扫描 → 渲染 AppxManifest → makeappx 打包。
当前工作流上传的是**未签名** MSIX，供 Partner Center 接收并由商店签名；不能直接把它当作已验收的侧载安装包。

本地有 Windows 机器时也可手动执行（等价路径）：

```powershell
npm run build:msstore
pwsh -NoProfile -ExecutionPolicy Bypass -File scripts\pack-msix.ps1 `
  -IdentityName "..." -Publisher "CN=..." -PublisherDisplayName "..."
```

（脚本含中文默认值，文件带 UTF-8 BOM；用 Windows PowerShell 5.1 运行也能正确读取，
但推荐 pwsh 7。）

## 四、Partner Center 提交清单

| 项目 | 内容 |
|---|---|
| 包上传 | 上传第三节生成的 .msix |
| 类别 | 生产力 |
| 年龄分级 | 已按笔记协同/用户内容分享如实填写问卷并保存 IARC 条款，当前回读 Microsoft/IARC 12+；最终分级 ID 待平台生成 |
| 隐私政策 URL | **必填**（账号体系 + 云同步），公开页面说明数据收集与存储 |
| 支持联系方式 | 官网或邮箱 |
| 截图 | 至少 1 张 1366×768+，建议 3–5 张 |
| 商店描述 | 与热更新后实际功能一致（政策 10.2.2 的合规锚点） |
| 系统要求 | Windows 10 1809+；需要 WebView2 运行时（Win11 自带；Win10 大多已装，认证备注里说明） |
| 认证备注 | 提供**测试账号**，注明"笔记数据云端同步、需要联网" |

## 五、审核注意点

- **10.2.10.1（安全）**：商店包不得显示官网的 macOS/Windows/Linux 安装包下载，不得下载并替换本地 JavaScript 前端包。`build:msstore` 已将两者关闭。
- **可测试性（10.3）**：测试账号必须可用，否则按"无法测试"退回。
- 审核用独立账号需先确认可登录且仅含演示数据，凭据通过 Partner Center 专用字段提供，不写公开描述。
- 不承诺固定审核周期；以 Partner Center 实际认证状态为准。

## 六、发布后的更新节奏

1. 壳/原生变更：版本号 +1 → `npm run build:msstore` → `pack-msix.ps1` → 提交。
2. 任何本地前端代码变更都随新 MSIX 提交 Microsoft Store；服务端数据、配置和 API 可独立发布，但不得下发可执行前端代码。
3. 官网直装渠道只在商店未覆盖、旧用户迁移或故障回退期间保留；商店包真机安装、升级及本地数据迁移验证后，逐步收口到商店渠道。

## P20 认证结果与 P21 整改（2026-09-22）

- P20 审核按 10.2.10.1 Security 退回，审核附件明确截图标注应用内“下载 App”弹窗，其中可直接下载 macOS、Windows 和 Linux 安装包。
- P21 / `10.2.9.0` 整改版将 Microsoft Store 识别改为编译期渠道：前端不渲染安装包下载控件，Rust 不编译 `frontend_bundle.rs`，CI 同时检查构建特性与二进制禁止路径。

- Store ID `9P2VQP7JKVLN`，P20 提交 `1152921505701934449` 已于 2026-09-22 被退回；商品页尚未上线。P21 整改包须完成 Windows CI、MSIX 检查和测试账号复核后再上传。
- Partner Center 已接受 `CaiyunNotes_10.2.8.0_x64.msix` 并显示 `Validated`；中文/英文一览、属性、提交选项已保存。`runFullTrust` 仍须经微软审批。
- 同一 MSIX 的隔离 Windows CI 验收 run `35484825450` 已完成哈希核验、临时签名安装和包内 `app.exe` 启动后 8 秒存活；进程树出现 6 个 WebView2 子孙进程，且已把至少一个 WebView2 子孙进程写为必过断言。该无头检查不等于真实桌面显示、WebView2 页面内容正确、登录或旧版数据迁移测试。
- 后续隔离 CI run `35488555357` 对**同一上传包哈希**获取了非零主窗口句柄并截获 Windows 窗口图像，显示彩云笔记欢迎页与“登录/注册”按钮，证明包内置首屏实际渲染。截图仍不验证登录、编辑或数据迁移。
- 后续隔离运行 `35484963629` 显示 WebView2 逻辑数据目录为 `%LocalAppData%\com.caiyun.notes\EBWebView`，但从包外观察该实体目录不存在，MSIX 私有 `Packages/<PackageFamilyName>/LocalCache/Local/com.caiyun.notes/EBWebView` 存在。**不能据同一个逻辑路径认定官网旧版的 IndexedDB/离线 journal 已自动迁入**；必须用旧版写入未同步测试内容、安装商店包、断网打开并完成同步的真实升级场景验收后，才能向旧用户推广商店版。
- 隔离 CI run `35489539283` 用同一 MSIX 解包 exe 先以非打包方式启动，确实创建旧版逻辑 WebView2 目录；随后写入诊断标记再安装 MSIX。商店包装启动后，宿主侧旧目录及标记仍在，MSIX 私有同名目录未出现。这说明“私有目录一定取代旧资料目录”的断言并不稳定；标记由宿主侧读取，**仍不能证明 WebView2 实际读到了旧 IndexedDB**。继续要求真机、断网和未同步笔记回归。
- 隔离 Windows CI run `35491234860` 进一步用相同 Tauri 壳源码构建专用页面：包外运行时实际在 `http://tauri.localhost` 的 IndexedDB 写入标记，窗口显示 `NEW_INDEXEDDB_MARKER_CREATED`；随后以相同 Identity 包装、临时签名安装 MSIX 并启动，窗口显示 `EXISTING_INDEXEDDB_READ_OK`，两次窗口截图保存在该 run 的 `caiyun-msstore-indexeddb-probe-35491234860` artifact。这证明该隔离环境、同源同标识下，WebView2 实际接续了包外 IndexedDB，而不只是宿主目录仍在。该包是测试页面重新构建的壳，**并非提交审核的原始包**；仍需真实旧版笔记、离线 journal、用户机器及联网补传的升级验收，不能据此撤掉旧安装渠道。
- 隔离 Windows CI run `35492047992` 把包外写入端换成 `p19` 标签构建的 10.2.7 壳，把读取端换成当前 10.2.8 Store 配置的 MSIX 壳；两端均使用相同的无账号 IndexedDB 测试页及 `http://tauri.localhost` origin。截图分别显示 `NEW_INDEXEDDB_MARKER_CREATED` 与 `EXISTING_INDEXEDDB_READ_OK`，MSIX 安装后旧宿主资料目录仍存在、包私有同名目录未生成。这是 **P19→P20 跨版本壳的 IndexedDB 接续实测**，但并非官方 P19 安装器里原封不动的 EXE，也不是已经提交审核的原始 P20 MSIX；真实离线笔记、journal 和联网同步迁移仍未验收。
- 开发者已确认 IARC 使用条款与成年声明并在 Partner Center 保存；回读显示 Microsoft 12+、IARC 12+，分级 ID 尚为“待定”。概览异步校验完成后“提交进行认证”按钮可用；定价页仍为全球免费公开。认证通过后的发布方式已设为**手动发布**，避免真机迁移未验收时自动面向公众上线。
- 现有 `test01@notes.app` 审核账号已通过生产登录验证，且只用于演示数据；账号邮箱与密码应继续只填在 Partner Center 非公开“其他测试信息”字段。生产后端当前最低壳策略及 P21 `10.2.9` 放行状态须在重提前重新实测。尚未完成 Windows 真机安装与旧版离线数据迁移验收。**P20 已退回，P21 尚未重新提交。**
- 只有认证通过且公开页实测可访问后，才可公布最终 Store 商品链接 `https://apps.microsoft.com/detail/9P2VQP7JKVLN`。
