# ChronoFrame Cloud UI

Cloud owns its marketing, sign-in, portal and error presentation. Server authorization,
Host routing and tenant context remain authoritative. Cloud-only styles and components
must not change the Self-hosted or Site editions.

## Design language

The Cloud theme adapts the [shadcn-vue](https://www.shadcn-vue.com/) composable
component model: Reka UI `Primitive`/`asChild`, class-variance-authority variants,
clsx/tailwind-merge overrides and editable local components. `components.json` and
`shadcn-nuxt` configure this component directory. The `Cloud` prefix avoids collisions
with shared gallery/console components. Local components are ChronoFrame-authored.

- `app/assets/cloud.css`: scoped shadcn semantic tokens, warm stone surfaces, forest
  accents, consistent type scale, focus rings, spacing and responsive patterns.
- `app/components/ui`: Button (variants, sizes, busy/disabled), Input (native form
  semantics and v-model), Card and Badge. Prefer these primitives for Cloud changes.
- `CloudPortalShell`: one responsive navigation/footer for account and site pages.
- `useCloudMotion`: motion-v entry transitions, with reduced-motion support.
- Lucide icons share size and stroke conventions; decorative icons accompany labels.

Use one primary action per flow, label inputs explicitly, announce errors and status,
and make pending/error/empty states actionable. Do not present unimplemented P4
features as working actions. Verification codes and sessions retain existing APIs.

Theme preference uses Nuxt Color Mode. The palette follows light/dark system preference
until the visitor chooses a theme. Desktop navigation becomes inline tabs on mobile.

## Photography

The local marketing sample images are from Unsplash and used under the
[Unsplash License](https://unsplash.com/license). They are illustrative marketing
assets, never seeded tenant content. Sources:

- Mountains: https://images.unsplash.com/photo-1464822759023-fed622ff2c3b
- Forest: https://images.unsplash.com/photo-1441974231531-c6227db76b6e
- Coast: https://images.unsplash.com/photo-1475924156734-496f6cac6ec1

Images ship locally so core UI has no runtime image-host dependency.

## Running and deployment boundaries

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
