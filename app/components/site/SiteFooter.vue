<script lang="ts" setup>
/**
 * 站点底部条：渲染管理员配置的自定义 footer HTML 与备案信息（ICP / 网安）。
 *
 * - 三项内容全空时不渲染
 * - 固定于视口底部（fixed bottom-0），z-20 低于浮层（PhotoViewer z-50、LoadingIndicator z-40）
 * - 外层 pointer-events-none 不遮挡 masonry 交互，内层 pointer-events-auto 保证链接可点
 * - 备案链接由系统根据备案号自动拼接，无需管理员手写
 */
const customFooter = useSettingRef('site:customFooter')
const icpNumber = useSettingRef('site:icpNumber')
const policeNumber = useSettingRef('site:policeNumber')

const hasContent = computed(() => {
  return Boolean(
    String(customFooter.value ?? '').trim() ||
      String(icpNumber.value ?? '').trim() ||
      String(policeNumber.value ?? '').trim(),
  )
})

const icpText = computed(() => String(icpNumber.value ?? '').trim())
const policeText = computed(() => String(policeNumber.value ?? '').trim())
const customFooterHtml = computed(() => String(customFooter.value ?? '').trim())

const policeUrl = computed(() => {
  if (!policeText.value) return ''
  return `https://beian.mps.gov.cn/#/query/webSearch?code=${encodeURIComponent(policeText.value)}`
})
</script>

<template>
  <div
    v-if="hasContent"
    class="fixed bottom-0 inset-x-0 z-20 pointer-events-none"
  >
    <div
      class="pointer-events-auto bg-black/20 dark:bg-black/30 backdrop-blur-xl border-t border-white/10 text-white/90"
    >
      <div
        class="mx-auto flex max-w-7xl flex-wrap items-center justify-center gap-x-4 gap-y-1 px-4 py-2 text-xs"
      >
        <!-- 自定义 footer HTML -->
        <div
          v-if="customFooterHtml"
          class="custom-footer-html [&_a]:text-white/90 [&_a:hover]:text-white [&_a]:underline"
          v-html="customFooterHtml"
        />

        <!-- 备案信息 -->
        <div
          v-if="icpText || policeUrl"
          class="flex flex-wrap items-center justify-center gap-x-4 gap-y-1"
        >
          <a
            v-if="icpText"
            href="https://beian.miit.gov.cn/"
            target="_blank"
            rel="noopener noreferrer"
            class="transition-colors hover:text-white"
          >
            {{ icpText }}
          </a>
          <a
            v-if="policeUrl"
            :href="policeUrl"
            target="_blank"
            rel="noopener noreferrer"
            class="inline-flex items-center gap-1 transition-colors hover:text-white"
          >
            <Icon name="tabler:shield" class="size-3.5" />
            <span>{{ policeText }}</span>
          </a>
        </div>
      </div>
    </div>
  </div>
</template>

<style scoped></style>
