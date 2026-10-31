import test from 'node:test'
import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import ts from 'typescript'
import { processorEnvironment } from '../scripts/processor-environment.mjs'
import {
  processorCipher,
  DEFAULT_PROCESSOR_LIMITS,
  DEFAULT_PROCESSOR_GEOCODING,
  type ProcessorEnvelope,
} from '../packages/contracts/src/processor.ts'
import { openProcessorConfiguration } from '../apps/worker/src/configuration.ts'
import { WorkerProcessingError } from '../apps/worker/src/process.ts'
import { processingGeocoder } from '../apps/worker/src/geocoding.ts'
import { createGeocodingServices } from '../packages/geocoding/src/index.ts'
const nodeId = '11111111-1111-4111-8111-111111111111',
  key = `pn_${nodeId}.${'a'.repeat(43)}`

test('configuration uses authenticated server time and request nonce without widening its six-minute window', async () => {
  const nonce = crypto.randomUUID(),
    issuedAt = 1800000000000,
    expiresAt = issuedAt + 300000,
    revision = '1:1'
  const config = {
    limits: DEFAULT_PROCESSOR_LIMITS,
    geocoding: DEFAULT_PROCESSOR_GEOCODING,
  }
  const value: ProcessorEnvelope = {
    nodeId,
    issuedAt,
    expiresAt,
    revision,
    nonce,
    envelope: await (
      await processorCipher(key)
    ).seal(config, `${nodeId}:${revision}:${issuedAt}:${expiresAt}:${nonce}`),
  }
  const now = Date.now
  try {
    for (const skew of [-86400000, 86400000]) {
      Date.now = () => issuedAt + skew
      assert.deepEqual(
        await openProcessorConfiguration(key, value, nonce, 100),
        config,
      )
    }
  } finally {
    Date.now = now
  }
  await assert.rejects(
    openProcessorConfiguration(key, value, crypto.randomUUID(), 10),
  )
  await assert.rejects(openProcessorConfiguration(key, value, nonce, 300001))
  await assert.rejects(
    openProcessorConfiguration(
      key,
      { ...value, expiresAt: issuedAt + 360001 },
      nonce,
      1,
    ),
  )
  await assert.rejects(
    openProcessorConfiguration(
      key,
      { ...value, issuedAt: issuedAt + 1 },
      nonce,
      1,
    ),
  )
})

test('a bad post-claim configuration promptly fails the claimed attempt instead of leaking its lease', async () => {
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
  const handlers: Record<string, () => void> = {}
  type FailBody = { lease: typeof lease; code: string; retryable: boolean }
  const failures: FailBody[] = []
  let opened = 0,
    processed = false
  const lease = { id: 'job', siteId: 1, workerId: nodeId, attemptId: 'attempt' }
  const rpc = async (action: string, body: Record<string, unknown>) => {
    if (action === 'register') return {}
    if (action === 'claim') return { lease, configuration: {} }
    if (action === 'fail') {
      assert.deepEqual(body.lease, lease)
      assert.equal(typeof body.code, 'string')
      assert.equal(typeof body.retryable, 'boolean')
      failures.push({
        lease,
        code: String(body.code),
        retryable: body.retryable === true,
      })
      handlers.SIGTERM!()
      return { ok: true }
    }
    throw new Error('Unexpected action ' + action)
  }
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
        CHRONOFRAME_PROCESSOR_KEY: key,
        CHRONOFRAME_PORTAL_ORIGIN: 'https://app.example',
      },
      on: (signal: string, fn: () => void) => {
        handlers[signal] = fn
      },
      memoryUsage: () => ({ rss: 0 }),
    },
    randomUUID: () => crypto.randomUUID(),
    createWorkerGateway: () => rpc,
    openProcessorConfiguration: async () => {
      if (++opened > 1) throw Error('invalid_configuration')
      return {
        limits: DEFAULT_PROCESSOR_LIMITS,
        geocoding: DEFAULT_PROCESSOR_GEOCODING,
      }
    },
    WorkerProcessingError,
    processWork: async () => {
      processed = true
    },
    delay: async () => {},
    setInterval: () => 1,
    clearInterval: () => {},
    setTimeout: () => 1,
    clearTimeout: () => {},
    console: { log: () => {} },
  }
  await new Function(
    ...Object.keys(deps),
    'return (async()=>{' + code + '})()',
  )(...Object.values(deps))
  assert.equal(processed, false)
  assert.equal(failures.length, 1)
  assert.deepEqual(failures[0].lease, lease)
  assert.equal(failures[0].code, 'configuration_invalid')
  assert.equal(failures[0].retryable, true)
})

test('provider empty results stay successful nulls while transport failures can propagate to processing queues', async () => {
  const logger = { info() {}, warn() {}, error() {}, success() {} }
  for (const provider of ['mapbox', 'nominatim'] as const) {
    const originalFetch = globalThis.fetch
    try {
      globalThis.fetch = async () =>
        new Response(
          JSON.stringify(
            provider === 'mapbox'
              ? { features: [] }
              : { error: 'Unable to geocode' },
          ),
        )
      const processor = processingGeocoder(
        { ...DEFAULT_PROCESSOR_GEOCODING, provider, token: 'provider-token' },
        new AbortController().signal,
        async () => {},
      )
      assert.equal(await processor.reverseGeocode(31, 121), null)
    } finally {
      globalThis.fetch = originalFetch
    }
    for (const throwOnError of [false, true]) {
      const services = createGeocodingServices({
        throwOnError,
        getLanguage: async () => 'en',
        request: async () => {
          throw Error('network unavailable')
        },
        waitForGeocodingSlot: async () => {},
        withRetry: async (op) => op(new AbortController().signal),
        retryOptions: { maxAttempts: 1 },
        logger,
      })
      const service =
        provider === 'mapbox'
          ? new services.MapboxGeocodingProvider('credential')
          : new services.NominatimGeocodingProvider()
      if (throwOnError)
        await assert.rejects(
          service.reverseGeocode(31, 121),
          /network unavailable/,
        )
      else assert.equal(await service.reverseGeocode(31, 121), null)
    }
  }
})

test('rerunning media setup retains its registered key and optional Access credentials', () => {
  const existing = `CHRONOFRAME_PORTAL_ORIGIN=https://old.example\nCHRONOFRAME_PROCESSOR_KEY=${key}\nCHRONOFRAME_ACCESS_CLIENT_SECRET=private-access-example\n`
  for (const supplied of [undefined, '', '""', "''", '  ""  ', "  ''  "]) {
    const result = processorEnvironment(
      'https://new.example',
      supplied,
      existing,
    )
    assert(result.includes('CHRONOFRAME_PROCESSOR_KEY=' + key))
    assert(
      result.includes(
        'CHRONOFRAME_ACCESS_CLIENT_SECRET=private-access-example',
      ),
    )
    assert(result.includes('CHRONOFRAME_PORTAL_ORIGIN=https://new.example'))
  }
  const replacement = `pn_${nodeId}.${'b'.repeat(43)}`
  const rotated = processorEnvironment(
    'https://new.example',
    replacement,
    existing,
  )
  assert(rotated.includes(replacement))
  assert(!rotated.includes(key))
  assert.throws(() =>
    processorEnvironment(
      'https://new.example',
      'bad\nINJECTED=value',
      existing,
    ),
  )
})

test('spaced Compose assignments are normalized and the last stored key survives rotation or setup', () => {
  const second = `pn_${nodeId}.${'b'.repeat(43)}`
  const existing = `CHRONOFRAME_PROCESSOR_KEY=${key}\r\n  CHRONOFRAME_PROCESSOR_KEY \t = "${second}"\r\n CHRONOFRAME_PORTAL_ORIGIN = https://old.example\r\nCHRONOFRAME_ACCESS_CLIENT_SECRET=keep-me\r\n`
  const preserved = processorEnvironment(
    'https://new.example',
    undefined,
    existing,
  )
  assert(preserved.includes('CHRONOFRAME_PROCESSOR_KEY=' + second))
  const rotated = processorEnvironment('https://new.example', key, existing)
  assert.equal(
    rotated
      .split('\n')
      .filter((line) => /^[\t ]*CHRONOFRAME_PROCESSOR_KEY[\t ]*=/.test(line))
      .length,
    1,
  )
  assert.equal(
    rotated
      .split('\n')
      .filter((line) => /^[\t ]*CHRONOFRAME_PORTAL_ORIGIN[\t ]*=/.test(line))
      .length,
    1,
  )
  assert(rotated.includes('CHRONOFRAME_PROCESSOR_KEY=' + key))
  assert(!rotated.includes(second))
  assert(rotated.includes('CHRONOFRAME_ACCESS_CLIENT_SECRET=keep-me'))
})

test('batch processing reports conflicts but propagates unexpected queue failures', async () => {
  const source = (
    await readFile(
      'apps/cloud/server/api/sites/[siteId]/media/[...operation].ts',
      'utf8',
    )
  ).replace(/^import[\s\S]*?from ['"][^'"]+['"]\s*\n/gm, '')
  const code = ts.transpileModule(source, {
    compilerOptions: {
      module: ts.ModuleKind.CommonJS,
      target: ts.ScriptTarget.ES2022,
    },
  }).outputText
  let queueError: Error = Object.assign(new Error('Already queued'), {
    statusCode: 409,
  })
  const statement = {
      bind: () => statement,
      all: async () => ({ results: [{ id: 'photo', revision: 1 }] }),
    },
    db = { prepare: () => statement }
  const deps = {
    exports: {},
    definePlatformHandler: (f: any) => f,
    cloudMedia: async () => ({
      siteId: 1,
      userId: 1,
      site: { workspaceId: 1 },
      db,
      raw: db,
    }),
    getRouterParam: () => 'photos/process-batch',
    siteManagementBody: async (e: any) => e.body,
    queuePhotoProcessing: async () => {
      throw queueError
    },
    createError: (v: any) => Object.assign(new Error(v.statusMessage), v),
  }
  const api = new Function(
    ...Object.keys(deps),
    code + ';return exports.default',
  )(...Object.values(deps))
  const event = {
    method: 'POST',
    body: { photoIds: ['photo'], operation: 'reindex' },
  }
  await assert.rejects(
    api(event),
    (e: any) => e.statusCode === 409 && e.data.results[0].queued === false,
  )
  queueError = new Error('Database unavailable')
  await assert.rejects(api(event), (e: any) => e === queueError)
  queueError = Object.assign(new Error('Unexpected failure'), {
    statusCode: 500,
  })
  await assert.rejects(api(event), (e: any) => e === queueError)
})
