# 配置项说明

无论是使用 Docker 还是 Docker Compose (.env) 方式部署，均通过环境变量进行配置。

## 环境变量列表

| 环境变量                             | 说明                                                 | 默认值                  | 必需                                             |
| ------------------------------------ | ---------------------------------------------------- | ----------------------- | ------------------------------------------------ |
| CFRAME_ADMIN_EMAIL                   | 初始管理员用户的邮箱                                 | `admin@chronoframe.com` | 是                                               |
| CFRAME_ADMIN_NAME                    | 初始管理员用户的用户名                               | `Chronoframe`           | 否                                               |
| CFRAME_ADMIN_PASSWORD                | 初始管理员用户的密码                                 | `CF1234@!`              | 否                                               |
| NUXT_PUBLIC_APP_TITLE                | 应用标题                                             | `ChronoFrame`           | 否                                               |
| NUXT_PUBLIC_APP_SLOGAN               | 应用口号                                             | 无                      | 否                                               |
| NUXT_PUBLIC_APP_AUTHOR               | 应用作者                                             | 无                      | 否                                               |
| NUXT_PUBLIC_APP_AVATAR_URL           | 应用头像 URL                                         | 无                      | 否                                               |
| NUXT_PUBLIC_COLOR_MODE_PREFERENCE    | 颜色模式偏好，可选 `light`、`dark`、`system`         | system                  | 否                                               |
| NUXT_PUBLIC_MAP_PROVIDER             | 地图提供者，可选 `mapbox`、`maplibre`                | `maplibre`              | 否                                               |
| NUXT_PUBLIC_MAPBOX_ACCESS_TOKEN      | Mapbox 访问令牌(可限制 URL)，用于地图服务            | 无                      | 当 `NUXT_PUBLIC_MAP_PROVIDER` 为 `mapbox` 时必需 |
| NUXT_MAPBOX_ACCESS_TOKEN             | Mapbox 访问令牌(无 URL 限制)，用于位置信息服务       | 无                      | 否                                               |
| NUXT_STORAGE_PROVIDER                | 存储提供者，支持 `local`、`s3`、`openlist`                | `local`                 | 是                                               |
| NUXT_PROVIDER_LOCAL_PATH             | 本地存储路径                                         | `/app/data/storage`     | 否                                               |
| NUXT_PROVIDER_LOCAL_BASE_URL         | 本地存储的访问 URL                                   | `/storage`              | 否                                               |
| NUXT_PROVIDER_S3_ENDPOINT            | S3 兼容存储服务的 Endpoint                           | 无                      | 当 `NUXT_STORAGE_PROVIDER` 为 `s3` 时必需        |
| NUXT_PROVIDER_S3_BUCKET              | S3 存储桶名称                                        | `chronoframe`           | 当 `NUXT_STORAGE_PROVIDER` 为 `s3` 时必需        |
| NUXT_PROVIDER_S3_REGION              | S3 存储桶区域                                        | `auto`                  | 当 `NUXT_STORAGE_PROVIDER` 为 `s3` 时必需        |
| NUXT_PROVIDER_S3_ACCESS_KEY_ID       | S3 访问密钥 ID                                       | 无                      | 当 `NUXT_STORAGE_PROVIDER` 为 `s3` 时必需        |
| NUXT_PROVIDER_S3_SECRET_ACCESS_KEY   | S3 访问密钥                                          | 无                      | 当 `NUXT_STORAGE_PROVIDER` 为 `s3` 时必需        |
| NUXT_PROVIDER_S3_PREFIX              | S3 存储前缀                                          | `photos/`               | 否                                               |
| NUXT_PROVIDER_S3_CDN_URL             | S3 存储的 CDN 地址                                   | 无                      | 否                                               |
| NUXT_PROVIDER_OPENLIST_BASE_URL       | OpenList 服务器 URL                                  | 无                      | 当 `NUXT_STORAGE_PROVIDER` 为 `openlist` 时必需  |
| NUXT_PROVIDER_OPENLIST_ROOT_PATH      | OpenList 根路径                                      | 无                      | 当 `NUXT_STORAGE_PROVIDER` 为 `openlist` 时必需  |
| NUXT_PROVIDER_OPENLIST_TOKEN          | OpenList API 令牌                                               | 无                      | 当 `NUXT_STORAGE_PROVIDER` 为 `openlist` 时必需（用于 OpenList 认证）           |
| NUXT_PROVIDER_OPENLIST_ENDPOINT_UPLOAD| OpenList 上传端点                                               | `/api/fs/put`           | 否                                                   |
| NUXT_PROVIDER_OPENLIST_ENDPOINT_DOWNLOAD| OpenList 下载端点                                  | 无                      | 否                                               |
| NUXT_PROVIDER_OPENLIST_ENDPOINT_LIST  | OpenList 列表端点                                    | 无                      | 否                                               |
| NUXT_PROVIDER_OPENLIST_ENDPOINT_DELETE| OpenList 删除端点                                    | `/api/fs/remove`        | 否                                               |
| NUXT_PROVIDER_OPENLIST_ENDPOINT_META  | OpenList 元数据端点                                  | `/api/fs/get`           | 否                                               |
| NUXT_PROVIDER_OPENLIST_PATH_FIELD     | OpenList 路径字段名                                  | `path`                  | 否                                               |
| NUXT_PROVIDER_OPENLIST_CDN_URL        | OpenList CDN 地址                                    | 无                      | 否                                               |
| NUXT_PUBLIC_OAUTH_GITHUB_ENABLED     | 是否启用 GitHub OAuth 登录                           | `false`                 | 否                                               |
| NUXT_OAUTH_GITHUB_CLIENT_ID          | GitHub OAuth 应用的 Client ID                        | 无                      | 否(可选,用于 GitHub 登录)                        |
| NUXT_OAUTH_GITHUB_CLIENT_SECRET      | GitHub OAuth 应用的 Client Secret                    | 无                      | 否(可选,用于 GitHub 登录)                        |
| NUXT_SESSION_PASSWORD                | 用于加密会话的密码，32 位随机字符串                  | 无                      | 是                                               |
| NUXT_PUBLIC_GTAG_ID                  | Google Analytics 追踪 ID                             | 无                      | 否                                               |
| NUXT_PUBLIC_ANALYTICS_MATOMO_ENABLED | 是否启用 Matomo 分析追踪                             | `false`                 | 否                                               |
| NUXT_PUBLIC_ANALYTICS_MATOMO_URL     | Matomo 实例 URL 地址(如: https://matomo.example.com) | 无                      | 否(启用 Matomo 时必需)                           |
| NUXT_PUBLIC_ANALYTICS_MATOMO_SITE_ID | Matomo 站点 ID                                       | 无                      | 否(启用 Matomo 时必需)                           |
| NUXT_UPLOAD_MIME_WHITELIST_ENABLED   | 是否启用上传文件 MIME 类型白名单验证                 | `true`                  | 否                                               |
| NUXT_UPLOAD_MIME_WHITELIST           | 上传文件允许的 MIME 类型列表（逗号分隔）             | 见下方说明              | 否                                               |
| NUXT_UPLOAD_DUPLICATE_CHECK_ENABLED  | 是否启用重复文件检测                                 | `true`                  | 否                                               |
| NUXT_UPLOAD_DUPLICATE_CHECK_MODE     | 重复文件处理模式，可选 `warn`、`block`、`skip`       | `skip`                  | 否                                               |
| ALLOW_INSECURE_COOKIE                | 是否允许非安全 Cookie（仅在开发环境使用）            | `false`                 | 否                                               |

## 上传文件类型白名单

`NUXT_UPLOAD_MIME_WHITELIST` 的默认值包含以下 MIME 类型：

- `image/jpeg` - JPEG 图片
- `image/png` - PNG 图片
- `image/webp` - WebP 图片
- `image/gif` - GIF 图片
- `image/bmp` - BMP 图片
- `image/tiff` - TIFF 图片
- `image/heic` - HEIC 图片（Apple）
- `image/heif` - HEIF 图片
- `video/quicktime` - QuickTime 视频（MOV）
- `video/mp4` - MP4 视频

如需自定义白名单，请使用逗号分隔的 MIME 类型字符串，例如：

```
NUXT_UPLOAD_MIME_WHITELIST=image/jpeg,image/png,video/mp4
```

如需禁用白名单验证（允许任何文件类型），可设置：

```
NUXT_UPLOAD_MIME_WHITELIST_ENABLED=false
```

## 重复文件检测

`NUXT_UPLOAD_DUPLICATE_CHECK_ENABLED` 控制是否在上传时检测重复文件。

`NUXT_UPLOAD_DUPLICATE_CHECK_MODE` 有三种模式：

### skip（跳过模式）- 默认

- 检测到重复文件时跳过上传
- 返回现有照片信息，不进行任何操作
- 适合批量上传时自动去重

```
NUXT_UPLOAD_DUPLICATE_CHECK_MODE=skip
```

### warn（警告模式）

- 检测到重复文件时显示警告
- 继续上传，会覆盖现有照片数据
- 适合需要更新照片的场景

```
NUXT_UPLOAD_DUPLICATE_CHECK_MODE=warn
```

### block（阻止模式）

- 检测到重复文件时拒绝上传
- 返回 409 错误，不允许覆盖
- 适合严格防止重复的场景

```
NUXT_UPLOAD_DUPLICATE_CHECK_MODE=block
```

### 完全禁用检测

```
NUXT_UPLOAD_DUPLICATE_CHECK_ENABLED=false
```

**注意事项**：

- 重复检测基于文件名，不基于文件内容
- 相同文件名会生成相同的 photoId
- 即使禁用检测，上传同名文件仍会覆盖现有数据（数据库使用 `onConflictDoUpdate`）
- 建议使用唯一的文件名（如添加时间戳）来避免冲突

## 配置示例

### 本地存储

```bash
NUXT_STORAGE_PROVIDER=local
NUXT_PROVIDER_LOCAL_PATH=/app/data/storage
NUXT_PROVIDER_LOCAL_BASE_URL=/storage
```

### S3 存储

```bash
NUXT_STORAGE_PROVIDER=s3
NUXT_PROVIDER_S3_ENDPOINT=https://s3.amazonaws.com
NUXT_PROVIDER_S3_BUCKET=chronoframe
NUXT_PROVIDER_S3_REGION=us-east-1
NUXT_PROVIDER_S3_ACCESS_KEY_ID=your-access-key
NUXT_PROVIDER_S3_SECRET_ACCESS_KEY=your-secret-key
NUXT_PROVIDER_S3_PREFIX=photos/
```

#### OpenList

```bash
# 基本配置
NUXT_STORAGE_PROVIDER=openlist
NUXT_PROVIDER_OPENLIST_BASE_URL=https://your-openlist-server.com
NUXT_PROVIDER_OPENLIST_ROOT_PATH=/chronoframe/photos

# 认证配置 - Token 认证（推荐）
NUXT_PROVIDER_OPENLIST_TOKEN=your-api-token

# 可选配置
NUXT_PROVIDER_OPENLIST_ENDPOINT_UPLOAD=/api/fs/put
NUXT_PROVIDER_OPENLIST_ENDPOINT_DOWNLOAD=
NUXT_PROVIDER_OPENLIST_ENDPOINT_LIST=
NUXT_PROVIDER_OPENLIST_ENDPOINT_DELETE=/api/fs/remove
NUXT_PROVIDER_OPENLIST_ENDPOINT_META=/api/fs/get
```
