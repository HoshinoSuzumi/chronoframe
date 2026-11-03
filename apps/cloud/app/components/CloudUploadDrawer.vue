<script setup lang="ts">
import { uploadQuotaGate } from '../utils/quota-gate'
const {
  uploadOpen,
  albums,
  selectedAlbumIds,
  connections,
  connectionId,
  upload,
  preparingUpload,
  allowance,
  fileLimit,
  admin,
} = useCloudSiteMedia()
const context = useEntryContext().value
const quota = useCloudQuota(context?.workspaceId)
const selectedAdmission = computed(() =>
  uploadQuotaGate(
    quota.data.value,
    connectionId.value
      ? connections.value.filter((c) => c.id === connectionId.value)
      : connections.value,
    connectionId.value,
  ),
)
const uploadAllowed = computed(
  () =>
    !!connectionId.value &&
    selectedAdmission.value.allowed &&
    !quota.error.value,
)
const selectedFiles = shallowRef<File[]>([])
const starting = ref(false)
const selectionLocked = computed(() => starting.value || preparingUpload.value)
async function startUpload() {
  if (
    selectionLocked.value ||
    !selectedFiles.value.length ||
    !uploadAllowed.value ||
    !admin.value
  )
    return
  starting.value = true
  try {
    const result = await upload([...selectedFiles.value])
    if (result?.queued) selectedFiles.value = []
  } finally {
    starting.value = false
  }
}
</script>
<template>
  <PhotoUploadSlideover
    v-model:open="uploadOpen"
    v-model:files="selectedFiles"
    :max-file-size-m-b="fileLimit / 1048576"
    :disabled="selectionLocked || !uploadAllowed || !admin"
    :loading="selectionLocked"
    :can-upload="uploadAllowed && admin"
    accept="image/*,.heic,.heif,.hif,.bmp,.tif,.tiff,.mov"
    @upload="startUpload"
  >
    <template #before-files>
      <UFormField :label="$t('cloud.messages.storageConnection')">
        <USelect
          v-model="connectionId"
          :items="
            connections
              .filter(
                (c) =>
                  c.uploads_enabled !== 0 &&
                  (c.pool_id || allowance?.byosLimits.byos),
              )
              .map((c) => ({
                label: c.pool_id
                  ? $t('cloud.messages.platformStorage')
                  : c.config.bucket,
                value: c.id,
                disabled:
                  !uploadQuotaGate(quota.data.value, [c], c.id).allowed ||
                  !!quota.error.value,
              }))
          "
          class="w-full"
          :disabled="selectionLocked"
        />
      </UFormField>
      <i18n-t
        v-if="!connections.length && allowance?.byosLimits.byos"
        keypath="cloud.ui.connectStorageGuidance"
        tag="p"
        scope="global"
        class="text-sm text-muted"
      >
        <template #link>
          <NuxtLink
            :to="`/sites/${context?.siteId}/storage`"
            class="underline"
            @click="uploadOpen = false"
          >
            {{ $t('cloud.messages.storage') }}
          </NuxtLink>
        </template>
      </i18n-t>
      <p
        v-if="!connections.length && !allowance?.byosLimits.byos"
        class="text-sm text-muted"
      >
        {{ $t('cloud.storageAllowance.unavailable') }}
      </p>
      <CloudQuotaNotice
        v-if="!selectedAdmission.allowed || quota.error.value"
        :reason="selectedAdmission.reason"
        :error="!!quota.error.value"
        @retry="quota.refresh()"
      />
    </template>
    <UCard
      variant="soft"
      class="border border-neutral-200/80 dark:border-neutral-800/80"
    >
      <UFormField
        :label="$t('cloud.transfer.albums')"
        :description="$t('cloud.transfer.albumHelp')"
      >
        <USelectMenu
          v-model="selectedAlbumIds"
          multiple
          value-key="value"
          :items="
            albums.map((album) => ({
              label: album.title,
              value: Number(album.id),
            }))
          "
          :placeholder="$t('cloud.transfer.selectAlbums')"
          :disabled="selectionLocked || !admin"
          class="w-full"
        />
      </UFormField>
    </UCard>
  </PhotoUploadSlideover>
</template>
