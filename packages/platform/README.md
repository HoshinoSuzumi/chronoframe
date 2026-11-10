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

### Account setup and explicit trials

Migration `0046_trials_onboarding.sql` marks existing accounts as already set up and initializes three-step setup for new accounts. Profile and owned-workspace names are saved independently. Site creation reuses a stable provisioning request key so retries do not consume another site slot. Users can finish without a site when they need to create one later.

New accounts retain the configured signup plan and registration promotions. Trial activation is a separate, explicit action by a verified workspace owner. The offer is disabled by default; configure an active non-Free plan, duration (1–90 days) and optional availability window in Admin. Each account can claim once. Concurrent claims, pending payments and current paid or promotional entitlements are protected by database guards. Offer confirmation includes both settings and plan revisions.

Trials use the existing expiring subscription mechanism and configured expiry plan. Expiry does not delete photos. Verified paid assignments mark conversion and prevent trial administration or expiry from replacing paid access. Trial records survive workspace deletion. Administrative extension and revocation require an audit reason and revision checks.

Trial reminders use a separate leased queue, with three-day, one-day and expiry notices. Suppressed accounts, converted or revoked trials, outdated extension cycles and duplicate notices are excluded. Configure the existing email binding and scheduled trigger to deliver notices.

Ended trial notices are eligible for one day after expiry; older queued notices are cancelled. Missing email bindings leave retry budgets untouched. Queue IDs deduplicate scheduling and concurrent leases, but Cloudflare's structured `send()` binding does not expose a provider idempotency key. Delivery uses bounded retries: a provider-accepted message followed by an acknowledgement failure or worker termination can be delivered again, and eventual delivery is not guaranteed. Do not claim exactly-once delivery or add unsupported headers/parameters.

Migration `0047_onboarding_workspace.sql` retains the workspace selected in setup. Replacing or transferring it returns an unfinished setup to the workspace step, even if a later sign-in automatically provisions a new default workspace.

Migration `0048_onboarding_workspace_name.sql` records whether the user customized the workspace name. Existing recognized English and Simplified Chinese defaults are backfilled; other legacy names are retained as custom. New clients send the explicit flag with workspace confirmation, while an older client that omits the flag preserves the stored intent for an unchanged name and treats a changed name as custom. The legacy backfill follows the client’s UTF-16 truncation, including a split surrogate stored by D1 as a replacement character.
