<script setup lang="ts">
import { motion } from 'motion-v'
import { ShieldCheck, ArrowRight, LogOut } from 'lucide-vue-next'
const entrance = useCloudMotion()
const { busy, error, signOut } = useCloudSignOut()
useSeoMeta({ title: 'Your account — ChronoFrame Cloud', robots: 'noindex' })
const { data: security } = await useFetch('/api/auth/security')
</script>
<template>
  <CloudPortalShell
    ><motion.div v-bind="entrance"
      ><div class="cf-page-heading">
        <div>
          <p class="cf-eyebrow">YOUR SPACE</p>
          <h1 class="cf-page-title">Your account</h1>
          <p class="cf-page-description">
            A few essentials, so you can get back to what matters.
          </p>
        </div>
        <CloudBadge tone="success"
          ><ShieldCheck :size="12" />Email verified</CloudBadge
        >
      </div>
      <CloudCard class="cf-settings-card"
        ><div class="cf-setting-row">
          <div>
            <h2>Sign-in method</h2>
            <p>{{ security?.email }}</p>
          </div>
          <CloudButton
            as-child
            variant="secondary"
            size="sm"
            ><NuxtLink to="/account/security"
              >Security settings <ArrowRight :size="14" /></NuxtLink
          ></CloudButton>
        </div>
        <div class="cf-setting-row">
          <div>
            <h2>Your sites</h2>
            <p>Find the galleries you have access to.</p>
          </div>
          <CloudButton
            as-child
            variant="secondary"
            size="sm"
            ><NuxtLink to="/sites"
              >View sites <ArrowRight :size="14" /></NuxtLink
          ></CloudButton>
        </div>
        <div class="cf-setting-row">
          <div>
            <h2>Appearance</h2>
            <p>Choose the light that suits you.</p>
          </div>
          <CloudThemeToggle /></div
      ></CloudCard>
      <div class="cf-notice">
        <strong>Your email is verified.</strong>Workspace and site setup are
        coming in the next stage. We’ll keep the essentials here as your space
        grows.
      </div>
      <CloudCard class="cf-settings-card"
        ><div class="cf-setting-row">
          <div>
            <h2>Sign out</h2>
            <p>End your current session on this browser.</p>
          </div>
          <CloudButton
            variant="destructive"
            :loading="busy"
            @click="signOut"
            ><LogOut
              v-if="!busy"
              :size="15"
            />Sign out</CloudButton
          >
        </div></CloudCard
      >
      <p
        v-if="error"
        class="cf-error-message"
        role="alert"
        style="margin-top: 16px"
      >
        {{ error }}
      </p>
    </motion.div></CloudPortalShell
  >
</template>
