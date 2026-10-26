import {
  PUBLIC_GALLERY_DEFAULTS,
  parseGalleryPresentation,
} from '@chronoframe/contracts/gallery-settings'
import {
  platformDatabase,
  definePlatformHandler,
} from '../../../../../../shared/platform/runtime'
import {
  publicSiteContext,
  siteContextDTO,
} from '../../../../../../shared/platform/context'
export default definePlatformHandler(async (event) => {
  const context = await siteContextDTO(event, await publicSiteContext(event))
  const data = structuredClone(PUBLIC_GALLERY_DEFAULTS) as Record<
    string,
    Record<string, unknown>
  >
  const profile = await platformDatabase(event)
    .prepare(
      'SELECT gallery_title AS title, gallery_slogan AS slogan, gallery_author AS author, gallery_avatar AS avatarUrl, gallery_presentation AS presentation FROM platform_sites WHERE id = ?',
    )
    .bind(context.siteId)
    .first<{
      title: string
      slogan: string
      author: string
      avatarUrl: string
      presentation: string
    }>()
  data.app!.title = profile?.title || context.name
  data.app!.slogan = profile?.slogan || ''
  data.app!.author = profile?.author || ''
  data.app!.avatarUrl = profile?.avatarUrl || ''
  if (profile) {
    const presentation = parseGalleryPresentation(
      JSON.parse(profile.presentation),
    )
    data.app!['appearance.homeHeaderLayout'] = presentation.homeHeaderLayout
    data.app!.socialLinks = presentation.socialLinks
  }
  return { timestamp: Date.now(), data }
})
