<script setup lang="ts">
import type { Photo } from '@chronoframe/contracts/resources'
defineProps<{ photos: Photo[] }>()
const selected = ref<Photo | null>(null)
const dialog = ref<HTMLDialogElement>()
const trigger = ref<HTMLElement | null>(null)
function open(photo: Photo, event: MouseEvent) {
  trigger.value = event.currentTarget as HTMLElement
  selected.value = photo
  nextTick(() => dialog.value?.showModal())
}
function close() {
  dialog.value?.close()
  selected.value = null
  trigger.value?.focus()
}
</script>
<template>
  <div class="cf-gallery-grid">
    <button
      v-for="photo in photos"
      :key="photo.id"
      class="cf-gallery-tile"
      type="button"
      :aria-label="'View ' + (photo.title || 'photograph')"
      @click="open(photo, $event)"
    >
      <img
        :src="photo.thumbnailUrl || undefined"
        :alt="photo.title || 'Photograph'"
        loading="lazy"
        :width="photo.width || undefined"
        :height="photo.height || undefined"
      />
      <span>{{ photo.title || 'Untitled' }}</span>
    </button>
  </div>
  <dialog
    ref="dialog"
    class="cf-gallery-dialog"
    aria-label="Photograph viewer"
    @cancel.prevent="close"
    @click="$event.target === dialog && close()"
  >
    <template v-if="selected">
      <div class="cf-gallery-dialog-tools">
        <span>{{ selected.title }}</span
        ><a
          :href="selected.originalUrl?.replace(/\/display$/, '/original')"
          target="_blank"
          rel="noopener"
          >Original</a
        ><button
          type="button"
          @click="close"
        >
          Close
        </button>
      </div>
      <img
        :src="selected.originalUrl || undefined"
        :alt="selected.title || 'Photograph'"
      />
      <video
        v-if="selected.livePhotoVideoUrl"
        :src="selected.livePhotoVideoUrl"
        controls
        playsinline
        preload="none"
        aria-label="Live Photo video"
      />
    </template>
  </dialog>
</template>
<style scoped>
.cf-gallery-grid {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(min(180px, 100%), 1fr));
  gap: 12px;
}
.cf-gallery-tile {
  border: 0;
  background: transparent;
  padding: 0;
  cursor: pointer;
  text-align: left;
  color: inherit;
  min-width: 0;
}
.cf-gallery-tile img {
  width: 100%;
  height: 190px;
  object-fit: cover;
  border-radius: 6px;
  background: #eceee7;
}
.cf-gallery-tile span {
  display: block;
  font-size: 12px;
  padding: 6px 0;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.cf-gallery-dialog {
  border: 0;
  border-radius: 8px;
  padding: 12px;
  background: #171d18;
  color: white;
  max-width: 96vw;
  max-height: 96vh;
}
.cf-gallery-dialog::backdrop {
  background: #101710e8;
}
.cf-gallery-dialog img {
  display: block;
  object-fit: contain;
  max-width: 90vw;
  max-height: 78vh;
  width: auto;
  height: auto;
  margin: auto;
}
.cf-gallery-dialog video {
  max-width: 100%;
  max-height: 60vh;
  margin: auto;
  display: block;
}
.cf-gallery-dialog-tools {
  display: flex;
  align-items: center;
  gap: 16px;
  margin-bottom: 10px;
  font-size: 14px;
}
.cf-gallery-dialog-tools span {
  flex: 1;
  min-width: 0;
  overflow: hidden;
  text-overflow: ellipsis;
}
.cf-gallery-dialog-tools button,
.cf-gallery-dialog-tools a {
  color: inherit;
  background: transparent;
  min-height: 40px;
  padding: 8px;
  border: 1px solid #ffffff55;
  border-radius: 5px;
  font: inherit;
  cursor: pointer;
}
@media (max-width: 480px) {
  .cf-gallery-grid {
    grid-template-columns: repeat(2, minmax(0, 1fr));
    gap: 8px;
  }
  .cf-gallery-tile img {
    height: 160px;
  }
}
</style>
