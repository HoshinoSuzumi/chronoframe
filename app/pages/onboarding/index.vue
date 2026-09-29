<script setup lang="ts">
definePageMeta({
  layout: 'onboarding',
})
</script>

<template>
  <WizardStep
    :title="$t('onboarding.welcome.title')"
    :description="$t('onboarding.welcome.description')"
  >
    <div class="space-y-6">
      <div class="text-neutral-300 text-base leading-relaxed">
        <p>
          {{ $t('onboarding.welcome.intro') }}
        </p>
      </div>

      <div class="grid grid-cols-1 sm:grid-cols-2 gap-4">
        <div
          class="p-4 rounded-xl bg-white/5 border border-white/10 flex items-start gap-4"
        >
          <div
            class="size-12 flex items-center justify-center rounded-lg shrink-0 bg-primary-500/20 text-primary-400"
          >
            <UIcon
              name="tabler:user"
              class="size-6"
            />
          </div>
          <div>
            <h3 class="font-medium text-white">{{ $t('onboarding.welcome.cards.admin.title') }}</h3>
            <p class="text-sm text-neutral-400 mt-1">{{ $t('onboarding.welcome.cards.admin.description') }}</p>
          </div>
        </div>

        <div
          class="p-4 rounded-xl bg-white/5 border border-white/10 flex items-start gap-4"
        >
          <div
            class="size-12 flex items-center justify-center rounded-lg shrink-0 bg-purple-500/20 text-purple-400"
          >
            <UIcon
              name="tabler:device-laptop"
              class="size-6"
            />
          </div>
          <div>
            <h3 class="font-medium text-white">{{ $t('onboarding.welcome.cards.site.title') }}</h3>
            <p class="text-sm text-neutral-400 mt-1">{{ $t('onboarding.welcome.cards.site.description') }}</p>
          </div>
        </div>

        <div
          class="p-4 rounded-xl bg-white/5 border border-white/10 flex items-start gap-4"
        >
          <div
            class="size-12 flex items-center justify-center rounded-lg shrink-0 bg-blue-500/20 text-blue-400"
          >
            <UIcon
              name="tabler:server"
              class="size-6"
            />
          </div>
          <div>
            <h3 class="font-medium text-white">{{ $t('onboarding.welcome.cards.storage.title') }}</h3>
            <p class="text-sm text-neutral-400 mt-1">
              {{ $t('onboarding.welcome.cards.storage.description') }}
            </p>
          </div>
        </div>

        <div
          class="p-4 rounded-xl bg-white/5 border border-white/10 flex items-start gap-4"
        >
          <div
            class="size-12 flex items-center justify-center rounded-lg shrink-0 bg-green-500/20 text-green-400"
          >
            <UIcon
              name="tabler:map"
              class="size-6"
            />
          </div>
          <div>
            <h3 class="font-medium text-white">{{ $t('onboarding.welcome.cards.map.title') }}</h3>
            <p class="text-sm text-neutral-400 mt-1">
              {{ $t('onboarding.welcome.cards.map.description') }}
            </p>
          </div>
        </div>
      </div>
    </div>

    <template #actions>
      <div class="w-full flex justify-between items-center">
        <p class="text-xs text-neutral-500 font-medium">
          {{ $t('onboarding.welcome.privacyNotice') }}
        </p>
        <WizardButton
          to="/onboarding/admin"
          color="primary"
          size="lg"
          trailing-icon="tabler:arrow-right"
        >
          {{ $t('onboarding.welcome.start') }}
        </WizardButton>
      </div>
    </template>
  </WizardStep>
</template>
