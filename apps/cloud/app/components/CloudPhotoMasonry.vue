<script setup lang="ts">
import { Ellipsis } from 'lucide-vue-next'
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
      :label="$t('cloud.messages.selectAllPhotographs')"
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
          class="relative"
          :class="{ 'cf-masonry-selected': selection[photo.id] }"
        >
          <MasonryItemPhoto
            :photo="photo"
            :index="index"
            @open-viewer="emit('preview', photo)"
          />
          <label
            class="cf-masonry-select"
            :for="`${selectionId}-${photo.id}`"
          >
            <UCheckbox
              :id="`${selectionId}-${photo.id}`"
              :model-value="!!selection[photo.id]"
              :aria-label="$t('cloud.ui.selectNamed', { title: photo.title })"
              @update:model-value="selection[photo.id] = $event === true"
            />
          </label>
          <UDropdownMenu :items="actions(photo)">
            <CfButton
              class="cf-masonry-actions"
              variant="secondary"
              :icon="Ellipsis"
              :aria-label="$t('cloud.ui.actionsNamed', { title: photo.title })"
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
.cf-masonry-select {
  position: absolute;
  top: 0.5rem;
  left: 0.5rem;
  z-index: 1;
  display: flex;
  padding: 0.375rem;
  border-radius: 0.5rem;
  background: var(--ui-bg);
  box-shadow: 0 1px 4px rgb(0 0 0 / 20%);
}
.cf-masonry-actions {
  position: absolute;
  top: 0.5rem;
  right: 0.5rem;
  z-index: 1;
}
@media (pointer: coarse) {
  .cf-masonry-select {
    min-width: 44px;
    min-height: 44px;
    align-items: center;
    justify-content: center;
  }
}
</style>
