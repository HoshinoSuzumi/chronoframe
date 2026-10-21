type MapSetupNoticeState = {
  open: boolean
  dismissedPath: string
}

export function useMapSetupNotice() {
  const route = useRoute()
  const { user } = useUserSession()
  const state = useState<MapSetupNoticeState>('map-setup-notice', () => ({
    open: false,
    dismissedPath: '',
  }))

  const isAdmin = computed(() => Boolean(user.value?.isAdmin))

  const isOpen = computed({
    get: () => state.value.open,
    set: (value: boolean) => {
      if (value) {
        state.value.open = true
        return
      }
      if (!state.value.open) return
      state.value.open = false
      state.value.dismissedPath = route.fullPath
    },
  })

  function show() {
    if (state.value.dismissedPath === route.fullPath) return
    state.value.open = true
  }

  function hide() {
    state.value.open = false
    state.value.dismissedPath = ''
  }

  function dismiss() {
    isOpen.value = false
  }

  return { isOpen, isAdmin, show, hide, dismiss }
}
