<script setup lang="ts">
import { z } from 'zod'
import { useWizardStore } from '~/stores/wizard'

definePageMeta({
  layout: 'onboarding',
})

const router = useRouter()
const wizardStore = useWizardStore()

// Mark this step as accessible when entering the page
wizardStore.markStepAccessible(1)

// Use the wizard form composable
const {
  fields,
  state,
  loading: fetchingSchema,
  isFieldVisible,
} = useWizardForm('admin')

// Construct schema dynamically or keep it static?
// For admin, static is safer for the specific password logic,
// but we can make it partial to allow extra fields if API adds them.
const schema = z
  .object({
    username: z.string().min(2, $t('onboarding.admin.invalidUsername')),
    email: z.email($t('onboarding.admin.invalidEmail')),
    password: z.string().min(6, $t('onboarding.admin.invalidPassword')),
    confirmPassword: z.string().min(6, $t('onboarding.admin.invalidConfirmPassword')),
  })
  .refine((data) => data.password === data.confirmPassword, {
    message: $t('onboarding.admin.passwordMismatch'),
    path: ['confirmPassword'],
  })

function onSubmit() {
  // Validation passed, data is already in the store via useWizardForm binding
  router.push('/onboarding/site')
}
</script>

<template>
  <WizardStep
    :title="$t('onboarding.admin.title')"
    :description="$t('onboarding.admin.description')"
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
      id="admin-form"
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
          v-if="isFieldVisible(field)"
          :label="$t(field.label || '')"
          :name="field.key"
          :required="field.ui.required"
          :help="$t(field.ui.help || '')"
        >
          <WizardInput
            v-model="state[field.key]"
            :type="field.ui.type === 'password' ? 'password' : 'text'"
            :placeholder="field.ui.placeholder"
          />
        </WizardFormField>
      </template>
    </UForm>

    <template #actions>
      <WizardButton
        to="/onboarding"
        color="outline"
        size="lg"
        leading-icon="tabler:arrow-left"
      >
        {{ $t('onboarding.actions.previous') }}
      </WizardButton>
      <WizardButton
        type="submit"
        form="admin-form"
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
