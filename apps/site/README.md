# ChronoFrame Site entry

This is an independent Nuxt application in the public workspace, licensed under
AGPL-3.0-only. It extends the shared gallery layer only.
Run `pnpm dev:site`, `pnpm build:site`, or
`pnpm --filter @chronoframe/site preview` from the repository root.
Build the WebGL dependency first with `pnpm build:deps`.

The launcher uses this application's working directory and optional local `.env`;
it does not load the root Self-hosted `.env` or start its server plugins, database,
storage, migrations, worker pool, OAuth routes, or tenant scripts. Generated files
stay under this application's `.nuxt` and `.output` directories.

This is the P3.4 composition boundary, not a usable multi-tenant service.
`GET /api/health` identifies the entry as `bootstrap`; all other API requests return
503 with no-store, including authentication and Self-hosted onboarding endpoints.
Gallery routes remain unavailable until trusted Host-to-Site resolution and visitor authorization are implemented.
No environment flag or root administrator session enables access. P3.5 must
replace these explicit boundaries with platform authorization and Site-aware
repositories before any real data can be served.

No console layer, platform login UI, or tenant-provided scripts are included.
This entry does not change the Self-hosted root commands or data paths.

## Edge runtime

Cloudflare Workers is the initial production target (`cloudflare-module` Nitro
preset), with generated deployment configuration at `.output/server/wrangler.json`.
The worker entry and static assets are generated together. `preview` runs the
built worker locally through Wrangler/workerd; `deploy` publishes it and must be
invoked explicitly with the intended Cloudflare account. Building never deploys.

Node.js is build tooling, not the production runtime. These entries must not
import SQLite, native EXIF/image processors, filesystem storage, or embedded
workers. `nodejs_compat` is used for supported compatibility APIs, not permission
to rely on arbitrary Node APIs or writable local storage. Future bindings and
secrets must be configured per worker, independently from Self-hosted credentials.
Other edge providers require their own Nitro preset and runtime validation.

Dynamic OG image endpoints are disabled in this bootstrap. Enable them only with
a Worker-compatible WASM renderer or a dedicated remote rendering service;
Self-hosted native renderers are not a fallback for the edge runtime.
