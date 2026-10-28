<script setup lang="ts">
import { Sun, Moon } from 'lucide-vue-next'
const mode = useColorMode()
const dark = computed(() => mode.value === 'dark')
</script>
<template>
  <ClientOnly
    ><CfButton
      variant="ghost"
      size="icon"
      :aria-label="
        dark
          ? $t('cloud.messages.switchToLightTheme')
          : $t('cloud.messages.switchToDarkTheme')
      "
      @click="mode.preference = dark ? 'light' : 'dark'"
      ><Sun
        v-if="dark"
        :size="18" /><Moon
        v-else
        :size="18" /></CfButton
    ><template #fallback><span class="cf-theme-placeholder" /></template
  ></ClientOnly>
</template>
