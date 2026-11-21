<script setup lang="ts">
import { en, zh_cn } from '@nuxt/ui/locale'
import { provideCloudUploads } from './composables/useCloudUploads'
const { locale } = useI18n()
provideCloudUploads()
const starting = ref(true)
const announceStartup = ref(false)
onMounted(() => {
  announceStartup.value = true
})
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
  noscript: [
    { innerHTML: '<style>.cloud-pwa-startup{display:none!important}</style>' },
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
    >
      <span
        class="cloud-pwa-spinner"
        aria-hidden="true"
      />
      <span
        class="sr-only"
        role="status"
        >{{
          announceStartup ? (locale === 'zh-Hans' ? '加载中…' : 'Loading…') : ''
        }}</span
      >
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

@media (display-mode: standalone) {
  .cloud-pwa-startup {
    position: fixed;
    inset: 0;
    z-index: 100;
    display: grid;
    place-items: center;
    background: #202123;
    color: #f4f4f5;
    /* Reveal the server-rendered page if the client bundle never starts. */
    animation: cloud-pwa-release 15s steps(1, end) forwards;
  }

  .cloud-pwa-spinner {
    width: 2rem;
    height: 2rem;
    border: 3px solid rgb(255 255 255 / 20%);
    border-top-color: currentColor;
    border-radius: 50%;
  }

  @media (prefers-reduced-motion: no-preference) {
    .cloud-pwa-spinner {
      animation: cloud-pwa-spin 0.8s linear infinite;
    }
  }
}

@keyframes cloud-pwa-spin {
  to {
    transform: rotate(1turn);
  }
}

@keyframes cloud-pwa-release {
  to {
    visibility: hidden;
  }
}
</style>
