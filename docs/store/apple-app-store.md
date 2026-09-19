# Mac App Store 上架 Runbook（pkg + App Sandbox 路线）

> 目标：把彩云笔记 macOS 版（Tauri / WKWebView）提交到 Mac App Store。
> 路线：**App Sandbox + .pkg 上传**，与官网 dmg 直发版共存、互不影响。
> 依据：App Review Guidelines（2026-09 核）；热更新边界见 hot-update-policy.md。

## 路线选择

| | ✅ MAS pkg（本路线） | 官网 dmg 直发（现状，保留） |
|---|---|---|
| 签名 | Apple Distribution 证书 + 商店 Provisioning Profile | ad-hoc（tauri.conf.json `signingIdentity: "-"`），可另配 Developer ID + notarytool 公证 |
| 沙盒 | **强制开启**（entitlements.appstore.plist） | 无 |
| 整包自更新 | 禁止（2.5.2），`--no-default-features` 已剥离 | ✅ 保留 |
| 数据目录 | 沙盒容器 `~/Library/Containers/com.caiyun.notes/Data/...` | `~/Library/Application Support/com.caiyun.notes` |

两条渠道的本地数据目录不同：老用户从官网版迁到商店版时本地库不可直接复用，
引导其确认所有页面"已同步"、附件"无待上传"后重新登录拉取即可（见 README 跨店共同纪律）。
沙盒内 `HOME` 环境变量指向容器，旧版 WebKit 数据清理命令
（`inspect/quarantine_legacy_webkit_origin`）自动探测不到容器外路径、恒返回 `exists:false`，
属预期降级，无需适配。

## 一、账号（前提）

Apple Developer Program，$99/年（已购，**待生效**，状态见 developer.apple.com/account）。
会员未生效前本文档后续步骤全部阻塞，可先做三、四节的静态资产准备。

## 二、证书与 Provisioning Profile

在 developer.apple.com/account → Certificates, Identifiers & Profiles 准备：

| 资产 | 用途 |
|---|---|
| App ID `com.caiyun.notes` | Identifiers → 注册（与 tauri.conf.json `identifier` 一致） |
| **Apple Distribution** 证书（旧称 3rd Party Mac Developer: Application） | 签名 .app |
| **Mac Installer Distribution** 证书（旧称 3rd Party Mac Developer: Installer） | productbuild 签名 .pkg |
| Mac App Store 分发 Provisioning Profile（绑上述 App ID） | 嵌入 `Contents/embedded.provisionprofile` |

证书导入本机钥匙串（钥匙串访问 → 登录）。团队 ID 在 Membership details 页复制。

## 三、构建（本机 macOS）

```bash
# 1. 把 entitlements 模板里的 {{TEAM_ID}} 替换为真实团队 ID（每次克隆后一次即可）
sed -i '' 's/{{TEAM_ID}}/你的TeamID/g' src-tauri/entitlements.appstore.plist

# 2. 构建商店版 .app（剥离自更新器，叠加 tauri.appstore.conf.json：
#    关闭 updater artifacts、targets 只留 app、category=productivity、
#    用 Apple Distribution + entitlements.appstore.plist 签名）
npm run build:appstore
# 审核若对热更新提出异议，改用保守版（前端始终用壳内置资源）：
# npm run build:appstore:no-hotupdate

# 3. 嵌入 Provisioning Profile（嵌入会改变 bundle 内容，必须重签）
APP="src-tauri/target/release/bundle/macos/彩云笔记.app"
cp ~/Downloads/你的profile.provisionprofile "$APP/Contents/embedded.provisionprofile"
codesign --force --sign "Apple Distribution: 你的名字 (TEAMID)" \
  --entitlements src-tauri/entitlements.appstore.plist "$APP"
codesign --verify --deep --strict --verbose=2 "$APP"

# 4. 打出提交用 .pkg
productbuild --component "$APP" /Applications \
  --sign "Mac Installer Distribution: 你的名字 (TEAMID)" \
  "彩云笔记-10.2.8.pkg"
```

未替换 `{{TEAM_ID}}` 就构建：签名可过，但 App Store 校验会因
`com.apple.application-identifier` 与 profile 不匹配而拒收。

## 四、App Store Connect 提交清单

| 项目 | 内容 |
|---|---|
| 包上传 | **Transporter.app** 拖入 .pkg（`xcrun altool` 已废弃；`notarytool` 仅用于官网 dmg 公证，MAS 不需要） |
| 类别 | 生产力（主）—— 与 `tauri.appstore.conf.json` 的 `public.app-category.productivity` 一致 |
| App 隐私 | 账号体系 + 云同步 → 必填隐私问卷（收集标识符、用户内容） |
| 隐私政策 URL | 必填，公开页面说明数据收集与存储 |
| 年龄分级 | 问卷，预期 4+ |
| 截图 | 1280×800+ 至少 1 张，建议 3–5 张 |
| 商店描述 | 与热更新后实际功能一致（2.5.2 的合规锚点，见 hot-update-policy.md） |
| 审核信息 | 提供**测试账号**，注明"笔记数据云端同步、需要联网" |
| 版本号 | 每次提交递增 tauri.conf.json `version`（同步 package.json） |

## 五、审核注意点

- **2.5.2（自更新必须移除）**：审核指南禁止 app 自带整包更新机制，所有更新必须由商店托管。
  本仓库已通过 `--no-default-features` 在编译期剥离 updater 插件与断点续传更新器，
  前端调用同名命令会收到"请在应用商店中检查更新"提示，不会触发下载行为。
- **2.5.2 / 开发者协议 §3.3.1(B)（热更新）**：系统 WKWebView 执行的解释型前端代码在豁免范围内，
  前提是自有签名包、不改变主要用途、不绕过沙盒（边界与应急开关见 hot-update-policy.md）。
  商店描述写清楚的功能，热更新不得超出；被问询就用 `npm run build:appstore:no-hotupdate` 重打。
- **沙盒对 WKWebView / 热更新的实际影响**：
  - WKWebView 渲染进程由系统管理，沙盒下正常运行，无需额外 entitlement；
    远程加载靠 `com.apple.security.network.client`（云同步 / 热更新包下载 / 地图 API 同此）。
  - 热更新包落在容器内 `app_local_data_dir`，沙盒下读写自由，验签与回退逻辑不变。
  - 附件导入/导出经系统打开/保存面板（tauri-plugin-dialog），由
    `com.apple.security.files.user-selected.read-write` 覆盖；录音由
    `com.apple.security.device.audio-input` + Info.plist 的 `NSMicrophoneUsageDescription` 覆盖。
  - 通知、剪贴板走系统 API，无需 entitlement。
  - 提审前把 .pkg 装进 /Applications 实测一遍核心流程（登录同步、导入导出、录音、通知）。
- **NSAllowsArbitraryLoads**：Info.plist 目前对 ATS 全开例外，审核可能要求说明；
  生产流量均为 HTTPS，后续版本可收紧或移除（遗留项，勿在本次改动 Info.plist，以免影响直发版）。
- **可测试性**：测试账号必须可用，否则按"无法测试"退回。
- 审核周期：通常 1–3 天，三店最严。

## 六、发布后的更新节奏

1. 壳/原生变更：版本号 +1 → 第三节流程 → Transporter 上传。
2. 前端小修小补：走热更新，三端同时生效，无需过审。
3. 官网渠道（dmg 自更新版）照常 `npm run build`，互不影响。
