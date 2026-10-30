import type { RouterConfig } from 'nuxt/schema'
import { useNuxtApp, useRouter } from '#app'

export default <RouterConfig>{
  scrollBehavior(to, from, savedPosition) {
    if (savedPosition) {
      return savedPosition
    }

    if (to.name === 'slug') {
      return false
    }

    // Album viewers use ?photo= on the same route instead of the slug page.
    if (
      to.path === from.path &&
      to.path.startsWith('/albums/') &&
      (typeof to.query?.photo === 'string' ||
        typeof from.query?.photo === 'string') &&
      to.hash === from.hash
    )
      return false

    if (
      from.name === 'slug' &&
      !to.hash &&
      (to.path === '/photos' ||
        to.path === '/' ||
        to.path.startsWith('/albums/'))
    ) {
      return false
    }

    if (to.hash) {
      if (to.path === from.path || !from.matched?.length) return { el: to.hash }
      const app = useNuxtApp(),
        router = useRouter()
      return new Promise((resolve) => {
        app.hooks.hookOnce('page:loading:end', async () => {
          await app['~transitionPromise']
          requestAnimationFrame(() =>
            resolve(
              router.currentRoute.value.fullPath === to.fullPath
                ? { el: to.hash }
                : false,
            ),
          )
        })
      })
    }
    return { top: 0 }
  },
}
