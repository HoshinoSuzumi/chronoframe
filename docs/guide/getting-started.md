# Getting Started

ChronoFrame stores photo metadata and settings in SQLite. You only need Docker and a directory for persistent data; there is no separate database service to set up.

## Start the container

<DocTabs label="Deployment method" :tabs="[{ id: 'compose', label: 'Docker Compose' }, { id: 'run', label: 'Docker Run' }]">

<template #compose>

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
```

```bash
docker compose up -d
docker compose logs -f chronoframe
```

</template>

<template #run>

Start the container directly:

```bash
docker run -d --name chronoframe --restart unless-stopped \
  -p 3000:3000 -v "$(pwd)/data:/app/data" \
  ghcr.io/hoshinosuzumi/chronoframe:latest
```

</template>

</DocTabs>

For Docker Hub, replace the image with `hoshinosuzumi/chronoframe:latest`.

Open `http://localhost:3000`. A fresh installation opens the setup wizard; you do not need to create an `.env` file first.

## Complete the setup wizard

1. **Administrator**: choose your email, username and password. Use these credentials to sign in later.
2. **Site**: enter the gallery title, description, author and avatar.
3. **Storage**: choose local storage, S3 or OpenList. For local storage, use `/app/data/storage` so photos are saved in the mounted data directory.
4. **Map**: choose MapLibre or Mapbox and enter the service token and style. You can leave the token empty and add it in the dashboard later. Map views need a working map service.
5. Review your choices and finish setup to enter the dashboard.

## Enter the dashboard

::: tip First-visit tours
After setup, open `/dashboard`. On your first visit to the dashboard, photo library and settings pages, a step-by-step tour points out uploads, queues and common settings. You can skip it and reset the tours later in **Site settings → System settings**.
:::

![Dashboard overview showing the photo library, queue and settings navigation alongside photo statistics and task status](/images/dashboard-overview.jpg)

### Upload your first photo

1. Open **Photos** and select or drag in your files.
2. Check **Queue management** while EXIF, thumbnails and location lookup finish.
3. Open the gallery to check the result; inspect and retry failed tasks.

Local storage is ready to use. The service guides explain S3 credentials and CORS, OpenList URLs and tokens, and map API keys. Enter these in the dashboard, without converting them into environment variables.

## Keep your data

Keep the `./data:/app/data` mount. The default database is `/app/data/app.sqlite3`; a session secret is generated automatically and saved to `/app/data/.session-password`. With the local path above, originals and derived files also live under this directory.

::: warning Preserve data when updating
Keep the data directory when replacing a container. Files stored in S3 or OpenList need their own backup; a database backup alone cannot restore missing originals.
:::

## Use a domain and HTTPS

You can place Caddy, Nginx or Traefik in front of the container. Match the proxy upload limit to your dashboard setting and allow streaming responses for live logs.

::: warning Trust only your own proxy
Enable `NUXT_TRUST_PROXY=true` only if port 3000 is reachable exclusively through a trusted proxy that replaces client-supplied `X-Forwarded-For` headers. This deployment option still uses an environment variable.
:::

For a proxy running on the host, replace the existing `chronoframe` service's `ports` and `environment` fields with the following. Replace `3000:3000`; do not retain a publicly bound port mapping:

```yaml
services:
  chronoframe:
    ports:
      - '127.0.0.1:3000:3000'
    environment:
      NUXT_TRUST_PROXY: 'true'
```

Keep the existing image, volumes and other service configuration. If the proxy also runs in a container, put both services on a private Docker network, proxy to `http://chronoframe:3000`, and remove the application service's `ports` mapping.

An Nginx application proxy block can look like this:

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

## Next steps

Read [Using ChronoFrame](/guide/usage) for uploads, albums and dashboard settings. For an existing installation, start with the [update guide](/guide/updates).
