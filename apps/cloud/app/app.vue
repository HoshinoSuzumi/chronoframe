<script setup lang="ts">
import { en, zh_cn } from '@nuxt/ui/locale'
const { locale } = useI18n()
const componentLocale = computed(() =>
  locale.value === 'zh-Hans' ? zh_cn : en,
)
useHead(() => ({
  htmlAttrs: { lang: locale.value === 'zh-Hans' ? 'zh-CN' : 'en' },
  bodyAttrs: { class: 'cf-cloud-body' },
}))
</script>
<template>
  <UApp :locale="componentLocale">
    <div class="cf-root">
      <a
        href="#main-content"
        class="cf-skip-link"
        >{{ $t('cloud.messages.skipToContent') }}</a
      ><NuxtLoadingIndicator color="var(--cf-primary)" /><NuxtLayout
        ><NuxtPage
      /></NuxtLayout>
    </div>
  </UApp>
</template>
