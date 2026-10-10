# 快速开始

ChronoFrame 使用 SQLite 保存照片信息和设置，无需单独部署数据库。准备好 Docker 和一个用于持久化数据的目录，就可以启动。

## 启动容器

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

也可以将镜像名换成 `hoshinosuzumi/chronoframe:latest`，从 Docker Hub 拉取。

```bash
docker compose up -d
docker compose logs -f chronoframe
```

习惯直接使用 Docker 的话：

```bash
docker run -d --name chronoframe --restart unless-stopped \
  -p 3000:3000 -v "$(pwd)/data:/app/data" \
  ghcr.io/hoshinosuzumi/chronoframe:latest
```

打开 `http://localhost:3000`，首次访问会进入设置向导。新部署不需要先填写 `.env`。

## 完成设置向导

1. **管理员**：填写邮箱、用户名和密码，之后使用这组凭据登录。不要沿用旧教程中的默认密码。
2. **站点信息**：填写画廊名称、介绍、作者和头像。
3. **存储**：选择本地存储、S3 或 OpenList。本地存储的路径填写 `/app/data/storage`，这样照片会随数据卷保存。
4. **地图**：选择 MapLibre 或 Mapbox，并填写相应服务的令牌和样式。也可以暂不填写令牌，稍后在后台补充。没有可用的地图服务时，相关地图不会正常展示。
5. 确认并完成向导，进入后台。

S3 需要准备 Endpoint、Bucket、Region、Access Key ID 和 Secret Access Key，可另设 CDN 地址。OpenList 需要服务地址、根目录和访问令牌。连接信息直接填写到向导或后台，无需换成环境变量。

## 保存数据

`./data:/app/data` 是部署中必须保留的挂载。默认数据库为 `/app/data/app.sqlite3`，会话密钥自动生成并保存在 `/app/data/.session-password`。使用上述本地路径时，原图和衍生文件也在这个目录下。

不要删除数据目录来更新应用。S3 和 OpenList 的文件存放在外部服务中，需要另外备份；只备份数据库无法恢复丢失的原图。

## 使用域名和 HTTPS

可以在容器前使用 Caddy、Nginx 或 Traefik。反向代理的上传大小上限应与后台设置匹配，并保留流式响应，供实时日志使用。

只有在 3000 端口只能被可信代理访问、且代理会覆盖用户传入的 `X-Forwarded-For` 时，才启用 `NUXT_TRUST_PROXY=true`。这项部署设置仍使用环境变量，例如在 Compose 中加入：

```yaml
environment:
  NUXT_TRUST_PROXY: 'true'
```

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
