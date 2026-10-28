<script setup lang="ts">
import { PUBLIC_GALLERY_DEFAULTS } from '@chronoframe/contracts/gallery-settings'
import type { SettingValue } from '@chronoframe/contracts/settings'
const props = defineProps<{ siteId: number; role?: string }>()
const settings = useSettingsStore()
settings.data = structuredClone(PUBLIC_GALLERY_DEFAULTS) as Record<
  string,
  Record<string, SettingValue>
>
settings.data.app!.title = useEntryContext().value?.name ?? 'ChronoFrame'
settings.isInitialized = true
const media = provideCloudSiteMedia(props)
const { photos, loading, message, failed, reload, loadError, refreshMedia } =
  media
const status = computed(() => (loading.value ? 'pending' : 'success'))
</script>
<template>
  <PhotosProvider
    :photos="photos"
    :refresh="reload"
    :status="status"
  >
    <CfAlert
      class="mb-4"
      v-if="loadError"
      tone="error"
    >
      {{ loadError
      }}<CfButton
        size="sm"
        variant="secondary"
        :loading="loading"
        @click="refreshMedia"
        >{{ $t('cloud.messages.retry') }}</CfButton
      >
    </CfAlert>
    <CfAlert
      class="mb-4"
      v-if="message && message !== loadError"
      :tone="failed ? 'error' : 'info'"
      >{{ message }}</CfAlert
    >
    <slot /><CloudUploadDrawer
  /></PhotosProvider>
</template>
