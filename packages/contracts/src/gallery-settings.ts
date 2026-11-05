import { parseSocialLinks } from './social-links.ts'
/** Shared public defaults for both gallery editions. Never includes credentials or private settings. */
export const PUBLIC_GALLERY_DEFAULTS = {
  app: {
    title: 'ChronoFrame',
    slogan: '',
    author: '',
    avatarUrl: '',
    homeView: 'photos',
    socialLinks: { links: [] },
    reactionsEnabled: true,
    'appearance.theme': 'system',
    'appearance.homeHeaderLayout': 'embedded',
  },
  system: {
    'upload.maxFileSize': 256,
    'upload.duplicateCheck.enabled': true,
    'upload.duplicateCheck.mode': 'skip',
    webglImageViewerDebug: false,
    'auth.github.enabled': false,
  },
  privacy: {
    'upload.autoEraseLocation': false,
  },
  map: {
    provider: 'maplibre',
    'mapbox.token': '',
    'mapbox.style': '',
    'maplibre.token': '',
    'maplibre.style': '',
  },
  location: {
    preferredLevel: 'city',
    fallbackOrder: 'city,subregion,region,country',
    language: 'en',
    'mapbox.token': '',
    'nominatim.baseUrl': '',
  },
  analytics: {
    headScripts: '',
    bodyScripts: '',
  },
} as const

export interface GalleryPresentation {
  theme: 'light' | 'dark' | 'system'
  homeHeaderLayout: 'embedded' | 'fixed'
  socialLinks: { links: string[] }
  reactionsEnabled: boolean
  homeView: 'photos' | 'albums'
}
export function parseGalleryPresentation(value: unknown): GalleryPresentation {
  if (!value || typeof value !== 'object' || Array.isArray(value))
    throw new Error('Invalid gallery presentation')
  const data = value as Record<string, unknown>
  if (
    Object.keys(data).some(
      (k) =>
        ![
          'homeHeaderLayout',
          'homeView',
          'reactionsEnabled',
          'socialLinks',
          'theme',
        ].includes(k),
    ) ||
    (data.homeHeaderLayout !== 'embedded' && data.homeHeaderLayout !== 'fixed')
  )
    throw new Error('Invalid home header layout')
  if (
    data.theme !== undefined &&
    !['light', 'dark', 'system'].includes(data.theme as string)
  )
    throw new Error('Invalid gallery theme')
  const reactionsEnabled = data.reactionsEnabled
  if (reactionsEnabled !== undefined && typeof reactionsEnabled !== 'boolean')
    throw new Error('Invalid gallery reactions setting')
  const homeView = data.homeView
  if (homeView !== undefined && homeView !== 'photos' && homeView !== 'albums')
    throw new Error('Invalid gallery home view')
  return {
    homeView: homeView ?? 'photos',
    theme: (data.theme ?? 'dark') as GalleryPresentation['theme'],
    homeHeaderLayout:
      data.homeHeaderLayout as GalleryPresentation['homeHeaderLayout'],
    socialLinks: { links: parseSocialLinks(data.socialLinks) },
    reactionsEnabled: reactionsEnabled ?? true,
  }
}
