<script setup lang="ts">
import { en, zh_cn } from '@nuxt/ui/locale'
import { provideCloudUploads } from './composables/useCloudUploads'
const { locale } = useI18n()
provideCloudUploads()
const componentLocale = computed(() =>
  locale.value === 'zh-Hans' ? zh_cn : en,
)
useHead(() => ({
  htmlAttrs: { lang: locale.value === 'zh-Hans' ? 'zh-CN' : 'en' },
  link: [{ rel: 'icon', type: 'image/x-icon', href: '/favicon.ico' }],
  bodyAttrs: { class: 'cf-cloud-body' },
}))
</script>
<template>
  <UApp
    :locale="componentLocale"
    :toaster="{
      ui: {
        base: 'items-center',
        viewport:
          'bottom-[calc(1.5rem+env(safe-area-inset-bottom,0px))] right-6 w-[calc(100%-3rem)] sm:w-96',
      },
    }"
  >
    <div class="cf-root">
      <a
        href="#main-content"
        class="cf-skip-link"
        >{{ $t('cloud.messages.skipToContent') }}</a
      ><NuxtLoadingIndicator color="var(--cf-primary)" /><NuxtLayout
        ><NuxtPage
      /></NuxtLayout>
      <CloudTransferPanel />
    </div>
  </UApp>
</template>
