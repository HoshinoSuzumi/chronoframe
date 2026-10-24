import assert from 'node:assert/strict'
import test from 'node:test'
import {
  isNumericAlbumPathSegment,
  isValidAlbumSlug,
} from '@chronoframe/contracts/album-slug'
import {
  generatedAlbumSlug,
  validateCustomAlbumSlug,
} from '../packages/database/src/album-slug.ts'

test('generated album slugs romanize titles and normalize separators', () => {
  assert.equal(
    generatedAlbumSlug('My New Favourite Album'),
    'my-new-favourite-album',
  )
  assert.equal(generatedAlbumSlug('Crème brûlée!'), 'creme-brulee')
  assert.equal(generatedAlbumSlug('你好，世界'), 'ni-hao-shi-jie')
  assert.equal(generatedAlbumSlug('Привет мир'), 'privet-mir')
  assert.equal(generatedAlbumSlug('が'), 'ga')
  assert.equal(generatedAlbumSlug('か\u3099'), 'ga')
})

test('custom album slugs are exact, lowercase, safe, and not numeric', () => {
  assert.equal(validateCustomAlbumSlug(' my-album '), 'my-album')
  for (const invalid of [
    '1',
    'My Album',
    'my--album',
    '你好',
    '../album',
    '',
  ]) {
    assert.throws(() => validateCustomAlbumSlug(invalid))
  }
})

test('shared slug policy matches form validation and public route parsing', () => {
  assert.equal(isValidAlbumSlug('my-album-1'), true)
  assert.equal(isValidAlbumSlug('a'.repeat(80)), true)
  for (const invalid of ['', 'My Album', 'my--album', '1', 'a'.repeat(81)])
    assert.equal(isValidAlbumSlug(invalid), false)
  assert.equal(isNumericAlbumPathSegment('001'), true)
  assert.equal(isNumericAlbumPathSegment('my-album-1'), false)
})

test('automatic slugs have a fallback and a bounded length', () => {
  assert.equal(generatedAlbumSlug('🎉'), 'album')
  assert.ok(generatedAlbumSlug('a'.repeat(200)).length <= 80)
  assert.ok(generatedAlbumSlug('1'.repeat(200)).length <= 80)
})
