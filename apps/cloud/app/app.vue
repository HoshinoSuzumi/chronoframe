<script setup lang="ts">
import { en, zh_cn } from '@nuxt/ui/locale'
import { provideCloudUploads } from './composables/useCloudUploads'
const { locale } = useI18n()
provideCloudUploads()
const starting = ref(true)
onNuxtReady(() => {
  starting.value = false
})
const componentLocale = computed(() =>
  locale.value === 'zh-Hans' ? zh_cn : en,
)
useHead(() => ({
  htmlAttrs: { lang: locale.value === 'zh-Hans' ? 'zh-CN' : 'en' },
  link: [
    { rel: 'icon', type: 'image/x-icon', href: '/favicon.ico' },
    { rel: 'manifest', href: '/portal.webmanifest' },
    { rel: 'apple-touch-icon', href: '/apple-touch-icon.png' },
  ],
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
    <div
      v-if="starting"
      class="cloud-pwa-startup"
      role="status"
    >
      <img
        src="/web-app-manifest-192x192.png"
        width="56"
        height="56"
        alt=""
      />
      <span>{{ $t('cloud.messages.loading') }}</span>
    </div>
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

<style scoped>
.cloud-pwa-startup {
  display: none;
}

@media (display-mode: standalone) and (scripting: enabled) {
  .cloud-pwa-startup {
    position: fixed;
    inset: 0;
    z-index: 100;
    display: flex;
    flex-direction: column;
    align-items: center;
    justify-content: center;
    gap: 1rem;
    background: #202123;
    color: #f4f4f5;
    font-size: 0.875rem;
  }

  @media (prefers-reduced-motion: no-preference) {
    .cloud-pwa-startup img {
      animation: cloud-pwa-pulse 1.4s ease-in-out infinite alternate;
    }
  }
}

@keyframes cloud-pwa-pulse {
  from {
    opacity: 0.55;
  }

  to {
    opacity: 1;
  }
}
</style>
