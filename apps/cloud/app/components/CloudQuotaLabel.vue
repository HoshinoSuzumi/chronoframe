<script setup lang="ts">
defineProps<{ quota: string }>()
</script>
<template>
  <span class="inline-flex items-center gap-1">
    {{ $t('cloud.billing.' + quota) }}
    <UTooltip
      v-if="quota === 'photos'"
      :text="$t('cloud.billing.photosQuotaHelp')"
      :ui="{ content: 'max-w-xs h-auto whitespace-normal' }"
    >
      <button
        type="button"
        class="inline-flex shrink-0 items-center text-muted focus-visible:outline-2 focus-visible:outline-offset-2"
        :aria-label="$t('cloud.billing.photosQuotaHelp')"
      >
        <UIcon
          name="i-lucide-info"
          class="size-3.5"
        />
      </button>
    </UTooltip>
  </span>
</template>
