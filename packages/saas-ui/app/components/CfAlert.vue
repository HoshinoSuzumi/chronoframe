<script setup lang="ts">
withDefaults(defineProps<{ tone?: 'info' | 'error' | 'success' }>(), {
  tone: 'info',
})
</script>
<template>
  <div
    :role="tone === 'error' ? 'alert' : 'status'"
    class="cf-alert"
    :data-tone="tone"
  >
    <slot />
  </div>
</template>
