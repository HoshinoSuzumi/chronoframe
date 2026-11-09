import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import ts from 'typescript'
import { createRequire } from 'node:module'
const { renderToString } = createRequire(
  createRequire(import.meta.url).resolve('vue/package.json'),
)('@vue/server-renderer')
import {
  ref,
  shallowRef,
  computed,
  watch,
  reactive,
  nextTick,
  effectScope,
  createSSRApp,
  compile,
  h,
  toRefs,
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
      workspaceName: 'Gallery',
      currentAnalytics: false,
      showUnavailable: false,
      currentLimits: { photos: 100, sites: 2 },
      subscription: 'free',
    })
  const offer = {
    eligible: true,
    serverTime: Date.now(),
    offer: {
      revision: '1:1',
      planName: 'Trial',
      days: 14,
      analytics: false,
      limits: { photos: 200, sites: 1 },
    },
    fallback: { id: 'free', name: 'Free' },
    trial: null,
  }
  const data = shallowRef<unknown>({
      workspaceId: 1,
      accountId: 1,
      value: offer,
    }),
    pending = deferred<unknown>(),
    read = deferred<unknown>()
  let load!: () => Promise<unknown>
  let posts = 0
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
        useRequestFetch: () => () => read.promise,
        useAsyncData: (
          _key: unknown,
          handler: () => Promise<unknown>,
          options: { watch: (() => unknown)[] },
        ) => {
          load = handler
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
        $fetch: () => {
          posts++
          return pending.promise
        },
        refreshNuxtData: async () => {},
        allowance: (_key: string, value: number) => String(value),
      },
      'benefits,claim,open,request,data,busy,error,trial,active,visible,daysLeft,endDate,reason,t,locale,allowance',
    ),
  )!
  try {
    assert.deepEqual(vm.benefits.value, [
      ['photos', 200],
      ['sites', 1],
    ])
    vm.open.value = true
    const template = readFileSync(
      'apps/cloud/app/components/CloudTrialCard.vue',
      'utf8',
    )
      .split('<template>')[1]!
      .split('</template>\n<style')[0]!
    const app = createSSRApp({
      setup: () => ({ ...vm, ...toRefs(props) }),
      render: compile(template),
    })
    for (const name of ['CfCard', 'CfAlert', 'CfButton'])
      app.component(name, {
        setup(_props, context) {
          return () => h('div', context.slots.default?.())
        },
      })
    app.component('UModal', {
      props: ['open'],
      setup(modal, context) {
        return () =>
          modal.open
            ? h('section', { role: 'dialog' }, context.slots.body?.())
            : null
      },
    })
    const html = await renderToString(app)
    const text = html.replace(/<[^>]+>/g, ' ')
    assert.match(text, /cloud\.billing\.sites\s+2\s*→\s*1/)
    props.subscription = 'paid'
    await nextTick()
    assert.equal(refreshes, 1)
    const loading = load()
    const claiming = vm.claim()
    props.workspaceId = 2
    identity.value = { id: 2 }
    const next = {
      workspaceId: 2,
      accountId: 2,
      value: { ...offer, offer: { ...offer.offer, revision: '2:1' } },
    }
    assert.equal(vm.visible.value, false)
    await nextTick()
    await vm.claim()
    assert.equal(changes, 0)
    assert.equal(posts, 1)
    read.resolve(offer)
    data.value = await loading
    assert.equal(vm.visible.value, false)
    await vm.claim()
    assert.equal(posts, 1)
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

test('Onboarding honors the server workspace fallback after saving', async () => {
  const scope = effectScope(),
    user = ref({ id: 1, name: 'Alice' })
  let mounted = () => {}
  const state = { ...setup('Alice'), step: 2 }
  const vm = scope.run(() =>
    component(
      'CloudAccountOnboarding',
      {
        usePortalIdentity: () => user,
        useRequestFetch: () => async () => state,
        useState: () => ref(null),
        useRuntimeConfig: () => ({
          public: { siteBaseDomain: 'example.test' },
        }),
        onMounted: (fn: () => void) => {
          mounted = fn
        },
        onBeforeUnmount: () => {},
        validSiteSlug: () => true,
        $fetch: async () => ({ ...state, revision: 2 }),
        refreshNuxtData: async () => {},
        navigateTo: () => assert.fail('must remain in setup'),
      },
      'state,step,reached,save,workspace',
    ),
  )!
  try {
    mounted()
    await nextTick()
    await nextTick()
    vm.workspace.value = 'Team'
    vm.reached.value = 3
    await vm.save()
    assert.equal(vm.step.value, 2)
    assert.equal(vm.reached.value, 2)
  } finally {
    scope.stop()
  }
})

test('Changing the account name reconfirms a regenerated default workspace but preserves a custom name', async () => {
  for (const originalName of ["Alice's workspace", 'Photo Team']) {
    const scope = effectScope(),
      user = ref({ id: 1, name: 'Alice' }),
      calls: Record<string, unknown>[] = []
    const initial = {
      ...setup('Alice'),
      step: 3,
      workspace: { id: 1, name: originalName },
    }
    let mounted = () => {}
    const vm = scope.run(() =>
      component(
        'CloudAccountOnboarding',
        {
          usePortalIdentity: () => user,
          useRequestFetch: () => async () => initial,
          useState: () => ref(null),
          useRuntimeConfig: () => ({
            public: { siteBaseDomain: 'example.test' },
          }),
          onMounted: (fn: () => void) => {
            mounted = fn
          },
          onBeforeUnmount: () => {},
          validSiteSlug: () => true,
          useI18n: () => ({
            t: (key: string) =>
              key.endsWith('workspaceSuffix') ? "'s workspace" : key,
          }),
          $fetch: async (
            _url: string,
            options: { body: Record<string, unknown> },
          ) => {
            calls.push(options.body)
            return {
              ...initial,
              name: 'Bob',
              revision: calls.length + 1,
              step: options.body.reconfirmWorkspace ? 2 : 3,
              workspace: options.body.reconfirmWorkspace
                ? null
                : {
                    id: 1,
                    name:
                      options.body.step === 2
                        ? String(options.body.name)
                        : originalName,
                  },
            }
          },
          refreshNuxtData: async () => {},
          navigateTo: () => assert.fail('setup is unfinished'),
        },
        'name,workspace,step,save',
      ),
    )!
    try {
      mounted()
      await nextTick()
      await nextTick()
      vm.step.value = 1
      vm.name.value = 'Bob'
      await nextTick()
      await vm.save()
      if (originalName === "Alice's workspace") {
        assert.equal(calls[0]!.reconfirmWorkspace, true)
        assert.equal(vm.step.value, 2)
        assert.equal(vm.workspace.value, "Bob's workspace")
        await vm.save()
        assert.equal(calls[1]!.name, "Bob's workspace")
        assert.equal(vm.step.value, 3)
      } else {
        assert.equal(calls[0]!.reconfirmWorkspace, false)
        assert.equal(vm.step.value, 3)
        assert.equal(vm.workspace.value, 'Photo Team')
      }
    } finally {
      scope.stop()
    }
  }
})
