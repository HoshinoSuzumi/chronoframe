# Getting Started

This guide walks you through deploying and using ChronoFrame quickly.

:::warning 🚧 Under Construction
The documentation is still being written; some sections may be incomplete.
:::

## Prerequisites

- A working [Docker](https://docs.docker.com/get-docker/) environment.
- A storage backend. You can start with the built‑in local filesystem storage or configure an S3‑compatible bucket. See the [Storage Providers](/configuration/storage-providers) section for details.
  :::tip S3 configuration checklist
  If using S3, collect: `ACCESS_KEY_ID`, `SECRET_ACCESS_KEY`, `ENDPOINT`, `BUCKET_NAME`, `REGION`, and optionally a public CDN base URL (`CDN_URL`) if different from the endpoint.
  :::
- (Optional) A [GitHub OAuth App](https://github.com/settings/applications/new) for enabling GitHub login (`CLIENT_ID`, `CLIENT_SECRET`).
  :::tip Callback URL
  Set the OAuth app Authorization callback URL to: `http(s)://<your-domain>/api/auth/github`
  :::
  :::info
  If GitHub OAuth is not configured you can still log in with the default admin account (auto‑provisioned on first start).
  :::

## Quick Deployment

### Pull Image

Use the published image on GitHub Container Registry and Docker Hub. Choose the source that works best for your network:

#### [GitHub Container Registry (GHCR)](https://github.com/HoshinoSuzumi/chronoframe/pkgs/container/chronoframe)

```bash
docker pull ghcr.io/hoshinosuzumi/chronoframe:latest
```

#### [Docker Hub](https://hub.docker.com/r/hoshinosuzumi/chronoframe)

```bash
docker pull hoshinosuzumi/chronoframe:latest
```

### Create `.env`

Below is the minimal configuration for running with local storage. For the complete list, see the [Configuration Guide](/guide/configuration).

```bash
# Admin email (required)
CFRAME_ADMIN_EMAIL=
# Admin username (optional, default Chronoframe)
CFRAME_ADMIN_NAME=
# Admin password (optional, default CF1234@!)
CFRAME_ADMIN_PASSWORD=

# Site metadata (all optional)
NUXT_PUBLIC_APP_TITLE=
NUXT_PUBLIC_APP_SLOGAN=
NUXT_PUBLIC_APP_AUTHOR=
NUXT_PUBLIC_APP_AVATAR_URL=

# Map provider (maplibre/mapbox)
NUXT_PUBLIC_MAP_PROVIDER=maplibre
# MapTiler access token for MapLibre
NUXT_PUBLIC_MAP_MAPLIBRE_TOKEN=
# Mapbox access token for Mapbox
NUXT_PUBLIC_MAPBOX_ACCESS_TOKEN=

# Storage provider (local or s3 or openlist)
NUXT_STORAGE_PROVIDER=local
NUXT_PROVIDER_LOCAL_PATH=/app/data/storage

# Session password (32‑char random string, required)
NUXT_SESSION_PASSWORD=
```

If you want to use S3 instead of local storage, replace the storage section with:

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

If you want to use openlist instead of local storage, replace the storage section with:

```bash
NUXT_STORAGE_PROVIDER=openlist
NUXT_PROVIDER_OPENLIST_BASE_URL=https://openlist.example.com
NUXT_PROVIDER_OPENLIST_ROOT_PATH=/115pan/chronoframe
NUXT_PROVIDER_OPENLIST_TOKEN=your-static-token
```

Optional GitHub OAuth variables:

```bash
NUXT_OAUTH_GITHUB_CLIENT_ID=
NUXT_OAUTH_GITHUB_CLIENT_SECRET=
```

### Single Container (Docker Run)

```bash
docker run -d \
  --name chronoframe \
  -p 3000:3000 \
  -v "$(pwd)/data:/app/data" \
  --env-file .env \
  ghcr.io/hoshinosuzumi/chronoframe:latest
```

### Docker Compose

Create `docker-compose.yml`:

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

Start / manage lifecycle:

```bash
# Start
docker compose up -d

# Follow logs
docker compose logs -f chronoframe

# Stop
docker compose down

# Update to latest image
docker compose pull
docker compose up -d
```

## Reverse Proxy

For production you typically place ChronoFrame behind a reverse proxy (Nginx, Caddy, Traefik) to terminate HTTPS and serve via your domain.

### Nginx Example

```nginx
server {
    listen 80;
    server_name your-domain.com;
    return 301 https://$server_name$request_uri;
}

server {
    listen 443 ssl http2;
    server_name your-domain.com;

    ssl_certificate /path/to/your/certificate.crt;
    ssl_certificate_key /path/to/your/private.key;

    ssl_protocols TLSv1.2 TLSv1.3;
    ssl_ciphers ECDHE-RSA-AES128-GCM-SHA256:ECDHE-RSA-AES256-GCM-SHA384;
    ssl_prefer_server_ciphers off;

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
        proxy_connect_timeout 60s;
        proxy_send_timeout 60s;
        proxy_read_timeout 60s;
    }

    location ~* \.(jpg|jpeg|png|gif|webp|svg|css|js|ico|woff|woff2|ttf|eot)$ {
        proxy_pass http://localhost:3000;
        expires 1y;
        add_header Cache-Control "public, immutable";
        proxy_set_header Host $host;
    }
}
```

### Traefik (Labels)

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

## Common Issues

:::details How do I generate a random `NUXT_SESSION_PASSWORD`?
```bash
# Linux / macOS
openssl rand -base64 32

# Windows (PowerShell)
[Convert]::ToBase64String((1..32|%{[byte](Get-Random -Max 256)}))
```
:::

:::details Logged in successfully but redirected home still unauthenticated?
Make sure you are not accessing the site via raw IP:port. For security, cookies are set for the domain.

If you must use IP + port (not recommended), add:
```bash
NUXT_ALLOW_INSECURE_COOKIE=true
```
:::