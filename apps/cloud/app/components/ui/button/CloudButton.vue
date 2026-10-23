<script setup lang="ts">
import { Primitive, type PrimitiveProps } from 'reka-ui'
import { cva, type VariantProps } from 'class-variance-authority'
import { cn } from '../../../utils/cn'
import { LoaderCircle } from 'lucide-vue-next'
const variants = cva('cf-button', {
  variants: {
    variant: {
      default: 'cf-button-primary',
      secondary: 'cf-button-secondary',
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
      loading?: boolean
      disabled?: boolean
      class?: string
    }
  >(),
  { as: 'button' },
)
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
  >
    <LoaderCircle
      v-if="loading"
      class="cf-spin"
      :size="16"
      aria-hidden="true"
    /><slot />
  </Primitive>
</template>
