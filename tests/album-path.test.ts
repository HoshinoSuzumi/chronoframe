import assert from 'node:assert/strict'
import test from 'node:test'
import {
  albumPagePath,
  isAlbumPagePath,
  numericAlbumId,
} from '../packages/gallery/shared/utils/albumPath.ts'

test('album links use slugs only for the self-hosted gallery', () => {
  const album = { id: 12, slug: 'my-album' }
  assert.equal(albumPagePath(album, true), '/albums/my-album')
  assert.equal(albumPagePath(album, false), '/albums/12')
  assert.equal(albumPagePath({ id: 12 }, true), '/albums/12')
  assert.equal(albumPagePath({ id: 12, slug: null }, true), '/albums/12')
})

test('numeric Cloud paths and album share links remain valid', () => {
  assert.equal(numericAlbumId('0012'), 12)
  assert.equal(numericAlbumId('12abc'), null)
  assert.equal(numericAlbumId('0'), null)
  assert.equal(numericAlbumId('9007199254740992'), null)
  assert.equal(isAlbumPagePath('/albums/12'), true)
  assert.equal(isAlbumPagePath('/albums/my-album'), true)
  assert.equal(isAlbumPagePath('/albums/../photos'), false)
})
