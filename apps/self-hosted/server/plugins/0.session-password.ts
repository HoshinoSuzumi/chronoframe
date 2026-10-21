import { randomBytes } from 'node:crypto'
import { mkdir, readFile, writeFile } from 'node:fs/promises'
import { dirname, resolve } from 'node:path'

const SESSION_PASSWORD_ENV_KEY = 'NUXT_SESSION_PASSWORD'
const SESSION_PASSWORD_FILE = resolve(process.cwd(), 'data/.session-password')
const MIN_PASSWORD_LENGTH = 32

function isValidSessionPassword(
  password: string | undefined,
): password is string {
  return Boolean(password && password.length >= MIN_PASSWORD_LENGTH)
}

function generateSessionPassword(): string {
  return randomBytes(48).toString('base64url')
}

export default defineNitroPlugin(async () => {
  if (isValidSessionPassword(process.env[SESSION_PASSWORD_ENV_KEY])) {
    return
  }

  const pluginLogger = logger.dynamic('session-password')

  try {
    await mkdir(dirname(SESSION_PASSWORD_FILE), { recursive: true })

    const filePassword = (await readFile(SESSION_PASSWORD_FILE, 'utf8')).trim()
    if (isValidSessionPassword(filePassword)) {
      process.env[SESSION_PASSWORD_ENV_KEY] = filePassword
      pluginLogger.info(
        `Loaded session password from ${SESSION_PASSWORD_FILE.replace(process.cwd(), '.')}`,
      )
      return
    }

    pluginLogger.warn(
      'Session password file exists but is invalid, generating a new password.',
    )
  } catch {
    // The password file does not exist yet, generate a new one below.
  }

  const generatedPassword = generateSessionPassword()
  await writeFile(SESSION_PASSWORD_FILE, generatedPassword, {
    encoding: 'utf8',
    mode: 0o600,
  })
  process.env[SESSION_PASSWORD_ENV_KEY] = generatedPassword
  pluginLogger.info(
    `Generated and persisted a session password to ${SESSION_PASSWORD_FILE.replace(process.cwd(), '.')}`,
  )
})
