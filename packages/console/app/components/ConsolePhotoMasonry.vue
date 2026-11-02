<script setup lang="ts">
import type { Photo } from '@chronoframe/contracts/resources'
import type { DropdownMenuItem } from '@nuxt/ui'

const props = defineProps<{
  photos: Photo[]
  actions: (photo: Photo) => DropdownMenuItem[][]
}>()
const selection = defineModel<Record<string, boolean>>('selection', {
  required: true,
})
const emit = defineEmits<{ preview: [Photo] }>()
const selectedCount = computed(
  () => props.photos.filter((photo) => selection.value[photo.id]).length,
)
const selectionId = useId()
const isMobile = useMediaQuery('(max-width: 768px)')

function selectAll(value: boolean | 'indeterminate') {
  selection.value =
    value === true
      ? Object.fromEntries(props.photos.map((photo) => [photo.id, true]))
      : {}
}
</script>

<template>
  <div class="min-w-0">
    <UCheckbox
      class="mb-3"
      :model-value="
        selectedCount > 0 && selectedCount < photos.length
          ? 'indeterminate'
          : selectedCount > 0
      "
      :label="$t('dashboard.photos.table.selectAllAria')"
      @update:model-value="selectAll"
    />
    <MasonryWall
      :items="photos"
      :column-width="280"
      :gap="4"
      :min-columns="2"
      :max-columns="isMobile ? 2 : 8"
      :ssr-columns="2"
      :key-mapper="(photo: Photo) => photo.id"
    >
      <template #default="{ item: photo, index }">
        <div
          class="relative cf-masonry-photo"
          :class="{ 'cf-masonry-selected': selection[photo.id] }"
        >
          <MasonryItemPhoto
            :photo="photo"
            :index="index"
            @open-viewer="emit('preview', photo)"
          />
          <label
            class="cf-masonry-select"
            :class="{ 'cf-masonry-control-selected': selection[photo.id] }"
            :for="`${selectionId}-${photo.id}`"
          >
            <UCheckbox
              :id="`${selectionId}-${photo.id}`"
              :model-value="!!selection[photo.id]"
              :aria-label="`${$t('dashboard.photos.table.selectRowAria')} ${photo.title}`"
              @update:model-value="selection[photo.id] = $event === true"
            />
          </label>
          <UDropdownMenu :items="actions(photo)">
            <UButton
              class="cf-masonry-actions"
              variant="outline"
              color="neutral"
              icon="tabler:dots-vertical"
              :aria-label="`${$t('dashboard.photos.table.columns.actions')} ${photo.title}`"
            />
          </UDropdownMenu>
        </div>
      </template>
    </MasonryWall>
  </div>
</template>

<style scoped>
.cf-masonry-selected {
  outline: 3px solid var(--ui-primary);
  outline-offset: -3px;
}
.cf-masonry-select,
.cf-masonry-actions {
  position: absolute;
  top: 0.5rem;
  z-index: 1;
  color: white;
  background: rgb(20 20 24 / 35%);
  border: 1px solid rgb(255 255 255 / 25%);
  border-radius: 0.625rem;
  box-shadow: 0 2px 10px rgb(0 0 0 / 15%);
  backdrop-filter: blur(14px) saturate(140%);
  opacity: 0;
  pointer-events: none;
  transition:
    opacity 150ms ease,
    background-color 150ms ease;
}
.cf-masonry-select {
  left: 0.5rem;
  display: flex;
  padding: 0.375rem;
  cursor: pointer;
}
.cf-masonry-actions {
  right: 0.5rem;
}
.cf-masonry-photo:hover .cf-masonry-select,
.cf-masonry-photo:hover .cf-masonry-actions,
.cf-masonry-photo:focus-within .cf-masonry-select,
.cf-masonry-photo:focus-within .cf-masonry-actions,
.cf-masonry-actions[data-state='open'],
.cf-masonry-control-selected {
  opacity: 1;
  pointer-events: auto;
}
.cf-masonry-actions:hover,
.cf-masonry-select:hover {
  background: rgb(20 20 24 / 55%);
}
@media (hover: none), (pointer: coarse) {
  .cf-masonry-select,
  .cf-masonry-actions {
    opacity: 1;
    pointer-events: auto;
    min-width: 44px;
    min-height: 44px;
    align-items: center;
    justify-content: center;
  }
}
@media (prefers-reduced-motion: reduce) {
  .cf-masonry-select,
  .cf-masonry-actions {
    transition: none;
  }
}
</style>
