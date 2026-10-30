import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import vm from 'node:vm'
import ts from 'typescript'
import { ref } from 'vue'
import { EMPTY_MAP } from '../packages/platform/src/maps.ts'
test('successful map PUT updates revision, role and the live map without a follow-up GET', async () => {
  const data = ref({
    config: null as Record<string, string> | null,
    effective: { ...EMPTY_MAP },
    revision: 4,
    role: 'admin',
  })
  const error = ref(null)
  const store = { data: { map: { ...EMPTY_MAP } } }
  let puts = 0,
    refreshes = 0
  const source = readFileSync(
    'apps/cloud/app/components/CloudMapSettings.vue',
    'utf8',
  )
    .split('<script setup lang="ts">')[1]!
    .split('</script>')[0]!
  const code = ts.transpileModule(source, {
    compilerOptions: {
      module: ts.ModuleKind.ESNext,
      target: ts.ScriptTarget.ES2022,
    },
  }).outputText
  const form = (await vm.runInNewContext(
    `(async()=>{${code};return {save,own,draft,busy,message,failed}})()`,
    {
      ref,
      defineProps: () => ({ siteId: 1 }),
      useI18n: () => ({ locale: ref('en') }),
      useSettingsStore: () => store,
      useEntryContext: () => ref({ siteId: 1 }),
      useFetch: async () => ({
        data,
        error,
        refresh: async () => {
          refreshes++
          throw Error('GET unavailable')
        },
      }),
      $fetch: async (
        _url: string,
        options: { body: { config: Record<string, string> } },
      ) => {
        puts++
        return {
          config: options.body.config,
          effective: options.body.config,
          revision: 5,
        }
      },
    },
  )) as {
    save: () => Promise<void>
    own: { value: boolean }
    draft: { value: Record<string, string> }
    busy: { value: boolean }
    message: { value: string }
    failed: { value: boolean }
  }
  form.own.value = true
  form.draft.value['maplibre.token'] = 'new_public_browser_key'
  await form.save()
  assert.equal(puts, 1)
  assert.equal(refreshes, 0)
  assert.equal(data.value.revision, 5)
  assert.equal(data.value.role, 'admin')
  assert.equal(store.data.map['maplibre.token'], 'new_public_browser_key')
  assert.equal(form.busy.value, false)
  assert.equal(form.failed.value, false)
  assert.equal(form.message.value, 'Map settings saved.')
})
