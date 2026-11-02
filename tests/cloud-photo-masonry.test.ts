import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import test from 'node:test'
import vm from 'node:vm'
import ts from 'typescript'
import { parse } from 'vue/compiler-sfc'
import { computed, ref } from 'vue'

test('masonry select-all replaces hidden selections and deselect-all clears them like the list view', () => {
  const { descriptor } = parse(
    readFileSync('apps/cloud/app/components/CloudPhotoMasonry.vue', 'utf8'),
  )
  const selection = ref<Record<string, boolean>>({ hidden: true })
  const props = { photos: [{ id: 'visible' }], actions: () => [] }
  const context = vm.createContext({
    exports: {},
    require: () => ({}),
    defineProps: () => props,
    defineModel: () => selection,
    defineEmits: () => () => {},
    computed,
    useId: () => 'selection',
    useMediaQuery: () => ref(false),
  })
  vm.runInContext(
    ts.transpileModule(descriptor.scriptSetup!.content, {
      compilerOptions: { module: ts.ModuleKind.CommonJS },
    }).outputText,
    context,
  )
  vm.runInContext('selectAll(true)', context)
  assert.deepEqual(Object.keys(selection.value), ['visible'])
  props.photos = [{ id: 'hidden' }, { id: 'visible' }]
  vm.runInContext('selectAll(false)', context)
  assert.deepEqual(Object.keys(selection.value), [])
  selection.value = { hidden: true }
  props.photos = [{ id: 'visible' }]
  vm.runInContext('selectAll(false)', context)
  assert.deepEqual(Object.keys(selection.value), [])
})
