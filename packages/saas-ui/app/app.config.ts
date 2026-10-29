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
