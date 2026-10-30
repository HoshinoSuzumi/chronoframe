<script setup lang="ts">
const props = defineProps<{ siteId: number }>()
const { locale } = useI18n()
const store = useSettingsStore()
const context = useEntryContext()
const t = (en: string, zh: string) => (locale.value === 'zh-Hans' ? zh : en)
const { data, error, refresh } = await useFetch(
  `/api/sites/${props.siteId}/map`,
  { key: `site-maps-${props.siteId}` },
)
const own = ref(!!data.value?.config)
const draft = ref({
  provider: 'maplibre',
  'mapbox.token': '',
  'mapbox.style': '',
  'maplibre.token': '',
  'maplibre.style': '',
  ...data.value?.config,
})
const busy = ref(false),
  message = ref(''),
  failed = ref(false)
async function save() {
  if (!data.value || busy.value) return
  busy.value = true
  message.value = ''
  failed.value = false
  try {
    await $fetch(`/api/sites/${props.siteId}/map`, {
      method: 'PUT',
      body: {
        revision: data.value.revision,
        config: own.value ? draft.value : null,
      },
    })
    await refresh()
    if (context.value?.siteId === props.siteId && data.value)
      store.data.map = { ...data.value.effective }
    message.value = t('Map settings saved.', '地图设置已保存。')
  } catch {
    failed.value = true
    message.value = t(
      'Unable to save. Check public tokens and style URLs, then reload if someone else changed these settings.',
      '保存失败，请检查公共令牌和样式地址；如设置已被他人更改，请刷新后重试。',
    )
  } finally {
    busy.value = false
  }
}
</script>
<template>
  <section class="cf-card cf-card-pad">
    <h2 class="cf-section-title">{{ t('Maps', '地图') }}</h2>
    <p class="cf-muted">
      {{
        t(
          'Use platform maps or your own Mapbox / MapTiler browser keys for this site. These keys and style URLs are public. Restrict them to your gallery domains; never enter a secret key.',
          '此站点可使用平台地图，或配置自己的 Mapbox／MapTiler 浏览器公共密钥。密钥及样式地址会公开发送到浏览器，请限制允许的图库域名，切勿填写服务端密钥。',
        )
      }}
    </p>
    <CfAlert
      v-if="error"
      tone="error"
      >{{ t('Unable to load map settings.', '无法加载地图设置。') }}</CfAlert
    >
    <form
      v-else-if="data"
      class="map-form"
      @submit.prevent="save"
    >
      <fieldset :disabled="busy || data.role !== 'admin'">
        <label
          ><CfSelect
            :model-value="String(own)"
            @update:model-value="own = $event === 'true'"
            ><option value="false">
              {{ t('Use platform defaults', '使用平台默认配置') }}
            </option>
            <option value="true">
              {{ t('Use my own configuration', '使用自定义配置') }}
            </option></CfSelect
          ></label
        >
        <template v-if="own">
          <label
            >{{ t('Provider', '地图服务')
            }}<CfSelect v-model="draft.provider"
              ><option value="mapbox">Mapbox</option>
              <option value="maplibre">MapTiler (MapLibre)</option></CfSelect
            ></label
          >
          <label
            >{{ t('Mapbox public token (pk.)', 'Mapbox 公共令牌（pk.）')
            }}<CfInput
              v-model="draft['mapbox.token']"
              autocomplete="off"
              maxlength="1024"
          /></label>
          <label
            >{{ t('Mapbox style (optional)', 'Mapbox 样式（可选）')
            }}<CfInput
              v-model="draft['mapbox.style']"
              placeholder="mapbox://styles/mapbox/standard"
              maxlength="2048"
          /></label>
          <label
            >{{ t('MapTiler public key', 'MapTiler 公共密钥')
            }}<CfInput
              v-model="draft['maplibre.token']"
              autocomplete="off"
              maxlength="256"
          /></label>
          <label
            >{{ t('MapLibre style URL (optional)', 'MapLibre 样式地址（可选）')
            }}<CfInput
              v-model="draft['maplibre.style']"
              placeholder="https://…"
              maxlength="2048"
          /></label>
        </template>
        <CfButton
          type="submit"
          :loading="busy"
          >{{ t('Save maps', '保存地图设置') }}</CfButton
        >
      </fieldset>
      <CfAlert
        v-if="message"
        :tone="failed ? 'error' : 'info'"
        >{{ message }}</CfAlert
      >
    </form>
  </section>
</template>
<style scoped>
.map-form {
  margin-top: 1.5rem;
}
fieldset {
  border: 0;
  padding: 0;
  margin: 0;
  display: grid;
  gap: 1rem;
  max-width: 44rem;
}
label {
  display: grid;
  gap: 0.5rem;
}
</style>
