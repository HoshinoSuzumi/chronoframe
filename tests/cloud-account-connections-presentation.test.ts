import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { createRequire } from 'node:module'
import { createSSRApp, compile, h } from 'vue'
const { renderToString } = createRequire(
  createRequire(import.meta.url).resolve('vue/package.json'),
)('@vue/server-renderer')

test('Connected account labels use the remote name without dot separators and escape provider content', async () => {
  const template = readFileSync(
    'apps/cloud/app/components/CloudAccountConnections.vue',
    'utf8',
  )
    .split('<template>')[1]!
    .split('</template>\n<style')[0]!
  const app = createSSRApp({
    setup: () => ({
      rows: [
        {
          provider: { id: 'github', name: 'GitHub', icon: '' },
          account: { id: '1', username: 'HoshinoSuzumi', canUnlink: true },
          enabled: true,
        },
        {
          provider: { id: 'google', name: 'Google', icon: '' },
          account: {
            id: '2',
            username: '<img src=x onerror=alert(1)>',
            canUnlink: true,
          },
          enabled: true,
        },
        {
          provider: { id: 'discord', name: 'Discord', icon: '' },
          account: { id: '3', username: null, canUnlink: true },
          enabled: false,
        },
      ],
      loadError: null,
      data: {},
      busy: '',
      removing: null,
    }),
    render: compile(template),
  })
  app.config.globalProperties.$t = (key: string) => key
  for (const name of ['CfCard', 'CfButton', 'UIcon'])
    app.component(name, {
      setup(_props, context) {
        return () => h('div', context.slots.default?.())
      },
    })
  app.component('UModal', { render: () => null })
  const html = await renderToString(app)
  assert.match(
    html,
    /cloud.connections.linked\s*<span[^>]*>HoshinoSuzumi<\/span>/,
  )
  assert(html.includes('&lt;img src=x onerror=alert(1)&gt;'))
  assert(!html.includes('<img src=x'))
  assert(!html.includes('·'))
  assert(html.includes('cloud.connections.disabled'))
  assert(!html.includes('>null<'))
})
