<script setup lang="ts">
import { computed } from 'vue'
import { useData } from 'vitepress'

const { lang } = useData()
const text = computed(() =>
  lang.value.startsWith('zh')
    ? 'ChronoFrame Cloud 现已推出，无需部署，立即使用'
    : 'ChronoFrame Cloud is now available. No deployment needed. Get started',
)
</script>

<template>
  <a
    class="cloud-announcement"
    href="https://chronoframe.art/?utm_source=docs&utm_medium=referral&utm_campaign=docs_to_website&utm_content=top_announcement"
  >
    {{ text }} <span aria-hidden="true">↗</span>
  </a>
</template>

<style>
:root {
  --vp-layout-top-height: 40px;
}

.cloud-announcement {
  position: fixed;
  inset: 0 0 auto;
  z-index: var(--vp-z-index-layout-top);
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 8px;
  height: var(--vp-layout-top-height);
  padding: 8px 16px;
  background: var(--vp-c-brand-3);
  color: var(--vp-c-white);
  font-size: 13px;
  font-weight: 500;
  line-height: 20px;
  text-align: center;
  text-wrap: balance;
}

.cloud-announcement:hover {
  background: var(--vp-c-brand-2);
}

.cloud-announcement:focus-visible {
  outline: 2px solid var(--vp-c-white);
  outline-offset: -4px;
}

.cloud-announcement > span {
  flex-shrink: 0;
}

@media (max-width: 639px) {
  :root {
    --vp-layout-top-height: 64px;
  }
}
</style>
