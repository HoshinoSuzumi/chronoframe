import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import ts from 'typescript'
import {
  ref,
  shallowRef,
  computed,
  watch,
  reactive,
  nextTick,
  effectScope,
} from 'vue'

function component(
  name: string,
  deps: Record<string, unknown>,
  exposed: string,
) {
  const source = readFileSync(`apps/cloud/app/components/${name}.vue`, 'utf8')
    .split('<script setup lang="ts">')[1]!
    .split('</script>')[0]!
    .replace(/^import[\s\S]*?from ['"][^'"]+['"]\s*\n/gm, '')
  const code = ts.transpileModule(source, {
    compilerOptions: {
      module: ts.ModuleKind.CommonJS,
      target: ts.ScriptTarget.ES2022,
    },
  }).outputText
  const globals = {
    ref,
    shallowRef,
    computed,
    watch,
    useI18n: () => ({ t: (key: string) => key, locale: ref('en') }),
    ...deps,
  }
  return new Function(...Object.keys(globals), code + `;return {${exposed}}`)(
    ...Object.values(globals),
  )
}
function deferred<T>() {
  let resolve!: (value: T) => void
  const promise = new Promise<T>((done) => {
    resolve = done
  })
  return { promise, resolve }
}
const setup = (name: string) => ({
  required: true,
  step: 1,
  revision: 1,
  name,
  workspace: null,
  site: null,
})

test('Onboarding follows account identity and ignores delayed reads and saves from the previous account', async () => {
  const scope = effectScope(),
    user = ref({ id: 1, name: 'A' }),
    first = deferred<ReturnType<typeof setup>>(),
    second = deferred<ReturnType<typeof setup>>(),
    saved = deferred<ReturnType<typeof setup>>()
  let mounted = () => {},
    reads = 0
  const vm = scope.run(() =>
    component(
      'CloudAccountOnboarding',
      {
        usePortalIdentity: () => user,
        useRequestFetch: () => () =>
          ++reads === 1
            ? first.promise
            : reads === 2
              ? second.promise
              : Promise.resolve(setup('C')),
        useState: () => ref(null),
        useRuntimeConfig: () => ({
          public: { siteBaseDomain: 'example.test' },
        }),
        onMounted: (callback: () => void) => {
          mounted = callback
        },
        onBeforeUnmount: () => {},
        validSiteSlug: () => true,
        $fetch: () => saved.promise,
        refreshNuxtData: async () => {},
        navigateTo: () => assert.fail('stale response must not navigate'),
      },
      'state,refresh,save,name,busy,step,error',
    ),
  )!
  try {
    mounted()
    user.value = { id: 2, name: 'B' }
    second.resolve(setup('B'))
    await nextTick()
    await nextTick()
    first.resolve(setup('A'))
    await nextTick()
    await nextTick()
    assert.equal(vm.state.value.name, 'B')
    vm.name.value = 'B changed'
    const saving = vm.save()
    user.value = { id: 3, name: 'C' }
    second.resolve(setup('C'))
    await nextTick()
    saved.resolve(setup('B saved'))
    await saving
    await nextTick()
    assert.notEqual(vm.state.value?.name, 'B saved')
    assert.equal(user.value.name, 'C')
    assert.equal(vm.busy.value, false)
  } finally {
    scope.stop()
  }
})

test('Trial confirmation includes reduced limits, billing changes refresh status, and late claims cannot overwrite a new workspace', async () => {
  const scope = effectScope(),
    identity = ref({ id: 1 }),
    props = reactive({
      workspaceId: 1,
      currentLimits: { photos: 100, sites: 2 },
      subscription: 'free',
    })
  const offer = {
    eligible: true,
    serverTime: Date.now(),
    offer: { revision: '1:1', limits: { photos: 200, sites: 1 } },
    trial: null,
  }
  const data = shallowRef<unknown>(offer),
    pending = deferred<unknown>()
  let refreshes = 0,
    changes = 0
  const vm = scope.run(() =>
    component(
      'CloudTrialCard',
      {
        defineProps: () => props,
        defineEmits: () => () => {
          changes++
        },
        usePortalIdentity: () => identity,
        useRequestFetch: () => () => Promise.resolve(offer),
        useAsyncData: (
          _key: unknown,
          _handler: unknown,
          options: { watch: (() => unknown)[] },
        ) => {
          watch(options.watch, () => {
            refreshes++
          })
          return {
            data,
            error: ref(null),
            refresh: async () => {
              refreshes++
            },
          }
        },
        useIntervalFn: () => {},
        $fetch: () => pending.promise,
        refreshNuxtData: async () => {},
        allowance: () => '',
      },
      'benefits,claim,open',
    ),
  )!
  try {
    assert.deepEqual(vm.benefits.value, [
      ['photos', 200],
      ['sites', 1],
    ])
    props.subscription = 'paid'
    await nextTick()
    assert.equal(refreshes, 1)
    const claiming = vm.claim()
    props.workspaceId = 2
    identity.value = { id: 2 }
    const next = { ...offer, offer: { ...offer.offer, revision: '2:1' } }
    data.value = next
    await nextTick()
    pending.resolve({ ...offer, eligible: false, trial: { workspaceId: 1 } })
    await claiming
    assert.equal(data.value, next)
    assert.equal(changes, 0)
  } finally {
    scope.stop()
  }
})

test('Quota notice links directly to plans when trials are disabled', () => {
  const data = ref<unknown>({ reason: 'disabled' })
  const vm = component(
    'CloudQuotaNotice',
    {
      defineProps: () => ({ reason: 'upgrade' }),
      defineEmits: () => () => {},
      usePortalIdentity: () => ref({ id: 1 }),
      useRequestFetch: () => () => {},
      useAsyncData: () => ({ data }),
    },
    'plansLink',
  )
  assert.equal(vm.plansLink.value, '/account/plan#plans')
  data.value = { reason: null }
  assert.equal(vm.plansLink.value, '/account/plan')
})
