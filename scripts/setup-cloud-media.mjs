import { randomBytes, randomUUID } from 'node:crypto'
import { mkdir, readFile, writeFile, realpath, chmod } from 'node:fs/promises'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { spawnSync } from 'node:child_process'
const args = process.argv.slice(2)
const options = {}
for (let i = 0; i < args.length; i += 2) {
  if (
    !['--environment', '--portal', '--directory'].includes(args[i]) ||
    !args[i + 1]
  )
    throw new Error(
      'Use --environment staging|production --portal https://portal.origin --directory /private/path',
    )
  options[args[i].slice(2)] = args[i + 1]
}
const { environment, portal, directory } = options
if (
  !['staging', 'production'].includes(environment) ||
  !portal ||
  new URL(portal).protocol !== 'https:' ||
  new URL(portal).origin !== portal ||
  !directory ||
  !path.isAbsolute(directory)
)
  throw new Error(
    'Explicit environment, HTTPS origin and absolute private output directory are required',
  )
await mkdir(directory, { recursive: true, mode: 0o700 })
const target = await realpath(directory),
  root = await realpath(fileURLToPath(new URL('..', import.meta.url)))
if (target === root || target.startsWith(root + path.sep))
  throw new Error('Keep generated secrets outside the repository')
const envName = 'saas-' + environment
function gh(args, input) {
  const result = spawnSync(
    'gh',
    [...args, '--repo', 'HoshinoSuzumi/chronoframe'],
    { input, encoding: 'utf8' },
  )
  if (result.status !== 0)
    throw new Error(
      'GitHub secret configuration failed; inspect CLI authorization without logging secret values',
    )
  return result.stdout
}
const existing = JSON.parse(
  gh(['secret', 'list', '--env', envName, '--json', 'name']),
)
const file = path.join(target, environment + '-media-secrets.json')
let secrets
try {
  secrets = JSON.parse(await readFile(file, 'utf8'))
} catch (error) {
  if (error.code !== 'ENOENT') throw error
}
if (
  !secrets &&
  existing.some((s) =>
    ['PLATFORM_STORAGE_SECRET', 'PLATFORM_WORKER_SECRET'].includes(s.name),
  )
)
  throw new Error(
    'Secrets already exist remotely. Use the original protected output directory; do not silently rotate a storage encryption key',
  )
if (!secrets) {
  secrets = {
    storage: randomBytes(48).toString('base64url'),
    worker: randomBytes(48).toString('base64url'),
    workerId: randomUUID(),
    environment,
  }
  await writeFile(file, JSON.stringify(secrets), { mode: 0o600, flag: 'wx' })
}
if (
  secrets.environment !== environment ||
  secrets.storage?.length < 32 ||
  secrets.worker?.length < 32
)
  throw new Error('Invalid protected configuration')
await chmod(file, 0o600)
gh(
  ['secret', 'set', 'PLATFORM_STORAGE_SECRET', '--env', envName],
  secrets.storage,
)
gh(
  ['secret', 'set', 'PLATFORM_WORKER_SECRET', '--env', envName],
  secrets.worker,
)
const workerEnv = path.join(target, environment + '-worker.env')
await writeFile(
  workerEnv,
  `CHRONOFRAME_PORTAL_ORIGIN=${portal}\nCHRONOFRAME_WORKER_SECRET=${secrets.worker}\nCHRONOFRAME_WORKER_ID=${secrets.workerId}\n`,
  { mode: 0o600 },
)
await chmod(workerEnv, 0o600)
console.log(
  `Configured ${envName}. Protected worker configuration: ${workerEnv}. Back up the media-secrets.json file securely; losing its storage key makes stored credentials unreadable. No deployment has been started.`,
)
