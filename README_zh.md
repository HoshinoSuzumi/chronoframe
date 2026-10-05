# ChronoFrame

<p align="center">
  <img src="https://socialify.git.ci/HoshinoSuzumi/chronoframe/image?custom_description=Self-hosted+personal+gallery+application.&description=1&font=KoHo&forks=0&issues=0&logo=https%3A%2F%2Fraw.githubusercontent.com%2FHoshinoSuzumi%2Fchronoframe%2Frefs%2Fheads%2Fmain%2Fpublic%2Ffavicon-96x96.png&name=1&owner=1&pattern=Plus&pulls=0&stargazers=0&theme=Auto" alt="Chronoframe">
</p>

<p align="center">
  <a href="https://github.com/HoshinoSuzumi/chronoframe/releases/latest">
    <img src="https://badgen.net/github/release/HoshinoSuzumi/chronoframe/stable?icon=docker&label=稳定" alt="Latest Release">
  </a>
  <a href="https://github.com/HoshinoSuzumi/chronoframe/releases">
    <img src="https://badgen.net/github/release/HoshinoSuzumi/chronoframe?icon=docker&label=测试" alt="Latest Prerelease">
  </a>
  <img src="https://img.shields.io/badge/License-MIT-green.svg" alt="License">
</p>

<p align="center">
  <a href="https://discord.gg/MM4ZK4Ed7s">
    <img src="https://dcbadge.limes.pink/api/server/https://discord.gg/MM4ZK4Ed7s" alt="Discord Server" />
  </a>
</p>

<p align="center">
  <a href="https://hellogithub.com/repository/HoshinoSuzumi/chronoframe" target="_blank"><img src="https://api.hellogithub.com/v1/widgets/recommend.svg?rid=947d47ffe8404985908b266e187dec99&claim_uid=kLVoiAFPJaBtr1D&theme=neutral" alt="Featured｜HelloGitHub" style="width: 250px; height: 54px;" width="250" height="54" /></a>
  <a href="https://www.producthunt.com/products/chronoframe?embed=true&utm_source=badge-featured&utm_medium=badge&utm_source=badge-chronoframe" target="_blank"><img src="https://api.producthunt.com/widgets/embed-image/v1/featured.svg?post_id=1029556&theme=neutral&t=1761159404569" alt="ChronoFrame - Self&#0045;hosted&#0032;photo&#0032;gallery&#0032;for&#0032;photographers&#0046; | Product Hunt" style="width: 250px; height: 54px;" width="250" height="54" /></a>
</p>

**Languages:** [English](README.md) | 中文

ChronoFrame 是一个可以自行部署的照片画廊。上传照片后，应用会提取 EXIF、生成预览并整理拍摄地点；访客可以按时间、相册或地图浏览，也能查看大图和播放实况照片。

[在线演示](https://lens.bh8.ga) · [使用文档](https://chronoframe.bh8.ga/zh/) · [更新日志](https://chronoframe.bh8.ga/zh/changelog)

## ✨ 功能

- **照片浏览**：瀑布流、筛选与排序、WebGL 大图缩放和分块渲染、照片直方图、原图下载与分享预览。
- **动态照片**：支持 Apple Live Photo 和 Motion Photo，照片与视频自动配对，支持悬停或长按播放。
- **相册**：组织照片、调整相册及照片顺序，支持隐藏相册和密码相册。
- **后台管理**：批量上传、编辑元数据、评分、批量下载和重新索引；查看处理队列、实时日志与最近活动。
- **存储**：支持本地文件系统、S3 兼容对象存储和 OpenList，可在后台管理存储方案和 CDN 地址。
- **地图与地点**：MapLibre / Mapbox 地图，反向地理编码和可选的地名语言。
- **设置向导**：首次启动在网页中创建管理员、设置站点与存储；日常设置在后台修改，无需维护一长串环境变量。
- **多语言与登录**：后台语言切换，邮箱密码登录，可选 GitHub OAuth；支持自定义统计脚本和上传隐私设置。

## 🐳 部署

推荐使用 Docker。创建 `docker-compose.yml`：

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

```bash
docker compose up -d
```

也可以使用 Docker Hub 镜像 `hoshinosuzumi/chronoframe:latest`。需要固定版本时，将标签换成 `v1.0.0`。

直接使用 Docker 启动：

```bash
docker run -d --name chronoframe --restart unless-stopped \
  -p 3000:3000 -v "$(pwd)/data:/app/data" \
  ghcr.io/hoshinosuzumi/chronoframe:latest
```

打开 `http://localhost:3000`，按设置向导创建管理员并选择存储。使用本地存储时填写 `/app/data/storage`。地图令牌可以稍后补充，不影响先完成部署和上传照片。

请保留 `./data` 挂载，其中包含数据库、设置、会话密钥，以及采用上述路径时的本地照片。

部署到公网时使用 HTTPS。反向代理、数据备份和旧版迁移见[快速开始](https://chronoframe.bh8.ga/zh/guide/getting-started)和[升级指南](https://chronoframe.bh8.ga/zh/guide/updates)。

## 📖 使用

登录后进入 `/dashboard` 上传和整理照片。上传完成后，任务队列会继续处理 EXIF、缩略图、地点和实况照片，失败任务可以查看原因并重试。

Apple Live Photo 的图片和 MOV 文件需要相同文件名，例如 `IMG_1234.heic` 和 `IMG_1234.mov`，上传顺序不限。照片支持 JPEG、PNG、WebP、GIF、BMP、TIFF、HEIC / HEIF 等格式。

密码相册限制的是通过 ChronoFrame 访问的内容。如果 S3、OpenList 或 CDN 提供公开的图片直链，需要同时管理外部服务的权限。详见[日常使用](https://chronoframe.bh8.ga/zh/guide/usage)。

## 📸 截图

![Gallery](./docs/images/screenshot1.png)
![Photo Detail](./docs/images/screenshot2.png)
![Map Explore](./docs/images/screenshot3.png)
![Dashboard](./docs/images/screenshot4.png)

## 🛠️ 开发

使用 Node.js 22 和项目指定的 pnpm 10.34.1：

```bash
corepack enable
pnpm install --frozen-lockfile
pnpm dev
```

打开 `http://localhost:3000`，通过向导完成本地初始化。本地存储可以使用 `./data/storage`。

```bash
pnpm lint          # Oxlint
pnpm fmt:check     # Oxfmt
pnpm build:deps    # 构建 WebGL 包
pnpm build         # 构建应用
pnpm docs:build    # 构建文档
```

修改数据库 schema 后，使用 `pnpm db:generate` 生成迁移并检查 SQL。仅启动项目时无需生成迁移。更多说明见[贡献指南](https://chronoframe.bh8.ga/zh/development/contributing)。

## 🤝 贡献与交流

欢迎提交问题和 Pull Request。请说明问题、改动后的行为和验证结果；文档改动请同步维护中文和英文。

[GitHub Issues](https://github.com/HoshinoSuzumi/chronoframe/issues/new/choose) · [Discussions](https://github.com/HoshinoSuzumi/chronoframe/discussions) · [Discord](https://discord.gg/MM4ZK4Ed7s)

## 🙏 致谢

感谢 [Nuxt](https://nuxt.com/)、[Vue](https://vuejs.org/)、[Tailwind CSS](https://tailwindcss.com/)、[Drizzle ORM](https://orm.drizzle.team/) 及其他开源项目的维护者，也感谢参与测试、翻译和开发的贡献者。

## ⭐️ Star History

<a href="https://star-history.dera.page/#HoshinoSuzumi/chronoframe&type=date&legend=top-left">
 <picture>
   <source media="(prefers-color-scheme: dark)" srcset="https://star-history.dera.page/svg?repos=HoshinoSuzumi/chronoframe&type=date&theme=dark&legend=top-left" />
   <source media="(prefers-color-scheme: light)" srcset="https://star-history.dera.page/svg?repos=HoshinoSuzumi/chronoframe&type=date&legend=top-left" />
   <img alt="Star History Chart" src="https://star-history.dera.page/svg?repos=HoshinoSuzumi/chronoframe&type=date&legend=top-left" />
 </picture>
</a>
