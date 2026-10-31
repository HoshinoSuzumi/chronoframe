<script setup lang="ts">
import { uploadQuotaGate } from '../utils/quota-gate'
const {
  uploadOpen,
  albums,
  selectedAlbumIds,
  message,
  failed,
  connections,
  connectionId,
  upload,
  uploading,
  preparingUpload,
  usage,
  allowance,
  fileLimit,
  admin,
} = useCloudSiteMedia()
const context = useEntryContext().value,
  input = ref<HTMLInputElement>()
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
async function dropFiles(event: DragEvent) {
  if (
    !input.value ||
    uploading.value ||
    preparingUpload.value ||
    !uploadAllowed.value ||
    !admin.value ||
    !event.dataTransfer?.files.length
  )
    return
  input.value.files = event.dataTransfer.files
  await upload({ target: input.value } as unknown as Event)
}
</script>
<template>
  <USlideover
    v-model:open="uploadOpen"
    :title="$t('cloud.messages.uploadPhotographs')"
    :description="
      $t('cloud.messages.addPhotographsToYourLibraryJpegPngHeicAnd')
    "
    :ui="{ footer: 'justify-end' }"
    ><template #body
      ><div class="space-y-5">
        <p
          v-if="message"
          :role="failed ? 'alert' : 'status'"
          class="cf-notice"
          :class="{ 'cf-notice-error': failed }"
        >
          {{ message }}
        </p>
        <UFormField :label="$t('cloud.messages.storageConnection')"
          ><USelect
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
            :disabled="uploading || preparingUpload"
        /></UFormField>
        <i18n-t
          v-if="!connections.length && allowance?.byosLimits.byos"
          keypath="cloud.ui.connectStorageGuidance"
          tag="p"
          scope="global"
          class="text-sm text-muted"
        >
          <template #link
            ><NuxtLink
              :to="`/sites/${context?.siteId}/storage`"
              class="underline"
              @click="uploadOpen = false"
              >{{ $t('cloud.messages.storage') }}</NuxtLink
            ></template
          >
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
            :disabled="uploading || preparingUpload || !admin"
            class="w-full"
          />
        </UFormField>
        <input
          ref="input"
          class="sr-only"
          type="file"
          multiple
          accept="image/*,.heic,.heif,.hif,.bmp,.tif,.tiff,.mov"
          :aria-label="$t('cloud.messages.choosePhotographs')"
          :disabled="uploading || preparingUpload || !uploadAllowed || !admin"
          @change="upload"
        /><button
          class="cf-upload-dropzone"
          @dragover.prevent
          @drop.prevent="dropFiles"
          :disabled="uploading || preparingUpload || !uploadAllowed || !admin"
          @click="input?.click()"
        >
          <UIcon
            name="tabler:cloud-upload"
            class="size-9"
          /><strong>{{ $t('cloud.messages.selectPhotographs') }}</strong
          ><span>{{
            $t('cloud.messages.dropImagesHereOrChooseImagesAndMatchingMov')
          }}</span
          ><span>{{
            $t('cloud.storageAllowance.fileLimit', {
              size: (fileLimit / 1048576).toFixed(0),
            })
          }}</span>
        </button>
        <p
          v-if="usage"
          class="text-xs text-muted"
        >
          {{
            $t('cloud.ui.uploadUsage', {
              photos: usage.photos,
              bytes: (usage.bytes / 1073741824).toFixed(2),
              photoLimit: allowance?.limits.photos ?? '—',
              uploadLimit: (
                (allowance?.limits.monthlyBytes ?? 0) / 1073741824
              ).toFixed(2),
            })
          }}
        </p>
      </div></template
    ><template #footer
      ><CfButton
        variant="secondary"
        @click="uploadOpen = false"
        >{{ $t('cloud.messages.done') }}</CfButton
      ></template
    ></USlideover
  >
</template>
