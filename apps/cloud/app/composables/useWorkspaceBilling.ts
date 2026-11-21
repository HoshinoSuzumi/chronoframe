export function useWorkspaceBilling(adminOnly = false) {
  const user = usePortalIdentity(),
    fetcher = useRequestFetch()
  // The overview has its own loading state. Keep billing off its SSR path,
  // including the sidebar's subscription to the same data.
  const server = useRoute().path.replace(/\/+$/, '') !== '/workspace'
  const key = `workspace-billing-${user.value?.id}`
  const provisioning = useState(`${key}-provisioning`, () => false)
  type Workspace = { id: number; name: string; role: string; owned?: number }
  const billing = useAsyncData(
    key,
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
    { server },
  )
  const permitted = computed(
    () => !adminOnly || billing.data.value?.plan?.workspace.role === 'admin',
  )
  onMounted(() => {
    watch(
      () =>
        billing.status.value === 'success' &&
        billing.data.value?.membershipCount === 0,
      async (empty) => {
        if (!empty || provisioning.value) return
        provisioning.value = true
        try {
          await $fetch('/api/billing/workspaces', { method: 'POST' })
          await billing.refresh()
        } catch {
          /* Do not restore revoked memberships. */
        } finally {
          provisioning.value = false
        }
      },
      { immediate: true },
    )
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
