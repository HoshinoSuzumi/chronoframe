<script setup lang="ts">
defineProps<{
  label: string
  value?: string | number
  detail?: string
  loading?: boolean
  progress?: number
}>()
</script>
<template>
  <CfCard class="cf-stat-card"
    ><span class="cf-stat-label">{{ label }}</span
    ><CfSkeleton
      v-if="loading"
      class="h-7 w-20" /><strong v-else>{{ value ?? '—' }}</strong
    ><CfProgress
      v-if="progress !== undefined"
      :value="progress"
      :aria-label="label" />
    <p
      v-if="detail"
      class="cf-field-hint"
    >
      {{ detail }}
    </p>
    <slot
  /></CfCard>
</template>
