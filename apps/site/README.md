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

OG Image is enabled by the shared configuration and uses Takumi WASM on Workers.
Public Site routing and authorization still determine which pages are available;
the module does not enable bootstrap-only or unauthorized gallery routes. Native
Self-hosted renderers are not a fallback for the edge runtime.

Preserve route-specific indexing and access checks: published galleries and public
album password prompts remain discoverable. Protected album data returns 403;
hidden albums and unpublished Sites return 404. This migration does not add a
global indexability override or make password prompts `noindex`.

## OG image signing

See the [shared signing guide](../shared/platform/README.md#og-image-signing)
for Worker bindings and deployment/rollback configuration, and the
[Update Guide](../../docs/guide/updates.md#og-image-signing) for v7 signed-URL
invalidation and cache refresh.

### Local app secret

Site intentionally has no equivalent of `pnpm setup:cloud`: that command also
migrates Cloud's local D1 database and provisions its developer account. It does
not configure Site. Site's launcher already reads `apps/site/.env` independently
of Cloud and Self-hosted; leaving its app secret unset uses Nuxt's generated
development app secret. No additional setup command is required for that signing mode.

For a stable local Site app secret, run this command from the repository root:

```sh
node -e "console.log(require('node:crypto').randomBytes(48).toString('base64url'))"
```

Create or edit `apps/site/.env` and set only the following value to the generated
output, preserving other configuration:

```dotenv
NUXT_APP_SECRET=<generated-output>
```

Keep an existing valid app secret instead of regenerating it. Generate a separate
value from Cloud's app secret, keep the file uncommitted, and restart `pnpm dev:site`
after changing it. An app secret does not provision Site data or verified Host mappings.
This local file does not configure the deployed Worker; follow the shared signing
guide for production configuration.
