<script setup lang="ts">
import { z } from 'zod'
import type { ProviderOption } from '~/components/Wizard/ProviderSelector.vue'

definePageMeta({
  layout: 'onboarding',
})

const router = useRouter()
const toast = useToast()

const {
  fields,
  state,
  loading: fetchingSchema,
  isFieldVisible,
} = useWizardForm('database')

// Test connection state management
const testLoading = ref(false)
const bootstrapLoading = ref(false)
const testResult = ref<{
  success: boolean
  message: string
} | null>(null)
const tested = ref(false)

// Reset test result when configuration changes
watch(() => ({ adapter: state.value.adapter, sqlitePath: state.value['sqlite.path'], postgresUrl: state.value['postgres.url'] }), () => {
  testResult.value = null
  tested.value = false
}, { deep: true })

// Ensure adapter has a default value after schema is loaded
watch(fetchingSchema, (loading) => {
  if (!loading && !state.value.adapter) {
    state.value.adapter = 'sqlite'
  }
})

const schema = computed(() => {
  return z.object({
    adapter: z.enum(['sqlite', 'postgres']),
    'sqlite.path': z.string().optional(),
    'postgres.url': z.string().optional(),
  })
})

async function testConnection() {
  testLoading.value = true
  testResult.value = null

  try {
    if (!state.value.adapter) {
      testResult.value = {
        success: false,
        message: 'Please select a database adapter first',
      }
      return
    }

    if (state.value.adapter === 'postgres' && !state.value['postgres.url']) {
      testResult.value = {
        success: false,
        message: 'PostgreSQL URL is required',
      }
      return
    }

    const requestBody = 
      state.value.adapter === 'sqlite'
        ? {
            adapter: 'sqlite' as const,
            sqlite: {
              path: state.value['sqlite.path'] || 'data/app.sqlite3',
            },
          }
        : {
            adapter: 'postgres' as const,
            postgres: {
              url: state.value['postgres.url'],
            },
          }

    const result = await $fetch('/api/wizard/test-connection', {
      method: 'POST',
      body: requestBody,
    })

    testResult.value = {
      success: true,
      message: result.message,
    }
    tested.value = true
  } catch (error: any) {
    testResult.value = {
      success: false,
      message: error.data?.statusMessage || error.message || 'Connection failed',
    }
  } finally {
    testLoading.value = false
  }
}

async function onSubmit() {
  // Validate adapter is selected
  if (!state.value.adapter) {
    toast.add({
      title: 'Error',
      description: 'Please select a database adapter',
      color: 'error',
    })
    return
  }

  // If postgres is selected, validate URL
  if (state.value.adapter === 'postgres' && !state.value['postgres.url']) {
    toast.add({
      title: 'Error',
      description: 'PostgreSQL URL is required',
      color: 'error',
    })
    return
  }

  // Test connection if not tested yet
  if (!tested.value) {
    await testConnection()
    if (!testResult.value?.success) {
      return
    }
  }

  const requestBody =
    state.value.adapter === 'sqlite'
      ? {
          adapter: 'sqlite' as const,
          sqlite: {
            path: state.value['sqlite.path'] || 'data/app.sqlite3',
          },
        }
      : {
          adapter: 'postgres' as const,
          postgres: {
            url: state.value['postgres.url'],
          },
        }
  
  try {
    bootstrapLoading.value = true

    // Persist database bootstrap config and run migrations before next step
    await $fetch('/api/wizard/bootstrap-db', {
      method: 'POST',
      body: requestBody,
    })

    await router.push('/onboarding/admin')
  } catch (error: any) {
    // Already initialized in a previous run: allow continuing onboarding
    if (error?.statusCode === 409) {
      await router.push('/onboarding/admin')
      return
    }

    console.error('Navigation/bootstrap error:', error)
    toast.add({
      title: 'Database Setup Error',
      description:
        error?.data?.statusMessage ||
        error?.message ||
        'Failed to initialize database',
      color: 'error',
    })
  } finally {
    bootstrapLoading.value = false
  }
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
            :label="$t(field.label || '')"
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
      <div class="flex items-center gap-3 w-full justify-end">
        <!-- Test Connection Result Display -->
        <div v-if="testResult" class="flex items-center gap-2">
          <UIcon
            :name="testResult.success ? 'tabler:circle-check' : 'tabler:circle-x'"
            :class="testResult.success ? 'text-green-500' : 'text-red-500'"
            class="w-5 h-5"
          />
          <span :class="testResult.success ? 'text-green-600' : 'text-red-600'" class="text-sm font-medium">
            {{ testResult.message }}
          </span>
        </div>

        <!-- Test Connection Button -->
        <WizardButton
          color="gray"
          size="lg"
          :loading="testLoading"
          :disabled="fetchingSchema || testLoading || bootstrapLoading"
          @click="testConnection"
        >
          {{ testLoading ? $t('wizard.database.testing') : $t('wizard.database.testConnection') }}
        </WizardButton>

        <!-- Next Button -->
        <WizardButton
          type="submit"
          form="database-form"
          color="primary"
          size="lg"
          :disabled="fetchingSchema || testLoading || bootstrapLoading"
          :loading="bootstrapLoading"
          trailing-icon="tabler:arrow-right"
        >
          {{ bootstrapLoading ? $t('wizard.database.migrating') : $t('wizard.next') }}
        </WizardButton>
      </div>
    </template>
  </WizardStep>
</template>

