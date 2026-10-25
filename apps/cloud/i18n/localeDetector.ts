import { getRequestHeader } from 'h3'
import { resolveCloudLocale } from './locale'

export default defineI18nLocaleDetector((event) =>
  resolveCloudLocale(getRequestHeader(event, 'accept-language') ?? ''),
)
