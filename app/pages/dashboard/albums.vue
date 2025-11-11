<script lang="ts" setup>
import type { Album, Photo } from '~~/server/utils/db'
import type { FormSubmitEvent, FormError } from '@nuxt/ui'

definePageMeta({
  layout: 'dashboard',
})

useHead({
  title: $t('title.albums'),
})

interface AlbumItem extends Album {
  photoCount?: number
  photoIds?: string[]
  coverPhoto?: Photo | null
}

interface AlbumFormState {
  title: string
  description: string
  isHidden: boolean
}

const albums = ref<AlbumItem[]>([])
const isLoadingAlbums = ref(false)
const allPhotos = ref<Photo[]>([])
const isLoadingPhotos = ref(false)

const isAlbumSlideoverOpen = ref(false)
const isDeleteConfirmOpen = ref(false)
const isPhotoSelectorOpen = ref(false)

const currentAlbum = ref<AlbumItem | null>(null)

const formData = reactive<AlbumFormState>({
  title: '',
  description: '',
  isHidden: false,
})

const formRef = ref()
const isSubmittingForm = ref(false)

const selectedPhotoIds = ref<string[]>([])
const coverPhotoId = ref('')
const photoSelectorSearchQuery = ref('')

const validateForm = (state: any): FormError[] => {
  const errors: FormError[] = []
  if (!state.title?.trim()) {
    errors.push({
      name: 'title',
      message: $t('dashboard.albums.form.titleRequired'),
    })
  }
  return errors
}

const loadAlbums = async () => {
  isLoadingAlbums.value = true
  try {
    const response = await $fetch('/api/albums')
    albums.value = (response as any[]).map((album) => ({
      ...album,
      photoCount: album.photoIds?.length || 0,
    }))

    for (const album of albums.value) {
      if (album.coverPhotoId && allPhotos.value.length > 0) {
        const coverPhoto = allPhotos.value.find(
          (p) => p.id === album.coverPhotoId,
        )
        if (coverPhoto) {
          album.coverPhoto = coverPhoto
        }
      }
    }
  } catch (error) {
    console.error('Failed to load albums:', error)
    useToast().add({
      title: $t('dashboard.albums.messages.loadError'),
      color: 'error',
    })
  } finally {
    isLoadingAlbums.value = false
  }
}

const loadPhotos = async () => {
  isLoadingPhotos.value = true
  try {
    const { photos } = usePhotos()
    allPhotos.value = photos.value
  } catch (error) {
    console.error('Failed to load photos:', error)
  } finally {
    isLoadingPhotos.value = false
  }
}

const openCreateSlideover = () => {
  currentAlbum.value = null
  formData.title = ''
  formData.description = ''
  formData.isHidden = false
  selectedPhotoIds.value = []
  coverPhotoId.value = ''
  formRef.value?.clear()
  isAlbumSlideoverOpen.value = true
}

const openEditSlideover = async (album: AlbumItem) => {
  currentAlbum.value = album
  try {
    const albumDetail = (await $fetch(`/api/albums/${album.id}`)) as any
    formData.title = album.title
    formData.description = album.description || ''
    formData.isHidden = album.isHidden || false
    selectedPhotoIds.value = (albumDetail.photos || []).map((p: Photo) => p.id)
    coverPhotoId.value = album.coverPhotoId || ''
    formRef.value?.clear()
  } catch (error) {
    console.error('Failed to load album details:', error)
    useToast().add({
      title: $t('dashboard.albums.messages.loadDetailError'),
      color: 'error',
    })
  }
  isAlbumSlideoverOpen.value = true
}

const openDeleteConfirm = (album: AlbumItem) => {
  currentAlbum.value = album
  isDeleteConfirmOpen.value = true
}

const onFormSubmit = async (event: FormSubmitEvent<AlbumFormState>) => {
  isSubmittingForm.value = true
  try {
    if (currentAlbum.value) {
      await $fetch(`/api/albums/${currentAlbum.value.id}`, {
        method: 'PUT',
        body: {
          title: event.data.title,
          description: event.data.description || undefined,
          coverPhotoId: coverPhotoId.value || undefined,
          photoIds: selectedPhotoIds.value,
           isHidden: event.data.isHidden,
        },
      })

      useToast().add({
        title: $t('dashboard.albums.messages.updateSuccess'),
        color: 'success',
      })

      isAlbumSlideoverOpen.value = false
    } else {
      await $fetch('/api/albums', {
        method: 'POST',
        body: {
          title: event.data.title,
          description: event.data.description || undefined,
          coverPhotoId: coverPhotoId.value || undefined,
          photoIds: selectedPhotoIds.value,
           isHidden: event.data.isHidden,
        },
      })

      useToast().add({
        title: $t('dashboard.albums.messages.createSuccess'),
        color: 'success',
      })

      isAlbumSlideoverOpen.value = false
    }

    await loadAlbums()
  } catch (error) {
    console.error('Failed to save album:', error)
    useToast().add({
      title: currentAlbum.value
        ? $t('dashboard.albums.messages.updateError')
        : $t('dashboard.albums.messages.createError'),
      color: 'error',
    })
  } finally {
    isSubmittingForm.value = false
  }
}

const deleteAlbum = async () => {
  if (!currentAlbum.value) return

  try {
    await $fetch(`/api/albums/${currentAlbum.value.id}`, {
      method: 'DELETE',
    })

    useToast().add({
      title: $t('dashboard.albums.messages.deleteSuccess'),
      color: 'success',
    })

    isDeleteConfirmOpen.value = false
    await loadAlbums()
  } catch (error) {
    console.error('Failed to delete album:', error)
    useToast().add({
      title: $t('dashboard.albums.messages.deleteError'),
      color: 'error',
    })
  }
}

const togglePhotoSelection = (photoId: string) => {
  const index = selectedPhotoIds.value.indexOf(photoId)
  if (index > -1) {
    selectedPhotoIds.value.splice(index, 1)
    if (coverPhotoId.value === photoId) {
      coverPhotoId.value = ''
    }
  } else {
    selectedPhotoIds.value.push(photoId)
  }
}

const setCoverPhoto = (photoId: string) => {
  if (!selectedPhotoIds.value.includes(photoId)) {
    selectedPhotoIds.value.push(photoId)
  }
  coverPhotoId.value = photoId
}

const areAllPhotosSelected = computed(() => {
  return (
    allPhotos.value.length > 0 &&
    selectedPhotoIds.value.length === allPhotos.value.length
  )
})

const areSomePhotosSelected = computed(() => {
  return (
    selectedPhotoIds.value.length > 0 &&
    selectedPhotoIds.value.length < allPhotos.value.length
  )
})

const toggleAllPhotos = () => {
  if (areAllPhotosSelected.value) {
    selectedPhotoIds.value = []
  } else {
    selectedPhotoIds.value = allPhotos.value.map((p) => p.id)
  }
}

const filteredPhotos = computed(() => {
  const query = photoSelectorSearchQuery.value.toLowerCase()
  if (!query) return allPhotos.value

  return allPhotos.value.filter(
    (photo) =>
      (photo.title?.toLowerCase() || '').includes(query) ||
      (photo.description?.toLowerCase() || '').includes(query),
  )
})

onMounted(async () => {
  await Promise.all([loadPhotos(), loadAlbums()])
})

const dayjs = useDayjs()

const slideoverTitle = computed(() => {
  return currentAlbum.value
    ? $t('dashboard.albums.slideover.edit.title')
    : $t('dashboard.albums.slideover.create.title')
})

const slideoverDescription = computed(() => {
  return currentAlbum.value
    ? $t('dashboard.albums.slideover.edit.description')
    : $t('dashboard.albums.slideover.create.description')
})

const submitButtonLabel = computed(() => {
  return currentAlbum.value
    ? $t('dashboard.albums.slideover.submitEdit')
    : $t('dashboard.albums.slideover.submitCreate')
})

const columns: any[] = [
  {
    id: 'coverPhoto',
    accessorKey: 'coverPhoto',
    header: $t('dashboard.albums.table.columns.cover'),
  },
  {
    id: 'title',
    accessorKey: 'title',
    header: $t('dashboard.albums.table.columns.title'),
  },
  {
    id: 'description',
    accessorKey: 'description',
    header: $t('dashboard.albums.table.columns.description'),
  },
  {
    id: 'photoCount',
    accessorKey: 'photoCount',
    header: $t('dashboard.albums.table.columns.photoCount'),
  },
  {
    id: 'createdAt',
    accessorKey: 'createdAt',
    header: $t('dashboard.albums.table.columns.createdAt'),
  },
  {
    id: 'actions',
    header: $t('dashboard.albums.table.columns.actions'),
  },
]
</script>

<template>
  <UDashboardPanel>
    <template #header>
      <UDashboardNavbar :title="$t('title.albums')">
        <template #right>
          <UButton
            icon="tabler:plus"
            variant="soft"
            @click="openCreateSlideover"
          >
            {{ $t('dashboard.albums.createButton') }}
          </UButton>
        </template>
      </UDashboardNavbar>
    </template>

    <template #body>
      <div class="flex flex-col gap-6">
        <div
          v-if="albums.length > 0"
          class="bg-white dark:bg-neutral-900 rounded-lg border border-gray-200 dark:border-neutral-800"
        >
          <UTable
            :data="albums"
            :columns="columns"
          >
            <template #coverPhoto-cell="{ row }">
              <div
                class="w-16 h-12 rounded-lg overflow-hidden bg-gray-100 dark:bg-neutral-800 shrink-0"
              >
                <img
                  v-if="(row.original as unknown as AlbumItem).coverPhoto"
                  :src="
                    (row.original as unknown as AlbumItem).coverPhoto
                      ?.thumbnailUrl || ''
                  "
                  :alt="(row.original as unknown as AlbumItem).title"
                  class="w-full h-full object-cover"
                />
                <div
                  v-else
                  class="w-full h-full flex items-center justify-center text-gray-400 dark:text-gray-600"
                >
                  <Icon
                    name="tabler:image"
                    size="20"
                  />
                </div>
              </div>
            </template>

            <template #title-cell="{ row }">
              <NuxtLink
                :to="`/albums/${(row.original as unknown as AlbumItem).id}`"
                target="_blank"
                class="font-medium text-primary-600 dark:text-primary-400 hover:underline cursor-pointer inline-flex items-center gap-2"
              >
                {{ (row.original as unknown as AlbumItem).title }}
                <Icon
                  name="tabler:external-link"
                  size="16"
                  class="shrink-0 opacity-60 hover:opacity-100 transition-opacity"
                />
              </NuxtLink>
            </template>

            <template #description-cell="{ row }">
              <div
                v-if="(row.original as unknown as AlbumItem).description"
                class="text-sm text-gray-600 dark:text-gray-400 line-clamp-1"
              >
                {{ (row.original as unknown as AlbumItem).description }}
              </div>
              <div
                v-else
                class="text-sm text-gray-400 dark:text-gray-600"
              >
                -
              </div>
            </template>

            <template #photoCount-cell="{ row }">
              <UBadge
                variant="soft"
                color="neutral"
              >
                {{ (row.original as unknown as AlbumItem).photoCount || 0 }} 张
              </UBadge>
            </template>

            <template #createdAt-cell="{ row }">
              <div class="text-sm text-gray-600 dark:text-gray-400">
                {{
                  dayjs(
                    (row.original as unknown as AlbumItem).createdAt,
                  ).format('YYYY-MM-DD')
                }}
              </div>
            </template>

            <template #actions-cell="{ row }">
              <div class="flex gap-1">
                <UButton
                  variant="ghost"
                  color="primary"
                  size="xs"
                  icon="tabler:edit"
                  @click="
                    openEditSlideover(row.original as unknown as AlbumItem)
                  "
                />
                <UButton
                  variant="ghost"
                  color="error"
                  size="xs"
                  icon="tabler:trash"
                  @click="
                    openDeleteConfirm(row.original as unknown as AlbumItem)
                  "
                />
              </div>
            </template>
          </UTable>
        </div>

        <div
          v-else-if="!isLoadingAlbums"
          class="flex flex-col items-center justify-center py-12 text-center"
        >
          <Icon
            name="tabler:album"
            size="48"
            class="text-gray-400 dark:text-gray-600 mb-4"
          />
          <h3 class="text-lg font-semibold text-gray-700 dark:text-gray-300">
            {{ $t('dashboard.albums.noAlbums') }}
          </h3>
          <p class="text-sm text-gray-500 dark:text-gray-400 mt-2 mb-4">
            {{ $t('dashboard.albums.noAlbumsTip') }}
          </p>
          <UButton
            icon="tabler:plus"
            @click="openCreateSlideover"
          >
            {{ $t('dashboard.albums.createButton') }}
          </UButton>
        </div>
        <div
          v-else
          class="flex items-center justify-center py-12"
        >
          <Icon
            name="tabler:loader"
            size="32"
            class="animate-spin text-primary-500"
          />
        </div>

        <USlideover
          v-model:open="isAlbumSlideoverOpen"
          :title="slideoverTitle"
          :description="slideoverDescription"
          :ui="{ footer: 'justify-end', body: 'p-0 sm:p-0 space-y-4' }"
        >
          <template #body>
            <div
              v-if="coverPhotoId"
              class="relative w-full aspect-video bg-gray-100 dark:bg-neutral-800 overflow-hidden"
            >
              <ThumbImage
                :src="
                  allPhotos.find((p) => p.id === coverPhotoId)?.thumbnailUrl ||
                  ''
                "
                :alt="coverPhotoId"
                class="absolute inset-0 w-full h-full object-cover"
              />
              <button
                class="absolute inset-0 bg-black/50 opacity-0 hover:opacity-100 transition-opacity flex items-center justify-center"
                @click="coverPhotoId = ''"
              >
                <Icon
                  name="tabler:x"
                  class="text-white"
                />
              </button>
            </div>
            <button
              v-else
              class="w-full h-48 bg-gray-100 dark:bg-neutral-800 flex flex-col items-center justify-center text-gray-500 hover:text-gray-600 dark:hover:text-gray-400 hover:bg-gray-200 dark:hover:bg-neutral-700 transition-colors cursor-pointer"
              @click="isPhotoSelectorOpen = true"
            >
              <Icon
                name="tabler:photo"
                size="40"
                class="mb-2"
              />
              <p class="text-sm font-medium">
                {{ $t('dashboard.albums.form.addCoverPhoto') }}
              </p>
            </button>
            <div class="space-y-4 px-4">
              <UForm
                ref="formRef"
                :state="formData"
                :validate="validateForm"
                class="space-y-4"
                @submit="onFormSubmit"
              >
                <UFormField
                  :label="$t('dashboard.albums.form.title')"
                  name="title"
                  required
                >
                  <UInput
                    v-model="formData.title"
                    class="w-full"
                    :placeholder="$t('dashboard.albums.form.titlePlaceholder')"
                  />
                </UFormField>

                <UFormField
                  :label="$t('dashboard.albums.form.description')"
                  name="description"
                >
                  <UTextarea
                    v-model="formData.description"
                    class="w-full"
                    :placeholder="
                      $t('dashboard.albums.form.descriptionPlaceholder')
                    "
                    :rows="3"
                  />
                </UFormField>
                
                <UFormField
                  :label="$t('dashboard.albums.form.isHidden')"
                  name="isHidden"
                  :hint="$t('dashboard.albums.form.isHiddenHint')"
                >
                  <UCheckbox
                    v-model="formData.isHidden"
                    :label="$t('dashboard.albums.form.isHidden')"
                  />
                </UFormField>
              </UForm>

              <!-- 照片选择部分 -->
              <div class="space-y-3">
                <UButton
                  variant="outline"
                  color="primary"
                  icon="tabler:photo-plus"
                  size="lg"
                  class="w-full"
                  @click="isPhotoSelectorOpen = true"
                >
                  {{
                    selectedPhotoIds.length > 0
                      ? $t('dashboard.albums.form.editPhotos')
                      : $t('dashboard.albums.form.selectPhotos')
                  }}
                </UButton>

                <div
                  v-if="selectedPhotoIds.length > 0"
                  class="space-y-2"
                >
                  <div class="flex items-center justify-between">
                    <label
                      class="text-sm font-medium text-gray-700 dark:text-gray-300"
                      >{{
                        $t('dashboard.albums.form.selectedCount', {
                          count: selectedPhotoIds.length,
                        })
                      }}</label
                    >
                    <UButton
                      variant="ghost"
                      color="neutral"
                      size="xs"
                      icon="tabler:trash"
                      @click="selectedPhotoIds = []"
                    >
                      {{ $t('dashboard.albums.form.clearAll') }}
                    </UButton>
                  </div>

                  <div
                    class="grid grid-cols-4 gap-2 p-3 bg-gray-50 dark:bg-neutral-800/50 rounded-lg border border-gray-200 dark:border-neutral-700"
                  >
                    <div
                      v-for="photoId in selectedPhotoIds"
                      :key="photoId"
                      class="relative group aspect-square rounded-lg overflow-hidden bg-gray-200 dark:bg-neutral-700"
                    >
                      <img
                        :src="
                          allPhotos.find((p) => p.id === photoId)
                            ?.thumbnailUrl || ''
                        "
                        :alt="photoId"
                        class="w-full h-full object-cover"
                      />

                      <div
                        v-if="coverPhotoId === photoId"
                        class="absolute top-1 left-1 bg-primary-500 text-white px-1.5 py-0.5 rounded text-xs font-medium"
                      >
                        {{ $t('dashboard.albums.modal.setCover') }}
                      </div>

                      <button
                        class="absolute inset-0 bg-black/50 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center"
                        @click="togglePhotoSelection(photoId)"
                      >
                        <Icon
                          name="tabler:x"
                          class="text-white"
                        />
                      </button>
                    </div>
                  </div>
                </div>
              </div>
            </div>
          </template>

          <template #footer="{ close }">
            <UButton
              variant="ghost"
              color="neutral"
              @click="close"
            >
              {{ $t('dashboard.albums.slideover.cancel') }}
            </UButton>
            <UButton
              icon="tabler:check"
              :loading="isSubmittingForm"
              @click="formRef?.submit()"
            >
              {{ submitButtonLabel }}
            </UButton>
          </template>
        </USlideover>

        <UModal
          v-model:open="isPhotoSelectorOpen"
          :ui="{ content: 'w-full max-w-6xl overflow-hidden' }"
        >
          <template #content>
            <div class="flex flex-col h-[85vh] max-h-[85vh]">
              <div
                class="shrink-0 border-b border-gray-200 dark:border-neutral-700 p-3 sm:p-4 md:p-6"
              >
                <div class="flex items-center justify-between mb-3 sm:mb-4">
                  <div>
                    <h2 class="text-lg sm:text-xl font-bold">
                      {{ $t('dashboard.albums.modal.selectPhotos') }}
                    </h2>
                    <p
                      class="text-xs sm:text-sm text-gray-500 dark:text-gray-400 mt-1"
                    >
                      {{
                        $t('dashboard.albums.modal.totalPhotos', {
                          count: allPhotos.length,
                        })
                      }}
                      ·
                      {{
                        $t('dashboard.albums.modal.selectedPhotos', {
                          count: selectedPhotoIds.length,
                        })
                      }}
                    </p>
                  </div>
                  <UButton
                    variant="ghost"
                    color="neutral"
                    size="md"
                    icon="tabler:x"
                    @click="isPhotoSelectorOpen = false"
                  />
                </div>

                <div
                  class="flex flex-col sm:flex-row gap-2 items-stretch sm:items-center"
                >
                  <UInput
                    v-model="photoSelectorSearchQuery"
                    icon="tabler:search"
                    :placeholder="
                      $t('dashboard.albums.modal.searchPlaceholder')
                    "
                    class="flex-1 text-sm"
                  />
                  <div
                    class="hidden sm:flex items-center gap-2 px-3 py-2 bg-gray-100 dark:bg-neutral-800 rounded-lg whitespace-nowrap"
                  >
                    <UCheckbox
                      :model-value="areAllPhotosSelected"
                      :indeterminate="areSomePhotosSelected"
                      @update:model-value="toggleAllPhotos"
                    />
                    <span class="text-sm font-medium">{{
                      $t('dashboard.albums.modal.selectAll')
                    }}</span>
                  </div>
                  <UButton
                    v-show="!areAllPhotosSelected && allPhotos.length > 0"
                    class="sm:hidden"
                    size="sm"
                    color="neutral"
                    variant="soft"
                    @click="toggleAllPhotos"
                  >
                    {{ $t('dashboard.albums.modal.selectAll') }}
                  </UButton>
                </div>

                <div
                  v-if="photoSelectorSearchQuery"
                  class="text-xs text-gray-500 dark:text-gray-400 mt-2"
                >
                  {{
                    $t('dashboard.albums.modal.searchResults', {
                      current: filteredPhotos.length,
                      total: allPhotos.length,
                    })
                  }}
                </div>
              </div>

              <div class="flex-1 overflow-y-auto p-2 sm:p-3 md:p-6">
                <div
                  v-if="filteredPhotos.length > 0"
                  class="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 gap-2 sm:gap-3"
                >
                  <div
                    v-for="photo in filteredPhotos"
                    :key="photo.id"
                    class="relative group cursor-pointer"
                    @click="togglePhotoSelection(photo.id)"
                  >
                    <div
                      class="relative aspect-square rounded-lg overflow-hidden bg-gray-200 dark:bg-neutral-700 border-2 sm:border-3 transition-all"
                      :class="{
                        'border-primary-500 shadow-lg ring-2 ring-primary-300 dark:ring-primary-700':
                          selectedPhotoIds.includes(photo.id),
                        'border-gray-300 dark:border-neutral-600 hover:border-gray-400 dark:hover:border-neutral-500':
                          !selectedPhotoIds.includes(photo.id),
                      }"
                    >
                      <ThumbImage
                        :src="photo.thumbnailUrl || ''"
                        :alt="photo.title || 'Photo'"
                        class="w-full h-full object-cover"
                      />

                      <div
                        v-if="selectedPhotoIds.includes(photo.id)"
                        class="absolute top-1 left-1 sm:top-2 sm:left-2 flex items-center justify-center w-5 h-5 sm:w-6 sm:h-6 rounded-full bg-primary-500 border-2 border-white shadow-md"
                      >
                        <Icon
                          name="tabler:check"
                          size="12"
                          class="text-white sm:hidden"
                        />
                        <Icon
                          name="tabler:check"
                          size="14"
                          class="text-white hidden sm:block"
                        />
                      </div>

                      <UBadge
                        v-if="coverPhotoId === photo.id"
                        class="absolute top-1 right-1 sm:top-2 sm:right-2"
                        variant="solid"
                        color="warning"
                        size="sm"
                      >
                        <Icon
                          name="tabler:star-filled"
                          class="inline mr-0.5"
                          size="14"
                        />
                        {{ $t('dashboard.albums.modal.setCover') }}
                      </UBadge>
                      <UButton
                        v-if="coverPhotoId !== photo.id"
                        class="absolute bottom-1 right-1 sm:bottom-2 sm:right-2 opacity-0 sm:opacity-0 sm:group-hover:opacity-100 transition-opacity"
                        variant="solid"
                        color="warning"
                        size="xs"
                        @click.stop="setCoverPhoto(photo.id)"
                      >
                        <Icon
                          name="tabler:star"
                          class="inline"
                          size="12"
                        />
                        <span class="hidden sm:inline ml-1">{{
                          $t('dashboard.albums.modal.setCover')
                        }}</span>
                      </UButton>

                      <button
                        v-if="coverPhotoId !== photo.id"
                        class="sm:hidden absolute bottom-0 right-0 left-0 bg-linear-to-t from-black/80 to-transparent p-1 text-white flex items-center justify-center text-xs gap-1 rounded-b-lg"
                        @click.stop="setCoverPhoto(photo.id)"
                      >
                        <Icon
                          name="tabler:star"
                          size="14"
                        />
                        <span>{{ $t('dashboard.albums.modal.setCover') }}</span>
                      </button>
                    </div>
                  </div>
                </div>

                <div
                  v-else
                  class="flex flex-col items-center justify-center h-64 text-gray-500"
                >
                  <Icon
                    name="tabler:image-off"
                    size="48"
                    class="mb-3 opacity-50"
                  />
                  <p class="font-medium">
                    {{
                      photoSelectorSearchQuery
                        ? $t('dashboard.albums.modal.noResults')
                        : $t('dashboard.albums.modal.noPhotos')
                    }}
                  </p>
                  <p
                    v-if="photoSelectorSearchQuery"
                    class="text-sm mt-1"
                  >
                    {{ $t('dashboard.albums.modal.tryOtherKeywords') }}
                  </p>
                </div>
              </div>

              <div
                class="shrink-0 border-t border-gray-200 dark:border-neutral-700 bg-gray-50 dark:bg-neutral-900/50 p-3 sm:p-4 md:p-6"
              >
                <div
                  class="flex flex-col sm:flex-row gap-3 sm:gap-4 items-center justify-between"
                >
                  <div
                    class="flex flex-col gap-2 sm:flex-row sm:items-center sm:gap-4 text-xs sm:text-sm w-full sm:w-auto"
                  >
                    <div>
                      <span class="font-medium">{{
                        $t('dashboard.albums.modal.selectedInfo')
                      }}</span>
                      <span
                        class="text-primary-600 dark:text-primary-400 font-bold"
                      >
                        {{ selectedPhotoIds.length }}
                      </span>
                      <span class="text-gray-600 dark:text-gray-400"
                        >/ {{ allPhotos.length }}</span
                      >
                    </div>
                    <div
                      v-if="coverPhotoId"
                      class="text-amber-600 dark:text-amber-400 flex items-center gap-1"
                    >
                      <Icon
                        name="tabler:star-filled"
                        size="16"
                      />
                      {{ $t('dashboard.albums.modal.coverSetInfo') }}
                    </div>
                  </div>

                  <div class="flex gap-2 w-full sm:w-auto">
                    <UButton
                      variant="outline"
                      color="neutral"
                      class="flex-1 sm:flex-none"
                      size="sm"
                      @click="isPhotoSelectorOpen = false"
                    >
                      {{ $t('dashboard.albums.slideover.cancel') }}
                    </UButton>
                    <UButton
                      icon="tabler:check"
                      color="primary"
                      class="flex-1 sm:flex-none"
                      size="sm"
                      :disabled="selectedPhotoIds.length === 0"
                      @click="isPhotoSelectorOpen = false"
                    >
                      {{
                        $t('dashboard.albums.modal.confirm', {
                          count: selectedPhotoIds.length,
                        })
                      }}
                    </UButton>
                  </div>
                </div>
              </div>
            </div>
          </template>
        </UModal>

        <UModal v-model:open="isDeleteConfirmOpen">
          <template #content>
            <div class="p-6 space-y-4">
              <div class="flex items-center gap-3">
                <div
                  class="shrink-0 w-10 h-10 bg-error-100 dark:bg-error-900/30 rounded-full flex items-center justify-center"
                >
                  <Icon
                    name="tabler:alert-circle"
                    class="text-error-500"
                  />
                </div>
                <div>
                  <h3 class="text-lg font-semibold">
                    {{ $t('dashboard.albums.delete.title') }}
                  </h3>
                  <p class="text-sm text-gray-600 dark:text-gray-400 mt-1">
                    {{
                      $t('dashboard.albums.delete.message', {
                        title: currentAlbum?.title,
                      })
                    }}
                  </p>
                </div>
              </div>

              <div class="flex justify-end gap-2 pt-4">
                <UButton
                  variant="ghost"
                  color="neutral"
                  @click="isDeleteConfirmOpen = false"
                >
                  {{ $t('dashboard.albums.delete.cancel') }}
                </UButton>
                <UButton
                  color="error"
                  icon="tabler:trash"
                  @click="deleteAlbum"
                >
                  {{ $t('dashboard.albums.delete.confirm') }}
                </UButton>
              </div>
            </div>
          </template>
        </UModal>
      </div>
    </template>
  </UDashboardPanel>
</template>

<style scoped></style>
