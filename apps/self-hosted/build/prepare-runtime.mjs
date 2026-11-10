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
  // Copy the canonical implementation; the Self-hosted re-export path is not
  // valid once these files live beside the prepared Nitro entry.
  await copyFile(
    new URL('../../../scripts/app-secret-validation.mjs', import.meta.url),
    join(serverDir, 'app-secret-validation.mjs'),
  )
}

async function writeWrapper(serverDir) {
  await writeFile(
    join(serverDir, 'app-secret-bootstrap.mjs'),
    bootstrapSource(),
  )
  await writeFile(join(serverDir, 'index.mjs'), wrapperSource())
}

/** Keep the generated Node entry usable directly, in preview and in Docker. */
export async function prepareSelfHostedRuntime(serverDir) {
  const entry = join(serverDir, 'index.mjs')
  const runtime = join(serverDir, 'index.runtime.mjs')
  const source = await readFile(entry, 'utf8')

  // A fresh Nitro entry must always become the runtime source, even when a runtime
  // file from an earlier build is still present. Never wrap stale generated code.
  if (!source.startsWith(marker)) {
    await copySecretUtilities(serverDir)
    await writeFile(runtime, source)
    await writeWrapper(serverDir)
    return
  }

  // `index.mjs` is already our wrapper. The original Nitro entry must exist so a
  // repeated hook can refresh the wrapper without losing the runtime module.
  try {
    await access(runtime)
  } catch (error) {
    if (error.code === 'ENOENT')
      throw new Error(
        `Cannot refresh ${entry}: ${runtime} is missing. Run a clean build.`,
      )
    throw error
  }
  await copySecretUtilities(serverDir)
  await writeWrapper(serverDir)
}
