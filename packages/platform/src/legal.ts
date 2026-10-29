import type { PlatformD1 } from './index.ts'
import { LEGAL_DEFAULTS } from './legal-defaults.ts'
export const LEGAL_KINDS = ['terms', 'privacy'] as const
export const LEGAL_LOCALES = ['en', 'zh-Hans'] as const
export type LegalKind = (typeof LEGAL_KINDS)[number]
export type LegalLocale = (typeof LEGAL_LOCALES)[number]
export interface LegalDocument {
  kind: LegalKind
  locale: LegalLocale
  title: string
  markdown: string
  effectiveOn: string
  revision: number
  updatedAt: number | null
}
export function validateLegalDocument(
  input: unknown,
): Omit<LegalDocument, 'updatedAt'> {
  const value = input as Record<string, unknown> | null
  if (
    !value ||
    !LEGAL_KINDS.includes(value.kind as LegalKind) ||
    !LEGAL_LOCALES.includes(value.locale as LegalLocale) ||
    typeof value.title !== 'string' ||
    !value.title.trim() ||
    value.title.length > 160 ||
    typeof value.markdown !== 'string' ||
    !value.markdown.trim() ||
    new TextEncoder().encode(value.markdown).length > 100_000 ||
    typeof value.effectiveOn !== 'string' ||
    !/^\d{4}-\d{2}-\d{2}$/.test(value.effectiveOn) ||
    !Number.isFinite(Date.parse(value.effectiveOn)) ||
    new Date(value.effectiveOn).toISOString().slice(0, 10) !==
      value.effectiveOn ||
    !Number.isSafeInteger(value.revision) ||
    (value.revision as number) < 0
  )
    throw new Error('Invalid legal document')
  return {
    kind: value.kind as LegalKind,
    locale: value.locale as LegalLocale,
    title: value.title.trim(),
    markdown: value.markdown.trim(),
    effectiveOn: value.effectiveOn,
    revision: value.revision as number,
  }
}
export async function legalDocument(
  db: PlatformD1,
  kind: LegalKind,
  locale: LegalLocale,
): Promise<LegalDocument> {
  const row = await db
    .prepare(
      'SELECT title,markdown,effective_on AS effectiveOn,revision,updated_at AS updatedAt FROM platform_legal_documents WHERE kind=? AND locale=?',
    )
    .bind(kind, locale)
    .first<Omit<LegalDocument, 'kind' | 'locale'>>()
  return {
    kind,
    locale,
    ...(row ?? {
      ...LEGAL_DEFAULTS[kind][locale],
      effectiveOn: '2026-10-28',
      revision: 0,
      updatedAt: null,
    }),
  }
}
