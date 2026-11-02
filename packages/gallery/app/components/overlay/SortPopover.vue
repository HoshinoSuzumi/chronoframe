<script setup lang="ts">
import { photoOverlayPopoverUi } from '../../utils/photoOverlayPresentation'
</script>
<template>
  <UPopover :ui="photoOverlayPopoverUi"
    ><slot /><template #content><OverlaySortPanel /></template
  ></UPopover>
</template>
