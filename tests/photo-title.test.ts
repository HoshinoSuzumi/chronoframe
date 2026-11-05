import assert from 'node:assert/strict'
import test from 'node:test'
import { photoTitleFromFileName } from '../packages/contracts/src/photo.ts'

test('photo filename titles use the Self-hosted fallback rules', () => {
  for (const [name, expected] of [
    ['IMG_4963.jpeg', 'IMG 4963'],
    ['holiday.photo.JPG', 'holiday.photo'],
    ['风景.HEIC', '风景'],
    ['2025-01-02_sunset-125views.webp', 'sunset'],
    ['no-extension', 'no extension'],
    ['.hidden', '.hidden'],
    ['2025-01-02.jpg', '2025-01-02'],
    ['folder/photo_name.png', 'photo name'],
  ]) {
    assert.equal(photoTitleFromFileName(name!), expected)
  }
})
