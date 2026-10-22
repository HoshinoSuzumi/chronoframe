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
