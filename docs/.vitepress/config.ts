import { defineConfig } from 'vitepress'
import zhConfig from '../zh/config'

// https://vitepress.dev/reference/site-config
export default defineConfig({
  title: 'ChronoFrame',
  description: 'A Self-hosted photo gallery',
  head: [
    ['link', { rel: 'icon', href: '/favicon.ico' }],
    [
      'script',
      {
        async: '',
        src: 'https://www.googletagmanager.com/gtag/js?id=G-RQSZM9PP5F',
      },
    ],
    [
      'script',
      {},
      `window.dataLayer = window.dataLayer || [];
      function gtag(){dataLayer.push(arguments);}
      gtag('js', new Date());
      gtag('config', 'G-RQSZM9PP5F');`,
    ],
    [
      'script',
      {
        async: '',
        src: 'https://pagead2.googlesyndication.com/pagead/js/adsbygoogle.js?client=ca-pub-7236608137732943',
        crossorigin: 'anonymous',
      },
    ],
  ],
  lastUpdated: true,
  themeConfig: {
    logo: { src: '/logo.png', alt: 'ChronoFrame' },
    // https://vitepress.dev/reference/default-theme-config
    nav: [
      { text: 'Guide', link: '/guide/getting-started' },
      { text: 'Development', link: '/development/contributing' },
      { text: 'Changelog', link: '/changelog' },
      { text: 'Demo Sites', link: '/demo-sites' },
    ],

    sidebar: [
      {
        text: 'Guide',
        items: [
          { text: 'Getting Started', link: '/guide/getting-started' },
          { text: 'Using ChronoFrame', link: '/guide/usage' },
          { text: 'Update Guide', link: '/guide/updates' },
          { text: 'Changelog', link: '/changelog' },
          { text: 'Demo Sites', link: '/demo-sites' },
        ],
      },
      {
        text: 'Development',
        items: [
          { text: 'Contributing', link: '/development/contributing' },
          { text: 'API Documentation', link: '/development/api' },
          { text: 'Adding a Setting', link: '/development/how-to-add-setting' },
        ],
      },
      {
        text: 'Legacy',
        collapsed: true,
        items: [{ text: 'Archived documentation', link: '/legacy/' }],
      },
    ],

    socialLinks: [
      { icon: 'github', link: 'https://github.com/HoshinoSuzumi/chronoframe' },
      { icon: 'discord', link: 'https://discord.gg/MM4ZK4Ed7s' },
    ],

    editLink: {
      pattern:
        'https://github.com/HoshinoSuzumi/chronoframe/edit/main/docs/:path',
      text: 'Edit this page on GitHub',
    },

    search: {
      provider: 'local',
    },

    footer: {
      message: 'Released under the MIT License.',
      copyright: 'Copyright © 2025 Timothy Yin',
    },
  },
  locales: {
    root: {
      label: 'English',
      lang: 'en',
    },
    zh: {
      label: '简体中文',
      lang: 'zh',
      link: '/zh/',
      themeConfig: zhConfig.themeConfig,
    },
  },

  ignoreDeadLinks: [/^http?:\/\/localhost/],
})
