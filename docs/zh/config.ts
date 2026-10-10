import { defineConfig } from 'vitepress'

// https://vitepress.dev/reference/site-config
export default defineConfig({
  title: 'ChronoFrame',
  description: '自部署、在线管理的个人画廊',
  themeConfig: {
    // https://vitepress.dev/reference/default-theme-config
    nav: [
      { text: '指南', link: '/zh/guide/getting-started' },
      { text: '开发文档', link: '/zh/development/contributing' },
      { text: '更新日志', link: '/zh/changelog' },
      { text: '演示站点', link: '/zh/demo-sites' },
    ],

    sidebar: [
      {
        text: '指南',
        items: [
          { text: '快速开始', link: '/zh/guide/getting-started' },
          { text: '日常使用', link: '/zh/guide/usage' },
          { text: '升级指南', link: '/zh/guide/updates' },
          { text: '更新日志', link: '/zh/changelog' },
          { text: '演示站点', link: '/zh/demo-sites' },
        ],
      },
      {
        text: '开发',
        items: [
          { text: '贡献指南', link: '/zh/development/contributing' },
          { text: 'API 文档', link: '/zh/development/api' },
          { text: '添加设置项', link: '/zh/development/how-to-add-setting' },
        ],
      },
      {
        text: 'Legacy',
        collapsed: true,
        items: [{ text: '历史文档', link: '/zh/legacy/' }],
      },
    ],

    editLink: {
      text: '在 GitHub 上编辑此页面',
    },
  },
})
