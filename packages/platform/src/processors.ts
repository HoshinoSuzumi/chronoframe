import type { PlatformD1 } from './index.ts'
import {
  processorCipher,
  processorKeyHash,
  parseProcessorLimits,
  parseProcessorGeocoding,
  DEFAULT_PROCESSOR_GEOCODING,
  type ProcessorConfiguration,
} from '../../contracts/src/processor.ts'
export async function authenticateProcessor(db: PlatformD1, key: string) {
  if (!/^pn_[a-f0-9-]{36}\.[A-Za-z0-9_-]{43}$/.test(key)) return null
  return db
    .prepare(
      'SELECT id,name,limits_json,revision FROM platform_processor_nodes WHERE secret_hash=? AND enabled=1',
    )
    .bind(await processorKeyHash(key))
    .first<{
      id: string
      name: string
      limits_json: string
      revision: number
    }>()
}
export async function processingGeocoding(db: PlatformD1, secret: string) {
  const row = await db
    .prepare(
      'SELECT encrypted_config,revision FROM platform_processor_settings WHERE id=1',
    )
    .first<{ encrypted_config: string | null; revision: number }>()
  const value = row?.encrypted_config
    ? await (
        await processorCipher(secret)
      ).open(row.encrypted_config, 'platform-geocoding')
    : DEFAULT_PROCESSOR_GEOCODING
  return {
    config: parseProcessorGeocoding(value),
    revision: row?.revision ?? 1,
  }
}
export async function processorEnvelope(
  db: PlatformD1,
  secret: string,
  token: string,
  node: { id: string; limits_json: string; revision: number },
  now: number,
) {
  const geocoding = await processingGeocoding(db, secret)
  const revision = `${node.revision}:${geocoding.revision}`,
    expiresAt = now + 300000
  const config: ProcessorConfiguration = {
    limits: parseProcessorLimits(JSON.parse(node.limits_json)),
    geocoding: {
      ...geocoding.config,
      token:
        geocoding.config.provider === 'mapbox' ? geocoding.config.token : '',
    },
  }
  return {
    nodeId: node.id,
    revision,
    expiresAt,
    envelope: await (
      await processorCipher(token)
    ).seal(config, `${node.id}:${revision}:${expiresAt}`),
  }
}
