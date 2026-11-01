<script setup lang="ts">
withDefaults(defineProps<{ tone?: 'neutral' | 'success' | 'warning' }>(), {
  tone: 'neutral',
})
</script>
<template>
  <UBadge
    :color="tone"
    variant="subtle"
    class="cf-badge"
    ><slot
  /></UBadge>
</template>
