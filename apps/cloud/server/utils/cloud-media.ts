import { createError, getRouterParam } from 'h3'
import type { H3Event } from 'h3'
import {
  createCloudMediaRepository,
  type MediaDatabase,
} from '@chronoframe/database/cloud-media'
import { createCloudResourceRepository } from '@chronoframe/database/cloud-resources'
import {
  createCloudS3,
  validateCloudS3,
  type CloudS3Config,
} from '@chronoframe/storage/s3-edge'
import { createStorageCipher } from '@chronoframe/storage/credential-cipher'
import { createStorageVault } from '../../../../packages/platform/src/index'
import { platformDatabase } from '../../../shared/platform/runtime'
import { siteManagement } from './site-management'

export async function cloudMedia(event: H3Event, mutation = false) {
  const { userId, store } = await siteManagement(event, mutation)
  const siteId = Number(getRouterParam(event, 'siteId'))
  const site = await store.get(userId, siteId)
  if (mutation && site.role !== 'admin') throw createError({ statusCode: 403 })
  const raw = platformDatabase(event),
    db = raw as unknown as MediaDatabase
  if (mutation) {
    const kind = (getRouterParam(event, 'operation') ?? '').split('/')[0]
    const bucket = [
      'storage',
      'uploads',
      'photos',
      'albums',
      'publish',
    ].includes(kind ?? '')
      ? kind
      : 'other'
    const window = Math.floor(Date.now() / 60000)
    const rate = await raw
      .prepare(
        `INSERT INTO platform_auth_attempts(key,window_start,attempts) VALUES(?,?,1) ON CONFLICT(key) DO UPDATE SET attempts=CASE WHEN window_start=excluded.window_start THEN attempts+1 ELSE 1 END,window_start=excluded.window_start RETURNING attempts`,
      )
      .bind('cloud-media:' + userId + ':' + bucket, window)
      .first<{ attempts: number }>()
    if (
      !rate ||
      rate.attempts >
        (bucket === 'storage' ? 4 : bucket === 'uploads' ? 600 : 240)
    )
      throw createError({ statusCode: 429 })
  }
  const cfg = useRuntimeConfig(event).platform
  const vault = createStorageVault(
    raw,
    siteId,
    await createStorageCipher(cfg.storageSecret),
  )
  const allowedHosts = cfg.s3EndpointHosts
    .split(',')
    .map((h) => h.trim())
    .filter(Boolean)
  async function storage(id: string, revision?: number) {
    const item = await vault.resolve(id, revision)
    if (!item) throw createError({ statusCode: 404 })
    return {
      revision: item.revision,
      s3: createCloudS3(
        { ...item.config, ...item.credentials },
        { allowedHosts },
      ),
    }
  }
  const sql = async <T>(query: string, ...values: (string | number | null)[]) =>
    (
      await db
        .prepare(query)
        .bind(...values)
        .all<T>()
    ).results
  return {
    siteId,
    userId,
    site,
    raw,
    db,
    vault,
    allowedHosts,
    storage,
    sql,
    repository: createCloudMediaRepository(db, { id: siteId }),
    resources: createCloudResourceRepository(
      db,
      { id: siteId },
      `/api/sites/${siteId}/media/file`,
    ),
  }
}
export async function checkStorage(
  config: CloudS3Config,
  origin: string,
  allowedHosts: string[],
) {
  validateCloudS3(config, allowedHosts)
  const s3 = createCloudS3(config, { allowedHosts }),
    key = 'chronoframe/connection-check/' + crypto.randomUUID()
  const sample = crypto.getRandomValues(new Uint8Array(32))
  let written = false
  try {
    await s3.put(key, sample, 'application/octet-stream')
    written = true
    const head = await s3.head(key),
      bytes = await s3.getProbe(key)
    if (
      head.bytes !== sample.length ||
      !bytes ||
      bytes.some((v, i) => v !== sample[i])
    )
      throw new Error('Storage read/write check failed')
    // Probe the presigned path too; raw responses and URLs are never returned/logged.
    const response = await fetch(await s3.signGet(key), {
      redirect: 'manual',
      signal: AbortSignal.timeout(15000),
    })
    if (!response.ok) throw new Error('Storage signed access failed')
    await response.body?.cancel()
    const multipartId = await s3.multipart(key, 'application/octet-stream')
    try {
      if (!(await s3.recoverMultipart(key)).includes(multipartId))
        throw new Error('Multipart recovery check failed')
    } finally {
      await s3.abort(key, multipartId)
    }
    if (!(await s3.cors(origin))) throw new Error('Storage CORS check failed')
  } finally {
    if (written) await s3.remove(key)
  }
}
