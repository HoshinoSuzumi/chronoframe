import type { App } from 'vue'
import DefaultTheme from 'vitepress/theme'
import AdsenseToc from './components/AdsenseToc.vue'
import Layout from './Layout.vue'
import DemoSites from './components/DemoSites.vue'

export default {
  ...DefaultTheme,
  enhanceApp({ app }: { app: App }) {
    app.component('AdsenseToc', AdsenseToc)
    app.component('DemoSites', DemoSites)
  },
  Layout,
}
