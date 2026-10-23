<script setup lang="ts">
import { ArrowLeft } from 'lucide-vue-next'
const links = useCloudLinks()
</script>
<template>
  <div class="cf-auth">
    <aside
      class="cf-auth-visual"
      aria-label="About ChronoFrame Cloud"
    >
      <CloudBrand
        cloud
        light
      />
      <div>
        <div class="cf-auth-quote">
          <h2>A little space.<br />A different perspective.</h2>
          <p>Your photographs deserve a home that feels like you.</p>
        </div>
        <p class="cf-auth-caption">
          CHRONOFRAME CLOUD · MADE FOR THE WAY YOU SEE
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
          ><ArrowLeft :size="15" />Back to home</NuxtLink
        ><CloudThemeToggle />
      </div>
      <div class="cf-auth-form"><slot /></div>
      <p class="cf-auth-bottom">
        A home for your photographs.
        <a
          class="cf-text-link"
          href="https://docs.chronoframe.art/"
          >A little guidance, if you need it.</a
        >
      </p>
    </main>
  </div>
</template>
