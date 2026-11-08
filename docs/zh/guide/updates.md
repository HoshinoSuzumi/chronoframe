# 升级指南

升级前先查看[更新日志](/zh/changelog)，确定目标版本及其迁移说明。可以在后台概览的运行信息中查看当前版本。

<DocStep number="1" label="备份">

## 备份

::: warning 先停止服务并备份
停止容器后，备份以下内容：

- 整个数据目录和 Compose 文件，包括 `app.sqlite3`、`.session-password` 以及已有的 `.app-secret`。备份时包含隐藏密钥文件，不要只复制数据库。
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

- v6 到 v6 的升级应保留 `NUXT_OG_IMAGE_SECRET` 及其原值。重命名可能改变签名密钥，导致缓存图片 URL 无法通过验证。
- 仅在升级到 OG Image v7，且尚未配置 `NITRO_APP_SECRET` 和 `NUXT_APP_SECRET` 时，将 `NUXT_OG_IMAGE_SECRET` 迁移为 `NUXT_APP_SECRET`。旧密钥至少有 32 个字符时保留原值；不足 32 个字符时，应在升级前生成一个至少 32 个字符的新密钥，并将其设为 `NUXT_APP_SECRET`。如果两个 Nuxt 变量均已配置，而 `NITRO_APP_SECRET` 未设置，则 `NUXT_APP_SECRET` 优先：保留其现有值，不要用旧变量的值覆盖它。设置了 `NITRO_APP_SECRET` 时，该变量的优先级最高。
- 迁移旧值时，应将 `legacySecret` 定义为环境变量解析后的有效 v6 密钥，而不是每个副本上的原始环境变量文本。若 Compose 中写的是 `${LEGACY_SECRET}` 这类表达式，须先解析为传入容器的实际值；直接复制表达式会得到 `"${LEGACY_SECRET}"`，既不满足 32 个字符的要求，也不是真实密钥。对该容器内的值按 v6 解析语义推导有效密钥：若 `JSON.parse` 成功且结果为字符串，则使用该字符串；否则使用原始值本身。不要从未解析的环境变量文本推断密钥——例如 `AAAA...` 与 `"AAAA..."` 会得到同一运行时字符串，若对各自原始写法分别做 JSON 编码，会得到不同的 v7 密钥，导致跨副本校验失败。确认各副本共用同一有效字符串后，再将该值经 `JSON.stringify(legacySecret)` 后的输出设为每一副本上相同的 `NUXT_APP_SECRET`，实际环境变量值中必须保留 JSON 的双引号。这样即使旧密钥看起来像数字或 JSON，也能原样保留字符串；直接复制未编码的值可能改变其类型或内容。Compose 中普通字符串的示例为 `NUXT_APP_SECRET: '"<existing-secret>"'`：外层单引号是 YAML 语法，内层双引号必须传入容器。在进行 YAML 与 Compose 转义之前，须将 `JSON.stringify` 输出中的字面 DEL（`U+007F`）替换为 `\u007f`，并将每个字面 C1 控制字符（`U+0080`–`U+009F`）替换为对应的 `\u00XX` 转义；Compose 会拒绝 YAML 中这些字面控制字符，而 JSON 解析会在容器内还原为相同字符。在该 YAML 单引号标量中，JSON 输出里的每个单引号都须写成两个（`'` → `''`）；YAML 解码后传入容器的仍是一个单引号。写入 Compose 文件前，还须将 JSON 输出里的每个美元符号写成两个（`$` → `$$`），防止 Compose 对 `$MISSING` 等密钥文本进行变量插值，确保原样保留。解码后的密钥仍须至少有 32 个字符，新增的 JSON 引号不计入长度。
- 在 v7 中，旧名称仍作为弃用的兼容配置使用。未显式配置应用密钥时，启动会创建并复用 `data/.app-secret`；请将其与 `.session-password` 一起保留。
- 即使应用密钥不变，OG Image v7 也会使 v6 签名图片 URL 失效。升级后刷新包含 OG 图片 URL 的 HTML 缓存，再检查画廊及公开照片的分享预览。
- 本次 SEO 变更不需要数据库迁移。保持应用密钥稳定；无效的显式应用密钥或密钥文件读写失败会阻止启动，不会自动选择新应用密钥。
- 回退本次变更时，恢复旧镜像标签和环境配置，保留持久化数据卷及密钥文件，并再次刷新相关 HTML 缓存。如果同一版本的其他变更迁移了数据库，请按照下方说明恢复备份。

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
