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
const { photos, loading, message, failed, reload } = media
const status = computed(() => (loading.value ? 'pending' : 'success'))
</script>
<template>
  <PhotosProvider
    :photos="photos"
    :refresh="reload"
    :status="status"
    ><CloudSiteHeader />
    <p
      v-if="message"
      :role="failed ? 'alert' : 'status'"
      class="cf-notice"
      :class="{ 'cf-notice-error': failed }"
    >
      {{ message }}
    </p>
    <slot /><CloudUploadDrawer
  /></PhotosProvider>
</template>
