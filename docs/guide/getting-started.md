# Getting Started

ChronoFrame stores photo metadata and settings in SQLite. You only need Docker and a directory for persistent data; there is no separate database service to set up.

## Start the container

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

For Docker Hub, replace the image with `hoshinosuzumi/chronoframe:latest`.

```bash
docker compose up -d
docker compose logs -f chronoframe
```

Or use Docker directly:

```bash
docker run -d --name chronoframe --restart unless-stopped \
  -p 3000:3000 -v "$(pwd)/data:/app/data" \
  ghcr.io/hoshinosuzumi/chronoframe:latest
```

Open `http://localhost:3000`. A fresh installation opens the setup wizard; you do not need to create an `.env` file first.

## Complete the setup wizard

1. **Administrator**: choose your email, username and password. Use these credentials to sign in later. Avoid the default password from older tutorials.
2. **Site**: enter the gallery title, description, author and avatar.
3. **Storage**: choose local storage, S3 or OpenList. For local storage, use `/app/data/storage` so photos are saved in the mounted data directory.
4. **Map**: choose MapLibre or Mapbox and enter the service token and style. You can leave the token empty and add it in the dashboard later. Map views need a working map service.
5. Review your choices and finish setup to enter the dashboard.

For S3, prepare an endpoint, bucket, region, access key ID and secret access key, plus an optional CDN URL. For OpenList, prepare the service URL, root path and access token. Enter these in the wizard or dashboard, rather than environment variables.

## Keep your data

Keep the `./data:/app/data` mount. The default database is `/app/data/app.sqlite3`; a session secret is generated automatically and saved to `/app/data/.session-password`. With the local path above, originals and derived files also live under this directory.

Keep the data directory when replacing a container. Files stored in S3 or OpenList need their own backup; a database backup alone cannot restore missing originals.

## Use a domain and HTTPS

You can place Caddy, Nginx or Traefik in front of the container. Match the proxy upload limit to your dashboard setting and allow streaming responses for live logs.

Enable `NUXT_TRUST_PROXY=true` only if port 3000 is reachable exclusively through a trusted proxy that replaces client-supplied `X-Forwarded-For` headers. This deployment option still uses an environment variable, for example in Compose:

```yaml
environment:
  NUXT_TRUST_PROXY: 'true'
```

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
