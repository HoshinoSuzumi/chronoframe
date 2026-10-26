/** Present actionable auth errors without exposing raw server/provider failures. */
export function accountError(cause: unknown, t: (key: string) => string) {
  const error = cause as {
    statusCode?: number
    data?: { message?: string; code?: string }
  }
  if (error.statusCode === 429)
    return t('cloud.messages.tooManyAttemptsPleaseWaitBeforeTryingAgain')
  const code = error.data?.code ?? (cause as { code?: string }).code ?? ''
  if (code === 'ACCOUNT_SUSPENDED')
    return (
      t('cloud.enforcement.accountSuspended') +
      ' ' +
      (error.data?.message ?? (cause as { message?: string }).message ?? '')
    )
  if (code === 'AUTHENTICATOR_REQUIRED')
    return t('cloud.messages.useYourAuthenticatorOrAnUnusedRecoveryCodeTo')
  if (code.includes('PASSWORD_TOO_SHORT'))
    return t('cloud.messages.useAPasswordWithAtLeast12Characters')
  if (code.includes('EMAIL_NOT_VERIFIED'))
    return t('cloud.messages.verifyYourEmailBeforeSigningInYouCanRequest')
  if (code.includes('USER_ALREADY_EXISTS'))
    return t('cloud.messages.anAccountMayAlreadyUseThisEmailTrySigning')
  if (
    code.includes('OTP') ||
    code.includes('TOTP') ||
    code.includes('BACKUP_CODE')
  )
    return t('cloud.messages.thisCodeIsInvalidOrExpiredCheckItAnd')
  if (code.includes('PASSWORD') || code.includes('CREDENTIAL'))
    return t('cloud.messages.theEmailOrPasswordIsIncorrectCheckYourDetails')
  if (code.includes('TOKEN'))
    return t('cloud.messages.thisLinkIsInvalidOrExpiredPleaseRequestA')
  if (code.includes('FRESH_SESSION') || code.includes('SESSION_IS_NOT_FRESH'))
    return t('cloud.messages.pleaseSignOutAndSignInAgainBeforeChanging')
  return t('cloud.messages.weCouldNotCompleteThisRequestPleaseTryAgain')
}
