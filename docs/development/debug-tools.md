# Development debug tools

The floating debug entry appears globally under `pnpm dev`. Production builds
remove the panel import and disable debug reads, writes, and registrations.
`?debug=1` opens the panel; the previous `?queueDebug=1` link also enables the
queue preview in development. Neither parameter activates production debugging.

Drag the entry to dock it against the nearest edge; near a corner it docks to
both edges. Drag a window header to move it, and its edges/corners to resize it.
The header buttons maximize/restore and close the window. Double-clicking the
header also maximizes/restores. Escape closes the window.

## Register page controls

```ts
const enabled = useDebugValue<boolean>('feature:enabled', false)
const count = useDebugValue<number>('feature:count', 10)

useDebugSection(() => ({
  id: 'my-feature',
  route: '/my-page',
  title: 'My feature',
  controls: [
    {
      key: 'feature:enabled',
      label: 'Enable preview',
      type: 'switch',
      default: false,
    },
    {
      key: 'feature:count',
      label: 'Count',
      type: 'number',
      default: 10,
      min: 0,
      max: 100,
    },
    {
      key: 'feature:status',
      label: 'Status',
      type: 'status',
      value: enabled.value ? 'Enabled' : 'Disabled',
    },
  ],
}))
```

Supported controls: `switch`, `select` (with `options`), `number`, `text`,
`status` (read-only `value`), and `action` (with an `action` callback).
Use `useDebugValue` for reactive reads/writes, or `useDebugStore().get/set`
for imperative access. Configuration persists in local storage. Route controls
are scoped to their page lifecycle and filtered by exact route path.
In production reads return the supplied defaults and writes are ignored.
Wrap expensive mock generation in `if (import.meta.dev)` for build removal.

## Reuse the floating window

`app/components/ui/FloatingWindow/FloatingWindow.vue` is independent of the
store. Use `v-model` for visibility. An optional stable `id` persists geometry
and maximized state. `allowOverflow` defaults to `true`; set it to `false` to
keep the window inside the viewport. Configure `minWidth`, `minHeight`,
`maxWidth`, `maxHeight`, `initialX`, `initialY`, `initialWidth`, and
`initialHeight`. Viewport limits take precedence over minimum dimensions on
small screens. Maximization fills the viewport and preserves the normal rect.
Slots: default content, `title`, `actions`, and `footer`.

Validation: `pnpm lint`.
