<script setup lang="ts">
import type { Photo } from '@chronoframe/contracts/resources'
import type { TableColumn } from '@nuxt/ui'
const {
  photos,
  message,
  failed,
  albums,
  jobs,
  loading,
  admin,
  busy,
  uploadOpen,
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
const chosen = computed(() => rows.value.filter((p) => selection.value[p.id]))
const columns: TableColumn<Photo>[] = [
  { id: 'select', header: '', size: 32 },
  { accessorKey: 'thumbnailUrl', header: 'Photograph' },
  { accessorKey: 'title', header: 'Title' },
  { accessorKey: 'tags', header: 'Tags' },
  { accessorKey: 'dateTaken', header: 'Date taken' },
  { accessorKey: 'fileSize', header: 'Size' },
  { id: 'actions', header: '' },
]
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
      'Photographs deleted. Managed files are queued for cleanup.',
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
    'Photographs added to album.',
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
        label: 'Preview',
        icon: 'i-lucide-eye',
        onSelect: () => {
          preview.value = photo
        },
      },
      {
        label: 'Edit details',
        icon: 'i-lucide-pencil',
        disabled: !admin.value,
        onSelect: () => edit(photo),
      },
    ],
    [
      {
        label: 'Delete photograph',
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
        <h2 id="library-heading">Photo library</h2>
        <p>
          {{ photos.length }} photographs · {{ pendingJobs.length }} processing
        </p>
      </div>
      <UButton
        v-if="admin"
        icon="i-lucide-upload"
        @click="uploadOpen = true"
        >Upload</UButton
      >
    </div>
    <div class="cf-library-toolbar">
      <UInput
        v-model="search"
        icon="i-lucide-search"
        placeholder="Search photographs…"
        aria-label="Search photographs"
        class="cf-library-search"
      /><UPopover
        ><UButton
          color="neutral"
          :variant="hasActiveFilters ? 'soft' : 'outline'"
          icon="i-lucide-filter"
          >Filters</UButton
        ><template #content><OverlayFilterPanel /></template></UPopover
      ><UPopover
        ><UButton
          color="neutral"
          variant="outline"
          icon="i-lucide-arrow-up-down"
          >Sort</UButton
        ><template #content><OverlaySortPanel /></template></UPopover
      ><UButton
        color="neutral"
        variant="ghost"
        icon="i-lucide-refresh-cw"
        aria-label="Refresh photographs"
        :loading="loading"
        @click="refreshMedia"
      />
    </div>
    <div
      v-if="chosen.length"
      class="cf-selection-bar"
    >
      <span>{{ chosen.length }} selected</span
      ><UButton
        v-if="admin"
        size="sm"
        variant="soft"
        icon="i-lucide-folder-plus"
        @click="albumOpen = true"
        >Add to album</UButton
      ><UButton
        v-if="admin"
        size="sm"
        color="error"
        variant="soft"
        icon="i-lucide-trash-2"
        @click="deleteOpen = true"
        >Delete</UButton
      ><UButton
        color="neutral"
        size="sm"
        variant="ghost"
        @click="selection = {}"
        >Clear</UButton
      >
    </div>
    <div class="cf-library-table">
      <ConsoleMediaTable
        :data="rows"
        :columns="columns"
        :loading="loading && !photos.length"
        :get-row-id="(row: Photo) => row.id"
        ><template #select-header
          ><UCheckbox
            :model-value="rows.length > 0 && rows.every((p) => selection[p.id])"
            aria-label="Select all photographs"
            @update:model-value="
              (v) => {
                selection = v
                  ? Object.fromEntries(rows.map((p) => [p.id, true]))
                  : {}
              }
            " /></template
        ><template #select-cell="{ row }"
          ><UCheckbox
            :model-value="!!selection[row.original.id]"
            :aria-label="`Select ${row.original.title}`"
            @update:model-value="
              (v) => (selection[row.original.id] = !!v)
            " /></template
        ><template #thumbnailUrl-cell="{ row }"
          ><button
            class="cf-library-thumb"
            :aria-label="`Preview ${row.original.title}`"
            @click="preview = row.original"
          >
            <ThumbImage
              :src="row.original.thumbnailUrl || ''"
              :alt="row.original.title"
            /><span
              v-if="row.original.isLivePhoto"
              class="cf-live-label"
              >LIVE</span
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
        ><template #dateTaken-cell="{ row }"
          ><span class="text-xs text-muted">{{
            row.original.dateTaken
              ? new Date(row.original.dateTaken).toLocaleDateString()
              : '—'
          }}</span></template
        ><template #fileSize-cell="{ row }"
          ><span class="text-xs text-muted">{{
            row.original.fileSize ? formatBytes(row.original.fileSize) : '—'
          }}</span></template
        ><template #actions-cell="{ row }"
          ><UDropdownMenu :items="actions(row.original)"
            ><UButton
              color="neutral"
              variant="ghost"
              icon="i-lucide-ellipsis"
              :aria-label="`Actions for ${row.original.title}`" /></UDropdownMenu></template
        ><template #empty
          ><div class="cf-library-empty">
            <UIcon
              name="i-lucide-images"
              class="size-8"
            />
            <h3>
              {{
                search ? 'No matching photographs' : 'Your library starts here'
              }}
            </h3>
            <p>
              {{
                search
                  ? 'Try another search or clear your filters.'
                  : 'Upload photographs to start telling your story.'
              }}
            </p>
            <UButton
              v-if="admin && !photos.length"
              variant="soft"
              @click="uploadOpen = true"
              >Upload</UButton
            >
          </div></template
        ></ConsoleMediaTable
      >
    </div>
    <section
      v-if="pendingJobs.length"
      class="cf-processing-panel"
      aria-label="Processing queue"
    >
      <h3>Processing queue</h3>
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
          <strong>{{ job.state.replaceAll('_', ' ') }}</strong
          ><span
            >Attempt {{ job.attempts
            }}<template v-if="job.error_code">
              · {{ job.error_code.replaceAll('_', ' ') }}</template
            ></span
          >
        </div>
        <UButton
          v-if="admin && job.state === 'failed'"
          color="neutral"
          variant="outline"
          size="sm"
          :disabled="busy"
          @click="
            action(
              () =>
                api(base + '/jobs/' + job.id + '/retry', {
                  method: 'POST',
                  body: {},
                }),
              'Job queued again.',
            )
          "
          >Retry</UButton
        ><UButton
          v-if="admin && job.state !== 'cancelled'"
          color="error"
          variant="ghost"
          size="sm"
          @click="removePhoto(job.photo_id)"
          >Remove</UButton
        >
      </div>
    </section>
    <USlideover
      v-model:open="editor"
      title="Edit photograph"
      description="Update the details shown in your gallery."
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
          Loading photograph…
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
        ><UButton
          color="neutral"
          variant="outline"
          @click="editor = false"
          >Cancel</UButton
        ><UButton
          type="submit"
          form="cloud-edit-photo"
          :loading="busy"
          :disabled="photoLoaded !== editPhoto.id || !editPhoto.title.trim()"
          >Save changes</UButton
        ></template
      ></USlideover
    >
    <UModal
      :open="!!preview"
      :title="preview?.title || 'Photograph'"
      description="Preview photograph"
      :ui="{ content: 'max-w-5xl', body: 'p-0' }"
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
          <WebGLImageViewer
            :src="preview.originalUrl || preview.thumbnailUrl || ''"
            :alt="preview.title"
          />
          <div class="cf-preview-details">
            <strong>{{ preview.title }}</strong>
            <p>{{ preview.description }}</p>
          </div>
        </div></template
      ></UModal
    >
    <UModal
      v-model:open="deleteOpen"
      title="Delete photographs?"
      description="This deletes the selected photographs and queues their managed original, thumbnail and Live Photo files for cleanup."
      ><template #footer
        ><UButton
          color="neutral"
          variant="outline"
          @click="deleteOpen = false"
          >Cancel</UButton
        ><UButton
          color="error"
          :loading="saving"
          @click="deleteChosen"
          >Delete {{ chosen.length }} photograph{{
            chosen.length === 1 ? '' : 's'
          }}</UButton
        ></template
      ></UModal
    >
    <UModal
      v-model:open="albumOpen"
      title="Add to album"
      description="Choose an album for the selected photographs."
      ><template #body
        ><USelect
          v-model="targetAlbum"
          :items="albums.map((a) => ({ label: a.title, value: a.id }))"
          placeholder="Choose an album"
          class="w-full"
        />
        <p
          v-if="!albums.length"
          class="text-sm text-muted"
        >
          Create an album first from the Albums page.
        </p></template
      ><template #footer
        ><UButton
          color="neutral"
          variant="outline"
          @click="albumOpen = false"
          >Cancel</UButton
        ><UButton
          :disabled="!targetAlbum"
          :loading="busy"
          @click="addToAlbum"
          >Add photographs</UButton
        ></template
      ></UModal
    >
  </section>
</template>
