import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import test from 'node:test'

const source = readFileSync(
  new URL(
    '../packages/console/app/pages/dashboard/albums.vue',
    import.meta.url,
  ),
  'utf8',
)

const descriptionCell =
  source.match(
    /<template #description-cell="\{ row \}">([\s\S]*?)<\/template>/,
  )?.[1] ?? ''

test('albums table has a description cell slot', () => {
  assert.notEqual(descriptionCell, '')
})

test('long album descriptions are width-constrained and truncated', () => {
  assert.match(descriptionCell, /class="[^"]*\bmax-w-xs\b[^"]*"/)
  assert.match(descriptionCell, /class="[^"]*\btruncate\b[^"]*"/)
})

test('full album description stays available on hover', () => {
  assert.match(
    descriptionCell,
    /:title="\(row\.original as unknown as AlbumItem\)\.description"/,
  )
})
