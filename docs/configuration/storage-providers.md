# Storage Schemes

Add, edit or select a default scheme in **Site settings → Storage settings**. Enter connection details directly in the form.

::: warning Switching does not move files
Switching the default affects future uploads; existing files are not moved. Keep the original scheme and a backup when planning a migration.
:::

## Choose storage

<StorageChoices />

::: tip
Files copied or uploaded directly to any storage backend will not automatically appear in the gallery. Use the ChronoFrame dashboard to upload new media so it can be indexed and processed. Support for scanning and importing media already in storage is planned for a future release.
:::

## Local filesystem

Choose local storage and enter `/app/data/storage` as the base path, matching the `./data:/app/data` mount in Getting Started. The base URL can normally remain `/storage`.

::: tip Use a container path
This is a **container path**, not a host path. To use another disk, add a mount such as `./photos:/app/photos`, then enter `/app/photos` as the base path. Ensure the application user has read/write access and back up that directory separately.
:::

## S3-compatible storage

### Prepare and enter credentials

1. Create a bucket in the provider's console and note its name and region.
2. Create application-specific credentials allowing object reads, writes, deletes and bucket listing. Large-file multipart uploads also need the corresponding multipart permissions.
3. Add an S3 scheme in the dashboard using the fields below. Keep credentials out of public image URLs and map token fields.

| Field                             | Value                                                                                     |
| --------------------------------- | ----------------------------------------------------------------------------------------- |
| Endpoint                          | S3 API URL including `https://`; not a console URL or CDN domain                          |
| Bucket                            | Bucket name, including the APPID suffix for Tencent COS                                   |
| Region                            | Bucket region; use `auto` for R2 and the provider's configured region otherwise           |
| Access Key ID / Secret Access Key | The credential pair issued by the provider                                                |
| Prefix                            | Optional object prefix such as `photos/`                                                  |
| CDN URL                           | Optional image-serving base URL; appending the object key must produce a working read URL |
| Force Path Style                  | Enable when the service expects `Endpoint/Bucket/Key`, such as path-based MinIO           |

### Common services

Replace account and region placeholders with your own values.

<DocTabs label="S3 provider" :tabs="[{ id: 'aws', label: 'AWS S3' }, { id: 'r2', label: 'Cloudflare R2' }, { id: 'oss', label: 'Alibaba Cloud OSS' }, { id: 'cos', label: 'Tencent COS' }, { id: 'minio', label: 'MinIO' }]">

<template #aws>

| Field    | Value                                |
| -------- | ------------------------------------ |
| Endpoint | `https://s3.us-east-1.amazonaws.com` |
| Region   | `us-east-1`                          |

Use IAM access keys scoped to the bucket

</template>

<template #r2>

| Field    | Value                                           |
| -------- | ----------------------------------------------- |
| Endpoint | `https://<ACCOUNT_ID>.r2.cloudflarestorage.com` |
| Region   | `auto`                                          |

An R2 API token provides S3 credentials; configure a separate domain for image reads

::: info R2 upload and read URLs differ
R2's S3 endpoint is for signed uploads, not a public image domain. Put an object-serving domain in CDN URL; use a custom domain for a production gallery.
:::

</template>

<template #oss>

| Field    | Value                                               |
| -------- | --------------------------------------------------- |
| Endpoint | `https://oss-cn-hangzhou.aliyuncs.com`              |
| Region   | Follow the service's S3 compatibility configuration |

Use RAM AccessKeys and the bucket's regional endpoint

</template>

<template #cos>

| Field    | Value                                 |
| -------- | ------------------------------------- |
| Endpoint | `https://cos.ap-beijing.myqcloud.com` |
| Region   | `ap-beijing`                          |

Use API credentials and the full bucket name including `-APPID`

</template>

<template #minio>

| Field    | Value                       |
| -------- | --------------------------- |
| Endpoint | `https://minio.example.com` |
| Region   | Service-configured region   |

Use the S3 API address, not the management console; enable Force Path Style for path-based access

</template>

</DocTabs>

::: details Provider reference documentation

- Cloudflare R2: [credentials](https://developers.cloudflare.com/r2/api/tokens/) and [public access](https://developers.cloudflare.com/r2/buckets/public-buckets/).
- Alibaba Cloud OSS: [regions and endpoints](https://www.alibabacloud.com/help/en/oss/user-guide/regions-and-endpoints).
- Tencent COS: [API compatibility notes](https://cloud.tencent.com/document/faq/436/50743).

:::

### Bucket CORS

Browsers upload directly to S3. Presigned URLs still need CORS for the gallery's origin. Multipart uploads also need JavaScript access to `ETag` to complete the upload.

In AWS S3, open the bucket's **Permissions → Cross-origin resource sharing (CORS)**. In R2, use **Settings → CORS Policy**. Start with this JSON in either console:

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

- Replace the origin with your **gallery URL**, including its scheme and non-default port, without a path. Do not use the bucket or CDN URL here.
- Add `http://localhost:3000` for local testing; keep only required origins in production.
- For providers with form-based CORS settings, enter the same origins, methods, allowed headers and exposed headers.
- Check CDN response headers too. Existing cached responses may need refreshing after a policy change.

::: info CORS is not access control
See [AWS CORS documentation](https://docs.aws.amazon.com/AmazonS3/latest/userguide/ManageCorsUsing.html) and [R2 CORS documentation](https://developers.cloudflare.com/r2/buckets/cors/). CORS does not grant credential permissions or replace file access control.
:::

### Image reads and protected albums

After uploading, open an image as a visitor to check the read URL, object path and HTTPS. Do not make the whole bucket public merely to troubleshoot CORS.

::: warning Use local storage for protected albums
Remote media links currently cannot guarantee that every request passes through ChronoFrame album authorization. Use local storage for files that need password-album protection. Public S3, OpenList or CDN links and caches are not revoked when an album password changes.
:::

## OpenList

1. Mount the destination in OpenList and confirm that files can be uploaded, read and deleted in the chosen directory.
2. Obtain an API access token from the OpenList management interface; do not use a cloud-drive driver's own token.
3. Add an OpenList scheme in ChronoFrame. Enter a service URL such as `https://openlist.example.com`, an actual OpenList root path such as `/115pan/chronoframe`, and the token.
4. Upload a photo and open its original. Directory permissions, network access and download URL expiry can affect the result.

::: details Advanced OpenList endpoints
Keep the standard advanced endpoints unless your service or proxy changes them: upload `/api/fs/put`, delete `/api/fs/remove`, metadata `/api/fs/get`, path field `path`. If using a CDN URL, check that it matches real object paths. See the [OpenList documentation](https://doc.oplist.org/) for service setup.
:::

## Troubleshooting

| Symptom                            | Check first                                                                 |
| ---------------------------------- | --------------------------------------------------------------------------- |
| Local permission error             | Mounted base path and directory write permissions                           |
| Missing bucket or signature error  | Matching bucket, region, endpoint and credentials                           |
| Browser CORS error                 | Gallery origin, PUT method and allowed request headers                      |
| Small files work, large files fail | Multipart permissions, exposed `ETag` and proxy limits                      |
| Upload works, image does not open  | CDN URL, read access and object path; check CORS and permissions separately |
