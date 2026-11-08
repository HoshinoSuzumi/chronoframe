import { createError, setResponseHeader } from 'h3'
import { createResourceReader } from '@chronoframe/core'
import { createCloudResourceRepository } from '@chronoframe/database/cloud-resources'
import type { MediaDatabase } from '@chronoframe/database/cloud-media'
import type { OgImageRenderEventContext } from 'nuxt-og-image'
import { publicSiteContext } from '../../../shared/platform/context'
import { platformDatabase } from '../../../shared/platform/runtime'
import { authorizePublicPhoto } from '../../../shared/platform/media'

export default defineNitroPlugin((nitroApp) => {
  // OG verifies the signed path before this hook, and calls it before any image
  // cache lookup or rendering. A valid Worker signature alone grants no Site scope.
  nitroApp.hooks.hook(
    'nuxt-og-image:context',
    async (image: OgImageRenderEventContext) => {
      const { e, options } = image
      const context = await publicSiteContext(e)
      if (options.props?.originSiteId !== context.site.id) {
        throw createError({
          statusCode: 403,
          statusMessage: 'OG image does not belong to this Site',
        })
      }
      e.context.siteOgImage = true
      const repository = createCloudResourceRepository(
        platformDatabase(e) as unknown as MediaDatabase,
        context.site,
        '/api/public/media',
      )
      const props = options.props ?? {}
      if (options.component === 'OgImagePhotoTakumi') {
        if (
          typeof props.photoId !== 'string' ||
          !/^[a-zA-Z0-9_-]{1,128}$/.test(props.photoId)
        )
          throw createError({ statusCode: 404 })
        const photo = await repository.getPhoto(props.photoId)
        if (!photo) throw createError({ statusCode: 404 })
        await authorizePublicPhoto(e, context, photo.id)
        props.photo = photo
      } else if (options.component === 'OgImageHomeTakumi') {
        const photos =
          props.showPhotos === true
            ? await createResourceReader(repository).listVisiblePhotos()
            : []
        props.thumbnails = photos
          .map((photo) => photo.thumbnailUrl)
          .filter(Boolean)
          .slice(0, 3)
        if (props.showPhotos === true) props.photoCount = photos.length
        else delete props.photoCount
        delete props.photoCountLabel
      } else {
        throw createError({ statusCode: 404 })
      }
      options.props = props
      // Live data participates in the internal cache identity, so updates and
      // visibility changes cannot reuse a stale rendered preview.
      const digest = await crypto.subtle.digest(
        'SHA-256',
        new TextEncoder().encode(JSON.stringify([image.key, props])),
      )
      image.key = Array.from(new Uint8Array(digest), (byte) =>
        byte.toString(16).padStart(2, '0'),
      ).join('')
    },
  )
  nitroApp.hooks.hook('beforeResponse', (event) => {
    if (event.context.siteOgImage)
      setResponseHeader(event, 'Cache-Control', 'private, no-store')
  })
})
