<script setup lang="ts">
const { t } = useI18n()

import { motion } from 'motion-v'
import {
  ArrowUpRight,
  ArrowRight,
  Image,
  HardDrive,
  Code2,
  Check,
} from 'lucide-vue-next'
const entrance = useCloudMotion()
const links = useCloudLinks()
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
            class="cf-gallery-preview"
            :aria-label="$t('cloud.messages.examplePhotographyGallery')"
          >
            <div class="cf-preview-top">
              <span>{{ $t('cloud.messages.fieldNotes') }}</span
              ><span>{{ $t('cloud.messages.aChronoframeGallery') }}</span>
            </div>
            <div class="cf-preview-grid">
              <img
                src="/images/mountains.jpg"
                :alt="
                  $t('cloud.messages.sunlitMountainPeaksBeneathASoftBlueSky')
                "
                width="1200"
                height="800"
                fetchpriority="high"
              /><img
                src="/images/forest.jpg"
                :alt="$t('cloud.messages.lightFallingThroughAQuietGreenForest')"
                width="800"
                height="600"
              /><img
                src="/images/coast.jpg"
                :alt="$t('cloud.messages.anOceanShoreInTheWarmLightOfSunset')"
                width="800"
                height="600"
              />
            </div>
            <div class="cf-preview-caption">
              <span>{{ $t('cloud.messages.smallMomentsWideHorizons') }}</span
              ><span>01 — 03</span>
            </div>
            <div class="cf-preview-label">
              <Check :size="16" /><span>{{
                $t('cloud.messages.aLittleSpaceForYourPerspective')
              }}</span>
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
      <span
        >© {{ new Date().getFullYear()
        }}{{ $t('cloud.messages.chronoframeMadeForTheWayYouSee') }}</span
      ><a
        href="https://github.com/HoshinoSuzumi/chronoframe/blob/main/LICENSING.md"
        >{{ $t('cloud.messages.sourceAndLicensing') }}<ArrowUpRight :size="13"
      /></a>
      <CloudSupportLink />
      <CloudLegalLinks />
    </footer>
  </div>
</template>
