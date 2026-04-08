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
} = useWizardForm('map')

// Dynamic schema
const schema = computed(() => {
  const s: Record<string, any> = {}
  fields.value.forEach((field) => {
    if (!isFieldVisible(field)) return

    let validator: z.ZodTypeAny = z.string()
    if (field.ui.required) {
      validator = (validator as z.ZodString).min(
        1,
        `${field.label} is required`,
      )
    } else {
      validator = (validator as z.ZodString).optional()
    }
    s[field.key] = validator
  })
  return z.object(s)
})

function onSubmit() {
  // Validation passed, data is already in the store via useWizardForm binding
  // Transformation of map config will happen in the final step
  router.push('/onboarding/complete')
}
</script>

<template>
  <WizardStep
    title="地图服务"
    description="为地球仪视图以及照片详情中的小地图配置地图服务"
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
      class="space-y-6"
    >
      <!-- Provider Selector -->
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
        id="map-form"
        :state="state"
        :schema="schema"
        class="space-y-4"
        @submit="onSubmit"
      >
        <template
          v-for="field in fields"
          :key="field.key"
        >
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
        form="map-form"
        color="primary"
        size="lg"
        :disabled="fetchingSchema"
        trailing-icon="tabler:arrow-right"
      >
        完成设置
      </WizardButton>
    </template>
  </WizardStep>
</template>
