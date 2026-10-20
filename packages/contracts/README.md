# @chronoframe/contracts

Shared, browser-compatible contracts for ChronoFrame distributions. This first
extraction contains storage configuration schemas and upload plans, preserving
existing validation, defaults, and optional fields.

Import through `@chronoframe/contracts/storage` or
`@chronoframe/contracts/upload`. The root application retains compatibility
exports in `shared/types` while consumers migrate incrementally.

This private workspace package exports TypeScript source, consumed by Nuxt/Vite.
It requires no separate build step. Check it independently with
`pnpm --filter @chronoframe/contracts type-check`.

Do not add database models, application aliases, Nuxt auto-imports, Node globals,
or process-wide services here. Storage configuration contains credentials and is
not a public API response; existing server-side redaction remains required.
