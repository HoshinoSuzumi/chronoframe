import type { PlatformD1 } from './index.ts'
import { SubscriptionError } from './subscriptions.ts'
export interface PublicMapConfig {
  provider: 'mapbox' | 'maplibre'
  'mapbox.token': string
  'mapbox.style': string
  'maplibre.token': string
  'maplibre.style': string
}
export const EMPTY_MAP: PublicMapConfig = {
  provider: 'maplibre',
  'mapbox.token': '',
  'mapbox.style': '',
  'maplibre.token': '',
  'maplibre.style': '',
}
/** These are browser-visible keys, never secret server-side credentials. */
export function parsePublicMap(value: unknown): PublicMapConfig {
  if (!value || typeof value !== 'object' || Array.isArray(value))
    throw new SubscriptionError(400, 'map_config_invalid')
  const input = value as Record<string, unknown>
  if (Object.keys(input).some((k) => !Object.hasOwn(EMPTY_MAP, k)))
    throw new SubscriptionError(400, 'map_config_invalid')
  const result = { ...EMPTY_MAP }
  if (!['mapbox', 'maplibre'].includes(String(input.provider)))
    throw new SubscriptionError(400, 'map_provider_invalid')
  result.provider = input.provider as PublicMapConfig['provider']
  for (const key of [
    'mapbox.token',
    'mapbox.style',
    'maplibre.token',
    'maplibre.style',
  ] as const) {
    if (
      typeof input[key] !== 'string' ||
      input[key].length > 2048 ||
      /[\x00-\x1f\x7f]/.test(input[key])
    )
      throw new SubscriptionError(400, 'map_config_invalid')
    result[key] = input[key].trim()
  }
  if (
    result['mapbox.token'] &&
    !/^pk\.[A-Za-z0-9._-]{10,1024}$/.test(result['mapbox.token'])
  )
    throw new SubscriptionError(400, 'map_public_token_required')
  if (
    result['maplibre.token'] &&
    !/^[A-Za-z0-9_-]{8,256}$/.test(result['maplibre.token'])
  )
    throw new SubscriptionError(400, 'map_public_token_required')
  for (const key of ['mapbox.style', 'maplibre.style'] as const) {
    const style = result[key]
    if (!style) continue
    if (
      key === 'mapbox.style' &&
      /^mapbox:\/\/styles\/[A-Za-z0-9_-]+\/[A-Za-z0-9_-]+$/.test(style)
    )
      continue
    try {
      const url = new URL(style)
      if (url.protocol !== 'https:' || url.username || url.password)
        throw new Error()
    } catch {
      throw new SubscriptionError(400, 'map_style_invalid')
    }
  }
  return result
}
export async function mapDefaults(db: PlatformD1) {
  const row = await db
    .prepare(
      'SELECT config_json,revision FROM platform_map_settings WHERE id=1',
    )
    .first<{ config_json: string; revision: number }>()
  return {
    config: parsePublicMap({
      ...EMPTY_MAP,
      ...JSON.parse(row!.config_json),
    }),
    revision: row!.revision,
  }
}
export async function siteMaps(db: PlatformD1, siteId: number) {
  const row = await db
    .prepare(
      'SELECT config_json,revision FROM platform_site_maps WHERE site_id=?',
    )
    .bind(siteId)
    .first<{ config_json: string | null; revision: number }>()
  const defaults = await mapDefaults(db)
  const config = row?.config_json
    ? parsePublicMap(JSON.parse(row.config_json))
    : null
  return {
    config,
    effective: config ?? defaults.config,
    revision: row?.revision ?? 0,
  }
}
export async function saveSiteMaps(
  db: PlatformD1,
  userId: number,
  siteId: number,
  input: { config: unknown; revision: unknown },
) {
  if (!Number.isSafeInteger(input.revision) || Number(input.revision) < 0)
    throw new SubscriptionError(400, 'map_revision_invalid')
  const revision = Number(input.revision)
  const config = input.config === null ? null : parsePublicMap(input.config)
  const result = await db
    .prepare(
      `INSERT INTO platform_site_maps(site_id,config_json,revision) SELECT ?,?,1 WHERE EXISTS(SELECT 1 FROM platform_sites s JOIN platform_memberships m ON m.workspace_id=s.workspace_id WHERE s.id=? AND s.suspended=0 AND m.user_id=? AND m.role='admin') AND (?=0 OR EXISTS(SELECT 1 FROM platform_site_maps WHERE site_id=? AND revision=?)) ON CONFLICT(site_id) DO UPDATE SET config_json=excluded.config_json,revision=platform_site_maps.revision+1 WHERE platform_site_maps.revision=?`,
    )
    .bind(
      siteId,
      config ? JSON.stringify(config) : null,
      siteId,
      userId,
      revision,
      siteId,
      revision,
      revision,
    )
    .run()
  if (!result.meta.changes)
    throw new SubscriptionError(409, 'map_settings_changed_or_forbidden')
  return siteMaps(db, siteId)
}
