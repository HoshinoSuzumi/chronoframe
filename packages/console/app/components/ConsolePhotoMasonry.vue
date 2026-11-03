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
    <ClientOnly>
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
            <input
              :id="`${selectionId}-${photo.id}`"
              type="checkbox"
              class="cf-masonry-select"
              :class="{ 'cf-masonry-control-selected': selection[photo.id] }"
              :checked="!!selection[photo.id]"
              :aria-label="`${$t('dashboard.photos.table.selectRowAria')} ${photo.title ?? photo.id}`"
              @change="
                selection[photo.id] = (
                  $event.target as HTMLInputElement
                ).checked
              "
            />
            <UDropdownMenu :items="actions(photo)">
              <UButton
                class="cf-masonry-actions"
                size="xs"
                square
                variant="outline"
                color="neutral"
                icon="tabler:dots-vertical"
                :aria-label="`${$t('dashboard.photos.table.columns.actions')} ${photo.title ?? photo.id}`"
              />
            </UDropdownMenu>
          </div>
        </template>
      </MasonryWall>
      <template #fallback>
        <div
          role="status"
          class="min-h-48 flex items-center justify-center gap-2 text-sm text-neutral-500 dark:text-neutral-400"
        >
          <UIcon
            name="tabler:loader-2"
            class="size-5 animate-spin"
          />
          {{ $t('ui.loading') }}
        </div>
      </template>
    </ClientOnly>
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
  color: #262626;
  background: rgb(255 255 255 / 50%);
  border: 1px solid rgb(245 245 245 / 80%);
  border-radius: 0.375rem;
  box-shadow: 0 2px 10px rgb(0 0 0 / 15%);
  backdrop-filter: blur(12px);
  opacity: 0;
  pointer-events: none;
  transition:
    opacity 150ms ease,
    background-color 150ms ease;
}
.cf-masonry-select {
  left: 0.5rem;
  appearance: none;
  width: 24px;
  height: 24px;
  margin: 0;
  padding: 0;
  cursor: pointer;
  background-repeat: no-repeat;
  background-position: center;
  background-size: 18px;
}
.cf-masonry-select:checked {
  background-image: url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 24 24' fill='none' stroke='%23262626' stroke-width='3' stroke-linecap='round' stroke-linejoin='round'%3E%3Cpath d='m5 12 4 4 10-10'/%3E%3C/svg%3E");
}
.cf-masonry-select:focus-visible {
  outline: 2px solid var(--ui-primary);
  outline-offset: 2px;
}
.cf-masonry-actions {
  right: 0.5rem;
  width: 24px;
  height: 24px;
  min-width: 24px;
  min-height: 24px;
  padding: 0;
  justify-content: center;
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
  background-color: rgb(255 255 255 / 70%);
}
:global(.dark .cf-masonry-select),
:global(.dark .cf-masonry-actions) {
  color: white;
  background-color: rgb(0 0 0 / 50%);
  border-color: rgb(64 64 64 / 80%);
}
:global(.dark .cf-masonry-select:checked) {
  background-image: url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 24 24' fill='none' stroke='white' stroke-width='3' stroke-linecap='round' stroke-linejoin='round'%3E%3Cpath d='m5 12 4 4 10-10'/%3E%3C/svg%3E");
}
:global(.dark .cf-masonry-select:hover),
:global(.dark .cf-masonry-actions:hover) {
  background-color: rgb(0 0 0 / 70%);
}
@media (hover: none), (pointer: coarse) {
  .cf-masonry-select,
  .cf-masonry-actions {
    opacity: 1;
    pointer-events: auto;
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
