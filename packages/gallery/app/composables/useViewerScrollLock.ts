import { watch, type Ref } from 'vue'

/** Lock the viewer background without changing the masonry layout width. */
export function useViewerScrollLock(isOpen: Readonly<Ref<boolean>>) {
  watch(
    isOpen,
    (open, _previous, onCleanup) => {
      if (!open) return
      const root = document.documentElement
      const body = document.body
      const overflow = body.style.overflow
      const gutter = root.style.scrollbarGutter

      // Removing a classic scrollbar otherwise expands every masonry column.
      // Keep existing stable/both-edges policies and overlay scrollbars intact.
      if (
        window.innerWidth > root.clientWidth &&
        !getComputedStyle(root).scrollbarGutter?.includes('stable')
      )
        root.style.scrollbarGutter = 'stable'
      body.style.overflow = 'hidden'

      onCleanup(() => {
        body.style.overflow = overflow
        root.style.scrollbarGutter = gutter
      })
    },
    { immediate: true },
  )
}
