# 开始贡献

使用 Node.js 22（与 Docker 构建环境一致）和项目指定的 pnpm 10.34.1。仓库包含 workspace 包，请使用 pnpm 安装依赖。

## 本地运行

```bash
git clone https://github.com/HoshinoSuzumi/chronoframe.git
cd chronoframe
corepack enable
pnpm install --frozen-lockfile
pnpm dev
```

打开 `http://localhost:3000`，按设置向导创建管理员并选择本地存储。开发时可以使用 `./data/storage`。数据库在启动时自动迁移，无需为启动项目生成新的迁移文件，也无需填写最小环境变量配置。

## 常用命令

```bash
pnpm lint
pnpm fmt:check
pnpm build:deps
pnpm build
pnpm preview
pnpm docs:dev
pnpm docs:build
```

`pnpm dev` 同时启动 WebGL 包的开发构建和 Nuxt。已有依赖构建时，可使用 `pnpm dev:only` 单独启动 Nuxt。代码检查使用 Oxlint，格式化使用 Oxfmt。

修改数据库 schema 后使用 `pnpm db:generate` 生成迁移，并检查生成的 SQL；`pnpm db:migrate` 可手动应用迁移。提交前不要把本地数据库、照片或访问密钥放进 Git。

## 代码位置

- `app/`：页面、组件、composables 和 Pinia stores。
- `packages/webgl-image/`：WebGL 图片查看器。
- `server/api/`：API；`server/services/`：存储、设置和照片处理服务。
- `server/database/`：Drizzle schema 和迁移。
- `shared/`：前后端共享类型；`i18n/`：翻译。
- `docs/`：英文和中文文档。

新增后台设置请阅读[设置开发指南](/zh/development/how-to-add-setting)。调试 S3、OpenList、地图或 GitHub 登录时，在后台填入测试服务的参数，OAuth 回调地址使用 `http://localhost:3000/api/auth/github`。

## 提交更改

保持改动集中，使用 Conventional Commits 描述更改。PR 中说明解决的问题、最终行为和验证结果；涉及界面时附上截图，涉及文档时同步更新英文和中文。可从 GitHub 的 `good first issue` 和 `help wanted` 问题开始。
