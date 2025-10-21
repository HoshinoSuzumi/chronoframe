// Detect based on query, cookie, header
export default defineI18nLocaleDetector((event, config) => {
  // Helper function to normalize locale codes
  const normalizeLocale = (locale: string | undefined): string => {
    if (!locale) return config.defaultLocale || 'en'

    // Map common locale codes to our configured locales
    const localeMap: Record<string, string> = {
      'zh-CN': 'zh-Hans',
      'zh-SG': 'zh-Hans',
      zh: 'zh-Hans',
      'zh-TW': 'zh-Hant-TW',
      'zh-HK': 'zh-Hant-HK',
      'zh-MO': 'zh-Hant-HK',
    }

    return localeMap[locale] || config.defaultLocale || 'en'
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
