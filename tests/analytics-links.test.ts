import test from 'node:test'
import assert from 'node:assert/strict'
import { DatabaseSync } from 'node:sqlite'
import {
  resolveAnalyticsPages,
  decodeAnalyticsPage,
  PAGE_LABEL_SQL,
} from '../packages/platform/src/analytics-pages.ts'
import { popularPhotos } from '../packages/platform/src/analytics-popular.ts'
import { visitRoutePath } from '../apps/shared/analytics/tracker.ts'

test('page metadata resolves current titles and canonical domains within the authorized workspace', async () => {
  const sqlite = new DatabaseSync(':memory:')
  sqlite.exec(`CREATE TABLE platform_sites(id,workspace_id,name,gallery_title,published,suspended);
 CREATE TABLE platform_workspaces(id,owner_user_id); CREATE TABLE platform_account_controls(user_id,suspended);
 CREATE TABLE platform_domains(site_id,hostname,kind,active,verified,redirect_until);
 CREATE TABLE platform_custom_domains(site_id,hostname,is_primary,state,verified_at);
 CREATE TABLE cloud_photos(site_id,id,title,deleted);CREATE TABLE cloud_albums(site_id,id,title);
 CREATE TABLE cloud_album_slugs(site_id,album_id,slug,is_current); CREATE TABLE cloud_album_photos(site_id,album_id,photo_id); INSERT INTO cloud_album_photos VALUES(1,'album-id','photo');
 INSERT INTO platform_sites VALUES(1,7,'Site','Gallery',1,0),(2,8,'Other','Private title',1,0);
 INSERT INTO platform_domains VALUES(1,'gallery.example','default',1,1,NULL);
 INSERT INTO cloud_photos VALUES(1,'photo','Photo title',0),(2,'photo','Private photo',0),(1,'deleted','Deleted title',1);
 INSERT INTO cloud_albums VALUES(1,'album-id','Album title');
 INSERT INTO cloud_album_slugs VALUES(1,'album-id','old-slug',0),(1,'album-id','new-slug',1);`)
  const db = {
    prepare: (sql: string) => ({
      bind: (...values: any[]) => ({
        all: async () => ({ results: sqlite.prepare(sql).all(...values) }),
      }),
    }),
  } as any
  const labels = [
    '1|gallery.example|/photo',
    '1|gallery.example|/albums/old-slug/photo',
    '2|other.example|/photo',
    '1|gallery.example|/deleted',
    '/photo',
  ]
  const report = await resolveAnalyticsPages(
    db,
    {
      pages: labels.map((label) => ({
        label,
        pv: 1,
        uv: 1,
        sampleInterval: 1,
      })),
    },
    { workspaceId: 7, from: '2026-11-01', to: '2026-11-01' },
  )
  assert.equal(report.pages[0]!.page?.segments[0]?.title, 'Photo title')
  assert.equal(
    report.pages[1]!.page?.segments[1]?.href,
    'https://gallery.example/albums/new-slug',
  )
  assert.equal(
    report.pages[1]!.page?.segments[2]?.href,
    'https://gallery.example/albums/new-slug?photo=photo',
  )
  assert.equal(report.pages[2]!.page, undefined)
  assert.equal(report.pages[3]!.page?.segments[0]?.title, 'deleted')
  assert.equal(report.pages[4]!.page, undefined)
  assert.equal(decodeAnalyticsPage('1|evil.example|//evil.example'), null)
  assert.equal(decodeAnalyticsPage('1|https://evil.example|/'), null)
  assert.match(PAGE_LABEL_SQL, /format/)
  sqlite.close()
})

test('album photo tracking records only a validated photo identity and never arbitrary query strings', () => {
  const id = '12345678-1234-1234-1234-123456789012'
  assert.equal(
    visitRoutePath({
      path: '/albums/travel',
      query: { photo: id, token: 'secret' },
    }),
    `/albums/travel/${id}`,
  )
  assert.equal(
    visitRoutePath({
      path: '/albums/travel',
      query: { photo: '../../secret' },
    }),
    '/albums/travel',
  )
  assert.equal(
    visitRoutePath({ path: '/albums', query: { photo: id } }),
    '/albums',
  )
})

test('popular photo ranking includes every current photo, merges path variants in SQL and ranks across chunks', async () => {
  const ids = Array.from(
    { length: 205 },
    (_, i) => `12345678-1234-1234-1234-${String(i).padStart(12, '0')}`,
  )
  let requests = 0
  const rows = await popularPhotos(
    { accountId: 'a'.repeat(32), token: 'test', dataset: 'visits' },
    {
      kind: 'site',
      workspaceId: 7,
      siteId: 1,
      from: '2026-11-01',
      to: '2026-11-01',
    },
    ids,
    async (_url, opts) => {
      const sql = String(opts?.body)
      requests++
      assert.match(sql, /blob3 = '7'/)
      assert.match(sql, /blob4 = '1'/)
      assert.match(sql, /substring\(blob6, length\(blob6\) - 35, 36\)/)
      assert.match(sql, /startsWith\(blob6, '\/albums\/'\)/)
      const group = [...sql.matchAll(/'(12345678[^']+)'/g)].map((m) => m[1]!)
      return Response.json({
        data: group
          .map((id) => ({
            label: id,
            pv: Number(id.slice(-12)) + 1,
            uv: 1,
            sampleInterval: 1,
          }))
          .sort((a, b) => b.pv - a.pv)
          .slice(0, 5),
      })
    },
  )
  assert.equal(requests, 3)
  assert.deepEqual(
    rows.map((r) => r.pv),
    [205, 204, 203, 202, 201],
  )
})
