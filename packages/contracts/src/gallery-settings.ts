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
  homeHeaderLayout: 'embedded' | 'fixed'
  socialLinks: { links: string[] }
}
export function parseGalleryPresentation(value: unknown): GalleryPresentation {
  if (!value || typeof value !== 'object' || Array.isArray(value))
    throw new Error('Invalid gallery presentation')
  const data = value as Record<string, unknown>
  if (
    Object.keys(data).some(
      (k) => !['homeHeaderLayout', 'socialLinks'].includes(k),
    ) ||
    (data.homeHeaderLayout !== 'embedded' && data.homeHeaderLayout !== 'fixed')
  )
    throw new Error('Invalid home header layout')
  return {
    homeHeaderLayout:
      data.homeHeaderLayout as GalleryPresentation['homeHeaderLayout'],
    socialLinks: { links: parseSocialLinks(data.socialLinks) },
  }
}
