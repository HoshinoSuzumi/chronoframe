import { access, copyFile, readFile, writeFile } from 'node:fs/promises'
import { join } from 'node:path'

const marker = '// ChronoFrame private app-secret bootstrap'

/** Side-effect module so named re-exports cannot evaluate the Nitro entry first. */
function bootstrapSource() {
  return `import { resolve } from 'node:path'
import { ensureAppSecret } from './app-secret.mjs'
const { secret, source } = ensureAppSecret(resolve(process.cwd(), 'data/.app-secret'))
if (source !== 'legacy') {
  const key = process.env.NITRO_APP_SECRET !== undefined ? 'NITRO_APP_SECRET' : 'NUXT_APP_SECRET'
  process.env[key] = JSON.stringify(secret)
}
`
}

function wrapperSource() {
  return `${marker}
import './app-secret-bootstrap.mjs'
export * from './index.runtime.mjs'
export { default } from './index.runtime.mjs'
`
}

async function copySecretUtilities(serverDir) {
  await copyFile(
    new URL('../server/utils/app-secret.mjs', import.meta.url),
    join(serverDir, 'app-secret.mjs'),
  )
  await copyFile(
    new URL('../server/utils/app-secret-validation.mjs', import.meta.url),
    join(serverDir, 'app-secret-validation.mjs'),
  )
}

async function writeWrapper(serverDir) {
  await writeFile(join(serverDir, 'app-secret-bootstrap.mjs'), bootstrapSource())
  await writeFile(join(serverDir, 'index.mjs'), wrapperSource())
}

/** Keep the generated Node entry usable directly, in preview and in Docker. */
export async function prepareSelfHostedRuntime(serverDir) {
  const entry = join(serverDir, 'index.mjs')
  const runtime = join(serverDir, 'index.runtime.mjs')
  const wrapper = wrapperSource()

  let hasRuntime = false
  try {
    await access(runtime)
    hasRuntime = true
  } catch (error) {
    if (error.code !== 'ENOENT') throw error
  }

  if (hasRuntime) {
    // index.runtime.mjs is the Nitro entry; refresh the wrapper on every build.
    await copySecretUtilities(serverDir)
    await writeWrapper(serverDir)
    return
  }

  const source = await readFile(entry, 'utf8')
  // Marker alone is not enough: skip only when this build's wrapper already matches.
  if (source === wrapper) return

  await copySecretUtilities(serverDir)
  await writeFile(runtime, source)
  await writeWrapper(serverDir)
}
