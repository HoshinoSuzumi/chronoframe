import assert from 'node:assert/strict'
import test from 'node:test'
import { createRequire } from 'node:module'
import { readFile } from 'node:fs/promises'
import {
  legalDocument,
  validateLegalDocument,
  LEGAL_KINDS,
  LEGAL_LOCALES,
} from '../packages/platform/src/legal.ts'
import { renderMarkdown } from '../packages/saas-ui/app/utils/markdown.ts'
import type { PlatformD1 } from '../packages/platform/src/index.ts'
const require = createRequire(import.meta.url)
const { Miniflare, convertV4MiniflareOptions } = createRequire(
  require.resolve('wrangler/package.json'),
)('miniflare')
test('Legal Markdown disables raw HTML, unsafe URL protocols and remote image requests', () => {
  const html = renderMarkdown(
    '# Title\n\n<script>alert(1)</script>\n\n[x](javascript:alert(1))\n\n[y](data:text/html,test)\n\n[z](file:///etc/passwd)\n\n![tracker](https://tracker.example/pixel)\n\n[Terms](/legal/terms)\n\n[Support](mailto:support@chronoframe.art)\n\n**Bold**',
  )
  assert(!/<script|<img|href="(?:javascript|data|file):/i.test(html))
  assert(html.includes('&lt;script&gt;'))
  assert(html.includes('href="/legal/terms"'))
  assert(html.includes('href="mailto:support@chronoframe.art"'))
  assert(html.includes('<strong>Bold</strong>'))
  const preview = renderMarkdown(
    '[Privacy](/legal/privacy)',
    'https://app.chronoframe.art',
  )
  assert(preview.includes('href="https://app.chronoframe.art/legal/privacy"'))
  assert(preview.includes('rel="noopener noreferrer"'))
})
test('Legal document validation rejects invalid dates, locales, revisions and oversized UTF-8 content', () => {
  const valid = {
    kind: 'terms',
    locale: 'en',
    title: ' Terms ',
    markdown: ' **Content** ',
    effectiveOn: '2026-10-29',
    revision: 0,
  }
  assert.equal(validateLegalDocument(valid).title, 'Terms')
  for (const patch of [
    { kind: 'other' },
    { locale: 'fr' },
    { title: '' },
    { markdown: '' },
    { markdown: '中'.repeat(34000) },
    { effectiveOn: '2026-02-31' },
    { effectiveOn: 'yesterday' },
    { revision: -1 },
    { revision: 1.5 },
  ])
    assert.throws(() => validateLegalDocument({ ...valid, ...patch }))
})
test('D1 legal documents provide complete bilingual defaults and isolate saved locale revisions', async () => {
  const mf = new Miniflare(
    convertV4MiniflareOptions({
      modules: true,
      compatibilityDate: '2026-10-26',
      script: 'export default {fetch(){return new Response("ok")}}',
      d1Databases: ['DB'],
    }),
  )
  try {
    const db = await mf.getD1Database('DB')
    await db
      .prepare(
        await readFile(
          new URL(
            '../packages/platform/migrations/0026_legal_documents.sql',
            import.meta.url,
          ),
          'utf8',
        ),
      )
      .run()
    for (const kind of LEGAL_KINDS)
      for (const locale of LEGAL_LOCALES) {
        const doc = await legalDocument(db as PlatformD1, kind, locale)
        assert(doc.markdown.length > 500)
        assert.equal(doc.revision, 0)
        assert.equal(doc.updatedAt, null)
        assert(doc.markdown.includes('support@chronoframe.art'))
      }
    await db
      .prepare(
        "INSERT INTO platform_legal_documents VALUES('terms','en','Updated terms','## New content','2026-11-01',1,42)",
      )
      .run()
    const updated = await legalDocument(db as PlatformD1, 'terms', 'en')
    assert.equal(updated.title, 'Updated terms')
    assert.equal(updated.updatedAt, 42)
    assert.equal(updated.revision, 1)
    assert.equal(
      (await legalDocument(db as PlatformD1, 'terms', 'zh-Hans')).revision,
      0,
    )
    assert.equal(
      (await legalDocument(db as PlatformD1, 'privacy', 'en')).revision,
      0,
    )
  } finally {
    await mf.dispose()
  }
})
