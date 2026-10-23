<script setup lang="ts">
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
  title: 'ChronoFrame — A home for your photography',
  description:
    'A thoughtful home for your photographs. Beautiful galleries, your own storage, and an open-source heart.',
})
</script>
<template>
  <div class="cf-marketing">
    <header class="cf-marketing-header">
      <CloudBrand />
      <nav
        class="cf-marketing-nav"
        aria-label="Main navigation"
      >
        <a href="https://docs.chronoframe.art/">Documentation</a
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
            >Log in</NuxtLink
          ></CloudButton
        ><CloudButton
          as-child
          size="sm"
          ><NuxtLink
            :to="links.signup"
            external
            >Get started <ArrowUpRight :size="14" /></NuxtLink
        ></CloudButton>
      </nav>
    </header>
    <main
      id="main-content"
      tabindex="-1"
    >
      <section class="cf-hero">
        <motion.div v-bind="entrance"
          ><p class="cf-eyebrow">YOUR PHOTOGRAPHY. YOUR PERSPECTIVE.</p>
          <h1 class="cf-hero-title">Every frame.<br /><em>Your story.</em></h1>
          <p class="cf-hero-copy">
            A home for the moments you want to share. Bring your photographs
            together in a gallery that feels entirely yours.
          </p>
          <div class="cf-hero-actions">
            <CloudButton
              as-child
              size="lg"
              ><NuxtLink
                :to="links.signup"
                external
                >Create your account
                <ArrowRight :size="16" /></NuxtLink></CloudButton
            ><CloudButton
              as-child
              variant="secondary"
              size="lg"
              ><a href="https://docs.chronoframe.art/guide/getting-started.html"
                >Explore Self-hosted <ArrowUpRight :size="16" /></a
            ></CloudButton>
          </div>
          <p class="cf-small-note">
            Self-hosted is available now. Cloud is in preview.
          </p></motion.div
        >
        <motion.div v-bind="entrance"
          ><div
            class="cf-gallery-preview"
            aria-label="Example photography gallery"
          >
            <div class="cf-preview-top">
              <span>FIELD NOTES</span><span>A CHRONOFRAME GALLERY</span>
            </div>
            <div class="cf-preview-grid">
              <img
                src="/images/mountains.jpg"
                alt="Sunlit mountain peaks beneath a soft blue sky"
                width="1200"
                height="800"
                fetchpriority="high"
              /><img
                src="/images/forest.jpg"
                alt="Light falling through a quiet green forest"
                width="800"
                height="600"
              /><img
                src="/images/coast.jpg"
                alt="An ocean shore in the warm light of sunset"
                width="800"
                height="600"
              />
            </div>
            <div class="cf-preview-caption">
              <span>Small moments. Wide horizons.</span><span>01 — 03</span>
            </div>
            <div class="cf-preview-label">
              <Check :size="16" /><span
                >A little space for your perspective.</span
              >
            </div>
          </div></motion.div
        >
      </section>
      <section aria-labelledby="features-heading">
        <div class="cf-section-heading">
          <div>
            <p class="cf-eyebrow">LESS BETWEEN YOU AND YOUR PHOTOGRAPHS</p>
            <h2 id="features-heading">Thoughtfully simple. Entirely yours.</h2>
          </div>
          <CloudBadge>Open source, by nature</CloudBadge>
        </div>
        <div class="cf-features">
          <article>
            <Image
              :size="23"
              :stroke-width="1.5"
            />
            <h3>Let your photographs lead.</h3>
            <p>
              Quiet layouts, considered details, and a dedicated viewer. Give
              every photograph the space it deserves.
            </p>
          </article>
          <article>
            <HardDrive
              :size="23"
              :stroke-width="1.5"
            />
            <h3>Your images. Your storage.</h3>
            <p>
              Run the self-hosted edition with storage you control. Keep your
              collection close, on your terms.
            </p>
          </article>
          <article>
            <Code2
              :size="23"
              :stroke-width="1.5"
            />
            <h3>Made to be made your own.</h3>
            <p>
              Built in the open, with a shared foundation. Explore the source
              and help shape what comes next.
            </p>
          </article>
        </div>
      </section>
    </main>
    <footer class="cf-marketing-footer">
      <span
        >© {{ new Date().getFullYear() }} ChronoFrame. Made for the way you
        see.</span
      ><a
        href="https://github.com/HoshinoSuzumi/chronoframe/blob/main/LICENSING.md"
        >Source and licensing <ArrowUpRight :size="13"
      /></a>
    </footer>
  </div>
</template>
