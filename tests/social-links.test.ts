import assert from 'node:assert/strict'
import test from 'node:test'
import {
  parseSocialLinks,
  parseSocialLink,
  resolveSocialPlatform,
  socialLinkIdentity,
} from '@chronoframe/contracts/social-links'
import { validateSettingWrite } from '@chronoframe/core'

test('accepts an ordered list of at most four HTTPS profile links', () => {
  const links = [
    'https://instagram.com/example',
    'https://github.com/example',
    'https://www.youtube.com/@example',
    'https://example.org/profile',
  ]
  assert.deepEqual(parseSocialLinks({ links }), links)
  assert.deepEqual(parseSocialLinks({ links: [] }), [])
  assert.throws(
    () => parseSocialLinks({ links: [...links, 'https://x.com/example'] }),
    /four/i,
  )
})

test('rejects unsafe, malformed and duplicate social links', () => {
  for (const link of [
    'http://instagram.com/example',
    'javascript:alert(1)',
    'https://user:pass@instagram.com/example',
    'https://localhost/example',
    'https://profile.local/example',
    'https://127.0.0.1/example',
    'https://instagram.com.evil.test/example\n',
    ' https://instagram.com/example ',
  ]) {
    assert.throws(() => parseSocialLinks({ links: [link] }), undefined, link)
  }
  assert.throws(
    () =>
      parseSocialLinks({
        links: ['https://Instagram.com/me', 'https://instagram.com/me/'],
      }),
    /duplicate/i,
  )
  assert.throws(
    () => parseSocialLinks({ links: ['https://example.com'], extra: true }),
    /shape/i,
  )
})

test('validates HTTPS URL syntax without requiring a reachable public host', () => {
  for (const link of [
    'https://evil.test/profile',
    'https://example.example/profile',
    'https://foo.onion/profile',
  ]) {
    assert.equal(parseSocialLink(link).href, link)
  }
})

test('duplicate identity ignores query, fragment and trailing slash but keeps the hostname', () => {
  const first = 'https://example.com/a?x=1#top'
  const queryVariant = 'https://example.com/a/?x=2#bottom'
  const withWww = 'https://www.example.com/a'

  assert.equal(socialLinkIdentity(first), socialLinkIdentity(queryVariant))
  assert.notEqual(socialLinkIdentity(first), socialLinkIdentity(withWww))
  assert.throws(
    () => parseSocialLinks({ links: [first, queryVariant] }),
    /duplicate/i,
  )
  assert.deepEqual(parseSocialLinks({ links: [first, withWww] }), [
    first,
    withWww,
  ])
})

test('settings write validation enforces the social-link contract', () => {
  const input = {
    namespace: 'app',
    key: 'socialLinks',
    value: { links: ['https://github.com/example'] },
    readonly: false,
    enumValues: null,
    sudo: false,
  }
  validateSettingWrite(input)
  assert.throws(
    () =>
      validateSettingWrite({ ...input, value: { links: ['http://bad.test'] } }),
    /HTTPS/i,
  )
})

test('resolves known platforms by exact host or subdomain only', () => {
  assert.equal(
    resolveSocialPlatform('https://www.instagram.com/me').icon,
    'tabler:brand-instagram',
  )
  assert.equal(resolveSocialPlatform('https://x.com/me').label, 'X')
  assert.equal(
    resolveSocialPlatform('https://www.flickr.com/photos/me').label,
    'Flickr',
  )
  assert.equal(
    resolveSocialPlatform('https://instagram.com.evil.test/me').icon,
    'tabler:link',
  )
  assert.equal(
    resolveSocialPlatform('https://example.org/me').label,
    'example.org',
  )
})
