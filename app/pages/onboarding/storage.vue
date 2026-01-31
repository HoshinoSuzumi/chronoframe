<script setup lang="ts">
import { z } from 'zod'
import type { ProviderOption } from '~/components/Wizard/ProviderSelector.vue'

definePageMeta({
  layout: 'onboarding',
})

const router = useRouter()

const {
  fields,
  state,
  loading: fetchingSchema,
  isFieldVisible,
} = useWizardForm('storage')

// Dynamic schema based on visible fields
const schema = computed(() => {
  const s: Record<string, any> = {}
  fields.value.forEach((field) => {
    if (!isFieldVisible(field)) return

    // Basic validation based on UI config
    let validator: z.ZodTypeAny

    if (field.type === 'boolean' || field.ui.type === 'toggle') {
      validator = z.boolean()
    } else if (field.type === 'number') {
      validator = z.number()
      if (field.ui.required) {
        validator = (validator as z.ZodString).min(
          1,
          `${field.label} is required`,
        )
      } else {
        validator = (validator as z.ZodString).optional()
      }
    } else {
      validator = z.string()
      if (field.ui.required) {
        validator = (validator as z.ZodString).min(
          1,
          `${field.label} is required`,
        )
      } else {
        validator = (validator as z.ZodString).optional()
      }
    }

    if (field.ui.type === 'number') {
      // If we had number types, we'd handle them here
      // validator = z.number()
    }

    s[field.key] = validator
  })
  return z.object(s)
})

function onSubmit() {
  // Validation passed, data is already in the store via useWizardForm binding
  // Transformation of storage config will happen in the final step
  router.push('/onboarding/map')
}
</script>

<template>
  <WizardStep
    title="存储配置"
    description="选择将您的照片存储在何处"
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

    <div
      v-else
      class="space-y-8"
    >
      <!-- Provider Selector (Custom Field) -->
      <template
        v-for="field in fields"
        :key="field.key"
      >
        <WizardProviderSelector
          v-if="field.key === 'provider' && field.ui.type === 'custom'"
          v-model="state[field.key]"
          :options="(field.ui.options as ProviderOption[]) || []"
        />
      </template>

      <UForm
        id="storage-form"
        :state="state"
        :schema="schema"
        class="space-y-4"
        @submit="onSubmit"
      >
        <template
          v-for="field in fields"
          :key="field.key"
        >
          <!-- Skip provider field as it's rendered above -->
          <WizardFormField
            v-if="isFieldVisible(field) && field.key !== 'provider'"
            :label="$t(field.label || '')"
            :name="field.key"
            :required="field.ui.required"
            :help="$t(field.ui.help || '')"
          >
            <WizardInput
              v-if="field.ui.type === 'password'"
              v-model="state[field.key]"
              type="password"
              :placeholder="$t(field.ui.placeholder || '')"
            />
            <WizardCheckbox
              v-else-if="field.ui.type === 'toggle'"
              v-model="state[field.key]"
              :label="$t(field.label || '')"
            />
            <WizardInput
              v-else
              v-model="state[field.key]"
              type="text"
              :placeholder="$t(field.ui.placeholder || '')"
            />
          </WizardFormField>
        </template>
      </UForm>
    </div>

    <template #actions>
      <WizardButton
        type="submit"
        form="storage-form"
        color="primary"
        size="lg"
        :disabled="fetchingSchema"
        trailing-icon="tabler:arrow-right"
      >
        下一步
      </WizardButton>
    </template>
  </WizardStep>
</template>
