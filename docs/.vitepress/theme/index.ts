import type { App } from 'vue'
import DefaultTheme from 'vitepress/theme'
import AdsenseToc from './components/AdsenseToc.vue'
import Layout from './Layout.vue'
import DocTabs from './components/DocTabs.vue'
import StorageChoices from './components/StorageChoices.vue'
import DocStep from './components/DocStep.vue'
import DemoSites from './components/DemoSites.vue'

export default {
  ...DefaultTheme,
  enhanceApp({ app }: { app: App }) {
    app.component('AdsenseToc', AdsenseToc)
    app.component('DocTabs', DocTabs)
    app.component('StorageChoices', StorageChoices)
    app.component('DocStep', DocStep)
    app.component('DemoSites', DemoSites)
  },
  Layout,
}
