import test from 'node:test'
import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import ts from 'typescript'
import {
  PROCESSOR_ACTIONS,
  isProcessorAction,
} from '../packages/contracts/src/processor.ts'
import { createWorkerGateway } from '../apps/worker/src/gateway.ts'
import {
  ProcessorConnectionError,
  processorConnectionDiagnostic,
} from '../apps/worker/src/diagnostics.ts'

async function compile(file: string, deps: Record<string, unknown>) {
  const source = (await readFile(file, 'utf8')).replace(
    /^import[\s\S]*?from ['"][^'"]+['"]\s*\n/gm,
    '',
  )
  const code = ts.transpileModule(source, {
    compilerOptions: {
      module: ts.ModuleKind.CommonJS,
      target: ts.ScriptTarget.ES2022,
    },
  }).outputText
  return new Function(
    'exports',
    ...Object.keys(deps),
    code + ';return exports.default',
  )({}, ...Object.values(deps))
}
test('Cloud boundary admits every processing protocol action while rejecting unknown internal routes', async () => {
  const boundary = await compile(
    'apps/cloud/server/middleware/platform-boundary.ts',
    {
      defineEventHandler: (f: unknown) => f,
      setResponseHeader: () => {},
      getRequestURL: (e: { path: string }) =>
        new URL('https://app.example' + e.path),
      accountRouteAllowed: () => false,
      isProcessorAction,
      createError: (value: { statusCode: number }) =>
        Object.assign(new Error('boundary'), value),
    },
  )
  for (const action of PROCESSOR_ACTIONS)
    await boundary({ path: '/api/internal/worker/' + action, method: 'POST' })
  for (const path of [
    '/api/internal/worker/unknown',
    '/api/internal/worker/register/extra',
    '/api/internal/worker/',
    '/api/internal/other/register',
  ])
    assert.throws(() => boundary({ path, method: 'POST' }), { statusCode: 503 })
})
const secret = 'private-node-secret-'.repeat(3),
  origin = 'https://app.example'
test('HTTP diagnostics expose the action, status and CF ray without reflecting credentials or remote response bodies', async () => {
  for (const status of [400, 401, 403, 404, 429, 500, 503]) {
    const rpc = createWorkerGateway(
      { origin, secret },
      async () =>
        new Response('private-response-' + secret, {
          status,
          headers: { 'cf-ray': 'a53236b7b988c0f4-DFW', 'set-cookie': secret },
        }),
    )
    await assert.rejects(rpc('register', { nonce: 'request' }), (error) => {
      assert(error instanceof ProcessorConnectionError)
      const diagnostic = processorConnectionDiagnostic(error)
      assert.equal(diagnostic.httpStatus, status)
      assert.equal(diagnostic.action, 'register')
      assert.equal(diagnostic.cfRay, 'a53236b7b988c0f4-DFW')
      assert(!JSON.stringify(error).includes(secret))
      assert(!JSON.stringify(diagnostic).includes('private-response'))
      return true
    })
  }
})
test('redirects and HTML Access pages remain diagnosable without forwarding the connection key', async () => {
  let calls = 0
  const redirect = createWorkerGateway(
    { origin, secret },
    async (_input, init) => {
      calls++
      assert.equal(init?.redirect, 'manual')
      return new Response(null, {
        status: 302,
        headers: { location: 'https://login.example/?secret=' + secret },
      })
    },
  )
  await assert.rejects(redirect('register', {}), (error) => {
    assert(error instanceof ProcessorConnectionError)
    assert.equal(error.diagnostic().hint, 'portal_redirect_or_access_login')
    assert.equal(error.httpStatus, 302)
    assert(!JSON.stringify(error).includes(secret))
    return true
  })
  assert.equal(calls, 1)
  const html = createWorkerGateway(
    { origin, secret },
    async () =>
      new Response('<html>' + secret + '</html>', {
        headers: { 'content-type': 'text/html' },
      }),
  )
  await assert.rejects(html('register', {}), (error) => {
    assert(error instanceof ProcessorConnectionError)
    assert.equal(
      error.diagnostic().hint,
      'portal_non_json_response_or_access_login',
    )
    assert(!JSON.stringify(error).includes(secret))
    return true
  })
})
test('nested container network errors are classified without logging URLs, raw messages or headers', async () => {
  const rpc = createWorkerGateway({ origin, secret }, async () => {
    throw new TypeError('https://private.example/' + secret, {
      cause: new AggregateError([
        Object.assign(new Error(secret), { code: 'ENETUNREACH' }),
        Object.assign(new Error(secret), { code: 'ECONNREFUSED' }),
      ]),
    })
  })
  await assert.rejects(rpc('register', {}), (error) => {
    assert(error instanceof ProcessorConnectionError)
    assert.deepEqual(error.networkCodes, ['ENETUNREACH', 'ECONNREFUSED'])
    assert.equal(error.diagnostic().hint, 'container_network_unreachable')
    assert(!JSON.stringify(error).includes(secret))
    assert(!JSON.stringify(error).includes('private.example'))
    return true
  })
})
test('connection retry logs retain safe diagnostics instead of swallowing gateway failures', async () => {
  const source = (await readFile('apps/worker/src/index.ts', 'utf8')).replace(
    /^import[\s\S]*?from ['"][^'"]+['"]\s*\n/gm,
    '',
  )
  const code = ts.transpileModule(source, {
    compilerOptions: {
      module: ts.ModuleKind.CommonJS,
      target: ts.ScriptTarget.ES2022,
    },
  }).outputText
  const handlers: Record<string, () => void> = {},
    logs: string[] = []
  const deps = {
    exports: {},
    os: {
      hostname: () => '',
      cpus: () => [],
      loadavg: () => [0],
      totalmem: () => 0,
      freemem: () => 0,
    },
    process: {
      env: {
        CHRONOFRAME_PROCESSOR_KEY: secret,
        CHRONOFRAME_PORTAL_ORIGIN: origin,
      },
      on: (signal: string, fn: () => void) => {
        handlers[signal] = fn
      },
      memoryUsage: () => ({ rss: 0 }),
    },
    randomUUID: () => crypto.randomUUID(),
    createWorkerGateway: () => async () => {
      throw new ProcessorConnectionError(
        'portal_request_failed',
        'register',
        503,
      )
    },
    openProcessorConfiguration: () => {
      throw Error('not reached')
    },
    ProcessorConnectionError,
    processorConnectionDiagnostic,
    delay: async () => {},
    console: {
      log: (raw: string) => {
        logs.push(raw)
        handlers.SIGTERM!()
      },
    },
  }
  await new Function(
    ...Object.keys(deps),
    'return (async()=>{' + code + '})()',
  )(...Object.values(deps))
  assert.equal(logs.length, 1)
  const event = JSON.parse(logs[0]!)
  assert.equal(event.event, 'worker.connection_retry')
  assert.equal(event.action, 'register')
  assert.equal(event.httpStatus, 503)
  assert.equal(event.hint, 'portal_unavailable')
  assert(!logs[0]!.includes(secret))
})
