# Animation Canvas

基于 Excalidraw 与 Motion Runtime 的项目管理版无限画布编辑器。

## 保留范围

- 本地登录与 Workspace 项目管理
- Excalidraw 画布编辑能力
- 本地项目保存、导入、导出与图片管理
- Animation DSL、Preset、Runtime、Inspector 与 Timeline
- `animation.json` 导出

本仓库不包含 Excalidraw 官网、在线分享、实时协作、Firebase、Sentry、PWA、示例站点和文档站构建逻辑。

## 环境

- Node.js 18+
- pnpm 10.32.1（通过 Corepack 管理）

## 开发

```bash
corepack enable
pnpm install --frozen-lockfile
pnpm dev
```

开发服务默认使用 `VITE_APP_PORT`，Workspace API 由 Vite 插件提供。

## 生产运行

```bash
pnpm start:production
```

该命令先构建前端，再启动 `excalidraw-app/workspace/server.mjs`。

## 验证

```bash
pnpm test:typecheck
pnpm test:workspace
pnpm test:app --watch=false
pnpm build
```

## 主要目录

- `packages/excalidraw/`：Excalidraw 编辑器核心
- `excalidraw-app/`：登录、Workspace 和编辑器应用壳
- `src/animation/`：动画 DSL、Runtime、Preset 与编辑器 UI
- `docs/`：动画系统架构与协议文档
