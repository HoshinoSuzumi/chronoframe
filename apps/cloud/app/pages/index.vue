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
  Menu,
} from 'lucide-vue-next'
import { PopoverRoot, PopoverTrigger, PopoverContent } from 'reka-ui'
const mobileMenuOpen = ref(false)
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
    <header class="cf-marketing-header">
      <CloudBrand />
      <nav
        class="cf-marketing-nav"
        :aria-label="$t('cloud.messages.mainNavigation')"
      >
        <a href="https://docs.chronoframe.art/">{{
          $t('cloud.messages.documentation')
        }}</a
        ><a href="https://github.com/HoshinoSuzumi/chronoframe"
          >GitHub
          <ArrowUpRight
            :size="12"
            aria-hidden="true"
            class="cf-inline-icon" /></a
        ><CloudThemeToggle />
        <CloudButton
          as-child
          variant="secondary"
          size="sm"
          ><NuxtLink
            :to="links.signin"
            external
            >{{ $t('cloud.messages.logIn') }}</NuxtLink
          ></CloudButton
        ><CloudButton
          as-child
          size="sm"
          ><NuxtLink
            :to="links.signup"
            external
            >{{ $t('cloud.messages.getStarted')
            }}<ArrowUpRight :size="14" /></NuxtLink
        ></CloudButton>
      </nav>
      <div class="cf-mobile-header-actions">
        <CloudButton
          as-child
          size="sm"
          ><NuxtLink
            :to="links.signup"
            external
            >{{ $t('cloud.messages.signUp') }}</NuxtLink
          ></CloudButton
        >
        <PopoverRoot v-model:open="mobileMenuOpen">
          <PopoverTrigger as-child
            ><CloudButton
              variant="ghost"
              size="icon"
              :aria-label="$t('cloud.messages.openNavigation')"
              ><Menu :size="20" /></CloudButton
          ></PopoverTrigger>
          <PopoverContent
            class="cf-mobile-menu"
            align="end"
            :side-offset="12"
            :collision-padding="20"
            :aria-label="$t('cloud.messages.navigation')"
          >
            <nav :aria-label="$t('cloud.messages.mobileNavigation')">
              <NuxtLink
                :to="links.signin"
                external
                >{{ $t('cloud.messages.logIn') }}<ArrowRight :size="16"
              /></NuxtLink>
              <a href="https://docs.chronoframe.art/"
                >{{ $t('cloud.messages.documentation')
                }}<ArrowUpRight :size="15"
              /></a>
              <a href="https://github.com/HoshinoSuzumi/chronoframe"
                >GitHub <ArrowUpRight :size="15"
              /></a>
            </nav>
            <div class="cf-mobile-menu-theme">
              <span>{{ $t('cloud.messages.appearance') }}</span
              ><CloudThemeToggle />
            </div>
          </PopoverContent>
        </PopoverRoot>
      </div>
    </header>
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
            <CloudButton
              as-child
              size="lg"
              ><NuxtLink
                :to="links.signup"
                external
                >{{ $t('cloud.messages.createYourAccount')
                }}<ArrowRight :size="16" /></NuxtLink></CloudButton
            ><CloudButton
              as-child
              variant="secondary"
              size="lg"
              ><a href="https://docs.chronoframe.art/guide/getting-started.html"
                >{{ $t('cloud.messages.exploreSelfHosted')
                }}<ArrowUpRight :size="16" /></a
            ></CloudButton>
          </div>
          <p class="cf-small-note">
            {{ $t('cloud.messages.selfHostedIsAvailableNowCloudIsInPreview') }}
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
          <CloudBadge>{{ $t('cloud.messages.openSourceByNature') }}</CloudBadge>
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
    </footer>
  </div>
</template>
