import { existsSync } from 'node:fs'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { createRequire } from 'node:module'
import { spawn, execFileSync } from 'node:child_process'
const root = fileURLToPath(new URL('../', import.meta.url))
const [entry, command = 'dev', ...args] = process.argv.slice(2)
if (
  !['cloud', 'site'].includes(entry) ||
  !['dev', 'build', 'prepare', 'preview'].includes(command)
)
  throw new Error('Expected cloud|site and dev|build|prepare|preview')
const app = resolve(root, 'apps', entry)
if (command === 'prepare' && !existsSync(resolve(app, 'nuxt.config.ts'))) {
  console.log('Application preparation deferred until sources are available.')
} else {
  if (command === 'build')
    execFileSync(
      process.execPath,
      [resolve(root, 'packages/storage/scripts/build-edge.mjs')],
      { cwd: root, stdio: 'inherit' },
    )
  const require = createRequire(import.meta.url)
  const cli = resolve(
    dirname(require.resolve('nuxt/package.json')),
    'bin/nuxt.mjs',
  )
  const env = { ...process.env }
  if (command === 'build')
    env.NODE_OPTIONS = [env.NODE_OPTIONS, '--max-old-space-size=4096']
      .filter(Boolean)
      .join(' ')
  const child = spawn(
    process.execPath,
    [cli, command, app, '--dotenv', resolve(app, '.env'), ...args],
    { cwd: app, env, stdio: 'inherit' },
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
