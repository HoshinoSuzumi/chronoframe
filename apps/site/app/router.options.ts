import type { RouterConfig } from 'nuxt/schema'

export default <RouterConfig>{
  scrollBehavior(to, from, savedPosition) {
    if (savedPosition) {
      return savedPosition
    }

    if (to.name === 'slug') {
      return false
    }

    if (
      from.name === 'slug' &&
      !to.hash &&
      (to.path === '/photos' ||
        to.path === '/' ||
        to.path.startsWith('/albums/'))
    ) {
      return false
    }

    if (to.hash) return { el: to.hash }
    return { top: 0 }
  },
}
