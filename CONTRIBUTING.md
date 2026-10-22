# Contributing

Contributions to code, documentation and translations are welcome. The detailed guide is available in [English](https://docs.chronoframe.art/development/contributing.html) and [简体中文](https://docs.chronoframe.art/zh/development/contributing.html).

Use Node.js 22, matching the Docker build, and the project's pinned pnpm 10.34.6. This repository contains workspace packages; install dependencies with pnpm.

## Run locally

Fork the repository on GitHub, then clone your fork (replace `YOUR_USERNAME` below):

```bash
git clone https://github.com/YOUR_USERNAME/chronoframe.git
cd chronoframe
git remote add upstream https://github.com/HoshinoSuzumi/chronoframe.git
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

- `apps/self-hosted/`: the Node/Docker application and existing API adapters.
- `apps/cloud/`: the Cloudflare Workers marketing and portal entry.
- `apps/site/`: the Cloudflare Workers public gallery entry.
- `packages/console/`, `packages/gallery/`: shared UI, public state and translations.
- `packages/database/`: canonical SQLite schema and migrations.
- `packages/webgl-image/`: the MIT WebGL image viewer.
- Other `packages/`: contracts, core operations and infrastructure adapters.
- `docs/`: English and Chinese documentation.

For edge-entry changes, run `pnpm check:entries`, build each affected entry, and
run `pnpm smoke:cloud` / `pnpm smoke:site`. These smoke checks start the generated
Workers locally; `wrangler deploy --dry-run` bundles without publishing. Keep
native processing and SQLite out of edge entries. See their READMEs for scope.

For new dashboard settings, read [Adding a setting](docs/development/how-to-add-setting.md). Enter test credentials for S3, OpenList, maps or GitHub login in the dashboard. Use `http://localhost:3000/api/auth/github` as the local OAuth callback.

## Submit a change

Create a branch for your change:

```bash
git checkout -b feature/your-change
```

Keep changes focused and use Conventional Commits. Explain the problem, resulting behavior and verification in your PR. Include screenshots for UI changes and update both language versions for documentation changes. Issues marked `good first issue` or `help wanted` are useful starting points.

Before opening a pull request:

- Run `pnpm lint` and `pnpm fmt:check`. Use `pnpm lint:fix` and `pnpm fmt` when needed, keeping unrelated formatting changes out of the PR.
- For application changes, build the WebGL package and application with `pnpm build:deps` and `pnpm build`, then check the affected behavior.
- For documentation changes, run `pnpm docs:build` and check the relevant pages and links.
- For database changes, review the migration SQL and check both a fresh installation and an upgrade from existing data.
- Add or update tests where they help verify the change. Run `pnpm test` for the repository suite and report any conditional fixture skips.
- Keep credentials, local databases and uploaded files out of commits. Include screenshots for UI changes and describe any compatibility changes.

Push your branch to your fork and open a pull request. State what problem it solves, how behavior changes and what you verified. If it fixes an issue, link that issue in the description.

## Report an issue or discuss an idea

For suspected security vulnerabilities, follow the [Security Policy](SECURITY.md) and report privately.

Use the [issue template chooser](https://github.com/HoshinoSuzumi/chronoframe/issues/new/choose) to report bugs or request features. For a bug, include the version, deployment method, storage type, reproduction steps and relevant logs with secrets removed. Use [GitHub Discussions](https://github.com/HoshinoSuzumi/chronoframe/discussions) or [Discord](https://discord.gg/MM4ZK4Ed7s) for questions and ideas.

## Contribution licensing

The repository default is AGPL-3.0-only. The contracts and webgl-image packages
have MIT exceptions; see [LICENSING.md](LICENSING.md) before contributing. Preserve existing copyright
and third-party license notices and identify any third-party material you add.
Only submit material you own or are authorized to contribute under its applicable
license; obtain employer or other rights-holder authorization where necessary.

If a separate contributor agreement is requested through the project's designated
signing process, review that agreement and its version before accepting it. This
guide is not a CLA and does not itself grant additional commercial relicensing
rights. Questions may be sent to ChronoFrame at contact@chronoframe.art.
