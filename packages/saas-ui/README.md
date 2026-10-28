# ChronoFrame SaaS UI

One opt-in Nuxt layer for Cloud and the future Admin app. It owns the neutral grey
palette, restrained amber accent, compact control sizes, light/dark modes, Nuxt UI
theme, accessible Reka primitives and responsive application shell. It has no
tenant, identity, API or permission dependencies. Self-hosted and Site do not extend it.

## Consumption

Add `@chronoframe/saas-ui: workspace:*` to the app dependencies and extend
`../../packages/saas-ui` **before** feature layers such as Console/Gallery. Those
layers carry their own defaults; SaaS presentation takes precedence. The app must
provide Nuxt and Nuxt UI peers. Do not separately import Tailwind or Nuxt UI CSS:
`app/assets/main.css` is the one entry, with explicit consumer source scanning.

Admin is currently an uninitialized Git submodule and is explicitly excluded from
the root pnpm workspace. Its integration is not verified here. Keep that repository
boundary: install the parent workspace to provide the layer's dependencies and
extend the layer by relative path. Do not add a `workspace:*` dependency to an
excluded standalone app. See [Admin integration](admin-integration.md).

Wrap the app in `UApp` with an **actual child DOM wrapper** `<div class="cf-root">`
(and the appropriate Nuxt UI locale on `UApp`). `UApp` is a headless provider, not a
DOM element; a class on it does not establish a reliable style scope.
Use `CfAppShell` for a workspace: supply brand, location, actions, navigation and
footer slots plus localized navigation/open/close labels. Business context and
authorization stay in the consuming app. Add the skip-to-main-content link at the
app root; the shell owns `main#main-content`.

## Components and styles

- `CfButton`: native button by default; `as-child` for links. Supports variants,
  sizes, pending/disabled state and a single polymorphic child. Use explicit
  `type="submit"` in forms. Primary actions are neutral; amber is an accent.
- `CfInput`, `CfSelect`, `CfRadioGroup`: preserve native forms and typed v-model.
  Supply visible labels, help text and `aria-invalid` for validation errors.
- `CfCard`, `CfAlert`, `CfBadge`, `CfTable`, `CfSkeleton`, `CfSeparator`,
  `CfProgress`, `CfStatCard`, `CfUsageMeter`, `CfPageHeader`: shared presentation.
- Nuxt UI `UModal`/`UDrawer`/`UTooltip`/`UApp` provide complex overlays. They share
  the same semantic tokens and Reka accessibility foundation; do not override
  them with app-specific hardcoded palettes or a second component framework.

The local components are hand-authored, not generated shadcn components. There is
no shadcn runtime/module or generator config. Reka owns keyboard/focus semantics;
CVA and `cn()` are only variant/class composition helpers.

Change palettes, typography and density in `tokens.css`, primitives in
`primitives.css`, and layout in `shell.css`. Application CSS contains only feature
composition. Tokens live on `html`, so body-teleported overlays retain their theme.
Dark is the default for new visitors; stored light/dark preferences are respected.
Use neutral surfaces, 14px body text, small icons, thin dividers and minimal amber.
Preserve touch target sizes and mobile 16px inputs. Never invent data to fill space.

Cloud's overview is optimized for one site and naturally accommodates several.
Actual quotas are authoritative API data, not the mock's sample 1/3 allowance.
Creation remains hidden in the overview when unavailable; the Sites page explains
quota denial in a modal only after the user requests creation.

## Verification

`pnpm check:ui` enforces that this layer cannot import Cloud/Admin or API business
logic, Cloud uses shared primitives, and a future Admin entry extends the same
layer. Verify desktop/mobile, light/dark, body-teleported overlays, keyboard focus,
pending/empty/error states and actual server-enforced quotas when changing it.
