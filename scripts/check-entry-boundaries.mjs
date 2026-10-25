import { readdir, readFile } from 'node:fs/promises'
import path from 'node:path'
async function sources(directory) {
  const entries = await readdir(directory, { withFileTypes: true })
  return (
    await Promise.all(
      entries
        .filter(
          (entry) =>
            !entry.name.startsWith('.') && entry.name !== 'node_modules',
        )
        .map(async (entry) => {
          const file = path.join(directory, entry.name)
          return entry.isDirectory()
            ? sources(file)
            : /\.(?:ts|vue|mjs)$/.test(file)
              ? [file]
              : []
        }),
    )
  ).flat()
}
const failures = []
for (const entry of ['cloud', 'site']) {
  for (const file of [
    ...(await sources(`apps/${entry}`)),
    'apps/nuxt.shared.ts',
    ...(await sources('apps/shared/platform')),
  ]) {
    const code = await readFile(file, 'utf8')
    for (const match of code.matchAll(
      /(?:from\s*|import\s*(?:\(\s*)?)['"]([^'"]+)['"]/g,
    )) {
      const specifier = match[1]
      const resolved = specifier.startsWith('.')
        ? path.resolve(path.dirname(file), specifier)
        : specifier
      if (
        /\/(?:server|app|shared)\//.test(file) &&
        /^(?:node:)?(?:fs(?:\/|$)|child_process|worker_threads)/.test(specifier)
      )
        failures.push(`${file}: ${specifier}`)
      const edgeSafe = [
        '@chronoframe/database/cloud-media',
        '@chronoframe/database/cloud-execution',
        '@chronoframe/database/cloud-resources',
        '@chronoframe/database/cloud-album-slugs',
        '@chronoframe/storage/s3-edge',
        '@chronoframe/storage/credential-cipher',
        '@chronoframe/storage/connection-probe',
      ].includes(specifier)
      if (
        !edgeSafe &&
        /self-hosted|@chronoframe\/(?:database|storage|media|processing|jobs)(?:\/|$)|better-sqlite3|exiftool|sharp|heic-convert/.test(
          specifier,
        )
      )
        failures.push(`${file}: ${specifier}`)
      if (
        /\/packages\/(?:database|storage|media|processing|jobs)(?:\/|$)|\/apps\/self-hosted(?:\/|$)/.test(
          resolved,
        )
      )
        failures.push(`${file}: ${specifier}`)
      if (
        entry === 'site' &&
        (/#console|@chronoframe\/console/.test(specifier) ||
          /\/apps\/cloud(?:\/|$)/.test(resolved))
      )
        failures.push(`${file}: ${specifier}`)
    }
  }
}
if (failures.length) throw new Error(failures.join('\n'))
console.log(
  'Edge entry boundaries passed: no Self-hosted/native adapters; site has no console dependency.',
)

if (process.argv.includes('--built')) {
  const entry = process.argv.find((arg) => ['cloud', 'site'].includes(arg))
  if (!entry) throw new Error('Expected a built cloud or site entry')
  for (const file of await sources(`apps/${entry}/.output/server`)) {
    const code = await readFile(file, 'utf8')
    if (
      /better-sqlite3|exiftool-vendored|heic-convert|@takumi-rs\/core/.test(
        code,
      )
    )
      throw new Error(`Native dependency in Worker: ${file}`)
  }
  console.log(
    `Built ${entry} Worker has no Self-hosted native dependency markers.`,
  )
}
