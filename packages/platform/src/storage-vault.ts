import { CoreError } from '@chronoframe/core'
import type { PlatformD1 } from './index.ts'
export interface CloudStoragePublic {
  endpoint: string
  region: string
  bucket: string
}
export interface CloudStorageSecret {
  accessKeyId: string
  secretAccessKey: string
}
export interface StorageCipher {
  seal(value: CloudStorageSecret, context: string): Promise<string>
  open(envelope: string, context: string): Promise<CloudStorageSecret>
}
export function createStorageVault(
  db: PlatformD1,
  siteId: number,
  cipher: StorageCipher,
) {
  if (!Number.isSafeInteger(siteId) || siteId < 1)
    throw new RangeError('Site required')
  const aad = (id: string, revision: number) =>
    JSON.stringify(['cloud-storage', siteId, id, revision])
  function validId(id: string) {
    if (!/^[a-zA-Z0-9_-]{1,128}$/.test(id))
      throw new RangeError('Invalid connection ID')
  }
  async function managed(id: string) {
    const row = await db
      .prepare(`SELECT p.id,p.enabled,c.pool_revision AS revision,v.public_json,k.secret_ciphertext,p.current_revision
      FROM cloud_storage_connections c JOIN platform_storage_pools p ON p.id=c.pool_id
      JOIN platform_storage_pool_versions v ON v.pool_id=p.id AND v.revision=c.pool_revision
      JOIN platform_storage_pool_versions k ON k.pool_id=p.id AND k.revision=p.current_revision
      WHERE c.site_id=? AND c.id=?`)
      .bind(siteId, id)
      .first<{
        id: string
        enabled: number
        revision: number
        public_json: string
        secret_ciphertext: string
        current_revision: number
      }>()
    if (!row) return null
    return {
      revision: 1,
      poolId: row.id,
      enabled: !!row.enabled,
      config: JSON.parse(row.public_json) as CloudStoragePublic,
      credentials: await cipher.open(
        row.secret_ciphertext,
        JSON.stringify(['platform-storage', row.id, row.current_revision]),
      ),
    }
  }
  return {
    async attachPool(poolId: string, now: number) {
      const id = 'platform-' + poolId
      validId(id)
      await db.batch([
        db
          .prepare(`INSERT INTO cloud_storage_connections(site_id,id,current_revision,healthy,checked_at,pool_id,pool_revision)
          SELECT ?,?,1,1,?,id,current_revision FROM platform_storage_pools WHERE id=? AND enabled=1
          ON CONFLICT(site_id,id) DO NOTHING`)
          .bind(siteId, id, now, poolId),
        db
          .prepare(`INSERT INTO cloud_storage_versions(site_id,connection_id,revision,public_json,secret_ciphertext)
          SELECT ?,?,1,'{}','managed' WHERE EXISTS(SELECT 1 FROM cloud_storage_connections WHERE site_id=? AND id=? AND pool_id=?)
          ON CONFLICT DO NOTHING`)
          .bind(siteId, id, siteId, id, poolId),
      ])
      return db
        .prepare(
          'SELECT id FROM cloud_storage_connections WHERE site_id=? AND id=?',
        )
        .bind(siteId, id)
        .first()
    },
    async list() {
      const result = (await db
        .prepare(
          'SELECT c.id,c.current_revision,c.healthy,c.checked_at,c.pool_id,c.retired,CASE WHEN c.retired=1 THEN 0 WHEN c.pool_id IS NULL THEN 1 ELSE COALESCE(p.enabled,0) END AS uploads_enabled,v.public_json FROM cloud_storage_connections c JOIN cloud_storage_versions v ON v.site_id=c.site_id AND v.connection_id=c.id AND v.revision=c.current_revision LEFT JOIN platform_storage_pools p ON p.id=c.pool_id WHERE c.site_id=? ORDER BY c.retired,c.id',
        )
        .bind(siteId)) as unknown as { all<T>(): Promise<{ results: T[] }> }
      return (
        await result.all<{
          id: string
          pool_id: string | null
          retired: number
          uploads_enabled: number
          current_revision: number
          healthy: number
          checked_at: number | null
          public_json: string
        }>()
      ).results.map(({ public_json, ...record }) => ({
        ...record,
        config: record.pool_id
          ? { bucket: 'Platform storage' }
          : (JSON.parse(public_json) as CloudStoragePublic),
      }))
    },
    async get(id: string, revision?: number) {
      validId(id)
      const pool = await managed(id)
      if (pool) return revision === undefined || revision === 1 ? pool : null
      const row = await db
        .prepare(
          `SELECT v.revision,v.public_json,v.secret_ciphertext FROM cloud_storage_versions v JOIN cloud_storage_connections c ON c.site_id=v.site_id AND c.id=v.connection_id WHERE v.site_id=? AND v.connection_id=? AND v.revision=COALESCE(?,c.current_revision)`,
        )
        .bind(siteId, id, revision ?? null)
        .first<{
          revision: number
          public_json: string
          secret_ciphertext: string
        }>()
      if (!row) return null
      return {
        revision: row.revision,
        config: JSON.parse(row.public_json) as CloudStoragePublic,
        credentials: await cipher.open(
          row.secret_ciphertext,
          aad(id, row.revision),
        ),
      }
    },
    /** Object revisions pin bucket metadata; rotation replaces credentials for that same connection. */
    async resolve(id: string, revision?: number) {
      validId(id)
      const pool = await managed(id)
      if (pool) return revision === undefined || revision === 1 ? pool : null
      const row = await db
        .prepare(
          `SELECT v.revision,v.public_json,c.current_revision,k.secret_ciphertext FROM cloud_storage_connections c JOIN cloud_storage_versions v ON v.site_id=c.site_id AND v.connection_id=c.id AND v.revision=COALESCE(?,c.current_revision) JOIN cloud_storage_versions k ON k.site_id=c.site_id AND k.connection_id=c.id AND k.revision=c.current_revision WHERE c.site_id=? AND c.id=?`,
        )
        .bind(revision ?? null, siteId, id)
        .first<{
          revision: number
          public_json: string
          current_revision: number
          secret_ciphertext: string
        }>()
      if (!row) return null
      return {
        revision: row.revision,
        config: JSON.parse(row.public_json) as CloudStoragePublic,
        credentials: await cipher.open(
          row.secret_ciphertext,
          aad(id, row.current_revision),
        ),
      }
    },
    async create(
      id: string,
      config: CloudStoragePublic,
      credentials: CloudStorageSecret,
      now: number,
    ) {
      validId(id)
      const encrypted = await cipher.seal(credentials, aad(id, 1))
      const results = await db.batch([
        db
          .prepare(
            'INSERT INTO cloud_storage_connections(site_id,id,current_revision,healthy,checked_at) SELECT ?,?,1,1,? WHERE (SELECT COUNT(*) FROM cloud_storage_connections WHERE site_id=? AND retired=0)<20',
          )
          .bind(siteId, id, now, siteId),
        db
          .prepare(
            'INSERT INTO cloud_storage_versions(site_id,connection_id,revision,public_json,secret_ciphertext) SELECT ?,?,1,?,? WHERE EXISTS(SELECT 1 FROM cloud_storage_connections WHERE site_id=? AND id=?)',
          )
          .bind(siteId, id, JSON.stringify(config), encrypted, siteId, id),
      ])
      if (!(results[0] as { meta?: { changes?: number } }).meta?.changes)
        throw new CoreError(429, 'Storage connection limit reached')
    },
    async rotate(
      id: string,
      expectedRevision: number,
      credentials: CloudStorageSecret,
      now: number,
    ) {
      validId(id)
      if (await managed(id))
        throw new CoreError(403, 'Managed credentials cannot be changed')
      if (!Number.isSafeInteger(expectedRevision) || expectedRevision < 1)
        throw new RangeError('Revision required')
      const revision = expectedRevision + 1
      const encrypted = await cipher.seal(credentials, aad(id, revision))
      await db.batch([
        db
          .prepare(
            `INSERT INTO cloud_storage_versions(site_id,connection_id,revision,public_json,secret_ciphertext) SELECT ?,?, ?,public_json,? FROM cloud_storage_versions WHERE site_id=? AND connection_id=? AND revision=? AND EXISTS(SELECT 1 FROM cloud_storage_connections WHERE site_id=? AND id=? AND current_revision=?)`,
          )
          .bind(
            siteId,
            id,
            revision,
            encrypted,
            siteId,
            id,
            expectedRevision,
            siteId,
            id,
            expectedRevision,
          ),
        db
          .prepare(
            'UPDATE cloud_storage_connections SET current_revision=?,healthy=1,checked_at=? WHERE site_id=? AND id=? AND current_revision=?',
          )
          .bind(revision, now, siteId, id, expectedRevision),
      ])
      const row = await db
        .prepare(
          'SELECT secret_ciphertext FROM cloud_storage_versions WHERE site_id=? AND connection_id=? AND revision=?',
        )
        .bind(siteId, id, revision)
        .first<{ secret_ciphertext: string }>()
      return row?.secret_ciphertext === encrypted
    },
    async health(id: string, healthy: boolean, now: number) {
      await db
        .prepare(
          'UPDATE cloud_storage_connections SET healthy=?,checked_at=? WHERE site_id=? AND id=?',
        )
        .bind(healthy ? 1 : 0, now, siteId, id)
        .run()
    },
  }
}
