<script setup lang="ts">
import {
  ArrowDown as ButtonIconArrowDown,
  ArrowUp as ButtonIconArrowUp,
  Ellipsis as ButtonIconEllipsis,
  ImagePlus as ButtonIconImagePlus,
  Plus as ButtonIconPlus,
  RefreshCw as ButtonIconRefreshCw,
  Star as ButtonIconStar,
  X as ButtonIconX,
} from 'lucide-vue-next'
const { t } = useI18n()

import { isValidAlbumSlug } from '@chronoframe/contracts/album-slug'
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
  slug: '',
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
  { id: 'cover', header: t('cloud.messages.cover') },
  { accessorKey: 'title', header: t('cloud.messages.title') },
  { accessorKey: 'description', header: t('cloud.messages.description') },
  { id: 'count', header: t('cloud.messages.photographs') },
  { id: 'visibility', header: t('cloud.messages.visibility') },
  {
    id: 'actions',
    header: () => h('span', { class: 'sr-only' }, t('cloud.dashboard.actions')),
  },
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
    slug: '',
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
      slug: data.album.slug || '',
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
        title: t('cloud.messages.albumCouldNotBeLoadedPleaseTryAgain'),
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
  if (draft.slug.trim() && !isValidAlbumSlug(draft.slug.trim())) {
    toast.add({
      title: t(
        'cloud.messages.useLowercaseLettersNumbersAndSingleHyphensTheSlug',
      ),
      color: 'error',
    })
    return
  }
  if (draft.passwordEnabled && !hadPassword.value && !draft.password) {
    toast.add({
      title: t('cloud.messages.enterAnAlbumPassword'),
      color: 'error',
    })
    return
  }
  if (
    hadPassword.value &&
    !draft.passwordEnabled &&
    !window.confirm(
      t(
        'cloud.messages.removePasswordProtectionPublishedPhotographsMayBecomePublic',
      ),
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
          body: { id, title: draft.title, slug: draft.slug, isHidden: true },
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
            slug: draft.slug,
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
    }, t('cloud.messages.albumSaved'))
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
    t('cloud.messages.albumDeletedPhotographsRemainInYourLibrary'),
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
    t('cloud.messages.albumOrderUpdated'),
  )
}
function menu(album: Album) {
  return [
    [
      {
        label: t('cloud.messages.editAlbum'),
        icon: 'i-lucide-pencil',
        disabled: !admin.value,
        onSelect: () => edit(album),
      },
    ],
    [
      {
        label: t('cloud.messages.deleteAlbum2'),
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
        <h2 id="albums-heading">{{ $t('cloud.messages.albums') }}</h2>
        <p>
          {{
            $t(
              'cloud.messages.organizeYourPhotographsAndChooseHowTheyAreShared',
            )
          }}
        </p>
      </div>
      <CfButton
        v-if="admin"
        :icon="ButtonIconPlus"
        @click="create"
        >{{ $t('cloud.messages.createAlbum') }}</CfButton
      >
    </div>
    <div class="cf-library-toolbar">
      <UInput
        v-model="search"
        icon="i-lucide-search"
        :placeholder="$t('cloud.messages.searchAlbums')"
        :aria-label="$t('cloud.messages.searchAlbums2')"
        class="cf-library-search"
      /><CfButton
        variant="ghost"
        :icon="ButtonIconRefreshCw"
        :aria-label="$t('cloud.messages.refreshAlbums')"
        :loading="loading"
        @click="refreshMedia"
      />
    </div>
    <CfTable
      class="cf-library-table"
      :data="rows"
      :columns="columns"
      :loading="loading && !albums.length"
      ><template #cover-cell="{ row }"
        ><button
          class="cf-library-thumb"
          :aria-label="$t('cloud.ui.editNamed', { title: row.original.title })"
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
              ? $t('cloud.messages.hidden')
              : row.original.hasPassword
                ? $t('cloud.messages.password')
                : $t('cloud.messages.public')
          }}</UBadge
        ></template
      ><template #actions-cell="{ row }"
        ><div class="flex items-center gap-1">
          <CfButton
            v-if="admin"
            variant="ghost"
            :icon="ButtonIconArrowUp"
            size="sm"
            :disabled="busy || albums[0]?.id === row.original.id"
            :aria-label="$t('cloud.ui.moveUp', { title: row.original.title })"
            @click="moveAlbum(row.original, -1)"
          /><CfButton
            v-if="admin"
            variant="ghost"
            :icon="ButtonIconArrowDown"
            size="sm"
            :disabled="busy || albums.at(-1)?.id === row.original.id"
            :aria-label="$t('cloud.ui.moveDown', { title: row.original.title })"
            @click="moveAlbum(row.original, 1)"
          /><UDropdownMenu :items="menu(row.original)"
            ><CfButton
              variant="ghost"
              :icon="ButtonIconEllipsis"
              :aria-label="
                $t('cloud.ui.actionsNamed', { title: row.original.title })
              "
          /></UDropdownMenu></div></template
      ><template #empty
        ><div class="cf-library-empty">
          <UIcon
            name="i-lucide-library-big"
            class="size-8"
          />
          <h3>
            {{
              search
                ? $t('cloud.messages.noMatchingAlbums')
                : $t('cloud.messages.makeRoomForACollection')
            }}
          </h3>
          <p>
            {{
              $t(
                'cloud.messages.createAnAlbumToBringRelatedPhotographsTogether',
              )
            }}
          </p>
          <CfButton
            v-if="admin && !albums.length"
            variant="soft"
            @click="create"
            >{{ $t('cloud.messages.createAlbum') }}</CfButton
          >
        </div></template
      ></CfTable
    >
    <USlideover
      v-model:open="editor"
      :title="
        selected === null
          ? $t('cloud.messages.createAlbum')
          : $t('cloud.messages.editAlbum')
      "
      :description="
        $t('cloud.messages.chooseThePhotographsCoverAndAccessForThisAlbum')
      "
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
          {{ $t('cloud.messages.loadingAlbum') }}
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
            v-model:slug="draft.slug"
            show-slug
            :current-slug="
              selected ? albums.find((a) => a.id === selected)?.slug : undefined
            "
          /><UCheckbox
            v-model="draft.isHidden"
            :label="$t('cloud.messages.hideAlbum')"
            :description="
              $t(
                'cloud.messages.hideThisAlbumAndItsPhotographsFromPublicBrowsing',
              )
            "
          /><UCheckbox
            v-model="draft.passwordEnabled"
            :label="$t('cloud.messages.passwordProtection')"
            :description="
              $t(
                'cloud.messages.visitorsMustUnlockThisAlbumToViewItsPhotographs',
              )
            "
          /><UFormField
            v-if="draft.passwordEnabled"
            :label="$t('cloud.messages.albumPassword')"
            :hint="
              hadPassword
                ? $t('cloud.messages.leaveBlankToKeepTheCurrentPassword')
                : $t('cloud.messages.use8256Characters')
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
              <h3>
                {{
                  $t('cloud.ui.photoMembershipCount', {
                    count: draft.photoIds.length,
                  })
                }}
              </h3>
              <CfButton
                variant="secondary"
                :icon="ButtonIconImagePlus"
                size="sm"
                id="album-select-photographs"
                @click="picker = !picker"
                >{{ $t('cloud.messages.selectPhotographs') }}</CfButton
              >
            </div>
            <div
              v-for="(photo, index) in chosen"
              :key="photo.id"
              class="cf-selected-photo"
            >
              <ThumbImage
                :src="photo.thumbnailUrl || ''"
                :alt="photo.title || $t('cloud.messages.photograph')"
              /><span>{{ photo.title }}</span
              ><CfButton
                :variant="draft.coverPhotoId === photo.id ? 'soft' : 'ghost'"
                :aria-pressed="draft.coverPhotoId === photo.id"
                :icon="ButtonIconStar"
                size="sm"
                :aria-label="$t('cloud.ui.setCover', { title: photo.title })"
                @click="draft.coverPhotoId = photo.id"
              /><CfButton
                variant="ghost"
                :icon="ButtonIconArrowUp"
                size="sm"
                :disabled="index === 0"
                :aria-label="$t('cloud.ui.moveUp', { title: photo.title })"
                @click="movePhoto(index, -1)"
              /><CfButton
                variant="ghost"
                :icon="ButtonIconArrowDown"
                size="sm"
                :disabled="index === chosen.length - 1"
                :aria-label="$t('cloud.ui.moveDown', { title: photo.title })"
                @click="movePhoto(index, 1)"
              /><CfButton
                variant="destructive"
                :icon="ButtonIconX"
                size="sm"
                :aria-label="
                  $t('cloud.ui.removeFromAlbum', { title: photo.title })
                "
                @click="toggle(photo.id, false)"
              />
            </div>
            <p
              v-if="!draft.photoIds.length"
              class="text-sm text-muted"
            >
              {{ $t('cloud.messages.choosePhotographsFromYourLibrary') }}
            </p>
          </div></UForm
        >
        <div
          v-if="picker"
          ref="pickerPanel"
          role="region"
          :aria-label="$t('cloud.messages.selectPhotographs')"
          class="cf-inline-picker"
          @keydown.esc.stop.prevent="picker = false"
        >
          <h3 class="font-medium mb-3">
            {{ $t('cloud.messages.selectPhotographs') }}
          </h3>
          <UInput
            v-model="photoSearch"
            icon="i-lucide-search"
            :placeholder="$t('cloud.messages.searchPhotographs')"
            :aria-label="$t('cloud.messages.searchPhotographsForAlbum')"
            class="w-full mb-4"
          />
          <div class="cf-photo-picker">
            <button
              v-for="photo in choices"
              :key="photo.id"
              class="cf-picker-photo"
              :aria-label="photo.title || $t('cloud.messages.photograph')"
              :class="{ selected: draft.photoIds.includes(photo.id) }"
              :aria-pressed="draft.photoIds.includes(photo.id)"
              @click="toggle(photo.id, !draft.photoIds.includes(photo.id))"
            >
              <ThumbImage
                :src="photo.thumbnailUrl || ''"
                :alt="photo.title || $t('cloud.messages.photograph')"
              /><span>{{ photo.title }}</span
              ><UIcon
                v-if="draft.photoIds.includes(photo.id)"
                name="i-lucide-circle-check"
                class="cf-picker-check"
              />
            </button>
          </div>
          <div class="flex items-center justify-between gap-3 mt-4">
            <span class="text-sm text-muted">{{
              $t('cloud.ui.selectedCount', { count: draft.photoIds.length })
            }}</span
            ><CfButton @click="picker = false">{{
              $t('cloud.messages.done')
            }}</CfButton>
          </div>
        </div></template
      ><template #footer
        ><CfButton
          variant="secondary"
          :disabled="saving"
          @click="editor = false"
          >{{ $t('cloud.messages.cancel') }}</CfButton
        ><CfButton
          type="submit"
          form="cloud-album-form"
          :loading="saving"
          :disabled="!loaded || !draft.title.trim()"
          >{{ $t('cloud.messages.saveAlbum') }}</CfButton
        ></template
      ></USlideover
    >

    <UModal
      v-model:open="removeOpen"
      :title="$t('cloud.messages.deleteAlbum')"
      :description="
        $t('cloud.messages.photographsRemainInYourLibraryTheyMayBecomePublic')
      "
      ><template #footer
        ><CfButton
          variant="secondary"
          @click="removeOpen = false"
          >{{ $t('cloud.messages.cancel') }}</CfButton
        ><CfButton
          variant="destructive"
          :loading="busy"
          @click="remove"
          >{{ $t('cloud.messages.deleteAlbum2') }}</CfButton
        ></template
      ></UModal
    >
  </section>
</template>
