import {
  probeStorageConnection,
  StorageConnectionError,
} from '@chronoframe/storage/connection-probe'
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
  const vault = createStorageVault(raw, siteId, {
    seal: async (value, context) =>
      (await createStorageCipher(cfg.storageSecret)).seal(value, context),
    open: async (value, context) =>
      (await createStorageCipher(cfg.storageSecret)).open(value, context),
  })
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
        {
          allowedHosts:
            'poolId' in item
              ? [...allowedHosts, new URL(item.config.endpoint).hostname]
              : allowedHosts,
        },
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
  let s3: ReturnType<typeof createCloudS3>
  try {
    validateCloudS3(config, allowedHosts)
    s3 = createCloudS3(config, { allowedHosts })
  } catch {
    throw new StorageConnectionError('configuration')
  }
  await probeStorageConnection(s3, origin)
}
