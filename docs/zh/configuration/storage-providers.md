# 存储提供器配置

ChronoFrame 支持多种存储后端来保存您的照片和缩略图。本文档将详细介绍如何配置不同的存储提供器。

| 提供器                            | 支持 | 适用场景           | 成本         |
| --------------------------------- | :--: | ------------------ | ------------ |
| [**S3 兼容存储**](#s3-兼容存储)   |  ✅  | 生产环境，云存储   | 按使用量计费 |
| [**本地文件系统**](#本地文件系统) |  ✅  | 测试环境，离线部署 | 免费         |
| [**OpenList**](#openlist-存储)    |  ✅  | 个人云存储，NAS    | 免费         |

## S3 兼容存储

S3 兼容存储是最推荐的生产环境选项，支持所有主流云服务提供商。

### 基础配置

```bash
# 设置存储提供器为 S3
NUXT_STORAGE_PROVIDER=s3

# S3 基础配置
NUXT_PROVIDER_S3_ENDPOINT=https://your-s3-endpoint.com
NUXT_PROVIDER_S3_BUCKET=chronoframe-photos
NUXT_PROVIDER_S3_REGION=us-east-1
NUXT_PROVIDER_S3_ACCESS_KEY_ID=your-access-key-id
NUXT_PROVIDER_S3_SECRET_ACCESS_KEY=your-secret-access-key

# 可选配置
NUXT_PROVIDER_S3_PREFIX=photos/
NUXT_PROVIDER_S3_CDN_URL=https://cdn.example.com
NUXT_PROVIDER_S3_FORCE_PATH_STYLE=false
```

### 云服务商配置示例

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

#### 阿里云 OSS

```bash
NUXT_STORAGE_PROVIDER=s3
NUXT_PROVIDER_S3_ENDPOINT=https://oss-cn-hangzhou.aliyuncs.com
NUXT_PROVIDER_S3_BUCKET=chronoframe-photos
NUXT_PROVIDER_S3_REGION=oss-cn-hangzhou
NUXT_PROVIDER_S3_ACCESS_KEY_ID=LTAI...
NUXT_PROVIDER_S3_SECRET_ACCESS_KEY=...
NUXT_PROVIDER_S3_CDN_URL=https://cdn.example.com
```

#### 腾讯云 COS

```bash
NUXT_STORAGE_PROVIDER=s3
NUXT_PROVIDER_S3_ENDPOINT=https://cos.ap-beijing.myqcloud.com
NUXT_PROVIDER_S3_BUCKET=chronoframe-1234567890
NUXT_PROVIDER_S3_REGION=ap-beijing
NUXT_PROVIDER_S3_ACCESS_KEY_ID=AKID...
NUXT_PROVIDER_S3_SECRET_ACCESS_KEY=...
```

#### MinIO 自托管

```bash
NUXT_STORAGE_PROVIDER=s3
NUXT_PROVIDER_S3_ENDPOINT=https://minio.example.com
NUXT_PROVIDER_S3_BUCKET=chronoframe
NUXT_PROVIDER_S3_REGION=us-east-1
NUXT_PROVIDER_S3_ACCESS_KEY_ID=minioadmin
NUXT_PROVIDER_S3_SECRET_ACCESS_KEY=minioadmin
# MinIO 需要启用路径样式访问
NUXT_PROVIDER_S3_FORCE_PATH_STYLE=true
```

### 存储桶配置

#### CORS 设置

推荐的 CORS 配置：

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

## 本地文件系统

本地存储将文件保存在服务器文件系统中。

```bash
# 设置存储提供器为本地
NUXT_STORAGE_PROVIDER=local

# 本地存储配置
NUXT_PROVIDER_LOCAL_PATH=/app/data/storage
NUXT_PROVIDER_LOCAL_BASE_URL=/storage
```

## OpenList 存储

OpenList 是一个开源的文件管理系统，提供对各种云存储服务的 API 访问。此提供程序允许您使用与 OpenList 兼容的服务作为照片存储后端。

| 环境变量 | 类型 | 必需 | 默认值 | 描述 |
|---|---|---|---|---|
| `NUXT_PROVIDER_OPENLIST_BASE_URL` | string | 是 | - | OpenList 服务的基础 URL |
| `NUXT_PROVIDER_OPENLIST_ROOT_PATH` | string | 是 | - | 根存储路径 |
| `NUXT_PROVIDER_OPENLIST_TOKEN` | string | 必需 | - | 认证令牌（认证时必需） |
| `NUXT_PROVIDER_OPENLIST_ENDPOINT_UPLOAD` | string | 可选 | `/api/fs/put` | 上传端点 |
| `NUXT_PROVIDER_OPENLIST_ENDPOINT_DOWNLOAD` | string | 可选 | - | 下载端点 |
| `NUXT_PROVIDER_OPENLIST_ENDPOINT_LIST` | string | 可选 | - | 列表端点 |
| `NUXT_PROVIDER_OPENLIST_ENDPOINT_DELETE` | string | 可选 | `/api/fs/remove` | 删除端点 |
| `NUXT_PROVIDER_OPENLIST_ENDPOINT_META` | string | 可选 | `/api/fs/get` | 元数据端点 |
| `NUXT_PROVIDER_OPENLIST_PATH_FIELD` | string | 可选 | `path` | 路径字段名 |
| `NUXT_PROVIDER_OPENLIST_CDN_URL` | string | 可选 | - | CDN URL |

**认证：**

OpenList 提供程序需要令牌认证以确保安全访问：

```bash
NUXT_PROVIDER_OPENLIST_TOKEN=your-static-token
```

### 基础配置

```bash
# 设置存储提供器为 OpenList
NUXT_STORAGE_PROVIDER=openlist

# OpenList 基础配置
NUXT_PROVIDER_OPENLIST_BASE_URL=https://your-openlist-server.com
NUXT_PROVIDER_OPENLIST_ROOT_PATH=/chronoframe/photos

# 认证配置 - Token 认证
NUXT_PROVIDER_OPENLIST_TOKEN=your-api-token

# 可选配置
NUXT_PROVIDER_OPENLIST_ENDPOINT_UPLOAD=/api/fs/put
NUXT_PROVIDER_OPENLIST_ENDPOINT_DOWNLOAD=
NUXT_PROVIDER_OPENLIST_ENDPOINT_LIST=
NUXT_PROVIDER_OPENLIST_ENDPOINT_DELETE=/api/fs/remove
NUXT_PROVIDER_OPENLIST_ENDPOINT_META=/api/fs/get
NUXT_PROVIDER_OPENLIST_PATH_FIELD=path
NUXT_PROVIDER_OPENLIST_CDN_URL=
```

### 认证方式

OpenList 提供令牌认证进行安全访问：

#### 令牌认证

```bash
NUXT_PROVIDER_OPENLIST_TOKEN=your-static-token
```

**优势：**
- 更稳定可靠
- 无需频繁重新认证
- 推荐在生产环境中使用

### 配置示例
#### OpenList（理论上Alist也可行）

```bash
NUXT_STORAGE_PROVIDER=openlist
NUXT_PROVIDER_OPENLIST_BASE_URL=https://openlist.example.com
NUXT_PROVIDER_OPENLIST_ROOT_PATH=/115pan/chronoframe
NUXT_PROVIDER_OPENLIST_TOKEN=your-static-token
```

## 常见问题

:::details `The AWS Access Key Id you provided does not exist in our records`
访问密钥错误，检查 `ACCESS_KEY_ID` 和 `SECRET_ACCESS_KEY` 是否正确。
:::

:::details `The specified bucket does not exist`
存储桶不存在，确认存储桶名称正确，且在指定区域存在
:::

:::details 可以上传但无法访问图片，控制台提示 `Access to fetch at '...' from origin '...' has been blocked by CORS policy`
存储桶 CORS 配置错误，参考 [CORS 设置](#CORS-设置) 进行配置。
:::
