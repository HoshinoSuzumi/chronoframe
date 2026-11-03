import {
  parseSocialLinks,
  resolveSocialPlatform,
} from '@chronoframe/contracts/social-links'

export function useSocialLinks() {
  const setting = useSettingRef('app:socialLinks')

  return computed(() => {
    try {
      return parseSocialLinks(setting.value).map((href) => ({
        href,
        ...resolveSocialPlatform(href),
      }))
    } catch {
      return []
    }
  })
}
