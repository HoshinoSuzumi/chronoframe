<script setup lang="ts">
import { renderMarkdown } from '../utils/markdown'
const props = defineProps<{ source: string; linkBase?: string }>()
const html = computed(() => renderMarkdown(props.source, props.linkBase))
</script>
<template>
  <div
    class="cf-markdown"
    v-html="html"
  />
</template>
