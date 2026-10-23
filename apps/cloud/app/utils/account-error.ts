/** Present actionable auth errors without exposing raw server/provider failures. */
export function accountError(cause: unknown) {
  const error = cause as {
    statusCode?: number
    data?: { message?: string; code?: string }
  }
  if (error.statusCode === 429)
    return 'Too many attempts. Please wait before trying again.'
  const code = error.data?.code ?? ''
  if (code === 'AUTHENTICATOR_REQUIRED')
    return 'Use your authenticator or an unused recovery code to finish signing in.'
  if (code.includes('PASSWORD_TOO_SHORT'))
    return 'Use a password with at least 12 characters.'
  if (code.includes('EMAIL_NOT_VERIFIED'))
    return 'Verify your email before signing in. You can request another code below.'
  if (code.includes('USER_ALREADY_EXISTS'))
    return 'An account may already use this email. Try signing in or resetting your password.'
  if (
    code.includes('OTP') ||
    code.includes('TOTP') ||
    code.includes('BACKUP_CODE')
  )
    return 'This code is invalid or expired. Check it and try again, or request a new code.'
  if (code.includes('PASSWORD') || code.includes('CREDENTIAL'))
    return 'The email or password is incorrect. Check your details or reset your password.'
  if (code.includes('TOKEN'))
    return 'This link is invalid or expired. Please request a new password reset email.'
  if (code.includes('FRESH_SESSION') || code.includes('SESSION_IS_NOT_FRESH'))
    return 'Please sign out and sign in again before changing security settings.'
  return 'We could not complete this request. Please try again.'
}
