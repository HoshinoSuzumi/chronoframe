<script setup lang="ts">
import { useMapSetupNotice } from '~/composables/useMapSetupNotice'

const { isOpen, isAdmin, dismiss } = useMapSetupNotice()

async function openSettings() {
  dismiss()
  await navigateTo('/dashboard/settings/map')
}
</script>

<template>
  <UModal
    v-model:open="isOpen"
    :title="$t('map.setupNotice.title')"
    :ui="{
      overlay: 'z-[80]',
      content: 'z-[80]',
      title: 'flex items-center gap-2',
      footer: 'justify-end',
    }"
  >
    <template #title>
      <Icon
        name="tabler:map-off"
        class="size-5 shrink-0 text-warning"
      />
      <span>{{ $t('map.setupNotice.title') }}</span>
    </template>
    <template #body>
      <p class="text-sm leading-relaxed text-neutral-500 dark:text-neutral-400">
        {{ $t('map.setupNotice.description') }}
      </p>
    </template>
    <template #footer>
      <UButton
        color="neutral"
        variant="outline"
        @click="dismiss"
      >
        {{ $t('map.setupNotice.dismiss') }}
      </UButton>
      <UButton
        v-if="isAdmin"
        icon="tabler:settings"
        @click="openSettings"
      >
        {{ $t('map.setupNotice.openSettings') }}
      </UButton>
    </template>
  </UModal>
</template>
