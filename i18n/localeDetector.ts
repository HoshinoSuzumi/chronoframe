// Detect based on query, cookie, header
export default defineI18nLocaleDetector((event, config) => {
  // Supported locales from nuxt config
  // todo this is hardcoded, maybe find a better way to sync with nuxt config
  const SUPPORTED_LOCALES = ['zh-Hans', 'zh-Hant-TW', 'zh-Hant-HK', 'en', 'ja']

  // Helper function to normalize locale codes
  const normalizeLocale = (locale: string | undefined): string => {
    if (!locale) return config.defaultLocale || 'en'

    // Check if locale exists in configured locales
    if (SUPPORTED_LOCALES.includes(locale)) {
      return locale
    }

    // Try to get fallback locale from config.fallbackLocale
    const fallbackLocales = config.fallbackLocale as
      | Record<string, string[]>
      | undefined
    if (fallbackLocales && fallbackLocales[locale]) {
      const fallbacks = fallbackLocales[locale]
      for (const fallback of fallbacks) {
        if (SUPPORTED_LOCALES.includes(fallback)) {
          return fallback
        }
      }
    }

    // Fall back to default locale
    return config.defaultLocale || 'en'
  }

  // try to get locale from query
  const query = tryQueryLocale(event, { lang: '' }) // disable locale default value with `lang` option
  if (query) {
    return normalizeLocale(query.toString())
  }

  // try to get locale from cookie
  const cookie = tryCookieLocale(event, {
    lang: '',
    name: 'chronoframe-locale',
  }) // disable locale default value with `lang` option
  if (cookie) {
    return normalizeLocale(cookie.toString())
  }

  // try to get locale from header (`accept-header`)
  const header = tryHeaderLocale(event, { lang: '' }) // disable locale default value with `lang` option
  if (header) {
    return normalizeLocale(header.toString())
  }

  // If the locale cannot be resolved up to this point, it is resolved with the value `defaultLocale` of the locale config passed to the function
  return config.defaultLocale
})
