<script setup lang="ts">
const {
  uploadOpen,
  message,
  failed,
  connections,
  connectionId,
  upload,
  uploading,
  progress,
  currentFile,
  cancel,
  usage,
  admin,
} = useCloudSiteMedia()
const context = useEntryContext().value,
  input = ref<HTMLInputElement>()
async function dropFiles(event: DragEvent) {
  if (
    !input.value ||
    uploading.value ||
    !connectionId.value ||
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
              connections.map((c) => ({ label: c.config.bucket, value: c.id }))
            "
            class="w-full"
            :disabled="uploading"
        /></UFormField>
        <i18n-t
          v-if="!connections.length"
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
        <input
          ref="input"
          class="sr-only"
          type="file"
          multiple
          accept="image/*,.heic,.heif,.mov"
          :aria-label="$t('cloud.messages.choosePhotographs')"
          :disabled="uploading || !connectionId || !admin"
          @change="upload"
        /><button
          class="cf-upload-dropzone"
          @dragover.prevent
          @drop.prevent="dropFiles"
          :disabled="uploading || !connectionId || !admin"
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
            $t('cloud.messages.upTo100MibPerPhotographIncludingItsPaired')
          }}</span>
        </button>
        <div
          v-if="uploading"
          role="status"
          class="space-y-3"
        >
          <p class="text-sm break-all">{{ currentFile }}</p>
          <UProgress :model-value="progress" />
          <p class="text-xs text-muted">
            {{ $t('cloud.ui.uploadProgress', { progress }) }}
          </p>
        </div>
        <p
          v-if="usage"
          class="text-xs text-muted"
        >
          {{
            $t('cloud.ui.uploadUsage', {
              photos: usage.photos,
              bytes: (usage.bytes / 1073741824).toFixed(2),
            })
          }}
        </p>
      </div></template
    ><template #footer
      ><UButton
        v-if="uploading"
        color="error"
        variant="soft"
        @click="cancel"
        >{{ $t('cloud.messages.cancelUpload') }}</UButton
      ><UButton
        v-else
        color="neutral"
        variant="outline"
        @click="uploadOpen = false"
        >{{ $t('cloud.messages.done') }}</UButton
      ></template
    ></USlideover
  >
</template>
