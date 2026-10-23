import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import vm from 'node:vm'
import ts from 'typescript'

test('image Blob cache does not reuse another Site/principal URL and clears on scope changes', async () => {
  const load = (path: string, imports: Record<string, unknown>) => {
    const exports: Record<string, any> = {}
    const code = ts.transpileModule(readFileSync(path, 'utf8'), {
      compilerOptions: {
        module: ts.ModuleKind.CommonJS,
        target: ts.ScriptTarget.ES2022,
      },
    }).outputText
    vm.runInNewContext(code, {
      exports,
      URL,
      console,
      require: (name: string) => {
        assert.ok(name in imports, name)
        return imports[name]
      },
    })
    return exports
  }
  const lru = load('packages/gallery/app/libs/lru.ts', {})
  const module = load('packages/gallery/app/libs/image-loader-manager.ts', {
    './lru': lru,
    'file-type': {},
  })
  const first = new module.ImageLoaderManager('site1:user1')
  const second = new module.ImageLoaderManager('site2:user1')
  const third = new module.ImageLoaderManager('site1:user2')
  const image = new Blob(['test-image'], { type: 'image/jpeg' })
  const src = '/private/image.jpg'
  assert.equal((await first.processNormalImage(image, src, {})).blobSrc, src)
  assert.match(
    (await first.processNormalImage(image, src, {})).blobSrc,
    /^blob:/,
  )
  assert.equal((await second.processNormalImage(image, src, {})).blobSrc, src)
  assert.equal((await third.processNormalImage(image, src, {})).blobSrc, src)
  module.clearImageLoaderCache()
  assert.equal((await first.processNormalImage(image, src, {})).blobSrc, src)
  module.clearImageLoaderCache()
})
