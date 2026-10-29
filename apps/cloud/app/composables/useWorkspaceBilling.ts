export function useWorkspaceBilling(adminOnly = false) {
  const user = usePortalIdentity(),
    fetcher = useRequestFetch()
  type Workspace = { id: number; name: string; role: string; owned?: number }
  const billing = useAsyncData(
    `workspace-billing-${user.value?.id}`,
    async () => {
      const list = await fetcher<{ workspaces: Workspace[] }>(
        '/api/billing/workspaces',
        { timeout: 15000 },
      )
      const primary =
        list.workspaces.find((w) => w.owned) ??
        list.workspaces.find((w) => w.role === 'admin') ??
        list.workspaces[0]
      const id = primary?.id ?? 0
      const plan = id
        ? await fetcher<any>('/api/billing/plan', {
            query: { workspaceId: id },
            timeout: 15000,
          })
        : null
      return {
        workspaces: primary ? [primary] : [],
        membershipCount: list.workspaces.length,
        selected: id,
        plan,
      }
    },
  )
  const permitted = computed(
    () => !adminOnly || billing.data.value?.plan?.workspace.role === 'admin',
  )
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
    workspaces: computed(() =>
      permitted.value ? (billing.data.value?.workspaces ?? []) : [],
    ),
    selected: computed(() =>
      permitted.value ? (billing.data.value?.selected ?? 0) : 0,
    ),
    data: computed(() => (permitted.value ? billing.data.value?.plan : null)),
    error: billing.error,
    listError: billing.error,
    status: billing.status,
    refresh: billing.refresh,
    retry: billing.refresh,
    ready: billing,
  }
}
