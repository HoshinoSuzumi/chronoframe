<script setup lang="ts">
import type { NuxtError } from '#app'
import { ArrowLeft, RotateCw } from 'lucide-vue-next'
const props = defineProps<{ error: NuxtError }>()
const { locale } = useI18n()
useHead(() => ({
  htmlAttrs: { lang: locale.value === 'zh-Hans' ? 'zh-CN' : 'en' },
  title: 'ChronoFrame',
  meta: [{ name: 'robots', content: 'noindex' }],
}))
const notFound = computed(() => props.error.statusCode === 404)
</script>
<template>
  <main
    id="main-content"
    class="cf-error"
  >
    <CloudBrand />
    <p class="cf-error-code">{{ error.statusCode }}</p>
    <h1>
      {{
        notFound
          ? $t('cloud.messages.aFrameWeCouldnTFind')
          : $t('cloud.messages.aMomentOutOfFocus')
      }}
    </h1>
    <p>
      {{
        notFound
          ? $t('cloud.messages.thisPageMayHaveMovedOrYouMayNot')
          : $t('cloud.messages.weCouldnTLoadThisPagePleaseTryAgain')
      }}
    </p>
    <div class="cf-header-actions">
      <CfButton
        variant="secondary"
        as-child
        ><a href="https://chronoframe.art/"
          ><ArrowLeft :size="15" />{{ $t('cloud.messages.backToHome') }}</a
        ></CfButton
      ><CfButton
        v-if="!notFound"
        @click="reloadNuxtApp({ force: true })"
        ><RotateCw :size="15" />{{ $t('cloud.messages.tryAgain') }}</CfButton
      >
    </div>
  </main>
</template>
