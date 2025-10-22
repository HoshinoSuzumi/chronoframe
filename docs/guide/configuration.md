# Configuration Reference

Whether using Docker or Docker Compose (.env) deployment, configuration is done through environment variables.

## Environment Variables List

| Environment Variable                 | Description                                                     | Default                 | Required                                             |
| ------------------------------------ | --------------------------------------------------------------- | ----------------------- | ---------------------------------------------------- |
| CFRAME_ADMIN_EMAIL                   | Initial admin user email                                        | `admin@chronoframe.com` | Yes                                                  |
| CFRAME_ADMIN_NAME                    | Initial admin username                                          | `Chronoframe`           | No                                                   |
| CFRAME_ADMIN_PASSWORD                | Initial admin user password                                     | `CF1234@!`              | No                                                   |
| NUXT_PUBLIC_APP_TITLE                | Application title                                               | `ChronoFrame`           | No                                                   |
| NUXT_PUBLIC_APP_SLOGAN               | Application slogan                                              | None                    | No                                                   |
| NUXT_PUBLIC_APP_AUTHOR               | Application author                                              | None                    | No                                                   |
| NUXT_PUBLIC_APP_AVATAR_URL           | Application avatar URL                                          | None                    | No                                                   |
| NUXT_PUBLIC_COLOR_MODE_PREFERENCE    | Color mode preference, options: `light`, `dark`, `system`       | `system`                | No                                                   |
| NUXT_PUBLIC_MAP_PROVIDER             | Map provider, options: `mapbox`, `maplibre`                     | `maplibre`              | No                                                   |
| NUXT_PUBLIC_MAPBOX_ACCESS_TOKEN      | Mapbox access token (URL restricted), for map services          | None                    | Required when `NUXT_PUBLIC_MAP_PROVIDER` is `mapbox` |
| NUXT_MAPBOX_ACCESS_TOKEN             | Mapbox access token (no URL restriction), for location services | None                    | No                                                   |
| NUXT_STORAGE_PROVIDER                | Storage provider, supports `local`, `s3`, `openlist`            | `local`                 | Yes                                                  |
| NUXT_PROVIDER_LOCAL_PATH             | Local storage path                                              | `/app/data/storage`     | No                                                   |
| NUXT_PROVIDER_LOCAL_BASE_URL         | Local storage access URL                                        | `/storage`              | No                                                   |
| NUXT_PROVIDER_S3_ENDPOINT            | S3 compatible storage service endpoint                          | None                    | Required when `NUXT_STORAGE_PROVIDER` is `s3`        |
| NUXT_PROVIDER_S3_BUCKET              | S3 bucket name                                                  | `chronoframe`           | Required when `NUXT_STORAGE_PROVIDER` is `s3`        |
| NUXT_PROVIDER_S3_REGION              | S3 bucket region                                                | `auto`                  | Required when `NUXT_STORAGE_PROVIDER` is `s3`        |
| NUXT_PROVIDER_S3_ACCESS_KEY_ID       | S3 access key ID                                                | None                    | Required when `NUXT_STORAGE_PROVIDER` is `s3`        |
| NUXT_PROVIDER_S3_SECRET_ACCESS_KEY   | S3 secret access key                                            | None                    | Required when `NUXT_STORAGE_PROVIDER` is `s3`        |
| NUXT_PROVIDER_S3_PREFIX              | S3 storage prefix                                               | `photos/`               | No                                                   |
| NUXT_PROVIDER_S3_CDN_URL             | S3 storage CDN URL                                              | None                    | No                                                   |
| NUXT_PROVIDER_OPENLIST_BASE_URL       | OpenList server URL                                             | None                    | Required when `NUXT_STORAGE_PROVIDER` is `openlist`  |
| NUXT_PROVIDER_OPENLIST_ROOT_PATH      | OpenList root path                                              | None                    | Required when `NUXT_STORAGE_PROVIDER` is `openlist`  |
| NUXT_PROVIDER_OPENLIST_TOKEN          | OpenList API token                                              | None                    | Recommended (for OpenList authentication)           |
| NUXT_PROVIDER_OPENLIST_ENDPOINT_UPLOAD| OpenList upload endpoint                                        | `/api/fs/put`           | No                                                   |
| NUXT_PROVIDER_OPENLIST_ENDPOINT_DOWNLOAD| OpenList download endpoint                                      | None                    | No                                                   |
| NUXT_PROVIDER_OPENLIST_ENDPOINT_LIST  | OpenList list endpoint                                          | None                    | No                                                   |
| NUXT_PROVIDER_OPENLIST_ENDPOINT_DELETE| OpenList delete endpoint                                        | `/api/fs/remove`        | No                                                   |
| NUXT_PROVIDER_OPENLIST_ENDPOINT_META  | OpenList metadata endpoint                                      | `/api/fs/get`           | No                                                   |
| NUXT_PROVIDER_OPENLIST_PATH_FIELD     | OpenList path field name                                        | `path`                  | No                                                   |
| NUXT_PROVIDER_OPENLIST_CDN_URL        | OpenList CDN URL                                                | None                    | No                                                   |
| NUXT_PUBLIC_OAUTH_GITHUB_ENABLED     | Enable GitHub OAuth login                                       | `false`                 | No                                                   |
| NUXT_OAUTH_GITHUB_CLIENT_ID          | GitHub OAuth app Client ID                                      | None                    | No (optional, for GitHub login)                      |
| NUXT_OAUTH_GITHUB_CLIENT_SECRET      | GitHub OAuth app Client Secret                                  | None                    | No (optional, for GitHub login)                      |
| NUXT_SESSION_PASSWORD                | Password for encrypting sessions, 32-character random string    | None                    | Yes                                                  |
| NUXT_PUBLIC_GTAG_ID                  | Google Analytics Tracking ID                                    | None                    | No                                                   |
| NUXT_PUBLIC_ANALYTICS_MATOMO_ENABLED | Enable Matomo analytics tracking                                | `false`                 | No                                                   |
| NUXT_PUBLIC_ANALYTICS_MATOMO_URL     | Matomo instance URL (e.g., https://matomo.example.com)          | None                    | No (required when Matomo is enabled)                 |
| NUXT_PUBLIC_ANALYTICS_MATOMO_SITE_ID | Matomo site ID                                                  | None                    | No (required when Matomo is enabled)                 |
| NUXT_UPLOAD_MIME_WHITELIST_ENABLED   | Enable MIME type whitelist validation for uploads               | `true`                  | No                                                   |
| NUXT_UPLOAD_MIME_WHITELIST           | Allowed MIME types for uploads (comma-separated)                | See below               | No                                                   |
| NUXT_UPLOAD_DUPLICATE_CHECK_ENABLED  | Enable duplicate file detection during upload                   | `true`                  | No                                                   |
| NUXT_UPLOAD_DUPLICATE_CHECK_MODE     | Duplicate handling mode, options: `warn`, `block`, `skip`       | `skip`                  | No                                                   |
| ALLOW_INSECURE_COOKIE                | Allow insecure cookies (only for development environment)       | `false`                 | No                                                   |

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

## Duplicate File Detection

`NUXT_UPLOAD_DUPLICATE_CHECK_ENABLED` controls whether to detect duplicate files during upload.

`NUXT_UPLOAD_DUPLICATE_CHECK_MODE` has three modes:

### skip (Skip Mode) - Default

- Skips upload when duplicate file is detected
- Returns existing photo info without any operations
- Suitable for automatic deduplication during batch uploads

```
NUXT_UPLOAD_DUPLICATE_CHECK_MODE=skip
```

### warn (Warning Mode)

- Shows warning when duplicate file is detected
- Continues upload, will overwrite existing photo data
- Suitable for scenarios where photo updates are needed

```
NUXT_UPLOAD_DUPLICATE_CHECK_MODE=warn
```

### block (Block Mode)

- Rejects upload if duplicate file is detected
- Returns 409 error, doesn't allow overwriting
- Suitable for scenarios requiring strict duplicate prevention

```
NUXT_UPLOAD_DUPLICATE_CHECK_MODE=block
```

### Completely Disable Detection

```
NUXT_UPLOAD_DUPLICATE_CHECK_ENABLED=false
```

**Notes**:

- Duplicate detection is based on filename, not file content
- Same filename generates same photoId
- Even with detection disabled, uploading same filename will still overwrite existing data (database uses `onConflictDoUpdate`)
- Recommend using unique filenames (e.g., adding timestamps) to avoid conflicts
