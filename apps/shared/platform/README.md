# Shared platform adapters

Worker-compatible application adapters used by Cloud and Site. This directory is
not a Nuxt application or a workspace package; consumers import modules explicitly.

- `runtime.ts`: request origin, D1 binding, platform sessions and HTTP errors.
- `context.ts`: authorized portal and public Site contexts and DTOs.
- `crypto.ts`: email/session MAC and visitor password verification.
- `email.ts`: Cloudflare Email Sending binding adapter.
- `visitor.ts`: host-only visitor cookies, password policies and attempt limits.

Business rules remain in `packages/core`; D1 repositories remain in
`packages/platform`. Self-hosted does not import these adapters. Keep this directory
free of native media tools, filesystem storage and other Node-only runtime code.

## OG image signing

Cloud/Site render share images with Takumi WASM under their existing Site and
access checks. In GitHub Settings → Environments, configure the following private
secrets for each deployment environment (`saas-staging` and `saas-production`):

| Entry | GitHub Environment secret | Private Worker binding |
| ----- | ------------------------- | ---------------------- |
| Cloud | `CLOUD_APP_SECRET`        | `NUXT_APP_SECRET`      |
| Site  | `SITE_APP_SECRET`         | `NUXT_APP_SECRET`      |

Each selected entry requires an app secret of at least 32 characters. Use different
app secrets for Cloud and Site, and for staging and production; do not reuse
platform or session secrets.

Generate each app secret with this command:

```sh
node -e "console.log(require('node:crypto').randomBytes(48).toString('base64url'))"
```

The approved SaaS deployment workflow validates the selected entries and publishes
these private bindings. Keep values stable across deployments; Workers do not
persist app secrets in their filesystem. Local setup is described in the
[Cloud README](../../cloud/README.md#local-portal-development) and
[Site README](../../site/README.md#local-app-secret); local `.env` files do not
configure deployed Workers.

For OG Image v7 upgrades, rollback, and HTML cache refresh, see the
[Update Guide](../../../docs/guide/updates.md#og-image-signing).
