export async function useWorkspaceBilling(adminOnly = false) {
  const route = useRoute(),
    user = usePortalIdentity(),
    fetcher = useRequestFetch()
  const { data: list, error: listError } = await useFetch<{
    workspaces: { id: number; name: string; role: string }[]
  }>('/api/billing/workspaces', { key: 'billing-workspaces-' + user.value?.id })
  const workspaces = computed(() =>
    (list.value?.workspaces ?? []).filter(
      (w) => !adminOnly || w.role === 'admin',
    ),
  )
  const selected = ref(
    workspaces.value.some((w) => w.id === Number(route.query.workspaceId))
      ? Number(route.query.workspaceId)
      : (workspaces.value[0]?.id ?? 0),
  )
  const { data, error, status, refresh } = await useAsyncData(
    computed(
      () => 'workspace-billing-' + user.value?.id + '-' + selected.value,
    ),
    () =>
      selected.value
        ? fetcher<any>('/api/billing/plan', {
            query: { workspaceId: selected.value },
          })
        : Promise.resolve(null),
  )
  onMounted(async () => {
    if (!workspaces.value.length && !listError.value) {
      try {
        list.value = await $fetch('/api/billing/workspaces', { method: 'POST' })
        selected.value = workspaces.value[0]?.id ?? 0
      } catch {
        /* Do not restore revoked memberships. */
      }
    }
  })
  return { workspaces, selected, data, error, listError, status, refresh }
}
