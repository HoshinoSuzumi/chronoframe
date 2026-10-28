# Cloud SaaS UI implementation review

Date: 2026-10-29 (Asia/Hong_Kong)

## Visual truth and scope

- Approved direction: the generated 1672 × 941 px workspace concept shared in
  the design discussion: graphite surfaces, restrained amber accents, compact
  controls, and a composition for one to three sites. The concept image is not
  included in this repository; the implementation criteria are recorded below.
- Scope: implement the approved overall direction in the existing production app,
  keep the user's request for restrained controls and one-site composition, and
  establish a reusable Cloud/Admin foundation. This is not a static mock clone.
- Reference: 1672 × 941 pixels. Same-size browser comparison:
  `.tmp/cloud-ui/workspace-reference-size.jpg`, 1672 × 941 CSS/pixel viewport,
  devicePixelRatio 1. Both were opened together for comparison.
- Delivery capture: `.tmp/cloud-ui/workspace-desktop.jpg`, 1920 × 1080 pixels.
- Mobile capture: `.tmp/cloud-ui/workspace-mobile.jpg`, 390 × 844 pixels.
- Additional browser capture: `.tmp/cloud-ui/signin-dark.jpg`.
- Captures are actual browser output; no image resizing, compositing or screenshot
  reconstruction was used. An early capture taken during viewport switching was
  clipped and discarded from the comparison evidence.
- State: authenticated Local Developer, one private Local Gallery, dark mode,
  simplified Chinese locale, real Free plan. The real limit is 1/1, not the mock's
  illustrative 1/3. Creation is therefore correctly absent from the overview.

## Findings and fixes

- Resolved P1: local primitive theme and Nuxt UI overlays had separate styling,
  including inherited Gallery pink/purple and glass defaults. Added one SaaS layer,
  the official Tailwind/Nuxt UI stylesheet entry, semantic CSS tokens and explicit
  high-priority AppConfig. Body-portalled quota modal was checked in the browser.
- Resolved P1: `UApp` was treated as a DOM styling wrapper. It is a headless
  provider; added an actual `.cf-root` child. Browser DOM inspection confirms the
  scope exists. Shared buttons also have their own focus styles outside that scope.
- Resolved P2: large-screen content was too narrow for the new shell. Increased the
  shared max content width to 1360px while keeping the page centered and compact.
  Final 1672px/1920px screenshots show all actions within the viewport.
- Resolved P2: site breadcrumb label navigated to the workspace and page names were
  generic. Site breadcrumbs now target site overview; labels follow the current
  site/account section.
- Resolved P2: polymorphic loading buttons could prepend a spinner instead of
  preserving their link child. Preserved the single child, busy/disabled semantics,
  keyboard removal and click blocking. Added SSR component regression coverage.
- Resolved P2: progress ARIA values could exceed the declared maximum. Normalize
  invalid/over-limit values and test the accessible result.
- Resolved P2: the on-demand quota modal did not explicitly restore external
  trigger focus. Added a post-close focus restoration handler.

## Required fidelity surfaces

- Typography: neutral sans-serif system stack, 14px base, 13px portal content,
  12px supporting labels, 24px page heading, 14px site name and 16px utility icons.
  The generated reference exaggerates sizes; smaller controls intentionally follow
  the user's request for a quieter, compact production interface. CJK fallbacks
  and translated labels were checked for wrapping and readability.
- Layout/rhythm: preserves sidebar/header, resource strip, primary site management
  surface and subordinate settings rows. The sidebar is intentionally compact at
  208px rather than the reference's oversized rail. No repeated usage panel or
  invented site rows. Mobile stacks meters and uses a focus-managed drawer.
- Colors/tokens: graphite canvas `#202123`, sidebar `#191a1c`, surface `#252629`,
  text `#dedfe3`, secondary `#a0a3ad`, subtle border `#34363c`, amber `#c2a56f`.
  Primary controls remain neutral. Light mode follows the same semantic system.
- Assets/icons: the overview has no raster assets; existing brand text and Lucide
  icons are retained. Existing licensed marketing/auth photography is preserved.
  No new placeholder illustrations, fake photographs or copied third-party logos.
- Content: localized production labels and live API usage replace mock numbers.
  Real quota denial hides overview creation and opens a modal only on a Sites-page
  creation request. Suspended sites retain their access restrictions.

## Full-view and focused checks

The same-size full views were compared together. The focused site-card region was
also inspected through its visible full-frame rendering and DOM measurements:
1360px-wide × approximately 127px-high at the reference viewport; 14px site title,
12px metadata, compact Manage site action and two secondary navigation links.
The card and settings labels are readable in the saved full-view evidence.
No separate raster crop is used because the browser clip API returned an unrelated
top-left region; that image is not accepted as evidence.

Accepted production differences: Chinese copy, actual 0-byte/0-photo usage, 1/1
quota, hidden Create site, compact control sizing, narrower sidebar and theme toggle
instead of duplicate header/sidebar account menus. These reflect existing product
behavior and user constraints, not missing implementation.

## Interactions and validation

- Browser: dark/light toggle, workspace → Sites → site overview, quota-denial
  modal, site/workspace breadcrumbs, account menu, logout and password login,
  plan navigation, mobile drawer open/close and navigation dismissal.
- Viewports: 1920 × 1080, 1672 × 941 and 390 × 844; DOM width checks show no
  horizontal overflow. Mobile main actions remain visible and readable.
- Console: final review tab reported no warnings or errors. Initial dependency
  refresh invalidated one old Vite URL; fresh page verification was clean.
- Build: `pnpm build:cloud` passed after the DOM-scope correction.
- Tests: 26 targeted component, i18n, quota, entry-context, transport and portal
  regression tests passed. UI/entry boundaries, lint, formatting and frozen-lockfile
  installation passed. Built Worker native-dependency scan passed.

## Implementation checklist

- [x] Reusable SaaS tokens, primitive components, AppConfig and responsive shell.
- [x] Cloud consumes the layer; obsolete local primitive/generator setup removed.
- [x] Production quota, permissions and account behavior retained.
- [x] Shared UI dependency boundary added to `check:ui` and CI's `check:packages`.
- [x] Admin integration contract documents the excluded Git submodule boundary.
- [x] Desktop/mobile evidence and production build verified.

## Remaining limits and follow-up polish

- Admin is an uninitialized, separate Git submodule. Its screens are not tested or
  claimed to be migrated. The shared layer and enforced integration contract are
  ready for that later work.
- No full-repository runtime regression, live payment or object-storage upload
  test was performed for this presentation-only refactor.
- P3: final font-family selection and optical spacing can be tuned with user
  feedback; no custom web-font download was introduced.

final result: passed

## Site overview spacing follow-up

- Fixed the three reported spacing regressions: isolated workspace usage-strip
  selectors, restored 12px gaps and 16px padding for site statistics, and restored
  padded management/status panels in a desktop two-column layout.
- Verified at 1920×1080: both panels start at the same vertical position; cards
  have consistent padding. At 390×844, columns stack without horizontal overflow.
- Evidence: `.tmp/cloud-ui/site-overview-spacing.jpg` and
  `.tmp/cloud-ui/site-overview-spacing-mobile.jpg`.
- UI boundary checks, targeted lint, and 10 shared UI / portal regression tests passed.
