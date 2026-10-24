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
const context = useEntryContext(),
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
    title="Upload photographs"
    description="Add photographs to your library. JPEG, PNG, HEIC and paired Live Photos are supported."
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
        <UFormField label="Storage connection"
          ><USelect
            v-model="connectionId"
            :items="
              connections.map((c) => ({ label: c.config.bucket, value: c.id }))
            "
            class="w-full"
            :disabled="uploading"
        /></UFormField>
        <p
          v-if="!connections.length"
          class="text-sm text-muted"
        >
          Connect your private storage in
          <NuxtLink
            :to="`/sites/${context?.siteId}/settings`"
            class="underline"
            @click="uploadOpen = false"
            >site settings</NuxtLink
          >
          before uploading.
        </p>
        <input
          ref="input"
          class="sr-only"
          type="file"
          multiple
          accept="image/*,.heic,.heif,.mov"
          aria-label="Choose photographs"
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
          /><strong>Select photographs</strong
          ><span
            >Drop images here, or choose images and matching .MOV files
            together.</span
          ><span>Up to 100 MB per photograph and paired video.</span>
        </button>
        <div
          v-if="uploading"
          role="status"
          class="space-y-3"
        >
          <p class="text-sm break-all">{{ currentFile }}</p>
          <UProgress :model-value="progress" />
          <p class="text-xs text-muted">
            {{ progress }}% · Uploading to your private bucket
          </p>
        </div>
        <p
          v-if="usage"
          class="text-xs text-muted"
        >
          {{ usage.photos }} / 1,000 photographs ·
          {{ (usage.bytes / 1073741824).toFixed(2) }} / 5 GiB uploaded in 30
          days
        </p>
      </div></template
    ><template #footer
      ><UButton
        v-if="uploading"
        color="error"
        variant="soft"
        @click="cancel"
        >Cancel upload</UButton
      ><UButton
        v-else
        color="neutral"
        variant="outline"
        @click="uploadOpen = false"
        >Done</UButton
      ></template
    ></USlideover
  >
</template>
