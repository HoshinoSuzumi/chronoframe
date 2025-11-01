<template>
  <div class="space-y-6">
    <!-- 页面标题 -->
    <div class="border-b pb-4">
      <h1 class="text-2xl font-bold">设置</h1>
      <p class="text-gray-500 dark:text-gray-400 text-sm mt-1">管理应用程序设置和偏好</p>
    </div>

    <!-- 通用设置卡片 -->
    <UCard variant="soft">
      <template #header>
        <div class="flex items-center gap-2">
          <UIcon name="i-heroicons-cog-6-tooth" class="text-primary" />
          <h2 class="text-lg font-semibold">通用设置</h2>
        </div>
      </template>

      <div class="space-y-6">
        <!-- 文本输入 -->
        <UFormField label="应用名称" description="设置你的应用显示名称">
          <UInput
            v-model="formData.appName"
            placeholder="输入应用名称"
            icon="i-heroicons-pencil"
          />
        </UFormField>

        <!-- 描述文本 -->
        <UFormField label="应用描述" description="简要描述你的应用功能">
          <UTextarea
            v-model="formData.appDescription"
            placeholder="输入应用描述..."
            :rows="3"
            autoresize
          />
        </UFormField>

        <!-- 数字输入 -->
        <UFormField label="每页显示条数" description="设置列表页每页显示的条目数">
          <UInputNumber
            v-model="formData.itemsPerPage"
            :min="10"
            :max="100"
            :step="10"
          />
        </UFormField>

        <!-- 下拉选择 -->
        <UFormField label="主题" description="选择应用的主题">
          <USelect
            v-model="formData.theme"
            :options="themeOptions"
            option-attribute="label"
            value-attribute="value"
            placeholder="选择主题"
          />
        </UFormField>

        <!-- 开关切换 -->
        <UFormField>
          <USwitch
            v-model="formData.darkMode"
            label="深色模式"
            description="启用深色主题"
          />
        </UFormField>
      </div>
    </UCard>

    <!-- 存储设置卡片 -->
    <UCard variant="soft">
      <template #header>
        <div class="flex items-center gap-2">
          <UIcon name="i-heroicons-cloud" class="text-primary" />
          <h2 class="text-lg font-semibold">存储设置</h2>
        </div>
      </template>

      <div class="space-y-6">
        <!-- 存储提供商选择 -->
        <UFormField label="存储提供商" description="选择要使用的存储服务">
          <USelect
            v-model="formData.storageProvider"
            :options="storageProviderOptions"
            option-attribute="label"
            value-attribute="value"
            placeholder="选择存储提供商"
          />
        </UFormField>

        <!-- 存储桶名称 -->
        <UFormField label="存储桶名称" description="存储文件的 S3 存储桶名称">
          <UInput
            v-model="formData.bucketName"
            placeholder="e.g., my-bucket"
            icon="i-heroicons-server-stack"
          />
        </UFormField>

        <!-- 最大上传大小 -->
        <UFormField label="最大上传大小 (MB)" description="限制单个文件的最大上传大小">
          <UInputNumber
            v-model="formData.maxUploadSize"
            :min="1"
            :max="1000"
            :step="10"
          />
        </UFormField>

        <!-- 自动备份开关 -->
        <UFormField>
          <USwitch
            v-model="formData.autoBackup"
            label="自动备份"
            description="定期将数据备份到存储服务"
          />
        </UFormField>
      </div>
    </UCard>

    <!-- 显示设置卡片 -->
    <UCard variant="soft">
      <template #header>
        <div class="flex items-center gap-2">
          <UIcon name="i-heroicons-eye" class="text-primary" />
          <h2 class="text-lg font-semibold">显示设置</h2>
        </div>
      </template>

      <div class="space-y-6">
        <!-- 布局选择 -->
        <UFormField label="默认布局" description="选择相册默认显示方式">
          <USelect
            v-model="formData.defaultLayout"
            :options="layoutOptions"
            option-attribute="label"
            value-attribute="value"
            placeholder="选择布局"
          />
        </UFormField>

        <!-- 图片加载质量 -->
        <UFormField label="图片加载质量" description="选择缩略图的质量等级">
          <USelect
            v-model="formData.imageQuality"
            :options="qualityOptions"
            option-attribute="label"
            value-attribute="value"
            placeholder="选择质量"
          />
        </UFormField>

        <!-- 每行显示列数 -->
        <UFormField label="每行显示列数" description="网格布局中每行显示的列数">
          <UInputNumber
            v-model="formData.columnsPerRow"
            :min="2"
            :max="10"
            :step="1"
          />
        </UFormField>

        <!-- 显示文件信息 -->
        <UFormField>
          <USwitch
            v-model="formData.showFileInfo"
            label="显示文件信息"
            description="在图片下方显示文件名和大小"
          />
        </UFormField>

        <!-- 启用图片预览 -->
        <UFormField>
          <USwitch
            v-model="formData.enablePreview"
            label="启用快速预览"
            description="鼠标悬停时显示快速预览"
          />
        </UFormField>
      </div>
    </UCard>

    <!-- 性能设置卡片 -->
    <UCard variant="soft">
      <template #header>
        <div class="flex items-center gap-2">
          <UIcon name="i-heroicons-bolt" class="text-primary" />
          <h2 class="text-lg font-semibold">性能设置</h2>
        </div>
      </template>

      <div class="space-y-6">
        <!-- 缓存大小 -->
        <UFormField label="缓存大小 (MB)" description="本地缓存的最大大小">
          <UInputNumber
            v-model="formData.cacheSize"
            :min="10"
            :max="500"
            :step="50"
          />
        </UFormField>

        <!-- 预加载配置 -->
        <UFormField label="预加载条数" description="滚动时预加载的图片数量">
          <UInputNumber
            v-model="formData.preloadCount"
            :min="5"
            :max="50"
            :step="5"
          />
        </UFormField>

        <!-- 启用压缩 -->
        <UFormField>
          <USwitch
            v-model="formData.enableCompression"
            label="启用压缩"
            description="传输前压缩图片以减少带宽"
          />
        </UFormField>

        <!-- 启用缓存 -->
        <UFormField>
          <USwitch
            v-model="formData.enableCache"
            label="启用缓存"
            description="缓存已加载的图片到本地"
          />
        </UFormField>
      </div>
    </UCard>

    <!-- 通知设置卡片 -->
    <UCard variant="soft">
      <template #header>
        <div class="flex items-center gap-2">
          <UIcon name="i-heroicons-bell" class="text-primary" />
          <h2 class="text-lg font-semibold">通知设置</h2>
        </div>
      </template>

      <div class="space-y-6">
        <!-- 通知频率 -->
        <UFormField label="通知频率" description="接收应用通知的频率">
          <USelect
            v-model="formData.notificationFrequency"
            :options="frequencyOptions"
            option-attribute="label"
            value-attribute="value"
            placeholder="选择频率"
          />
        </UFormField>

        <!-- 邮件通知 -->
        <UFormField>
          <USwitch
            v-model="formData.emailNotification"
            label="邮件通知"
            description="通过邮件接收重要通知"
          />
        </UFormField>

        <!-- 上传完成提醒 -->
        <UFormField>
          <USwitch
            v-model="formData.uploadNotification"
            label="上传完成提醒"
            description="上传完成时显示提醒"
          />
        </UFormField>

        <!-- 错误通知 -->
        <UFormField>
          <USwitch
            v-model="formData.errorNotification"
            label="错误通知"
            description="发生错误时立即通知"
          />
        </UFormField>
      </div>
    </UCard>

    <!-- 操作按钮 -->
    <div class="flex gap-3 justify-end border-t pt-6">
      <UButton variant="outline" @click="resetForm">重置</UButton>
      <UButton @click="saveSettings">保存设置</UButton>
    </div>
  </div>
</template>

<script setup lang="ts">
definePageMeta({
  layout: 'dashboard',
})

// 定义选项
const themeOptions = [
  { label: '亮色', value: 'light' },
  { label: '深色', value: 'dark' },
  { label: '自动', value: 'auto' }
]

const storageProviderOptions = [
  { label: 'Amazon S3', value: 's3' },
  { label: 'Cloudflare R2', value: 'r2' },
  { label: 'GitHub', value: 'github' },
  { label: '本地存储', value: 'local' }
]

const layoutOptions = [
  { label: '网格布局', value: 'grid' },
  { label: '列表布局', value: 'list' },
  { label: '瀑布流', value: 'masonry' },
  { label: '时间轴', value: 'timeline' }
]

const qualityOptions = [
  { label: '低质量 (快速)', value: 'low' },
  { label: '中等质量', value: 'medium' },
  { label: '高质量', value: 'high' },
  { label: '原始质量', value: 'original' }
]

const frequencyOptions = [
  { label: '从不', value: 'never' },
  { label: '仅重要', value: 'important' },
  { label: '每日摘要', value: 'daily' },
  { label: '实时', value: 'realtime' }
]

// 表单数据
const formData = ref({
  // 通用设置
  appName: 'ChronoFrame',
  appDescription: '高性能照片管理和相册应用',
  itemsPerPage: 20,
  theme: 'auto',
  darkMode: false,

  // 存储设置
  storageProvider: 's3',
  bucketName: 'photos-bucket',
  maxUploadSize: 100,
  autoBackup: true,

  // 显示设置
  defaultLayout: 'masonry',
  imageQuality: 'high',
  columnsPerRow: 4,
  showFileInfo: true,
  enablePreview: true,

  // 性能设置
  cacheSize: 200,
  preloadCount: 20,
  enableCompression: true,
  enableCache: true,

  // 通知设置
  notificationFrequency: 'important',
  emailNotification: false,
  uploadNotification: true,
  errorNotification: true
})

// 原始表单数据备份
const originalFormData = JSON.parse(JSON.stringify(formData.value))

// 保存设置
const saveSettings = () => {
  console.log('保存设置:', formData.value)
  // TODO: 接入数据保存逻辑
}

// 重置表单
const resetForm = () => {
  formData.value = JSON.parse(JSON.stringify(originalFormData))
  console.log('已重置表单')
}
</script>

<style scoped>
/* 自定义样式可根据需要添加 */
</style>
