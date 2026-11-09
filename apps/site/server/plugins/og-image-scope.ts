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
      const db = platformDatabase(e)
      const repository = createCloudResourceRepository(
        db as unknown as MediaDatabase,
        context.site,
        '/api/public/media',
      )
      const reader = createResourceReader(repository)
      const props = options.props ?? {}
      let thumbnailVersions: ({
        sourceVersion: string
        pipelineVersion: string
      } | null)[] = []
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
        if (props.showPhotos === true) {
          const thumbnails = (await reader.listVisiblePhotoPreviews(3)).filter(
            (photo) => photo.thumbnailUrl,
          )
          props.thumbnails = thumbnails.map((photo) => photo.thumbnailUrl)
          // Match the published asset selected by the media endpoint. Reprocessing
          // keeps its public URL (and can keep its perceptual hash) unchanged.
          thumbnailVersions = await reader.listThumbnailVersions(
            thumbnails.map((photo) => photo.id),
          )
          props.photoCount = await reader.countVisiblePhotos()
        } else {
          props.thumbnails = []
          delete props.photoCount
        }
        delete props.photoCountLabel
      } else {
        throw createError({ statusCode: 404 })
      }
      options.props = props
      // Live data participates in the internal cache identity, so updates and
      // visibility changes cannot reuse a stale rendered preview.
      const digest = await crypto.subtle.digest(
        'SHA-256',
        new TextEncoder().encode(
          JSON.stringify([image.key, props, thumbnailVersions]),
        ),
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
