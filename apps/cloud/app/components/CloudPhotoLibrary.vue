<script setup lang="ts">
import {
  ArrowUpDown as ButtonIconArrowUpDown,
  Columns3,
  Ellipsis as ButtonIconEllipsis,
  Filter as ButtonIconFilter,
  FolderPlus as ButtonIconFolderPlus,
  RefreshCw as ButtonIconRefreshCw,
  Trash2 as ButtonIconTrash2,
  Upload as ButtonIconUpload,
} from 'lucide-vue-next'
import { uploadQuotaGate } from '../utils/quota-gate'
import { DASHBOARD_PHOTO_COLUMN_IDS } from '#console/composables/useDashboardPhotoColumnVisibility'
const { t } = useI18n()
const dayjs = useDayjs()
const locationLabel = useLocationLabel()

import type { Photo } from '@chronoframe/contracts/resources'
import type { TableColumn } from '@nuxt/ui'
const {
  photos,
  message,
  failed,
  albums,
  jobs,
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
async function openUpload() {
  await quota.refresh()
  if (uploadAdmission.value.allowed && !quota.error.value) {
    const target = uploadAdmission.value
    if ('connectionId' in target && target.connectionId)
      connectionId.value = target.connectionId
    uploadOpen.value = true
  }
}
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
  hidden: ['id'],
  locked: ['thumbnailUrl', 'actions'],
})
const reactions = ref<Record<string, number> | null>(null)
watch(
  photos,
  async (_, __, onCleanup) => {
    let active = true
    onCleanup(() => {
      active = false
    })
    try {
      const counts = await api<Record<string, number>>(
        base.value + '/photos/reactions',
      )
      if (active) reactions.value = counts
    } catch {
      if (active) reactions.value = null
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
const columns = computed<TableColumn<Photo>[]>(() => [
  { id: 'select', header: '', size: 32, enableHiding: false },
  ...DASHBOARD_PHOTO_COLUMN_IDS.filter(
    (key) => key !== 'actions' && key !== 'lastModified',
  ).map((key) => ({
    id: key,
    enableHiding: key !== 'thumbnailUrl',
    accessorFn: (photo: Photo) =>
      key === 'colorSpace' ? photo.exif?.ColorSpace : photo[key as keyof Photo],
    header: t(
      'dashboard.photos.table.columns.' +
        (key === 'thumbnailUrl' ? 'thumbnail.title' : key),
    ),
  })),
  {
    id: 'actions',
    enableHiding: false,
    header: () => h('span', { class: 'sr-only' }, t('cloud.dashboard.actions')),
  },
])
const pendingJobs = computed(() =>
  jobs.value.filter((j) => j.state !== 'succeeded'),
)
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
    aria-labelledby="library-heading"
    class="cf-library"
  >
    <div class="cf-library-heading">
      <div>
        <h2 id="library-heading">{{ $t('cloud.messages.photoLibrary') }}</h2>
        <p>
          {{
            $t('cloud.ui.photoQueue', {
              count: photos.length,
              processing: pendingJobs.length,
            })
          }}
        </p>
      </div>
      <CfButton
        v-if="admin"
        :icon="ButtonIconUpload"
        :disabled="!uploadAdmission.allowed || !!quota.error.value"
        @click="openUpload"
        >{{ $t('cloud.messages.upload') }}</CfButton
      >
    </div>
    <CloudQuotaNotice
      v-if="admin && (uploadAdmission.reason || quota.error.value)"
      :reason="uploadAdmission.reason"
      :error="!!quota.error.value"
      @retry="quota.refresh()"
    />
    <div class="cf-library-toolbar">
      <UInput
        v-model="search"
        icon="i-lucide-search"
        :placeholder="$t('cloud.messages.searchPhotographs')"
        :aria-label="$t('cloud.messages.searchPhotographs2')"
        class="cf-library-search"
      /><OverlayFilterPopover
        ><CfButton
          :variant="hasActiveFilters ? 'soft' : 'secondary'"
          :icon="ButtonIconFilter"
          >{{ $t('cloud.messages.filters') }}</CfButton
        ></OverlayFilterPopover
      ><OverlaySortPopover
        ><CfButton
          variant="secondary"
          :icon="ButtonIconArrowUpDown"
          >{{ $t('cloud.messages.sort') }}</CfButton
        ></OverlaySortPopover
      ><CfButton
        variant="ghost"
        :icon="ButtonIconRefreshCw"
        :aria-label="$t('cloud.messages.refreshPhotographs')"
        :loading="loading"
        @click="refreshMedia"
      />
      <UDropdownMenu
        :items="
          columns
            .filter(
              (c) =>
                c.id && !['select', 'thumbnailUrl', 'actions'].includes(c.id),
            )
            .map((c) => ({
              label: String(c.header),
              type: 'checkbox' as const,
              checked: columnVisibility[c.id as keyof typeof columnVisibility],
              onUpdateChecked: (checked: boolean) => {
                columnVisibility[c.id as keyof typeof columnVisibility] =
                  checked
              },
              onSelect: (event: Event) => event.preventDefault(),
            }))
        "
      >
        <CfButton
          variant="secondary"
          :icon="Columns3"
          >{{ $t('dashboard.photos.table.columnVisibility.button') }}</CfButton
        >
      </UDropdownMenu>
    </div>
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
    </ConsoleSelectionToolbar>
    <CfTable
      class="cf-library-table"
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
          " /></template
      ><template #thumbnailUrl-cell="{ row }"
        ><button
          class="cf-library-thumb"
          :aria-label="
            $t('cloud.ui.previewNamed', { title: row.original.title })
          "
          @click="preview = row.original"
        >
          <ThumbImage
            :src="row.original.thumbnailUrl || row.original.originalUrl || ''"
            :thumbhash="row.original.thumbnailHash || ''"
            :alt="row.original.title"
          /><span
            v-if="row.original.isLivePhoto"
            class="cf-live-label"
            >{{ $t('cloud.messages.live') }}</span
          >
        </button></template
      ><template #title-cell="{ row }"
        ><button
          class="cf-photo-title"
          @click="preview = row.original"
        >
          {{ row.original.title }}</button
        ><span class="cf-photo-dimensions"
          >{{ row.original.width }} × {{ row.original.height }}</span
        ></template
      ><template #tags-cell="{ row }"
        ><div class="cf-tag-list">
          <UBadge
            v-for="tag in (row.original.tags ?? []).slice(0, 3)"
            :key="tag"
            color="neutral"
            variant="soft"
            size="sm"
            >{{ tag }}</UBadge
          ><span
            v-if="!row.original.tags?.length"
            class="text-muted"
            >—</span
          >
        </div></template
      ><template #rating-cell="{ row }">
        <Rating
          v-if="row.original.exif?.Rating != null"
          :model-value="row.original.exif.Rating"
          readonly
          size="xs"
        />
        <span v-else>—</span> </template
      ><template #isLivePhoto-cell="{ row }">
        <span>{{
          row.original.isLivePhoto
            ? $t('ui.livePhoto')
            : $t('dashboard.photos.table.cells.staticPhoto')
        }}</span> </template
      ><template #location-cell="{ row }">
        <span>{{
          row.original.exif?.GPSLongitude != null &&
          row.original.exif?.GPSLatitude != null
            ? locationLabel(row.original) ||
              $t('dashboard.photos.table.cells.unknown')
            : $t('dashboard.photos.table.cells.noGps')
        }}</span> </template
      ><template #dateTaken-cell="{ row }">
        <span class="cf-library-date">{{
          row.original.dateTaken
            ? dayjs(row.original.dateTaken).format('YYYY-MM-DD HH:mm:ss')
            : '—'
        }}</span> </template
      ><template #colorSpace-cell="{ row }">
        <span>{{ row.original.exif?.ColorSpace ?? '—' }}</span> </template
      ><template #reactions-cell="{ row }"
        ><span>{{
          reactions ? reactions[row.original.id] || 0 : '—'
        }}</span></template
      >
      <template #fileSize-cell="{ row }">
        <span>{{
          row.original.fileSize != null
            ? formatBytes(row.original.fileSize)
            : '—'
        }}</span>
      </template>
      <template #actions-cell="{ row }"
        ><UDropdownMenu :items="actions(row.original)"
          ><CfButton
            variant="ghost"
            :icon="ButtonIconEllipsis"
            :aria-label="
              $t('cloud.ui.actionsNamed', { title: row.original.title })
            " /></UDropdownMenu></template
      ><template #empty
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
                ? $t('cloud.messages.tryAnotherSearchOrClearYourFilters')
                : $t('cloud.messages.uploadPhotographsToStartTellingYourStory')
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
      ></CfTable
    >
    <section
      v-if="pendingJobs.length"
      class="cf-processing-panel"
      :aria-label="$t('cloud.messages.processingQueue')"
    >
      <h3>{{ $t('cloud.messages.processingQueue') }}</h3>
      <div
        v-for="job in pendingJobs"
        :key="job.id"
        class="cf-processing-row"
      >
        <UIcon
          :name="
            job.state === 'failed'
              ? 'i-lucide-circle-alert'
              : 'i-lucide-loader-circle'
          "
          :class="{ 'animate-spin': job.state === 'running' }"
        />
        <div>
          <strong>{{
            $t(
              [
                'queued',
                'running',
                'retry_wait',
                'failed',
                'cancelled',
                'succeeded',
              ].includes(job.state)
                ? 'cloud.ui.' + job.state
                : 'cloud.ui.unknownJob',
            )
          }}</strong
          ><span
            >{{ $t('cloud.ui.attemptCount', { count: job.attempts })
            }}<template v-if="job.error_code">
              ·
              {{
                $t('cloud.ui.processingFailure', { code: job.error_code })
              }}</template
            ></span
          >
        </div>
        <CfButton
          v-if="admin && job.state === 'failed'"
          variant="secondary"
          size="sm"
          :disabled="busy"
          @click="
            action(
              () =>
                api(base + '/jobs/' + job.id + '/retry', {
                  method: 'POST',
                  body: {},
                }),
              $t('cloud.messages.jobQueuedAgain'),
            )
          "
          >{{ $t('cloud.messages.retry') }}</CfButton
        ><CfButton
          variant="destructive"
          v-if="admin && job.state !== 'cancelled'"
          size="sm"
          @click="removePhoto(job.photo_id)"
          >{{ $t('cloud.messages.remove') }}</CfButton
        >
      </div>
    </section>
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
</template>
