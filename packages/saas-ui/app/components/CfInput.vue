<script setup lang="ts">
import { cn } from '../utils/cn'
const model = defineModel<string>({ default: '' })
const props = defineProps<{ class?: string }>()
</script>
<template>
  <input
    v-model="model"
    :class="cn('cf-input', props.class)"
  />
</template>
