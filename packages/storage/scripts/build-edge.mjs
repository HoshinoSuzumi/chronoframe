import { build } from 'esbuild'
import { fileURLToPath } from 'node:url'
import { mkdir, readFile } from 'node:fs/promises'
const root = fileURLToPath(new URL('..', import.meta.url))
await mkdir(root + '/dist', { recursive: true })
const result = await build({
  entryPoints: [root + '/src/s3-edge.ts'],
  outfile: root + '/dist/s3-edge.mjs',
  bundle: true,
  platform: 'browser',
  format: 'esm',
  target: 'es2022',
  minify: true,
  metafile: true,
  // Workers have no DOMParser. Use the SDK's own dependency-free XML parser
  // while keeping the rest of the SDK on its browser/Fetch runtime.
  plugins: [
    {
      name: 'worker-sdk-xml',
      setup(builder) {
        builder.onLoad(
          { filter: /xml-parser\.browser\.js$/ },
          async (args) => ({
            contents: await readFile(
              args.path.replace(/xml-parser\.browser\.js$/, 'xml-parser.js'),
              'utf8',
            ),
            loader: 'js',
          }),
        )
      },
    },
  ],
})
const prohibited = Object.keys(result.metafile.inputs).filter((name) =>
  /credential-provider-node|node-http-handler|shared-ini-file-loader/.test(
    name,
  ),
)
if (/\bDOMParser\b/.test(await readFile(root + '/dist/s3-edge.mjs', 'utf8')))
  throw new Error('DOM-only XML dependency in edge build')
if (prohibited.length) throw new Error('Node-only S3 dependency in edge build')
console.log(
  'Built browser S3 transport without Node credential files or HTTP agents.',
)
