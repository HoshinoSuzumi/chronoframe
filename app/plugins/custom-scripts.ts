import { parseScriptTags } from '~/utils/parseScriptTags'

/**
 * 将管理员配置的 <script> 标签注入到页面 <head> 和 <body> 中。
 *
 * 读取 settings store 中的 `analytics:headScripts` 与 `analytics:bodyScripts`
 * （由 app.vue 中的 `await initSettings()` 在 SSR 渲染前完成填充），
 * 通过正则解析为 useHead 接受的 script 数组。
 *
 * 与 analytics-tracker.client.ts（Matomo）独立并行，互不干扰：
 *  - 本插件负责管理员自定义脚本（GA、百度统计、Plausible、Umami、JSON-LD 等）
 *  - Matomo 插件负责 runtimeConfig 配置的 Matomo 实例
 *
 * 响应式：当 settings 通过 refreshSettings() 更新时，computed 会重算，
 * useHead 自动同步 DOM。
 */
export default defineNuxtPlugin(() => {
  const headScriptsRef = useSettingRef('analytics:headScripts')
  const bodyScriptsRef = useSettingRef('analytics:bodyScripts')

  useHead(
    computed(() => {
      // 防御 null：未初始化时 store 返回 null
      const headParsed = parseScriptTags(String(headScriptsRef.value ?? ''))
      const bodyParsed = parseScriptTags(String(bodyScriptsRef.value ?? ''))

      // head 脚本注入到 <head>
      const headScripts = headParsed.map((s, i) => ({
        ...s,
        tagPosition: 'head' as const,
        // key 帮助 Unhead 在响应式更新时正确 diff，避免重复注入
        key: `cf-analytics-head-${i}`,
      }))

      // body 脚本注入到 <body> 开头
      const bodyScripts = bodyParsed.map((s, i) => ({
        ...s,
        tagPosition: 'bodyOpen' as const,
        key: `cf-analytics-body-${i}`,
      }))

      return {
        script: [...headScripts, ...bodyScripts],
      }
    }),
  )
})
