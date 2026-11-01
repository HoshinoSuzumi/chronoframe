// Select and searchable SelectMenu share the upload drawer's neutral surface.
// Explicit radii avoid Nuxt UI scaling --ui-radius into oversized menu corners.
const selectSlots = {
  base: 'min-h-[var(--cf-control-height)] pointer-coarse:min-h-11 pointer-coarse:text-base rounded-[6px]',
  content:
    'w-max min-w-(--reka-select-trigger-width) max-w-[min(32rem,calc(100vw-2rem))] bg-default text-default ring ring-default rounded-[6px] shadow-lg',
  itemLabel: 'whitespace-normal overflow-visible text-clip break-words',
  itemDescription: 'whitespace-normal overflow-visible text-clip break-words',
  item: 'before:rounded-[4px] data-highlighted:not-data-disabled:before:bg-muted',
}

export default defineAppConfig({
  ui: {
    colors: {
      primary: 'neutral',
      secondary: 'neutral',
      neutral: 'zinc',
      info: 'sky',
      success: 'emerald',
      warning: 'amber',
      error: 'red',
    },
    select: { slots: selectSlots },
    selectMenu: {
      slots: {
        ...selectSlots,
        content:
          'w-max min-w-(--reka-combobox-trigger-width) max-w-[min(32rem,calc(100vw-2rem))] bg-default text-default ring ring-default rounded-[6px] shadow-lg',
      },
    },
    dropdownMenu: {
      slots: {
        content:
          'bg-default text-default ring ring-default rounded-[6px] shadow-lg',
        item: 'before:rounded-[4px] data-highlighted:text-highlighted data-[state=open]:text-highlighted data-highlighted:before:bg-muted data-[state=open]:before:bg-muted',
      },
      variants: {
        active: {
          true: { item: 'text-highlighted before:bg-muted' },
          false: {
            item: 'text-default data-highlighted:text-highlighted data-[state=open]:text-highlighted data-highlighted:before:bg-muted data-[state=open]:before:bg-muted',
          },
        },
      },
    },
    input: {
      slots: {
        root: 'w-full',
        base: 'min-h-[var(--cf-control-height)] pointer-coarse:min-h-11 pointer-coarse:text-base',
      },
    },
    textarea: { slots: { root: 'w-full', base: 'pointer-coarse:text-base' } },
    button: { slots: { base: 'cursor-pointer rounded-md font-medium' } },
    modal: {
      variants: { overlay: { true: { overlay: 'bg-black/55' } } },
      slots: {
        content:
          'bg-default ring ring-default rounded-lg shadow-xl max-h-[calc(100dvh-2rem)] overflow-hidden',
        header: 'px-5 py-4 min-h-0 shrink-0',
        body: 'p-5 min-h-0 overflow-y-auto',
        footer: 'px-5 py-3 gap-2 justify-end shrink-0 flex-wrap',
        title: 'text-sm font-semibold text-highlighted',
        description: 'text-sm text-muted',
      },
    },
    popover: {
      slots: { content: 'bg-elevated ring ring-default rounded-md shadow-lg' },
    },
    tooltip: {
      slots: {
        content: 'bg-elevated text-default ring ring-default rounded-md',
      },
    },
    card: {
      variants: {
        variant: {
          outline: {
            root: 'bg-elevated ring ring-default divide-y divide-default',
          },
          // Compatibility for inherited gallery/console surfaces, without glass.
          glassmorphism: {
            root: 'bg-default ring ring-default rounded-lg divide-y divide-default',
            header: 'p-4 font-medium',
            body: 'p-4',
            footer: 'p-4',
          },
        },
      },
    },
  },
})
