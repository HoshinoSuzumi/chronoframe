import type { ComputedRef } from 'vue'
import { defaultLocationFallback } from '@chronoframe/gallery/shared/utils/location'

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
  const entryContext = useEntryContext()
  const { loggedIn } = useUserSession()
  const i18n = useShareI18n()

  const appTitle = useSettingRef('app:title')
  const appSlogan = useSettingRef('app:slogan')
  const appAuthor = useSettingRef('app:author')
  const appAvatar = useSettingRef('app:avatarUrl')
  const locationPreferredLevel = useSettingRef('location:preferredLevel')
  const locationFallbackOrder = useSettingRef('location:fallbackOrder')
  const { homeView } = useHomeView()

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
  const isHome = computed(() => route.path === '/' || route.path === '/photos')

  // Logged-in visitors load every photo, including hidden ones. The public
  // preview must keep using the anonymous collection.
  const publicPhotoRequest = useGalleryFetch<Photo[]>('/api/photos/visible', {
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
  const canonicalUrl = computed(() => {
    const path =
      (homeView.value === 'albums' && route.path === '/albums') ||
      (homeView.value === 'photos' && route.path === '/photos')
        ? '/'
        : route.path
    return new URL(
      path,
      entryContext.value?.canonicalOrigin ?? requestURL.origin,
    ).href
  })

  useHead({ link: [{ rel: 'canonical', href: canonicalUrl }] })

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
            locationPreferredLevel: String(
              locationPreferredLevel.value || 'city',
            ),
            locationFallbackOrder: String(
              locationFallbackOrder.value || defaultLocationFallback,
            ),
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
      locationPreferredLevel,
      locationFallbackOrder,
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
