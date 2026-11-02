<script setup lang="ts">
import {
  FolderPlus as ButtonIconFolderPlus,
  Trash2 as ButtonIconTrash2,
} from 'lucide-vue-next'
import { useLocalStorage } from '@vueuse/core'
import { uploadQuotaGate } from '../utils/quota-gate'
import { photoLibraryPresentation } from '#console/utils/photoLibraryPresentation'
const { t, locale } = useI18n()
const processingText = (en: string, zh: string) =>
  locale.value === 'zh-Hans' ? zh : en

import type { Photo } from '@chronoframe/contracts/resources'
import type { TableColumn } from '@nuxt/ui'
const {
  photos,
  message,
  failed,
  albums,
  loading,
  ready,
  admin,
  busy,
  uploadOpen,
  connectionId,
  connections,
  editPhoto,
  photoLoaded,
  loadPhoto,
  savePhoto,
  removePhoto,
  refreshMedia,
  action,
  api,
  base,
} = useCloudSiteMedia()
const quota = useCloudQuota(useEntryContext().value?.workspaceId)
const uploadAdmission = computed(() => {
  if (!ready.value) return { allowed: false, reason: 'checking' }
  return uploadQuotaGate(
    quota.data.value,
    connections.value,
    connectionId.value,
  )
})
function openUpload() {
  if (uploadAdmission.value.allowed && !quota.error.value) {
    const target = uploadAdmission.value
    if ('connectionId' in target && target.connectionId)
      connectionId.value = target.connectionId
    uploadOpen.value = true
    void quota.refresh()
  }
}
const layout = useLocalStorage<'list' | 'masonry'>(
  'cloud-photos-layout',
  'list',
  { initOnMounted: true },
)
const search = ref(''),
  selection = ref<Record<string, boolean>>({}),
  editor = ref(false),
  preview = ref<Photo | null>(null),
  deleteOpen = ref(false),
  albumOpen = ref(false),
  targetAlbum = ref<number>(),
  saving = ref(false)
const { sortedPhotos } = usePhotoSort(),
  { filteredPhotos, hasActiveFilters } = usePhotoFilters()
const rows = computed(() => {
  const matches = new Set(filteredPhotos.value.map((p) => p.id))
  return sortedPhotos.value.filter(
    (p) =>
      (!hasActiveFilters.value || matches.has(p.id)) &&
      (!search.value ||
        [p.title, p.description, ...(p.tags ?? [])]
          .join(' ')
          .toLowerCase()
          .includes(search.value.toLowerCase())),
  )
})
const columnVisibility = useDashboardPhotoColumnVisibility({
  storageKey: 'cloud-photos-column-visibility',
  legacyStorageKey: 'dashboard-photos-column-visibility',
  locked: ['thumbnailUrl', 'id', 'actions'],
})
const reactions = ref<Record<string, Record<string, number>>>({})
watch(
  photos,
  async (_, __, onCleanup) => {
    let active = true
    onCleanup(() => {
      active = false
    })
    try {
      const counts = await api<Record<string, Record<string, number>>>(
        base.value + '/photos/reactions?detailed=1',
      )
      if (active) reactions.value = counts
    } catch {
      if (active) reactions.value = {}
    }
  },
  { immediate: true },
)
function openPreviewOriginal() {
  const photo = preview.value
  if (!photo) return
  const url = photo.originalUrl
  if (url) window.open(url, '_blank', 'noopener,noreferrer')
}
const chosen = computed(() => rows.value.filter((p) => selection.value[p.id]))
const photoColumns = usePhotoTableColumns({
  preview: (photo) => {
    preview.value = photo
  },
  reactions,
})
const columns = computed<TableColumn<Photo>[]>(() => [
  { id: 'select', header: '', size: 32, enableHiding: false },
  ...photoColumns.value,
])
async function edit(photo: Photo) {
  editPhoto.id = photo.id
  editor.value = true
  await loadPhoto()
}
async function save() {
  if (await savePhoto()) editor.value = false
}
function deleteOne(photo: Photo) {
  selection.value = { [photo.id]: true }
  deleteOpen.value = true
}
async function deleteChosen() {
  saving.value = true
  try {
    const ok = await action(
      () =>
        api(base.value + '/photos/delete-batch', {
          method: 'POST',
          body: { photoIds: chosen.value.map((p) => p.id) },
        }),
      t('cloud.messages.photographsDeletedManagedFilesAreQueuedForCleanup'),
    )
    if (ok) {
      selection.value = {}
      deleteOpen.value = false
    }
  } finally {
    saving.value = false
  }
}
async function addToAlbum() {
  if (!targetAlbum.value) return
  const ok = await action(
    () =>
      api(base.value + '/albums/' + targetAlbum.value + '/photos', {
        method: 'POST',
        body: { photoIds: chosen.value.map((p) => p.id) },
      }),
    t('cloud.messages.photographsAddedToAlbum'),
  )
  if (ok) {
    albumOpen.value = false
    selection.value = {}
  }
}
const processingOpen = ref(false),
  processingPhotos = ref<Photo[]>([]),
  processingOperation = ref('reindex')
function openProcessing(photos: Photo[]) {
  processingPhotos.value = photos
  processingOperation.value = 'reindex'
  processingOpen.value = true
}
async function processPhotos() {
  const ok = await action(
    async () => {
      for (
        let offset = 0;
        offset < processingPhotos.value.length;
        offset += 100
      )
        await api(base.value + '/photos/process-batch', {
          method: 'POST',
          body: {
            photoIds: processingPhotos.value
              .slice(offset, offset + 100)
              .map((p) => p.id),
            operation: processingOperation.value,
          },
        })
    },
    processingText('Processing tasks queued.', '处理任务已排队。'),
  )
  if (ok) processingOpen.value = false
}
const liveOpen = ref(false),
  livePhoto = ref<Photo>(),
  liveFile = ref<File>(),
  attaching = ref(false)
let liveController: AbortController | undefined
onBeforeUnmount(() => liveController?.abort())
async function attachVideo() {
  if (!livePhoto.value || !liveFile.value || attaching.value) return
  attaching.value = true
  liveController = new AbortController()
  const photoId = livePhoto.value.id,
    file = liveFile.value,
    signal = liveController.signal
  try {
    const ok = await action(
      async () => {
        const latest = await api<{ revision: number }>(
          base.value + '/photos/' + photoId,
        )
        const body = {
          revision: latest.revision,
          fileName: file.name,
          bytes: file.size,
        }
        const reservation = await api<{ id: string; url: string }>(
          base.value + '/photos/' + photoId + '/live-video',
          { method: 'POST', body: { ...body, phase: 'prepare' } },
        )
        const response = await fetch(reservation.url, {
          method: 'PUT',
          body: file,
          headers: { 'Content-Type': 'video/quicktime' },
          credentials: 'omit',
          redirect: 'error',
          signal,
        })
        if (!response.ok) throw new Error('video_upload_failed')
        await api(base.value + '/photos/' + photoId + '/live-video', {
          method: 'POST',
          body: {
            phase: 'complete',
            uploadId: reservation.id,
            revision: latest.revision,
          },
        })
      },
      processingText('Live Photo processing queued.', '实况照片处理已排队。'),
    )
    if (ok) {
      liveOpen.value = false
      liveFile.value = undefined
    }
  } finally {
    attaching.value = false
  }
}
function actions(photo: Photo) {
  return [
    [
      {
        label: t('cloud.messages.preview'),
        icon: 'i-lucide-eye',
        onSelect: () => {
          preview.value = photo
        },
      },
      {
        label: processingText('Attach Live Photo video', '补充实况照片视频'),
        icon: 'i-lucide-video',
        disabled: !admin.value,
        onSelect: () => {
          livePhoto.value = photo
          liveFile.value = undefined
          liveOpen.value = true
        },
      },
      {
        label: processingText('Process photo', '处理照片'),
        icon: 'i-lucide-refresh-cw',
        disabled: !admin.value,
        onSelect: () => openProcessing([photo]),
      },
      {
        label: t('cloud.messages.editDetails'),
        icon: 'i-lucide-pencil',
        disabled: !admin.value,
        onSelect: () => edit(photo),
      },
    ],
    [
      {
        label: t('cloud.messages.deletePhotograph'),
        icon: 'i-lucide-trash-2',
        color: 'error' as const,
        disabled: !admin.value,
        onSelect: () => deleteOne(photo),
      },
    ],
  ]
}
watch(
  () => photos.value.map((p) => p.id).join(','),
  () => {
    const ids = new Set(photos.value.map((p) => p.id))
    selection.value = Object.fromEntries(
      Object.entries(selection.value).filter(([id]) => ids.has(id)),
    )
  },
)
</script>
<template>
  <section
    :aria-label="$t('cloud.messages.photoLibrary')"
    class="min-w-0 font-sans flex h-full min-h-0 flex-col"
  >
    <UDashboardNavbar
      :toggle="false"
      :title="$t('dashboard.photos.toolbar.title')"
    >
      <template #right>
        <UButton
          v-if="admin"
          size="sm"
          class="min-h-8!"
          icon="tabler:cloud-upload"
          :disabled="!uploadAdmission.allowed || !!quota.error.value"
          @click="openUpload"
        >
          {{ $t('dashboard.photos.buttons.upload') }}
        </UButton>
      </template>
    </UDashboardNavbar>
    <div class="flex flex-1 min-w-0 min-h-0 p-4 sm:p-6">
      <div :class="photoLibraryPresentation.body">
        <CloudQuotaNotice
          v-if="
            admin &&
            (quota.error.value ||
              (uploadAdmission.reason && uploadAdmission.reason !== 'checking'))
          "
          :reason="uploadAdmission.reason"
          :error="!!quota.error.value"
          @retry="quota.refresh()"
        />
        <div :class="photoLibraryPresentation.panel">
          <div
            class="cf-photo-library-toolbar"
            :class="photoLibraryPresentation.toolbar"
          >
            <ConsolePhotoLibrarySummary :photos="rows" />
            <div
              class="cf-photo-library-tools min-w-0 flex flex-wrap items-center gap-2"
            >
              <UInput
                v-model="search"
                icon="i-lucide-search"
                :placeholder="$t('cloud.messages.searchPhotographs')"
                :aria-label="$t('cloud.messages.searchPhotographs2')"
                class="cf-library-search"
              /><OverlayFilterPopover
                ><UButton
                  size="sm"
                  class="h-7 min-h-7!"
                  :variant="'soft'"
                  :color="hasActiveFilters ? 'info' : 'neutral'"
                  icon="tabler:filter"
                  :aria-label="$t('cloud.messages.filters')"
                  ><span class="hidden sm:inline">{{
                    $t('cloud.messages.filters')
                  }}</span></UButton
                ></OverlayFilterPopover
              ><OverlaySortPopover
                ><UButton
                  size="sm"
                  color="neutral"
                  variant="soft"
                  icon="tabler:arrows-sort"
                  class="h-7 min-h-7!"
                  :aria-label="$t('cloud.messages.sort')"
                  ><span class="hidden sm:inline">{{
                    $t('cloud.messages.sort')
                  }}</span></UButton
                ></OverlaySortPopover
              ><UButton
                variant="ghost"
                size="sm"
                class="h-7 min-h-7! w-7 min-w-7!"
                square
                icon="tabler:refresh"
                :aria-label="$t('cloud.messages.refreshPhotographs')"
                :loading="loading"
                @click="refreshMedia"
              />
              <UDropdownMenu
                v-if="layout !== 'masonry'"
                :items="
                  columns
                    .filter(
                      (c) =>
                        !['select', 'thumbnailUrl', 'id', 'actions'].includes(
                          String(
                            c.id ?? ('accessorKey' in c ? c.accessorKey : ''),
                          ),
                        ),
                    )
                    .map((c) => {
                      const id = String(
                        c.id ?? ('accessorKey' in c ? c.accessorKey : ''),
                      )
                      return {
                        label: String(c.header),
                        type: 'checkbox' as const,
                        checked:
                          columnVisibility[id as keyof typeof columnVisibility],
                        onUpdateChecked: (checked: boolean) => {
                          columnVisibility[
                            id as keyof typeof columnVisibility
                          ] = checked
                        },
                        onSelect: (event: Event) => event.preventDefault(),
                      }
                    })
                "
              >
                <UButton
                  size="sm"
                  color="neutral"
                  variant="soft"
                  icon="tabler:columns-3"
                  class="h-7 min-h-7!"
                  :aria-label="
                    $t('dashboard.photos.table.columnVisibility.button')
                  "
                  ><span class="hidden sm:inline">{{
                    $t('dashboard.photos.table.columnVisibility.button')
                  }}</span></UButton
                >
              </UDropdownMenu>
              <ConsolePhotoLayoutSwitch v-model="layout" />
            </div>
          </div>
          <div :class="photoLibraryPresentation.content">
            <ConsoleSelectionToolbar
              :count="chosen.length"
              :total="rows.length"
              teleport
            >
              <CfButton
                v-if="admin"
                size="sm"
                variant="ghost"
                :icon="ButtonIconFolderPlus"
                @click="albumOpen = true"
                >{{ $t('cloud.messages.addToAlbum') }}</CfButton
              ><CfButton
                variant="ghost"
                class="cf-bulk-delete"
                v-if="admin"
                size="sm"
                :icon="ButtonIconTrash2"
                @click="deleteOpen = true"
                >{{ $t('cloud.messages.delete') }}</CfButton
              ><CfButton
                size="sm"
                variant="ghost"
                @click="selection = {}"
                >{{ $t('cloud.messages.clear') }}</CfButton
              >
              <CfButton
                v-if="admin"
                size="sm"
                variant="ghost"
                @click="openProcessing(chosen)"
                >{{
                  processingText('Process selected', '处理所选照片')
                }}</CfButton
              >
            </ConsoleSelectionToolbar>
            <ConsolePhotoMasonry
              class="overflow-auto p-3"
              v-if="layout === 'masonry' && rows.length"
              v-model:selection="selection"
              :photos="rows"
              :actions="actions"
              @preview="preview = $event"
            />
            <ConsolePhotoTable
              v-else
              v-model:row-selection="selection"
              v-model:column-visibility="columnVisibility"
              :data="rows"
              :columns="columns"
              :loading="loading && !photos.length"
              :get-row-id="(row: Photo) => row.id"
              ><template #select-header
                ><UCheckbox
                  :model-value="
                    chosen.length && chosen.length < rows.length
                      ? 'indeterminate'
                      : rows.length > 0 && chosen.length === rows.length
                  "
                  :aria-label="$t('cloud.messages.selectAllPhotographs')"
                  @update:model-value="
                    (v) => {
                      selection =
                        v === true
                          ? Object.fromEntries(rows.map((p) => [p.id, true]))
                          : {}
                    }
                  " /></template
              ><template #select-cell="{ row }"
                ><UCheckbox
                  :model-value="!!selection[row.original.id]"
                  :aria-label="
                    $t('cloud.ui.selectNamed', { title: row.original.title })
                  "
                  @update:model-value="
                    (v) => (selection[row.original.id] = !!v)
                  "
              /></template>
              <template #actions-cell="{ row }">
                <ConsolePhotoTableActions
                  :items="actions(row.original)"
                  :label="
                    $t('cloud.ui.actionsNamed', { title: row.original.title })
                  "
                />
              </template>
              <template #empty
                ><div class="cf-library-empty">
                  <UIcon
                    name="i-lucide-images"
                    class="size-8"
                  />
                  <h3>
                    {{
                      search
                        ? $t('cloud.messages.noMatchingPhotographs')
                        : $t('cloud.messages.yourLibraryStartsHere')
                    }}
                  </h3>
                  <p>
                    {{
                      search
                        ? $t(
                            'cloud.messages.tryAnotherSearchOrClearYourFilters',
                          )
                        : $t(
                            'cloud.messages.uploadPhotographsToStartTellingYourStory',
                          )
                    }}
                  </p>
                  <CfButton
                    v-if="admin && !photos.length"
                    variant="soft"
                    :disabled="!uploadAdmission.allowed || !!quota.error.value"
                    @click="openUpload"
                    >{{ $t('cloud.messages.upload') }}</CfButton
                  >
                </div></template
              ></ConsolePhotoTable
            >
          </div>
        </div>
      </div>
    </div>
    <USlideover
      v-model:open="editor"
      :title="$t('cloud.messages.editPhotograph')"
      :description="$t('cloud.messages.updateTheDetailsShownInYourGallery')"
      :ui="{ footer: 'justify-end' }"
      ><template #body
        ><p
          v-if="failed && message"
          role="alert"
          class="cf-notice cf-notice-error"
        >
          {{ message }}
        </p>
        <p
          v-if="photoLoaded !== editPhoto.id"
          role="status"
        >
          {{ $t('cloud.messages.loadingPhotograph') }}
        </p>
        <UForm
          v-else
          id="cloud-edit-photo"
          :state="editPhoto"
          class="space-y-5"
          @submit="save"
          ><ConsolePhotoDetailsFields
            v-model:title="editPhoto.title"
            v-model:description="editPhoto.description"
            v-model:tags="editPhoto.tags"
            v-model:rating="editPhoto.rating" /></UForm></template
      ><template #footer
        ><CfButton
          variant="secondary"
          @click="editor = false"
          >{{ $t('cloud.messages.cancel') }}</CfButton
        ><CfButton
          type="submit"
          form="cloud-edit-photo"
          :loading="busy"
          :disabled="photoLoaded !== editPhoto.id || !editPhoto.title.trim()"
          >{{ $t('cloud.messages.saveChanges') }}</CfButton
        ></template
      ></USlideover
    >
    <UModal
      :open="!!preview"
      :title="preview?.title || $t('cloud.messages.photograph')"
      :description="$t('cloud.messages.previewPhotograph')"
      :ui="{ content: 'max-w-2xl' }"
      @update:open="
        (v) => {
          if (!v) preview = null
        }
      "
      ><template #body
        ><div
          v-if="preview"
          class="cf-photo-preview"
        >
          <MasonryItemPhoto
            :key="preview.id"
            :photo="preview"
            :index="0"
            @open-viewer="openPreviewOriginal"
          /></div></template
    ></UModal>
    <UModal
      v-model:open="deleteOpen"
      :title="$t('cloud.messages.deletePhotographs')"
      :description="
        $t(
          'cloud.messages.thisDeletesTheSelectedPhotographsAndQueuesTheirManaged',
        )
      "
      ><template #footer
        ><CfButton
          variant="secondary"
          @click="deleteOpen = false"
          >{{ $t('cloud.messages.cancel') }}</CfButton
        ><CfButton
          variant="destructive"
          :loading="saving"
          @click="deleteChosen"
          >{{
            $t(
              'cloud.ui.deletePhotosCount',
              { count: chosen.length },
              chosen.length,
            )
          }}</CfButton
        ></template
      ></UModal
    >
    <UModal
      v-model:open="albumOpen"
      :title="$t('cloud.messages.addToAlbum')"
      :description="$t('cloud.messages.chooseAnAlbumForTheSelectedPhotographs')"
      ><template #body
        ><USelect
          v-model="targetAlbum"
          :items="albums.map((a) => ({ label: a.title, value: a.id }))"
          :placeholder="$t('cloud.messages.chooseAnAlbum')"
          class="w-full"
        />
        <p
          v-if="!albums.length"
          class="text-sm text-muted"
        >
          {{ $t('cloud.messages.createAnAlbumFirstFromTheAlbumsPage') }}
        </p></template
      ><template #footer
        ><CfButton
          variant="secondary"
          @click="albumOpen = false"
          >{{ $t('cloud.messages.cancel') }}</CfButton
        ><CfButton
          :disabled="!targetAlbum"
          :loading="busy"
          @click="addToAlbum"
          >{{ $t('cloud.messages.addPhotographs') }}</CfButton
        ></template
      ></UModal
    >
  </section>
  <UModal
    v-model:open="processingOpen"
    :title="processingText('Process photos', '处理照片')"
    ><template #body
      ><div class="cf-form">
        <p>
          {{ processingText('Selected photographs', '已选择照片') }}:
          {{ processingPhotos.length }}
        </p>
        <label class="cf-field"
          >{{ processingText('Operation', '操作')
          }}<CfSelect v-model="processingOperation"
            ><option value="reindex">
              {{
                processingText(
                  'Rebuild EXIF and thumbnails',
                  '重建 EXIF 与缩略图',
                )
              }}
            </option>
            <option value="geocoding">
              {{ processingText('Refresh locations', '更新地理位置') }}
            </option>
            <option value="erase-location">
              {{ processingText('Erase image locations', '擦除照片位置') }}
            </option></CfSelect
          ></label
        >
        <p class="cf-field-hint">
          {{
            processingOperation === 'erase-location'
              ? processingText(
                  'GPS is removed from metadata and downloadable image files. This cannot be undone after old originals are cleaned up. Companion videos retain their original metadata.',
                  '将从元数据和可下载原图中移除 GPS，旧原图清理后不可撤销。配对视频保留原有元数据。',
                )
              : processingText(
                  'Published photos remain visible during processing. Existing tasks must finish before new processing can be queued.',
                  '处理期间已发布照片保持可见；已有任务需结束后才能重新排队。',
                )
          }}
        </p>
      </div></template
    ><template #footer
      ><CfButton
        variant="outline"
        :disabled="busy"
        @click="processingOpen = false"
        >{{ t('cloud.messages.cancel') }}</CfButton
      ><CfButton
        :disabled="busy"
        @click="processPhotos"
        >{{ processingText('Queue processing', '提交处理') }}</CfButton
      ></template
    ></UModal
  >
  <UModal
    v-model:open="liveOpen"
    :title="processingText('Attach Live Photo video', '补充实况照片视频')"
    :dismissible="!attaching"
    :close="!attaching"
    ><template #body
      ><div class="cf-form">
        <p>{{ livePhoto?.title }}</p>
        <label class="cf-field"
          >{{ processingText('MOV companion video', 'MOV 配对视频')
          }}<UInput
            type="file"
            accept=".mov,video/quicktime"
            :disabled="attaching"
            @change="liveFile = ($event.target as HTMLInputElement).files?.[0]"
        /></label>
        <p class="cf-field-hint">
          {{
            processingText(
              'Upload a companion video for this photo. Processing will publish the new pairing after verification.',
              '为此照片上传配对视频，核实并完成处理后发布新配对。',
            )
          }}
        </p>
      </div></template
    ><template #footer
      ><CfButton
        variant="outline"
        :disabled="attaching"
        @click="liveOpen = false"
        >{{ t('cloud.messages.cancel') }}</CfButton
      ><CfButton
        :disabled="attaching || !liveFile"
        @click="attachVideo"
        >{{ processingText('Upload and process', '上传并处理') }}</CfButton
      ></template
    ></UModal
  >
</template>

<style scoped>
@media (max-width: 639px) {
  .cf-photo-library-toolbar {
    display: grid;
    grid-template-columns: minmax(0, 1fr) repeat(5, auto);
    align-items: center;
    gap: 8px 4px;
  }
  .cf-photo-library-tools {
    display: contents;
  }
  .cf-photo-library-tools :deep(button) {
    width: 28px;
    min-width: 28px;
    height: 28px;
    min-height: 28px;
    padding: 0;
    justify-content: center;
  }
  .cf-photo-library-tools :deep(.cf-photo-layout-switch) {
    grid-column: -2 / -1;
    grid-row: 1;
  }
  .cf-library-search {
    grid-column: 1 / -1;
    grid-row: 2;
    width: 100%;
  }
  .cf-library-search :deep(input) {
    min-height: 34px;
    font-size: 14px;
  }
}
</style>
