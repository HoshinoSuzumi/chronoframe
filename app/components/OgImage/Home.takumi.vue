<script setup lang="ts">
const props = defineProps<{
  appTitle?: string
  slogan?: string
  author?: string
  photoCountLabel?: string
  photoCount?: number
  thumbnails?: string[]
}>()
const { $i18n } = useNuxtApp()
const title = computed(() => props.appTitle || 'ChronoFrame')
const photoCountLabel = computed(
  () =>
    props.photoCountLabel ||
    $i18n.t(
      'plural.photo',
      { count: props.photoCount || 0 },
      props.photoCount || 0,
    ),
)
const covers = computed(() => (props.thumbnails || []).slice(0, 3))
</script>

<template>
  <div class="og-home">
    <div class="og-home__copy">
      <div class="og-home__eyebrow">
        <span class="og-home__dot" />PHOTOGRAPHY
      </div>
      <div class="og-home__heading">
        <h1 class="og-home__title">
          {{ title.slice(0, 50) }}
        </h1>
        <p
          v-if="slogan"
          class="og-home__slogan"
        >
          {{ slogan.slice(0, 100) }}
        </p>
      </div>
      <div class="og-home__footer">
        <span
          v-if="author"
          class="og-home__author"
          >{{ author.slice(0, 40) }}</span
        >
        <span class="og-home__count">{{ photoCountLabel }}</span>
      </div>
    </div>
    <div class="og-home__gallery">
      <div class="og-home__frame">
        <img
          v-if="covers[0]"
          :src="'/thumb/' + encodeURIComponent(covers[0] || '')"
          class="og-home__image"
        />
        <div
          v-else
          class="og-home__placeholder"
        >
          <div class="og-home__placeholder-line" />
          <div class="og-home__placeholder-circle" />
        </div>
      </div>
      <div class="og-home__frame og-home__tall">
        <img
          v-if="covers[1]"
          :src="'/thumb/' + encodeURIComponent(covers[1] || '')"
          class="og-home__image"
        />
        <div
          v-else
          class="og-home__placeholder"
        >
          <div class="og-home__placeholder-line" />
          <div class="og-home__placeholder-circle" />
        </div>
      </div>
      <div class="og-home__frame">
        <img
          v-if="covers[2]"
          :src="'/thumb/' + encodeURIComponent(covers[2] || '')"
          class="og-home__image"
        />
        <div
          v-else
          class="og-home__placeholder"
        >
          <div class="og-home__placeholder-line" />
          <div class="og-home__placeholder-circle" />
        </div>
      </div>
    </div>
  </div>
</template>

<style scoped>
.og-home {
  width: 100%;
  height: 100%;
  display: flex;
  background: #f5f3ee;
  color: #242c29;
  font-family: 'Rubik', 'Noto Sans SC', sans-serif;
  padding: 60px;
  gap: 40px;
}
.og-home__copy {
  width: 480px;
  height: 480px;
  display: flex;
  flex-direction: column;
  justify-content: space-between;
  flex-shrink: 0;
}
.og-home__eyebrow {
  display: flex;
  align-items: center;
  gap: 12px;
  color: #627268;
  font-size: 18px;
  font-weight: 500;
  letter-spacing: 3px;
}
.og-home__dot {
  width: 10px;
  height: 10px;
  border-radius: 50%;
  background: #6c8c72;
}
.og-home__heading {
  display: flex;
  flex-direction: column;
  gap: 24px;
}
.og-home__title {
  margin: 0;
  font-size: 64px;
  font-weight: 700;
  line-height: 1.12;
  letter-spacing: -2px;
  line-clamp: 3;
}
.og-home__slogan {
  margin: 0;
  font-size: 26px;
  line-height: 1.5;
  color: #6b746d;
  line-clamp: 3;
}
.og-home__footer {
  display: flex;
  align-items: center;
  gap: 20px;
  font-size: 20px;
}
.og-home__author {
  max-width: 280px;
  line-clamp: 1;
}
.og-home__count {
  color: #6b746d;
}
.og-home__gallery {
  display: flex;
  gap: 16px;
  width: 560px;
  height: 480px;
}
.og-home__frame {
  margin-top: 64px;
  height: 416px;
  display: flex;
  width: 176px;
  flex-shrink: 0;
  overflow: hidden;
  border-radius: 18px;
  background: #d8dfd3;
}
.og-home__tall {
  margin-top: 0;
  height: 480px;
}
.og-home__image {
  width: 100%;
  height: 100%;
  object-fit: cover;
}
.og-home__placeholder {
  position: relative;
  display: flex;
  width: 100%;
  height: 100%;
  overflow: hidden;
}
.og-home__placeholder-line {
  position: absolute;
  width: 280px;
  height: 280px;
  border: 1px solid #ffffff80;
  border-radius: 50%;
  left: -100px;
  bottom: -40px;
}
.og-home__placeholder-circle {
  position: absolute;
  width: 90px;
  height: 90px;
  border-radius: 50%;
  background: #ffffff40;
  top: 60px;
  right: -20px;
}
</style>
