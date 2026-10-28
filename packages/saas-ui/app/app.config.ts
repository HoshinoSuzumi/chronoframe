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
      slots: {
        overlay: 'bg-black/55',
        content: 'bg-default ring ring-default rounded-lg shadow-xl',
        header: 'px-5 py-4 min-h-0',
        body: 'p-5',
        footer: 'px-5 py-3 gap-2',
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
