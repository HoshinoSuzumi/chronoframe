import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import test from 'node:test'
import vm from 'node:vm'
import ts from 'typescript'
import { computed, h, ref } from 'vue'

test('shared photo columns render empty metadata and reaction breakdowns consistently', () => {
  const exports: Record<string, any> = {}
  vm.runInNewContext(
    ts.transpileModule(
      readFileSync(
        'packages/console/app/composables/usePhotoTableColumns.ts',
        'utf8',
      ),
      { compilerOptions: { module: ts.ModuleKind.CommonJS } },
    ).outputText,
    {
      exports,
      require: (id: string) =>
        id === 'vue'
          ? { h, computed, resolveComponent: (name: string) => name }
          : id === '#components'
            ? { Icon: 'icon', UBadge: 'badge' }
            : { default: 'thumbnail' },
      useI18n: () => ({ t: (key: string) => key }),
      useDayjs: () => () => ({ format: () => 'formatted date' }),
      useLocationLabel: () => () => 'City',
      formatBytes: (value: number) => `${value} bytes`,
    },
  )
  let previewed: unknown
  const reactions = ref<Record<string, Record<string, number>>>({})
  const columns = exports.usePhotoTableColumns({
    preview: (photo: unknown) => {
      previewed = photo
    },
    reactions,
  }).value
  const photo = { id: 'p', title: 'Photo', tags: [], exif: {} }
  const render = (id: string) =>
    columns
      .find((c: any) => (c.id ?? c.accessorKey) === id)
      .cell({
        row: { original: photo },
        getValue: () => null,
      })
  for (const [column, key] of [
    ['tags', 'noTags'],
    ['rating', 'noRating'],
    ['isLivePhoto', 'staticPhoto'],
  ]) {
    const child = render(column).children[0]
    assert.equal(child.children, `dashboard.photos.table.cells.${key}`)
    assert.match(child.props.class, /text-neutral-400 text-xs/)
  }
  assert.equal(
    render('reactions').children,
    'dashboard.photos.table.cells.noReactions',
  )
  reactions.value = { p: { like: 3, love: 1 } }
  const reactionCells = render('reactions').children
  assert.equal(reactionCells[0].children[1].children, '3')
  assert.equal(reactionCells[1].children[1].children, '1')
  render('thumbnailUrl').props.onClick()
  assert.equal(previewed, photo)
})
