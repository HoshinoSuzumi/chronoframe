# 快速开始

ChronoFrame 使用 SQLite 保存照片信息和设置，无需单独部署数据库。准备好 Docker 和一个用于持久化数据的目录，就可以启动。

## 启动容器

<DocTabs label="部署方式" :tabs="[{ id: 'compose', label: 'Docker Compose' }, { id: 'run', label: 'Docker Run' }]">

<template #compose>

创建 `docker-compose.yml`：

```yaml
services:
  chronoframe:
    image: ghcr.io/hoshinosuzumi/chronoframe:latest
    container_name: chronoframe
    restart: unless-stopped
    ports:
      - '3000:3000'
    volumes:
      - ./data:/app/data
```

```bash
docker compose up -d
docker compose logs -f chronoframe
```

</template>

<template #run>

直接启动容器：

```bash
docker run -d --name chronoframe --restart unless-stopped \
  -p 3000:3000 -v "$(pwd)/data:/app/data" \
  ghcr.io/hoshinosuzumi/chronoframe:latest
```

</template>

</DocTabs>

也可以将镜像名换成 `hoshinosuzumi/chronoframe:latest`，从 Docker Hub 拉取。

打开 `http://localhost:3000`，首次访问会进入设置向导。新部署不需要先填写 `.env`。

## 完成设置向导

1. **管理员**：填写邮箱、用户名和密码，之后使用这组凭据登录。
2. **站点信息**：填写画廊名称、介绍、作者和头像。
3. **存储**：选择本地存储、S3 或 OpenList。本地存储的路径填写 `/app/data/storage`，这样照片会随数据卷保存。
4. **地图**：选择 MapLibre 或 Mapbox，并填写相应服务的令牌和样式。也可以暂不填写令牌，稍后在后台补充。没有可用的地图服务时，相关地图不会正常展示。
5. 确认并完成向导，进入后台。

## 进入仪表盘

::: tip 首次进入会有指引
完成向导后进入 `/dashboard`。第一次访问仪表盘、照片库和各设置页时，会有分步指引，带你找到上传入口、队列和常用设置。可以随时跳过；需要重新查看时，在 **站点设置 → 系统设置** 中重置指引。
:::

![仪表盘概览：左侧为照片库、队列和站点设置，右侧为照片统计和任务状态](/images/dashboard-overview.jpg)

### 上传第一张照片

1. 打开 **照片库**，选择文件或拖入照片开始上传。
2. 到 **队列管理** 等待 EXIF 提取、缩略图和地点识别完成。
3. 打开画廊检查效果；失败任务可以查看原因并重试。

本地存储可以直接开始使用。S3 的访问密钥和 CORS、OpenList 的服务地址与令牌，以及地图服务的 Key，都在对应的服务指南中说明，无需换成环境变量。

## 保存数据

`./data:/app/data` 是部署中必须保留的挂载。默认数据库为 `/app/data/app.sqlite3`，会话密钥自动生成并保存在 `/app/data/.session-password`。使用上述本地路径时，原图和衍生文件也在这个目录下。

::: warning 更新时保留数据
不要删除数据目录来更新应用。S3 和 OpenList 的文件存放在外部服务中，需要另外备份；只备份数据库无法恢复丢失的原图。
:::

## 使用域名和 HTTPS

可以在容器前使用 Caddy、Nginx 或 Traefik。反向代理的上传大小上限应与后台设置匹配，并保留流式响应，供实时日志使用。

::: warning 仅信任受控代理
只有在 3000 端口只能被可信代理访问、且代理会覆盖用户传入的 `X-Forwarded-For` 时，才启用 `NUXT_TRUST_PROXY=true`。这项部署设置仍使用环境变量。
:::

如果代理运行在宿主机上，将现有 `chronoframe` 服务的 `ports` 和 `environment` 改为下面的配置；替换原有的 `3000:3000`，不要保留对外开放的映射：

```yaml
services:
  chronoframe:
    ports:
      - '127.0.0.1:3000:3000'
    environment:
      NUXT_TRUST_PROXY: 'true'
```

保留服务中原有的镜像、数据卷等其他配置。若代理也运行在容器中，让两个服务使用专用 Docker 网络，代理通过 `http://chronoframe:3000` 访问应用，并移除应用服务的 `ports` 映射。

Nginx 的应用代理段可参考：

```nginx
location / {
    proxy_pass http://127.0.0.1:3000;
    proxy_set_header Host $host;
    proxy_set_header X-Forwarded-For $remote_addr;
    proxy_set_header X-Forwarded-Proto $scheme;
    proxy_buffering off;
    proxy_read_timeout 300s;
    client_max_body_size 256M;
}
```

## 接下来

进入[日常使用](/zh/guide/usage)了解上传、相册和后台设置。已有旧版实例请先阅读[升级指南](/zh/guide/updates)。
