import assert from 'node:assert/strict'
import test from 'node:test'
import { siteFooterLink } from '../packages/gallery/app/utils/site-footer-link.ts'

test('embedded SaaS attribution lands on the website and distinguishes source sites', () => {
  const a = new URL(siteFooterLink('site', 'embedded', 12)!)
  const b = new URL(siteFooterLink('site', 'embedded', 34)!)
  assert.equal(a.origin, 'https://chronoframe.art')
  assert.equal(a.pathname, '/')
  assert.equal(a.searchParams.get('utm_source'), 'site_12')
  assert.equal(b.searchParams.get('utm_source'), 'site_34')
  assert.equal(a.searchParams.get('utm_medium'), 'referral')
  assert.equal(a.searchParams.get('utm_campaign'), 'site_to_website')
  assert.equal(a.searchParams.get('utm_content'), 'embedded_footer')
})
test('Self-hosted, Cloud portal, and fixed headers retain their existing footer', () => {
  for (const variant of ['embedded', 'fixed'] as const) {
    assert.equal(siteFooterLink('self-hosted', variant, 12), null)
    assert.equal(siteFooterLink('cloud', variant, 12), null)
  }
  assert.equal(siteFooterLink('site', 'fixed', 12), null)
})
test('unresolved site IDs never produce undefined or invalid attribution identifiers', () => {
  for (const id of [undefined, 0, -1, NaN])
    assert.equal(
      new URL(siteFooterLink('site', 'embedded', id)!).searchParams.get(
        'utm_source',
      ),
      'site',
    )
})
