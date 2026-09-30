<script setup lang="ts">
import { useWizardStore } from '~/stores/wizard'

definePageMeta({
  layout: 'onboarding',
})

const loading = ref(false)
const store = useWizardStore()
const toast = useToast()

async function onComplete() {
  loading.value = true
  try {
    // 1. Prepare Admin Data
    const adminData = store.admin

    // 2. Prepare Site Data
    const siteData = store.site

    // 3. Prepare Storage Data
    const storageState = store.storage
    const storageProvider = storageState.provider
    const storageConfig: Record<string, any> = { provider: storageProvider }

    // Extract provider specific keys
    Object.keys(storageState).forEach((key) => {
      if (key.startsWith(storageProvider + '.')) {
        const configKey = key.split('.')[1]!
        storageConfig[configKey] = storageState[key]
      }
    })

    const storageData = {
      name: storageState.name,
      config: storageConfig,
    }

    // 4. Prepare Map Data
    const mapState = store.map
    const mapProvider = mapState.provider
    const mapTokenKey = `${mapProvider}.token`
    const mapStyleKey = `${mapProvider}.style`

    const mapData = {
      provider: mapProvider,
      token: mapState[mapTokenKey] || '',
      style: mapState[mapStyleKey],
    }

    // 5. Submit All
    await $fetch('/api/wizard/submit', {
      method: 'POST',
      body: {
        admin: adminData,
        site: siteData,
        storage: storageData,
        map: mapData,
      },
    })

    // Clear store
    store.clear()

    // Hard redirect to dashboard to reload settings from server
    // (preserves session cookie set during submit)
    window.location.href = '/dashboard'
  } catch (error: any) {
    console.error(error)
    toast.add({
      title: $t('onboarding.complete.setupFailedTitle'),
      description: error.data?.message || $t('onboarding.complete.setupFailedDescription'),
      color: 'error',
    })
  } finally {
    loading.value = false
  }
}
</script>

<template>
  <WizardStep
    :title="$t('onboarding.complete.title')"
    :description="$t('onboarding.complete.description')"
  >
    <div
      class="flex flex-col items-center justify-center py-12 space-y-8 text-center"
    >
      <div class="relative">
        <div
          class="absolute inset-0 bg-green-500/20 blur-3xl rounded-full"
        ></div>
        <div
          class="relative size-28 bg-linear-to-br from-green-400/20 to-green-600/20 rounded-full flex items-center justify-center border border-green-500/30 shadow-2xl shadow-green-500/20"
        >
          <UIcon
            name="tabler:check"
            class="size-18 text-green-400"
          />
        </div>
      </div>

      <div class="max-w-md text-neutral-300 text-lg">
        <p>
          {{ $t('onboarding.complete.body') }}
        </p>
      </div>

      <WizardButton
        size="xl"
        color="primary"
        :loading="loading"
        class="px-6 py-3 text-base font-bold shadow-xl shadow-primary-500/20 hover:shadow-primary-500/40 transition-all duration-300"
        @click="onComplete"
      >
        {{ $t('onboarding.complete.goToDashboard') }}
      </WizardButton>
    </div>
  </WizardStep>
</template>
