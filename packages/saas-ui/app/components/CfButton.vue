<script setup lang="ts">
import type { Component } from 'vue'
import { Primitive, type PrimitiveProps } from 'reka-ui'
import { cva, type VariantProps } from 'class-variance-authority'
import { cn } from '../utils/cn'
import { LoaderCircle } from 'lucide-vue-next'
const variants = cva('cf-button', {
  variants: {
    variant: {
      default: 'cf-button-primary',
      secondary: 'cf-button-secondary',
      soft: 'cf-button-soft',
      ghost: 'cf-button-ghost',
      destructive: 'cf-button-destructive',
    },
    size: {
      default: '',
      sm: 'cf-button-sm',
      lg: 'cf-button-lg',
      icon: 'cf-button-icon',
    },
  },
  defaultVariants: { variant: 'default', size: 'default' },
})
type ButtonVariants = VariantProps<typeof variants>
const props = withDefaults(
  defineProps<
    PrimitiveProps & {
      variant?: ButtonVariants['variant']
      size?: ButtonVariants['size']
      icon?: Component
      loading?: boolean
      disabled?: boolean
      class?: string
    }
  >(),
  { as: 'button' },
)
function guardDisabled(event: Event) {
  if (props.disabled || props.loading) {
    event.preventDefault()
    event.stopImmediatePropagation()
  }
}
</script>
<template>
  <Primitive
    :as="as"
    :as-child="asChild"
    :class="cn(variants({ variant, size }), props.class)"
    :disabled="disabled || loading || undefined"
    :aria-busy="loading || undefined"
    :type="as === 'button' && !asChild ? 'button' : undefined"
    :data-disabled="disabled || loading || undefined"
    :aria-disabled="disabled || loading || undefined"
    :tabindex="asChild && (disabled || loading) ? -1 : undefined"
    @click.capture="guardDisabled"
  >
    <LoaderCircle
      v-if="loading && !asChild"
      class="cf-spin"
      :size="16"
      aria-hidden="true"
    /><component
      v-else-if="icon && !asChild"
      :is="icon"
      :size="16"
      aria-hidden="true"
    /><slot />
  </Primitive>
</template>
