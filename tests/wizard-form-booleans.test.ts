import assert from 'node:assert/strict'
import { createRequire } from 'node:module'
import { resolve } from 'node:path'
import test from 'node:test'
import { createPinia, setActivePinia } from 'pinia'
import { computed, ref } from 'vue'

const require = createRequire(import.meta.url)
const nuxtRequire = createRequire(require.resolve('nuxt/package.json'))
const { createJiti } = nuxtRequire('jiti')

test('wizard form coerces stale localStorage strings for boolean fields', async () => {
  const globals = {
    ref,
    computed,
    onMounted: () => {},
    useI18n: () => ({ t: (key: string) => key }),
    useToast: () => ({ add: () => {} }),
    $fetch: async () => ({
      fields: [
        {
          key: 'reactionsEnabled',
          type: 'boolean',
          value: true,
          defaultValue: true,
          ui: { type: 'toggle' },
        },
        {
          key: 'legacyToggle',
          type: 'string',
          value: false,
          defaultValue: false,
          ui: { type: 'toggle' },
        },
      ],
    }),
  }
  const previous = Object.getOwnPropertyDescriptors(globalThis)
  Object.assign(globalThis, globals)
  setActivePinia(createPinia())
  const jiti = createJiti(import.meta.url, {
    alias: { '~': resolve('apps/self-hosted/app') },
    moduleCache: false,
  })
  try {
    const { useWizardForm } = await jiti.import(
      resolve('apps/self-hosted/app/composables/useWizardForm.ts'),
    )
    const form = (
      useWizardForm as (namespace: string) => {
        state: { value: Record<string, unknown> }
        fetchSchema: () => Promise<void>
      }
    )('app')
    form.state.value = {
      reactionsEnabled: 'false',
      legacyToggle: 'true',
    }

    await form.fetchSchema()

    assert.equal(form.state.value.reactionsEnabled, false)
    assert.equal(form.state.value.legacyToggle, true)
  } finally {
    for (const key of Object.keys(globals)) {
      if (previous[key]) Object.defineProperty(globalThis, key, previous[key])
      else Reflect.deleteProperty(globalThis, key)
    }
  }
})
