import { splitSqlQuery } from './helpers/sql.ts'
import assert from 'node:assert/strict'
import test from 'node:test'
import { readFile, readdir } from 'node:fs/promises'
import { createRequire } from 'node:module'
import {
  createD1Provisioning,
  createD1Directory,
  createD1SiteCatalog,
} from '../packages/platform/src/index.ts'
import {
  createDomainManager,
  DomainError,
  renameDefaultDomain,
  DOMAIN_HEALTH_TTL,
} from '../packages/platform/src/domains.ts'
import type { DomainProvider } from '../packages/platform/src/domains.ts'
import {
  normalizeDomain,
  validSiteSlug,
  domainClaimTarget,
} from '../packages/contracts/src/domains.ts'
import {
  checkDomainCname,
  createDomainProvider,
} from '../apps/shared/platform/domain-provider.ts'
const require = createRequire(import.meta.url),
  { Miniflare, convertV4MiniflareOptions } = createRequire(
    require.resolve('wrangler/package.json'),
  )('miniflare')

test('Domain input accepts IDN hostnames but rejects URLs, IPs and reserved platform addresses', () => {
  assert.equal(normalizeDomain(' Photos.Example.COM. '), 'photos.example.com')
  assert.equal(normalizeDomain('相册.example.com'), 'xn--26q252g.example.com')
  for (const v of [
    'https://example.com',
    'example.com:443',
    'foo@example.com',
    '*.example.com',
    'example.com/path',
    '127.0.0.1',
    '2130706433',
    'bad..example',
    'x\\evil.com',
    'example.com?x',
    'a'.repeat(64) + '.com',
  ])
    assert.throws(() => normalizeDomain(v), v)
  for (const v of [
    'app',
    'docs',
    'cname',
    'site',
    'api',
    'staging',
    'mail',
    'noreply',
    'smtp',
    'dev',
    'www',
  ])
    assert.equal(validSiteSlug(v), false, v)
  assert.equal(validSiteSlug('timo'), true)
})

test('Real D1 custom domains fence claims, CNAME ownership transitions, provider retries, primary and removal', async () => {
  const mf = new Miniflare(
    convertV4MiniflareOptions({
      modules: true,
      script: 'export default {fetch(){return new Response("test")}}',
      compatibilityDate: '2026-10-22',
      d1Databases: ['DB'],
    }),
  )
  try {
    const db = await mf.getD1Database('DB')
    for (const file of (await readdir('packages/platform/migrations'))
      .filter((f) => f.endsWith('.sql'))
      .sort()) {
      const sql = await readFile('packages/platform/migrations/' + file, 'utf8')
      for (const q of splitSqlQuery(sql.replace(/^--.*$/gm, ''))
        .map((s) => s.trim())
        .filter(Boolean))
        await db.prepare(q).run()
    }
    let time = Date.now(),
      sequence = 0
    await db
      .prepare(
        'INSERT INTO platform_users(id,email,name,email_verified,created_at,updated_at) VALUES(1,?,?,1,?,?),(2,?,?,1,?,?)',
      )
      .bind(
        'one@example.com',
        'One',
        time,
        time,
        'two@example.com',
        'Two',
        time,
        time,
      )
      .run()
    await db
      .prepare(
        `UPDATE platform_plans SET policy_json=json_set(policy_json,'$.limits.sites',10,'$.limits.customDomains',4,'$.limits.byos',1) WHERE id='free'`,
      )
      .run()
    const sites = createD1Provisioning(db)
    const one = await sites.create(1, {
      name: 'One',
      slug: 'timo',
      requestId: '00000000-0000-4000-8000-000000000001',
    })
    const two = await sites.create(2, {
      name: 'Two',
      slug: 'other',
      requestId: '00000000-0000-4000-8000-000000000002',
    })
    await db.prepare('UPDATE platform_sites SET published=1').run()
    const hosts = new Map<
        string,
        { id: string; status: string; ssl: string }
      >(),
      routes = new Map<string, { id: string; owned: boolean }>(),
      dns = new Map<string, string>()
    let creates = 0,
      routeCreates = 0,
      loseCreate = false,
      failDelete = false
    const nextId = () => (++sequence).toString(16).padStart(32, '0')
    const provider: DomainProvider = {
      count: async () => hosts.size,
      find: async (h) => hosts.get(h) ?? null,
      get: async (id) => [...hosts.values()].find((x) => x.id === id) ?? null,
      async create(h) {
        creates++
        const value = { id: nextId(), status: 'active', ssl: 'active' }
        hosts.set(h, value)
        if (loseCreate) {
          loseCreate = false
          throw new DomainError(503, 'domain_provider_unavailable')
        }
        return value
      },
      retry: async () => {},
      async remove(id) {
        if (failDelete) {
          failDelete = false
          throw new DomainError(503, 'domain_provider_unavailable')
        }
        for (const [h, v] of hosts) if (v.id === id) hosts.delete(h)
      },
      findRoute: async (h) => routes.get(h) ?? null,
      async createRoute(h) {
        routeCreates++
        const id = nextId()
        routes.set(h, { id, owned: true })
        return id
      },
      async removeRoute(id, h) {
        if (routes.get(h)?.id === id) routes.delete(h)
      },
    }
    const config = {
      enabled: true,
      routingReady: true,
      baseDomain: 'chronoframe.art',
      cnameTarget: 'cname.chronoframe.art',
      limit: 20,
    }
    const manager = createDomainManager(db, config, {
        provider,
        dns: async (h, target) => (dns.get(h) === target ? 'ready' : 'missing'),
        id: nextId,
        now: () => time,
      }),
      directory = createD1Directory(db, () => time)
    assert.equal(
      (await directory.getPublishedSiteByHost('timo.chronoframe.art'))?.id,
      one.siteId,
    )
    for (const name of [
      'app.chronoframe.art',
      'timo.chronoframe.art',
      'cname.chronoframe.art',
      'foo.workers.dev',
    ])
      await assert.rejects(
        () => manager.request(1, one.siteId, name),
        DomainError,
      )
    await assert.rejects(
      () => manager.request(2, one.siteId, 'outside.example.com'),
      { statusCode: 404 },
    )
    let domain = await manager.request(1, one.siteId, ' Photos.Example.com ')
    dns.set(domain.hostname, 'cname.chronoframe.art')
    await manager.reconcile()
    assert.equal(
      creates,
      0,
      'a claimant cannot activate when the real owner later points at the shared ingress',
    )
    time += 60000
    assert.equal(domain.cnameTarget, domainClaimTarget(domain.generation))
    await assert.rejects(
      () => manager.request(2, two.siteId, domain.hostname),
      { code: 'domain_conflict' },
    )
    dns.set(domain.hostname, domain.cnameTarget)
    await db
      .prepare(
        'UPDATE platform_domain_provider_lock SET lease_token=?,lease_until=? WHERE id=1',
      )
      .bind('other-allocation', time + 60000)
      .run()
    await manager.reconcile()
    domain = (await manager.list(1, one.siteId))[0]!
    assert.equal(domain.error, 'domain_wait')
    assert.equal(
      creates,
      0,
      'a concurrent allocation cannot bypass the provider resource cap',
    )
    time += 60001
    await manager.reconcile()
    domain = (await manager.list(1, one.siteId))[0]!
    assert.equal(domain.status, 'active')
    assert.equal(creates, 1)
    assert.equal(routeCreates, 1)
    assert.equal(
      (await directory.getPublishedSiteByHost(domain.hostname))?.id,
      one.siteId,
    )
    await manager.mutate(
      1,
      one.siteId,
      domain.hostname,
      domain.generation,
      domain.revision,
      'primary',
    )
    domain = (await manager.list(1, one.siteId))[0]!
    assert.equal(domain.primary, true)
    // Downgrades block traffic before the next provider reconciliation.
    const claimGeneration = domain.generation,
      claimTarget = domain.cnameTarget
    await db
      .prepare(
        "UPDATE platform_plans SET policy_json=json_set(policy_json,'$.limits.customDomains',0) WHERE id='free'",
      )
      .run()
    assert.equal(await directory.getPublishedSiteByHost(domain.hostname), null)
    let held = (await manager.list(1, one.siteId))[0]!
    assert.equal(held.holdReason, 'plan')
    assert.equal(held.status, 'paused')
    assert.equal(held.cleanupPending, true)
    failDelete = true
    time += 1800001
    await manager.reconcile(domain.hostname)
    assert.equal(
      hosts.size,
      1,
      'failed cleanup retains the upstream reference for retry',
    )
    assert.equal(await directory.getPublishedSiteByHost(domain.hostname), null)
    time += 1800001
    await manager.reconcile(domain.hostname)
    held = (await manager.list(1, one.siteId))[0]!
    assert.equal(held.cleanupPending, false)
    assert.equal(hosts.size, 0)
    assert.equal(routes.size, 0)
    assert.equal(held.generation, claimGeneration)
    const heldRevision = held.revision
    const suspendedAudits = (await db
      .prepare(
        "SELECT COUNT(*) AS n FROM platform_domain_audit WHERE hostname=? AND action='suspended'",
      )
      .bind(domain.hostname)
      .first())!.n
    time += 1800001
    await manager.reconcile(domain.hostname)
    assert.equal(
      (await manager.list(1, one.siteId))[0]!.revision,
      heldRevision,
      'unchanged holds only heartbeat, without revision churn',
    )
    assert.equal(
      (await db
        .prepare(
          "SELECT COUNT(*) AS n FROM platform_domain_audit WHERE hostname=? AND action='suspended'",
        )
        .bind(domain.hostname)
        .first())!.n,
      suspendedAudits,
      'unchanged holds do not duplicate audit entries',
    )
    await db
      .prepare(
        "UPDATE platform_plans SET policy_json=json_set(policy_json,'$.limits.customDomains',4) WHERE id='free'",
      )
      .run()
    await db.prepare('UPDATE platform_custom_domains SET next_check_at=0').run()
    await manager.reconcile(domain.hostname)
    domain = (await manager.list(1, one.siteId))[0]!
    assert.equal(domain.status, 'active')
    assert.equal(domain.primary, true)
    assert.equal(domain.cnameTarget, claimTarget)
    // Owner and site moderation block all public routes immediately.
    await db
      .prepare(
        "INSERT INTO platform_account_controls(user_id,suspended,public_reason) VALUES(1,1,'Account under review')",
      )
      .run()
    assert.equal(
      await directory.getPublishedSiteByHost('timo.chronoframe.art'),
      null,
    )
    assert.equal(await directory.getPublishedSiteByHost(domain.hostname), null)
    await db.prepare('UPDATE platform_account_controls SET suspended=0').run()
    await db
      .prepare(
        "UPDATE platform_sites SET suspended=1,suspension_reason='Site under review' WHERE id=?",
      )
      .bind(one.siteId)
      .run()
    const catalog = await createD1SiteCatalog(db).list(1)
    assert.equal(catalog[0]?.suspended, true)
    assert.equal(catalog[0]?.suspensionReason, 'Site under review')
    await db
      .prepare('UPDATE platform_sites SET suspended=0 WHERE id=?')
      .bind(one.siteId)
      .run()
    await manager.mutate(
      1,
      one.siteId,
      domain.hostname,
      domain.generation,
      domain.revision,
      'pause',
    )
    assert.equal(await directory.getPublishedSiteByHost(domain.hostname), null)
    assert.equal(
      (await directory.getPublishedSiteByHost('timo.chronoframe.art'))?.id,
      one.siteId,
    )
    await assert.rejects(
      () =>
        manager.mutate(
          1,
          one.siteId,
          domain.hostname,
          domain.generation,
          domain.revision,
          'resume',
        ),
      { code: 'domain_changed' },
    )
    domain = (await manager.list(1, one.siteId))[0]!
    await manager.mutate(
      1,
      one.siteId,
      domain.hostname,
      domain.generation,
      domain.revision,
      'resume',
    )
    await manager.reconcile()
    domain = (await manager.list(1, one.siteId))[0]!
    assert.equal(domain.status, 'active')
    failDelete = true
    await manager.mutate(
      1,
      one.siteId,
      domain.hostname,
      domain.generation,
      domain.revision,
      'delete',
    )
    await manager.reconcile()
    domain = (await manager.list(1, one.siteId))[0]!
    assert.equal(domain.status, 'deleting')
    assert.equal(await directory.getPublishedSiteByHost(domain.hostname), null)
    time += 1800000
    await manager.reconcile()
    assert.equal((await manager.list(1, one.siteId)).length, 0)
    assert.equal(hosts.size, 0)
    dns.set('photos.example.com', domain.cnameTarget)
    let rebound = await manager.request(2, two.siteId, 'photos.example.com')
    assert.equal(rebound.dnsStatus, 'missing')
    assert.notEqual(rebound.cnameTarget, domain.cnameTarget)
    await manager.reconcile()
    assert.equal(
      creates,
      2,
      'a prior generation CNAME must not establish account ownership',
    )
    dns.set(rebound.hostname, 'cname.chronoframe.art')
    time += 60000
    await manager.reconcile()
    assert.equal(
      creates,
      2,
      'a shared CNAME does not authorize the new generation',
    )
    dns.set(rebound.hostname, rebound.cnameTarget)
    time += 60000
    await manager.reconcile()
    rebound = (await manager.list(2, two.siteId))[0]!
    assert.equal(rebound.status, 'active')
    assert.equal(
      (await directory.getPublishedSiteByHost(rebound.hostname))?.id,
      two.siteId,
    )
    assert.notEqual(rebound.generation, domain.generation)
    await assert.rejects(
      () =>
        manager.mutate(
          1,
          one.siteId,
          domain.hostname,
          domain.generation,
          domain.revision,
          'delete',
        ),
      { code: 'domain_not_found' },
    )
    loseCreate = true
    let lost = await manager.request(1, one.siteId, 'lost.example.com')
    dns.set(lost.hostname, lost.cnameTarget)
    await manager.reconcile()
    assert.equal(
      (await manager.list(1, one.siteId))[0]?.error,
      'domain_provider_unavailable',
    )
    const created = creates
    time += 1800000
    await manager.reconcile()
    lost = (await manager.list(1, one.siteId))[0]!
    assert.equal(lost.status, 'active')
    assert.equal(
      creates,
      created,
      'lost create response reconciles instead of duplicating the certificate',
    )
    time += DOMAIN_HEALTH_TTL + 1
    assert.equal(
      await directory.getPublishedSiteByHost(lost.hostname),
      null,
      'stale provider/DNS evidence stops serving',
    )
    await manager.reconcile()
    assert.equal(
      (await directory.getPublishedSiteByHost(lost.hostname))?.id,
      one.siteId,
    )
    let release!: () => void, started!: () => void
    const gate = new Promise<void>((resolve) => {
        release = resolve
      }),
      entered = new Promise<void>((resolve) => {
        started = resolve
      })
    const originalCreate = provider.create
    provider.create = async (hostname) => {
      const result = await originalCreate(hostname)
      if (hostname === 'leased.example.com') {
        started()
        await gate
      }
      return result
    }
    let leased = await manager.request(1, one.siteId, 'leased.example.com')
    dns.set(leased.hostname, leased.cnameTarget)
    const pending = manager.reconcile(leased.hostname)
    await entered
    leased = (await manager.list(1, one.siteId)).find(
      (d) => d.hostname === leased.hostname,
    )!
    await manager.mutate(
      1,
      one.siteId,
      leased.hostname,
      leased.generation,
      leased.revision,
      'delete',
    )
    await manager.reconcile(leased.hostname)
    assert.ok(
      hosts.has(leased.hostname),
      'cleanup cannot race the in-flight provider request',
    )
    release()
    await pending
    assert.equal(
      (await manager.list(1, one.siteId)).find(
        (d) => d.hostname === leased.hostname,
      )?.status,
      'deleting',
    )
    time += 300001
    await manager.reconcile(leased.hostname)
    assert.equal(hosts.has(leased.hostname), false)
    provider.create = originalCreate
    let releasePolicy!: () => void, enteredPolicy!: () => void
    const policyGate = new Promise<void>((r) => (releasePolicy = r)),
      policyStarted = new Promise<void>((r) => (enteredPolicy = r))
    provider.create = async (host) => {
      const result = await originalCreate(host)
      if (host === 'policy-race.example.com') {
        enteredPolicy()
        await policyGate
      }
      return result
    }
    const racing = await manager.request(
      1,
      one.siteId,
      'policy-race.example.com',
    )
    dns.set(racing.hostname, racing.cnameTarget)
    const work = manager.reconcile(racing.hostname)
    await policyStarted
    await db.batch([
      db.prepare(
        "UPDATE platform_plans SET policy_json=json_set(policy_json,'$.limits.customDomains',0) WHERE id='free'",
      ),
      db.prepare(
        'UPDATE platform_policy_epoch SET revision=revision+1 WHERE id=1',
      ),
    ])
    releasePolicy()
    await work
    assert.equal(await directory.getPublishedSiteByHost(racing.hostname), null)
    assert.equal(
      routes.has(racing.hostname),
      false,
      'old policy cannot finish publishing a route',
    )
    time += 300001
    await manager.reconcile(racing.hostname)
    assert.equal(
      hosts.has(racing.hostname),
      false,
      'uncertain provider create is recovered and reclaimed',
    )
    await db
      .prepare(
        "UPDATE platform_plans SET policy_json=json_set(policy_json,'$.limits.customDomains',4) WHERE id='free'",
      )
      .run()
    // A queued permanent removal is not finalized until upstream deletion succeeds.
    await db
      .prepare(
        "UPDATE platform_custom_domains SET state='deleting',purge_requested=1,next_check_at=0 WHERE hostname=?",
      )
      .bind(lost.hostname)
      .run()
    failDelete = true
    await manager.reconcile(lost.hostname)
    assert.ok(
      await db
        .prepare(
          'SELECT hostname FROM platform_custom_domains WHERE hostname=?',
        )
        .bind(lost.hostname)
        .first(),
    )
    time += 1800001
    await db
      .prepare(
        "CREATE TRIGGER fail_purge BEFORE DELETE ON platform_custom_domains BEGIN SELECT RAISE(ABORT,'forced purge failure'); END",
      )
      .run()
    await manager.reconcile(lost.hostname)
    assert.equal(
      (
        await db
          .prepare('SELECT state FROM platform_custom_domains WHERE hostname=?')
          .bind(lost.hostname)
          .first()
      )?.state,
      'deleted',
      'confirmed upstream removal survives a failed final database purge',
    )
    await db.prepare('DROP TRIGGER fail_purge').run()
    await manager.reconcile(lost.hostname)
    assert.equal(hosts.has(lost.hostname), false)
    assert.equal(
      await db
        .prepare(
          'SELECT hostname FROM platform_custom_domains WHERE hostname=?',
        )
        .bind(lost.hostname)
        .first(),
      null,
    )
    provider.create = originalCreate

    await renameDefaultDomain(
      db,
      1,
      one.siteId,
      { slug: 'timo-new', revision: one.revision },
      'chronoframe.art',
      time,
    )
    assert.equal(
      (await directory.getPublishedSiteByHost('timo-new.chronoframe.art'))?.id,
      one.siteId,
    )
    assert.equal(
      (await directory.getPublishedSiteByHost('timo.chronoframe.art'))?.id,
      one.siteId,
    )
    await assert.rejects(
      () =>
        sites.create(2, {
          name: 'Taken',
          slug: 'timo',
          requestId: '00000000-0000-4000-8000-000000000003',
        }),
      { statusCode: 409 },
    )
    time += 7 * 86400000 + 1
    assert.equal(
      await directory.getPublishedSiteByHost('timo.chronoframe.art'),
      null,
    )
    assert.equal(
      (await directory.getPublishedSiteByHost('timo-new.chronoframe.art'))?.id,
      one.siteId,
    )
  } finally {
    await mf.dispose()
  }
})

test('DNS validation uses fixed CNAME-only resolvers and provider credentials never follow redirects', async () => {
  const urls: string[] = []
  const dnsFetch = (async (input: RequestInfo | URL, init?: RequestInit) => {
    urls.push(String(input))
    assert.equal(init?.redirect, 'manual')
    return new Response(
      JSON.stringify({
        Status: 0,
        Answer: [
          {
            name: 'photos.example.com.',
            type: 5,
            data: 'cname.chronoframe.art.',
          },
        ],
      }),
    )
  }) as typeof fetch
  assert.equal(
    await checkDomainCname(
      'photos.example.com',
      'cname.chronoframe.art',
      dnsFetch,
    ),
    'ready',
  )
  assert.equal(urls.length, 2)
  assert.ok(
    urls.every(
      (u) =>
        u.startsWith('https://cloudflare-dns.com/dns-query?') ||
        u.startsWith('https://dns.google/resolve?'),
    ),
  )
  assert.ok(urls.every((u) => u.endsWith('&type=CNAME')))
  const provider = createDomainProvider(
    {
      token: 'fake-provider-secret',
      zoneId: 'a'.repeat(32),
      siteWorker: 'chronoframe-site',
    },
    async (input, init) => {
      assert.ok(
        String(input).startsWith('https://api.cloudflare.com/client/v4/zones/'),
      )
      assert.equal(init?.redirect, 'manual')
      return new Response(
        JSON.stringify({
          success: false,
          errors: [{ message: 'SECRET PROVIDER DETAIL' }],
        }),
        { status: 403 },
      )
    },
  )
  const hostnameId = '0d89c70d-ad9f-4843-b99f-6cc0252067e9'
  const uuidProvider = createDomainProvider(
    {
      token: 'fake-provider-secret',
      zoneId: 'a'.repeat(32),
      siteWorker: 'chronoframe-site',
    },
    async () =>
      new Response(
        JSON.stringify({
          success: true,
          result: {
            id: hostnameId,
            hostname: 'photos.example.com',
            status: 'active',
            ssl: { status: 'active' },
          },
        }),
      ),
  )
  assert.equal((await uuidProvider.create('photos.example.com')).id, hostnameId)
  assert.equal((await uuidProvider.get(hostnameId))?.id, hostnameId)
  await assert.rejects(
    () => provider.create('photos.example.com'),
    (error) =>
      error instanceof DomainError &&
      error.code === 'domain_provider_unavailable' &&
      !String(error).includes('SECRET'),
  )
})

test('Deployment isolates named Previews and leaves customer route ownership with the domain controller', async () => {
  const { configureDomainDeployment, domainDeploymentValues } =
    await import('../scripts/domain-deployment.mjs')
  assert.throws(
    () =>
      domainDeploymentValues('production', {
        PLATFORM_DOMAIN_RESOURCE_LIMIT: '21',
      }),
    /between 1 and 20/,
  )
  const config: Record<string, any> = {
    name: 'chronoframe-cloud',
    routes: [{ pattern: 'old.example.com/*' }],
    triggers: { crons: ['old'] },
  }
  configureDomainDeployment(config, 'cloud', 'production', {
    PLATFORM_DOMAIN_ENABLED: 'true',
    PLATFORM_DEFAULT_DOMAINS_READY: 'true',
    PLATFORM_DOMAIN_ROUTING_READY: 'true',
    PLATFORM_DOMAIN_ZONE_ID: 'a'.repeat(32),
    PLATFORM_DOMAIN_PROVIDER_TOKEN: 'fake-provider-token-'.repeat(2),
  })
  assert.deepEqual(
    configureDomainDeployment({}, 'cloud', 'production', {}).triggers,
    { crons: ['* * * * *'] },
  )
  assert.equal('routes' in config, false)
  assert.deepEqual(config.triggers, { crons: ['* * * * *'] })
  assert.equal(
    config.vars.NUXT_PLATFORM_DOMAIN_CNAME_TARGET,
    'cname.chronoframe.art',
  )
  assert.ok(!JSON.stringify(config).includes('fake-provider-token'))
  const preview = configureDomainDeployment(
    { routes: [], vars: { PRIVATE_PRODUCTION_MARKER: 'not-a-secret' } },
    'site',
    'staging',
    {},
  )
  assert.equal(
    preview.previews.vars.NUXT_PUBLIC_SITE_BASE_DOMAIN,
    'staging.chronoframe.art',
  )
  assert.equal(preview.previews.vars.NUXT_PUBLIC_DEFAULT_DOMAINS_READY, 'false')
  assert.equal(
    preview.previews.vars.NUXT_PLATFORM_DOMAIN_PROVIDER_TOKEN,
    undefined,
  )
  assert.throws(() =>
    domainDeploymentValues('staging', {
      PLATFORM_DOMAIN_ENABLED: 'true',
      PLATFORM_DOMAIN_ZONE_ID: 'a'.repeat(32),
      PLATFORM_DOMAIN_PROVIDER_TOKEN: 'fake-token-'.repeat(3),
    }),
  )
})

test('Default-domain migration preserves reserved names and mappings owned by another Site', async () => {
  const mf = new Miniflare(
    convertV4MiniflareOptions({
      modules: true,
      script: 'export default {fetch(){return new Response("test")}}',
      compatibilityDate: '2026-10-22',
      d1Databases: ['DB'],
    }),
  )
  try {
    const db = await mf.getD1Database('DB')
    const apply = async (file: string) => {
      for (const q of splitSqlQuery(
        (
          await readFile('packages/platform/migrations/' + file, 'utf8')
        ).replace(/^--.*$/gm, ''),
      )
        .map((s) => s.trim())
        .filter(Boolean))
        await db.prepare(q).run()
    }
    const files = (await readdir('packages/platform/migrations'))
      .filter((f) => f.endsWith('.sql'))
      .sort()
    for (const file of files.filter((f) => f < '0013_custom_domains.sql'))
      await apply(file)
    await db
      .prepare("INSERT INTO platform_workspaces(id,name) VALUES(1,'Legacy')")
      .run()
    await db
      .prepare(
        "INSERT INTO platform_sites(id,workspace_id,name,published,slug) VALUES(1,1,'Reserved',1,'cname'),(2,1,'Collision',1,'timo'),(3,1,'Other',1,'other')",
      )
      .run()
    await db
      .prepare(
        "INSERT INTO platform_domains(hostname,site_id,verified,active) VALUES('cname.site.chronoframe.art',1,1,1),('timo.site.chronoframe.art',2,1,1),('timo.chronoframe.art',3,1,1)",
      )
      .run()
    await apply('0013_custom_domains.sql')
    assert.equal(
      await db
        .prepare(
          "SELECT hostname FROM platform_domains WHERE hostname='cname.chronoframe.art'",
        )
        .first(),
      null,
    )
    assert.equal(
      (
        await db
          .prepare(
            "SELECT site_id FROM platform_domains WHERE hostname='timo.chronoframe.art'",
          )
          .first()
      ).site_id,
      3,
    )
    assert.equal(
      (
        await db
          .prepare(
            "SELECT kind FROM platform_domains WHERE hostname='timo.site.chronoframe.art'",
          )
          .first()
      ).kind,
      'manual',
    )
    assert.equal(
      (await db.prepare('SELECT slug FROM platform_sites WHERE id=1').first())
        .slug,
      'cname',
    )
    assert.equal(
      (
        await db
          .prepare("SELECT site_id FROM platform_site_slugs WHERE slug='cname'")
          .first()
      ).site_id,
      1,
    )
  } finally {
    await mf.dispose()
  }
})

test('Workspace quotas preserve capacity for other tenants and audit failures roll back domain actions', async () => {
  const mf = new Miniflare(
    convertV4MiniflareOptions({
      modules: true,
      script: 'export default {fetch(){return new Response("test")}}',
      compatibilityDate: '2026-10-22',
      d1Databases: ['DB'],
    }),
  )
  try {
    const db = await mf.getD1Database('DB')
    for (const file of (await readdir('packages/platform/migrations'))
      .filter((f) => f.endsWith('.sql'))
      .sort())
      for (const q of splitSqlQuery(
        (
          await readFile('packages/platform/migrations/' + file, 'utf8')
        ).replace(/^--.*$/gm, ''),
      )
        .map((s) => s.trim())
        .filter(Boolean))
        await db.prepare(q).run()
    let time = Date.now()
    await db
      .prepare(
        'INSERT INTO platform_users(id,email,name,email_verified,created_at,updated_at) VALUES(1,?,?,1,?,?),(2,?,?,1,?,?)',
      )
      .bind(
        'quota@example.com',
        'One',
        time,
        time,
        'fair@example.com',
        'Two',
        time,
        time,
      )
      .run()
    await db
      .prepare(
        `UPDATE platform_plans SET policy_json=json_set(policy_json,'$.limits.sites',10,'$.limits.customDomains',4,'$.limits.byos',1) WHERE id='free'`,
      )
      .run()
    const sites = createD1Provisioning(db),
      claims = []
    for (let i = 0; i < 5; i++)
      claims.push(
        await sites.create(1, {
          name: 'Quota ' + i,
          slug: 'quota-' + i,
          requestId: crypto.randomUUID(),
        }),
      )
    const other = await sites.create(2, {
      name: 'Other',
      slug: 'fair-other',
      requestId: crypto.randomUUID(),
    })
    const provider = new Proxy(
      {},
      {
        get() {
          return () => {
            throw new Error('Unverified claims must not allocate resources')
          }
        },
      },
    ) as DomainProvider
    const manager = createDomainManager(
      db,
      {
        baseDomain: 'chronoframe.art',
        cnameTarget: 'cname.chronoframe.art',
        enabled: true,
        routingReady: true,
        limit: 20,
      },
      {
        provider,
        dns: async () => 'missing',
        id: () => crypto.randomUUID(),
        now: () => time,
      },
    )
    for (let i = 0; i < 4; i++)
      await manager.request(1, claims[i]!.siteId, 'quota-' + i + '.example.com')
    await assert.rejects(
      () => manager.request(1, claims[4]!.siteId, 'quota-4.example.com'),
      { code: 'domain_limit' },
    )
    // Filled provider reservations do not consume the separate unverified queue.
    for (let i = 0; i < 20; i++)
      await db
        .prepare(
          "INSERT INTO platform_custom_domains(hostname,site_id,generation,state,provider_attempted,created_at,expires_at,next_check_at) VALUES(?,?,?,'paused',1,?,?,?)",
        )
        .bind(
          'existing-' + i + '.example.com',
          claims[0]!.siteId,
          crypto.randomUUID(),
          time,
          time + 86400000,
          time,
        )
        .run()
    await manager.request(2, other.siteId, 'fair.example.com')
    const failAudit =
      "CREATE TRIGGER fail_domain_audit BEFORE INSERT ON platform_domain_audit BEGIN SELECT RAISE(ABORT,'audit unavailable'); END"
    await db.prepare(failAudit).run()
    await assert.rejects(
      () => manager.request(2, other.siteId, 'atomic.example.com'),
      /audit unavailable/,
    )
    assert.equal(
      await db
        .prepare(
          "SELECT hostname FROM platform_custom_domains WHERE hostname='atomic.example.com'",
        )
        .first(),
      null,
    )
    await db.prepare('DROP TRIGGER fail_domain_audit').run()
    const domain = await manager.request(2, other.siteId, 'atomic.example.com')
    await db.prepare(failAudit).run()
    await assert.rejects(
      () =>
        manager.mutate(
          2,
          other.siteId,
          domain.hostname,
          domain.generation,
          domain.revision,
          'pause',
        ),
      /audit unavailable/,
    )
    const unchanged = (await manager.list(2, other.siteId)).find(
      (d) => d.hostname === domain.hostname,
    )!
    assert.equal(unchanged.status, 'pending')
    assert.equal(unchanged.revision, domain.revision)
    await db.prepare('DROP TRIGGER fail_domain_audit').run()
    await manager.mutate(
      2,
      other.siteId,
      domain.hostname,
      domain.generation,
      domain.revision,
      'delete',
    )
    await db.prepare(failAudit).run()
    await manager.reconcile(domain.hostname)
    assert.equal(
      (await manager.list(2, other.siteId)).find(
        (d) => d.hostname === domain.hostname,
      )?.status,
      'deleting',
      'failed removal audit must not commit deleted state',
    )
    await db.prepare('DROP TRIGGER fail_domain_audit').run()
    time += 1800000
    await manager.reconcile(domain.hostname)
    assert.equal(
      (await manager.list(2, other.siteId)).find(
        (d) => d.hostname === domain.hostname,
      ),
      undefined,
    )
    assert.equal(
      (
        await db
          .prepare(
            "SELECT COUNT(*) AS n FROM platform_domain_audit WHERE hostname=? AND action='removed'",
          )
          .bind(domain.hostname)
          .first()
      ).n,
      1,
    )
    for (let i = 0; i < 5; i++)
      await db
        .prepare(
          'INSERT INTO platform_custom_domains(hostname,site_id,generation,state,created_at,expires_at,next_check_at) VALUES(?,?,?,?,?,?,?)',
        )
        .bind(
          'pending-' + i + '.example.com',
          claims[0]!.siteId,
          crypto.randomUUID(),
          i === 0 ? 'expired' : 'pending',
          time,
          time - 1,
          time,
        )
        .run()
    await assert.rejects(
      () => manager.request(2, other.siteId, 'queue-full.example.com'),
      { code: 'domain_limit' },
    )
    await db
      .prepare(
        "UPDATE platform_custom_domains SET state='deleted' WHERE hostname='pending-0.example.com'",
      )
      .run()
    const pausedClaim = await manager.request(
      2,
      other.siteId,
      'queue-full.example.com',
    )
    await manager.mutate(
      2,
      other.siteId,
      pausedClaim.hostname,
      pausedClaim.generation,
      pausedClaim.revision,
      'pause',
    )
    time += 49 * 3600000
    await manager.reconcile(pausedClaim.hostname)
    assert.equal(
      (await manager.list(2, other.siteId)).find(
        (d) => d.hostname === pausedClaim.hostname,
      ),
      undefined,
      'pausing an unverified claim cannot retain queue capacity beyond its expiry',
    )
  } finally {
    await mf.dispose()
  }
})
