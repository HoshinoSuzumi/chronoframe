<script setup lang="ts">
import { ShieldCheck } from 'lucide-vue-next'
definePageMeta({ layout: 'portal' })
useSeoMeta({
  title: 'Account & security — ChronoFrame Cloud',
  robots: 'noindex',
})
const user = usePortalIdentity()
</script>
<template>
  <div class="cf-account-page">
    <div class="cf-page-heading">
      <div>
        <h1 class="cf-page-title">Account &amp; security</h1>
        <p class="cf-page-description">
          Your profile, preferences and sign-in methods.
        </p>
      </div>
    </div>
    <section aria-labelledby="profile-heading">
      <h2
        id="profile-heading"
        class="cf-section-title"
      >
        Profile
      </h2>
      <CloudCard class="cf-settings-card"
        ><div class="cf-setting-row">
          <div>
            <h3>Email address</h3>
            <p>{{ user?.email }}</p>
          </div>
          <CloudBadge tone="success"
            ><ShieldCheck :size="12" />Verified</CloudBadge
          >
        </div>
        <div class="cf-setting-row">
          <div>
            <h3>Appearance</h3>
            <p>Choose the light that suits you.</p>
          </div>
          <CloudThemeToggle /></div
      ></CloudCard>
    </section>
    <CloudSecuritySettings />
  </div>
</template>
