# ChronoFrame 处理端

处理端是在完整服务器上运行的 Docker 服务，与 Cloudflare Workers 不同。它主动向 ChronoFrame Cloud 领取照片处理任务、发送心跳并提交结果，不需要开放入站端口或直接连接数据库。

本包目前保留 `apps/worker` 目录和 `@chronoframe/worker` 包名；部署镜像为 **`ghcr.io/chronoframe/processor`**，属于私有镜像。

## 部署前准备

1. 部署支持处理节点注册协议的 Cloud，并应用 `0036_processors.sql` 数据库迁移，再部署配套管理端和 Site。
2. 在管理端“处理节点”页面配置统一逆地理编码提供器、凭据和语言。
3. 注册处理节点，填写名称及保护阈值，安全保存仅显示一次的连接密钥。
4. 确认私有镜像已经发布。维护者在主仓库配置 Actions Secret `PROCESSOR_REGISTRY_TOKEN` 后，可运行 **Publish private processing node** 工作流。发布令牌使用具有 `chronoframe` 组织包发布权限的 classic PAT，包含 `write:packages` 和 `read:packages`；服务器拉取镜像不需要发布权限。

旧的全局共享处理密钥不再接受。每个处理端实例应单独注册，并使用自己的连接密钥。

## 登录私有镜像仓库

使用有权读取该私有包的 GitHub 账号，创建包含 `read:packages` 权限的 **Personal access token (classic)**。组织启用 SSO 时，还需对该令牌完成组织授权。

在部署服务器上登录；将 `YOUR_GITHUB_USER` 替换为令牌所属账号：

```bash
read -rs -p 'GitHub package read token: ' GHCR_READ_TOKEN
printf '\n'
printf '%s' "$GHCR_READ_TOKEN" |
  docker login ghcr.io -u YOUR_GITHUB_USER --password-stdin
unset GHCR_READ_TOKEN
```

这个 GitHub 令牌只用于拉取镜像，不能用作处理节点的连接密钥。不要把令牌写进 Compose 文件、提交到 Git 或发送到日志中。

## 配置处理端

在部署目录创建 `processor.env`，例如 `/opt/chronoframe/processor/processor.env`：

```dotenv
CHRONOFRAME_PORTAL_ORIGIN=https://app.chronoframe.art
CHRONOFRAME_PROCESSOR_KEY=替换为管理端生成的节点连接密钥
```

```bash
chmod 600 processor.env
```

`CHRONOFRAME_PORTAL_ORIGIN` 必须是 HTTPS 门户源地址，不包含末尾斜杠或路径。

逆地理编码配置和保护阈值在管理端统一维护，不需要在每台服务器重复填写。Cloud 使用各节点的连接密钥加密下发配置，处理端解密后使用。

如果门户受到 **Cloudflare Access Service Auth** 保护，再在受保护的环境文件中加入：

```dotenv
CHRONOFRAME_ACCESS_CLIENT_ID=替换为Access服务令牌的ClientID
CHRONOFRAME_ACCESS_CLIENT_SECRET=替换为Access服务令牌的ClientSecret
```

两项必须同时配置；没有启用 Access 时均不填写。这组凭据不会替代管理端生成的节点连接密钥。

## 使用 Docker Compose 部署（推荐）

在 `processor.env` 同目录创建 `compose.yaml`：

```yaml
services:
  processor:
    image: ghcr.io/chronoframe/processor:latest
    restart: unless-stopped
    init: true
    env_file:
      - processor.env
```

在该目录执行：

```bash
docker compose pull
docker compose up -d
docker compose logs -f --tail=100 processor
```

无需配置 `ports`。启动后，在管理端确认节点在线、版本及任务租约状态。

更新镜像或修改 `processor.env` 后，重新创建容器：

```bash
docker compose pull
docker compose up -d --force-recreate
```

停止服务：

```bash
docker compose down
```

需要固定版本时，将 `latest` 替换为已发布的版本标签或 `sha-<完整提交SHA>`。发布工作流支持 `linux/amd64` 和 `linux/arm64`，Docker 会选择匹配服务器架构的镜像。

## 直接使用 Docker 部署

也可以不使用 Compose。在 `processor.env` 所在目录执行：

```bash
docker pull ghcr.io/chronoframe/processor:latest

docker run -d --name chronoframe-processor \
  --restart unless-stopped \
  --init \
  --env-file ./processor.env \
  ghcr.io/chronoframe/processor:latest

docker logs -f --tail=100 chronoframe-processor
```

更新镜像或更换节点密钥后，需要重新创建容器；单纯重启不会重新加载环境文件：

```bash
docker pull ghcr.io/chronoframe/processor:latest
docker stop chronoframe-processor
docker rm chronoframe-processor

docker run -d --name chronoframe-processor \
  --restart unless-stopped \
  --init \
  --env-file ./processor.env \
  ghcr.io/chronoframe/processor:latest
```

## 多节点与密钥轮换

- 多台服务器或多个实例部署时，在管理端分别注册节点，使用各自的环境文件和连接密钥，不要共用一个节点注册。
- 每个处理端一次执行一个任务，同一站点目前也最多同时执行一个任务；多个站点可以分布到不同处理端并行处理。
- 管理端支持禁用节点和轮换单个节点的连接密钥。旧密钥立即失效，新密钥仅显示一次。
- 轮换后，更新对应实例的 `processor.env`，再按上述方式重新创建容器。
- 文件、像素、元数据及超时阈值在管理端调整。设置 Docker 内存、CPU 或临时目录限制时，也应与节点阈值及实际服务器资源相匹配。

## 从源码构建

仓库内的 [compose.yaml](./compose.yaml) 用于源码构建，与上面拉取已发布镜像的 Compose 示例不同。从主仓库根目录运行：

```bash
CHRONOFRAME_WORKER_ENV_FILE=/opt/chronoframe/processor/processor.env \
  docker compose -f apps/worker/compose.yaml up -d --build
```

这里的 `CHRONOFRAME_WORKER_ENV_FILE` 是现有 Compose 文件用于选择环境文件的变量名；文件内仍使用新的 `CHRONOFRAME_PROCESSOR_KEY`。

源码 Compose 示例启用了只读根文件系统和 `/tmp` 临时内存盘，并配置了内存、CPU、进程数等限制。处理照片时需要临时文件空间，请按服务器资源及管理端阈值调整这些限制。
