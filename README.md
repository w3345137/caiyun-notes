# 🌤️ 彩云笔记 (CaiYun Notes)

一款功能丰富的全栈笔记应用，支持富文本编辑、多页签、思维导图、笔记导入导出等功能。提供 Web 版和桌面客户端（Tauri）。

## ✨ 特性

- **📝 富文本编辑** — 基于 TipTap (ProseMirror) 的所见即所得编辑器，支持标题、列表、引用、代码块、表格、待办事项、高亮标记等
- **📑 多页签** — 单个笔记内可创建多个页签，独立编辑不同内容
- **🧠 思维导图** — 内置思维导图编辑器，支持节点增删、缩放平移、导出为图片/Markdown
- **📁 笔记本管理** — 树形笔记本结构，拖拽排序，无限层级嵌套
- **🔄 导入导出** — 支持 JSON 格式导入导出，保留完整树形结构和父子关系
- **🖼️ 复制为图片** — 选中内容一键复制为高清图片（支持 Tauri 原生剪贴板）
- **🔐 用户认证** — 邮箱注册（验证码验证）、登录、密码重置，JWT + bcrypt 安全认证
- **👤 管理后台** — 用户管理、笔记管理、数据统计
- **💻 多平台** — Web 版 + Tauri 桌面客户端（Windows / macOS / Linux）
- **🔄 自动更新** — Tauri v2 Updater，APP 内自动检测并安装新版本
- **💾 本地备份** — APP 端支持本地文件系统备份

## 🛠️ 技术栈

| 层级 | 技术 |
|------|------|
| **前端** | React 18 + TypeScript + Vite |
| **富文本** | TipTap (ProseMirror) |
| **思维导图** | MindElixir |
| **桌面端** | Tauri v2 (Rust) |
| **后端** | Node.js (原生 http 模块) |
| **数据库** | PostgreSQL |
| **认证** | JWT (HMAC-SHA256) + bcrypt |
| **邮件** | nodemailer (SMTP) |
| **部署** | Nginx 反向代理 + PM2 |
| **CI/CD** | GitHub Actions (多平台构建) |

## 📸 截图

> 编辑器界面 — 支持标题、列表、表格、代码块、待办事项等富文本元素

## 🚀 快速开始

### 前置要求

- Node.js >= 18
- PostgreSQL >= 14
- npm 或 pnpm

### 本地开发

```bash
# 克隆仓库
git clone https://github.com/w3345137/caiyun-notes.git
cd caiyun-notes

# 安装前端依赖
npm install

# 安装后端依赖
cd backend && npm install && cd ..

# 配置环境变量
cp backend/.env.example backend/.env
# 编辑 .env 填入数据库连接信息和 SMTP 配置

# 初始化数据库
createdb notesapp
psql notesapp < backend/init.sql

# 启动后端
cd backend && node server.js

# 启动前端开发服务器
npm run dev
```

### 生产构建

```bash
# 构建前端
npx vite build --mode prod

# 部署 dist/ 到 Web 服务器
```

### Tauri 桌面客户端

```bash
# 开发模式
npm run tauri dev

# 构建安装包
npm run tauri build
```

## ⚙️ 环境变量

在 `backend/.env` 中配置：

```env
# 数据库
DB_HOST=127.0.0.1
DB_PORT=5432
DB_NAME=notesapp
DB_USER=notesapp_user
DB_PASSWORD=your_password

# JWT
JWT_SECRET=your_jwt_secret

# SMTP 邮件
SMTP_HOST=smtp.126.com
SMTP_PORT=465
SMTP_USER=your_email@126.com
SMTP_PASS=your_authorization_code

# 管理员
ADMIN_EMAILS=admin@example.com
```

## 📂 项目结构

```
caiyun-notes/
├── src/                        # 前端源码
│   ├── components/             # React 组件
│   │   ├── NoteEditor.tsx      # 富文本编辑器（含工具栏）
│   │   ├── AuthModal.tsx       # 登录/注册/忘记密码
│   │   ├── Sidebar.tsx         # 侧边栏笔记树
│   │   └── TabGroupView.tsx    # 多页签组件
│   ├── extensions/             # TipTap 扩展
│   │   ├── MindmapExtension.tsx # 思维导图
│   │   ├── TabGroup.ts         # 页签扩展
│   │   └── ResizableImage.tsx  # 可调整大小的图片
│   ├── lib/                    # 工具函数
│   │   ├── auth.ts             # 认证相关
│   │   ├── importService.ts    # 导入导出
│   │   └── adminApi.ts         # 管理后台 API
│   └── App.css                 # 编辑器样式
├── backend/
│   ├── server.js               # 后端服务（~700行）
│   └── package.json
├── src-tauri/                  # Tauri 桌面端
│   ├── src/lib.rs              # Rust 入口
│   ├── tauri.conf.json         # Tauri 配置
│   └── capabilities/           # 权限配置
├── .github/workflows/          # CI/CD
│   └── build-release.yml       # 多平台自动构建
└── README.md
```

## 📄 开源协议

MIT License

---

Made with ❤️ by [w3345137](https://github.com/w3345137)
