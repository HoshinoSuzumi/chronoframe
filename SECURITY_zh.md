# 安全政策

[English](SECURITY.md)

## 支持的版本

ChronoFrame 的安全修复面向最新稳定版。旧版本不保证获得修复回移；请升级至最新稳定版以获取修复。

开发分支、预发布版本及 build-test 镜像用于测试，不作为受支持的生产版本。仍然欢迎报告这些版本中的安全问题，尤其是同时影响稳定版的问题。

## 报告安全漏洞

请优先通过 GitHub Security Advisories 的 [Report a vulnerability](https://github.com/HoshinoSuzumi/chronoframe/security/advisories/new) 入口私下报告疑似漏洞。

如果该入口不可用，请发送邮件至 **[contact@chronoframe.art](mailto:contact@chronoframe.art)**，邮件标题请使用 `ChronoFrame security report`。

请勿在公开 Issue、Pull Request、Discussions 或 Discord 消息中发布尚未修复的漏洞细节、利用代码或凭据。普通缺陷和功能建议请提交到 [GitHub Issues](https://github.com/HoshinoSuzumi/chronoframe/issues/new/choose)。

报告中请尽量包含：

- 受影响的版本或提交、镜像标签、部署方式及相关配置。
- 问题描述、影响，以及利用所需的权限或前置条件。
- 使用测试数据的最小复现步骤或概念验证代码。
- 已移除密钥和个人信息的相关 API 请求、响应及日志。
- 问题发生于全新安装、已完成初始化的实例，还是升级过程。
- 建议的缓解措施或修复方案；如希望获得公开致谢，请注明署名。

请勿发送真实密码、会话 Cookie、OAuth 密钥、存储凭据、私人照片或生产数据库。如果复现需要敏感材料，请先说明所需内容，以便协商合适的分享方式。邮件并非端到端加密的报告渠道。

## 处理与披露

维护者会审查报告，必要时请求补充信息，并与报告者协调修复和披露。本项目由社区维护，响应及修复时间取决于维护者时间和问题严重程度，不承诺固定服务时限。如未收到回复，请通过原私密渠道跟进。

请协调公开披露时间，等待修复或可行的缓解措施就绪。已确认的问题可能通过 [GitHub Security Advisory](https://github.com/HoshinoSuzumi/chronoframe/security/advisories) 和发布说明公布，包括受影响版本、修复方式，以及经报告者同意的致谢。

## 范围与测试要求

欢迎报告涉及身份认证、权限控制、初始化接口、上传、媒体处理、存储访问、私密相册、凭据，以及照片元数据意外泄露的问题。对于可能影响 ChronoFrame 的依赖漏洞，请尽可能说明可触达的代码路径或预期影响。

请仅测试自己拥有或获得明确授权的实例及数据。公开演示站和其他用户的部署不属于已授权测试目标。避免干扰服务、执行破坏性操作或访问他人数据。如发现数据暴露，请停止测试，并通过私密渠道提供说明问题所需的最少证据。

## 自托管安全建议

- 及时更新 ChronoFrame 和宿主环境。升级前阅读发布说明，并备份持久化数据及外部存储。
- 在可信环境中完成初始化后再将实例公开。使用高强度管理员密码和 HTTPS。
- 限制数据库、备份、原始文件及持久化会话密钥的访问权限。存储凭据仅授予实例运行所需的权限。
- 仅在应用只能通过可信代理访问，且代理会替换客户端传入的转发头时，启用 `NUXT_TRUST_PROXY=true`。
- 发布照片前检查可见性及元数据设置，尤其是 GPS 位置和其他个人信息。

部署及运维细节请参考[部署指南](docs/zh/guide/getting-started.md)和[升级指南](docs/zh/guide/updates.md)。
