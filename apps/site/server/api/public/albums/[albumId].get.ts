import { createError, getRouterParam } from 'h3'
import { createResourceReader } from '@chronoframe/core'
import { createCloudResourceRepository } from '@chronoframe/database/cloud-resources'
import type { MediaDatabase } from '@chronoframe/database/cloud-media'
import {
  definePlatformHandler,
  platformDatabase,
} from '../../../../../shared/platform/runtime'
import { publicSiteContext } from '../../../../../shared/platform/context'
import { visitorAccess } from '../../../../../shared/platform/visitor'
export default definePlatformHandler(async (event) => {
  const context = await publicSiteContext(event),
    id = Number(getRouterParam(event, 'albumId'))
  if (!Number.isSafeInteger(id) || id < 1)
    throw createError({ statusCode: 404 })
  const repository = createCloudResourceRepository(
    platformDatabase(event) as unknown as MediaDatabase,
    context.site,
    '/api/public/media',
  )
  const album = await repository.getAlbum(id)
  if (!album || album.resource.isHidden) throw createError({ statusCode: 404 })
  const unlocked =
    !album.passwordHash ||
    (
      await visitorAccess(
        event,
        context,
        id,
        useRuntimeConfig(event).platform.secret,
      )
    ).unlocked
  return {
    album: await createResourceReader(repository).getAlbum(id, {
      admin: false,
      canAccess: () => unlocked,
    }),
  }
})
