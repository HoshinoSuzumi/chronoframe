<script setup lang="ts">
import { Sun, Moon } from 'lucide-vue-next'
const mode = useColorMode()
const dark = computed(() => mode.value === 'dark')
</script>
<template>
  <ClientOnly
    ><CloudButton
      variant="ghost"
      size="icon"
      :aria-label="dark ? 'Switch to light theme' : 'Switch to dark theme'"
      @click="mode.preference = dark ? 'light' : 'dark'"
      ><Sun
        v-if="dark"
        :size="18" /><Moon
        v-else
        :size="18" /></CloudButton
    ><template #fallback><span class="cf-theme-placeholder" /></template
  ></ClientOnly>
</template>
