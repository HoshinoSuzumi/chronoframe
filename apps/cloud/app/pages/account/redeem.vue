<script setup lang="ts">
import { billingError } from '../../utils/billing-format'
definePageMeta({ layout: 'portal' })
const { t, locale } = useI18n(),
  { workspaces, selected, error, listError, refresh, ready } =
    useWorkspaceBilling(true),
  code = ref(''),
  preview = ref<any>(null),
  busy = ref(false),
  failure = ref(''),
  receipt = ref<any>(null),
  requestId = ref('')
await ready
useSeoMeta({
  title: t('cloud.billing.redeem') + ' — ChronoFrame Cloud',
  robots: 'noindex',
})
watch([code, selected], () => {
  preview.value = null
  receipt.value = null
  requestId.value = ''
  failure.value = ''
})
async function inspect() {
  busy.value = true
  failure.value = ''
  try {
    preview.value = await $fetch('/api/billing/redeem', {
      method: 'POST',
      body: {
        action: 'preview',
        workspaceId: selected.value,
        code: code.value,
      },
    })
    requestId.value = crypto.randomUUID()
  } catch (error) {
    failure.value = billingError(error, t)
  } finally {
    busy.value = false
  }
}
async function redeem() {
  if (!preview.value || busy.value) return
  busy.value = true
  failure.value = ''
  try {
    receipt.value = await $fetch('/api/billing/redeem', {
      method: 'POST',
      body: {
        action: 'redeem',
        workspaceId: selected.value,
        code: code.value,
        revision: preview.value.revision,
        requestId: requestId.value,
      },
    })
    preview.value = null
    await refresh().catch(() => {})
  } catch (error: any) {
    failure.value = billingError(error, t)
    const code = error?.data?.data?.code ?? error?.data?.code
    if (
      [
        'subscription_changed',
        'redemption_changed',
        'invalid_activation_code',
      ].includes(code)
    ) {
      preview.value = null
      requestId.value = ''
    }
  } finally {
    busy.value = false
  }
}
watch(code, (value) => {
  if (value !== value.toUpperCase()) code.value = value.toUpperCase()
})
const date = (time: number) => new Date(time).toLocaleString(locale.value)
</script>
<template>
  <div class="cf-redeem-page">
    <div class="cf-page-heading">
      <div>
        <h1 class="cf-page-title">{{ $t('cloud.billing.redeem') }}</h1>
        <p class="cf-page-description">{{ $t('cloud.billing.redeemHelp') }}</p>
      </div>
    </div>
    <CfCard
      ><form
        class="cf-form"
        @submit.prevent="inspect"
      >
        <label class="cf-field"
          >{{ $t('cloud.billing.code')
          }}<CfInput
            v-model="code"
            required
            maxlength="128"
            autocomplete="off"
            spellcheck="false"
            placeholder="RB6CQ4TAE5GL"
            :disabled="busy || !!receipt"
        /></label>
        <p class="cf-field-hint">{{ $t('cloud.billing.codeHelp') }}</p>
        <CfButton
          v-if="!preview && !receipt"
          type="submit"
          :disabled="busy || !selected || !code.trim()"
          >{{
            busy ? $t('cloud.billing.loading') : $t('cloud.billing.checkCode')
          }}</CfButton
        >
        <p
          v-if="!workspaces.length"
          role="alert"
          class="cf-error-message"
        >
          {{ $t('cloud.billing.adminOnly') }}
        </p>
      </form>
      <div
        v-if="preview"
        class="cf-redemption-preview"
      >
        <h2>{{ $t('cloud.billing.confirmRedeem') }}</h2>
        <dl>
          <dt>{{ $t('cloud.billing.current') }}</dt>
          <dd>{{ preview.current.planName }}</dd>
          <dt>{{ $t('cloud.billing.newTier') }}</dt>
          <dd>{{ preview.grant.planName }}</dd>
          <dt>{{ $t('cloud.billing.expiry') }}</dt>
          <dd>
            {{
              preview.grant.expiresAt
                ? date(preview.grant.expiresAt)
                : $t('cloud.billing.noExpiry')
            }}
          </dd>
        </dl>
        <p>
          {{
            $t(
              'cloud.billing.' +
                (preview.grant.mode === 'extend'
                  ? 'extendHelp'
                  : 'replaceHelp'),
            )
          }}
        </p>
        <CfButton
          :disabled="busy"
          @click="redeem"
          >{{ $t('cloud.billing.confirmRedeem') }}</CfButton
        ><CfButton
          variant="ghost"
          :disabled="busy"
          @click="preview = null"
          >{{ $t('cloud.billing.cancel') }}</CfButton
        >
      </div>
      <div
        v-if="receipt"
        class="cf-notice"
        role="status"
      >
        <h2>{{ $t('cloud.billing.redeemed') }}</h2>
        <p>
          {{ receipt.grant.planName }} ·
          {{
            receipt.grant.expiresAt
              ? date(receipt.grant.expiresAt)
              : $t('cloud.billing.noExpiry')
          }}
        </p>
        <NuxtLink :to="'/account/plan'">{{
          $t('cloud.billing.viewPlan')
        }}</NuxtLink>
      </div>
      <p
        v-if="listError || error"
        role="alert"
        class="cf-error-message"
      >
        {{ $t('cloud.billing.failed') }}
      </p>
      <p
        v-if="failure"
        role="alert"
        class="cf-error-message"
      >
        {{ failure }}
      </p></CfCard
    >
    <CloudLegalLinks />
  </div>
</template>
