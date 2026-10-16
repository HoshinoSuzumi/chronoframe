# 存储方案

在 **站点设置 → 存储设置** 中添加、编辑或设为默认方案，连接信息直接填写到表单。

::: warning 切换方案不会迁移文件
更换默认方案只影响后续上传，已有文件不会自动迁移；迁移前请保留原方案和备份。
:::

## 选择哪种存储

<StorageChoices />

::: tip
直接复制或上传到存储中的文件不会自动出现在画廊中。请通过 ChronoFrame 仪表盘上传新媒体，以便应用完成索引和处理。后续版本计划支持扫描并导入存储中已有的媒体文件。
:::

## 本地文件系统

添加方案时选择“本地存储”，基础路径填写容器内的 `/app/data/storage`，与快速开始中的 `./data:/app/data` 挂载配合使用。访问地址通常保留 `/storage`。

::: tip 填写容器内路径
这里填的是**容器内路径**，不是宿主机路径。想使用另一块磁盘，可先增加 `./photos:/app/photos` 挂载，再把基础路径填写为 `/app/photos`。确认运行应用的用户有读写权限，并单独备份该目录。
:::

## S3 兼容存储

### 获取信息并填写表单

1. 在服务商控制台创建存储桶，记下名称和所在区域。
2. 创建应用专用的访问密钥，授权它读取、上传、删除对象和列举这个桶；大文件分片上传还需要对应的 multipart 权限。
3. 在后台添加 S3 方案，按下面的字段填写。密钥只填在后台，不要放进公开的图片地址或地图令牌中。

| 字段                              | 怎么填                                                                    |
| --------------------------------- | ------------------------------------------------------------------------- |
| Endpoint                          | 服务商的 S3 API 地址，包含 `https://`，不要填控制台地址或 CDN 域名        |
| Bucket                            | 存储桶名称；腾讯云 COS 要带上完整的 APPID 后缀                            |
| Region                            | 桶所在区域；R2 使用 `auto`，其他服务按控制台填写                          |
| Access Key ID / Secret Access Key | 服务商生成的一对访问凭据                                                  |
| Prefix                            | 可选的对象前缀，例如 `photos/`，用于与同桶的其他文件区分                  |
| CDN URL                           | 可选的图片读取根地址，不是上传 Endpoint；需保证后面拼接对象键后能读取文件 |
| Force Path Style                  | 服务需要 `Endpoint/Bucket/Key` 形式时开启，例如按路径访问的 MinIO         |

### 常用服务

以下地址是示例，请换成自己账号和区域的信息。

<DocTabs label="S3 服务商" :tabs="[{ id: 'aws', label: 'AWS S3' }, { id: 'r2', label: 'Cloudflare R2' }, { id: 'oss', label: '阿里云 OSS' }, { id: 'cos', label: '腾讯云 COS' }, { id: 'minio', label: 'MinIO' }]">

<template #aws>

| 字段     | 填写值                               |
| -------- | ------------------------------------ |
| Endpoint | `https://s3.us-east-1.amazonaws.com` |
| Region   | `us-east-1`                          |

创建桶后使用 IAM 身份的访问密钥，并限制到目标桶

</template>

<template #r2>

| 字段     | 填写值                                          |
| -------- | ----------------------------------------------- |
| Endpoint | `https://<ACCOUNT_ID>.r2.cloudflarestorage.com` |
| Region   | `auto`                                          |

创建 R2 API Token 后获得 Access Key ID 和 Secret Access Key；图片读取另配自定义域名

::: info R2 的上传和读取地址不同
R2 的 S3 Endpoint 用于签名上传，不能当成公开图片域名。将可访问对象的域名填写为 CDN URL；正式站点可使用自定义域名。
:::

</template>

<template #oss>

| 字段     | 填写值                                 |
| -------- | -------------------------------------- |
| Endpoint | `https://oss-cn-hangzhou.aliyuncs.com` |
| Region   | 按服务的 S3 兼容配置填写               |

从 RAM 身份获取 AccessKey，Endpoint 使用桶所在地域的地址

</template>

<template #cos>

| 字段     | 填写值                                |
| -------- | ------------------------------------- |
| Endpoint | `https://cos.ap-beijing.myqcloud.com` |
| Region   | `ap-beijing`                          |

使用 API 密钥，Bucket 包含 `-APPID` 后缀

</template>

<template #minio>

| 字段     | 填写值                      |
| -------- | --------------------------- |
| Endpoint | `https://minio.example.com` |
| Region   | 服务配置的区域              |

使用 S3 API 端口对应的地址，而不是管理控制台；按路径访问时开启 Force Path Style

</template>

</DocTabs>

::: details 服务商参考文档

- Cloudflare R2：[凭据获取](https://developers.cloudflare.com/r2/api/tokens/)、[公开访问](https://developers.cloudflare.com/r2/buckets/public-buckets/)。
- 阿里云 OSS：[地域和 Endpoint](https://www.alibabacloud.com/help/en/oss/user-guide/regions-and-endpoints)。
- 腾讯云 COS：[API 兼容说明](https://cloud.tencent.com/document/faq/436/50743)。

:::

### 存储桶的 CORS

浏览器会直接向 S3 上传文件，即使使用预签名 URL，存储桶也需要允许来自画廊域名的跨域请求。大文件分片上传需要 JavaScript 读取 `ETag`；缺少这个响应头可能导致文件上传后无法完成合并。

在 AWS S3 控制台打开存储桶的 **Permissions → Cross-origin resource sharing (CORS)**；R2 在桶的 **Settings → CORS Policy** 中配置。下面的 JSON 可作为这两种控制台的起点：

```json
[
  {
    "AllowedOrigins": ["https://[YOUR_DOMAIN]"],
    "AllowedMethods": ["GET", "PUT", "HEAD"],
    "AllowedHeaders": ["*"],
    "ExposeHeaders": ["ETag", "Content-Length", "Content-Type"],
    "MaxAgeSeconds": 0
  }
]
```

- 将 `https://[YOUR_DOMAIN]` 换成**画廊的来源地址**，包含协议和非默认端口，不带路径。它不是存储桶或 CDN 地址。
- 本地调试时另加 `http://localhost:3000`；正式站点只保留需要的来源。
- OSS / COS 等控制台若使用逐项表单，按同样的来源、方法、请求头和暴露头填写。
- 使用 CDN 时也要检查图片响应中的跨域头。修改规则后，旧缓存可能需要刷新。

::: info CORS 不等于访问权限
详细字段见 [AWS CORS 文档](https://docs.aws.amazon.com/AmazonS3/latest/userguide/ManageCorsUsing.html)和 [R2 CORS 文档](https://developers.cloudflare.com/r2/buckets/cors/)。CORS 解决浏览器跨域请求，不会授予密钥权限，也不能代替文件访问控制。
:::

### 图片读取与密码相册

验证上传成功后，还要从访客视角打开图片，确认读取地址、对象路径和 HTTPS 都正确。不要为了排查 CORS 就开放整个桶。

::: warning 密码相册请使用本地存储
当前远端存储的媒体直链不能保证经过 ChronoFrame 的相册授权。需要保护密码相册中的文件时，使用本地存储；公开 S3、OpenList 或 CDN 的直链和缓存不会因修改相册密码而撤销。
:::

## OpenList

1. 先在 OpenList 中挂载目标存储，确认能够在选定目录中上传、读取和删除文件。
2. 从 OpenList 管理后台获取用于 API 访问的令牌；不要误用网盘驱动自身的 token。
3. 在 ChronoFrame 添加 OpenList 方案：服务地址填写 `https://openlist.example.com`，根路径填写 `/115pan/chronoframe` 等 OpenList 中的实际路径，再填入令牌。
4. 先上传一张照片并检查能否打开原图。目录权限、服务网络和下载地址有效期都可能影响结果。

::: details OpenList 高级接口设置
标准服务通常保留高级接口默认值：上传 `/api/fs/put`、删除 `/api/fs/remove`、元数据 `/api/fs/get`，路径字段为 `path`。只有反向代理或服务接口有改动时才调整。可另填 CDN URL，但要确认它与真实对象路径一致。服务相关说明见 [OpenList 文档](https://doc.oplist.org/)。
:::

## 常见问题

| 现象                      | 优先检查                                                 |
| ------------------------- | -------------------------------------------------------- |
| 本地上传提示权限错误      | 基础路径是否已挂载，目录是否可写                         |
| S3 提示桶不存在或签名错误 | Bucket、Region、Endpoint 是否属于同一个桶，密钥是否正确  |
| 浏览器提示 CORS 错误      | 画廊来源是否允许、PUT 是否允许、请求头是否允许           |
| 小文件成功，大文件失败    | multipart 权限、`ETag` 暴露和网络代理的请求限制          |
| 上传成功但图片打不开      | CDN URL、公开读取方式和对象路径；CORS 与读取权限分别检查 |
