<script setup lang="ts">
import type { LegalDocument } from '../../../../../packages/platform/src/legal'
definePageMeta({
  layout: false,
  validate: (route) => ['terms', 'privacy'].includes(String(route.params.kind)),
})
const route = useRoute(),
  { locale, t, setLocale } = useI18n()
const kind = computed(() => String(route.params.kind))
const {
  data: document,
  status,
  error,
  refresh,
} = await useFetch<LegalDocument>(() => '/api/legal/' + kind.value, {
  query: { locale },
  key: computed(() => 'legal:' + kind.value + ':' + locale.value),
})
useSeoMeta({
  title: () =>
    (document.value?.title ?? t('cloud.legal.' + kind.value)) +
    ' — ChronoFrame Cloud',
})
const language = computed({
  get: () => locale.value,
  set: (value) => {
    void setLocale(value as 'en' | 'zh-Hans')
  },
})
const updated = computed(() =>
  document.value?.updatedAt
    ? new Intl.DateTimeFormat(locale.value === 'zh-Hans' ? 'zh-CN' : 'en', {
        dateStyle: 'medium',
        timeZone: 'UTC',
      }).format(document.value.updatedAt)
    : null,
)
</script>
<template>
  <div class="cf-marketing">
    <CloudMarketingHeader />
    <main
      id="main-content"
      class="cf-legal-page"
      tabindex="-1"
    >
      <div class="cf-legal-toolbar">
        <CloudLegalLinks /><label class="cf-legal-language"
          >{{ $t('cloud.legal.language')
          }}<CfSelect v-model="language"
            ><option
              value="en"
              :selected="locale === 'en'"
            >
              English
            </option>
            <option
              value="zh-Hans"
              :selected="locale === 'zh-Hans'"
            >
              简体中文
            </option></CfSelect
          ></label
        >
      </div>
      <CfAlert
        v-if="error"
        tone="error"
        >{{ $t('cloud.legal.loadFailed')
        }}<CfButton
          variant="secondary"
          @click="refresh()"
          >{{ $t('cloud.messages.retry') }}</CfButton
        ></CfAlert
      >
      <article
        v-else-if="document"
        :aria-busy="status === 'pending'"
      >
        <header class="cf-legal-heading">
          <p class="cf-eyebrow">ChronoFrame Cloud</p>
          <h1>{{ document.title }}</h1>
          <div class="cf-legal-dates">
            <span
              >{{ $t('cloud.legal.effective') }}
              <time :datetime="document.effectiveOn">{{
                document.effectiveOn
              }}</time></span
            ><span v-if="updated"
              >{{ $t('cloud.legal.revised') }}
              <time :datetime="new Date(document.updatedAt!).toISOString()">{{
                updated
              }}</time></span
            >
          </div>
        </header>
        <CfMarkdown :source="document.markdown" />
      </article>
      <CfSkeleton
        v-else
        class="cf-legal-skeleton"
        :aria-label="$t('cloud.messages.loading')"
      />
    </main>
  </div>
</template>
