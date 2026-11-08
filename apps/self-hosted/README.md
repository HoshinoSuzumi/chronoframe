# ChronoFrame Self-hosted entry

This application combines the console and gallery Nuxt layers with the existing
session, settings, SQLite, storage and embedded-worker adapters. The shared
layers contain no server implementations. This entry uses AGPL-3.0-only; see the root LICENSING.md for package exceptions,
historical MIT rights, and commercial licensing. Future SaaS entries share the
repository default unless explicitly licensed otherwise.

From the repository root, run `pnpm install`, `pnpm dev`, or
`pnpm build:deps && pnpm build`. Root commands and filtered application scripts
use the same launcher, root `.env`, and repository-relative data/log paths.
Nuxt generated files live here in `.nuxt` and `.output`. Runtime images keep
`/app/data`, port 3000, and the existing environment variables and migration path.

The root remains the workspace/tooling entry. Canonical schema and migrations
live in `packages/database`; the server migration symlink and shared directory
are compatibility paths to their owning packages. Never put production data in
source directories or copy it into build contexts.

## OG image signing

Production requires a valid `NUXT_APP_SECRET` (or `NITRO_APP_SECRET`) of at least
32 characters. `NUXT_OG_IMAGE_SECRET` remains a deprecated fallback. Replicas must
share the same secret; it does not replace the session password. Missing or
invalid secrets stop production startup.

If you rename an existing key, keep the effective string identical on every
replica. If the value is JSON-quoted or you are unsure, generate a new 32+
character secret.

For upgrades, rollback, and HTML cache refresh, see the
[update guide](../../docs/guide/updates.md#og-image-signing).

### Development

Nuxt generates an app secret for development when no explicit app secret is
configured. Production builds require `NUXT_APP_SECRET` (or `NITRO_APP_SECRET`)
in the environment. Worker deployment tooling reuses
`server/utils/app-secret-validation.mjs`.

The optional `nuxtseo-devtools-host` development dependency restores the Site
Config and OG Image panels. It builds its client on first use. If a panel shows
**Connect to Dev Server**, enter the local server origin once (for example,
`http://localhost:3000`). This is a development-only connection.

Run `pnpm test:seo` to build all three entries and check signing, metadata, fonts,
missing-media fallbacks, scoped Worker access and reactive head updates using
temporary data and test-only secrets. Before release, manually check in-app
Home/Photo/Albums navigation for one current canonical link and OG image URL,
and verify English/Chinese glyphs at regular/bold weights. Browser DOM behavior,
locale switching and glyph appearance are not fully covered by the automated tests.
