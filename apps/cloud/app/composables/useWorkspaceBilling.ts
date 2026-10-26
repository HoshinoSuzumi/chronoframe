export function useWorkspaceBilling(adminOnly = false) {
  const route = useRoute(),
    user = usePortalIdentity(),
    fetcher = useRequestFetch(),
    listing = useFetch<{
      workspaces: { id: number; name: string; role: string }[]
    }>('/api/billing/workspaces', {
      key: 'billing-workspaces-' + user.value?.id,
    })
  const { data: list, error: listError } = listing
  const workspaces = computed(() =>
    (list.value?.workspaces ?? []).filter(
      (w) => !adminOnly || w.role === 'admin',
    ),
  )
  const selected = ref(Number(route.query.workspaceId) || 0)
  watch(
    workspaces,
    (available) => {
      if (!list.value) return
      if (!available.some((w) => w.id === selected.value))
        selected.value = available[0]?.id ?? 0
    },
    { immediate: true, flush: 'sync' },
  )
  // Register every composable synchronously while the page owns the Vue scope.
  // Waiting for the workspace list inside the handler also covers SSR cold loads.
  const billing = useAsyncData(
    computed(
      () => 'workspace-billing-' + user.value?.id + '-' + selected.value,
    ),
    async () => {
      await listing
      return selected.value
        ? fetcher<any>('/api/billing/plan', {
            query: { workspaceId: selected.value },
          })
        : null
    },
  )
  onMounted(async () => {
    await listing
    if (!workspaces.value.length && !listError.value) {
      try {
        list.value = await $fetch('/api/billing/workspaces', { method: 'POST' })
      } catch {
        /* Do not restore revoked memberships. */
      }
    }
  })
  return {
    workspaces,
    selected,
    ...billing,
    listError,
    retry: async () => {
      await listing.refresh()
      await nextTick()
      if (!listError.value) await billing.refresh()
    },
    ready: Promise.all([listing, billing]),
  }
}
