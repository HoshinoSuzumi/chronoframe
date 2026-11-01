<script setup lang="ts">
defineProps<{
  options: { value: string; label: string; disabled?: boolean }[]
  label: string
}>()
const model = defineModel<string>()
</script>
<template>
  <URadioGroup
    v-model="model"
    :items="options"
    :aria-label="label"
    orientation="horizontal"
  />
</template>
