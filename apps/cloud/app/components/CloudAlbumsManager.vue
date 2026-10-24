<script setup lang="ts">
import type { Album, Photo } from '@chronoframe/contracts/resources'
import type { TableColumn } from '@nuxt/ui'
const {
  albums,
  message,
  failed,
  photos,
  admin,
  busy,
  loading,
  api,
  base,
  action,
  refreshMedia,
} = useCloudSiteMedia()
const toast = useToast()
const search = ref(''),
  editor = ref(false),
  removeOpen = ref(false),
  picker = ref(false),
  saving = ref(false),
  loaded = ref(false),
  selected = ref<number | null>(null),
  revision = ref(0),
  hadPassword = ref(false),
  generation = ref(0)
const draft = reactive({
  title: '',
  description: '',
  isHidden: false,
  passwordEnabled: false,
  password: '',
  photoIds: [] as string[],
  coverPhotoId: '',
})
const photoSearch = ref(''),
  pickerPanel = ref<HTMLElement>()
watch(picker, async (open) => {
  if (open) {
    await nextTick()
    pickerPanel.value?.querySelector('input')?.focus()
  } else document.getElementById('album-select-photographs')?.focus()
})
const rows = computed(() =>
  albums.value.filter(
    (a) =>
      !search.value ||
      [a.title, a.description]
        .join(' ')
        .toLowerCase()
        .includes(search.value.toLowerCase()),
  ),
)
const choices = computed(() =>
  photos.value.filter(
    (p) =>
      !photoSearch.value ||
      [p.title, ...(p.tags ?? [])]
        .join(' ')
        .toLowerCase()
        .includes(photoSearch.value.toLowerCase()),
  ),
)
const chosen = computed(() =>
  draft.photoIds
    .map((id) => photos.value.find((p) => p.id === id))
    .filter((p): p is Photo => !!p),
)
const columns: TableColumn<Album & { photoIds: string[] }>[] = [
  { id: 'cover', header: 'Cover' },
  { accessorKey: 'title', header: 'Title' },
  { accessorKey: 'description', header: 'Description' },
  { id: 'count', header: 'Photographs' },
  { id: 'visibility', header: 'Visibility' },
  { id: 'actions', header: '' },
]
function cover(album: Album & { photoIds: string[] }) {
  return photos.value.find(
    (p) => p.id === (album.coverPhotoId || album.photoIds?.[0]),
  )
}
function create() {
  generation.value++
  selected.value = null
  revision.value = 0
  hadPassword.value = false
  Object.assign(draft, {
    title: '',
    description: '',
    isHidden: false,
    passwordEnabled: false,
    password: '',
    photoIds: [],
    coverPhotoId: '',
  })
  loaded.value = true
  editor.value = true
}
async function edit(album: Album) {
  const request = ++generation.value
  selected.value = album.id
  loaded.value = false
  editor.value = true
  draft.password = ''
  try {
    const data = await api<{
      album: Album & { photos: Photo[] }
      revision: number
    }>(base.value + '/albums/' + album.id + '/settings')
    if (
      request !== generation.value ||
      selected.value !== album.id ||
      !editor.value
    )
      return
    revision.value = data.revision
    hadPassword.value = !!data.album.hasPassword
    Object.assign(draft, {
      title: data.album.title,
      description: data.album.description || '',
      isHidden: !!data.album.isHidden,
      passwordEnabled: !!data.album.hasPassword,
      password: '',
      photoIds: data.album.photos.map((p) => p.id),
      coverPhotoId: data.album.coverPhotoId || '',
    })
    loaded.value = true
  } catch {
    if (request === generation.value)
      toast.add({
        title: 'Album could not be loaded. Please try again.',
        color: 'error',
      })
  }
}
watch(editor, (open) => {
  if (!open) {
    generation.value++
    picker.value = false
    loaded.value = false
    draft.password = ''
  }
})
function toggle(id: string, value: boolean) {
  if (value && !draft.photoIds.includes(id)) draft.photoIds.push(id)
  if (!value) {
    draft.photoIds = draft.photoIds.filter((v) => v !== id)
    if (draft.coverPhotoId === id) draft.coverPhotoId = ''
  }
}
function movePhoto(index: number, step: number) {
  const next = index + step
  if (next < 0 || next >= draft.photoIds.length) return
  const copy = [...draft.photoIds]
  ;[copy[index], copy[next]] = [copy[next]!, copy[index]!]
  draft.photoIds = copy
}
async function save() {
  if (!loaded.value || saving.value || !draft.title.trim()) return
  if (draft.passwordEnabled && !hadPassword.value && !draft.password) {
    toast.add({ title: 'Enter an album password.', color: 'error' })
    return
  }
  if (
    hadPassword.value &&
    !draft.passwordEnabled &&
    !window.confirm(
      'Remove password protection? Published photographs may become public.',
    )
  )
    return
  saving.value = true
  try {
    const ok = await action(async () => {
      if (selected.value === null) {
        const id = crypto.getRandomValues(new Uint32Array(1))[0] || 1
        await api(base.value + '/albums', {
          method: 'POST',
          body: { id, title: draft.title, isHidden: true },
        })
        selected.value = id
        revision.value = 1
      }
      const result = await api<{ revision: number }>(
        base.value + '/albums/' + selected.value + '/settings',
        {
          method: 'PATCH',
          body: {
            revision: revision.value,
            title: draft.title,
            description: draft.description || null,
            isHidden: draft.isHidden,
            photoIds: draft.photoIds,
            coverPhotoId: draft.coverPhotoId || null,
            ...(draft.passwordEnabled
              ? draft.password
                ? { password: draft.password }
                : {}
              : hadPassword.value
                ? { password: null }
                : {}),
          },
        },
      )
      revision.value = result.revision
    }, 'Album saved.')
    if (ok) editor.value = false
  } finally {
    saving.value = false
  }
}
function askDelete(album: Album) {
  selected.value = album.id
  removeOpen.value = true
}
async function remove() {
  if (selected.value === null) return
  const ok = await action(
    () =>
      api(base.value + '/albums/' + selected.value + '/delete', {
        method: 'POST',
        body: {},
      }),
    'Album deleted. Photographs remain in your library.',
  )
  if (ok) removeOpen.value = false
}
async function moveAlbum(album: Album, step: number) {
  const next = [...albums.value],
    index = next.findIndex((a) => a.id === album.id),
    target = index + step
  if (target < 0 || target >= next.length) return
  ;[next[index], next[target]] = [next[target]!, next[index]!]
  await action(
    () =>
      api(base.value + '/albums/reorder', {
        method: 'POST',
        body: { albumIds: next.map((a) => a.id) },
      }),
    'Album order updated.',
  )
}
function menu(album: Album) {
  return [
    [
      {
        label: 'Edit album',
        icon: 'i-lucide-pencil',
        disabled: !admin.value,
        onSelect: () => edit(album),
      },
    ],
    [
      {
        label: 'Delete album',
        icon: 'i-lucide-trash-2',
        color: 'error' as const,
        disabled: !admin.value,
        onSelect: () => askDelete(album),
      },
    ],
  ]
}
</script>
<template>
  <section
    class="cf-library"
    aria-labelledby="albums-heading"
  >
    <div class="cf-library-heading">
      <div>
        <h2 id="albums-heading">Albums</h2>
        <p>Organize your photographs and choose how they are shared.</p>
      </div>
      <UButton
        v-if="admin"
        icon="i-lucide-plus"
        @click="create"
        >Create album</UButton
      >
    </div>
    <div class="cf-library-toolbar">
      <UInput
        v-model="search"
        icon="i-lucide-search"
        placeholder="Search albums…"
        aria-label="Search albums"
        class="cf-library-search"
      /><UButton
        color="neutral"
        variant="ghost"
        icon="i-lucide-refresh-cw"
        aria-label="Refresh albums"
        :loading="loading"
        @click="refreshMedia"
      />
    </div>
    <div class="cf-library-table">
      <ConsoleMediaTable
        :data="rows"
        :columns="columns"
        :loading="loading && !albums.length"
        ><template #cover-cell="{ row }"
          ><button
            class="cf-library-thumb"
            :aria-label="`Edit ${row.original.title}`"
            :disabled="!admin"
            @click="edit(row.original)"
          >
            <ThumbImage
              v-if="cover(row.original)"
              :src="cover(row.original)?.thumbnailUrl || ''"
              :alt="row.original.title"
            /><UIcon
              v-else
              name="i-lucide-images"
              class="size-5"
            /></button></template
        ><template #title-cell="{ row }"
          ><button
            class="cf-photo-title"
            :disabled="!admin"
            @click="edit(row.original)"
          >
            {{ row.original.title }}
          </button></template
        ><template #description-cell="{ row }"
          ><p class="cf-table-description">
            {{ row.original.description || '—' }}
          </p></template
        ><template #count-cell="{ row }"
          ><UBadge
            color="neutral"
            variant="soft"
            >{{ row.original.photoIds.length }}</UBadge
          ></template
        ><template #visibility-cell="{ row }"
          ><UBadge
            color="neutral"
            variant="soft"
            :icon="
              row.original.isHidden
                ? 'i-lucide-eye-off'
                : row.original.hasPassword
                  ? 'i-lucide-lock'
                  : 'i-lucide-globe'
            "
            >{{
              row.original.isHidden
                ? 'Hidden'
                : row.original.hasPassword
                  ? 'Password'
                  : 'Public'
            }}</UBadge
          ></template
        ><template #actions-cell="{ row }"
          ><div class="flex items-center gap-1">
            <UButton
              v-if="admin"
              color="neutral"
              variant="ghost"
              icon="i-lucide-arrow-up"
              size="xs"
              :disabled="busy || albums[0]?.id === row.original.id"
              :aria-label="`Move ${row.original.title} up`"
              @click="moveAlbum(row.original, -1)"
            /><UButton
              v-if="admin"
              color="neutral"
              variant="ghost"
              icon="i-lucide-arrow-down"
              size="xs"
              :disabled="busy || albums.at(-1)?.id === row.original.id"
              :aria-label="`Move ${row.original.title} down`"
              @click="moveAlbum(row.original, 1)"
            /><UDropdownMenu :items="menu(row.original)"
              ><UButton
                color="neutral"
                variant="ghost"
                icon="i-lucide-ellipsis"
                :aria-label="`Actions for ${row.original.title}`"
            /></UDropdownMenu></div></template
        ><template #empty
          ><div class="cf-library-empty">
            <UIcon
              name="i-lucide-library-big"
              class="size-8"
            />
            <h3>
              {{ search ? 'No matching albums' : 'Make room for a collection' }}
            </h3>
            <p>Create an album to bring related photographs together.</p>
            <UButton
              v-if="admin && !albums.length"
              variant="soft"
              @click="create"
              >Create album</UButton
            >
          </div></template
        ></ConsoleMediaTable
      >
    </div>
    <USlideover
      v-model:open="editor"
      :title="selected === null ? 'Create album' : 'Edit album'"
      description="Choose the photographs, cover and access for this album."
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
          v-if="!loaded"
          role="status"
        >
          Loading album…
        </p>
        <UForm
          v-else
          id="cloud-album-form"
          :state="draft"
          class="space-y-5"
          @submit="save"
          ><ConsoleAlbumDetailsFields
            v-model:title="draft.title"
            v-model:description="draft.description"
          /><UCheckbox
            v-model="draft.isHidden"
            label="Hide album"
            description="Hide this album and its photographs from public browsing."
          /><UCheckbox
            v-model="draft.passwordEnabled"
            label="Password protection"
            description="Visitors must unlock this album to view its photographs."
          /><UFormField
            v-if="draft.passwordEnabled"
            label="Album password"
            :hint="
              hadPassword
                ? 'Leave blank to keep the current password.'
                : 'Use 8–256 characters.'
            "
            ><UInput
              v-model="draft.password"
              type="password"
              autocomplete="new-password"
              minlength="8"
              maxlength="256"
              class="w-full"
          /></UFormField>
          <div class="cf-album-photo-section">
            <div class="flex items-center justify-between gap-3">
              <h3>Photographs · {{ draft.photoIds.length }}</h3>
              <UButton
                color="neutral"
                variant="outline"
                icon="i-lucide-image-plus"
                size="sm"
                id="album-select-photographs"
                @click="picker = !picker"
                >Select photographs</UButton
              >
            </div>
            <div
              v-for="(photo, index) in chosen"
              :key="photo.id"
              class="cf-selected-photo"
            >
              <ThumbImage
                :src="photo.thumbnailUrl || ''"
                :alt="photo.title || 'Photograph'"
              /><span>{{ photo.title }}</span
              ><UButton
                :color="draft.coverPhotoId === photo.id ? 'primary' : 'neutral'"
                variant="ghost"
                icon="i-lucide-star"
                size="xs"
                :aria-label="`Set ${photo.title} as cover`"
                @click="draft.coverPhotoId = photo.id"
              /><UButton
                color="neutral"
                variant="ghost"
                icon="i-lucide-arrow-up"
                size="xs"
                :disabled="index === 0"
                :aria-label="`Move ${photo.title} up`"
                @click="movePhoto(index, -1)"
              /><UButton
                color="neutral"
                variant="ghost"
                icon="i-lucide-arrow-down"
                size="xs"
                :disabled="index === chosen.length - 1"
                :aria-label="`Move ${photo.title} down`"
                @click="movePhoto(index, 1)"
              /><UButton
                color="error"
                variant="ghost"
                icon="i-lucide-x"
                size="xs"
                :aria-label="`Remove ${photo.title} from album`"
                @click="toggle(photo.id, false)"
              />
            </div>
            <p
              v-if="!draft.photoIds.length"
              class="text-sm text-muted"
            >
              Choose photographs from your library.
            </p>
          </div></UForm
        >
        <div
          v-if="picker"
          ref="pickerPanel"
          role="region"
          aria-label="Select photographs"
          class="cf-inline-picker"
          @keydown.esc.stop.prevent="picker = false"
        >
          <h3 class="font-medium mb-3">Select photographs</h3>
          <UInput
            v-model="photoSearch"
            icon="i-lucide-search"
            placeholder="Search photographs…"
            aria-label="Search photographs for album"
            class="w-full mb-4"
          />
          <div class="cf-photo-picker">
            <button
              v-for="photo in choices"
              :key="photo.id"
              class="cf-picker-photo"
              :aria-label="photo.title || 'Photograph'"
              :class="{ selected: draft.photoIds.includes(photo.id) }"
              :aria-pressed="draft.photoIds.includes(photo.id)"
              @click="toggle(photo.id, !draft.photoIds.includes(photo.id))"
            >
              <ThumbImage
                :src="photo.thumbnailUrl || ''"
                :alt="photo.title || 'Photograph'"
              /><span>{{ photo.title }}</span
              ><UIcon
                v-if="draft.photoIds.includes(photo.id)"
                name="i-lucide-circle-check"
                class="cf-picker-check"
              />
            </button>
          </div>
          <div class="flex items-center justify-between gap-3 mt-4">
            <span class="text-sm text-muted"
              >{{ draft.photoIds.length }} selected</span
            ><UButton @click="picker = false">Done</UButton>
          </div>
        </div></template
      ><template #footer
        ><UButton
          color="neutral"
          variant="outline"
          :disabled="saving"
          @click="editor = false"
          >Cancel</UButton
        ><UButton
          type="submit"
          form="cloud-album-form"
          :loading="saving"
          :disabled="!loaded || !draft.title.trim()"
          >Save album</UButton
        ></template
      ></USlideover
    >

    <UModal
      v-model:open="removeOpen"
      title="Delete album?"
      description="Photographs remain in your library. They may become public if no other protected album contains them."
      ><template #footer
        ><UButton
          color="neutral"
          variant="outline"
          @click="removeOpen = false"
          >Cancel</UButton
        ><UButton
          color="error"
          :loading="busy"
          @click="remove"
          >Delete album</UButton
        ></template
      ></UModal
    >
  </section>
</template>
