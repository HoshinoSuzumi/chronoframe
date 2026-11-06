import { copyFile, readFile, writeFile } from 'node:fs/promises'
import { join } from 'node:path'

const marker = '// ChronoFrame private app-secret bootstrap'

/** Keep the generated Node entry usable directly, in preview and in Docker. */
export async function prepareSelfHostedRuntime(serverDir) {
  const entry = join(serverDir, 'index.mjs')
  const source = await readFile(entry, 'utf8')
  if (source.startsWith(marker)) return
  await copyFile(
    new URL('../server/utils/app-secret.mjs', import.meta.url),
    join(serverDir, 'app-secret.mjs'),
  )
  await copyFile(
    new URL('../server/utils/app-secret-validation.mjs', import.meta.url),
    join(serverDir, 'app-secret-validation.mjs'),
  )
  await writeFile(join(serverDir, 'index.runtime.mjs'), source)
  await writeFile(
    entry,
    `${marker}
import { resolve } from 'node:path'
import { ensureAppSecret } from './app-secret.mjs'
const { secret, source } = ensureAppSecret(resolve(process.cwd(), 'data/.app-secret'))
if (source !== 'legacy') process.env.NUXT_APP_SECRET = JSON.stringify(secret)
const runtime = await import('./index.runtime.mjs')
export default runtime.default
`,
  )
}
