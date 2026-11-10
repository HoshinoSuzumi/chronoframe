import assert from 'node:assert/strict'
import test from 'node:test'
import { readFileSync } from 'node:fs'
import ts from 'typescript'
import { accountRouteAllowed } from '../apps/cloud/server/utils/account-routes.ts'
import { isProcessorAction } from '@chronoframe/contracts/processor'

test('Cloud boundary exposes setup and trial endpoints while keeping self-hosted and unknown APIs closed', () => {
  const source = readFileSync(
    'apps/cloud/server/middleware/platform-boundary.ts',
    'utf8',
  ).replace(/^import[^\n]*\n/gm, '')
  const code = ts.transpileModule(source, {
    compilerOptions: {
      module: ts.ModuleKind.CommonJS,
      target: ts.ScriptTarget.ES2022,
    },
  }).outputText
  const handler = new Function(
    'exports',
    'isProcessorAction',
    'accountRouteAllowed',
    'defineEventHandler',
    'setResponseHeader',
    'getRequestURL',
    'createError',
    code + ';return exports.default',
  )(
    {},
    isProcessorAction,
    accountRouteAllowed,
    (handler: unknown) => handler,
    () => {},
    (event: { path: string }) =>
      new URL(event.path, 'https://app.example.test'),
    (value: unknown) => value,
  )
  for (const path of ['/api/onboarding', '/api/billing/trial'])
    for (const method of ['GET', 'POST'])
      assert.doesNotThrow(() => handler({ path, method }))
  for (const method of ['GET', 'PATCH'])
    assert.doesNotThrow(() =>
      handler({ path: '/api/workspaces/1/settings', method }),
    )
  for (const path of [
    '/api/_auth/session',
    '/api/onboarding/admin',
    '/api/billing/trial/other',
    '/api/wizard/submit',
    '/api/workspaces/1/members',
    '/api/workspaces/1/settings/roles',
    '/api/workspaces/01/settings',
  ])
    assert.throws(
      () => handler({ path, method: 'POST' }),
      (error: unknown) =>
        typeof error === 'object' &&
        error !== null &&
        'statusCode' in error &&
        error.statusCode === 503,
    )
})
