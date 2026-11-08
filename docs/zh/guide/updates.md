# 升级指南

升级前先查看[更新日志](/zh/changelog)，确定目标版本及其迁移说明。可以在后台概览的运行信息中查看当前版本。

<DocStep number="1" label="备份">

## 备份

::: warning 先停止服务并备份
停止所有共享该数据目录的副本（包括本 Compose 项目之外的副本）后，再备份以下内容：

- 整个数据目录和 Compose 文件，包括 `app.sqlite3` 和 `.session-password`。备份时包含隐藏密钥文件，不要只复制数据库。
- 旧部署仍在使用的 `.env`。
- `data` 目录之外的本地照片，以及 S3 / OpenList 中的外部文件。

:::

```bash
docker compose stop chronoframe
mkdir -p backups
cp -a data "backups/data-$(date +%Y%m%d-%H%M%S)"
cp docker-compose.yml backups/docker-compose.yml
```

</DocStep>

<DocStep number="2" label="更新与回退">

## 更新镜像

跨多个副本升级到 OG Image v7 时，须在让任一已升级实例上线之前停止全部副本，并在每一副本上配置相同的应用密钥。详见 [OG 图片签名](#og-图片签名)。

在 Compose 文件中将镜像标签改为目标版本，例如 `v1.0.0`，然后执行：

```bash
docker compose pull chronoframe
docker compose up -d chronoframe
docker compose logs -f chronoframe
```

::: info 启动时自动迁移
容器启动时会自动执行数据库迁移，正常情况下无需手动运行迁移命令。当前运行镜像不包含 shell 和包管理器，旧文档中的 `docker exec ... sh` 或容器内 `npx drizzle-kit migrate` 不适用。
:::

直接使用 `docker run` 的部署，先停止并移除旧容器，再用新标签和相同的数据挂载重建。保留原有的端口、网络和仍有用途的部署环境变量。

## OG 图片签名

OG Image v7 使用 `NUXT_APP_SECRET`（若已设置则为 `NITRO_APP_SECRET`）。即使密钥不变，所有 v6 签名图片 URL 也会失效。本次变更不需要数据库迁移。

1. 停止所有将提供升级后镜像的副本。
2. 生成一个至少 32 个字符的密钥，并在每一副本上设置相同的 `NUXT_APP_SECRET`（或 `NITRO_APP_SECRET`）。
3. 若希望保留现有的 `NUXT_OG_IMAGE_SECRET`，仅在能保持其有效值不变时再重命名；不确定时请直接生成新密钥。
4. 让已升级副本一起上线，刷新包含 OG 图片 URL 的 HTML 缓存，再检查画廊及公开照片的分享预览。
5. 回退时，须在任一 v6 实例对外提供流量之前停止全部 v7 副本，恢复旧镜像标签和环境配置，然后再次刷新相关 HTML 缓存。

::: tip
若旧值采用 JSON 引号形式，或包含 Compose 特殊字符，建议直接生成新密钥。
:::

## 从 v0.14.1 升级到 1.0.0

- 使用 `v1.0.0` 标签固定版本，或使用 `latest` 跟随正式版。
- 首次升级时先保留旧环境变量，让应用迁移可识别的设置和存储方案。启动后在后台核对站点、地图、登录和存储是否正确，再整理旧 `.env`。
- 1.0.0 修复了重启覆盖后台设置的问题，后续以后台保存的设置为准。
- 如果升级后进入向导，使用已有管理员邮箱，确认原存储路径，不要新建空数据目录。先核对挂载和启动日志，再继续操作。
- 会话密钥、数据库、存储路径等部署数据必须保留。代理信任等部署选项仍由运行环境提供，不属于可删除的旧站点设置。

## 回退

::: danger 回退时同时恢复数据库
如果升级执行了数据库结构迁移，回退时应停止新容器，恢复升级前的完整数据备份，再使用原版本标签和环境配置启动。不要只降级镜像并继续使用已经迁移的数据库。对于上述仅涉及 SEO 的变更，回退镜像和环境配置时保留现有数据卷及密钥文件即可。

:::

</DocStep>

<DocStep number="3" label="检查">

## 升级后检查

确认能登录后台，打开几张已有照片，尝试上传一张照片，并检查相册、地图和任务队列。1.0.0 新增了隐藏相册照片的访问限制，升级后也应检查公开画廊。

</DocStep>
