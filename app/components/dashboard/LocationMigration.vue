<script setup lang="ts">
const { user } = useUserSession()
const router = useRouter()
const migrationOpen = ref(false)
const migrationCount = ref(0)
const migrationLoading = ref(false)
const migrationError = ref(false)
const toast = useToast()
const migrationHandled = useState('location-migration-handled', () => false)

async function checkLocationMigration() {
  if (!user.value?.isAdmin || migrationHandled.value) return
  try {
    const stats = await $fetch('/api/system/stats')
    if (migrationHandled.value) return
    migrationCount.value = stats.locationMigration.count
    migrationOpen.value = migrationCount.value > 0
  } catch (error) {
    console.error('Failed to check location migration', error)
  }
}

let removeNavigationHook: (() => void) | undefined
onMounted(() => {
  void checkLocationMigration()
  removeNavigationHook = router.afterEach(() => {
    void checkLocationMigration()
  })
})
onUnmounted(() => removeNavigationHook?.())

async function confirmLocationMigration() {
  migrationLoading.value = true
  migrationError.value = false
  try {
    await $fetch('/api/queue/add-task', {
      method: 'POST',
      body: { payload: { type: 'location-migration' } },
    })
    migrationHandled.value = true
    toast.add({
      title: $t('dashboard.locationMigration.queued'),
      color: 'success',
    })
    migrationOpen.value = false
  } catch {
    migrationError.value = true
  } finally {
    migrationLoading.value = false
  }
}
</script>

<template>
  <UModal
    v-model:open="migrationOpen"
    :dismissible="!migrationLoading"
    :title="$t('dashboard.locationMigration.title')"
  >
    <template #body>
      <p>
        {{
          $t('dashboard.locationMigration.description', {
            count: migrationCount,
          })
        }}
      </p>
      <p
        v-if="migrationError"
        class="text-error mt-3"
      >
        {{ $t('dashboard.locationMigration.error') }}
      </p>
    </template>
    <template #footer>
      <div class="flex items-center justify-end gap-2 w-full">
        <UButton
          color="neutral"
          variant="ghost"
          :disabled="migrationLoading"
          @click="migrationOpen = false"
          >{{ $t('dashboard.locationMigration.cancel') }}</UButton
        >
        <UButton
          :loading="migrationLoading"
          @click="confirmLocationMigration"
          >{{ $t('dashboard.locationMigration.confirm') }}</UButton
        >
      </div>
    </template>
  </UModal>
</template>
