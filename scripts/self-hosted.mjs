import { existsSync } from 'node:fs'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { createRequire } from 'node:module'
import { spawn } from 'node:child_process'
const root = fileURLToPath(new URL('../', import.meta.url))
const app = resolve(root, 'apps/self-hosted')
const [command = 'dev', ...args] = process.argv.slice(2)
if (command === 'prepare' && !existsSync(resolve(app, 'nuxt.config.ts'))) {
  console.log('Application preparation deferred until sources are available.')
} else {
  const require = createRequire(import.meta.url)
  const cli = resolve(
    dirname(require.resolve('nuxt/package.json')),
    'bin/nuxt.mjs',
  )
  const env = { ...process.env }
  if (command === 'build')
    env.NODE_OPTIONS = [env.NODE_OPTIONS, '--max-old-space-size=8192']
      .filter(Boolean)
      .join(' ')
  const child = spawn(
    process.execPath,
    [cli, command, app, '--dotenv', resolve(root, '.env'), ...args],
    { cwd: root, env, stdio: 'inherit' },
  )
  for (const signal of ['SIGINT', 'SIGTERM'])
    process.on(signal, () => child.kill(signal))
  child.on('error', (error) => {
    console.error(error)
    process.exitCode = 1
  })
  child.on('exit', (code) => {
    process.exitCode = code ?? 1
  })
}
