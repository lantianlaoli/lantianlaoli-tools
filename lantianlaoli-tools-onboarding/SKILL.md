---
name: lantianlaoli-tools-tutorial
description: lantianlaoli codex 制作电商小工具视频配套项目安装指南
---

# lantianlaoli-tools 部署 skill

本 skill 指导 AI agent 从 0 完成示例项目 `lantianlaoli-tools` 的本地部署与初始配置，全程无需用户介入操作命令。

示例项目已具备的能力：

- 批量克隆竞品图片
- 生成电商轮播图
- 生成商品详情页

按顺序执行每一节，全部步骤完成后视为部署就绪。

---

## 第 1 步：环境检测与安装

### 1.1 检测当前环境

运行以下检查并记录结果：

- 操作系统：macOS / Windows / Linux
- CPU 架构：Apple Silicon / Intel / x86_64
- shell 类型：zsh / bash / PowerShell
- 已安装的工具：`brew` / `winget` / `git` / `nvm` / `node` / `npm` / `pnpm` / `bun`

把缺失的工具记下来，后续按系统补齐。

### 1.2 macOS 环境初始化

执行以下步骤：

1. 如未安装 Homebrew，安装 Homebrew（macOS 包管理器）
2. 配置 brew shellenv
3. 如未安装 Git，安装 Git
4. 安装并配置 nvm：自动创建 `~/.nvm`、写入 `~/.zshrc`、自动加载（避免重复写入）
5. 刷新 shell 环境
6. 用 nvm 安装最新 LTS Node.js
7. 设置默认 Node 版本
8. 全局安装 pnpm、bun
9. 询问用户 git user.name 与 git user.email，写入全局 git config
10. 验证并输出各工具版本：brew / git / nvm / node / npm / pnpm / bun
11. 检查常见问题：PATH、nvm 未加载、command not found、npm 权限

规则：

- 不要使用 sudo
- 不要覆盖已有配置
- 幂等执行（重复运行不会出错）
- 出错时解释原因并自动给出修复方案

### 1.3 Windows 环境初始化

执行以下步骤：

1. 如未安装 winget，提示用户安装 App Installer
2. 如未安装 Git，安装 Git for Windows
3. 安装 nvm-windows（使用 winget、检查 NVM_HOME 与 NVM_SYMLINK、自动修复 PATH）
4. 用 nvm-windows 安装最新 LTS Node.js
5. 设置默认 Node 版本
6. 全局安装 pnpm、bun
7. 询问用户 git user.name 与 git user.email，写入全局 git config
8. 验证并输出各工具版本
9. 检查常见问题：PATH、nvm 未识别、node/npm 冲突、PowerShell 执行策略

规则：

- 不要删除已有项目文件
- 不要使用不明来源安装包
- 已安装的软件优先检查而不是重装

### 1.4 验证

```bash
node -v    # 应输出 v20.x 或更高
pnpm -v    # 应输出 9.x 或更高
git --version
```

任一命令缺失或不达版本要求，重复执行对应小节的初始化流程，直到全部通过。

---

## 第 2 步：导入示例项目

### 2.1 clone 项目

仓库地址：`https://github.com/lantianlaoli/lantianlaoli-tools.git`

执行 `git clone https://github.com/lantianlaoli/lantianlaoli-tools.git`，进入项目目录。

### 2.2 项目分析

读取以下文件并识别项目配置：

- `package.json`
- `next.config.*`
- `tsconfig.json`
- lockfile（`pnpm-lock.yaml` / `package-lock.json` / `yarn.lock`）
- env 文件（`.env.example` / `.env.local.example` / `env.template`）

判断包管理器优先级：pnpm > npm > yarn。

### 2.3 安装依赖

按优先级安装依赖：`pnpm install`，失败则 `npm install`。

处理可能的异常：

- lockfile 冲突
- peer dependency 报错
- Node 版本不兼容
- native module 编译问题
- Apple Silicon macOS 兼容问题

### 2.4 env 文件初始化

如果项目根目录存在 `.env.example` / `.env.local.example` / `env.template`，自动复制生成 `.env.local`。

### 2.5 启动 dev server

在 Cursor 终端中执行 `pnpm dev`，等本地地址出现（通常是 `http://localhost:3000`）。

如端口被占用，使用 `pnpm dev -- -p 3001`。

---

## 第 3 步：常见问题速查

| 现象 | 排查方向 |
| --- | --- |
| `pnpm: command not found` | 重新执行第 1.2 / 1.3 节的 pnpm 安装步骤 |
| `git clone` 报权限错 | 检查 git 是否已配置 user.name / user.email |
| `pnpm install` 卡住或失败 | 删除 `node_modules` 和 `pnpm-lock.yaml` 后重试 |
| `pnpm dev` 启动后浏览器打不开 | 检查终端是否提示端口占用；改用 `pnpm dev -- -p 3001` |
| `.env.local` 缺失 | 从 `.env.example` 复制：`cp .env.example .env.local` |

---

## 第 4 步：视频教程

如需补充说明，可参考以下视频（按标题搜索）：

1. 电商工具｜codex 如何 vibe coding 教学
2. vibe coding 电商工具｜使用 Gemini omni
3. codex 社媒封面生成器｜新手保姆级

---

## 完成后

部署完成。用户可以开始基于本项目开发自己的电商工具功能。下一步可以：

- 参考 `lantianlaoli-tools-model-integration` skill 接入新的图片 / 视频模型
- 基于现有页面，开发符合具体业务的功能（例如新的轮播图模板、详情页布局）