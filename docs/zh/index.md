---
# https://vitepress.dev/reference/default-theme-home-page
layout: home

hero:
  name: 'ChronoFrame'
  text: '自部署个人画廊'
  tagline: '把日常与旅途，留在自己的相框中。'
  image:
    src: /logo.png
    alt: ChronoFrame
    style: 'filter: drop-shadow(0 0 30px rgba(168, 85, 247, 0.7)) drop-shadow(0 0 60px rgba(59, 130, 246, 0.5)) drop-shadow(0 0 100px rgba(168, 85, 247, 0.3)); width: 300px; height: 300px;'
  actions:
    - theme: brand
      text: 快速开始
      link: /zh/guide/getting-started
    - theme: alt
      text: 查看 GitHub
      link: https://github.com/HoshinoSuzumi/chronoframe
    - theme: alt
      text: 演示站点
      link: /zh/demo-sites

features:
  - title: 照片管理
    icon: 🖼️
    details: 批量上传、编辑照片信息，用筛选和排序找到想看的照片。
  - title: 简单部署
    icon: 🚀
    details: 使用 Docker 启动，跟随向导完成设置，无需单独安装数据库。
  - title: 多种存储
    icon: 💾
    details: 支持本地文件系统、S3 兼容存储和 OpenList，在后台管理存储方案。
  - title: 地图与地点
    icon: 🌍
    details: 根据照片的 GPS 识别拍摄地点，在地图上回顾去过的地方。
  - title: 相册与隐私
    icon: 🔒
    details: 按主题整理相册、调整照片顺序，也可以隐藏相册或设置访问密码。
  - title: 实况照片
    icon: 🎬
    details: 支持 Apple Live Photo 和 Motion Photo，在浏览照片时播放其中的动态片段。
---

## 🌍 演示站点

在[演示站点页面](/zh/demo-sites)浏览开发者和社区用户分享的画廊。

## 💬 社区支持

- **GitHub Issues**: [报告问题](https://github.com/HoshinoSuzumi/chronoframe/issues/new/choose)
- **GitHub Discussions**: [讨论分享](https://github.com/HoshinoSuzumi/chronoframe/discussions)
- **Discord**: [加入我们](https://discord.gg/MM4ZK4Ed7s)

## 📄 开源协议

ChronoFrame 默认采用 [AGPL-3.0-only](https://github.com/HoshinoSuzumi/chronoframe/blob/main/LICENSE)，contracts 和 webgl-image 包保留 MIT。适用范围、历史 MIT 权利和 ChronoFrame 的商业授权说明见[许可指南](https://github.com/HoshinoSuzumi/chronoframe/blob/main/LICENSING.md)。
