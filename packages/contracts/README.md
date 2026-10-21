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

Resource, settings, location and EXIF contracts are exported through their named
subpaths. Resource response dates are ISO strings. Photo storage keys may be
omitted from protected responses. UserSummary never includes password material;
Album exposes hasPassword, never passwordHash. The server maps database rows at
API boundaries and keeps persistence-only types under server/types.

Settings field descriptors retain existing default/optional semantics. Storage
configuration responses are authenticated management data, not public site DTOs.
