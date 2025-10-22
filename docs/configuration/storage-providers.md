# Storage Provider Configuration

ChronoFrame supports multiple storage backends to save your photos and thumbnails. This document will detail how to configure different storage providers.

| Provider                                    | Support | Use Case                                | Cost               |
| ------------------------------------------- | :-----: | --------------------------------------- | ------------------ |
| [**S3 Compatible**](#s3-compatible-storage) |   ✅    | Production environment, cloud storage   | Varies by provider |
| [**Local Filesystem**](#local-filesystem)   |   ✅    | Testing environment, offline deployment | Free               |
| [**OpenList**](#openlist-storage)           |   ✅    | Personal cloud storage, NAS             | Free               |

## S3 Compatible Storage

S3 compatible storage is the most recommended production environment option, supporting all major cloud service providers.

### Basic Configuration

```bash
# Set storage provider to S3
NUXT_STORAGE_PROVIDER=s3

# S3 basic configuration
NUXT_PROVIDER_S3_ENDPOINT=https://your-s3-endpoint.com
NUXT_PROVIDER_S3_BUCKET=chronoframe-photos
NUXT_PROVIDER_S3_REGION=us-east-1
NUXT_PROVIDER_S3_ACCESS_KEY_ID=your-access-key-id
NUXT_PROVIDER_S3_SECRET_ACCESS_KEY=your-secret-access-key

# Optional configuration
NUXT_PROVIDER_S3_PREFIX=photos/
NUXT_PROVIDER_S3_CDN_URL=https://cdn.example.com
NUXT_PROVIDER_S3_FORCE_PATH_STYLE=false
```

### Cloud Provider Configuration Examples

#### AWS S3

```bash
NUXT_STORAGE_PROVIDER=s3
NUXT_PROVIDER_S3_ENDPOINT=https://s3.amazonaws.com
NUXT_PROVIDER_S3_BUCKET=my-chronoframe-bucket
NUXT_PROVIDER_S3_REGION=us-east-1
NUXT_PROVIDER_S3_ACCESS_KEY_ID=AKIA...
NUXT_PROVIDER_S3_SECRET_ACCESS_KEY=...
NUXT_PROVIDER_S3_CDN_URL=https://d1234567890.cloudfront.net
```

#### Cloudflare R2

```bash
NUXT_STORAGE_PROVIDER=s3
NUXT_PROVIDER_S3_ENDPOINT=https://[account-id].r2.cloudflarestorage.com
NUXT_PROVIDER_S3_BUCKET=chronoframe
NUXT_PROVIDER_S3_REGION=auto
NUXT_PROVIDER_S3_ACCESS_KEY_ID=...
NUXT_PROVIDER_S3_SECRET_ACCESS_KEY=...
NUXT_PROVIDER_S3_CDN_URL=https://photos.example.com
```

#### Alibaba Cloud OSS

```bash
NUXT_STORAGE_PROVIDER=s3
NUXT_PROVIDER_S3_ENDPOINT=https://oss-cn-hangzhou.aliyuncs.com
NUXT_PROVIDER_S3_BUCKET=chronoframe-photos
NUXT_PROVIDER_S3_REGION=oss-cn-hangzhou
NUXT_PROVIDER_S3_ACCESS_KEY_ID=LTAI...
NUXT_PROVIDER_S3_SECRET_ACCESS_KEY=...
NUXT_PROVIDER_S3_CDN_URL=https://cdn.example.com
```

#### Tencent Cloud COS

```bash
NUXT_STORAGE_PROVIDER=s3
NUXT_PROVIDER_S3_ENDPOINT=https://cos.ap-beijing.myqcloud.com
NUXT_PROVIDER_S3_BUCKET=chronoframe-1234567890
NUXT_PROVIDER_S3_REGION=ap-beijing
NUXT_PROVIDER_S3_ACCESS_KEY_ID=AKID...
NUXT_PROVIDER_S3_SECRET_ACCESS_KEY=...
```

#### MinIO Self-hosted

```bash
NUXT_STORAGE_PROVIDER=s3
NUXT_PROVIDER_S3_ENDPOINT=https://minio.example.com
NUXT_PROVIDER_S3_BUCKET=chronoframe
NUXT_PROVIDER_S3_REGION=us-east-1
NUXT_PROVIDER_S3_ACCESS_KEY_ID=minioadmin
NUXT_PROVIDER_S3_SECRET_ACCESS_KEY=minioadmin
# MinIO requires path-style access
NUXT_PROVIDER_S3_FORCE_PATH_STYLE=true
```

### Bucket Configuration

#### CORS Settings

Recommended CORS configuration:

```json
[
  {
    "AllowedOrigins": ["https://your-domain.com"],
    "AllowedMethods": ["GET", "PUT", "POST", "DELETE"],
    "AllowedHeaders": ["*"],
    "ExposeHeaders": ["ETag"],
    "MaxAgeSeconds": 3000
  }
]
```

## Local Filesystem

Local storage saves files in the server filesystem.

```bash
# Set storage provider to local
NUXT_STORAGE_PROVIDER=local

# Local storage configuration
NUXT_PROVIDER_LOCAL_PATH=/app/data/storage
NUXT_PROVIDER_LOCAL_BASE_URL=/storage
```

## OpenList Storage

OpenList is a file listing program that supports multiple cloud storage services.

| Environment Variable | Type | Required | Default | Description |
|---|---|---|---|---|
| `NUXT_PROVIDER_OPENLIST_BASE_URL` | string | Yes | - | Base URL of the OpenList service |
| `NUXT_PROVIDER_OPENLIST_ROOT_PATH` | string | Yes | - | Root storage path |
| `NUXT_PROVIDER_OPENLIST_TOKEN` | string | Required | - | Authentication token (required for authentication) |
| `NUXT_PROVIDER_OPENLIST_ENDPOINT_UPLOAD` | string | Optional | `/api/fs/put` | Upload endpoint |
| `NUXT_PROVIDER_OPENLIST_ENDPOINT_DOWNLOAD` | string | Optional | - | Download endpoint |
| `NUXT_PROVIDER_OPENLIST_ENDPOINT_LIST` | string | Optional | - | List endpoint |
| `NUXT_PROVIDER_OPENLIST_ENDPOINT_DELETE` | string | Optional | `/api/fs/remove` | Delete endpoint |
| `NUXT_PROVIDER_OPENLIST_ENDPOINT_META` | string | Optional | `/api/fs/get` | Metadata endpoint |
| `NUXT_PROVIDER_OPENLIST_PATH_FIELD` | string | Optional | `path` | Path field name |
| `NUXT_PROVIDER_OPENLIST_CDN_URL` | string | Optional | - | CDN URL |

**Authentication:**

OpenList provider requires token authentication for secure access:

```bash
NUXT_PROVIDER_OPENLIST_TOKEN=your-static-token
```

### Basic Configuration

```bash
# Set storage provider to OpenList
NUXT_STORAGE_PROVIDER=openlist

# OpenList basic configuration
NUXT_PROVIDER_OPENLIST_BASE_URL=https://your-openlist-server.com
NUXT_PROVIDER_OPENLIST_ROOT_PATH=/chronoframe/photos
# Token is required for authentication
NUXT_PROVIDER_OPENLIST_TOKEN=your-api-token

# Optional configuration
NUXT_PROVIDER_OPENLIST_ENDPOINT_UPLOAD=/api/fs/put
NUXT_PROVIDER_OPENLIST_ENDPOINT_DOWNLOAD=
NUXT_PROVIDER_OPENLIST_ENDPOINT_LIST=
NUXT_PROVIDER_OPENLIST_ENDPOINT_DELETE=/api/fs/remove
NUXT_PROVIDER_OPENLIST_ENDPOINT_META=/api/fs/get
NUXT_PROVIDER_OPENLIST_PATH_FIELD=path
NUXT_PROVIDER_OPENLIST_CDN_URL=
```

### Configuration Examples

#### OpenList

```bash
NUXT_STORAGE_PROVIDER=openlist
NUXT_PROVIDER_OPENLIST_BASE_URL=https://your-openlist-server.com
NUXT_PROVIDER_OPENLIST_ROOT_PATH=/local/chronoframe
NUXT_PROVIDER_OPENLIST_TOKEN=your-static-token
```

## Common Issues

:::details `The AWS Access Key Id you provided does not exist in our records`
Access key error, check if `ACCESS_KEY_ID` and `SECRET_ACCESS_KEY` are correct.
:::

:::details `The specified bucket does not exist`
Bucket does not exist, confirm the bucket name is correct and exists in the specified region.
:::

:::details Can upload but cannot access images, console shows `Access to fetch at '...' from origin '...' has been blocked by CORS policy`
Bucket CORS configuration error, refer to [CORS Settings](#cors-settings) for configuration.
:::
