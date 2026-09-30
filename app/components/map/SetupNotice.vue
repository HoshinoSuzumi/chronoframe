<script setup lang="ts">
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
    :description="$t('map.setupNotice.description')"
    :ui="{
      overlay: 'z-[80]',
      content: 'z-[80]',
      footer: 'justify-end',
    }"
  >
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
