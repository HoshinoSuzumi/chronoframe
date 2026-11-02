import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import test from 'node:test'
import vm from 'node:vm'
import ts from 'typescript'
import { computed, h, ref, type Ref, type VNode } from 'vue'

interface TestColumn {
  id?: string
  accessorKey?: string
  cell: (context: unknown) => VNode
}
const childrenOf = (node: VNode) => node.children as VNode[]

test('shared photo columns render empty metadata and reaction breakdowns consistently', () => {
  const exports: Record<string, unknown> = {}
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
            ? { Icon: 'icon', UBadge: 'badge', Rating: 'rating' }
            : { default: 'thumbnail' },
      useI18n: () => ({ t: (key: string) => key }),
      useDayjs: () => () => ({ format: () => 'formatted date' }),
      useLocationLabel: () => () => 'City',
      formatBytes: (value: number) => `${value} bytes`,
    },
  )
  let previewed: unknown
  const reactions = ref<Record<string, Record<string, number>>>({})
  const createColumns = exports.usePhotoTableColumns as (options: {
    preview: (photo: unknown) => void
    reactions: Ref<Record<string, Record<string, number>>>
  }) => { value: TestColumn[] }
  const columns = createColumns({
    preview: (photo: unknown) => {
      previewed = photo
    },
    reactions,
  }).value
  const photo = { id: 'p', title: 'Photo', tags: [], exif: {} }
  const render = (id: string) => {
    const column = columns.find((c) => (c.id ?? c.accessorKey) === id)
    assert(column, id)
    return column.cell({ row: { original: photo }, getValue: () => null })
  }
  for (const [column, key] of [
    ['tags', 'noTags'],
    ['rating', 'noRating'],
    ['isLivePhoto', 'staticPhoto'],
  ]) {
    const child = childrenOf(render(column))[0]
    assert.equal(child.children, `dashboard.photos.table.cells.${key}`)
    assert.match(String(child.props?.class), /text-neutral-400 text-xs/)
  }
  assert.equal(
    render('reactions').children,
    'dashboard.photos.table.cells.noReactions',
  )
  photo.exif = { Rating: 0 }
  const rating = childrenOf(render('rating'))[0]
  assert.equal(rating.type, 'rating')
  assert.equal(rating.props?.modelValue, 0)
  reactions.value = { p: { like: 3, love: 1 } }
  const reactionCells = childrenOf(render('reactions'))
  assert.equal(reactionCells.length, 2)
  assert.equal(childrenOf(reactionCells[0])[1].children, '3')
  assert.equal(childrenOf(reactionCells[1])[1].children, '1')
  reactions.value = { p: { like: 5, love: 4, wow: 3 } }
  assert.equal(childrenOf(render('reactions')).length, 3)
  reactions.value = { p: { like: 5, love: 4, wow: 3, fire: 2, sad: 1 } }
  const overflow = childrenOf(render('reactions'))
  assert.equal(overflow.length, 4)
  assert.equal(overflow[3].children, '+3')
  const onPreview = render('thumbnailUrl').props?.onClick as () => void
  onPreview()
  assert.equal(previewed, photo)
})
