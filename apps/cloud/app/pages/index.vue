<script setup lang="ts">
useSeoMeta({
  title: 'ChronoFrame — A home for your photography',
  description:
    'A photography gallery you can make your own. Explore ChronoFrame and its self-hosted edition.',
})
</script>
<template>
  <div class="cloud-page">
    <header class="cloud-nav">
      <NuxtLink
        to="/"
        class="brand"
        >ChronoFrame</NuxtLink
      >
      <nav aria-label="Main navigation">
        <a href="https://chronoframe.bh8.ga/">Documentation</a
        ><NuxtLink to="/signin">Cloud access</NuxtLink>
      </nav>
    </header>
    <main>
      <section class="hero">
        <p class="eyebrow">Your photography, in focus</p>
        <h1>A home for the moments<br />you want to share.</h1>
        <p class="intro">
          Bring your photographs together in a gallery that feels like yours.
          Start with ChronoFrame's self-hosted edition.
        </p>
        <div class="actions">
          <UButton
            to="https://github.com/HoshinoSuzumi/chronoframe"
            size="xl"
            >Explore Self-hosted</UButton
          ><UButton
            to="/signin"
            variant="outline"
            size="xl"
            >Cloud availability</UButton
          >
        </div>
      </section>
      <section
        class="features"
        aria-label="ChronoFrame features"
      >
        <article>
          <span>01</span>
          <h2>Made for photographs</h2>
          <p>
            Give your images room to breathe, with albums and a dedicated photo
            viewer.
          </p>
        </article>
        <article>
          <span>02</span>
          <h2>Keep your own storage</h2>
          <p>Run the self-hosted edition with storage you control.</p>
        </article>
        <article>
          <span>03</span>
          <h2>Built in the open</h2>
          <p>
            Explore the source, contribute improvements, and make the gallery
            your own.
          </p>
        </article>
      </section>
    </main>
    <footer>
      <span>ChronoFrame</span
      ><a
        href="https://github.com/HoshinoSuzumi/chronoframe/blob/main/LICENSING.md"
        >Source and licensing</a
      >
    </footer>
  </div>
</template>
