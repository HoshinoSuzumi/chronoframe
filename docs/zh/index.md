---
# https://vitepress.dev/reference/default-theme-home-page
layout: home

hero:
  name: 'ChronoFrame'
  text: '自部署个人画廊'
  tagline: '上传、整理和分享照片，在网页中完成站点设置'
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
  - title: 强大的照片管理
    icon: 🖼️
    details: 通过网页界面轻松管理和浏览照片，并在地图上查看照片拍摄地点。
  - title: 简单部署
    icon: 🚀
    details: 使用 Docker 启动后，通过设置向导创建管理员和选择存储。SQLite 数据库随应用运行，无需单独部署。
  - title: 灵活的存储方案
    icon: 💾
    details: 支持本地文件系统、S3 兼容存储和 OpenList，在后台管理存储方案。
  - title: 智能地理位置
    icon: 🌍
    details: 提取照片 GPS，通过反向地理编码识别地点，使用 MapLibre 或 Mapbox 浏览地图。
  - title: 相册与隐私
    icon: 📱
    details: 整理相册和照片顺序，设置隐藏相册或密码相册，控制画廊中的访问。
  - title: Live/Motion Photo 支持
    icon: 🎬
    details: 完整支持 Apple LivePhoto 格式和 Google 标准的 Motion Photo，自动检测和处理 MOV 视频文件，保留动态照片效果。
---

## 🌍 演示站点

在[演示站点页面](/zh/demo-sites)浏览开发者和社区用户分享的画廊。

## 💬 社区支持

- **GitHub Issues**: [报告问题](https://github.com/HoshinoSuzumi/chronoframe/issues/new/choose)
- **GitHub Discussions**: [讨论分享](https://github.com/HoshinoSuzumi/chronoframe/discussions)
- **Discord**: [加入我们](https://discord.gg/MM4ZK4Ed7s)

## 📄 开源协议

ChronoFrame 基于 [MIT 协议](https://github.com/HoshinoSuzumi/chronoframe/blob/main/LICENSE) 开源，欢迎自由使用和贡献。
