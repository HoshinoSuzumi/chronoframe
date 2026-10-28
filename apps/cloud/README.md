# ChronoFrame Cloud UI

Cloud owns its marketing, sign-in, portal and error presentation. Server authorization,
Host routing and tenant context remain authoritative. Cloud-only styles and components
must not change the Self-hosted or Site editions.

## Design language

Cloud uses the shared [SaaS UI layer](../../packages/saas-ui/README.md), also the
required foundation for the future Admin app. Neutral graphite surfaces, quiet
amber accents, compact controls and restrained borders follow the approved design.

- Shared `Cf*` primitives, semantic tokens, Nuxt UI overlays and `CfAppShell` live
  in `packages/saas-ui`. Do not fork them inside Cloud or Admin.
- `app/assets/cloud.css` owns Cloud feature composition, marketing and auth pages.
- `CloudPortalShell` supplies the shared shell with Cloud navigation and identity.
- The workspace overview is designed around one site; actual plans and quotas
  remain authoritative. No allowance hides creation on the overview and shows an
  on-demand modal on the Sites page.

New visitors default to dark mode. Nuxt Color Mode preserves explicit preferences;
light mode uses the same semantic theme. Mobile navigation is a focus-managed
modal drawer. Use one primary action per flow and retain labeled native forms,
keyboard focus, reduced-motion support and actionable pending/error/empty states.
There is no shadcn runtime or Cloud-specific primitive directory.

## Photography

The local marketing sample images are from Unsplash and used under the
[Unsplash License](https://unsplash.com/license). They are illustrative marketing
assets, never seeded tenant content. Sources:

- Mountains: https://images.unsplash.com/photo-1464822759023-fed622ff2c3b
- Forest: https://images.unsplash.com/photo-1441974231531-c6227db76b6e
- Coast: https://images.unsplash.com/photo-1475924156734-496f6cac6ec1

Images ship locally so core UI has no runtime image-host dependency.

## Running and deployment boundaries

### Local portal development

From the repository root:

```powershell
pnpm install --frozen-lockfile
pnpm build:deps
pnpm setup:cloud
pnpm dev:cloud
```

Open `http://localhost:3001/signin`. The setup command creates missing app-local
`.env` values, applies all platform migrations to local D1, and seeds a verified
`developer@localhost.test` account, a workspace, a Free subscription and an
unpublished sample site. Read the generated password in
`apps/cloud/.data/local-account.json`. Re-running setup applies new migrations
and synchronizes the local account password with that credentials file without
resetting edited site settings or other local data. If the credentials file is
missing, setup generates a new password and updates the existing local account.
Existing `.env` values are preserved; ensure `NUXT_PLATFORM_PORTAL_ORIGIN` is
`http://localhost:3001` and session/platform secrets contain at least 32 characters.
Restart the development server after changing `.env`.

During `dev:cloud`, a development-only Nitro plugin supplies local D1 and captures
email in the terminal and `apps/cloud/.data/mail.jsonl`, including verification
codes and reset links. No email is delivered. Database files live under
`apps/cloud/.wrangler/state/v3`; both directories and `.env` are ignored by Git.
`wrangler.local.json` contains only a dummy local database ID, with remote bindings
disabled. The plugin is excluded from production builds.

This supports account, workspace, site settings and billing UI development.
The sample site has no photos or configured object storage. Uploads, processing,
public domain routing and live payments require their respective services;
setup does not provision them or connect to production.

Run `pnpm build:deps` followed by `pnpm dev:cloud` or `pnpm build:cloud` at the
repository root. The launcher uses the Cloud app directory and its optional `.env`,
never the Self-hosted root `.env`. Generated output is local to this app.

Production targets Cloudflare Workers (`cloudflare-module`). Building never deploys;
the approved SaaS workflow publishes code and isolated environment bindings. Native
SQLite/media processors, filesystem storage and embedded queues are not Cloud
fallbacks. Dynamic OG remains disabled until a compatible renderer is selected.

The marketing host and portal share this app; trusted Host/session/Membership checks
still gate platform APIs. Default Site provisioning and media management remain P4.
The public Site Worker and Self-hosted application retain their own presentation.
