<script setup lang="ts">
const props = defineProps<{ siteId: number }>()
const { locale } = useI18n(),
  t = (en: string, zh: string) => (locale.value === 'zh-Hans' ? zh : en)
const endpoint = `/api/sites/${props.siteId}/media/processing-settings`
const { data, error, refresh } = await useFetch<{
  eraseLocation: boolean | number
  revision: number
}>(endpoint)
const erase = ref(!!data.value?.eraseLocation),
  busy = ref(false),
  message = ref('')
async function save() {
  if (!data.value || busy.value) return
  busy.value = true
  message.value = ''
  try {
    await $fetch(endpoint, {
      method: 'POST',
      body: { eraseLocation: erase.value, revision: data.value.revision },
    })
    await refresh()
    message.value = t('Processing settings saved.', '处理设置已保存。')
  } catch {
    message.value = t(
      'Unable to save; reload and retry.',
      '保存失败，请重新加载后重试。',
    )
  } finally {
    busy.value = false
  }
}
</script>
<template>
  <CfCard class="cf-site-settings"
    ><div class="cf-panel-heading">
      <h2>{{ t('Photo processing privacy', '照片处理隐私') }}</h2>
      <p>
        {{
          t(
            'Choose whether new uploads retain their location. Erasure removes GPS from the downloadable image as well as its metadata. It does not apply retroactively.',
            '选择新上传照片是否保留位置。擦除会同时移除可下载原图及元数据中的 GPS，不会自动修改已有照片。',
          )
        }}
      </p>
    </div>
    <div class="cf-panel-body">
      <form
        class="cf-form"
        @submit.prevent="save"
      >
        <label class="processing-toggle"
          ><input
            v-model="erase"
            type="checkbox"
            :disabled="busy || !!error"
          /><span>{{
            t(
              'Automatically erase location on new uploads',
              '自动擦除新上传照片的位置',
            )
          }}</span></label
        >
        <p class="cf-field-hint">
          {{
            t(
              'Use the photo library processing actions to erase locations on existing photos. Live Photo companion videos are retained as uploaded, as in the self-hosted edition.',
              '已有照片可在照片库的处理操作中擦除位置。与自部署版一致，实况照片的配对视频保持上传内容。',
            )
          }}
        </p>
        <p
          v-if="error"
          role="alert"
        >
          {{ t('Unable to load processing settings.', '无法加载处理设置。') }}
        </p>
        <p
          v-if="message"
          role="status"
        >
          {{ message }}
        </p>
        <div class="cf-site-actions">
          <CfButton
            type="submit"
            :disabled="busy || !!error"
            >{{ t('Save settings', '保存设置') }}</CfButton
          ><CfButton
            variant="outline"
            :disabled="busy"
            @click="
              refresh().then(() => {
                erase = !!data?.eraseLocation
              })
            "
            >{{ t('Reload', '重新加载') }}</CfButton
          >
        </div>
      </form>
    </div></CfCard
  >
</template>
<style scoped>
.processing-toggle {
  display: flex;
  align-items: center;
  gap: 8px;
}
.processing-toggle input {
  width: 16px;
  height: 16px;
  flex: none;
  accent-color: var(--primary);
}
</style>
