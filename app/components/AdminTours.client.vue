<script setup lang="ts">
import { driver, type Driver, type DriveStep } from 'driver.js'
import 'driver.js/dist/driver.css'
import { tourIds, type TourId } from '~~/shared/types/tours'
const route = useRoute()
const { user } = useUserSession()
const { records, ready, busy, revision, load, update } = useTours()
const settings = useSettingsStore()
const { locale } = useI18n()
let active: Driver | undefined
let generation = 0
const current = computed<TourId | undefined>(() => {
  if (route.path === '/') return 'home'
  if (route.path === '/dashboard') return 'dashboard'
  const name = route.path
    .replace('/dashboard/settings/', '')
    .replace('/dashboard/', '')
  return route.path.startsWith('/dashboard/') &&
    tourIds.includes(name as TourId)
    ? (name as TourId)
    : undefined
})
function stop() {
  active?.destroy()
  active = undefined
}
async function start() {
  const token = ++generation
  stop()
  if (
    !user.value?.isAdmin ||
    settings.getSetting('system:firstLaunch') ||
    !ready.value ||
    busy.value
  )
    return
  const id = current.value
  if (!id || records.value[id] !== 'pending') return
  await nextTick()
  await new Promise((resolve) =>
    requestAnimationFrame(() => requestAnimationFrame(resolve)),
  )
  if (token !== generation) return
  const field = (key: string) => `[data-tour-setting="${key}"]`
  const plans: Record<TourId, [string, string?][]> = {
    home: [
      ['home'],
      ['homeAvatar', '[data-tour="home-avatar"]'],
      ['homeDashboard', '[data-tour="home-dashboard"]'],
    ],
    dashboard: [
      ['dashboard', '[data-tour="dashboard-photos"]'],
      ['queueDetails', '[data-tour="dashboard-queue"]'],
      ['shareSite', '[data-tour="dashboard-share"]'],
    ],
    photos: [
      ['photoUpload', '[data-tour="photo-upload"]'],
      ['queueDetails', '[data-tour="photo-queue"]'],
      ['photoFilter', '[data-tour="photo-filter"]'],
    ],
    albums: [
      ['albumCreate', '[data-tour="album-create"]'],
      ['albumActions', '[data-tour="album-actions"]'],
    ],
    general: [
      ['general', field('app:title')],
      ['avatar', field('app:avatarUrl')],
      ['appearance', field('app:appearance.theme')],
      ['saveSettings', 'button[form="appSettingsForm"][type="submit"]'],
    ],
    storage: [
      ['storage', '[data-tour="storage-default"]'],
      ['storageAdd', '[data-tour="storage-add"]'],
    ],
    map: [
      ['map', field('map:provider')],
      [
        'mapStyle',
        `${field('map:mapbox.style')}, ${field('map:maplibre.style')}`,
      ],
      [
        'mapToken',
        `${field('map:mapbox.token')}, ${field('map:maplibre.token')}`,
      ],
      ['location', field('location:language')],
      ['locationService', field('location:nominatim.baseUrl')],
      ['saveSettings', 'button[form="mapSettingsForm"][type="submit"]'],
    ],
    privacy: [
      ['privacy', field('privacy:upload.autoEraseLocation')],
      ['saveSettings', 'button[form="privacySettingsForm"][type="submit"]'],
    ],
    system: [
      ['githubLogin', field('system:auth.github.enabled')],
      ['uploadLimit', field('system:upload.maxFileSize')],
      ['duplicateCheck', field('system:upload.duplicateCheck.enabled')],
      ['resetTours', '[data-tour="reset"]'],
    ],
  }
  const visibleTarget = (selector: string) =>
    Array.from(document.querySelectorAll<HTMLElement>(selector)).find(
      (element) => element.getClientRects().length > 0,
    )
  // Settings arrive asynchronously. Wait for the first actual control, not its skeleton.
  const firstSelector = plans[id][0]?.[1]
  if (firstSelector && !visibleTarget(firstSelector)) {
    await new Promise<void>((resolve) => {
      const observer = new MutationObserver(() => {
        if (visibleTarget(firstSelector)) finishWait()
      })
      const timeout = window.setTimeout(finishWait, 5000)
      function finishWait() {
        observer.disconnect()
        clearTimeout(timeout)
        resolve()
      }
      observer.observe(document.body, {
        childList: true,
        subtree: true,
        attributes: true,
      })
    })
  }
  if (token !== generation) return
  const steps: DriveStep[] = plans[id].flatMap(([key, selector]) => {
    const target = selector ? visibleTarget(selector) : undefined
    if (selector && !target) return []
    return [
      {
        element: target,
        popover: {
          title: $t(`tours.${key}.title`),
          description: $t(`tours.${key}.description`),
          popoverClass: key === 'home' ? 'chronoframe-tour-welcome' : undefined,
        },
      },
    ]
  })
  if (!steps.length) return
  let saving = false
  async function finish(status: 'completed' | 'skipped') {
    if (saving) return
    saving = true
    const saved = await update(id as TourId, status)
    saving = false
    if (saved && token === generation) stop()
  }
  active = driver({
    steps,
    showProgress: true,
    showButtons: ['next', 'previous', 'close'],
    allowClose: true,
    overlayClickBehavior: 'none',
    closeBtnLabel: $t('tours.skip'),
    onCloseClick: () => {
      void finish('skipped')
    },
    onDestroyStarted: () => {
      void finish('skipped')
    },
    disableActiveInteraction: true,
    animate: !window.matchMedia('(prefers-reduced-motion: reduce)').matches,
    nextBtnText: $t('tours.next'),
    prevBtnText: $t('tours.previous'),
    doneBtnText: $t('tours.done'),
    progressText: '{{current}} / {{total}}',
    onDoneClick: () => {
      void finish('completed')
    },
    onNextClick: () => {
      if (active?.hasNextStep()) active.moveNext()
      else void finish('completed')
    },
    onPopoverRender: (popover) => {
      popover.closeButton.textContent = $t('tours.skip')
      popover.closeButton.classList.add('chronoframe-tour-skip')
      popover.footerButtons.prepend(popover.closeButton)
    },
  })
  active.drive()
}
watch(
  () => user.value?.isAdmin,
  async (admin) => {
    ++generation
    stop()
    ready.value = false
    if (admin) {
      await load()
      void start()
    }
  },
  { immediate: true },
)
watch(
  [revision, locale],
  () => {
    void start()
  },
  { flush: 'post' },
)
watch(
  () => route.path,
  async () => {
    ++generation
    stop()
    if (user.value?.isAdmin) {
      await load()
      void start()
    }
  },
  { flush: 'post' },
)
const removePageFinish = useNuxtApp().hook('page:finish', () => {
  void start()
})
watch(
  busy,
  (value) => {
    if (!value) void start()
  },
  { flush: 'post' },
)
onUnmounted(() => {
  removePageFinish()
  ++generation
  stop()
})
</script>
<template><span hidden /></template>

<style>
.driver-overlay {
  z-index: 10050 !important;
}
.driver-popover {
  z-index: 10051 !important;
}
.driver-popover.chronoframe-tour-welcome {
  max-width: min(480px, calc(100vw - 32px));
  padding: 24px;
}
.chronoframe-tour-welcome .driver-popover-title {
  font-size: 22px;
}
.chronoframe-tour-welcome .driver-popover-description {
  font-size: 14px;
  line-height: 1.8;
}

.driver-popover .driver-popover-close-btn.chronoframe-tour-skip {
  position: static;
  display: inline-block;
  width: auto;
  height: auto;
  border: 1px solid #ccc;
  background: #fff;
  color: #2d2d2d;
  border-radius: 3px;
  padding: 3px 7px;
  font-size: 12px;
  cursor: pointer;
}
</style>
