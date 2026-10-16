<script setup lang="ts">
import { computed } from 'vue'
import { useData } from 'vitepress'
const { lang } = useData()
const chinese = computed(() => lang.value.startsWith('zh'))
const choices = computed(() =>
  chinese.value
    ? [
        {
          title: '本地文件系统',
          tag: '直接开始',
          href: '#本地文件系统',
          text: '把照片保存在自己的服务器或 NAS。',
          need: '准备可写的挂载目录',
          note: '自行管理磁盘容量和备份',
        },
        {
          title: 'S3 兼容存储',
          tag: '对象存储',
          href: '#s3-兼容存储',
          text: '接入云存储或已有的 MinIO 服务。',
          need: '准备存储桶、Endpoint 和密钥',
          note: '配置 CORS 和图片读取地址',
        },
        {
          title: 'OpenList',
          tag: '网盘与 NAS',
          href: '#openlist',
          text: '使用已经挂载到 OpenList 的存储。',
          need: '准备服务地址、根路径和令牌',
          note: '检查权限、限速和下载地址有效期',
        },
      ]
    : [
        {
          title: 'Local filesystem',
          tag: 'Start here',
          href: '#local-filesystem',
          text: 'Keep photos on your own server or NAS.',
          need: 'A writable, mounted directory',
          note: 'Manage disk capacity and backups',
        },
        {
          title: 'S3-compatible',
          tag: 'Object storage',
          href: '#s3-compatible-storage',
          text: 'Connect cloud storage or an existing MinIO service.',
          need: 'Bucket, endpoint and credentials',
          note: 'Configure CORS and image read URLs',
        },
        {
          title: 'OpenList',
          tag: 'Drives and NAS',
          href: '#openlist',
          text: 'Use storage already mounted in OpenList.',
          need: 'Service URL, root path and token',
          note: 'Check permissions, limits and URL expiry',
        },
      ],
)
</script>

<template>
  <div class="storage-choices">
    <a
      v-for="choice in choices"
      :key="choice.href"
      :href="choice.href"
      class="storage-choice"
    >
      <span class="choice-tag">{{ choice.tag }}</span>
      <strong>{{ choice.title }} <span aria-hidden="true">↗</span></strong>
      <span class="choice-text">{{ choice.text }}</span>
      <span class="choice-notes"
        ><span>{{ choice.need }}</span
        ><span>{{ choice.note }}</span></span
      >
    </a>
  </div>
</template>

<style scoped>
.storage-choices {
  display: grid;
  grid-template-columns: repeat(3, minmax(0, 1fr));
  gap: 12px;
  margin: 20px 0;
}
.storage-choice {
  display: flex;
  flex-direction: column;
  gap: 10px;
  padding: 16px;
  border: 1px solid var(--vp-c-divider);
  border-radius: 10px;
  text-decoration: none;
  color: var(--vp-c-text-1);
}
.storage-choice:hover {
  border-color: var(--vp-c-brand-1);
  background: var(--vp-c-bg-soft);
}
.storage-choice:focus-visible {
  outline: 2px solid var(--vp-c-brand-1);
  outline-offset: 3px;
}
.choice-tag {
  color: var(--vp-c-brand-1);
  font-size: 12px;
  font-weight: 500;
}
.storage-choice strong {
  font-size: 16px;
}
.storage-choice strong span {
  float: right;
  color: var(--vp-c-text-3);
}
.choice-text {
  color: var(--vp-c-text-2);
  font-size: 14px;
  line-height: 1.6;
}
.choice-notes {
  display: flex;
  flex-direction: column;
  gap: 5px;
  margin-top: auto;
  padding-top: 10px;
  border-top: 1px solid var(--vp-c-divider);
  color: var(--vp-c-text-2);
  font-size: 12px;
  line-height: 1.6;
}
@media (max-width: 700px) {
  .storage-choices {
    grid-template-columns: 1fr;
  }
}
</style>
