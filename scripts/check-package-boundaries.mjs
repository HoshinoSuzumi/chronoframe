import { readFile, readdir } from 'node:fs/promises'
import path from 'node:path'
import { builtinModules } from 'node:module'
import ts from 'typescript'

const packageNames = [
  'contracts',
  'core',
  'database',
  'jobs',
  'processing',
  'storage',
  'media',
  'geocoding',
]
const builtins = new Set(
  builtinModules.map((name) => name.replace(/^node:/, '')),
)
const failures = []

/** Recursively collect TypeScript source paths for static package dependency checks. */
async function files(directory) {
  const entries = await readdir(directory, { withFileTypes: true })
  return (
    await Promise.all(
      entries.map((entry) =>
        entry.isDirectory()
          ? files(path.join(directory, entry.name))
          : entry.name.endsWith('.ts')
            ? [path.join(directory, entry.name)]
            : [],
      ),
    )
  ).flat()
}

for (const name of packageNames) {
  const root = path.resolve('packages', name)
  const manifest = JSON.parse(
    await readFile(path.join(root, 'package.json'), 'utf8'),
  )
  const allowed = new Set(
    Object.keys({
      ...manifest.dependencies,
      ...manifest.devDependencies,
      ...manifest.peerDependencies,
    }),
  )
  for (const file of await files(path.join(root, 'src'))) {
    const source = ts.createSourceFile(
      file,
      await readFile(file, 'utf8'),
      ts.ScriptTarget.Latest,
      true,
    )
    function inspect(node) {
      const specifier =
        ts.isImportDeclaration(node) || ts.isExportDeclaration(node)
          ? node.moduleSpecifier
          : ts.isImportTypeNode(node) && ts.isLiteralTypeNode(node.argument)
            ? node.argument.literal
            : ts.isCallExpression(node) &&
                node.expression.kind === ts.SyntaxKind.ImportKeyword
              ? node.arguments[0]
              : undefined
      if (specifier && ts.isStringLiteral(specifier)) {
        const value = specifier.text
        const fail = (reason) =>
          failures.push(
            `${path.relative(process.cwd(), file)}: ${value}: ${reason}`,
          )
        if (value.startsWith('.')) {
          if (
            !path.resolve(path.dirname(file), value).startsWith(root + path.sep)
          )
            fail('relative import leaves package')
        } else if (
          value.startsWith('~') ||
          value.startsWith('#') ||
          value.startsWith('/')
        ) {
          fail('application aliases and absolute imports are forbidden')
        } else if (builtins.has(value.replace(/^node:/, ''))) {
          if (name === 'contracts' || name === 'core')
            fail('contracts and core must be runtime-independent')
        } else {
          const dependency = value.startsWith('@')
            ? value.split('/').slice(0, 2).join('/')
            : value.split('/')[0]
          if (!allowed.has(dependency)) fail('dependency is not declared')
        }
      }
      ts.forEachChild(node, inspect)
    }
    inspect(source)
  }
}
if (failures.length) {
  console.error(failures.join('\n'))
  process.exitCode = 1
} else console.log(`Package boundaries passed (${packageNames.join(', ')}).`)
