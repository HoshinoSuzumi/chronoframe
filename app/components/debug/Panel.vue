<script setup lang="ts">
import FloatingWindow from '~/components/ui/FloatingWindow/FloatingWindow.vue'
const store = useDebugStore()
const route = useRoute()
const colorMode = useColorMode()
const { locale } = useI18n()
store.initialize()
const available = import.meta.dev
const open = useDebugValue<boolean>('ui:open', false)
const viewport = ref({ width: 1, height: 1 })
const launcher = reactive({ x: 0, y: 0 })
const preferredLauncher = reactive({ x: 0, y: 0 })
const launcherDragging = ref(false)
const ogImageUrl = ref('')
const ogImageLoading = ref(false)
const ogImageError = ref(false)
let headObserver: MutationObserver | undefined
let headFrame: number | undefined
let ogRequest: AbortController | undefined
let routeOgMetadata = false
function readOgImage(head: ParentNode = document.head) {
  const content = head
    .querySelector<HTMLMetaElement>(
      'meta[property="og:image"], meta[name="og:image"], meta[property="og:image:url"]',
    )
    ?.content?.trim()
  let next = ''
  if (content) {
    try {
      const url = new URL(content, document.baseURI)
      if (url.protocol === 'http:' || url.protocol === 'https:') next = url.href
    } catch {
      /* Ignore malformed page metadata. */
    }
  }
  if (next !== ogImageUrl.value) {
    ogImageUrl.value = next
    ogImageLoading.value = Boolean(next)
    ogImageError.value = false
  }
}
async function refreshRouteOgImage() {
  ogRequest?.abort()
  const request = new AbortController()
  ogRequest = request
  // Reused page instances can retain their initial OG tags. Read the same
  // server-rendered metadata that a social crawler sees for the current URL.
  routeOgMetadata = true
  ogImageUrl.value = ''
  ogImageLoading.value = false
  ogImageError.value = false
  try {
    const response = await fetch(
      new URL(route.fullPath, window.location.origin),
      {
        signal: request.signal,
        headers: { Accept: 'text/html' },
      },
    )
    if (!response.ok) return
    const html = await response.text()
    if (request.signal.aborted || ogRequest !== request) return
    readOgImage(new DOMParser().parseFromString(html, 'text/html').head)
  } catch {
    // Keep the preview empty when the current page cannot be resolved.
  }
}
watch(
  () => route.fullPath,
  () => {
    if (import.meta.client) void refreshRouteOgImage()
  },
  { flush: 'post' },
)
function handleOgImageError() {
  ogImageLoading.value = false
  ogImageError.value = true
}
function scheduleOgImageRead() {
  if (headFrame !== undefined) cancelAnimationFrame(headFrame)
  headFrame = requestAnimationFrame(() => {
    headFrame = undefined
    if (!routeOgMetadata) readOgImage()
  })
}
const launcherSize = 40
const windowCreated = ref(false)
const launcherReady = ref(false)
const initialWindow = computed(() => {
  const margin = 24
  const width = Math.max(1, Math.min(400, viewport.value.width - margin * 2))
  const height = Math.max(1, Math.min(520, viewport.value.height - margin * 2))
  return {
    width,
    height,
    x: Math.max(
      margin,
      Math.min(launcher.x, viewport.value.width - width - margin),
    ),
    y: Math.max(
      margin,
      Math.min(launcher.y, viewport.value.height - height - margin),
    ),
  }
})
watch(open, (value) => {
  if (value && launcherReady.value) windowCreated.value = true
})
const sections = computed(() =>
  Object.values(store.sections).filter(
    (section) => section.route === route.path && section.active !== false,
  ),
)
const globalControls = computed(() => [
  {
    key: 'global:outline',
    type: 'switch' as const,
    label: $t('debug.outline'),
    default: false,
  },
])
watchEffect(() => {
  if (import.meta.client)
    document.documentElement.classList.toggle(
      'debug-outline',
      available && store.get('global:outline', false),
    )
})
watch(
  () => route.query.queueDebug,
  (value) => {
    if (value === '1') {
      store.set('dashboard:queue:enabled', true)
      open.value = true
    }
  },
  { immediate: true },
)
watch(
  () => route.query.debug,
  (value) => {
    if (value === '1') open.value = true
  },
  { immediate: true },
)
function persistLauncher() {
  store.set('ui:launcherX', launcher.x)
  store.set('ui:launcherY', launcher.y)
}
function snap(commit = false) {
  const margin = 24
  const right = Math.max(margin, viewport.value.width - launcherSize - margin)
  const bottom = Math.max(margin, viewport.value.height - launcherSize - margin)
  launcher.x = Math.max(
    margin,
    Math.min(right, commit ? launcher.x : preferredLauncher.x),
  )
  launcher.y = Math.max(
    margin,
    Math.min(bottom, commit ? launcher.y : preferredLauncher.y),
  )
  const distances = [
    launcher.x - margin,
    right - launcher.x,
    launcher.y - margin,
    bottom - launcher.y,
  ]
  const nearest = distances.indexOf(Math.min(...distances))
  if (nearest === 0) launcher.x = margin
  if (nearest === 1) launcher.x = right
  if (nearest === 2) launcher.y = margin
  if (nearest === 3) launcher.y = bottom
  if (launcher.x - margin < 40) launcher.x = margin
  else if (right - launcher.x < 40) launcher.x = right
  if (launcher.y - margin < 40) launcher.y = margin
  else if (bottom - launcher.y < 40) launcher.y = bottom
  if (commit) {
    Object.assign(preferredLauncher, launcher)
    persistLauncher()
  }
}
function resizeViewport() {
  viewport.value = { width: window.innerWidth, height: window.innerHeight }
  snap()
}
let dragged = false
let cleanupDrag: (() => void) | undefined
function drag(event: PointerEvent) {
  if (event.button !== 0) return
  cleanupDrag?.()
  launcherDragging.value = true
  dragged = false
  const target = event.currentTarget as HTMLElement
  target.setPointerCapture(event.pointerId)
  const initial = { ...launcher },
    x = event.clientX,
    y = event.clientY
  const move = (e: PointerEvent) => {
    if (e.pointerId !== event.pointerId) return
    const dx = e.clientX - x,
      dy = e.clientY - y
    if (Math.hypot(dx, dy) > 4) dragged = true
    if (!dragged) return
    launcher.x = Math.max(
      0,
      Math.min(viewport.value.width - launcherSize, initial.x + dx),
    )
    launcher.y = Math.max(
      0,
      Math.min(viewport.value.height - launcherSize, initial.y + dy),
    )
  }
  const stop = () => {
    target.removeEventListener('pointermove', move)
    target.removeEventListener('pointerup', stop)
    target.removeEventListener('pointercancel', stop)
    target.removeEventListener('lostpointercapture', stop)
    if (target.hasPointerCapture(event.pointerId))
      target.releasePointerCapture(event.pointerId)
    cleanupDrag = undefined
    launcherDragging.value = false
    snap(dragged)
  }
  target.addEventListener('pointermove', move)
  target.addEventListener('pointerup', stop)
  target.addEventListener('pointercancel', stop)
  target.addEventListener('lostpointercapture', stop)
  cleanupDrag = stop
}
function openWindow(event: MouseEvent) {
  if (!dragged || event.detail === 0) open.value = true
}
function reset() {
  store.reset()
}
function reload() {
  window.location.reload()
}
function refreshPage() {
  refreshNuxtData()
}
onMounted(() => {
  readOgImage()
  headObserver = new MutationObserver(scheduleOgImageRead)
  headObserver.observe(document.head, {
    childList: true,
    subtree: true,
    attributes: true,
    attributeFilter: ['content', 'property', 'name'],
  })
  viewport.value = { width: window.innerWidth, height: window.innerHeight }
  preferredLauncher.x = store.get(
    'ui:launcherX',
    viewport.value.width - launcherSize - 16,
  )
  preferredLauncher.y = store.get(
    'ui:launcherY',
    Math.round(viewport.value.height * 0.7),
  )
  snap()
  launcherReady.value = true
  windowCreated.value = open.value
  window.addEventListener('resize', resizeViewport)
})
onBeforeUnmount(() => {
  ogRequest?.abort()
  headObserver?.disconnect()
  if (headFrame !== undefined) cancelAnimationFrame(headFrame)
  cleanupDrag?.()
  window.removeEventListener('resize', resizeViewport)
  document.documentElement.classList.remove('debug-outline')
})
</script>

<template>
  <template v-if="available">
    <Teleport to="body">
      <button
        v-if="!open"
        type="button"
        :aria-label="$t('debug.open')"
        :title="$t('debug.open')"
        class="debug-launcher fixed z-[10000] flex size-10 touch-none select-none items-center justify-center rounded-full border border-default bg-default text-muted shadow-lg hover:text-primary focus-visible:outline-2 focus-visible:outline-primary"
        :class="{ 'is-dragging': launcherDragging }"
        :style="{ left: launcher.x + 'px', top: launcher.y + 'px' }"
        @pointerdown="drag"
        @click="openWindow"
      >
        <UIcon
          name="tabler:bug"
          class="size-6"
        />
      </button>
    </Teleport>
    <FloatingWindow
      v-if="windowCreated"
      id="global-debug"
      v-model="open"
      :title="$t('debug.title')"
      :allow-overflow="false"
      :min-width="Math.min(320, initialWindow.width)"
      :min-height="Math.min(260, initialWindow.height)"
      :initial-width="initialWindow.width"
      :initial-height="initialWindow.height"
      :initial-x="initialWindow.x"
      :initial-y="initialWindow.y"
    >
      <div class="space-y-4 p-4">
        <section>
          <h3 class="mb-2 text-xs font-semibold">{{ $t('debug.info') }}</h3>
          <dl
            class="grid grid-cols-[auto_minmax(0,1fr)] gap-x-4 gap-y-1.5 rounded-lg bg-elevated/50 p-3 text-xs"
          >
            <dt class="text-muted">{{ $t('debug.route') }}</dt>
            <dd class="break-all font-mono">{{ route.fullPath }}</dd>
            <dt class="text-muted">{{ $t('debug.version') }}</dt>
            <dd>{{ $config.public.VERSION }}</dd>
            <dt class="text-muted">{{ $t('debug.viewport') }}</dt>
            <dd class="tabular-nums">
              {{ viewport.width }} × {{ viewport.height }}
            </dd>
            <dt class="text-muted">{{ $t('debug.locale') }}</dt>
            <dd>{{ locale }}</dd>
            <dt class="text-muted">{{ $t('debug.theme') }}</dt>
            <dd>{{ colorMode.value }}</dd>
          </dl>
          <div
            v-if="ogImageUrl"
            class="mt-3 space-y-2"
          >
            <div class="flex items-center justify-between gap-2">
              <span class="text-xs text-muted">{{ $t('debug.ogImage') }}</span>
              <a
                :href="ogImageUrl"
                target="_blank"
                rel="noopener noreferrer"
                class="text-xs text-muted hover:text-primary"
                :aria-label="$t('debug.openOgImage')"
              >
                <UIcon
                  name="tabler:external-link"
                  class="size-4"
                />
              </a>
            </div>
            <div
              class="relative aspect-[2/1] overflow-hidden rounded-lg bg-elevated/50"
            >
              <img
                :key="ogImageUrl"
                :src="ogImageUrl"
                :alt="$t('debug.ogImage')"
                class="absolute inset-0 block h-full w-full object-cover"
                :class="{ hidden: ogImageError }"
                @load="ogImageLoading = false"
                @error="handleOgImageError"
              />
              <div
                v-if="ogImageLoading"
                class="absolute inset-0 flex items-center justify-center bg-elevated/50 py-6"
              >
                <UIcon
                  name="tabler:loader-2"
                  class="size-5 animate-spin text-muted"
                />
              </div>
              <p
                v-if="ogImageError"
                class="absolute inset-0 flex items-center justify-center px-3 text-center text-xs text-muted"
              >
                {{ $t('debug.ogImageError') }}
              </p>
            </div>
          </div>
        </section>
        <section class="border-t border-default pt-3">
          <h3 class="text-xs font-semibold">{{ $t('debug.general') }}</h3>
          <DebugControl
            v-for="control in globalControls"
            :key="control.key"
            :control="control"
          />
          <div class="mt-2 flex flex-wrap gap-2">
            <UButton
              size="xs"
              variant="soft"
              color="neutral"
              icon="tabler:refresh"
              @click="refreshPage"
              >{{ $t('debug.refresh') }}</UButton
            >
            <UButton
              size="xs"
              variant="soft"
              color="neutral"
              @click="reload"
              >{{ $t('debug.reload') }}</UButton
            >
            <UButton
              size="xs"
              variant="ghost"
              color="neutral"
              @click="reset"
              >{{ $t('debug.reset') }}</UButton
            >
          </div>
        </section>
        <section class="border-t border-default pt-3">
          <h3 class="mb-2 text-xs font-semibold">{{ $t('debug.page') }}</h3>
          <p
            v-if="!sections.length"
            class="text-xs text-muted"
          >
            {{ $t('debug.empty') }}
          </p>
          <div
            v-for="section in sections"
            :key="section.id"
            class="rounded-lg border border-default p-3"
          >
            <h4 class="mb-2 text-xs font-medium">{{ section.title }}</h4>
            <div class="flex flex-col gap-2">
              <DebugControl
                v-for="control in section.controls"
                :key="control.key"
                :control="control"
              />
            </div>
          </div>
        </section>
      </div>
    </FloatingWindow>
  </template>
</template>

<style>
.debug-launcher {
  transition:
    left 240ms cubic-bezier(0.22, 1, 0.36, 1),
    top 240ms cubic-bezier(0.22, 1, 0.36, 1);
}
.debug-launcher.is-dragging {
  transition: none;
}
@media (prefers-reduced-motion: reduce) {
  .debug-launcher {
    transition: none;
  }
}

.debug-outline body *:not([role='dialog']):not([role='dialog'] *) {
  outline: 1px solid rgb(239 68 68 / 25%);
}
</style>
