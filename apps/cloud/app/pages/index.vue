<script setup lang="ts">
const { t } = useI18n()

import { motion } from 'motion-v'
import {
  ArrowUpRight,
  ArrowRight,
  Image,
  HardDrive,
  Code2,
  Search,
  SlidersHorizontal,
} from 'lucide-vue-next'
const entrance = useCloudMotion()
const links = useCloudLinks()
const photoColumns = [
  ['mountains', 'lake', 'forest', 'desert', 'coast', 'valley', 'waterfall', 'hills', 'sea'],
  ['coast', 'waterfall', 'hills', 'forest', 'sea', 'mountains', 'lake', 'desert', 'valley'],
  ['forest', 'valley', 'sea', 'lake', 'mountains', 'waterfall', 'desert', 'coast', 'hills'],
  ['desert', 'mountains', 'coast', 'hills', 'waterfall', 'valley', 'forest', 'sea', 'lake'],
].map(column => column.map(name => `/images/${name}.jpg`))
const preview = ref<HTMLElement | null>(null)
let frame = 0
let currentX = 0
let currentY = 0
let targetX = 0
let targetY = 0
let lastTime = 0

function animatePreview(time: number) {
  const elapsed = lastTime ? Math.min(time - lastTime, 64) : 16
  lastTime = time
  const easing = 1 - Math.exp(-elapsed / 180)
  currentX += (targetX - currentX) * easing
  currentY += (targetY - currentY) * easing
  preview.value?.style.setProperty('--tilt-x', `${currentX}deg`)
  preview.value?.style.setProperty('--tilt-y', `${currentY}deg`)
  if (Math.abs(targetX - currentX) + Math.abs(targetY - currentY) > 0.01) {
    frame = requestAnimationFrame(animatePreview)
  } else {
    frame = 0
    lastTime = 0
  }
}

function updatePreview(event: PointerEvent) {
  if (event.pointerType !== 'mouse' || matchMedia('(prefers-reduced-motion: reduce)').matches) return
  const bounds = (event.currentTarget as HTMLElement).getBoundingClientRect()
  targetX = (0.5 - (event.clientY - bounds.top) / bounds.height) * 8
  targetY = ((event.clientX - bounds.left) / bounds.width - 0.5) * 10
  if (!frame) frame = requestAnimationFrame(animatePreview)
}

function resetPreview() {
  targetX = 0
  targetY = 0
  if (!frame) frame = requestAnimationFrame(animatePreview)
}

onBeforeUnmount(() => cancelAnimationFrame(frame))
useSeoMeta({
  title: t('cloud.messages.chronoframeAHomeForYourPhotography'),
  description: t(
    'cloud.messages.aThoughtfulHomeForYourPhotographsBeautifulGalleriesYour',
  ),
})
</script>
<template>
  <div class="cf-marketing">
    <CloudMarketingHeader />
    <main
      id="main-content"
      tabindex="-1"
    >
      <section class="cf-hero">
        <motion.div v-bind="entrance"
          ><p class="cf-eyebrow">
            {{ $t('cloud.messages.yourPhotographyYourPerspective') }}
          </p>
          <h1 class="cf-hero-title">
            {{ $t('cloud.messages.everyFrame') }}<br /><em>{{
              $t('cloud.messages.yourStory')
            }}</em>
          </h1>
          <p class="cf-hero-copy">
            {{ $t('cloud.messages.aHomeForTheMomentsYouWantToShare') }}
          </p>
          <div class="cf-hero-actions">
            <CfButton
              as-child
              size="lg"
              ><NuxtLink
                :to="links.signup"
                external
                >{{ $t('cloud.messages.createYourAccount')
                }}<ArrowRight :size="16" /></NuxtLink></CfButton
            ><CfButton
              as-child
              variant="secondary"
              size="lg"
              ><a href="https://docs.chronoframe.art/guide/getting-started.html"
                >{{ $t('cloud.messages.exploreSelfHosted')
                }}<ArrowUpRight :size="16" /></a
            ></CfButton>
          </div>
          <p class="cf-small-note">
            {{ $t('cloud.messages.chooseHostedOrSelfHosted') }}
          </p></motion.div
        >
        <motion.div v-bind="entrance"
          ><div
            ref="preview" class="cf-gallery-preview" @pointermove="updatePreview" @pointerleave="resetPreview"
            :aria-label="$t('cloud.messages.examplePhotographyGallery')"
          >
            <div class="cf-preview-header" aria-hidden="true">
              <div class="cf-preview-avatar">C</div>
              <div class="cf-preview-identity"><strong>My Memories</strong><span>A ChronoFrame gallery</span></div>
              <div class="cf-preview-info"><strong>128 photos</strong><span>Small moments. Wide horizons.</span></div>
              <Search :size="15" /><SlidersHorizontal :size="15" />
            </div>
            <div class="cf-photo-wall" aria-hidden="true">
              <div v-for="(column, columnIndex) in photoColumns" :key="columnIndex" class="cf-photo-column">
                <div class="cf-photo-track">
                  <div v-for="copy in 2" :key="copy" class="cf-photo-sequence">
                    <img v-for="(photo, index) in column" :key="photo" :src="photo" :class="`cf-photo-${(index + columnIndex) % 3}`" alt="" width="400" height="300" />
                  </div>
                </div>
              </div>
            </div>
          </div></motion.div
        >
      </section>
      <section aria-labelledby="features-heading">
        <div class="cf-section-heading">
          <div>
            <p class="cf-eyebrow">
              {{ $t('cloud.messages.lessBetweenYouAndYourPhotographs') }}
            </p>
            <h2 id="features-heading">
              {{ $t('cloud.messages.thoughtfullySimpleEntirelyYours') }}
            </h2>
          </div>
          <CfBadge>{{ $t('cloud.messages.openSourceByNature') }}</CfBadge>
        </div>
        <div class="cf-features">
          <article>
            <Image
              :size="23"
              :stroke-width="1.5"
            />
            <h3>{{ $t('cloud.messages.letYourPhotographsLead') }}</h3>
            <p>
              {{
                $t(
                  'cloud.messages.quietLayoutsConsideredDetailsAndADedicatedViewerGive',
                )
              }}
            </p>
          </article>
          <article>
            <HardDrive
              :size="23"
              :stroke-width="1.5"
            />
            <h3>{{ $t('cloud.messages.yourImagesYourStorage') }}</h3>
            <p>
              {{
                $t(
                  'cloud.messages.runTheSelfHostedEditionWithStorageYouControl',
                )
              }}
            </p>
          </article>
          <article>
            <Code2
              :size="23"
              :stroke-width="1.5"
            />
            <h3>{{ $t('cloud.messages.madeToBeMadeYourOwn') }}</h3>
            <p>
              {{
                $t('cloud.messages.builtInTheOpenWithASharedFoundationExplore')
              }}
            </p>
          </article>
        </div>
      </section>
    </main>
    <footer class="cf-marketing-footer">
      <div class="cf-footer-main">
        <div class="cf-footer-brand">
          <CloudBrand />
          <p>{{ $t('cloud.messages.aHomeForYourPhotographs') }}</p>
        </div>
        <div class="cf-footer-links">
          <a href="https://github.com/HoshinoSuzumi/chronoframe/blob/main/LICENSING.md">
            {{ $t('cloud.messages.sourceAndLicensing') }}<ArrowUpRight :size="13" />
          </a>
          <CloudSupportLink />
        </div>
      </div>
      <div class="cf-footer-bottom">
        <span>© {{ new Date().getFullYear() }} {{ $t('cloud.messages.chronoframeMadeForTheWayYouSee') }}</span>
        <CloudLegalLinks />
      </div>
    </footer>
  </div>
</template>
