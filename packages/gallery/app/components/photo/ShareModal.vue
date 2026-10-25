<script lang="ts" setup>
import { isAlbumPagePath } from '@chronoframe/gallery/shared/utils/albumPath'

interface Props {
  isOpen: boolean
  photo: Photo
}

const props = defineProps<Props>()
const emit = defineEmits<{
  close: []
}>()

const linkCopied = ref(false)
const copyingLink = ref(false)
const downloadingOriginal = ref(false)
const downloadingPreview = ref(false)
let copiedTimer: ReturnType<typeof setTimeout> | undefined
const previewVersion = ref(0)

const toast = useToast()
const { gtag } = useGtag()
const { returnRoute } = storeToRefs(useViewerState())

const shareUrl = computed(() => {
  if (typeof window !== 'undefined') {
    if (returnRoute.value && isAlbumPagePath(returnRoute.value)) {
      return `${window.location.origin}${returnRoute.value}?photo=${encodeURIComponent(props.photo.id)}`
    }
    return `${window.location.origin}/${props.photo.id}`
  }
  return ''
})

const shareText = computed(() => {
  const title = props.photo.title || $t('ui.action.share.fallback.photoTitle')
  const description = props.photo.description || ''
  return `${$t('ui.action.share.text.prefix')} ${title}${description ? ' - ' + description : ''}`
})

const shareTextAndUrl = computed(() => {
  return `${shareText.value}\n${shareUrl.value}`
})

// OG Image URL and loading state
const ogImageLoading = ref(true)
const ogImageError = ref(false)
const loadingTimer = ref<NodeJS.Timeout | null>(null)
const ogImageUrl = computed(() => `/_og/r/${props.photo.id}.png`)

// Reset loading state when photo changes or modal opens
const resetLoadingState = () => {
  linkCopied.value = false
  clearTimeout(copiedTimer)
  previewVersion.value++
  ogImageLoading.value = true
  ogImageError.value = false

  // Clear existing timer
  if (loadingTimer.value) {
    clearTimeout(loadingTimer.value)
  }

  // Set a timeout to handle cases where onload/onerror never fires
  loadingTimer.value = setTimeout(() => {
    if (ogImageLoading.value) {
      ogImageLoading.value = false
      ogImageError.value = true
    }
  }, 10000) // 10 second timeout
}

// Reset loading state when photo changes
watch(() => props.photo.id, resetLoadingState)

// Reset loading state when modal opens
watch(
  () => props.isOpen,
  (newValue) => {
    if (newValue) {
      resetLoadingState()
    }
  },
  { immediate: true },
)

// Handle image load events
const handleOgImageLoad = () => {
  if (loadingTimer.value) {
    clearTimeout(loadingTimer.value)
    loadingTimer.value = null
  }
  ogImageLoading.value = false
  ogImageError.value = false
}

const handleOgImageError = () => {
  if (loadingTimer.value) {
    clearTimeout(loadingTimer.value)
    loadingTimer.value = null
  }
  ogImageLoading.value = false
  ogImageError.value = true
}

// Cleanup on unmount
onUnmounted(() => {
  clearTimeout(copiedTimer)
  if (loadingTimer.value) {
    clearTimeout(loadingTimer.value)
  }
})

// Social media share functions
const shareToTwitter = () => {
  // Track Twitter share event in Google Analytics
  gtag('event', 'photo_share', {
    photo_id: props.photo.id,
    photo_title: props.photo.title || 'Untitled',
    share_method: 'twitter',
  })

  const text = encodeURIComponent(shareText.value)
  const url = encodeURIComponent(shareUrl.value)
  window.open(
    `https://twitter.com/intent/tweet?text=${text}&url=${url}`,
    '_blank',
  )
}

const shareToTelegram = () => {
  // Track Telegram share event in Google Analytics
  gtag('event', 'photo_share', {
    photo_id: props.photo.id,
    photo_title: props.photo.title || 'Untitled',
    share_method: 'telegram',
  })

  window.open(
    `https://t.me/share/url?url=${encodeURIComponent(shareUrl.value)}&text=${encodeURIComponent(shareText.value)}`,
    '_blank',
  )
}

const shareToWeibo = () => {
  // Track Weibo share event in Google Analytics
  gtag('event', 'photo_share', {
    photo_id: props.photo.id,
    photo_title: props.photo.title || 'Untitled',
    share_method: 'weibo',
  })

  const text = encodeURIComponent(shareText.value)
  const url = encodeURIComponent(shareUrl.value)
  window.open(
    `https://service.weibo.com/share/share.php?url=${url}&title=${text}`,
    '_blank',
  )
}

const shareToFacebook = () => {
  // Track Facebook share event in Google Analytics
  gtag('event', 'photo_share', {
    photo_id: props.photo.id,
    photo_title: props.photo.title || 'Untitled',
    share_method: 'facebook',
  })

  const url = encodeURIComponent(shareUrl.value)
  window.open(`https://www.facebook.com/sharer/sharer.php?u=${url}`, '_blank')
}

const shareToWhatsApp = () => {
  // Track WhatsApp share event in Google Analytics
  gtag('event', 'photo_share', {
    photo_id: props.photo.id,
    photo_title: props.photo.title || 'Untitled',
    share_method: 'whatsapp',
  })

  const text = encodeURIComponent(`${shareText.value}\n${shareUrl.value}`)
  window.open(`https://wa.me/?text=${text}`, '_blank')
}

const shareToLinkedIn = () => {
  // Track LinkedIn share event in Google Analytics
  gtag('event', 'photo_share', {
    photo_id: props.photo.id,
    photo_title: props.photo.title || 'Untitled',
    share_method: 'linkedin',
  })

  const url = encodeURIComponent(shareUrl.value)
  const title = encodeURIComponent(shareText.value)
  window.open(
    `https://www.linkedin.com/sharing/share-offsite/?url=${url}&title=${title}`,
    '_blank',
  )
}

// Copy functions
const copyLink = async () => {
  if (copyingLink.value) return
  copyingLink.value = true
  try {
    await navigator.clipboard.writeText(shareTextAndUrl.value)
    linkCopied.value = true
    clearTimeout(copiedTimer)
    copiedTimer = setTimeout(() => {
      linkCopied.value = false
    }, 2500)
    toast.add({
      title: $t('ui.action.share.success.linkCopied'),
      color: 'success',
      icon: 'tabler:check',
      duration: 3000,
    })
  } catch (error) {
    toast.add({
      title: $t('ui.action.share.error.linkCopyFailed'),
      description: (error as Error)?.message || $t('common.unknownError'),
      color: 'error',
      icon: 'tabler:x',
      duration: 3000,
    })
  } finally {
    copyingLink.value = false
  }
}

// Native share (for mobile devices)
const nativeShare = async () => {
  if (navigator.share) {
    try {
      // Track native share event in Google Analytics
      gtag('event', 'photo_share', {
        photo_id: props.photo.id,
        photo_title: props.photo.title || 'Untitled',
        share_method: 'native_share',
      })

      await navigator.share({
        title: shareText.value,
        url: shareUrl.value,
      })
    } catch (error) {
      console.error($t('ui.action.share.error.nativeShareFailed'), error)
    }
  }
}

// Download OG Image
const downloadOgImage = async () => {
  if (downloadingPreview.value) return
  downloadingPreview.value = true
  try {
    const response = await fetch(ogImageUrl.value)
    if (!response.ok) throw new Error(`HTTP ${response.status}`)
    const blob = await response.blob()
    const url = window.URL.createObjectURL(blob)
    const link = document.createElement('a')
    link.href = url
    link.download = `${props.photo.title || 'photo'}-og.png`
    document.body.appendChild(link)
    link.click()
    document.body.removeChild(link)
    window.URL.revokeObjectURL(url)

    toast.add({
      title: $t('ui.action.share.success.ogImageDownloaded'),
      color: 'success',
      icon: 'tabler:download',
      duration: 3000,
    })
  } catch (error) {
    toast.add({
      title: $t('ui.action.share.error.ogImageDownloadFailed'),
      description: (error as Error)?.message || $t('common.unknownError'),
      color: 'error',
      icon: 'tabler:x',
      duration: 3000,
    })
  } finally {
    downloadingPreview.value = false
  }
}

const downloadOriginalImage = async () => {
  if (downloadingOriginal.value || !props.photo.originalUrl) return
  downloadingOriginal.value = true
  try {
    const source = props.photo.downloadUrl || props.photo.originalUrl!
    const response = await fetch(source)
    if (!response.ok) throw new Error(`HTTP ${response.status}`)
    const blob = await response.blob()
    const url = window.URL.createObjectURL(blob)
    const link = document.createElement('a')
    link.href = url
    const mimeType = blob.type.toLowerCase()
    const extensionByMime: Record<string, string> = {
      'image/jpeg': 'jpg',
      'image/png': 'png',
      'image/webp': 'webp',
      'image/gif': 'gif',
      'image/avif': 'avif',
      'image/heic': 'heic',
      'image/heif': 'heif',
      'image/bmp': 'bmp',
      'image/tiff': 'tiff',
    }
    const extension =
      extensionByMime[mimeType] ||
      props.photo.originalUrl!.split('.').pop() ||
      'jpg'
    link.download = `${props.photo.title || 'photo'}.${extension}`
    document.body.appendChild(link)
    link.click()
    document.body.removeChild(link)
    window.URL.revokeObjectURL(url)

    // Track download event in Google Analytics
    gtag('event', 'photo_download', {
      photo_id: props.photo.id,
      photo_title: props.photo.title || 'Untitled',
      download_type: 'original',
    })

    toast.add({
      title: $t('ui.action.share.success.originalImageDownloaded'),
      color: 'success',
      icon: 'tabler:download',
      duration: 3000,
    })
  } catch (error) {
    toast.add({
      title: $t('ui.action.share.error.originalImageDownloadFailed'),
      description: (error as Error)?.message || $t('common.unknownError'),
      color: 'error',
      icon: 'tabler:x',
      duration: 3000,
    })
  } finally {
    downloadingOriginal.value = false
  }
}

// Check if native share is available
const canNativeShare = computed(() => {
  return typeof window !== 'undefined' && navigator.share
})

// Social media platforms data
const socialPlatforms = computed(() => [
  {
    name: $t('ui.action.share.platforms.twitter'),
    icon: 'tabler:brand-twitter',
    color: 'text-blue-500',
    action: shareToTwitter,
  },
  {
    name: $t('ui.action.share.platforms.telegram'),
    icon: 'tabler:brand-telegram',
    color: 'text-blue-400',
    action: shareToTelegram,
  },
  {
    name: $t('ui.action.share.platforms.weibo'),
    icon: 'tabler:brand-weibo',
    color: 'text-red-500',
    action: shareToWeibo,
  },
  {
    name: $t('ui.action.share.platforms.facebook'),
    icon: 'tabler:brand-facebook',
    color: 'text-blue-600',
    action: shareToFacebook,
  },
  {
    name: $t('ui.action.share.platforms.whatsapp'),
    icon: 'tabler:brand-whatsapp',
    color: 'text-green-500',
    action: shareToWhatsApp,
  },
  {
    name: $t('ui.action.share.platforms.linkedin'),
    icon: 'tabler:brand-linkedin',
    color: 'text-blue-700',
    action: shareToLinkedIn,
  },
])
</script>

<template>
  <UModal
    :open="isOpen"
    :content="{
      onEscapeKeyDown: (event: KeyboardEvent) => event.stopPropagation(),
    }"
    :title="$t('ui.action.share.title')"
    :description="photo.title || $t('ui.action.share.fallback.photoTitle')"
    :ui="{
      overlay: 'z-[60] bg-black/50 backdrop-blur-sm',
      content:
        'z-[60] max-w-md divide-y-0 rounded-2xl bg-white/95 dark:bg-neutral-900/95 ring-black/10 dark:ring-white/10 shadow-xl',
      header: 'min-h-0 px-4 pt-4 pb-2 sm:px-4 sm:pt-4 sm:pb-2 border-0',
      body: 'px-4 pt-2 pb-4 sm:px-4 sm:pt-2 sm:pb-4 overflow-y-auto',
      wrapper: 'min-w-0 flex-1',
      close: 'static shrink-0',
      description: 'sr-only',
    }"
    @update:open="
      (open) => {
        if (!open) emit('close')
      }
    "
  >
    <template #close>
      <UButton
        icon="tabler:x"
        color="neutral"
        variant="ghost"
        class="shrink-0"
        :aria-label="$t('ui.action.share.actions.close')"
      />
    </template>
    <template #body>
      <div class="space-y-4">
        <section :aria-label="$t('ui.action.share.ogImage.title')">
          <div
            class="relative aspect-2/1 overflow-hidden rounded-xl bg-neutral-100 dark:bg-neutral-800"
          >
            <img
              :key="`${photo.id}-${previewVersion}`"
              :src="ogImageUrl"
              :alt="$t('ui.action.share.ogImage.alt')"
              class="size-full object-cover"
              :class="{ 'opacity-0': ogImageLoading || ogImageError }"
              @load="handleOgImageLoad"
              @error="handleOgImageError"
            />
            <div
              v-if="ogImageLoading || ogImageError"
              class="absolute inset-0 flex flex-col items-center justify-center gap-2 text-neutral-500 dark:text-neutral-400"
              role="status"
            >
              <Icon
                :name="ogImageError ? 'tabler:photo-off' : 'tabler:loader-2'"
                class="size-6"
                :class="{ 'animate-spin': !ogImageError }"
              />
              <span class="text-sm">{{
                $t(
                  ogImageError
                    ? 'ui.action.share.ogImage.loadError'
                    : 'ui.action.share.ogImage.loading',
                )
              }}</span>
              <UButton
                v-if="ogImageError"
                size="sm"
                color="neutral"
                variant="ghost"
                icon="tabler:refresh"
                @click="resetLoadingState"
              >
                {{ $t('ui.action.share.actions.retry') }}
              </UButton>
            </div>
          </div>
        </section>

        <section class="space-y-3">
          <label
            for="photo-share-url"
            class="block text-xs font-medium text-neutral-500 dark:text-neutral-400"
            >{{ $t('ui.action.share.actions.shareUrl') }}</label
          >
          <div
            class="overflow-hidden rounded-xl border border-black/10 bg-neutral-100/70 dark:border-white/10 dark:bg-neutral-800/50"
          >
            <div
              class="flex items-center gap-2 border-b border-black/5 bg-white/80 p-2 dark:border-white/10 dark:bg-neutral-800"
            >
              <input
                id="photo-share-url"
                :value="shareUrl"
                readonly
                class="min-w-0 flex-1 rounded px-1 py-1 text-sm text-neutral-600 outline-none focus-visible:ring-2 focus-visible:ring-primary dark:text-neutral-300"
              />
              <UButton
                size="sm"
                color="neutral"
                variant="soft"
                class="shrink-0"
                :icon="linkCopied ? 'tabler:check' : 'tabler:copy'"
                :loading="copyingLink"
                @click="copyLink"
              >
                {{
                  $t(
                    linkCopied
                      ? 'ui.action.share.actions.copied'
                      : 'ui.action.share.actions.copyLink',
                  )
                }}
              </UButton>
            </div>
            <div
              class="grid p-1.5 [&>div+div]:relative [&>div+div]:before:absolute [&>div+div]:before:inset-y-2 [&>div+div]:before:left-0 [&>div+div]:before:w-px [&>div+div]:before:bg-black/8 dark:[&>div+div]:before:bg-white/10"
              :class="canNativeShare ? 'grid-cols-3' : 'grid-cols-2'"
            >
              <div
                v-if="canNativeShare"
                class="min-w-0"
              >
                <UTooltip
                  :text="$t('ui.action.share.actions.nativeShare')"
                  :ui="{ content: 'z-[80]' }"
                >
                  <UButton
                    :aria-label="$t('ui.action.share.actions.nativeShare')"
                    block
                    size="sm"
                    class="min-w-0 justify-center gap-1 px-1 py-2 text-xs"
                    :ui="{ leadingIcon: 'size-3.5' }"
                    color="neutral"
                    variant="ghost"
                    icon="tabler:share-2"
                    @click="nativeShare"
                  >
                    {{ $t('ui.action.share.actions.nativeShareShort') }}
                  </UButton>
                </UTooltip>
              </div>
              <div class="min-w-0">
                <UTooltip
                  :text="$t('ui.action.share.actions.downloadOriginalImage')"
                  :ui="{ content: 'z-[80]' }"
                >
                  <UButton
                    :aria-label="
                      $t('ui.action.share.actions.downloadOriginalImage')
                    "
                    block
                    size="sm"
                    class="min-w-0 justify-center gap-1 px-1 py-2 text-xs"
                    :ui="{ leadingIcon: 'size-3.5' }"
                    color="neutral"
                    variant="ghost"
                    icon="tabler:download"
                    :loading="downloadingOriginal"
                    :disabled="!photo.originalUrl"
                    @click="downloadOriginalImage"
                  >
                    {{ $t('ui.action.share.actions.originalShort') }}
                  </UButton>
                </UTooltip>
              </div>
              <div class="min-w-0">
                <UTooltip
                  :text="$t('ui.action.share.actions.downloadOgImage')"
                  :ui="{ content: 'z-[80]' }"
                >
                  <UButton
                    :aria-label="$t('ui.action.share.actions.downloadOgImage')"
                    block
                    size="sm"
                    class="min-w-0 justify-center gap-1 px-1 py-2 text-xs"
                    :ui="{ leadingIcon: 'size-3.5' }"
                    color="neutral"
                    variant="ghost"
                    icon="tabler:photo-down"
                    :loading="downloadingPreview"
                    :disabled="ogImageLoading || ogImageError"
                    @click="downloadOgImage"
                  >
                    {{ $t('ui.action.share.actions.shareCardShort') }}
                  </UButton>
                </UTooltip>
              </div>
            </div>
          </div>
        </section>

        <section
          class="border-t border-black/5 pt-4 dark:border-white/10"
          :aria-label="$t('ui.action.share.actions.otherPlatforms')"
        >
          <p
            class="mb-3 text-xs font-medium text-neutral-500 dark:text-neutral-400"
          >
            {{ $t('ui.action.share.actions.otherPlatforms') }}
          </p>
          <div class="grid grid-cols-3 gap-2.5">
            <button
              v-for="platform in socialPlatforms"
              :key="platform.name"
              type="button"
              class="flex min-h-18 cursor-pointer flex-col items-center justify-center gap-2 rounded-xl border border-neutral-200/70 bg-white px-2 py-3 transition-colors hover:border-neutral-300 hover:bg-neutral-50 focus-visible:outline-2 focus-visible:outline-primary dark:border-neutral-700/70 dark:bg-neutral-800/70 dark:hover:border-neutral-600 dark:hover:bg-neutral-800"
              @click="platform.action"
            >
              <Icon
                :name="platform.icon"
                class="size-5"
                :class="platform.color"
              />
              <span
                class="text-xs font-medium text-neutral-600 dark:text-neutral-300"
                >{{ platform.name }}</span
              >
            </button>
          </div>
        </section>
      </div>
    </template>
  </UModal>
</template>
