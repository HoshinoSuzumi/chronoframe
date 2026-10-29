import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { createRequire } from 'node:module'
import test from 'node:test'
import vm from 'node:vm'
import ts from 'typescript'
import { z } from 'zod'

const require = createRequire(import.meta.url)

function wizardPayload(
  site: Record<string, unknown> = {
    title: 'Example gallery',
    slogan: 'Example slogan',
    avatarUrl: 'https://example.com/avatar.jpg',
    author: 'Example author',
    homeView: 'albums',
    'appearance.theme': 'dark',
    'appearance.homeHeaderLayout': 'fixed',
  },
) {
  return {
    admin: {
      email: 'admin@example.com',
      password: 'secret1',
      username: 'admin',
    },
    site,
    storage: {
      name: 'Default storage',
      config: { provider: 'local' },
    },
    map: { provider: 'maplibre', token: '' },
  }
}

function loadWizardRoute(
  payload: unknown,
  file = 'apps/self-hosted/server/api/wizard/submit.post.ts',
) {
  const settingWrites: Array<[string, string, unknown]> = []
  const existingAdmin = {
    id: 1,
    email: 'admin@example.com',
    username: 'admin',
    isAdmin: 1,
  }
  const db = {
    select: () => ({
      from: () => ({
        limit: () => ({ get: () => existingAdmin }),
        where: () => ({ get: () => existingAdmin }),
      }),
    }),
    update: () => ({
      set: () => ({
        where: () => ({ run: async () => undefined }),
      }),
    }),
  }
  function loadTypeScriptModule(file: string) {
    const code = ts.transpileModule(readFileSync(file, 'utf8'), {
      compilerOptions: {
        module: ts.ModuleKind.CommonJS,
        target: ts.ScriptTarget.ES2022,
        esModuleInterop: true,
      },
    }).outputText
    const exports: Record<string, unknown> = {}

    vm.runInNewContext(
      code,
      {
        exports,
        require: mockedRequire,
        readValidatedBody: async (
          _event: unknown,
          parse: (value: unknown) => unknown,
        ) => parse(payload),
        hashPassword: async () => 'hashed-password',
        setUserSession: async () => undefined,
        createError: (options: object) =>
          Object.assign(new Error('HTTP error'), options),
      },
      { filename: file },
    )

    return exports
  }

  function mockedRequire(name: string) {
    if (name === '~~/server/utils/dto')
      return { toUserSummary: (user: unknown) => user }
    if (name === '../../utils/wizard-handler')
      return { defineWizardHandler: (handler: unknown) => handler }
    if (name === '~~/server/services/settings/settingsManager') {
      return {
        settingsManager: {
          set: async (namespace: string, key: string, value: unknown) => {
            settingWrites.push([namespace, key, value])
          },
          storage: { addProvider: async () => 1 },
        },
      }
    }
    if (name === '~~/server/services/wizard/site-settings') {
      return loadTypeScriptModule(
        'apps/self-hosted/server/services/wizard/site-settings.ts',
      )
    }
    if (name === '../settings/settingsManager')
      return mockedRequire('~~/server/services/settings/settingsManager')
    if (name === '#shared/types/storage') {
      return {
        storageConfigSchema: z.object({ provider: z.literal('local') }),
      }
    }
    if (name === '~~/server/utils/db') {
      return {
        useDB: () => db,
        tables: { users: { id: 'id', email: 'email' } },
        eq: () => ({}),
      }
    }
    return require(name)
  }

  const exports = loadTypeScriptModule(file)

  return {
    route: exports.default as (event: unknown) => Promise<unknown>,
    settingWrites,
  }
}

test('wizard submit persists non-default Site Info preferences', async () => {
  const { route, settingWrites } = loadWizardRoute(wizardPayload())

  await route({})

  assert.deepEqual(
    settingWrites.filter(([namespace]) => namespace === 'app'),
    [
      ['app', 'title', 'Example gallery'],
      ['app', 'slogan', 'Example slogan'],
      ['app', 'avatarUrl', 'https://example.com/avatar.jpg'],
      ['app', 'author', 'Example author'],
      ['app', 'homeView', 'albums'],
      ['app', 'appearance.theme', 'dark'],
      ['app', 'appearance.homeHeaderLayout', 'fixed'],
    ],
  )
})

test('wizard submit rejects unsupported Site Info preferences before writing settings', async () => {
  const { route, settingWrites } = loadWizardRoute(
    wizardPayload({
      title: 'Example gallery',
      homeView: 'timeline',
      'appearance.theme': 'neon',
      'appearance.homeHeaderLayout': 'floating',
    }),
  )

  await assert.rejects(route({}))
  assert.deepEqual(settingWrites, [])
})

test('wizard Site Info endpoint shares preference persistence behavior', async () => {
  const { route, settingWrites } = loadWizardRoute(
    {
      title: 'Example gallery',
      homeView: 'albums',
      'appearance.theme': 'dark',
      'appearance.homeHeaderLayout': 'fixed',
    },
    'apps/self-hosted/server/api/wizard/site.post.ts',
  )

  await route({})

  assert.deepEqual(settingWrites, [
    ['app', 'title', 'Example gallery'],
    ['app', 'homeView', 'albums'],
    ['app', 'appearance.theme', 'dark'],
    ['app', 'appearance.homeHeaderLayout', 'fixed'],
  ])
})
