import i18nOptions from './i18n.options'

export default defineI18nConfig(() => {
  return {
    fallbackLocale: i18nOptions.fallbackLocale,
  }
})
