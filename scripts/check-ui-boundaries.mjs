import { readdir, readFile } from 'node:fs/promises'
import path from 'node:path'

async function files(dir) {
  const entries = await readdir(dir, { withFileTypes: true })
  return (
    await Promise.all(
      entries.map((entry) =>
        entry.isDirectory()
          ? files(path.join(dir, entry.name))
          : /\.(ts|vue)$/.test(entry.name) && !entry.name.endsWith('.test.ts')
            ? [path.join(dir, entry.name)]
            : [],
      ),
    )
  ).flat()
}
const failures = []
for (const name of ['console', 'gallery']) {
  for (const file of await files(`packages/${name}/app`)) {
    const source = await readFile(file, 'utf8')
    for (const match of source.matchAll(
      /(?:from\s*|import\s*(?:\(\s*)?)['"]([^'"]+)['"]/g,
    )) {
      const specifier = match[1]
      if (
        specifier.startsWith('.') &&
        !path
          .resolve(path.dirname(file), specifier)
          .startsWith(path.resolve(`packages/${name}`) + path.sep)
      )
        failures.push(`${file}: escapes UI package: ${specifier}`)
      if (
        /^(?:~~?\/|@@?\/|@chronoframe\/(?:database|jobs|processing|storage|media|geocoding)(?:\/|$))/.test(
          specifier,
        ) ||
        /(?:^|\/)server(?:\/|$)/.test(specifier) ||
        (name === 'gallery' &&
          /^(?:#console|@chronoframe\/console)(?:\/|$)/.test(specifier))
      )
        failures.push(`${file}: ${specifier}`)
    }
    if (
      name === 'gallery' &&
      /\/api\/system\/settings\/(?:fields|batch|storage-config)/.test(source)
    )
      failures.push(`${file}: portal-only configuration API`)
  }
}
if (failures.length) throw new Error(failures.join('\n'))
console.log(
  'UI boundaries passed: gallery is independent of console, entry aliases and server implementations; public configuration stays separate.',
)
