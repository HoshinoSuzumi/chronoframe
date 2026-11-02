// Keep photo controls consistent even when an entry overrides Nuxt UI defaults.
export const photoOverlayPopoverUi = {
  content:
    'font-sans bg-white/70 dark:bg-neutral-900/50 backdrop-blur-3xl ring-0 shadow-lg border border-neutral-300/50 dark:border-neutral-500/50 rounded-[8px]',
} as const

export const photoOverlayCardUi = {
  root: 'font-sans bg-transparent ring-0 shadow-lg divide-y-0 border border-neutral-300/50 dark:border-neutral-500/50 rounded-[8px]',
  header: 'font-semibold p-2 sm:p-2 pb-0!',
  body: 'p-2 sm:p-2',
  footer: 'p-2 sm:p-2',
} as const
