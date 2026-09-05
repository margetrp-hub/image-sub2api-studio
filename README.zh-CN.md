# Image Agent Studio

我做 Image Agent Studio，是因为生图工作流很容易被拆散：提示词在一个地方，参考图在另一个地方，参数藏在请求里，生成结果刷新后又可能丢，上下文和分支关系也很难追。

这个项目想把这些东西放回一个稳定工作区：写需求、挂参考图、选模型路线、生成或编辑、把结果留在画布上，并且能从任意一张图继续往下做，不丢提示词、Mask、参数、分支和历史。

核心项目 **不依赖 Sub2API 或 NewAPI**。它们只是可选的适配器/网关形态。工作站本身可以连接官方 OpenAI 风格接口、自定义 OpenAI 兼容接口、NewAPI 兼容部署、Sub2API 兼容部署，以及未来的图片、视频模型适配器。

Image Agent Studio 是独立的创作工作站。它不是 Image Agent Canvas Codex 插件，也不内置该插件。

演示入口：[studio.ohlaoo.com/studio/](https://studio.ohlaoo.com/studio/)

English README: [README.md](./README.md)

## 交流

如果你也在做 AI 生图工作流、提示词工作流、OpenAI 兼容接口、自定义模型网关、NewAPI、Sub2API、Docker 部署或后续视频创作工作站，欢迎加入 QQ 交流群：`260789529`。

## 中文搜索关键词

AI 图像工作站、AI 生图工作台、图片生成工作流、提示词工作流、参考图生图、Mask 局部重绘、OpenAI 兼容接口、NewAPI 适配、Sub2API 适配、自托管生图平台、AI 创作画布、图片历史图库、图像生成队列、视频创作工作站。

## 当前运行线

Go 迁移期间，根目录 Web 应用和 Node Studio 服务仍是兼容现有部署的运行线。

- 文生图默认使用 `POST /v1/images/generations`。
- 参考图编辑和 Mask 局部重绘使用 `POST /v1/images/edits`。
- 提示词助手使用 `POST /v1/chat/completions`。
- `xai-compatible` 适配器支持持久化的 base64 图片结果和异步视频轮询，但不改变工作站本身的接口边界。
- `/v1/responses` 只作为显式兼容路径，不是默认生图路线。
- Docker 默认使用工作站自有账号体系；已有账号系统的部署仍可使用网关鉴权。
- 会话、生成任务、历史记录和生成资产通过 Studio API 保存，现有部署可在刷新或服务重启后恢复工作状态。
- 历史图库、模板库和灵感库采用分批渲染，降低大量图片同时进入浏览器的压力。
- 旧的 `VITE_SUB2API_*`、`SUB2API_*`、进程名和数据目录只在兼容旧部署时保留。

## 正在迁移的架构

新的工作站以项目、场景、镜头和工作流连续性组织创作，不再把一次 Provider 请求当作顶层结构。

- `apps/web` 已有新的项目型工作台和 Studio API 客户端，但还在联调阶段，尚未替代根目录生产应用。
- `apps/server-go` 已有自有账号、每用户项目聚合、持久化任务记录、SSE 任务事件、SHA-256 内容寻址资产及每用户访问校验、共享 Provider Link，以及加密的每用户 Provider Connection。
- `packages/contracts` 提供项目、场景、镜头、资产、提示词修订、任务、事件、分支关系和 Provider Connection 的中立协议。
- 共享管理员 Provider Link 引用服务端环境变量中的凭据，并按 Studio 角色开放；每用户 Provider Connection 使用 AES-256-GCM 保存 API Key 或 Access Token，密文绑定用户与连接 ID，目前支持服务端模型同步。
- Go 核心当前仍使用每用户原子 JSON 作为兼容存储，SQLite 和 PostgreSQL 存储层尚未实现。
- Go 已增加显式启用的 OpenAI-compatible 文生图执行器。`dispatch-plan` 仍只生成脱敏计划；`POST .../execute` 默认关闭，启用后使用服务端凭据、按持久化状态机推进任务，并把 base64 结果写入用户私有的内容寻址资产库。视频、编辑、重试和生产 worker 仍由 Node 兼容运行时承担。
- 个人 Provider 模型同步默认阻断 localhost 和私网 URL；只有运维方显式设置 `STUDIO_ALLOW_PRIVATE_PROVIDER_URLS=true` 才允许有意使用的私网端点。
- 资产上传只接受 Go 白名单内的图片/视频 MIME，资产响应设置 `X-Content-Type-Options: nosniff`。
- SSE 回放只保存在当前进程的有界内存中，不是持久化事件日志。
- 现有 Electron 打包仍包裹兼容 Web/Node 运行时；v1 桌面端与 Go 集成尚未完成。
- 小程序和 Android 目前只是客户端边界，不是已经完成的移动端产品。

架构事实源见 [docs/architecture-v1.md](./docs/architecture-v1.md) 和 [docs/GO-SERVER-CORE.md](./docs/GO-SERVER-CORE.md)。**Image Agent Canvas** 是独立的 Codex 插件仓库；它的 MCP 和画布运行时不打包进本工作站。

## 边界说明

这个仓库刻意只做工作站这一层。它不是模型供应商、不是账号池、不是计费系统、不是网关后端。

Image Agent Studio 负责：

- 创作工作台界面。
- 项目、场景、镜头，以及提示词/参考图连续性。
- Provider 选择与路由规划。
- 无限画布和图片分支关系。
- 会话、任务、历史和生成资产持久化。
- Docker、Nginx、VPS 部署示例。

接入的官方 API、NewAPI、Sub2API 或自定义网关负责：

- 账号和 API Key。
- 模型可用性。
- 额度与计费。
- 上游路由、Provider 侧重试和失败处理。
- Provider 自己的内容策略和审核行为。

更多边界见 [SECURITY.md](./SECURITY.md) 和 [docs/PROVIDERS.md](./docs/PROVIDERS.md)。

## 截图

截图使用演示数据，Key 已打码。

![中文工作台](docs/screenshots/workstation-zh.png)

![英文工作台](docs/screenshots/workstation-en.png)

## 本地运行

```bash
npm install
cp .env.example .env.local
npm run dev:studio
```

如果本地要测试真实云端网关，可以在 `.env.local` 里配置：

```env
VITE_DEV_AI_GATEWAY_PROXY_TARGET=https://your-gateway-domain
```

这样本地页面请求 `/v1`、`/api` 和 `/login` 时会经过 Vite 代理，避免浏览器 CORS 问题。

## 生产构建

部署在根路径：

```bash
npm run build
```

部署在 `/studio/` 子路径：

```bash
STUDIO_BASE_PATH=/studio/ npm run build
```

Windows PowerShell：

```powershell
$env:STUDIO_BASE_PATH="/studio/"
npm run build
Remove-Item Env:\STUDIO_BASE_PATH
```

上线时上传 `dist/` 里的文件，不要直接上传源码根目录的 `studio.html`。

## 最小环境变量

```env
VITE_AI_GATEWAY_BASE_URL=https://gateway.example.com
VITE_AI_GATEWAY_MODEL_BASE_URL=https://gateway.example.com
VITE_AI_IMAGE_ROUTE=auto
VITE_AI_RESPONSES_MODEL=gpt-5.5
VITE_AI_GATEWAY_LOGIN_URL=https://studio.example.com/login
VITE_STUDIO_HISTORY_BASE_URL=https://studio.example.com
VITE_STUDIO_BACK_URL=/
VITE_STUDIO_LIBRARY_AUTH_REQUIRED=false
VITE_DEV_AI_GATEWAY_PROXY_TARGET=https://gateway.example.com
```

说明：

- `VITE_AI_GATEWAY_BASE_URL` 用于登录、用户资料和 Key 列表。
- `VITE_AI_GATEWAY_MODEL_BASE_URL` 用于 `/v1/models`、图片生成、图片编辑和提示词助手。
- `VITE_AI_IMAGE_ROUTE=auto` 会让文生图走 `/v1/images/generations`，参考图和 Mask 走 `/v1/images/edits`。
- 只有上游明确支持 `/v1/responses` 生图时，才把 `VITE_AI_IMAGE_ROUTE` 改成 `responses`。
- `VITE_STUDIO_LIBRARY_AUTH_REQUIRED=true` 只适合已经接好 `/studio-api/library` 鉴权素材库的生产环境。

## 标准 VPS 目录

新的独立部署建议使用：

```text
/opt/image-agent-studio-repo/     # Git 仓库 checkout
/var/www/image-agent-studio/      # 构建后的静态文件
/opt/image-agent-studio/          # Node 历史/会话服务
/var/lib/image-agent-studio/      # 历史、会话、队列、生成图片和受保护素材库
```

已有 VPS 可以继续沿用旧路径，例如 `/var/www/ohlaoo-studio`、`/opt/image-sub2api-studio`、`/var/lib/image-sub2api-studio`。更新时显式传入这些路径即可，避免旧历史、队列、生成图片和受保护素材库因为更名而看起来丢失。

新服务器第一次安装：

```bash
sudo REPO_URL=https://github.com/margetrp-hub/image-agent-studio.git \
  BRANCH=main \
  bash -c 'git clone --branch "$BRANCH" "$REPO_URL" /opt/image-agent-studio-repo && bash /opt/image-agent-studio-repo/deploy/install.sh'
```

标准 Git 同步更新：

```bash
cd /opt/image-agent-studio-repo
sudo bash deploy/upgrade.sh
```

旧 Oh Laoo VPS 保留当前路径的更新方式：

```bash
cd /opt/image-agent-studio-repo

sudo BRANCH=main \
  REPO_DIR=/opt/image-agent-studio-repo \
  STATIC_DIR=/var/www/ohlaoo-studio \
  SERVICE_DIR=/opt/image-sub2api-studio \
  DATA_DIR=/var/lib/image-sub2api-studio \
  SERVICE_NAME=image-sub2api-studio-history \
  BASE_PATH=/studio/ \
  PUBLIC_STUDIO_URL=https://studio.ohlaoo.com/studio/ \
  REQUIRE_LIBRARY=1 \
  bash deploy/sync-from-git.sh
```

相关文档：

- [部署指南](docs/DEPLOY.zh-CN.md)
- [Docker 生产部署](docs/DOCKER.zh-CN.md)
- [VPS 直接同步 Git 仓库部署](docs/VPS-GIT-SYNC.zh-CN.md)
- [服务器更新说明](deploy/UPDATE-SERVER.zh-CN.md)
- [Provider 和适配器说明](docs/PROVIDERS.md)
- [Release Notes](RELEASE_NOTES.md)

## Release 包

生产环境优先使用 Git 同步。无法直接从 GitHub 拉取时，可以生成 zip 包：

```bash
npm run package:release
```

会生成：

- `image-agent-studio-core-update-*.zip`：静态前端文件。
- `image-agent-studio-service-update-*.zip`：服务脚本和部署文档，标准目标目录是 `/opt/image-agent-studio`。

## Docker 部署

Docker Compose 会启动两个容器：

- `studio-web`：Nginx 静态前端和同源代理。
- `studio-history`：历史图库、当前会话、任务队列和生成图片资产持久化服务。

```bash
cp .env.example .env
docker compose up --build -d
```

默认访问：

```text
http://localhost:8080/studio/
```

持久化数据保存在 `studio-data` volume。不要执行 `docker compose down -v`，除非你明确要删除历史图库、队列和生成图片。

宿主机上已有 OpenAI 兼容网关时：

```env
AI_GATEWAY_UPSTREAM=http://host.docker.internal:8080
```

远程网关：

```env
AI_GATEWAY_UPSTREAM=https://your-gateway-domain
```

完整说明见 [docs/DOCKER.zh-CN.md](./docs/DOCKER.zh-CN.md)。

## 现有 Windows 桌面打包

仓库现在提供可复现的 Windows 桌面打包路径。它会先构建前端，再用 Electron 启动本地历史/会话服务和本地静态服务器，最后以桌面窗口打开工作站。

这条路径打包的是现有 Web 与 Node 兼容运行时，不代表尚未完成的 v1 桌面客户端或 Go 桌面部署。

```bash
npm run package:windows
```

产物会写到：

```text
release/desktop/
```

`.exe` 是 release 产物，不应该提交进 Git 仓库。发布时把它上传到 GitHub Releases。更多见 [Windows 桌面打包说明](docs/WINDOWS-DESKTOP.zh-CN.md)。

## 验证

不消耗生图额度的本地检查：

```bash
npm run check:local
```

持久化、备份和弹窗的加固回归（已包含在 `check:local` 中）：

```bash
npm run check:hardening
```

覆盖并发写入、多行提示词与生成参数、分享资产副本、视频字节范围、备份预验证，以及带认证的分享预览和弹窗交互。使用本地模拟数据，不触发付费生成；Go 检查在缺少工具链时仅执行静态契约检查。

部署相关的快速检查：

```bash
npm run check:deploy
npm run check:docker
npm run check:env
npm run check:docs
npm run check:studio-build
```

Docker 可用时：

```bash
npm run smoke:docker
```

Provider 路由检查：

```bash
npm run check:providers
```

账号型网关合约检查，不会发起付费生图：

```bash
AI_GATEWAY_BASE_URL=https://gateway.example.com \
AI_GATEWAY_EMAIL=you@example.com \
AI_GATEWAY_PASSWORD='your-password' \
npm run check:gateway
```

## 项目结构

```text
apps/
  web/                               联调中的项目型工作台
  server-go/                         逐步迁移的 Go 控制与数据核心
  desktop/                           Electron 打包与运行边界
  miniapp/ 和 android/               客户端边界，尚非完整产品
packages/
  contracts/                         Provider 中立 JSON Schema
  theme/                             多端语义主题 token
src/
  studio.jsx                         兼容现有生产的工作台 UI
  studio/                            Provider、存储、错误和工作流工具
scripts/
  image-agent-studio-history-service.mjs     Node Studio 服务入口
  image-sub2api-studio-history-service.mjs   旧部署兼容包装
deploy/
  image-agent-studio-history.service
  nginx-image-agent-studio.conf
  sync-from-git.sh
docs/
  architecture-v1.md                 架构与进度事实源
  migration-v1.md                    分阶段迁移和回滚计划
  adapters/                          Provider 适配契约
public/
  cases.json
  inspirations.json
  style-library.json
```

## 授权

代码使用 [MIT License](LICENSE)。社区提示词模板在适用时遵循 `CC BY 4.0`。第三方依赖、提示词来源、用户自行接入的素材库和外部 Provider 服务遵循各自的许可证或服务条款。
