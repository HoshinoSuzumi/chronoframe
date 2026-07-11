# 自定义 `<script>` 注入功能实现方案

## Context（背景）

ChronoFrame 当前只支持通过 `runtimeConfig.public.analytics.matomo` 硬编码配置 Matomo 统计（见 [analytics-tracker.client.ts](file:///c:/Users/imagi/Documents/Project/chronoframe/app/plugins/analytics-tracker.client.ts)），管理员无法在不修改代码/环境变量的情况下接入其他统计服务（GA、百度统计、Plausible、Umami、自托管脚本等）。

本方案在不破坏现有 Matomo 集成的前提下，新增一个 **`analytics` settings namespace**，让管理员在后台粘贴完整 HTML 片段（含 `<script>` 标签），前端通过 `useHead` 响应式注入到页面 `<head>` 和 `<body>` 中。

**用户已确认的需求**：
- 输入方式：完整 HTML 片段（直接粘贴官方提供的 `<script>` 代码）
- 注入位置：head + body 两处（独立 textarea）
- Matomo 专用入口保留不动
- 脚本内容通过 public settings API 暴露（脚本本就要嵌入给所有访客，无额外泄露风险）

---

## 方案概览

| 层 | 改动 |
|---|---|
| 数据层 | `DEFAULT_SETTINGS` 新增 `analytics` namespace（2 个 string 字段，isPublic: true） |
| UI 配置 | 新增 `ANALYTICS_SETTINGS_UI`，给 `FieldUIConfig` 增加可选 `rows` 字段 |
| 设置页 | 新建 `app/pages/dashboard/settings/analytics.vue`（镜像 privacy.vue） |
| 导航 | dashboard.vue 侧边栏添加菜单项 |
| 脚本解析 | 新建 `app/utils/parseScriptTags.ts`（纯正则，SSR 安全） |
| 脚本注入 | 新建 `app/plugins/custom-scripts.ts`（universal，`useSettingRef` + `computed` + `useHead`） |
| 类型/组件 | `FieldUIConfig` 加 `rows?`；`SettingField.vue` 读取该值 |
| i18n | 5 个 locale 文件加 8 个 key path |

---

## 详细变更

### 1. 新建 `app/utils/parseScriptTags.ts`

纯正则解析器，无 DOM API，SSR/CSR 一致。自动通过 Nuxt `app/utils/` 约定导入。

**导出**：
- `interface ParsedScriptTag` — 兼容 useHead 的 `script[]` 项格式：`{ src?, innerHTML?, async?, defer?, type?, crossorigin?, integrity?, nomodule?, referrerpolicy?, nonce? }`
- `function parseScriptTags(raw: string): ParsedScriptTag[]`

**行为**：
- 先剥离 HTML 注释 `<!-- ... -->`
- 正则同时匹配 `<script attrs>content</script>` 与自闭合 `<script attrs />`
- 属性解析支持：布尔属性（async/defer/nomodule → true）、双引号/单引号/无引号值
- 仅保留已知属性（src, async, defer, type, crossorigin, integrity, nomodule, referrerpolicy, nonce），未知属性丢弃
- 跳过既无 src 又无 innerHTML 的空脚本
- 不过滤 type（`application/ld+json`、`module` 等原样保留 — JSON-LD 是合法用例）
- 永不抛错，输入非法返回 `[]`

**核心正则**：
```ts
const COMMENT_RE = /<!--[\s\S]*?-->/g
const SCRIPT_TAG_RE =
  /<script\b([^>]*?)>([\s\S]*?)<\/script>|<script\b([^>]*?)\s*\/>/gi
const ATTR_RE =
  /([a-zA-Z_:][\w:-]*)\s*(?:=\s*(?:"([^"]*)"|'([^']*)'|([^\s>]+)))?/g
```

**已知限制**：`[^>]*?` 无法处理属性值中含 `>` 的情况；统计代码场景罕见，JSDoc 中说明。

### 2. 修改 `shared/types/settings.ts`

在 `FieldUIConfig` 接口末尾（约 L79 `icon?: string` 后）增加可选字段：

```ts
/** 行数（仅 textarea 生效），SettingField.vue 默认 3 */
rows?: number
```

非破坏性改动，其他字段不受影响。

### 3. 修改 `app/components/setting/SettingField.vue`

L99-L101 的 textarea 分支：

```ts
case 'textarea':
  propsMap.rows = props.field.ui.rows ?? 3
  break
```

### 4. 修改 `server/services/settings/contants.ts`

在 `DEFAULT_SETTINGS` 数组末尾（L224 `] as const` 之前）追加：

```ts
// NAMESPACE: analytics
{
  namespace: 'analytics',
  key: 'headScripts',
  type: 'string',
  defaultValue: '',
  label: 'settings.analytics.headScripts.label',
  description: 'settings.analytics.headScripts.description',
  isPublic: true,
},
{
  namespace: 'analytics',
  key: 'bodyScripts',
  type: 'string',
  defaultValue: '',
  label: 'settings.analytics.bodyScripts.label',
  description: 'settings.analytics.bodyScripts.description',
  isPublic: true,
},
```

**为什么无需改其他服务端文件**：`settingNamespaces` 和 `settingKeys` 由 `[...new Set(DEFAULT_SETTINGS.map(...))]` 自动派生（L226-L231），因此 [batch.put.ts](file:///c:/Users/imagi/Documents/Project/chronoframe/server/api/system/settings/batch.put.ts) 的 zod enum 与 [fields.get.ts](file:///c:/Users/imagi/Documents/Project/chronoframe/server/api/system/settings/fields.get.ts) 的 allowedKeys 自动包含新 namespace。`settingsManager.init()` 会在启动时自动插入默认行。

### 5. 修改 `server/services/settings/ui-config.ts`

新增导出 `ANALYTICS_SETTINGS_UI`（参考 `PRIVACY_SETTINGS_UI` 的形式）：

```ts
export const ANALYTICS_SETTINGS_UI: Record<string, FieldUIConfig> = {
  headScripts: {
    type: 'textarea',
    rows: 12,
    placeholder:
      '<!-- Google Analytics -->\n<script async src="https://www.googletagmanager.com/gtag/js?id=G-XXXX"></script>\n<script>\n  window.dataLayer = window.dataLayer || [];\n  function gtag(){dataLayer.push(arguments);}\n  gtag(\'js\', new Date());\n  gtag(\'config\', \'G-XXXX\');\n</script>',
    help: 'settings.analytics.headScripts.help',
  },
  bodyScripts: {
    type: 'textarea',
    rows: 12,
    placeholder:
      '<!-- Umami / Openpanel SDK -->\n<script src="https://analytics.example.com/script.js" data-website-id="xxx" defer></script>',
    help: 'settings.analytics.bodyScripts.help',
  },
}
```

在 `getSettingUIConfig` 的 `uiConfigMap`（L339-L346）添加：

```ts
analytics: ANALYTICS_SETTINGS_UI,
```

### 6. 新建 `app/plugins/custom-scripts.ts`

Universal 插件（无 `.client` 后缀），让脚本在 SSR HTML 中即出现（利于 SEO/JSON-LD 与首屏速度）。

**为什么 universal 可行**：[app.vue](file:///c:/Users/imagi/Documents/Project/chronoframe/app/app.vue) setup 中 `await settingsStore.initSettings()` 在 SSR 渲染前完成；Pinia store 响应式更新会触发 `useSettingRef` 的 computed 重算；Unhead 在序列化前会重新求值 computed。客户端 hydration 时 computed 值一致，无水合不匹配。

```ts
import { parseScriptTags } from '~/utils/parseScriptTags'

/**
 * 将管理员配置的 <script> 标签注入到 <head> 和 <body>。
 * 与 analytics-tracker.client.ts（Matomo）独立并行，互不干扰。
 */
export default defineNuxtPlugin(() => {
  const headScriptsRef = useSettingRef('analytics:headScripts')
  const bodyScriptsRef = useSettingRef('analytics:bodyScripts')

  useHead(
    computed(() => {
      const head = parseScriptTags(String(headScriptsRef.value ?? '')).map(
        (s, i) => ({ ...s, tagPosition: 'head' as const, key: `cf-head-${i}` }),
      )
      const body = parseScriptTags(String(bodyScriptsRef.value ?? '')).map(
        (s, i) => ({ ...s, tagPosition: 'bodyOpen' as const, key: `cf-body-${i}` }),
      )
      return { script: [...head, ...body] }
    }),
  )
})
```

**关键点**：
- `key` 字段帮助 Unhead 在响应式更新时正确 diff，避免重复注入
- `tagPosition: 'bodyOpen'` 让 body 脚本出现在 `<body>` 开头（useHead 不支持 `bodyClose`，`bodyOpen` 是标准选项；如需 body 底部，可后续评估）
- `String(... ?? '')` 防御 null（未初始化时 store 返回 null）

### 7. 新建 `app/pages/dashboard/settings/analytics.vue`

镜像 [privacy.vue](file:///c:/Users/imagi/Documents/Project/chronoframe/app/pages/dashboard/settings/privacy.vue) 结构，单 section + 单 `useSettingsForm('analytics')`。差异点：
- 使用 `analytics` 命名空间
- 表单容器加 Tailwind 任意变体类 `[&_textarea]:font-mono [&_textarea]:text-xs` 让 textarea 显示等宽字体（适合粘贴代码）
- 标题/描述用 `title.analyticsSettings` 与 `settings.analytics.sectionDescription`

### 8. 修改 `app/layouts/dashboard.vue`

在 `siteAdministration` children 末尾（L71 `systemSettings` 之后）追加：

```ts
{
  label: $t('title.analyticsSettings'),
  icon: 'tabler:chart-bar',
  to: '/dashboard/settings/analytics',
},
```

### 9. 修改 i18n locale 文件（5 个）

在 `title` 段末尾（en.json L402 `systemSettings` 之后）加 `analyticsSettings`；在 `settings` 段加 `analytics` 子对象。

**需新增的 key path**：
```
title.analyticsSettings
settings.analytics.sectionDescription
settings.analytics.headScripts.{label,description,help}
settings.analytics.bodyScripts.{label,description,help}
```

**英文文案**：
```json
"analyticsSettings": "Analytics & Tracking"
```
```json
"analytics": {
  "sectionDescription": "Inject custom <script> tags into <head> and <body> for analytics, tracking, or structured data. Scripts run for all visitors. Only paste code you trust.",
  "headScripts": {
    "label": "Head Scripts",
    "description": "HTML fragment with <script> tags to inject into <head>.",
    "help": "Paste full <script>...</script> tags (multiple allowed). For GA, Baidu, Plausible, Umami, JSON-LD, etc. The existing Matomo integration runs independently."
  },
  "bodyScripts": {
    "label": "Body Scripts",
    "description": "HTML fragment with <script> tags to inject at the top of <body>.",
    "help": "Paste full <script>...</script> tags (multiple allowed). Suitable for scripts that should run after the body opens."
  }
}
```

**简体中文（zh-Hans）参考**：
- `analyticsSettings`: "分析与追踪"
- `sectionDescription`: "将自定义 `<script>` 标签注入到页面 `<head>` 和 `<body>` 中，用于分析、追踪或结构化数据。脚本对所有访客执行，请仅粘贴可信代码。"
- `headScripts.label`: "Head 脚本"
- `headScripts.description`: "包含 `<script>` 标签的 HTML 片段，注入到页面 `<head>` 中。"
- `headScripts.help`: "粘贴完整的 `<script>...</script>` 标签（支持多个）。适用于 GA、百度统计、Plausible、Umami、JSON-LD 等。已有的 Matomo 集成独立运行，互不干扰。"
- `bodyScripts.label`: "Body 脚本"
- `bodyScripts.description`: "包含 `<script>` 标签的 HTML 片段，注入到 `<body>` 开头。"
- `bodyScripts.help`: "粘贴完整的 `<script>...</script>` 标签（支持多个）。适用于需要在 body 开始处执行的脚本。"

zh-Hant-TW、zh-Hant-HK、ja 同步翻译，保持与现有 locale 文案语气一致。

---

## 验证方案

### 手动验证流程

1. **启动后默认行写入**：重启 dev server，检查 SQLite `settings` 表应出现 `analytics:headScripts` 与 `analytics:bodyScripts` 两行（`is_public=1`、`type='string'`）。可运行 `pnpm db:studio` 查看。

2. **公开 API 暴露**：未登录访问 `GET /api/system/settings/all`，响应应包含 `analytics` namespace 与两个字段。

3. **管理员字段获取**：登录管理员，`GET /api/system/settings/fields?namespace=analytics`，应返回 2 个 FieldDescriptor，`ui.type==='textarea'`、`ui.rows===12`、含 placeholder/help。

4. **页面渲染**：访问 `/dashboard/settings/analytics`，确认：
   - 标题显示"分析与追踪"
   - 两个 12 行的等宽字体 textarea
   - 修改后 Save 按钮启用，Reset 还原

5. **保存 + 注入验证**：
   - Head Scripts 粘贴 GA4 完整代码
   - Body Scripts 粘贴 `<script src="https://umami.example.com/script.js" data-website-id="test" defer></script>`
   - 保存后访问首页 `/`，查看页面源码：
     - GA4 `<script>` 出现在 `<head>`（`async` 属性保留）
     - Umami `<script>` 出现在 `<body>` 开头（`defer` 保留）
     - 若 Matomo 已启用，其 `<script>` 仍在 `<head>`（未受影响）

6. **属性保真**：测试自闭合 `<script src="x.js" async />`、`type="application/ld+json"` 内联脚本、带 `crossorigin`/`integrity` 的脚本，确认属性经过解析→注入后保留。

7. **响应式**：在另一标签页修改脚本保存，原页面 `<head>`/`<body>` 应在 `refreshSettings()` 后自动更新（无需刷新）。

8. **边界情况**：
   - 空 textarea → 不注入任何标签
   - 纯文本（无 `<script>`）→ 静默忽略
   - 注释穿插在脚本之间 → 被剥离，脚本正常解析
   - 畸形 `<script>未闭合` → 不匹配，静默丢弃

9. **Matomo 非回归**：若 `NUXT_PUBLIC_ANALYTICS_MATOMO_ENABLED=true` 且配置了 url/siteId，Matomo tracker 仍正常加载。

### 单元测试（可选）

`parseScriptTags` 是纯函数，可用 vitest 测试：外链+async/defer、内联、自闭合、JSON-LD、多标签、注释、空输入、非法输入。

---

## 关键文件清单

新建：
- `app/utils/parseScriptTags.ts`
- `app/plugins/custom-scripts.ts`
- `app/pages/dashboard/settings/analytics.vue`

修改：
- `server/services/settings/contants.ts`（加 DEFAULT_SETTINGS 条目）
- `server/services/settings/ui-config.ts`（加 ANALYTICS_SETTINGS_UI + 注册）
- `shared/types/settings.ts`（FieldUIConfig 加 `rows?`）
- `app/components/setting/SettingField.vue`（textarea 读取 `ui.rows`）
- `app/layouts/dashboard.vue`（侧边栏菜单项）
- `i18n/locales/en.json`、`zh-Hans.json`、`zh-Hant-TW.json`、`zh-Hant-HK.json`、`ja.json`（i18n keys）

不动：
- `app/plugins/analytics-tracker.client.ts`（Matomo 专用，保留）
- `nuxt.config.ts` 中 `runtimeConfig.public.analytics.matomo`（保留）
