<script setup lang="ts">
withDefaults(defineProps<{ tone?: 'info' | 'error' | 'success' }>(), {
  tone: 'info',
})
</script>
<template>
  <UAlert
    :color="tone === 'info' ? 'neutral' : tone"
    variant="subtle"
    :role="tone === 'error' ? 'alert' : 'status'"
    ><template #description><slot /></template
    ><template
      v-if="$slots.actions"
      #actions
      ><slot name="actions" /></template
  ></UAlert>
</template>
