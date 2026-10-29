<script setup lang="ts">
import { ArrowLeft } from 'lucide-vue-next'
const links = useCloudLinks()
</script>
<template>
  <div class="cf-auth">
    <aside
      class="cf-auth-visual"
      :aria-label="$t('cloud.messages.aboutChronoframeCloud')"
    >
      <CloudBrand
        cloud
        light
      />
      <div>
        <div class="cf-auth-quote">
          <h2>
            {{ $t('cloud.messages.aLittleSpace') }}<br />{{
              $t('cloud.messages.aDifferentPerspective')
            }}
          </h2>
          <p>
            {{
              $t('cloud.messages.yourPhotographsDeserveAHomeThatFeelsLikeYou')
            }}
          </p>
        </div>
        <p class="cf-auth-caption">
          {{ $t('cloud.messages.chronoframeCloudMadeForTheWayYouSee') }}
        </p>
      </div>
    </aside>
    <main
      id="main-content"
      class="cf-auth-main"
      tabindex="-1"
    >
      <div class="cf-auth-top">
        <NuxtLink
          :to="links.website"
          external
          class="cf-back-link"
          ><ArrowLeft :size="15" />{{
            $t('cloud.messages.backToHome')
          }}</NuxtLink
        ><CloudThemeToggle />
      </div>
      <div class="cf-auth-form"><slot /></div>
      <div class="cf-legal-disclosure">
        <p>{{ $t('cloud.legal.readBefore') }}</p>
        <CloudLegalLinks />
      </div>
      <p class="cf-auth-bottom">
        {{ $t('cloud.messages.aHomeForYourPhotographs')
        }}<a
          class="cf-text-link"
          href="https://docs.chronoframe.art/"
          >{{ $t('cloud.messages.aLittleGuidanceIfYouNeedIt') }}</a
        >
      </p>
    </main>
  </div>
</template>
