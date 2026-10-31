<script setup lang="ts">
import { uploadQuotaGate } from '../utils/quota-gate'
import {
  mergeUploadFiles,
  remainingUploadFiles,
} from '../utils/upload-selection'
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
const selectedFiles = shallowRef<File[]>([])
const starting = ref(false)
const selectedPhotos = computed(
  () =>
    selectedFiles.value.filter(
      (file) => !file.name.toLowerCase().endsWith('.mov'),
    ).length,
)
const selectionLocked = computed(
  () => starting.value || uploading.value || preparingUpload.value,
)
function addFiles(files: File[]) {
  if (selectionLocked.value || !admin.value) return
  selectedFiles.value = mergeUploadFiles(selectedFiles.value, files)
}
function selectFiles(event: Event) {
  const target = event.target as HTMLInputElement
  addFiles(Array.from(target.files ?? []))
  target.value = ''
}
function dropFiles(event: DragEvent) {
  if (!uploadAllowed.value) return
  addFiles(Array.from(event.dataTransfer?.files ?? []))
}
function removeSelected(index: number) {
  if (selectionLocked.value) return
  selectedFiles.value = selectedFiles.value.filter(
    (_, position) => position !== index,
  )
}
async function startUpload() {
  if (
    selectionLocked.value ||
    !selectedPhotos.value ||
    !uploadAllowed.value ||
    !admin.value
  )
    return
  const files = [...selectedFiles.value]
  starting.value = true
  try {
    const result = await upload(files)
    if (result)
      selectedFiles.value = remainingUploadFiles(files, result.completed)
  } finally {
    starting.value = false
  }
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
            :disabled="selectionLocked"
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
            :disabled="selectionLocked || !admin"
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
          :disabled="selectionLocked || !uploadAllowed || !admin"
          @change="selectFiles"
        /><button
          class="cf-upload-dropzone"
          @dragover.prevent
          @drop.prevent="dropFiles"
          :disabled="selectionLocked || !uploadAllowed || !admin"
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
        <section
          v-if="selectedFiles.length"
          class="space-y-3"
          :aria-label="$t('cloud.transfer.selectedFiles')"
        >
          <div class="flex items-center justify-between gap-3">
            <strong class="text-sm">{{
              $t('cloud.transfer.selectedFilesCount', {
                count: selectedFiles.length,
              })
            }}</strong>
            <UButton
              color="neutral"
              variant="ghost"
              size="sm"
              :disabled="selectionLocked"
              @click="selectedFiles = []"
              >{{ $t('cloud.transfer.clearSelection') }}</UButton
            >
          </div>
          <ul
            class="max-h-72 divide-y divide-default overflow-y-auto rounded-lg border border-default"
          >
            <li
              v-for="(file, index) in selectedFiles"
              :key="JSON.stringify([file.name, file.size, file.lastModified])"
              class="flex items-center gap-3 px-3 py-2"
            >
              <UIcon
                :name="
                  file.name.toLowerCase().endsWith('.mov')
                    ? 'i-lucide-film'
                    : 'i-lucide-image'
                "
                class="size-5 shrink-0 text-muted"
              />
              <div class="min-w-0 flex-1">
                <p
                  class="truncate text-sm"
                  :title="file.name"
                >
                  {{ file.name }}
                </p>
                <p class="text-xs text-muted">{{ formatBytes(file.size) }}</p>
              </div>
              <UButton
                icon="i-lucide-x"
                color="neutral"
                variant="ghost"
                size="sm"
                :aria-label="
                  $t('cloud.transfer.removeSelected', { name: file.name })
                "
                :disabled="selectionLocked"
                @click="removeSelected(index)"
              />
            </li>
          </ul>
          <p
            v-if="!selectedPhotos"
            class="text-xs text-muted"
          >
            {{ $t('cloud.transfer.selectPhotosForVideo') }}
          </p>
        </section>
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
    ><template #footer>
      <CfButton
        variant="secondary"
        @click="uploadOpen = false"
        >{{ $t('cloud.transfer.closeSelection') }}</CfButton
      >
      <CfButton
        :disabled="
          selectionLocked || !selectedPhotos || !uploadAllowed || !admin
        "
        :loading="starting"
        @click="startUpload"
        >{{ $t('cloud.transfer.startUpload') }}</CfButton
      >
    </template></USlideover
  >
</template>
