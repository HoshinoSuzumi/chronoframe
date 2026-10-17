import assert from 'node:assert/strict'
import test from 'node:test'
import { createHead, renderSSRHead } from '@unhead/vue/server'
import { parseScriptTags } from '../app/utils/parseScriptTags.ts'

test('preserves the Umami website ID alongside standard script attributes', () => {
  assert.deepEqual(
    parseScriptTags(
      '<script defer src="https://tongji.example.com/script.js" data-website-id="website-id"></script>',
    ),
    [
      {
        defer: true,
        src: 'https://tongji.example.com/script.js',
        'data-website-id': 'website-id',
      },
    ],
  )
})

test('normalizes data attribute names and preserves string and empty values', () => {
  assert.deepEqual(
    parseScriptTags(
      `<script src="tracker.js" DATA-WEBSITE-ID='site' data-auto-track="false" data-count=0 data-empty="" data-enabled></script>`,
    ),
    [
      {
        src: 'tracker.js',
        'data-website-id': 'site',
        'data-auto-track': 'false',
        'data-count': '0',
        'data-empty': '',
        'data-enabled': '',
      },
    ],
  )
})

test('keeps the standard attribute allowlist and inline script behavior', () => {
  assert.deepEqual(
    parseScriptTags(
      '<script async defer nomodule type="module" nonce="token" onload="alert(1)" key="override" tagPosition="bodyClose" data-="invalid" unknown="value" data-config="inline">console.log("ok")</script>',
    ),
    [
      {
        async: true,
        defer: true,
        nomodule: true,
        type: 'module',
        nonce: 'token',
        'data-config': 'inline',
        innerHTML: 'console.log("ok")',
      },
    ],
  )
  assert.deepEqual(
    parseScriptTags('<script data-website-id="site"></script>'),
    [],
  )
})

test('renders data attributes in both head and body scripts through Unhead', async () => {
  const head = createHead()
  head.push({
    script: ['head', 'bodyOpen'].flatMap((tagPosition) =>
      parseScriptTags(
        '<script defer src="tracker.js" data-website-id="site" data-auto-track="false" data-enabled></script>',
      ).map((script) => ({
        ...script,
        tagPosition: tagPosition as 'head' | 'bodyOpen',
        key: `cf-analytics-${tagPosition}-0`,
      })),
    ),
  })
  const rendered = await renderSSRHead(head)
  for (const html of [rendered.headTags, rendered.bodyTagsOpen]) {
    assert.match(html, /data-website-id="site"/)
    assert.match(html, /data-auto-track="false"/)
    assert.match(html, /data-enabled(?:="")?(?=[\s>])/)
    assert.match(html, /src="tracker.js"/)
  }
})
