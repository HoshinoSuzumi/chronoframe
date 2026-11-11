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
      const paddingRight = body.style.paddingRight
      const scrollbarWidth = window.innerWidth - root.clientWidth
      let compensated = false

      // Removing a classic scrollbar otherwise expands every masonry column.
      // Keep existing stable/both-edges policies and overlay scrollbars intact.
      if (
        scrollbarWidth > 0 &&
        !getComputedStyle(root).scrollbarGutter?.includes('stable')
      ) {
        if (
          typeof CSS !== 'undefined' &&
          CSS.supports('scrollbar-gutter', 'stable')
        ) {
          root.style.scrollbarGutter = 'stable'
        } else {
          const padding = Number.parseFloat(getComputedStyle(body).paddingRight)
          body.style.paddingRight = `${padding + scrollbarWidth}px`
          compensated = true
        }
      }
      body.style.overflow = 'hidden'

      onCleanup(() => {
        body.style.overflow = overflow
        root.style.scrollbarGutter = gutter
        if (compensated) body.style.paddingRight = paddingRight
      })
    },
    { immediate: true },
  )
}
