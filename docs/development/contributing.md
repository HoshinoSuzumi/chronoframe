# Contributing

Use Node.js 22, matching the Docker build, and the project's pinned pnpm 10.34.1. This repository contains workspace packages; install dependencies with pnpm.

## Run locally

```bash
git clone https://github.com/HoshinoSuzumi/chronoframe.git
cd chronoframe
corepack enable
pnpm install --frozen-lockfile
pnpm dev
```

Open `http://localhost:3000` and use the wizard to create an administrator and choose local storage. `./data/storage` works for development. Database migrations run at startup; you do not need to generate migrations or fill out a minimal environment configuration just to run the app.

## Commands

```bash
pnpm lint
pnpm fmt:check
pnpm build:deps
pnpm build
pnpm preview
pnpm docs:dev
pnpm docs:build
```

`pnpm dev` runs the WebGL package development build alongside Nuxt. Once the dependency package is built, use `pnpm dev:only` to start Nuxt alone. Code checks use Oxlint; formatting uses Oxfmt.

After changing the database schema, run `pnpm db:generate` and review the generated SQL. `pnpm db:migrate` applies migrations manually. Keep local databases, photos and credentials out of Git.

## Where code lives

- `app/`: pages, components, composables and Pinia stores.
- `packages/webgl-image/`: the WebGL image viewer.
- `server/api/`: API routes; `server/services/`: storage, settings and photo processing.
- `server/database/`: Drizzle schema and migrations.
- `shared/`: shared types; `i18n/`: translations.
- `docs/`: English and Chinese documentation.

For new dashboard settings, read [Adding a setting](/development/how-to-add-setting). Enter test credentials for S3, OpenList, maps or GitHub login in the dashboard. Use `http://localhost:3000/api/auth/github` as the local OAuth callback.

## Submit a change

Keep changes focused and use Conventional Commits. Explain the problem, resulting behavior and verification in your PR. Include screenshots for UI changes and update both language versions for documentation changes. Issues marked `good first issue` or `help wanted` are useful starting points.
