# GitHub Actions 自动构建指南

## 使用方法

### 方法1：推送 Tag 触发构建（推荐）

```bash
# 1. 创建 tag
git tag v1.9.0

# 2. 推送 tag 到 GitHub
git push origin v1.9.0

# 3. GitHub Actions 自动开始构建
# 4. 构建完成后，在 Releases 页面下载安装包
```

### 方法2：手动触发

1. 进入 GitHub 仓库
2. 点击 Actions 标签
3. 选择 "Build Tauri App" workflow
4. 点击 "Run workflow"

## 构建产物

构建完成后会生成：
- **macOS Universal**: 同时支持 Intel 和 Apple Silicon
- **macOS Intel**: 仅支持 Intel 芯片
- **Windows**: .exe 和 .msi 安装包

## 注意事项

1. **必须使用私有仓库**（Private Repository）
2. 首次构建需要 10-20 分钟
3. 后续构建会使用缓存，速度更快
4. 构建产物在 Actions → Artifacts 或 Releases 页面下载

## 安全说明

- 代码中只有 `supabaseAnonKey`（公开的，RLS 保护数据安全）
- 没有 `service_role_key`（敏感信息在本地，不上传）
- `.gitignore` 已排除 `秘钥/` 目录
