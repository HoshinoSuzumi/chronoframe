# 更新日志

按正式版本汇总面向使用者的变更。1.0.0 收录 v0.14.1 之后的全部更新，不再逐个列出测试版。历史条目根据相邻正式版的 Git 标签核对；早期测试标签不单独列入。

## v1.0.0

[升级指南](/zh/guide/updates) · [自 v0.14.1 起的代码变更](https://github.com/HoshinoSuzumi/chronoframe/compare/v0.14.1...main)

### 新功能

- 新增首次设置向导，在网页中创建管理员、设置站点、选择存储和地图；地图令牌可稍后补充。
- 设置改为数据库保存，后台可管理多个存储方案、站点信息、上传大小、重复文件处理和隐私选项。
- 新增隐藏相册和密码相册，支持相册排序、相册内照片排序及受保护相册中的照片分享。
- 后台照片支持按上传日期排序、记住显示列、Shift 连续选择；概览新增最近活动。
- 后台支持切换语言，新增俄语并补齐各语言的界面文案。
- GitHub OAuth 可在系统设置中开启并配置，支持自定义地名语言和统计脚本。

### 改进

- 改善地球仪交互、表情反馈、照片编辑和上传队列布局。
- 日志页新增筛选与虚拟滚动，改善实时日志、历史加载和滚动行为。
- 删除存储方案前增加确认，未设置地图服务时提供引导。
- 更新 OG 图片生成及依赖，代码检查和格式化迁移至 Oxlint / Oxfmt。

### Bug 修复

- 修复重启覆盖后台设置的问题；旧环境变量用于初始化，已保存的自定义设置优先。
- 修复首次设置后的登录跳转和旧存储配置迁移。
- 修复相册查看器导航越出当前相册、封面回退和空相册占位图。
- 修复本地文件加载进度停滞、无法解析的 EXIF 日期导致处理失败，以及编辑元数据时的文件路径错误。
- 修复 iOS Safari 大图缩放及窗口尺寸变化后查看器的位置、缩放和闪烁。
- S3 文件元数据改用 HeadObject 获取，修复自定义脚本属性解析和异步流程中的翻译调用。

### 安全修复

- 限制匿名访问隐藏相册中的照片，包含同时属于公开相册的照片。
- 加固密码相册访问凭据、媒体读取、分享范围和代理请求限制，防止受保护内容经其他入口泄露。
- 相册密码使用异步 scrypt 处理，校验最短长度，并限制解锁尝试频率。
- 加固媒体文件名处理和照片访问检查。

### 部署与文档

- 启动时自动迁移数据库，会话密钥自动生成并持久化到 data 目录。
- 重做 Docker 运行镜像，补齐 TLS 证书、Perl 和 ExifTool 运行依赖。运行镜像不再提供 shell 和包管理器。
- 旧环境变量配置文档归档到 Legacy；新部署以设置向导为入口。

### 升级注意

- 首次升级保留旧环境变量，迁移后在后台核对设置和存储路径。
- 相册密码不能阻止通过公开的 S3、OpenList 或 CDN 地址访问原图，需要同时管理外部存储权限。
- 隐藏相册中的照片会从匿名访问中排除，可能影响它们在公开相册中的展示。
- 更新前备份完整数据；回退时同时恢复迁移前的数据库。

## v0.14.1

2025-10-28 · [发布记录](https://github.com/HoshinoSuzumi/chronoframe/releases/tag/v0.14.1) · [代码变更](https://github.com/HoshinoSuzumi/chronoframe/compare/v0.14.0...v0.14.1)

### Bug 修复

- S3 的默认 Region 改为 auto。

## v0.14.0

2025-10-27 · [发布记录](https://github.com/HoshinoSuzumi/chronoframe/releases/tag/v0.14.0) · [代码变更](https://github.com/HoshinoSuzumi/chronoframe/compare/v0.13.1...v0.14.0)

### 改进

- 后台改为侧边栏布局，整理导航和页面结构。

### Bug 修复

- 修正照片预览操作的文字。

## v0.13.1

2025-10-25 · [发布记录](https://github.com/HoshinoSuzumi/chronoframe/releases/tag/v0.13.1) · [代码变更](https://github.com/HoshinoSuzumi/chronoframe/compare/v0.13.0...v0.13.1)

### 新功能

- 照片排序新增随机排列。
- 支持自定义 Nominatim 服务地址。

### Bug 修复

- 修复直接访问照片链接时的查看器行为，以及 Mapbox 令牌读取问题。

## v0.13.0

2025-10-24 · [发布记录](https://github.com/HoshinoSuzumi/chronoframe/releases/tag/v0.13.0) · [代码变更](https://github.com/HoshinoSuzumi/chronoframe/compare/v0.12.2...v0.13.0)

### 新功能

- 新增 OpenList 存储支持。
- 支持下载原图、批量下载选中照片，以及分享站点。

### Bug 修复

- 修复未设置存储前缀时编辑照片失败的问题。

## v0.12.2

2025-10-22 · [发布记录](https://github.com/HoshinoSuzumi/chronoframe/releases/tag/v0.12.2) · [代码变更](https://github.com/HoshinoSuzumi/chronoframe/compare/v0.12.1...v0.12.2)

### 新功能

- 后台照片表格支持自选显示列；照片元数据支持修改评分。
- 缩略图预览与实况照片预览合并为同一弹窗。

## v0.12.1

2025-10-21 · [发布记录](https://github.com/HoshinoSuzumi/chronoframe/releases/tag/v0.12.1) · [代码变更](https://github.com/HoshinoSuzumi/chronoframe/compare/v0.12.0...v0.12.1)

### Bug 修复

- 未映射的语言代码回退到英文。

## v0.12.0

2025-10-20 · [发布记录](https://github.com/HoshinoSuzumi/chronoframe/releases/tag/v0.12.0) · [代码变更](https://github.com/HoshinoSuzumi/chronoframe/compare/v0.11.0...v0.12.0)

### 新功能

- 支持编辑部分照片 EXIF；任务队列可展开查看错误详情。

### Bug 修复

- 反向地理编码失败时不再错误地标记为成功。

### 行为变更

- 移除独立的位置管理页。

## v0.11.0

2025-10-20 · [发布记录](https://github.com/HoshinoSuzumi/chronoframe/releases/tag/v0.11.0) · [代码变更](https://github.com/HoshinoSuzumi/chronoframe/compare/v0.10.0...v0.11.0)

### 新功能

- 大图查看器支持分块渲染；后台新增缩略图预览。

### Bug 修复

- 移动端对超出 GPU 纹理大小限制的图片进行缩小，避免渲染失败。

## v0.10.0

2025-10-19 · [发布记录](https://github.com/HoshinoSuzumi/chronoframe/releases/tag/v0.10.0) · [代码变更](https://github.com/HoshinoSuzumi/chronoframe/compare/v0.9.1...v0.10.0)

### 改进

- 重做照片上传页面，补齐上传管理翻译。

### 新功能

- 新增返回顶部按钮。

## v0.9.1

2025-10-18 · [发布记录](https://github.com/HoshinoSuzumi/chronoframe/releases/tag/v0.9.1) · [代码变更](https://github.com/HoshinoSuzumi/chronoframe/compare/v0.9.0...v0.9.1)

### Bug 修复

- 修复分享面板中的相机信息和相册按钮显示。

## v0.9.0

2025-10-17 · [发布记录](https://github.com/HoshinoSuzumi/chronoframe/releases/tag/v0.9.0) · [代码变更](https://github.com/HoshinoSuzumi/chronoframe/compare/v0.8.1...v0.9.0)

### 新功能

- 新增相册浏览和后台管理，照片信息面板显示所属相册。

### 改进

- 查看器关闭后返回进入时的页面。

## v0.8.1

2025-10-13 · [发布记录](https://github.com/HoshinoSuzumi/chronoframe/releases/tag/v0.8.1) · [代码变更](https://github.com/HoshinoSuzumi/chronoframe/compare/v0.8.0...v0.8.1)

### Bug 修复

- 补齐 MapLibre / MapTiler 的令牌配置。

## v0.8.0

2025-10-13 · [发布记录](https://github.com/HoshinoSuzumi/chronoframe/releases/tag/v0.8.0) · [代码变更](https://github.com/HoshinoSuzumi/chronoframe/compare/v0.7.2...v0.8.0)

### 新功能

- 地图同时支持 MapLibre 和 Mapbox，并新增深色样式。

### 改进

- 照片描述和分享预览中展示更多地点与 EXIF 信息。

### Bug 修复

- 修复本地存储中文路径、分享预览缩略图和 Motion Photo 布尔值解析。
- 即使反向地理编码未完成，也提取照片的 GPS 坐标。

## v0.7.2

2025-10-11 · [发布记录](https://github.com/HoshinoSuzumi/chronoframe/releases/tag/v0.7.2) · [代码变更](https://github.com/HoshinoSuzumi/chronoframe/compare/v0.7.1...v0.7.2)

### 新功能

- 新增基于 XMP 的 Motion Photo 处理；S3 支持 forcePathStyle。

### 改进

- 补充 EXIF 描述字段，删除照片时增加确认弹窗。

### Bug 修复

- 修复动态照片的视频路径与文件类型检查，并清理 HEIC 转换出的 JPEG。

## v0.7.1

2025-10-09 · [发布记录](https://github.com/HoshinoSuzumi/chronoframe/releases/tag/v0.7.1) · [代码变更](https://github.com/HoshinoSuzumi/chronoframe/compare/v0.7.0...v0.7.1)

### Bug 修复

- 修复阿里云 OSS 的 S3 地址生成。

## v0.7.0

2025-10-09 · [发布记录](https://github.com/HoshinoSuzumi/chronoframe/releases/tag/v0.7.0) · [代码变更](https://github.com/HoshinoSuzumi/chronoframe/compare/v0.6.7...v0.7.0)

### 新功能

- 新增本地存储和 Matomo 统计支持；后台显示照片表情反馈。

### 改进

- 补充多语言文本，改善 Windows 系统信息获取。

### Bug 修复

- 修复首页城市统计、登录页文字和查看器加载信息的本地化。

## v0.6.7

2025-10-07 · [发布记录](https://github.com/HoshinoSuzumi/chronoframe/releases/tag/v0.6.7) · [代码变更](https://github.com/HoshinoSuzumi/chronoframe/compare/v0.6.6...v0.6.7)

### 新功能

- 新增照片表情反馈、选择器和彩纸效果。
- 新增 GitHub OAuth 配置和照片查看、分享事件统计。

### Bug 修复

- 修复非交互元素的长按行为和数据库条件导出。

## v0.6.6

2025-10-05 · [发布记录](https://github.com/HoshinoSuzumi/chronoframe/releases/tag/v0.6.6) · [代码变更](https://github.com/HoshinoSuzumi/chronoframe/compare/v0.6.5...v0.6.6)

### 新功能

- 新增站点明暗主题偏好和 Google Analytics 配置。

### Bug 修复

- 修正统计配置变量和繁体中文实况照片文案。

## v0.6.5

2025-10-04 · [发布记录](https://github.com/HoshinoSuzumi/chronoframe/releases/tag/v0.6.5) · [代码变更](https://github.com/HoshinoSuzumi/chronoframe/compare/v0.6.4...v0.6.5)

### Bug 修复

- 修复瀑布流页头宽度、对齐和响应式显示。

## v0.6.4

2025-10-03 · [发布记录](https://github.com/HoshinoSuzumi/chronoframe/releases/tag/v0.6.4) · [代码变更](https://github.com/HoshinoSuzumi/chronoframe/compare/v0.6.3...v0.6.4)

### 新功能

- 新增照片分享面板、社交平台分享、OG 图片预览与下载。

## v0.6.3

2025-10-02 · [发布记录](https://github.com/HoshinoSuzumi/chronoframe/releases/tag/v0.6.3) · [代码变更](https://github.com/HoshinoSuzumi/chronoframe/compare/v0.6.2...v0.6.3)

### 新功能

- 新增后台日志页、实时日志流和文件日志。

## v0.6.2

2025-10-01 · [发布记录](https://github.com/HoshinoSuzumi/chronoframe/releases/tag/v0.6.2) · [代码变更](https://github.com/HoshinoSuzumi/chronoframe/compare/v0.6.1...v0.6.2)

### 新功能

- 新增任务队列管理页和翻译，支持配置反向地理编码的 Mapbox 令牌。

### 改进

- 改善实况照片缺少配对图片时的处理提示。

## v0.6.1

2025-09-30 · [发布记录](https://github.com/HoshinoSuzumi/chronoframe/releases/tag/v0.6.1) · [代码变更](https://github.com/HoshinoSuzumi/chronoframe/compare/v0.6.0...v0.6.1)

### 改进

- 补充白平衡翻译和未定义值的显示。

### 行为变更

- 移除基于文件路径提取 EXIF 标签的逻辑。

## v0.6.0

2025-09-27 · [发布记录](https://github.com/HoshinoSuzumi/chronoframe/releases/tag/v0.6.0) · [代码变更](https://github.com/HoshinoSuzumi/chronoframe/compare/v0.5.8...v0.6.0)

### 改进

- 统一服务重试机制，启动时清理失效任务，优化处理队列并发。
- 改善上传状态、队列清理、实况照片预加载及播放重试。

### 新功能

- 完善日历热力图及后台概览的多语言支持。

## v0.5.8

2025-09-27 · [发布记录](https://github.com/HoshinoSuzumi/chronoframe/releases/tag/v0.5.8) · [代码变更](https://github.com/HoshinoSuzumi/chronoframe/compare/v0.5.7...v0.5.8)

### 新功能

- 新增日历热力图组件并补齐后台概览翻译。

### Bug 修复

- 修复后台概览的服务器错误。

## v0.5.7

2025-09-26 · [发布记录](https://github.com/HoshinoSuzumi/chronoframe/releases/tag/v0.5.7) · [代码变更](https://github.com/HoshinoSuzumi/chronoframe/compare/v0.5.6...v0.5.7)

### 新功能

- 后台新增日历热力图。

### 改进

- 调整后台概览和地球仪按钮。

### Bug 修复

- 站点标题未配置时使用后台标题作为回退。

## v0.5.6

2025-09-26 · [发布记录](https://github.com/HoshinoSuzumi/chronoframe/releases/tag/v0.5.6) · [代码变更](https://github.com/HoshinoSuzumi/chronoframe/compare/v0.5.5...v0.5.6)

### 改进

- 重做后台概览和系统状态信息，减少状态刷新开销。

### Bug 修复

- HEIC / HEIF 识别增加扩展名回退，修正文件大小限制提示。

## v0.5.5

2025-09-25 · [发布记录](https://github.com/HoshinoSuzumi/chronoframe/releases/tag/v0.5.5) · [代码变更](https://github.com/HoshinoSuzumi/chronoframe/compare/v0.5.4...v0.5.5)

### 新功能

- 新增站点所有者配置。

### Bug 修复

- 重做瀑布流布局，修复照片排列顺序。

### 行为变更

- 探索地图更名为地球仪。

## v0.5.4

2025-09-25 · [发布记录](https://github.com/HoshinoSuzumi/chronoframe/releases/tag/v0.5.4) · [代码变更](https://github.com/HoshinoSuzumi/chronoframe/compare/v0.5.3...v0.5.4)

### 新功能

- 新增非 HTTPS 连接下的 Cookie 选项。该旧选项在 1.0.0 中已弃用。

## v0.5.3

2025-09-25 · [发布记录](https://github.com/HoshinoSuzumi/chronoframe/releases/tag/v0.5.3) · [代码变更](https://github.com/HoshinoSuzumi/chronoframe/compare/v0.5.2...v0.5.3)

### 改进

- 打开照片时定位到它在列表中的位置。

### Bug 修复

- 修复路由滚动行为及打开详情时跳回页顶的问题。

## v0.5.2

2025-09-24 · [发布记录](https://github.com/HoshinoSuzumi/chronoframe/releases/tag/v0.5.2) · [代码变更](https://github.com/HoshinoSuzumi/chronoframe/compare/v0.5.1...v0.5.2)

### Bug 修复

- 调整带照片 ID 的地图链接缩放级别，修复后台照片操作按钮显示。

## v0.5.1

2025-09-24 · [发布记录](https://github.com/HoshinoSuzumi/chronoframe/releases/tag/v0.5.1) · [代码变更](https://github.com/HoshinoSuzumi/chronoframe/compare/v0.5.0...v0.5.1)

### 行为变更

- 反向地理编码优先使用 Mapbox，以 Nominatim 为备选。

## v0.5.0

2025-09-24 · [发布记录](https://github.com/HoshinoSuzumi/chronoframe/releases/tag/v0.5.0) · [代码变更](https://github.com/HoshinoSuzumi/chronoframe/compare/v0.4.3...v0.5.0)

### 改进

- 重做照片处理队列和工作池，新增队列 API，改善上传处理进度。

### Bug 修复

- 修复空画廊提示和后台标题。

## v0.4.3

2025-09-24 · [发布记录](https://github.com/HoshinoSuzumi/chronoframe/releases/tag/v0.4.3) · [代码变更](https://github.com/HoshinoSuzumi/chronoframe/compare/v0.4.2...v0.4.3)

### Bug 修复

- 修复站点头像设置未生效的问题。

### 改进

- 缩减 Docker 镜像体积并更新相关依赖。

## v0.4.2

2025-09-22 · [发布记录](https://github.com/HoshinoSuzumi/chronoframe/releases/tag/v0.4.2) · [代码变更](https://github.com/HoshinoSuzumi/chronoframe/compare/v0.4.1...v0.4.2)

### 新功能

- 新增 OG 图片，用于链接分享预览。

## v0.4.1

2025-09-21 · [发布记录](https://github.com/HoshinoSuzumi/chronoframe/releases/tag/v0.4.1) · [代码变更](https://github.com/HoshinoSuzumi/chronoframe/compare/v0.4.0...v0.4.1)

### 改进

- 将数据库迁移和初始化改为任务执行。

## v0.4.0

2025-09-21 · [发布记录](https://github.com/HoshinoSuzumi/chronoframe/releases/tag/v0.4.0)

### 新功能

- 提供照片上传、瀑布流画廊、WebGL 查看器和后台管理。
- 支持 EXIF、HEIC 转换、实况照片配对与播放、地图探索、标签与筛选。
- 支持账号密码登录、Docker 部署和多语言界面。

### Bug 修复

- 修复地图重复加载、直方图加载、EXIF 关键词和色彩空间解析等问题。
