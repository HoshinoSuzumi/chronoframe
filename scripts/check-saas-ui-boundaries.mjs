import { readFile, readdir } from 'node:fs/promises'
import { resolve, dirname, relative } from 'node:path'

const root = resolve('packages/saas-ui')
async function sources(directory) {
  return (
    await Promise.all(
      (await readdir(directory, { withFileTypes: true }))
        .filter((e) => e.name !== 'node_modules' && !e.name.startsWith('.'))
        .map(async (e) => {
          const path = resolve(directory, e.name)
          return e.isDirectory()
            ? sources(path)
            : /\.(vue|ts|css)$/.test(path)
              ? [path]
              : []
        }),
    )
  ).flat()
}
const failures = []
for (const file of await sources(root)) {
  const source = await readFile(file, 'utf8')
  if (file.endsWith('.css')) continue // Tailwind @source deliberately scans consumers.
  for (const match of source.matchAll(
    /(?:from\s*|import\s*(?:\(\s*)?)['"]([^'"]+)['"]/g,
  )) {
    const specifier = match[1]
    if (
      /apps\/(cloud|admin)|#console|#platform|@chronoframe\/(?!saas-ui)|(?:^|\/)server\//.test(
        specifier,
      )
    )
      failures.push(`${file}: ${specifier}`)
    if (
      specifier.startsWith('.') &&
      relative(root, resolve(dirname(file), specifier)).startsWith('..')
    )
      failures.push(`${file}: escapes shared UI`)
  }
  if (/useCloud\w+|useEntryContext|usePortalIdentity|\/api\//.test(source))
    failures.push(`${file}: business logic in presentation layer`)
}
const cloud = await readFile('apps/cloud/nuxt.config.ts', 'utf8')
if (!cloud.includes('../../packages/saas-ui'))
  failures.push('Cloud must extend the SaaS UI layer')
for (const file of await sources(resolve('apps/cloud/app'))) {
  const source = await readFile(file, 'utf8')
  if (
    /<Cloud(?:Button|Input|Select|Card|Badge|Progress|Alert|Skeleton|Separator|RadioGroup|StatCard|PageHeader)\b/.test(
      source,
    )
  )
    failures.push(`${file}: use shared Cf primitives`)
}
// When Admin is implemented, opting into the same foundation is mandatory.
try {
  const admin = await readFile('apps/admin/nuxt.config.ts', 'utf8')
  if (!/packages\/saas-ui|@chronoframe\/saas-ui/.test(admin))
    failures.push('Admin must extend the SaaS UI layer')
} catch (error) {
  if (error.code !== 'ENOENT') throw error
}
if (failures.length) throw new Error(failures.join('\n'))
console.log(
  'SaaS UI boundaries passed: shared presentation has no Cloud/Admin business dependencies.',
)
