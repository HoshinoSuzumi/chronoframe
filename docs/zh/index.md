---
# https://vitepress.dev/reference/default-theme-home-page
layout: home

hero:
  name: 'ChronoFrame'
  text: '自部署个人画廊'
  tagline: '在线管理照片，多存储后端、LivePhoto、地球仪视图'
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
      text: 查看演示
      link: https://lens.bh8.ga

features:
  - title: 强大的照片管理
    icon: 🖼️
    details: 通过网页界面轻松管理和浏览照片，并在地图上查看照片拍摄地点。
  - title: 简单部署
    icon: 🚀
    details: 使用 Docker 一条命令即可部署，无需数据库（基于 SQLite3）。
  - title: 灵活的存储方案
    icon: 💾
    details: 支持多种存储后端，包括兼容 S3 的存储和本地文件系统。
  - title: 智能地理位置
    icon: 🌍
    details: 自动提取照片 GPS 信息，使用 Mapbox 进行地理编码，在地图上展示照片拍摄位置。
  - title: 响应式设计
    icon: 📱
    details: 完美适配桌面端和移动端，支持触摸操作和手势控制，提供原生应用般的体验。
  - title: Live/Motion Photo 支持
    icon: 🎬
    details: 完整支持 Apple LivePhoto 格式和 Google 标准的 Motion Photo，自动检测和处理 MOV 视频文件，保留动态照片效果。
---

## 🌍 演示站点

下面是一些由开发者、社区成员搭建的，运行良好的 ChronoFrame 实例：

- [**TimoYin's Mems**](https://lens.bh8.ga)

## 💬 社区支持

- **GitHub Issues**: [报告问题](https://github.com/HoshinoSuzumi/chronoframe/issues)
- **GitHub Discussions**: [讨论分享](https://github.com/HoshinoSuzumi/chronoframe/discussions)
- **Discord**: [加入我们](https://discord.gg/mDZjCwdQGk)

## 📄 开源协议

ChronoFrame 基于 [MIT 协议](https://github.com/HoshinoSuzumi/chronoframe/blob/main/LICENSE) 开源，欢迎自由使用和贡献。
