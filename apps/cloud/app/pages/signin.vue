<script setup lang="ts">
const { t } = useI18n()
const { destination, authLink } = useCloudAuthDestination()

import { accountError } from '../utils/account-error'
const { data: status } = await useFetch('/api/auth/status')
useSeoMeta({
  title: t('cloud.messages.signInChronoframeCloud'),
  robots: 'noindex',
})
const email = ref(''),
  password = ref(''),
  code = ref('')
const mode = ref<'password' | 'email'>('password')
const step = ref<'credentials' | 'code' | 'second'>('credentials')
function setMode(value: 'email' | 'password') {
  mode.value = value
  error.value = ''
}
const authenticatorRequired = ref(false)
const factor = ref<'email' | 'totp' | 'recovery'>('email')
const busy = ref(false),
  error = ref('')
const codeInput = ref<{ $el: HTMLInputElement }>()
async function sendSecond() {
  await $fetch('/api/auth/two-factor/send-otp', { method: 'POST', body: {} })
}
async function submit() {
  if (busy.value) return
  busy.value = true
  error.value = ''
  try {
    if (step.value === 'second') {
      const endpoint =
        factor.value === 'email'
          ? 'verify-otp'
          : factor.value === 'totp'
            ? 'verify-totp'
            : 'verify-backup-code'
      await $fetch(`/api/auth/two-factor/${endpoint}`, {
        method: 'POST',
        body:
          factor.value === 'recovery'
            ? { code: code.value }
            : { code: code.value, trustDevice: false },
      })
    } else if (mode.value === 'email' && step.value === 'credentials') {
      await $fetch('/api/auth/email-otp/send-verification-otp', {
        method: 'POST',
        body: { email: email.value, type: 'sign-in' },
      })
      step.value = 'code'
      return
    } else {
      const result = await $fetch<{
        twoFactorRedirect?: boolean
        twoFactorMethods?: string[]
      }>(
        mode.value === 'password'
          ? '/api/auth/sign-in/email'
          : '/api/auth/sign-in/email-otp',
        {
          method: 'POST',
          body:
            mode.value === 'password'
              ? { email: email.value, password: password.value }
              : { email: email.value, otp: code.value },
        },
      )
      if (result.twoFactorRedirect) {
        step.value = 'second'
        code.value = ''
        authenticatorRequired.value =
          !!result.twoFactorMethods?.includes('totp')
        factor.value = authenticatorRequired.value ? 'totp' : 'email'
        if (!authenticatorRequired.value) await sendSecond()
        return
      }
    }
    await navigateTo(destination.value, { external: true })
  } catch (cause) {
    error.value = accountError(cause, t)
  } finally {
    busy.value = false
    if (step.value !== 'credentials') {
      await nextTick()
      codeInput.value?.$el?.focus()
    }
  }
}
async function passkeySignIn() {
  busy.value = true
  error.value = ''
  try {
    const result = await useCloudAccount().signIn.passkey()
    if (result.error) throw result.error
    await navigateTo(destination.value, { external: true })
  } catch (cause) {
    error.value = accountError(cause, t)
  } finally {
    busy.value = false
  }
}
async function resend() {
  busy.value = true
  error.value = ''
  try {
    if (step.value === 'second') await sendSecond()
    else
      await $fetch('/api/auth/email-otp/send-verification-otp', {
        method: 'POST',
        body: { email: email.value, type: 'sign-in' },
      })
  } catch (cause) {
    error.value = accountError(cause, t)
  } finally {
    busy.value = false
  }
}
</script>
<template>
  <CloudAuthLayout
    ><CfBadge>ChronoFrame Cloud</CfBadge>
    <h1>
      {{
        step === 'second'
          ? $t('cloud.messages.oneMoreStep')
          : step === 'code'
            ? $t('cloud.messages.checkYourInbox')
            : $t('cloud.messages.welcomeBack')
      }}
    </h1>
    <template v-if="status?.enabled"
      ><p>
        {{
          step === 'second'
            ? $t('cloud.messages.completeYourSecondVerificationToContinue')
            : $t('cloud.messages.yourPhotographsYourSpace')
        }}
      </p>
      <div
        v-if="step === 'credentials'"
        class="cf-auth-tabs"
        :aria-label="$t('cloud.messages.signInMethod')"
      >
        <CfButton
          :variant="mode === 'password' ? 'secondary' : 'ghost'"
          :disabled="busy"
          @click="setMode('password')"
          >{{ $t('cloud.messages.password') }}</CfButton
        ><CfButton
          :variant="mode === 'email' ? 'secondary' : 'ghost'"
          :disabled="busy"
          @click="setMode('email')"
          >{{ $t('cloud.messages.emailCode') }}</CfButton
        >
      </div>
      <form
        @submit.prevent="submit"
        :aria-busy="busy"
      >
        <template v-if="step !== 'second'"
          ><label for="email">{{ $t('cloud.messages.emailAddress') }}</label
          ><CfInput
            id="email"
            v-model="email"
            type="email"
            autocomplete="username"
            :disabled="busy || step === 'code'"
            required
        /></template>
        <template v-if="mode === 'password' && step === 'credentials'"
          ><label for="password">{{ $t('cloud.messages.password') }}</label
          ><CfInput
            id="password"
            v-model="password"
            type="password"
            autocomplete="current-password"
            :disabled="busy"
            required
          /><NuxtLink
            class="cf-text-link"
            to="/forgot-password"
            >{{ $t('cloud.messages.forgotYourPassword') }}</NuxtLink
          ></template
        >
        <template v-if="step === 'second'"
          ><label for="factor">{{
            $t('cloud.messages.verificationMethod')
          }}</label
          ><CfSelect
            id="factor"
            v-model="factor"
            :disabled="busy"
            @change="code = ''"
          >
            <option
              v-if="!authenticatorRequired"
              value="email"
            >
              {{ $t('cloud.messages.emailCode') }}
            </option>
            <option value="totp">
              {{ $t('cloud.messages.authenticatorCode') }}
            </option>
            <option value="recovery">
              {{ $t('cloud.messages.recoveryCode') }}
            </option>
          </CfSelect></template
        >
        <template v-if="step !== 'credentials'"
          ><label for="code">{{
            factor === 'recovery' && step === 'second'
              ? $t('cloud.messages.recoveryCode')
              : $t('cloud.messages.verificationCode')
          }}</label
          ><CfInput
            id="code"
            ref="codeInput"
            v-model="code"
            autocomplete="one-time-code"
            :inputmode="
              factor === 'recovery' && step === 'second' ? 'text' : 'numeric'
            "
            :disabled="busy"
            required
          />
          <p class="cf-auth-hint">
            {{
              step === 'code' || factor === 'email'
                ? $t('cloud.messages.enterTheCodeFromYourEmail')
                : $t(
                    'cloud.messages.useYourAuthenticatorOrAnUnusedRecoveryCode',
                  )
            }}
          </p></template
        >
        <p
          v-if="error"
          role="alert"
          class="cf-error-message"
        >
          {{ error }}
        </p>
        <CfButton
          type="submit"
          :loading="busy"
          >{{
            mode === 'email' && step === 'credentials'
              ? $t('cloud.messages.sendSignInCode')
              : $t('cloud.messages.signIn')
          }}</CfButton
        >
        <CfButton
          v-if="
            step !== 'credentials' && (step === 'code' || factor === 'email')
          "
          variant="ghost"
          :disabled="busy"
          @click="resend"
          >{{ $t('cloud.messages.sendANewCode') }}</CfButton
        >
      </form>
      <CfButton
        v-if="step === 'credentials'"
        class="cf-action-spaced"
        variant="secondary"
        :disabled="busy"
        @click="passkeySignIn"
        >{{ $t('cloud.messages.signInWithAPasskey') }}</CfButton
      >
      <p class="cf-auth-hint">
        {{ $t('cloud.messages.newHere')
        }}<NuxtLink
          :to="authLink('/signup')"
          class="cf-text-link"
          >{{ $t('cloud.messages.createAnAccount') }}</NuxtLink
        >
      </p></template
    >
    <p
      v-else
      class="cf-notice"
    >
      {{ $t('cloud.messages.emailSignInIsNotAvailableOnThisDeployment') }}
    </p></CloudAuthLayout
  >
</template>
