<script lang="ts" setup>
/**
 * 站点顶部条：渲染管理员配置的自定义 header HTML（公告、banner 等）。
 *
 * - 空值不渲染
 * - absolute top-0 悬浮于 masonry 顶部，不占布局高度
 * - z-20 低于浮层；外层 pointer-events-none 不遮挡交互，内层 pointer-events-auto
 */
const customHeader = useSettingRef('site:customHeader')

const customHeaderHtml = computed(() =>
  String(customHeader.value ?? '').trim(),
)

const hasContent = computed(() => Boolean(customHeaderHtml.value))
</script>

<template>
  <div
    v-if="hasContent"
    class="absolute top-0 inset-x-0 z-20 pointer-events-none"
  >
    <div
      class="pointer-events-auto bg-black/20 dark:bg-black/30 backdrop-blur-xl border-b border-white/10 text-white/90"
    >
      <div
        class="custom-header-html [&_a]:text-white/90 [&_a:hover]:text-white [&_a]:underline mx-auto max-w-7xl px-4 py-2 text-xs"
        v-html="customHeaderHtml"
      />
    </div>
  </div>
</template>

<style scoped></style>
