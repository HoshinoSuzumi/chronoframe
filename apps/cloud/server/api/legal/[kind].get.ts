import { getQuery, getRouterParam, createError } from 'h3'
import {
  LEGAL_KINDS,
  LEGAL_LOCALES,
  legalDocument,
  type LegalKind,
  type LegalLocale,
} from '../../../../../packages/platform/src/legal'
import {
  definePlatformHandler,
  platformDatabase,
} from '../../../../shared/platform/runtime'
export default definePlatformHandler(async (event) => {
  const kind = getRouterParam(event, 'kind') as LegalKind
  const locale = (getQuery(event).locale ?? 'en') as LegalLocale
  if (!LEGAL_KINDS.includes(kind) || !LEGAL_LOCALES.includes(locale))
    throw createError({ statusCode: 404 })
  return legalDocument(platformDatabase(event), kind, locale)
})
