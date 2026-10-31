import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import vm from 'node:vm'
import ts from 'typescript'
import { ref } from 'vue'
function load(file: string, deps: Record<string, unknown>) {
  const source = readFileSync(file, 'utf8').replace(
    /^import[\s\S]*?from ['"][^'"]+['"]\s*\n/gm,
    '',
  )
  const code = ts.transpileModule(source, {
    compilerOptions: {
      module: ts.ModuleKind.CommonJS,
      target: ts.ScriptTarget.ES2022,
    },
  }).outputText
  const exports: Record<string, any> = {}
  vm.runInNewContext(code, { exports, ...deps })
  return exports
}
test('marketing login status is boolean-only and credentialed CORS is restricted to the canonical website', async () => {
  let portalOrigin = 'https://app.chronoframe.art',
    authenticated = true,
    reads = 0
  const api = load('apps/cloud/server/api/auth/marketing-session.get.ts', {
    definePlatformHandler: (handler: unknown) => handler,
    useRuntimeConfig: () => ({
      platform: { portalOrigin, secret: 'unused-test-secret' },
    }),
    platformPortalOrigin: (event: { target: string }, expected: string) => {
      if (event.target !== expected) throw { statusCode: 403 }
    },
    getHeader: (event: { origin?: string }) => event.origin,
    createError: (value: { statusCode: number }) => value,
    setResponseHeaders: (event: { headers: unknown }, headers: unknown) => {
      event.headers = headers
    },
    platformSession: async () => {
      reads++
      return authenticated
        ? { userId: 42, email: 'never-return@example.com', expiresAt: 1 }
        : null
    },
  }).default
  const event = {
    target: portalOrigin,
    origin: 'https://chronoframe.art',
    headers: {} as Record<string, string>,
  }
  assert.equal(JSON.stringify(await api(event)), '{"authenticated":true}')
  assert.equal(
    event.headers['access-control-allow-origin'],
    'https://chronoframe.art',
  )
  assert.equal(event.headers['access-control-allow-credentials'], 'true')
  assert.equal(event.headers['cache-control'], 'private, no-store')
  assert.equal(event.headers.vary, 'Origin, Cookie')
  authenticated = false
  assert.equal(JSON.stringify(await api(event)), '{"authenticated":false}')
  const previous = reads
  for (const origin of [
    'https://evil.chronoframe.art',
    'https://chronoframe.art.evil.test',
    'null',
    'http://chronoframe.art',
  ])
    await assert.rejects(api({ target: portalOrigin, origin }), {
      statusCode: 403,
    })
  await assert.rejects(
    api({
      target: 'https://chronoframe.art',
      origin: 'https://chronoframe.art',
    }),
    { statusCode: 403 },
  )
  portalOrigin = 'https://preview.example'
  await assert.rejects(
    api({ target: portalOrigin, origin: 'https://chronoframe.art' }),
    { statusCode: 403 },
  )
  assert.equal(reads, previous)
  assert.equal(
    JSON.stringify(await api({ target: portalOrigin, origin: portalOrigin })),
    '{"authenticated":false}',
  )
  const boundary = load('apps/cloud/server/middleware/platform-boundary.ts', {
    defineEventHandler: (handler: unknown) => handler,
    setResponseHeader: () => {},
    getRequestURL: () =>
      new URL('https://app.chronoframe.art/api/auth/marketing-session'),
    isProcessorAction: () => false,
    accountRouteAllowed: () => false,
    createError: (value: unknown) => value,
  }).default
  assert.doesNotThrow(() => boundary({ method: 'GET' }))
})
test('marketing session refreshes on return, ignores stale responses and cleans up listeners', async () => {
  const window = new EventTarget()
  const document = Object.assign(new EventTarget(), {
    visibilityState: 'visible',
  })
  let mount!: () => void, unmount!: () => void
  const requests: {
    url: string
    options: { credentials: string; cache: string; signal: AbortSignal }
    resolve: (value: unknown) => void
    reject: (reason: unknown) => void
  }[] = []
  const module = load(
    'apps/cloud/app/composables/useCloudMarketingSession.ts',
    {
      ref,
      AbortController,
      setTimeout,
      clearTimeout,
      window,
      document,
      useCloudLinks: () => ({
        marketingSession:
          'https://app.chronoframe.art/api/auth/marketing-session',
      }),
      onMounted: (callback: () => void) => {
        mount = callback
      },
      onBeforeUnmount: (callback: () => void) => {
        unmount = callback
      },
      $fetch: (url: string, options: (typeof requests)[number]['options']) =>
        new Promise((resolve, reject) => {
          requests.push({ url, options, resolve, reject })
        }),
    },
  )
  const state = module.useCloudMarketingSession()
  assert.equal(requests.length, 0) // No cross-origin SSR credential forwarding.
  mount()
  assert.equal(requests[0]?.options.credentials, 'include')
  assert.equal(requests[0]?.options.cache, 'no-store')
  requests[0]!.resolve({ authenticated: true })
  await new Promise((resolve) => setImmediate(resolve))
  assert.equal(state.authenticated.value, true)
  window.dispatchEvent(new Event('focus'))
  requests[1]!.resolve({ authenticated: false })
  await new Promise((resolve) => setImmediate(resolve))
  assert.equal(state.authenticated.value, false)
  document.visibilityState = 'hidden'
  document.dispatchEvent(new Event('visibilitychange'))
  assert.equal(requests.length, 2)
  document.visibilityState = 'visible'
  document.dispatchEvent(new Event('visibilitychange'))
  window.dispatchEvent(new Event('pageshow'))
  assert.equal(requests[2]?.options.signal.aborted, true)
  requests[3]!.resolve({ authenticated: true })
  await new Promise((resolve) => setImmediate(resolve))
  requests[2]!.resolve({ authenticated: false })
  await new Promise((resolve) => setImmediate(resolve))
  assert.equal(state.authenticated.value, true)
  window.dispatchEvent(new Event('focus'))
  requests[4]!.reject(Error('network unavailable'))
  await new Promise((resolve) => setImmediate(resolve))
  assert.equal(state.authenticated.value, false)
  unmount()
  window.dispatchEvent(new Event('focus'))
  document.dispatchEvent(new Event('visibilitychange'))
  assert.equal(requests.length, 5)
})

test('desktop and mobile marketing navigation reflect login presence and point at the portal console', async () => {
  const vue = await import('vue')
  const { parse, compileScript } = await import('vue/compiler-sfc')
  const { renderToString } = await import('vue/server-renderer')
  const passthrough = (
    _props: unknown,
    context: { slots: { default?: () => unknown } },
  ) => vue.h('div', context.slots.default?.())
  const icon = () => vue.h('span')
  const filename = 'apps/cloud/app/components/CloudMarketingHeader.vue'
  const { descriptor } = parse(readFileSync(filename, 'utf8'), { filename })
  const source = compileScript(descriptor, {
    id: 'marketing-header',
    inlineTemplate: true,
  }).content
  const code = ts.transpileModule(source, {
    compilerOptions: {
      module: ts.ModuleKind.CommonJS,
      target: ts.ScriptTarget.ES2022,
    },
  }).outputText
  for (const authenticated of [true, false]) {
    const exports: Record<string, any> = {}
    vm.runInNewContext(code, {
      exports,
      ref,
      useRoute: () => ({ path: '/' }),
      useCloudMarketingSession: () => ({ authenticated: ref(authenticated) }),
      useCloudLinks: () => ({
        console: 'https://app.chronoframe.art/workspace',
        signin: 'https://app.chronoframe.art/signin',
        signup: 'https://app.chronoframe.art/signup',
      }),
      require: (name: string) =>
        name === 'vue'
          ? vue
          : name === 'lucide-vue-next'
            ? { ArrowUpRight: icon, ArrowRight: icon, Menu: icon }
            : {
                PopoverRoot: passthrough,
                PopoverContent: passthrough,
                PopoverTrigger: passthrough,
              },
    })
    const app = vue.createSSRApp(exports.default)
    app.config.globalProperties.$t = (key: string) =>
      key === 'cloud.messages.visitConsole' ? '访问控制台' : key
    app.component('CloudBrand', icon)
    app.component('CloudThemeToggle', icon)
    app.component('CfButton', passthrough)
    app.component('NuxtLink', {
      props: ['to'],
      setup:
        (
          props: { to: string },
          context: { slots: { default?: () => unknown } },
        ) =>
        () =>
          vue.h('a', { href: props.to }, context.slots.default?.()),
    })
    const html = await renderToString(app)
    if (authenticated) {
      assert.equal((html.match(/访问控制台/g) ?? []).length, 3)
      assert.equal(
        (html.match(/href="https:\/\/app.chronoframe.art\/workspace"/g) ?? [])
          .length,
        3,
      )
      assert(!html.includes('/signup') && !html.includes('/signin'))
    } else {
      assert(!html.includes('访问控制台'))
      assert(html.includes('href="https://app.chronoframe.art/signup"'))
      assert(html.includes('href="https://app.chronoframe.art/signin"'))
    }
  }
})
