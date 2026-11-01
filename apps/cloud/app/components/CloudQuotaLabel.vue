<script setup lang="ts">
defineProps<{ quota: string }>()
</script>
<template>
  <span class="inline-flex items-center gap-1">
    {{ $t('cloud.billing.' + quota) }}
    <UTooltip
      v-if="quota === 'photos'"
      :ui="{ content: 'max-w-xs h-auto whitespace-normal' }"
    >
      <UButton
        variant="ghost"
        color="neutral"
        type="button"
        class="inline-flex shrink-0 items-center text-muted focus-visible:outline-2 focus-visible:outline-offset-2"
        :aria-label="$t('cloud.billing.photosQuotaHelp')"
      >
        <UIcon
          name="i-lucide-info"
          class="size-3.5"
        />
      </UButton>
      <template #content>
        <span class="block whitespace-normal break-words py-1 leading-relaxed">
          {{ $t('cloud.billing.photosQuotaHelp') }}
        </span>
      </template>
    </UTooltip>
  </span>
</template>
