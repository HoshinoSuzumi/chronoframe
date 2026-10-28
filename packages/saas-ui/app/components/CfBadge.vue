<script setup lang="ts">
withDefaults(defineProps<{ tone?: 'neutral' | 'success' | 'warning' }>(), {
  tone: 'neutral',
})
</script>
<template>
  <span
    class="cf-badge"
    :class="`cf-badge-${tone}`"
    ><slot
  /></span>
</template>
