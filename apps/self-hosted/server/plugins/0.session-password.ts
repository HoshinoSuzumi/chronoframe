import { resolve } from 'node:path'
import { ensureSessionPassword } from '../utils/session-password'

const SESSION_PASSWORD_FILE = resolve(process.cwd(), 'data/.session-password')

// Must remain synchronous so the password is set before any request is served.
export default defineNitroPlugin(() => {
  const pluginLogger = logger.dynamic('session-password')
  const displayPath = SESSION_PASSWORD_FILE.replace(process.cwd(), '.')

  const { source, replacedInvalidFile } = ensureSessionPassword(
    SESSION_PASSWORD_FILE,
  )

  if (source === 'file') {
    pluginLogger.info(`Loaded session password from ${displayPath}`)
  } else if (source === 'generated') {
    if (replacedInvalidFile) {
      pluginLogger.warn(
        'Session password file exists but is invalid, generating a new password.',
      )
    }
    pluginLogger.info(
      `Generated and persisted a session password to ${displayPath}`,
    )
  }
})
