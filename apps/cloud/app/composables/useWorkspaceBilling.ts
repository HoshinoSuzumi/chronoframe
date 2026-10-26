export function useWorkspaceBilling(adminOnly = false) {
  const route = useRoute(),
    user = usePortalIdentity(),
    fetcher = useRequestFetch(),
    requested = Number(route.query.workspaceId) || 0,
    selected = ref(requested)
  type Workspace = { id: number; name: string; role: string }
  // A stable payload key covers both steps: the selected workspace is resolved
  // by the server before hydration, rather than changing the async-data key mid-fetch.
  const billing = useAsyncData(
    `workspace-billing-${user.value?.id}-${adminOnly ? 'admin' : 'all'}-${requested}`,
    async () => {
      const list = await fetcher<{ workspaces: Workspace[] }>(
        '/api/billing/workspaces',
      )
      const workspaces = list.workspaces.filter(
        (w) => !adminOnly || w.role === 'admin',
      )
      const id = workspaces.some((w) => w.id === selected.value)
        ? selected.value
        : (workspaces[0]?.id ?? 0)
      const plan = id
        ? await fetcher<any>('/api/billing/plan', {
            query: { workspaceId: id },
          })
        : null
      return {
        workspaces,
        membershipCount: list.workspaces.length,
        selected: id,
        plan,
      }
    },
  )
  watch(
    billing.data,
    (value) => {
      if (value) selected.value = value.selected
    },
    { immediate: true, flush: 'sync' },
  )
  watch(selected, (id) => {
    if (id !== billing.data.value?.selected) void billing.refresh()
  })
  onMounted(async () => {
    await billing
    if (billing.data.value?.membershipCount === 0 && !billing.error.value) {
      try {
        await $fetch('/api/billing/workspaces', { method: 'POST' })
        await billing.refresh()
      } catch {
        /* Do not restore revoked memberships. */
      }
    }
  })
  return {
    workspaces: computed(() => billing.data.value?.workspaces ?? []),
    selected,
    data: computed(() =>
      billing.data.value?.selected === selected.value
        ? billing.data.value.plan
        : null,
    ),
    error: billing.error,
    listError: billing.error,
    status: billing.status,
    refresh: billing.refresh,
    retry: billing.refresh,
    ready: billing,
  }
}
