export default defineAppConfig({
  ui: {
    colors: {
      primary: 'pink',
      secondary: 'purple',
      neutral: 'neutral',
      info: 'sky',
      success: 'emerald',
      warning: 'amber',
      danger: 'rose',
    },
    button: {
      slots: {
        base: 'cursor-pointer',
      },
    },
    popover: {
      slots: {
        content:
          'bg-white/70 dark:bg-neutral-900/50 backdrop-blur-3xl ring-0 shadow-lg border border-neutral-300/50 dark:border-neutral-500/50 rounded-lg',
      },
    },
    card: {
      slots: {
        header: 'font-semibold',
      },
      variants: {
        variant: {
          glassmorphism: {
            root: 'shadow-lg divide-y-0 divide-neutral-300/50 dark:divide-neutral-500/50',
            header: 'p-2 sm:p-2 pb-0!',
            body: 'p-2 sm:p-2',
            footer: 'p-2 sm:p-2',
          },
        },
      },
    },
    formField: {
      slots: {
        label: 'mb-1',
        container: 'w-full sm:max-w-xs *:w-full',
        help: 'mt-0.5',
      },
    },
  },
})
