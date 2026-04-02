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
} = useWizardForm('database')

const schema = computed(() => {
  return z
    .object({
      adapter: z.enum(['sqlite', 'postgres']),
      'sqlite.path': z.string().optional(),
      'postgres.url': z.string().optional(),
    })
    .superRefine((value, ctx) => {
      if (value.adapter === 'postgres' && !value['postgres.url']) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          message: 'PostgreSQL URL is required',
          path: ['postgres.url'],
        })
      }
    })
})

function onSubmit() {
  router.push('/onboarding/admin')
}
</script>

<template>
  <WizardStep
    title="数据库配置"
    description="请选择初始化使用的数据库适配器。初始化完成后不可更改。"
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
      <template
        v-for="field in fields"
        :key="field.key"
      >
        <WizardProviderSelector
          v-if="field.key === 'adapter' && field.ui.type === 'custom'"
          v-model="state[field.key]"
          :options="(field.ui.options as ProviderOption[]) || []"
        />
      </template>

      <UForm
        id="database-form"
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
            v-if="isFieldVisible(field) && field.key !== 'adapter'"
            :label="field.label"
            :name="field.key"
            :required="field.ui.required"
          >
            <WizardInput
              v-model="state[field.key]"
              :type="field.ui.type === 'password' ? 'password' : 'text'"
              :placeholder="field.ui.placeholder"
            />
          </WizardFormField>
        </template>
      </UForm>
    </div>

    <template #actions>
      <WizardButton
        type="submit"
        form="database-form"
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

