<script setup lang="ts">
import type { DropdownMenuItem } from '@nuxt/ui'
defineProps<{ items: DropdownMenuItem[][]; label?: string }>()
</script>
<template>
  <div class="flex justify-end">
    <UDropdownMenu
      size="sm"
      :content="{ align: 'end' }"
      :items="items"
    >
      <UButton
        variant="outline"
        color="neutral"
        size="sm"
        icon="tabler:dots-vertical"
        :aria-label="label ?? $t('dashboard.photos.table.columns.actions')"
      />
    </UDropdownMenu>
  </div>
</template>
