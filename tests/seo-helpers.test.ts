import assert from 'node:assert/strict'
import test from 'node:test'
import { imageUrl } from './helpers/seo.ts'

test('OG image extraction decodes HTML entities in a URL once', () => {
  assert.equal(
    imageUrl(
      '<meta property="og:image" content="https:&#x2F;&#x2F;gallery.example.test/image.png?width=1200&amp;height=600">',
    ),
    'https://gallery.example.test/image.png?width=1200&height=600',
  )
})

test('OG image extraction preserves entity text protected by an escaped ampersand', () => {
  for (const [encoded, decoded] of [
    ['/image&amp;#x2F;name.png', '/image&#x2F;name.png'],
    [
      '/image.png?label=&amp;#x2F;&amp;next=1',
      '/image.png?label=&#x2F;&next=1',
    ],
    ['/image&amp;amp;name.png', '/image&amp;name.png'],
  ]) {
    assert.equal(
      imageUrl(`<meta property="og:image" content="${encoded}">`),
      decoded,
    )
  }
})
