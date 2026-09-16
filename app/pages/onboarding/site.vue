<script setup lang="ts">
import { z } from 'zod'
import type { ProviderOption } from '~/components/Wizard/ProviderSelector.vue'
import { useWizardStore } from '~/stores/wizard'

definePageMeta({
  layout: 'onboarding',
})

const router = useRouter()
const wizardStore = useWizardStore()

// Mark this step as accessible when entering the page
wizardStore.markStepAccessible(2)

// Use wizard form for 'app' namespace (site settings)
const {
  fields,
  state,
  loading: fetchingSchema,
  isFieldVisible,
} = useWizardForm('app')

const schema = z.object({
  title: z.string().min(1, $t('onboarding.site.invalidTitle')),
  slogan: z.string().optional(),
  author: z.string().optional(),
  avatarUrl: z.string().url($t('onboarding.site.invalidAvatarUrl')).optional().or(z.literal('')),
})

function onSubmit() {
  // Validation passed, data is already in the store via useWizardForm binding
  router.push('/onboarding/storage')
}
</script>

<template>
  <WizardStep
    :title="$t('onboarding.site.title')"
    :description="$t('onboarding.site.description')"
    :tips="$t('onboarding.layout.tips')"
  >
    <div
      v-if="fetchingSchema"
      class="flex justify-center py-8"
    >
      <UIcon
        name="tabler:loader"
        class="animate-spin w-8 h-8 text-gray-400"
      />
    </div>

    <UForm
      v-else
      id="site-form"
      :schema="schema"
      :state="state"
      class="space-y-4"
      @submit="onSubmit"
    >
      <template
        v-for="field in fields"
        :key="field.key"
      >
        <WizardFormField
          v-if="isFieldVisible(field) && field.ui.type === 'tabs'"
          :label="$t(field.label || '')"
          :name="field.key"
          :required="field.ui.required"
          :help="$t(field.ui.help || '')"
        >
          <WizardProviderSelector
            v-model="state[field.key]"
            :options="(field.ui.options as ProviderOption[]) || []"
          />
        </WizardFormField>
        <WizardFormField
          v-else-if="isFieldVisible(field)"
          :label="$t(field.label || '')"
          :name="field.key"
          :required="field.ui.required"
          :help="$t(field.ui.help || '')"
        >
          <WizardInput
            v-model="state[field.key]"
            :type="field.ui.type === 'url' ? 'url' : 'text'"
            :placeholder="field.ui.placeholder"
          />
        </WizardFormField>
      </template>
    </UForm>

    <template #actions>
      <WizardButton
        to="/onboarding/admin"
        color="outline"
        size="lg"
        leading-icon="tabler:arrow-left"
      >
        {{ $t('onboarding.actions.previous') }}
      </WizardButton>
      <WizardButton
        type="submit"
        form="site-form"
        color="primary"
        size="lg"
        :disabled="fetchingSchema"
        trailing-icon="tabler:arrow-right"
      >
        {{ $t('onboarding.actions.next') }}
      </WizardButton>
    </template>
  </WizardStep>
</template>
