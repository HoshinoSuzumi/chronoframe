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
binds `DB` at the top level for production and under `previews` for
staging. The two IDs must identify separate databases. No database is automatically created. After approval and successful builds, the workflow
applies pending files with `wrangler d1 migrations apply` before publishing either
Worker. D1 tracks applied filenames; retries skip them. Migration failure stops
publication; successful migrations remain if a later deployment fails. Existing
manual initialization can be adopted because `0001_platform.sql` is idempotent. The deployment token needs D1 edit access once the binding is enabled.

Cloud runtime settings are private Worker configuration:

- `NUXT_PLATFORM_PORTAL_ORIGIN`: exact HTTPS portal origin; defaults to
  `https://app.chronoframe.art`. A staging Preview needs its own exact origin.
- `NUXT_PLATFORM_SECRET`: independent random secret of at least 32 bytes in each
  environment. Used for keyed email-code digests and opaque session-token digests.
- `NUXT_PLATFORM_EMAIL_FROM`: a plain sender address on your verified Cloudflare
  Email Service domain, for example `login@noreply.chronoframe.art`.
- `EMAIL`: a Cloudflare Email Sending `send_email` binding, using the structured
  `send({ from, to, subject, text })` API. No Resend or email API key is needed.

Set the GitHub Environment variable `PLATFORM_EMAIL_FROM` to that sender address.
The workflow adds `EMAIL` only to cloud, restricts `allowed_sender_addresses` to
this address, enables `remote: true`, and sets `NUXT_PLATFORM_EMAIL_FROM`. Production uses top-level
configuration; staging uses `previews.send_email` and `previews.vars`. This keeps
runtime bindings reproducible on subsequent deployments. With no sender variable
or binding, email sign-in stays disabled. The `remote: true` setting also enables real email delivery when this configuration
is used with `wrangler dev`. Local regression tests explicitly override it with
`remote: false` to simulate delivery.

See the [Cloudflare binding API](https://developers.cloudflare.com/email-service/api/send-emails/workers-api/).
The verified sending domain must be active; any account recipient restrictions
or sending limits still apply. A binding does not verify the domain itself.

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

P3 request integration exposes a membership-filtered Site catalog and short-lived
context subscriptions. Every reconnect rechecks the session and Membership.
Host-resolved public contexts contain no platform identity or Workspace details.
All context responses and SSR pages are private and are not shared-cache entries.

`0002_visitor_access.sql` stores Site/album password policies and attempt counters.
The gallery access adapter issues signed, host-only Secure/HttpOnly visitor cookies
only after password verification. Grants are scoped to Host, Site, album, password
revision and expiry. Configure an independent `NUXT_PLATFORM_SECRET` on the Site
Worker and its Preview. Policy provisioning and photo repositories remain P4 work;
these endpoints never infer a default album or reuse a platform session.
