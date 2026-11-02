<script setup>
import DefaultTheme from 'vitepress/theme'
import CloudAnnouncement from './components/CloudAnnouncement.vue'
import AdsenseToc from './components/AdsenseToc.vue'

const { Layout } = DefaultTheme
</script>

<template>
  <Layout>
    <template #layout-top><CloudAnnouncement /></template>
    <template #sidebar-nav-after>
      <div class="ads-box deep">
        <AdsenseToc />
      </div>
    </template>
  </Layout>
</template>

<style scoped>
.ads-title {
  font-weight: 700;
  color: var(--vp-c-text-1);
  flex-grow: 1;
  padding: 4px 0;
  line-height: 24px;
  font-size: 14px;
  transition: color 0.25s;
}

.ads-box {
  position: relative;
  width: 100%;
  border-radius: 8px;
  overflow: hidden;
  /* background: #f1f1f1; */
  background-color: transparent;
  aspect-ratio: 16/9;
  z-index: 0;
}

.ads-box.deep {
  /* background: #eaeaec; */
  background-color: transparent;
}

/* .ads-box::after {
  content: 'AD';
  position: absolute;
  top: 50%;
  left: 50%;
  transform: translate(-50%, -50%);
  color: #bbbbbb;
  font-size: 14px;
  z-index: 0;
}

.ads-box.deep::after {
  color: #aaaaaa;
} */

@media (max-width: 768px) {
  .ads-box {
    display: none;
  }
}
</style>
