# Study With XiaYan

一个面向学习场景的前端网页应用：支持上传题目图片、获取 AI 讲解、继续追问、自动整理学习笔记并导出 Markdown。

## 功能特性

- 🖼️ 上传题目图片并进行讲解
- 💬 支持连续追问与上下文对话
- 🧰 支持 Function Calling（可按需求生成结构化选择题）
- ⚡ 快速 / 🧠 思考 双模式切换
- 📝 自动生成学习笔记并支持导出 `.md`
- 📚 本地对话历史存储（LocalStorage）
- 🌐 快捷部署到 Vercel

## 项目结构

```text
.
├─ index.html
├─ css/
│  └─ style.css
├─ js/
│  ├─ main.js
│  ├─ env.example.js
│  └─ env.local.js   # 本地环境变量（已 gitignore）
├─ assets/
│  └─ img/
└─ prompt.md
```

## 本地运行

本项目是静态站点，无需构建。

1. 克隆仓库
2. 复制环境变量模板并填写：

   ```bash
   copy js\env.example.js js\env.local.js
   ```

3. 在 `js/env.local.js` 中配置：

   ```js
   window.__STUDY_ENV__ = {
     PROXY_DEEPSEEK_URL: "https://your-proxy.example.com/deepseek/v1/chat/completions",
     PROXY_KIMI_URL: "https://your-proxy.example.com/kimi/v1/chat/completions",
     PROXY_GEMINI_URL: "https://your-proxy.example.com/gemini/v1/chat/completions",
   };
   ```

4. 用 VS Code Live Server / 任意静态服务器打开 `index.html`

## Vercel 部署

### 方式一：Web 控制台（推荐）

1. 在 Vercel 导入 GitHub 仓库
2. Framework Preset 选择 `Other`
3. Build Command 留空（或 `echo skip build`）
4. Output Directory 留空（默认根目录）
5. 点击 Deploy

### 方式二：CLI

```bash
npx vercel --prod --yes
```

## 环境变量说明

当前前端会读取 `window.__STUDY_ENV__`（来源 `js/env.local.js`），未配置时会回退到手动填写 API Key 的方式。

- `PROXY_DEEPSEEK_URL`
- `PROXY_KIMI_URL`
- `PROXY_GEMINI_URL`

> 注意：`js/env.local.js` 已被 `.gitignore` 忽略，不会被提交到仓库。请自行创建

## 特别鸣谢

- [@fufu3939](https://github.com/fufu3939) - Prompt 优化
