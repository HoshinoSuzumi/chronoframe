import type { SettingValue } from '@chronoframe/contracts/settings'
import { parseSocialLinks } from '@chronoframe/contracts/social-links'

export const DEFAULT_QUEUE_WORKER_COUNT = 5

/** Validate configured embedded concurrency before persistence or worker startup. */
export function validateQueueWorkerCount(
  value: unknown,
): asserts value is number {
  if (
    typeof value !== 'number' ||
    !Number.isInteger(value) ||
    value < 1 ||
    value > 8
  ) {
    throw new Error('Queue concurrency must be an integer between 1 and 8')
  }
}

/** Validate domain rules without owning persistence, caches or runtime effects. */
export function validateSettingWrite(input: {
  namespace: string
  key: string
  value: SettingValue
  readonly: boolean
  enumValues: string[] | null
  sudo: boolean
}): void {
  const { namespace, key, value, enumValues, sudo } = input
  if (input.readonly && !sudo)
    throw new Error(`Setting ${namespace}:${key} is readonly`)
  if (
    enumValues?.length &&
    (value === null || !enumValues.includes(String(value)))
  ) {
    throw new Error(
      `Invalid value for setting ${namespace}:${key}. Allowed values: ${enumValues.join(', ')}`,
    )
  }
  if (namespace === 'location' && key === 'fallbackOrder') {
    const levels = [
      'country',
      'region',
      'subregion',
      'city',
      'district',
      'locality',
      'neighborhood',
    ]
    if (
      typeof value !== 'string' ||
      value.split(',').some((level) => !levels.includes(level.trim()))
    ) {
      throw new Error('Invalid location fallback order')
    }
  }
  if (namespace === 'system' && key === 'queue.workerCount')
    validateQueueWorkerCount(value)
  if (namespace === 'app' && key === 'socialLinks') parseSocialLinks(value)
}

/** Resolve the configured connection through an injected persistence boundary. */
export function createStorageResolver<T>(repository: {
  getSelectedId(): Promise<number | null | undefined>
  find(id: number): Promise<T | null>
}) {
  return {
    async resolve(): Promise<T | null> {
      const id = await repository.getSelectedId()
      return id ? repository.find(id) : null
    },
  }
}
