<script setup lang="ts">
import {
  photoOverlayPopoverUi,
  photoOverlayCardUi,
} from '../../utils/photoOverlayPresentation'
</script>
<template>
  <UPopover :ui="photoOverlayPopoverUi"
    ><slot /><template #content
      ><UCard
        variant="glassmorphism"
        :ui="photoOverlayCardUi"
        class="max-w-[calc(100vw-1rem)]"
        ><OverlayFilterPanel /></UCard></template
  ></UPopover>
</template>
