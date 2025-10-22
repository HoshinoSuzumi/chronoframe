export default defineI18nConfig(() => {
  return {
    fallbackLocale: {
      'zh-CN': ['zh-Hans'],
      'zh-SG': ['zh-Hans'],
      'zh': ['zh-Hans'],
      'zh-Hant': ['zh-Hant-TW', 'zh-Hant-HK'],
      'zh-TW': ['zh-Hant-TW'],
      'zh-HK': ['zh-Hant-HK'],
      'zh-MO': ['zh-Hant-HK'],
      'default': ['en'],
    },
  }
})
