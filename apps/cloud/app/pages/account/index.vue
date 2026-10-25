<script setup lang="ts">
const { t } = useI18n()

import { ShieldCheck } from 'lucide-vue-next'
definePageMeta({ layout: 'portal' })
useSeoMeta({
  title: t('cloud.messages.accountSecurityChronoframeCloud'),
  robots: 'noindex',
})
const user = usePortalIdentity()
</script>
<template>
  <div class="cf-account-page">
    <div class="cf-page-heading">
      <div>
        <h1 class="cf-page-title">
          {{ $t('cloud.messages.accountSecurity') }}
        </h1>
        <p class="cf-page-description">
          {{ $t('cloud.messages.yourProfilePreferencesAndSignInMethods') }}
        </p>
      </div>
    </div>
    <section aria-labelledby="profile-heading">
      <h2
        id="profile-heading"
        class="cf-section-title"
      >
        {{ $t('cloud.messages.profile') }}
      </h2>
      <CloudCard class="cf-settings-card"
        ><div class="cf-setting-row">
          <div>
            <h3>{{ $t('cloud.messages.emailAddress') }}</h3>
            <p>{{ user?.email }}</p>
          </div>
          <CloudBadge tone="success"
            ><ShieldCheck :size="12" />{{
              $t('cloud.messages.verified')
            }}</CloudBadge
          >
        </div>
        <div class="cf-setting-row">
          <div>
            <h3>{{ $t('cloud.messages.appearance') }}</h3>
            <p>{{ $t('cloud.messages.chooseTheLightThatSuitsYou') }}</p>
          </div>
          <CloudThemeToggle /></div
      ></CloudCard>
    </section>
    <CloudSecuritySettings />
  </div>
</template>
