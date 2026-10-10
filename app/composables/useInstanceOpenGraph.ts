import type { ComputedRef } from 'vue'

/**
 * Share metadata for this ChronoFrame instance.
 *
 * The instance name is the share title and the slogan (the line under the
 * title on the homepage) is the description. The generated image uses the
 * instance avatar. Photo pages keep their own title, description, and image.
 */
export async function useInstanceOpenGraph(photos: ComputedRef<Photo[]>) {
  const route = useRoute()
  const nuxtApp = useNuxtApp()
  const requestURL = useRequestURL()
  const { loggedIn } = useUserSession()
  const i18n = useShareI18n()

  const appTitle = useSettingRef('app:title')
  const appSlogan = useSettingRef('app:slogan')
  const appAuthor = useSettingRef('app:author')
  const appAvatar = useSettingRef('app:avatarUrl')

  const siteName = computed(
    () => cleanShareText(appTitle.value, 80) || 'ChronoFrame',
  )
  const slogan = computed(() => cleanShareText(appSlogan.value, 200))
  const author = computed(() => cleanShareText(appAuthor.value, 80))
  const avatarUrl = computed(() => resolveShareAvatar(appAvatar.value))

  const photoId = computed(() => {
    const slug = route.params.slug
    if (Array.isArray(slug)) return slug[0] || null
    if (typeof slug === 'string' && slug.length > 0) return slug
    return null
  })
  const currentPhoto = computed(() =>
    photoId.value
      ? photos.value.find((photo) => photo.id === photoId.value)
      : undefined,
  )
  const isHome = computed(() => route.path === '/')

  // Logged-in visitors load every photo, including hidden ones. The public
  // preview must keep using the anonymous collection.
  const publicPhotoRequest = useFetch<Photo[]>('/api/photos/visible', {
    key: 'og-public-photos',
    immediate: loggedIn.value && isHome.value,
  })
  const { data: publicPhotos, execute: loadPublicPhotos } = publicPhotoRequest

  const previewPhotos = computed(() => {
    if (!isHome.value) return []
    if (loggedIn.value) return publicPhotos.value || []
    return photos.value
  })

  const shareTitle = computed(() => {
    if (!photoId.value) return siteName.value
    return (
      cleanShareText(currentPhoto.value?.title, 80) ||
      translate(i18n, 'title.fallback.photo', 'Photo')
    )
  })
  const shareDescription = computed(() => {
    const instanceDescription = slogan.value || author.value
    if (!photoId.value) return instanceDescription || undefined
    return (
      cleanShareText(currentPhoto.value?.description, 200) ||
      instanceDescription ||
      undefined
    )
  })
  const canonicalUrl = computed(
    () => new URL(route.path, requestURL.origin).href,
  )

  useSeoMeta({
    description: shareDescription,
    ogType: () => (photoId.value ? 'article' : 'website'),
    ogSiteName: siteName,
    ogTitle: shareTitle,
    ogDescription: shareDescription,
    ogUrl: canonicalUrl,
    twitterCard: 'summary_large_image',
    twitterTitle: shareTitle,
    twitterDescription: shareDescription,
  })

  watch([isHome, loggedIn], ([home, authed]) => {
    if (home && authed && !publicPhotos.value) void loadPublicPhotos()
  })

  function updateOgImage() {
    const id = photoId.value
    nuxtApp.runWithContext(() => {
      if (id) {
        defineOgImage(
          'Photo',
          {
            photo:
              currentPhoto.value?.id === id ? currentPhoto.value : undefined,
            appTitle: siteName.value,
          },
          { alt: shareTitle.value },
        )
        return
      }

      const visiblePhotos = previewPhotos.value
      // A signed-in homepage has no public list until that request resolves.
      // An empty array is a real zero; null means the count is still unknown.
      const publicPhotoCountPending =
        isHome.value && loggedIn.value && publicPhotos.value == null
      defineOgImage(
        'Home',
        {
          appTitle: siteName.value,
          slogan: slogan.value,
          author: author.value,
          avatarUrl: avatarUrl.value,
          ...(publicPhotoCountPending
            ? {}
            : {
                photoCount: isHome.value ? visiblePhotos.length : undefined,
                photoCountLabel: isHome.value
                  ? photoCountLabel(i18n, visiblePhotos.length)
                  : '',
              }),
          thumbnails: visiblePhotos
            .map((photo) => photo.thumbnailUrl)
            .filter((url): url is string => Boolean(url))
            .slice(0, 3),
        },
        { alt: siteName.value },
      )
    })
  }

  watch(
    [
      photoId,
      currentPhoto,
      previewPhotos,
      isHome,
      siteName,
      slogan,
      author,
      avatarUrl,
      shareTitle,
      () => i18n?.locale.value,
    ],
    updateOgImage,
  )
  // nuxt-og-image skips client updates during hydration.
  onMounted(updateOgImage)

  await publicPhotoRequest
  updateOgImage()
}

function useShareI18n() {
  try {
    return useI18n()
  } catch {
    return null
  }
}

function translate(
  i18n: ReturnType<typeof useShareI18n>,
  key: string,
  fallback: string,
) {
  return i18n?.t(key) || fallback
}

function photoCountLabel(i18n: ReturnType<typeof useShareI18n>, count: number) {
  if (!i18n) return count === 1 ? '1 photo' : `${count} photos`
  return i18n.t('plural.photo', { count }, count)
}
