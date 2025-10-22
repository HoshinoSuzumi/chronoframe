# 快速开始

本文档将指导您如何快速部署并开始使用 ChronoFrame。

:::warning 🚧施工中
文档正在编写中，部分功能文档尚未完成。
:::

## 前置准备

- 可用的 [Docker](https://docs.docker.com/get-docker/) 环境。
- 存储后端：可以直接使用内置本地文件系统，也可以配置任意兼容 S3 协议的对象存储。详见 [存储提供者](/zh/configuration/storage-providers)。
  :::tip S3 参数清单
  若使用 S3，请准备：`ACCESS_KEY_ID`、`SECRET_ACCESS_KEY`、`ENDPOINT`、`BUCKET_NAME`、`REGION`，以及（可选）当外链域名与 ENDPOINT 不同时的 `CDN_URL`。
  :::
- （可选）[GitHub OAuth 应用](https://github.com/settings/applications/new)（用于启用 GitHub 登录，需要 `CLIENT_ID` 与 `CLIENT_SECRET`）。
  :::tip 回调地址
  在 GitHub OAuth 应用中将 Authorization callback URL 设为：`http(s)://<你的域名>/api/auth/github`
  :::
  :::info
  未配置 GitHub OAuth 也能使用默认管理员账号（首次启动自动创建）登录。
  :::

## 快速部署

### 拉取镜像

我们推荐使用预构建的 Docker 镜像进行部署，镜像托管在 GHCR 和 Docker Hub，您可以根据网络情况选择合适的源。

#### [GitHub Container Registry (GHCR)](https://github.com/HoshinoSuzumi/chronoframe/pkgs/container/chronoframe)
```bash
docker pull ghcr.io/hoshinosuzumi/chronoframe:latest
```

#### [Docker Hub](https://hub.docker.com/r/hoshinosuzumi/chronoframe)
```bash
docker pull hoshinosuzumi/chronoframe:latest
```

### 创建配置文件

创建 `.env` 文件。下面是使用本地存储的最小示例，完整配置请参阅 [配置说明](/zh/guide/configuration)。

```bash
# 管理员邮箱（必须）
CFRAME_ADMIN_EMAIL=
# 管理员用户名（可选，默认 ChronoFrame）
CFRAME_ADMIN_NAME=
# 管理员密码（可选，默认 CF1234@!）
CFRAME_ADMIN_PASSWORD=

# 站点信息（均可选）
NUXT_PUBLIC_APP_TITLE=
NUXT_PUBLIC_APP_SLOGAN=
NUXT_PUBLIC_APP_AUTHOR=
NUXT_PUBLIC_APP_AVATAR_URL=

# 地图提供器 (maplibre/mapbox)
NUXT_PUBLIC_MAP_PROVIDER=maplibre
# 使用 MapLibre 需要 MapTiler 访问令牌
NUXT_PUBLIC_MAP_MAPLIBRE_TOKEN=
# 使用 Mapbox 需要 Mapbox 访问令牌
NUXT_PUBLIC_MAPBOX_ACCESS_TOKEN=

# 存储提供者（local 或 s3 或 openlist）
NUXT_STORAGE_PROVIDER=local
NUXT_PROVIDER_LOCAL_PATH=/app/data/storage

# 会话密码（必须，32 位随机字符串）
NUXT_SESSION_PASSWORD=
```

若选择使用 S3，请将存储部分替换为：

```bash
NUXT_STORAGE_PROVIDER=s3
NUXT_PROVIDER_S3_ENDPOINT=
NUXT_PROVIDER_S3_BUCKET=chronoframe
NUXT_PROVIDER_S3_REGION=auto
NUXT_PROVIDER_S3_ACCESS_KEY_ID=
NUXT_PROVIDER_S3_SECRET_ACCESS_KEY=
NUXT_PROVIDER_S3_PREFIX=photos/
NUXT_PROVIDER_S3_CDN_URL=
```

若选择使用 openlist，请将存储部分替换为：

```bash
NUXT_STORAGE_PROVIDER=openlist
NUXT_PROVIDER_OPENLIST_BASE_URL=https://openlist.example.com
NUXT_PROVIDER_OPENLIST_ROOT_PATH=/115pan/chronoframe
NUXT_PROVIDER_OPENLIST_TOKEN=your-static-token
```

可选 GitHub OAuth 变量：

```bash
NUXT_OAUTH_GITHUB_CLIENT_ID=
NUXT_OAUTH_GITHUB_CLIENT_SECRET=
```

### Docker 单容器部署

#### 快速启动

```bash
docker run -d --name chronoframe -p 3000:3000 -v $(pwd)/data:/app/data --env-file .env ghcr.io/hoshinosuzumi/chronoframe:latest
```

### Docker Compose 部署

推荐使用 Docker Compose 进行生产环境部署，便于管理和配置。

#### 1. 创建 `docker-compose.yml` 文件

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
    env_file:
      - .env
```

#### 2. 启动 ChronoFrame 服务

```bash
# 启动服务
docker compose up -d

# 查看日志
docker compose logs -f chronoframe

# 停止服务
docker compose down

# 更新到最新版本
docker compose pull
docker compose up -d
```

## 反向代理

在生产环境中部署时，您通常需要一个反向代理服务器（如 Nginx 或 Caddy）来处理 HTTPS 和域名解析。以下是一些示例配置。

### Nginx

```nginx
server {
    listen 80;
    server_name your-domain.com;
    
    # HTTPS 重定向
    return 301 https://$server_name$request_uri;
}

server {
    listen 443 ssl http2;
    server_name your-domain.com;
    
    # SSL 证书配置
    ssl_certificate /path/to/your/certificate.crt;
    ssl_certificate_key /path/to/your/private.key;
    
    # SSL 安全配置
    ssl_protocols TLSv1.2 TLSv1.3;
    ssl_ciphers ECDHE-RSA-AES128-GCM-SHA256:ECDHE-RSA-AES256-GCM-SHA384;
    ssl_prefer_server_ciphers off;
    
    # 上传大小限制
    client_max_body_size 100M;
    
    location / {
        proxy_pass http://localhost:3000;
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection 'upgrade';
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
        proxy_cache_bypass $http_upgrade;
        
        # WebSocket 支持
        proxy_set_header Connection "upgrade";
        proxy_set_header Upgrade $http_upgrade;
        
        # 超时设置
        proxy_connect_timeout 60s;
        proxy_send_timeout 60s;
        proxy_read_timeout 60s;
    }
    
    # 静态资源缓存
    location ~* \.(jpg|jpeg|png|gif|webp|svg|css|js|ico|woff|woff2|ttf|eot)$ {
        proxy_pass http://localhost:3000;
        expires 1y;
        add_header Cache-Control "public, immutable";
        proxy_set_header Host $host;
    }
}
```

### Traefik

如果您使用 Traefik 作为反向代理，可以在 `docker-compose.yml` 中添加标签：

```yaml
services:
  chronoframe:
    image: ghcr.io/hoshinosuzumi/chronoframe:latest
    container_name: chronoframe
    restart: unless-stopped
    volumes:
      - ./data:/app/data
    env_file:
      - .env
    labels:
      - "traefik.enable=true"
      - "traefik.http.routers.chronoframe.rule=Host(`your-domain.com`)"
      - "traefik.http.routers.chronoframe.entrypoints=websecure"
      - "traefik.http.routers.chronoframe.tls.certresolver=letsencrypt"
      - "traefik.http.services.chronoframe.loadbalancer.server.port=3000"
    networks:
      - traefik

networks:
  traefik:
    external: true
```

## 常见问题

:::details 如何生成随机的 `NUXT_SESSION_PASSWORD`？
```bash
# Linux / macOS
openssl rand -base64 32

# Windows (pwsh)
[Convert]::ToBase64String((1..32|%{[byte](Get-Random -Max 256)}))
```
:::

:::details 登录后台认证成功后，跳转到首页且仍为未登录状态？
首先请确保不是直接通过 IP 地址和端口号访问。出于安全考虑，请通过配置的域名访问。

如果出于某些原因，您执意要通过 IP 端口访问，请在配置项中添加：
```bash
NUXT_ALLOW_INSECURE_COOKIE=true
```
:::
