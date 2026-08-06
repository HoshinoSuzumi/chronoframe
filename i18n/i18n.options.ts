import type { NuxtI18nOptions } from '@nuxtjs/i18n'
import type { LocaleObject } from '@nuxtjs/i18n'
import type { ModuleOptions as DayjsModuleOptions } from 'dayjs-nuxt'
import type { I18nOptions } from 'vue-i18n'

export const defaultLocale = 'en'

type DayjsLocale = NonNullable<DayjsModuleOptions['locales']>[number]

type AppLocaleCode =
  | 'zh-Hans'
  | 'zh-Hant-TW'
  | 'zh-Hant-HK'
  | 'en'
  | 'ja'
  | 'ru'

type AppLocaleObject = LocaleObject<AppLocaleCode> & {
  label: string
  language: string
}

export const locales: AppLocaleObject[] = [
  {
    code: 'zh-Hans',
    name: '简体中文',
    label: '简体中文 (Simplified Chinese)',
    file: 'zh-Hans.json',
    language: 'zh',
  },
  {
    code: 'zh-Hant-TW',
    name: '繁体中文(台湾)',
    label: '繁體中文 (Traditional Chinese, Taiwan)',
    file: 'zh-Hant-TW.json',
    language: 'zh-TW',
  },
  {
    code: 'zh-Hant-HK',
    name: '繁体中文(香港)',
    label: '繁體中文 (Traditional Chinese, Hong Kong)',
    file: 'zh-Hant-HK.json',
    language: 'zh-HK',
  },
  {
    code: 'en',
    name: 'English',
    label: 'English',
    file: 'en.json',
    language: 'en',
  },
  {
    code: 'ja',
    name: '日本語',
    label: '日本語 (Japanese)',
    file: 'ja.json',
    language: 'ja',
  },
  {
    code: 'ru',
    name: 'Русский',
    label: 'Русский (Russian)',
    file: 'ru.json',
    language: 'ru',
  },
]

export const localeLanguages = locales.map(({ language }) => language)
export const dayjsLocales: DayjsLocale[] = [
  'zh-cn',
  'zh-tw',
  'zh-hk',
  'en',
  'ja',
  'ru'
]

export default {
  experimental: {
    localeDetector: 'localeDetector.ts',
  },
  detectBrowserLanguage: {
    fallbackLocale: defaultLocale,
    useCookie: false,
    cookieKey: 'chronoframe-locale',
  },
  strategy: 'no_prefix',
  defaultLocale,
  locales,
  fallbackLocale: {
    'zh-CN': ['zh-Hans'],
    'zh-SG': ['zh-Hans'],
    zh: ['zh-Hans'],
    'zh-Hant': ['zh-Hant-TW', 'zh-Hant-HK'],
    'zh-TW': ['zh-Hant-TW'],
    'zh-HK': ['zh-Hant-HK'],
    'zh-MO': ['zh-Hant-HK'],
    default: [defaultLocale],
  },
} satisfies I18nOptions & NuxtI18nOptions
