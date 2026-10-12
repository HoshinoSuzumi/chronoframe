export function useHomeView() {
  const preference = useSettingRef('app:homeView')
  const homeView = computed(() =>
    preference.value === 'albums' ? 'albums' : 'photos',
  )

  return {
    homeView,
    photoWallPath: computed(() =>
      homeView.value === 'albums' ? '/photos' : '/',
    ),
    albumListPath: computed(() =>
      homeView.value === 'albums' ? '/' : '/albums',
    ),
  }
}
