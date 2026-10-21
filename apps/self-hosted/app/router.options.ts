import type { RouterConfig } from 'nuxt/schema'

export default <RouterConfig>{
  scrollBehavior(to, from, savedPosition) {
    if (savedPosition) {
      return savedPosition
    }

    if (to.name === 'slug') {
      return false
    }

    if (from.name === 'slug' && (to.path === '/photos' || to.path === '/')) {
      return false
    }

    return { top: 0 }
  },
}
