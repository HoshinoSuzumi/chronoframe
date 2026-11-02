import type { EntryCapabilities } from '@chronoframe/contracts/entry'

export function siteFooterLink(
  edition: EntryCapabilities['edition'],
  variant: 'embedded' | 'fixed',
  siteId?: number,
) {
  if (edition !== 'site' || variant !== 'embedded') return null
  const url = new URL('https://chronoframe.art/')
  url.searchParams.set(
    'utm_source',
    Number.isSafeInteger(siteId) && Number(siteId) > 0
      ? `site_${siteId}`
      : 'site',
  )
  url.searchParams.set('utm_medium', 'referral')
  url.searchParams.set('utm_campaign', 'site_to_website')
  url.searchParams.set('utm_content', 'embedded_footer')
  return url.href
}
