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

Production OG signing uses an app secret in this order:

1. `NITRO_APP_SECRET`: Nitro's higher-priority environment override, if set.
2. `NUXT_APP_SECRET`: the Nuxt app secret when no Nitro override is set.
3. `NUXT_OG_IMAGE_SECRET`: the deprecated fallback when neither app-secret override is configured.
4. `data/.app-secret`: automatically created with mode 0600 and reused when none of these environment variables is configured.

Explicit app secrets must be strings of at least 32 characters. An empty
`NUXT_APP_SECRET` is treated as unset; a non-empty invalid `NITRO_APP_SECRET` or
`NUXT_APP_SECRET` stops startup even if a valid lower-priority secret exists.
The production Node entry initializes the secret before Nitro freezes
`runtimeConfig`. It does not replace the session password; keep replicas on the
same effective secret (shared env or shared data volume).

On filesystems that reject hard links, `data/.app-secret` is a relative symlink
to an adjacent `.app-secret.<random>.key` file with mode 0600. Back up both and
keep the relative link intact when moving the data directory.

If you rename an existing key, keep the effective string identical on every
replica. If the value is JSON-quoted or you are unsure, generate a new 32+
character secret.

For upgrades, rollback, and HTML cache refresh, see the
[update guide](../../docs/guide/updates.md#og-image-signing).

### Development

Nuxt generates an app secret for development when no explicit app secret is
configured. Production builds wrap the Node entry so a missing secret is loaded
or created under `data/.app-secret`. Worker deployment tooling reuses
`scripts/app-secret-validation.mjs`.

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
