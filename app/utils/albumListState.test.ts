import assert from 'node:assert/strict'
import test from 'node:test'
import { getAlbumListState } from './albumListState.ts'

test('shows loading until the album request completes, including during retry', () => {
  assert.equal(getAlbumListState('idle', 0), 'loading')
  assert.equal(getAlbumListState('pending', 0), 'loading')
  assert.equal(getAlbumListState('pending', 2), 'loading')
})

test('distinguishes a successful empty result from visible albums', () => {
  assert.equal(getAlbumListState('success', 0), 'empty')
  assert.equal(getAlbumListState('success', 2), 'ready')
})

test('shows failure even when stale album data remains available', () => {
  assert.equal(getAlbumListState('error', 0), 'error')
  assert.equal(getAlbumListState('error', 2), 'error')
})
