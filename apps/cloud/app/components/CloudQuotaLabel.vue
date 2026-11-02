<script setup lang="ts">
defineProps<{ quota: string }>()
const open = ref(false)
</script>
<template>
  <span class="inline-flex items-center gap-1">
    {{ $t('cloud.billing.' + quota) }}
    <UTooltip
      v-if="quota === 'photos'"
      v-model:open="open"
      :disable-closing-trigger="true"
      :ui="{ content: 'max-w-xs h-auto whitespace-normal' }"
    >
      <UButton
        variant="ghost"
        color="neutral"
        type="button"
        class="cf-quota-info shrink-0 text-muted focus-visible:outline-2 focus-visible:outline-offset-2"
        @click="open = true"
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

<style scoped>
.cf-quota-info {
  display: inline-flex;
  width: 16px;
  height: 16px;
  min-height: 0;
  padding: 0;
  align-items: center;
  justify-content: center;
  vertical-align: middle;
}
</style>
