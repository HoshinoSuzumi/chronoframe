import assert from 'node:assert/strict'
import test from 'node:test'
import { createWorkerGateway } from '../apps/worker/src/gateway.ts'

const origin = 'https://staging.portal.example'
const secret = 'fake-worker-credential-'.repeat(3)
test('Worker gateway scopes optional Access credentials to fixed portal actions and forbids redirects', async () => {
  const requests: Request[] = []
  const transport = (async (input, init) => {
    requests.push(new Request(input, init))
    return Response.json({ ok: true })
  }) as typeof fetch
  const rpc = createWorkerGateway(
    {
      origin,
      secret,
      accessClientId: 'test-client.access',
      accessClientSecret: 'test-access-secret',
    },
    transport,
  )
  const controller = new AbortController()
  for (const action of [
    'claim',
    'heartbeat',
    'grant',
    'complete',
    'fail',
    'cleanup',
  ] as const)
    assert.deepEqual(await rpc(action, { test: true }, controller.signal), {
      ok: true,
    })
  for (const request of requests) {
    assert.equal(new URL(request.url).origin, origin)
    assert.equal(request.method, 'POST')
    assert.equal(request.redirect, 'error')
    assert.equal(request.headers.get('authorization'), 'Bearer ' + secret)
    assert.equal(
      request.headers.get('cf-access-client-id'),
      'test-client.access',
    )
    assert.equal(
      request.headers.get('cf-access-client-secret'),
      'test-access-secret',
    )
    assert.deepEqual(await request.json(), { test: true })
  }
  await assert.rejects(
    rpc('https://storage.example/key' as any, {}),
    /Invalid worker gateway action/,
  )
  assert.equal(
    requests.length,
    6,
    'an invalid action cannot move credentials to another destination',
  )
  const ordinary = createWorkerGateway({ origin, secret }, transport)
  await ordinary('claim', {})
  assert.equal(requests.at(-1)!.headers.has('cf-access-client-secret'), false)
})
test('Gateway rejects incomplete or unsafe credentials and reports fixed transport errors without reflection', async () => {
  for (const config of [
    { origin: 'http://portal.example', secret },
    { origin: 'https://user:password@portal.example', secret },
    { origin, secret: 'short' },
    { origin, secret, accessClientId: 'client' },
    { origin, secret, accessClientSecret: 'only-secret' },
    {
      origin,
      secret,
      accessClientId: 'client',
      accessClientSecret: 'bad\nheader',
    },
  ])
    assert.throws(() => createWorkerGateway(config))
  const denied = createWorkerGateway(
    { origin, secret },
    (async () =>
      new Response('private provider detail', { status: 403 })) as typeof fetch,
  )
  await assert.rejects(denied('claim', {}), {
    message: 'portal_request_failed',
  })
  const accessLogin = createWorkerGateway(
    { origin, secret },
    (async () => new Response('<html>Access login</html>')) as typeof fetch,
  )
  await assert.rejects(accessLogin('claim', {}), {
    message: 'portal_response_invalid',
  })
})
