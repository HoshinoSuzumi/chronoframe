<script setup lang="ts">
import { computed } from 'vue'
import { useData } from 'vitepress'

const props = defineProps<{ group: 'developers' | 'community' }>()
const { lang } = useData()
const isChinese = computed(() => lang.value.startsWith('zh'))

const sites = {
  developers: [
    {
      name: "TimoYin's Mems",
      url: 'https://lens.bh8.ga',
      author: 'Timothy Yin',
    },
    {
      name: "Ahmet Ömer's Photography",
      url: 'https://photography.ahmeto.com/',
      author: 'Ahmet Ömer',
    },
  ],
  community: [
    {
      name: '懒洋洋喝咖啡',
      url: 'https://oreo.tanmantang.com',
      description: '用镜头记录每个精彩瞬间',
    },
    { name: 'My Photo Gallery', url: 'https://photo.fivk.cn' },
    {
      name: 'An ISFP Conductor of Current, Pixels, and Code.',
      url: 'https://gallery.xiaoten.com',
    },
    {
      name: '我的旅行相册',
      url: 'https://gallery.junlan.site',
      description: '记录光影，留存回忆',
    },
    {
      name: "Z.Zhou's Photography",
      url: 'https://photography.zzhou612.com/',
      description: 'Catch the Moment',
    },
    {
      name: 'Each Photo Turns a Moment Into Eternity.',
      url: 'https://eachphoto.com',
    },
    { name: 'WhyPhoto', url: 'https://photo.limina.top/' },
    { name: '用图片记录生活', url: 'https://gallery.d.cr' },
    { name: '何来尘埃飞舞', url: 'https://photo.jefftay.com/' },
  ],
}

const cards = computed(() =>
  sites[props.group].map((site) => ({
    ...site,
    host: new URL(site.url).hostname,
    author: 'author' in site ? site.author : '',
    description: 'description' in site ? site.description : '',
  })),
)
</script>

<template>
  <div class="demo-grid">
    <a
      v-for="site in cards"
      :key="site.url"
      class="demo-card"
      :href="site.url"
      target="_blank"
      rel="noopener noreferrer"
    >
      <span class="demo-content">
        <span class="demo-heading">
          <span class="demo-name">{{ site.name }}</span>
          <span
            v-if="site.description"
            class="demo-detail"
            >{{ site.description }}</span
          >
        </span>
        <span
          class="demo-host"
          :title="site.author ? `${site.author} · ${site.host}` : site.host"
        >
          <template v-if="site.author">{{ site.author }} · </template
          >{{ site.host }}
        </span>
      </span>
      <span class="demo-visit">
        <svg
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          stroke-width="1.5"
          aria-hidden="true"
        >
          <path
            d="M7 17 17 7M7 7h10v10"
            stroke-linecap="round"
            stroke-linejoin="round"
          />
        </svg>
        <span class="sr-only">{{
          isChinese
            ? '访问站点（在新窗口打开）'
            : 'Visit gallery (opens in a new window)'
        }}</span>
      </span>
    </a>
  </div>
</template>

<style scoped>
.demo-grid {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: 10px;
  margin: 16px 0 28px;
}

.demo-card {
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  gap: 12px;
  min-width: 0;
  padding: 16px;
  border: 1px solid var(--vp-c-divider);
  border-radius: 10px;
  background: var(--vp-c-bg);
  color: var(--vp-c-text-1);
  text-decoration: none;
  transition:
    border-color 0.2s,
    background-color 0.2s;
}

.demo-card:hover,
.demo-card:focus-visible {
  border-color: var(--vp-c-brand-1);
  background: var(--vp-c-bg-soft);
}

.demo-card:focus-visible {
  outline: 2px solid var(--vp-c-brand-1);
  outline-offset: 3px;
}

.demo-content {
  min-width: 0;
  flex: 1;
}

.demo-content,
.demo-heading {
  display: flex;
  flex-direction: column;
  gap: 4px;
}

.demo-host {
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  color: var(--vp-c-text-3);
  font-size: 12px;
  overflow-wrap: anywhere;
}

.demo-detail {
  color: var(--vp-c-text-2);
  font-size: 13px;
  line-height: 1.5;
  overflow-wrap: anywhere;
}

.demo-name {
  font-size: 16px;
  font-weight: 600;
  line-height: 1.5;
  overflow-wrap: anywhere;
}

.demo-visit {
  display: inline-flex;
  flex: 0 0 auto;
  align-items: center;
  justify-content: center;
  width: 24px;
  height: 24px;
  border-radius: 6px;
  color: var(--vp-c-text-3);
  transition:
    color 0.2s,
    background-color 0.2s;
}

.demo-visit svg {
  width: 18px;
  height: 18px;
}

.demo-card:hover .demo-visit,
.demo-card:focus-visible .demo-visit {
  color: var(--vp-c-brand-1);
  background: var(--vp-c-brand-soft);
}

.sr-only {
  position: absolute;
  width: 1px;
  height: 1px;
  padding: 0;
  overflow: hidden;
  clip: rect(0, 0, 0, 0);
  white-space: nowrap;
}

@media (max-width: 560px) {
  .demo-grid {
    grid-template-columns: minmax(0, 1fr);
  }
}
</style>
