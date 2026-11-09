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
const route = useRoute()
const second = ['totp', 'email'].includes(String(route.query.second))
  ? String(route.query.second)
  : ''
const step = ref<'credentials' | 'code' | 'second'>(
  second ? 'second' : 'credentials',
)
function setMode(value: 'email' | 'password') {
  mode.value = value
  error.value = ''
  code.value = ''
}
const authenticatorRequired = ref(second === 'totp')
const factor = ref<'email' | 'totp' | 'recovery'>(
  second === 'totp' ? 'totp' : 'email',
)
const busy = ref(false),
  error = ref(
    route.query.oauthError ? t('cloud.account.socialLoginFailed') : '',
  )
const codeInput = ref<{ focus(): void }>()
const codeStatus = ref<'idle' | 'error' | 'success'>('idle')
const { remaining, start: startCooldown } = useCloudCodeCooldown()
function editCode() {
  error.value = ''
  codeStatus.value = 'idle'
}
function editEmail() {
  step.value = 'credentials'
  code.value = ''
  editCode()
}
function toggleRecovery() {
  factor.value =
    factor.value === 'recovery'
      ? authenticatorRequired.value
        ? 'totp'
        : 'email'
      : 'recovery'
  code.value = ''
  editCode()
  nextTick(() => codeInput.value?.focus())
}
onMounted(() => {
  if (second === 'email') void resend()
})
async function sendSecond() {
  await $fetch('/api/auth/two-factor/send-otp', { method: 'POST', body: {} })
  startCooldown()
}
async function submit() {
  if (
    busy.value ||
    (step.value !== 'credentials' &&
      factor.value !== 'recovery' &&
      !/^[0-9]{6}$/.test(code.value))
  )
    return
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
      startCooldown()
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
    if (step.value !== 'credentials' && factor.value !== 'recovery') {
      codeStatus.value = 'success'
      await new Promise((resolve) => setTimeout(resolve, 250))
    }
    await navigateTo(destination.value, { external: true })
  } catch (cause) {
    if (step.value !== 'credentials') codeStatus.value = 'error'
    error.value = accountError(cause, t)
  } finally {
    busy.value = false
    if (step.value !== 'credentials') {
      await nextTick()
      codeInput.value?.focus()
    }
  }
}
async function passkeySignIn() {
  if (busy.value) return
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
  if (busy.value || remaining.value) return
  code.value = ''
  editCode()
  busy.value = true
  error.value = ''
  try {
    if (step.value === 'second') await sendSecond()
    else
      await $fetch('/api/auth/email-otp/send-verification-otp', {
        method: 'POST',
        body: { email: email.value, type: 'sign-in' },
      })
    if (step.value !== 'second') startCooldown()
  } catch (cause) {
    error.value = accountError(cause, t)
  } finally {
    busy.value = false
  }
}
</script>
<template>
  <CloudAuthLayout>
    <h1>
      {{
        step === 'second'
          ? $t('cloud.messages.oneMoreStep')
          : step === 'code'
            ? $t('cloud.messages.checkYourInbox')
            : $t('cloud.messages.welcomeBack')
      }}
    </h1>
    <template v-if="status?.enabled">
      <p>
        {{
          step === 'second'
            ? $t('cloud.messages.completeYourSecondVerificationToContinue')
            : step === 'code'
              ? $t('cloud.messages.enterTheCodeFromYourEmail')
              : $t('cloud.messages.yourPhotographsYourSpace')
        }}
      </p>
      <div
        v-if="step === 'credentials' && status.emailEnabled"
        class="cf-auth-tabs"
        :aria-label="$t('cloud.messages.signInMethod')"
      >
        <CfButton
          :variant="mode === 'password' ? 'secondary' : 'ghost'"
          :aria-pressed="mode === 'password'"
          :disabled="busy"
          @click="setMode('password')"
          >{{ $t('cloud.messages.password') }}</CfButton
        >
        <CfButton
          :variant="mode === 'email' ? 'secondary' : 'ghost'"
          :aria-pressed="mode === 'email'"
          :disabled="busy"
          @click="setMode('email')"
          >{{ $t('cloud.messages.emailCode') }}</CfButton
        >
      </div>
      <form
        v-if="status.emailEnabled || step === 'second'"
        @submit.prevent="submit"
        :aria-busy="busy"
      >
        <div
          v-if="step === 'credentials'"
          class="cf-auth-field"
        >
          <label for="email">{{ $t('cloud.messages.emailAddress') }}</label>
          <CfInput
            id="email"
            v-model="email"
            type="email"
            autocomplete="username"
            :disabled="busy"
            required
          />
        </div>
        <div
          v-if="mode === 'password' && step === 'credentials'"
          class="cf-auth-field"
        >
          <div class="cf-auth-label-row">
            <label for="password">{{ $t('cloud.messages.password') }}</label
            ><NuxtLink
              class="cf-text-link"
              :to="authLink('/forgot-password')"
              >{{ $t('cloud.messages.forgotYourPassword') }}</NuxtLink
            >
          </div>
          <CloudPasswordInput
            id="password"
            v-model="password"
            autocomplete="current-password"
            :disabled="busy"
            required
          />
        </div>
        <div
          v-if="step === 'code'"
          class="cf-auth-recipient"
        >
          <span>{{ email }}</span
          ><CfButton
            variant="ghost"
            size="sm"
            :disabled="busy"
            @click="editEmail"
            >{{ $t('cloud.auth.changeEmail') }}</CfButton
          >
        </div>
        <div
          v-if="step !== 'credentials'"
          class="cf-auth-field cf-auth-code-field"
        >
          <label for="code">{{
            step === 'second' && factor === 'recovery'
              ? $t('cloud.messages.recoveryCode')
              : step === 'second' && factor === 'totp'
                ? $t('cloud.messages.authenticatorCode')
                : $t('cloud.messages.verificationCode')
          }}</label>
          <CfInput
            v-if="step === 'second' && factor === 'recovery'"
            id="code"
            ref="codeInput"
            v-model="code"
            autocomplete="off"
            :disabled="busy"
            required
            @input="editCode"
          />
          <CfCodeSlots
            v-else
            id="code"
            ref="codeInput"
            v-model="code"
            :aria-label="$t('cloud.messages.verificationCode')"
            :status="codeStatus"
            :disabled="busy"
            :aria-describedby="
              error ? 'auth-code-hint auth-error' : 'auth-code-hint'
            "
            required
            autofocus
            @edit="editCode"
            @complete="submit"
          />
          <p
            id="auth-code-hint"
            class="cf-auth-hint"
          >
            {{
              step === 'code' || factor === 'email'
                ? $t('cloud.messages.enterTheCodeFromYourEmail')
                : $t(
                    'cloud.messages.useYourAuthenticatorOrAnUnusedRecoveryCode',
                  )
            }}
          </p>
        </div>
        <p
          v-if="error"
          id="auth-error"
          role="alert"
          class="cf-error-message"
        >
          {{ error }}
        </p>
        <CfButton
          type="submit"
          :loading="busy"
          :disabled="
            step !== 'credentials' &&
            (factor === 'recovery' ? !code.trim() : code.length !== 6)
          "
          >{{
            mode === 'email' && step === 'credentials'
              ? $t('cloud.messages.sendSignInCode')
              : step !== 'credentials'
                ? $t('cloud.auth.verifyAndContinue')
                : $t('cloud.messages.signIn')
          }}</CfButton
        >
        <div
          v-if="step !== 'credentials'"
          class="cf-auth-code-actions"
        >
          <CfButton
            v-if="step === 'code' || factor === 'email'"
            variant="ghost"
            :disabled="busy || remaining > 0"
            @click="resend"
            >{{
              remaining > 0
                ? $t('cloud.auth.resendIn', { seconds: remaining })
                : $t('cloud.messages.sendANewCode')
            }}</CfButton
          >
          <CfButton
            v-if="step === 'second'"
            variant="ghost"
            :disabled="busy"
            @click="toggleRecovery"
            >{{
              factor === 'recovery'
                ? $t('cloud.auth.useVerificationCode')
                : $t('cloud.auth.useRecoveryCode')
            }}</CfButton
          >
        </div>
      </form>
      <p
        v-if="error && !status.emailEnabled && step !== 'second'"
        class="cf-error-message"
        role="alert"
      >
        {{ error }}
      </p>
      <div
        v-if="step === 'credentials'"
        class="cf-auth-alternatives"
      >
        <USeparator
          v-if="status.emailEnabled"
          :label="$t('cloud.account.orContinueWith')"
        />
        <CfButton
          variant="outline"
          :disabled="busy"
          leading-icon="i-lucide-key-round"
          @click="passkeySignIn"
          >{{ $t('cloud.messages.signInWithAPasskey') }}</CfButton
        >
        <CloudSocialLogin
          v-model:busy="busy"
          :providers="status.providers ?? []"
        />
      </div>
      <p class="cf-auth-footer">
        {{ $t('cloud.messages.newHere')
        }}<NuxtLink
          :to="authLink('/signup')"
          class="cf-text-link"
          >{{ $t('cloud.messages.createAnAccount') }}</NuxtLink
        >
      </p>
    </template>
    <p
      v-else
      class="cf-notice"
    >
      {{ $t('cloud.messages.emailSignInIsNotAvailableOnThisDeployment') }}
    </p>
  </CloudAuthLayout>
</template>
