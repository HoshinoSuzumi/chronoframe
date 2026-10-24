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
