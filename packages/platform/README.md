# Platform D1 adapters

Edge-only platform account/session, email challenge and Workspace/Site directory
storage. This is separate from `@chronoframe/database`, the Self-hosted SQLite
adapter. No native SQLite or media library is imported by this package.

Create independent D1 databases for staging and production, and apply
`migrations/0001_platform.sql` to each **platform** database before using it.
For example, use `wrangler d1 execute <database-name> --remote --file
packages/platform/migrations/0001_platform.sql` with your authorized account.
Do not run these migrations on the Self-hosted database.

Set the GitHub Environment variable `PLATFORM_D1_DATABASE_ID` in `saas-staging`
and `saas-production` to their respective database IDs. The deployment workflow
binds `PLATFORM_DB` at the top level for production and under `previews` for
staging. The two IDs must identify separate databases. No D1 database or remote
migration is automatically created/applied by this change. The deployment token
needs D1 access once the binding is enabled.

Cloud runtime settings are private Worker configuration:

- `NUXT_PLATFORM_PORTAL_ORIGIN`: exact HTTPS portal origin; defaults to
  `https://app.chronoframe.art`. A staging Preview needs its own exact origin.
- `NUXT_PLATFORM_SECRET`: independent random secret of at least 32 bytes in each
  environment. Used for keyed email-code digests and opaque session-token digests.
- `NUXT_PLATFORM_EMAIL_PROVIDER`, `NUXT_PLATFORM_EMAIL_API_KEY`, and
  `NUXT_PLATFORM_EMAIL_FROM`: enable only after selecting a mail provider.
  An optional Resend adapter is available; it is disabled by default.

Configure Preview secrets separately from production. Runtime credentials are
not GitHub deployment credentials, and no plaintext OTP is stored in D1.
Codes expire after ten minutes, resend is limited to once per minute, and five
incorrect attempts invalidate a challenge. Transactional reservations enforce
per-email and per-client hourly limits; resending invalidates older codes.
Verification consumes a code atomically before creating an account/session.
Sessions use host-only Secure/HttpOnly/SameSite=Lax cookies, and authentication
POSTs require the configured portal Origin.

These account APIs do not provision a default Workspace/Site, publish tenants,
or enable the photo-management backend. Those remain later integration work.
