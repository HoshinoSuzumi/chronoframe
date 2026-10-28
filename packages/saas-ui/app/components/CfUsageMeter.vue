<script setup lang="ts">
defineProps<{
  label: string
  value?: string
  limit?: string
  progress?: number
  loading?: boolean
}>()
</script>
<template>
  <div class="cf-usage-meter">
    <div class="cf-usage-heading">
      <span>{{ label }}</span
      ><CfSkeleton
        v-if="loading"
        class="h-4 w-20"
      /><span
        v-else
        class="cf-usage-value"
        >{{ value ?? '—'
        }}<span
          v-if="limit"
          class="cf-usage-limit"
        >
          / {{ limit }}</span
        ></span
      >
    </div>
    <CfProgress
      v-if="progress !== undefined"
      :value="progress"
      :aria-label="label"
    />
    <CfSkeleton
      v-else
      class="h-1 w-full"
    />
  </div>
</template>
