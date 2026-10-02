# Configuration Reference

Whether using Docker or Docker Compose (.env) deployment, configuration is done through environment variables.

## Environment Variables List

| Environment Variable                     | Description                                                     | Default                               | Required                                             |
| ---------------------------------------- | --------------------------------------------------------------- | ------------------------------------- | ---------------------------------------------------- |
| CFRAME_ADMIN_EMAIL                       | Initial admin user email                                        | `admin@chronoframe.com`               | Yes                                                  |
| CFRAME_ADMIN_NAME                        | Initial admin username                                          | `Chronoframe`                         | No                                                   |
| CFRAME_ADMIN_PASSWORD                    | Initial admin user password                                     | `CF1234@!`                            | No                                                   |
| NUXT_PUBLIC_APP_TITLE                    | Initial application title (seeded once into settings; dashboard wins after) | `ChronoFrame`                         | No                                                   |
| NUXT_PUBLIC_APP_SLOGAN                   | Initial application slogan (seeded once into settings; dashboard wins after) | None                                  | No                                                   |
| NUXT_PUBLIC_APP_AUTHOR                   | Initial application author (seeded once into settings; dashboard wins after) | None                                  | No                                                   |
| NUXT_PUBLIC_APP_AVATAR_URL               | Initial application avatar URL (seeded once into settings; dashboard wins after) | None                                  | No                                                   |
| NUXT_PUBLIC_COLOR_MODE_PREFERENCE        | Color mode preference, options: `light`, `dark`, `system`       | `system`                              | No                                                   |
| NUXT_PUBLIC_MAP_PROVIDER                 | Map provider, options: `mapbox`, `maplibre`                     | `maplibre`                            | No                                                   |
| NUXT_PUBLIC_MAPBOX_ACCESS_TOKEN          | Mapbox access token (URL restricted), for map services          | None                                  | Required when `NUXT_PUBLIC_MAP_PROVIDER` is `mapbox` |
| NUXT_NOMINATIM_BASE_URL                  | Nominatim base URL for reverse geocoding service                | `https://nominatim.openstreetmap.org` | No                                                   |
| NUXT_MAPBOX_ACCESS_TOKEN                 | Mapbox access token (no URL restriction), for location services | None                                  | No                                                   |
| NUXT_STORAGE_PROVIDER                    | Storage provider, supports `local`, `s3`, `openlist`            | `local`                               | Yes                                                  |
| NUXT_PROVIDER_LOCAL_PATH                 | Local storage path                                              | `/app/data/storage`                   | No                                                   |
| NUXT_PROVIDER_LOCAL_BASE_URL             | Local storage access URL                                        | `/storage`                            | No                                                   |
| NUXT_PROVIDER_S3_ENDPOINT                | S3 compatible storage service endpoint                          | None                                  | Required when `NUXT_STORAGE_PROVIDER` is `s3`        |
| NUXT_PROVIDER_S3_BUCKET                  | S3 bucket name                                                  | `chronoframe`                         | Required when `NUXT_STORAGE_PROVIDER` is `s3`        |
| NUXT_PROVIDER_S3_REGION                  | S3 bucket region                                                | `auto`                                | Required when `NUXT_STORAGE_PROVIDER` is `s3`        |
| NUXT_PROVIDER_S3_ACCESS_KEY_ID           | S3 access key ID                                                | None                                  | Required when `NUXT_STORAGE_PROVIDER` is `s3`        |
| NUXT_PROVIDER_S3_SECRET_ACCESS_KEY       | S3 secret access key                                            | None                                  | Required when `NUXT_STORAGE_PROVIDER` is `s3`        |
| NUXT_PROVIDER_S3_PREFIX                  | S3 storage prefix                                               | `photos/`                             | No                                                   |
| NUXT_PROVIDER_S3_CDN_URL                 | S3 storage CDN URL                                              | None                                  | No                                                   |
| NUXT_PROVIDER_OPENLIST_BASE_URL          | OpenList server URL                                             | None                                  | Required when `NUXT_STORAGE_PROVIDER` is `openlist`  |
| NUXT_PROVIDER_OPENLIST_ROOT_PATH         | OpenList root path                                              | None                                  | Required when `NUXT_STORAGE_PROVIDER` is `openlist`  |
| NUXT_PROVIDER_OPENLIST_TOKEN             | OpenList API token                                              | None                                  | Recommended (for OpenList authentication)            |
| NUXT_PROVIDER_OPENLIST_ENDPOINT_UPLOAD   | OpenList upload endpoint                                        | `/api/fs/put`                         | No                                                   |
| NUXT_PROVIDER_OPENLIST_ENDPOINT_DOWNLOAD | OpenList download endpoint                                      | None                                  | No                                                   |
| NUXT_PROVIDER_OPENLIST_ENDPOINT_LIST     | OpenList list endpoint                                          | None                                  | No                                                   |
| NUXT_PROVIDER_OPENLIST_ENDPOINT_DELETE   | OpenList delete endpoint                                        | `/api/fs/remove`                      | No                                                   |
| NUXT_PROVIDER_OPENLIST_ENDPOINT_META     | OpenList metadata endpoint                                      | `/api/fs/get`                         | No                                                   |
| NUXT_PROVIDER_OPENLIST_PATH_FIELD        | OpenList path field name                                        | `path`                                | No                                                   |
| NUXT_PROVIDER_OPENLIST_CDN_URL           | OpenList CDN URL                                                | None                                  | No                                                   |
| NUXT_PUBLIC_OAUTH_GITHUB_ENABLED         | Enable GitHub OAuth login                                       | `false`                               | No                                                   |
| NUXT_OAUTH_GITHUB_CLIENT_ID              | GitHub OAuth app Client ID                                      | None                                  | No (optional, for GitHub login)                      |
| NUXT_OAUTH_GITHUB_CLIENT_SECRET          | GitHub OAuth app Client Secret                                  | None                                  | No (optional, for GitHub login)                      |
| NUXT_SESSION_PASSWORD                    | Password for encrypting sessions, 32-character random string    | None                                  | Yes                                                  |
| NUXT_TRUST_PROXY                         | Trust `X-Forwarded-For` for album unlock rate limits; enable only behind a trusted proxy that replaces client-supplied headers | `false`                               | No                                                   |
| NUXT_PUBLIC_GTAG_ID                      | Google Analytics Tracking ID                                    | None                                  | No                                                   |
| NUXT_PUBLIC_ANALYTICS_MATOMO_ENABLED     | Enable Matomo analytics tracking                                | `false`                               | No                                                   |
| NUXT_PUBLIC_ANALYTICS_MATOMO_URL         | Matomo instance URL (e.g., https://matomo.example.com)          | None                                  | No (required when Matomo is enabled)                 |
| NUXT_PUBLIC_ANALYTICS_MATOMO_SITE_ID     | Matomo site ID                                                  | None                                  | No (required when Matomo is enabled)                 |
| NUXT_UPLOAD_MIME_WHITELIST_ENABLED       | Enable MIME type whitelist validation for uploads               | `true`                                | No                                                   |
| NUXT_UPLOAD_MIME_WHITELIST               | Allowed MIME types for uploads (comma-separated)                | See below                             | No                                                   |
| ALLOW_INSECURE_COOKIE                    | Allow insecure cookies (only for development environment)       | `false`                               | No                                                   |

## App settings vs environment variables

`NUXT_PUBLIC_APP_TITLE`, `NUXT_PUBLIC_APP_SLOGAN`, `NUXT_PUBLIC_APP_AUTHOR`, and `NUXT_PUBLIC_APP_AVATAR_URL` are **first-boot seeds** only.

On startup, ChronoFrame copies an env value into the settings database **only when**:

1. The env var is explicitly set to a non-empty value, and
2. That setting still equals its schema default (never customized)

After you change Instance Name (or related fields) in **Dashboard → Settings → General**, or during the setup wizard, the database value is the source of truth. Later restarts do **not** re-apply env, even if the env var still holds an older title.

Recommendations:

- Prefer setting the instance name in the dashboard after install.
- Leave these env vars empty unless you want a non-default title on a fresh database.
- In Docker Compose / Coolify, avoid personal fallbacks such as `${CFRAME_APP_TITLE:-My Studio Name}`. Empty should stay empty:

```yaml
environment:
  NUXT_PUBLIC_APP_TITLE: '${CFRAME_APP_TITLE:-}'
```

Clearing an env var does not reset a title already stored in the database; change it in the dashboard instead.

## Upload File Type Whitelist

The default value of `NUXT_UPLOAD_MIME_WHITELIST` includes the following MIME types:

- `image/jpeg` - JPEG images
- `image/png` - PNG images
- `image/webp` - WebP images
- `image/gif` - GIF images
- `image/bmp` - BMP images
- `image/tiff` - TIFF images
- `image/heic` - HEIC images (Apple)
- `image/heif` - HEIF images
- `video/quicktime` - QuickTime videos (MOV)
- `video/mp4` - MP4 videos

To customize the whitelist, use a comma-separated string of MIME types, for example:

```
NUXT_UPLOAD_MIME_WHITELIST=image/jpeg,image/png,video/mp4
```

To disable whitelist validation (allow any file type), set:

```
NUXT_UPLOAD_MIME_WHITELIST_ENABLED=false
```
