import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import vm from 'node:vm'
import ts from 'typescript'
import { ref, reactive, computed } from 'vue'
import {
  MAX_SOCIAL_LINKS,
  parseSocialLinks,
  socialLinkIdentity,
  resolveSocialPlatform,
} from '../packages/contracts/src/social-links.ts'

/** Execute the real component setup against controlled fetch and confirmation responses. */
async function setup(
  name: string,
  globals: Record<string, unknown>,
  exposed: string,
) {
  const source = readFileSync(`apps/cloud/app/components/${name}.vue`, 'utf8')
    .split('<script setup lang="ts">')[1]!
    .split('</script>')[0]!
    .replace(/^import[\s\S]*?from ['"][^'"]+['"]\s*\n/gm, '')
  const code = ts.transpileModule(source, {
    compilerOptions: {
      module: ts.ModuleKind.ESNext,
      target: ts.ScriptTarget.ES2022,
    },
  }).outputText
  return vm.runInNewContext(`(async()=>{${code};return {${exposed}}})()`, {
    ref,
    reactive,
    computed,
    watch: () => {},
    defineProps: () => ({ siteId: 1 }),
    useI18n: () => ({ locale: ref('en'), t: (key: string) => key }),
    useToast: () => ({ add: () => {} }),
    useEntryContext: () => ref(null),
    useTemplateRef: () => ref(null),
    MAX_SOCIAL_LINKS,
    parseSocialLinks,
    socialLinkIdentity,
    resolveSocialPlatform,
    ...globals,
  })
}

test('Processing recovery refreshes the revision without discarding a failed-save selection', async () => {
  const data = ref({ eraseLocation: false, revision: 1 }),
    error = ref<Error | null>(null)
  let posts = 0
  const form = await setup(
    'CloudProcessingSettings',
    {
      useFetch: async () => ({
        data,
        error,
        refresh: async () => {
          data.value = { eraseLocation: false, revision: 2 }
        },
      }),
      $fetch: async (
        _url: string,
        options: { body: { eraseLocation: boolean; revision: number } },
      ) => {
        if (++posts === 1) throw Error('conflict')
        assert.equal(options.body.eraseLocation, true)
        assert.equal(options.body.revision, 2)
      },
    },
    'erase,message,recover,save,busy',
  )
  form.erase.value = true
  await form.save()
  await form.recover()
  assert.equal(form.erase.value, true)
  assert.match(form.message.value, /save again/)
  assert.equal(form.busy.value, false)
  await form.save()
  assert.equal(posts, 2)
})

test('Processing recovery initializes a previously unloaded form and retains failed recovery state', async () => {
  const data = ref<{ eraseLocation: boolean; revision: number } | null>(null),
    error = ref<Error | null>(Error('load failed'))
  let available = false
  const form = await setup(
    'CloudProcessingSettings',
    {
      useFetch: async () => ({
        data,
        error,
        refresh: async () => {
          if (available) {
            data.value = { eraseLocation: true, revision: 3 }
            error.value = null
          }
        },
      }),
    },
    'erase,message,recover',
  )
  form.message.value = 'previous failure'
  await form.recover()
  assert.equal(error.value?.message, 'load failed')
  assert.equal(form.message.value, 'previous failure')
  available = true
  await form.recover()
  assert.equal(form.erase.value, true)
  assert.equal(form.message.value, '')
})

test('Site recovery confirms draft loss and cancellation preserves all drafts and error state', async () => {
  const stored = {
    site: {
      name: 'Saved',
      title: 'Saved title',
      slogan: 'Saved slogan',
      author: 'Saved author',
      avatarUrl: '',
      presentation: {
        theme: 'dark',
        homeHeaderLayout: 'embedded',
        homeView: 'photos',
        socialLinks: { links: [] },
      },
    },
  }
  let accepted = false,
    refreshes = 0,
    confirmations = 0
  const form = await setup(
    'CloudSiteSettings',
    {
      useFetch: async () => ({
        data: ref(stored),
        error: ref(null),
        refresh: async () => {
          refreshes++
        },
      }),
      window: {
        confirm: () => {
          confirmations++
          return accepted
        },
      },
    },
    'recover,name,profile,theme,homeView,socialDraft,failed,message',
  )
  form.name.value = 'Draft'
  form.profile.title = 'Draft title'
  form.theme.value = 'light'
  form.homeView.value = 'albums'
  form.socialDraft.value = ['https://example.test']
  form.failed.value = true
  form.message.value = 'Conflict'
  await form.recover()
  assert.equal(refreshes, 0)
  assert.equal(form.name.value, 'Draft')
  assert.equal(form.profile.title, 'Draft title')
  assert.equal(form.theme.value, 'light')
  assert.equal(form.homeView.value, 'albums')
  assert.equal(form.socialDraft.value[0], 'https://example.test')
  assert.equal(form.failed.value, true)
  assert.equal(form.message.value, 'Conflict')
  accepted = true
  await form.recover()
  assert.equal(confirmations, 2)
  assert.equal(refreshes, 1)
  assert.equal(form.name.value, 'Saved')
  assert.equal(form.profile.title, 'Saved title')
  assert.equal(form.theme.value, 'dark')
  assert.equal(form.socialDraft.value[0], '')
  assert.equal(form.message.value, '')
})
