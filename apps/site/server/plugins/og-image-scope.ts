import { createError } from 'h3'
import type { OgImageRenderEventContext } from 'nuxt-og-image'
import { publicSiteContext } from '../../../shared/platform/context'

export default defineNitroPlugin((nitroApp) => {
  // OG verifies the signed path before this hook, and calls it before any image
  // cache lookup or rendering. A valid Worker signature alone grants no Site scope.
  nitroApp.hooks.hook(
    'nuxt-og-image:context',
    async ({ e, options }: OgImageRenderEventContext) => {
      const context = await publicSiteContext(e)
      if (options.props?.originSiteId !== context.site.id) {
        throw createError({
          statusCode: 403,
          statusMessage: 'OG image does not belong to this Site',
        })
      }
    },
  )
})
