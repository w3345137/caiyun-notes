# Microsoft Store 上架 Runbook（MSIX 零证书路线）

> 目标：把彩云笔记 Windows 版（Tauri / WebView2）提交到 Microsoft Store。
> 路线：**MSIX 包 + 微软商店代签，全程零费用**（账号免费 + 无需购买代码签名证书）。
> 依据：Microsoft Store Policies v7.19（2026-07 核）。

## 路线选择

| | ✅ MSIX（本路线） | MSI/EXE 直链（10.2.9，备选） |
|---|---|---|
| 签名 | 微软商店收录时代签，**不用买证书** | 需自购 OV 证书（$100–400/年） |
| 下载/更新 | 商店全托管 | 自己托管带版本号 URL，每次发版手动更新 |
| 打包 | makeappx 一道转换（脚本已备好） | `npm run build:msstore:msi` 直接出 MSI |
| 运行环境 | 轻量容器化，程序目录只读；数据在 APPDATA，对本 app 无影响 | 无 |

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

流水线自动完成：商店版构建（剥离自更新器）→ 渲染 AppxManifest → makeappx 打包 →
自签名（便于侧载测试；提交商店后微软代签替换）。产物即提交文件。

本地有 Windows 机器时也可手动执行（等价路径）：

```powershell
npm run build:msstore
powershell -ExecutionPolicy Bypass -File scripts\pack-msix.ps1 `
  -IdentityName "..." -Publisher "CN=..." -PublisherDisplayName "..."
```

## 四、Partner Center 提交清单

| 项目 | 内容 |
|---|---|
| 包上传 | 上传第三节生成的 .msix |
| 类别 | 生产力 |
| 年龄分级 | IARC 问卷，预期 3+ |
| 隐私政策 URL | **必填**（账号体系 + 云同步），公开页面说明数据收集与存储 |
| 支持联系方式 | 官网或邮箱 |
| 截图 | 至少 1 张 1366×768+，建议 3–5 张 |
| 商店描述 | 与热更新后实际功能一致（政策 10.2.2 的合规锚点） |
| 系统要求 | Windows 10 1809+；需要 WebView2 运行时（Win11 自带；Win10 大多已装，认证备注里说明） |
| 认证备注 | 提供**测试账号**，注明"笔记数据云端同步、需要联网" |

## 五、审核注意点

- **10.2.2（动态代码）**：商店描述里写清楚的功能，热更新不得超出，见 hot-update-policy.md。
  若被问询，用 `npm run build:msstore:no-hotupdate` 重打保守版再提交。
- **可测试性（10.3）**：测试账号必须可用，否则按"无法测试"退回。
- 审核周期：通常 15 分钟–3 天。

## 六、发布后的更新节奏

1. 壳/原生变更：版本号 +1 → `npm run build:msstore` → `pack-msix.ps1` → 提交。
2. 前端小修小补：走热更新，三端同时生效，无需过审。
3. 官网渠道（NSIS 自更新版）照常 `npm run build`，互不影响。
