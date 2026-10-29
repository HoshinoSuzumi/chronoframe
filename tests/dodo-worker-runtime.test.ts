import assert from 'node:assert/strict'
import test from 'node:test'
import { createRequire } from 'node:module'
import { fileURLToPath } from 'node:url'
const require = createRequire(import.meta.url),
  wrangler = createRequire(require.resolve('wrangler/package.json'))
const { Miniflare, convertV4MiniflareOptions } = wrangler('miniflare'),
  { build } = wrangler('esbuild')
test('Dodo official SDK executes in workerd and blocks redirects without forwarding authorization', async () => {
  const module = fileURLToPath(
      new URL('../packages/platform/src/dodo-client.ts', import.meta.url),
    ),
    secrets = fileURLToPath(
      new URL('../packages/platform/src/payment-providers.ts', import.meta.url),
    )
  const bundle = await build({
    stdin: {
      resolveDir: process.cwd(),
      contents: `
 import {dodoClient,dodoRequest} from ${JSON.stringify(module)};
 import {sealProviderCredentials} from ${JSON.stringify(secrets)};
 export default {async fetch(request){
  const root='worker-local-root-key-'.repeat(3);
  const envelope=await sealProviderCredentials(root,'worker_test','test',{apiKey:'worker-fixture-key',webhookSecret:'whsec_fixture'});
  const db={prepare(sql){return {bind(){return this},async first(){return sql.startsWith('SELECT p.*')?{id:'worker_test',environment:'test',revision:1,credentials_ciphertext:envelope}:{revision:1}}}}};
  const path=new URL(request.url).pathname;
  const transport=path==='/disabled'?async()=>{throw new (await import(${JSON.stringify(fileURLToPath(new URL('../packages/platform/src/subscriptions.ts', import.meta.url)))})).SubscriptionError(503,'payment_unavailable')}:fetch;
  const {client}=await dodoClient(db,root,'test',transport);
  try {
   const product=await dodoRequest(()=>client.products.create({name:path==='/redirect'?'redirect':'normal',tax_category:'saas',price:{type:'recurring_price',price:1200,currency:'USD',discount:0,discount_bps:0,payment_frequency_count:1,payment_frequency_interval:'Month',subscription_period_count:20,subscription_period_interval:'Year'}}));
   return Response.json({id:product.product_id});
  }catch(error){return Response.json({code:error.code},{status:error.statusCode??500})}
 }}`,
    },
    bundle: true,
    write: false,
    platform: 'browser',
    format: 'esm',
    target: 'es2022',
  })
  const requests: any[] = []
  const mf = new Miniflare(
    convertV4MiniflareOptions({
      modules: true,
      compatibilityDate: '2026-10-26',
      script: bundle.outputFiles[0].text,
      outboundService: async (request: Request) => {
        assert.equal(
          new URL(request.url).origin,
          'https://test.dodopayments.com',
        )
        assert.equal(
          request.headers.get('authorization'),
          'Bearer worker-fixture-key',
        )
        const body = (await request.json()) as any
        requests.push({ url: request.url, body })
        if (body.name === 'redirect')
          return new Response(null, {
            status: 302,
            headers: { location: 'https://untrusted.example/collect' },
          })
        return Response.json({ product_id: 'pdt_worker_fixture', ...body })
      },
    }),
  )
  try {
    const normal = await mf.dispatchFetch('https://worker.example/normal')
    assert.equal(normal.status, 200)
    assert.deepEqual(await normal.json(), { id: 'pdt_worker_fixture' })
    assert.equal(requests.length, 1)
    assert.equal(requests[0].body.price.discount_bps, 0)
    const redirected = await mf.dispatchFetch('https://worker.example/redirect')
    assert.equal(redirected.status, 502)
    assert.deepEqual(await redirected.json(), {
      code: 'payment_provider_redirect_blocked',
    })
    assert.equal(requests.length, 2)
    const disabled = await mf.dispatchFetch('https://worker.example/disabled')
    assert.equal(disabled.status, 503)
    assert.deepEqual(await disabled.json(), { code: 'payment_unavailable' })
    assert.equal(requests.length, 2)
  } finally {
    await mf.dispose()
  }
})
