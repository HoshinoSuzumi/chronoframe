# Future Admin UI

Admin is a separate Git submodule and is not checked out in this workspace. Its current UI has not been verified by this change. When creating it, follow the shared SaaS design
contract in `README.md`.

- Extend `../../packages/saas-ui` before feature layers and use its `CfAppShell`,
  `Cf*` primitives and Nuxt UI overlay theme. Install the parent workspace first
  to provide the shared layer's dependencies. Admin is excluded from the root
  pnpm workspace, so do not add `workspace:*` to its standalone package. Its build
  checkout must include both the parent UI layer and the Admin submodule.
- Use `UApp` with a child `<div class="cf-root">` DOM wrapper; supply admin-specific navigation, localized
  shell labels and identity through slots. Keep authorization/API logic in Admin.
- Do not import Cloud components, copy its CSS, fork tokens or introduce another
  UI framework. Shared component, theme and layout changes belong in saas-ui.
- Run `pnpm check:ui` and verify light/dark, mobile and keyboard interactions.
