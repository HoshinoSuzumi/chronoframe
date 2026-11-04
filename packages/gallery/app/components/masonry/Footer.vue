<script lang="ts" setup>
import { siteFooterLink } from '../../utils/site-footer-link'

defineProps<{
  summary: string
  photos: Photo[]
}>()

const entry = useEntryContext()
const capabilities = useEntryCapabilities()
const edition = computed(
  () => entry.value?.capabilities.edition ?? capabilities.edition,
)
const brandHref = computed(
  () =>
    siteFooterLink(edition.value, 'embedded', entry.value?.siteId) ??
    'https://github.com/HoshinoSuzumi/chronoframe',
)
const showVersion = computed(() => edition.value !== 'site')
const copyrightName = computed(
  () => getSetting('app:author') || getSetting('app:title'),
)
</script>

<template>
  <footer class="masonry-footer">
    <div class="masonry-footer-pattern" />
    <MasonryFooterGlow :photos />
    <div class="masonry-footer-timeline">
      <span class="masonry-footer-timeline-rail" />
      <span class="masonry-footer-timeline-node" />
      <span class="masonry-footer-timeline-rail" />
    </div>
    <div class="masonry-footer-content">
      <p
        v-if="summary"
        class="text-xs font-medium text-neutral-600 dark:text-neutral-400"
      >
        {{ summary }}
      </p>
      <p
        v-if="copyrightName"
        class="text-[11px] text-neutral-500 dark:text-neutral-500"
      >
        © {{ $dayjs().format('YYYY') }} {{ copyrightName }}
      </p>
      <a
        :href="brandHref"
        target="_blank"
        rel="noopener noreferrer"
        class="inline-flex items-center gap-1 text-[11px] text-neutral-500/80 transition-colors hover:text-neutral-800 dark:text-neutral-500 dark:hover:text-neutral-200"
      >
        Powered by
        <span class="font-semibold">ChronoFrame</span>
        <template v-if="showVersion">v{{ $config.public.VERSION }}</template>
      </a>
    </div>
  </footer>
</template>

<style scoped>
.masonry-footer {
  position: relative;
  display: flex;
  flex: 1 0 auto;
  flex-direction: column;
  align-items: center;
  justify-content: flex-end;
  padding: 3.5rem 1rem 2rem;
  color: var(--ui-text-muted, #737373);
}

/* Extends upward into the ragged tail of the wall, behind the photos. */
.masonry-footer-pattern {
  position: absolute;
  inset: -22rem 0 0;
  z-index: -1;
  pointer-events: none;
  background-image: radial-gradient(
    circle at center,
    currentColor 1px,
    transparent 1.5px
  );
  background-size: 18px 18px;
  opacity: 0.22;
  mask-image: linear-gradient(to bottom, transparent, #000 70%);
}

/* A film-ruler axis: ticked rails fade out from a centred ring node. */
.masonry-footer-timeline {
  display: flex;
  align-items: center;
  gap: 0.75rem;
  width: min(20rem, 80%);
  margin-bottom: 1.25rem;
  opacity: 0.6;
}

.masonry-footer-timeline-rail {
  flex: 1;
  height: 7px;
  background:
    linear-gradient(currentColor, currentColor) center / 100% 1px no-repeat,
    repeating-linear-gradient(90deg, currentColor 0 1px, transparent 1px 10px)
      center / 100% 5px no-repeat;
}

.masonry-footer-timeline-rail {
  mask-image: linear-gradient(to right, transparent, #000);
}

.masonry-footer-timeline-rail:last-child {
  transform: scaleX(-1);
}

.masonry-footer-timeline-node {
  display: grid;
  flex: none;
  place-items: center;
  width: 12px;
  height: 12px;
  border: 1px solid currentColor;
  border-radius: 9999px;
}

.masonry-footer-timeline-node::after {
  width: 4px;
  height: 4px;
  content: '';
  background: currentColor;
  border-radius: 9999px;
}

.masonry-footer-content {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 0.375rem;
  text-align: center;
}
</style>
