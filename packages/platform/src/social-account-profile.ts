import type { PlatformD1 } from './index.ts'

/** Extract only the provider subject and public account label from an OAuth profile. */
export function socialAccountProfile(
  provider: string,
  profile: Record<string, unknown> | undefined,
) {
  if (!profile || !['github', 'google', 'discord'].includes(provider))
    return null
  const subject = provider === 'google' ? profile.sub : profile.id
  if (
    (typeof subject !== 'string' && typeof subject !== 'number') ||
    !String(subject).trim() ||
    String(subject).length > 256 ||
    (typeof subject === 'number' && !Number.isSafeInteger(subject))
  )
    return null
  const value =
    provider === 'github'
      ? profile.login
      : provider === 'discord'
        ? profile.username
        : profile.name
  const username =
    typeof value === 'string' &&
    value.trim() &&
    value.length <= 256 &&
    ![...value].some(
      (character) =>
        character.charCodeAt(0) < 32 || character.charCodeAt(0) === 127,
    )
      ? value.trim()
      : null
  return { subject: String(subject), username }
}
/** Persist a verified callback label only against the account actually bound by auth. */
export async function saveSocialAccountProfile(
  db: PlatformD1,
  account: {
    id: string
    userId: string
    providerId: string
    accountId: string
  },
  username: string | null,
) {
  await db
    .prepare(
      'UPDATE platform_accounts SET provider_username=? WHERE id=? AND user_id=? AND provider_id=? AND account_id=?',
    )
    .bind(
      username,
      account.id,
      account.userId,
      account.providerId,
      account.accountId,
    )
    .run()
}
