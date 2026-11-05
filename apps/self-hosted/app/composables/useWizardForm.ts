import type {
  FieldDescriptor,
  SettingsFieldsResponse,
} from '@chronoframe/gallery/shared/types/settings'
import { useWizardStore } from '~/stores/wizard'

/**
 * Wizard Form Composable
 * Handles fetching schema and managing state for wizard steps
 *
 * @param namespace Namespace for the wizard step (e.g. 'admin', 'storage')
 */
export function useWizardForm(namespace: string) {
  const { t } = useI18n()
  const toast = useToast()
  const fields = ref<FieldDescriptor[]>([])
  const loading = ref(false)
  const error = ref<string | null>(null)
  const store = useWizardStore()

  // Map namespace to store state
  const state = computed({
    get: () => {
      switch (namespace) {
        case 'admin':
          return store.admin
        case 'app':
          return store.site
        case 'storage':
          return store.storage
        case 'map':
          return store.map
        default:
          return {}
      }
    },
    set: (val) => {
      switch (namespace) {
        case 'admin':
          store.updateAdmin(val)
          break
        case 'app':
          store.updateSite(val)
          break
        case 'storage':
          store.updateStorage(val)
          break
        case 'map':
          store.updateMap(val)
          break
      }
    },
  })

  const fetchSchema = async () => {
    loading.value = true
    error.value = null
    try {
      const response = await $fetch<SettingsFieldsResponse>(
        '/api/wizard/schema',
        {
          query: { namespace },
        },
      )
      fields.value = response.fields

      // Initialize state from schema if store is empty
      // We create a temporary object to hold default values
      const defaults: Record<string, any> = {}
      response.fields.forEach((field) => {
        const raw = field.value ?? field.defaultValue
        if (field.type === 'boolean' || field.ui?.type === 'toggle') {
          defaults[field.key] = raw === true || raw === 'true'
        } else {
          defaults[field.key] = raw ?? ''
        }
      })

      // Merge defaults with existing store state
      // Existing store state takes precedence
      const currentState = state.value
      const newState = { ...defaults, ...currentState }
      // Coerce booleans after merge so stale localStorage strings (e.g. "true")
      // from older text inputs do not break toggle controls.
      response.fields.forEach((field) => {
        if (field.type === 'boolean' || field.ui?.type === 'toggle') {
          const raw = newState[field.key]
          newState[field.key] = raw === true || raw === 'true'
        }
      })

      // Update store
      state.value = newState
    } catch (e: any) {
      error.value = e.message
      toast.add({
        title: t('wizard.form.loadSchemaFailed'),
        description: e.message,
        color: 'error',
      })
    } finally {
      loading.value = false
    }
  }

  const isFieldVisible = (field: FieldDescriptor) => {
    if (!field.ui?.visibleIf) return true
    const { fieldKey, value } = field.ui.visibleIf
    return state.value[fieldKey] === value
  }

  // Helper to get field by key
  const getField = (key: string) => fields.value.find((f) => f.key === key)

  onMounted(() => {
    fetchSchema()
  })

  return {
    fields,
    state,
    loading,
    error,
    isFieldVisible,
    fetchSchema,
    getField,
  }
}
