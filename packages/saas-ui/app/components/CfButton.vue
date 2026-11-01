<script setup lang="ts">
import type { Component } from 'vue'
import type { ButtonProps } from '@nuxt/ui'
const props = withDefaults(
  defineProps<{
    variant?: ButtonProps['variant'] | 'default' | 'secondary' | 'destructive'
    color?: ButtonProps['color']
    size?: ButtonProps['size'] | 'default' | 'icon'
    icon?: Component
    loading?: boolean
    disabled?: boolean
  }>(),
  { variant: 'default', size: 'default' },
)
const appearance = computed(() => {
  if (props.variant === 'default') return 'solid'
  if (props.variant === 'secondary' || props.variant === 'destructive')
    return 'outline'
  return props.variant
})
</script>
<template>
  <UButton
    :variant="appearance"
    :color="color ?? (variant === 'destructive' ? 'error' : 'neutral')"
    :size="size === 'icon' || size === 'default' ? 'md' : size"
    :square="size === 'icon'"
    :loading="loading"
    :disabled="disabled"
    :class="['cf-button', size === 'icon' && 'cf-button-icon']"
  >
    <template
      v-if="icon && !loading"
      #leading
      ><component
        :is="icon"
        :size="16"
        aria-hidden="true" /></template
    ><slot />
  </UButton>
</template>
