import type { FieldDescriptor, SettingsFieldsResponse } from '~~/shared/types/settings'

/**
 * Settings Form Composable
 * 统一处理获取字段描述、管理表单状态、提交更新
 * 避免在各个页面中重复实现相同逻辑
 *
 * @param namespace 设置命名空间（如 'app', 'map', 'location', 'storage'）
 * @returns 字段列表、表单状态、加载状态、错误状态和提交函数
 *
 * @example
 * const { fields, state, submit, loading } = useSettingsForm('app')
 */
export function useSettingsForm(namespace: string) {
  const toast = useToast()

  const fields = ref<FieldDescriptor[]>([])
  const state = reactive<Record<string, any>>({})
  const loading = ref(false)
  const error = ref<string | null>(null)

  /**
   * 从 API 获取字段描述和当前值
   */
  const fetchFields = async () => {
    loading.value = true
    error.value = null

    try {
      const response = await $fetch<SettingsFieldsResponse>(
        '/api/system/settings/fields',
        {
          query: { namespace },
        },
      )

      fields.value = response.fields

      // 使用 API 返回的值初始化状态
      response.fields.forEach((field) => {
        state[field.key] = field.value ?? field.defaultValue ?? null
      })
    } catch (err) {
      const message = (err as Error).message
      error.value = message
      toast.add({
        title: '加载设置失败',
        description: message,
        color: 'error',
      })
    } finally {
      loading.value = false
    }
  }

  /**
   * 提交表单更新
   * 支持单条或多条更新
   *
   * @param data 要更新的字段数据
   * @example
   * await submit({ title: 'New Title', slogan: 'New Slogan' })
   */
  const submit = async (data: Record<string, any>) => {
    loading.value = true
    error.value = null

    try {
      // 准备批量更新请求
      const updates = Object.entries(data).map(([key, value]) => ({
        namespace,
        key,
        value,
      }))

      await $fetch('/api/system/settings/batch', {
        method: 'PUT',
        body: { updates },
      })

      // 重新加载字段以获取最新值
      await fetchFields()

      toast.add({
        title: '设置已保存',
        color: 'success',
      })
    } catch (err) {
      const message = (err as Error).message
      error.value = message
      toast.add({
        title: '保存设置失败',
        description: message,
        color: 'error',
      })
      throw err
    } finally {
      loading.value = false
    }
  }

  /**
   * 重置表单状态为当前字段值
   */
  const reset = () => {
    fields.value.forEach((field) => {
      state[field.key] = field.value ?? field.defaultValue ?? null
    })
  }

  /**
   * 更新特定字段的状态
   * 用于处理字段依赖关系或条件显示
   */
  const updateField = (fieldKey: string, value: any) => {
    state[fieldKey] = value
  }

  /**
   * 获取特定字段
   */
  const getField = (fieldKey: string): FieldDescriptor | undefined => {
    return fields.value.find((f) => f.key === fieldKey)
  }

  /**
   * 获取字段的当前值
   */
  const getFieldValue = (fieldKey: string): any => {
    return state[fieldKey]
  }

  // 组件挂载时自动获取字段
  onMounted(() => {
    fetchFields()
  })

  return {
    // 数据
    fields: readonly(fields),
    state,

    // 状态
    loading: readonly(loading),
    error: readonly(error),

    // 方法
    submit,
    reset,
    fetchFields,
    updateField,
    getField,
    getFieldValue,
  }
}
