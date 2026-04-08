import type {
  FieldDescriptor,
  SettingsFieldsResponse,
} from '~~/shared/types/settings'
import { useWizardStore } from '~/stores/wizard'

/**
 * Wizard Form Composable
 * Handles fetching schema and managing state for wizard steps
 *
 * @param namespace Namespace for the wizard step (e.g. 'admin', 'storage')
 */
export function useWizardForm(namespace: string) {
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
        defaults[field.key] = field.value ?? field.defaultValue ?? ''
      })

      // Merge defaults with existing store state
      // Existing store state takes precedence
      const currentState = state.value
      const newState = { ...defaults, ...currentState }

      // Update store
      state.value = newState
    } catch (e: any) {
      error.value = e.message
      toast.add({
        title: 'Failed to load wizard schema',
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
