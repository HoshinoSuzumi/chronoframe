import { SocialLinkError } from '@chronoframe/contracts/social-links'
import type {
  SettingsBatchFieldError,
  SettingsBatchResponse,
} from '@chronoframe/contracts/settings'

export function toSettingsBatchError(
  namespace: string,
  key: string,
  error: unknown,
): SettingsBatchFieldError {
  return {
    namespace,
    key,
    error: error instanceof Error ? error.message : String(error),
    ...(namespace === 'app' &&
    key === 'socialLinks' &&
    error instanceof SocialLinkError
      ? { code: error.code }
      : {}),
  }
}

export async function applySettingsBatch<
  T extends { namespace: string; key: string },
>(
  updates: readonly T[],
  handlers: {
    isHidden: (update: T) => boolean
    set: (update: T) => Promise<void>
  },
): Promise<SettingsBatchResponse> {
  let updated = 0
  const errors: SettingsBatchFieldError[] = []

  for (const update of updates) {
    if (handlers.isHidden(update)) {
      errors.push({
        namespace: update.namespace,
        key: update.key,
        error: 'Setting is not directly modifiable',
      })
      continue
    }
    try {
      await handlers.set(update)
      updated++
    } catch (error) {
      errors.push(toSettingsBatchError(update.namespace, update.key, error))
    }
  }

  return errors.length > 0
    ? { success: false, updated, errors }
    : { success: true, updated }
}
