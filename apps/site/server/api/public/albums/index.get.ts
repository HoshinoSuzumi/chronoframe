import { createResourceReader } from '@chronoframe/core'
import { createCloudResourceRepository } from '@chronoframe/database/cloud-resources'
import type { MediaDatabase } from '@chronoframe/database/cloud-media'
import {
  definePlatformHandler,
  platformDatabase,
} from '../../../../../shared/platform/runtime'
import { publicSiteContext } from '../../../../../shared/platform/context'
export default definePlatformHandler(async (event) => {
  const context = await publicSiteContext(event)
  return {
    albums: await createResourceReader(
      createCloudResourceRepository(
        platformDatabase(event) as unknown as MediaDatabase,
        context.site,
        '/api/public/media',
      ),
    ).listAlbums({ admin: false }),
  }
})
