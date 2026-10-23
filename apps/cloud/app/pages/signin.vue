<script setup lang="ts">
import { accountError } from '../utils/account-error'
const { data: status } = await useFetch('/api/auth/status')
useSeoMeta({ title: 'Sign in — ChronoFrame Cloud', robots: 'noindex' })
const email = ref(''),
  password = ref(''),
  code = ref('')
const mode = ref<'password' | 'email'>('password')
const step = ref<'credentials' | 'code' | 'second'>('credentials')
function setMode(value: 'email' | 'password') {
  mode.value = value
  error.value = ''
}
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
      const result = await $fetch<{ twoFactorRedirect?: boolean }>(
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
        await sendSecond()
        return
      }
    }
    clearNuxtData()
    await navigateTo('/sites', { external: true })
  } catch (cause) {
    error.value = accountError(cause)
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
    clearNuxtData()
    await navigateTo('/sites', { external: true })
  } catch {
    error.value =
      'Passkey sign-in was not completed. Try again or use your email.'
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
    error.value = accountError(cause)
  } finally {
    busy.value = false
  }
}
</script>
<template>
  <CloudAuthLayout
    ><CloudBadge>ChronoFrame Cloud</CloudBadge>
    <h1>
      {{
        step === 'second'
          ? 'One more step.'
          : step === 'code'
            ? 'Check your inbox.'
            : 'Welcome back.'
      }}
    </h1>
    <template v-if="status?.enabled"
      ><p>
        {{
          step === 'second'
            ? 'Complete your second verification to continue.'
            : 'Your photographs. Your space.'
        }}
      </p>
      <div
        v-if="step === 'credentials'"
        class="cf-auth-tabs"
        aria-label="Sign-in method"
      >
        <CloudButton
          :variant="mode === 'password' ? 'secondary' : 'ghost'"
          :disabled="busy"
          @click="setMode('password')"
          >Password</CloudButton
        ><CloudButton
          :variant="mode === 'email' ? 'secondary' : 'ghost'"
          :disabled="busy"
          @click="setMode('email')"
          >Email code</CloudButton
        >
      </div>
      <form
        @submit.prevent="submit"
        :aria-busy="busy"
      >
        <template v-if="step !== 'second'"
          ><label for="email">Email address</label
          ><CloudInput
            id="email"
            v-model="email"
            type="email"
            autocomplete="username"
            :disabled="busy || step === 'code'"
            required
        /></template>
        <template v-if="mode === 'password' && step === 'credentials'"
          ><label for="password">Password</label
          ><CloudInput
            id="password"
            v-model="password"
            type="password"
            autocomplete="current-password"
            :disabled="busy"
            required
          /><NuxtLink
            class="cf-text-link"
            to="/forgot-password"
            >Forgot your password?</NuxtLink
          ></template
        >
        <template v-if="step === 'second'"
          ><label for="factor">Verification method</label
          ><select
            id="factor"
            v-model="factor"
            :disabled="busy"
            @change="code = ''"
          >
            <option value="email">Email code</option>
            <option value="totp">Authenticator code</option>
            <option value="recovery">Recovery code</option>
          </select></template
        >
        <template v-if="step !== 'credentials'"
          ><label for="code">{{
            factor === 'recovery' && step === 'second'
              ? 'Recovery code'
              : 'Verification code'
          }}</label
          ><CloudInput
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
                ? 'Enter the code from your email.'
                : 'Use your authenticator or an unused recovery code.'
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
        <CloudButton
          type="submit"
          :loading="busy"
          >{{
            mode === 'email' && step === 'credentials'
              ? 'Send sign-in code'
              : 'Sign in'
          }}</CloudButton
        >
        <CloudButton
          v-if="
            step !== 'credentials' && (step === 'code' || factor === 'email')
          "
          variant="ghost"
          :disabled="busy"
          @click="resend"
          >Send a new code</CloudButton
        >
      </form>
      <CloudButton
        v-if="step === 'credentials'"
        class="cf-action-spaced"
        variant="secondary"
        :disabled="busy"
        @click="passkeySignIn"
        >Sign in with a passkey</CloudButton
      >
      <p class="cf-auth-hint">
        New here?
        <NuxtLink
          to="/signup"
          class="cf-text-link"
          >Create an account</NuxtLink
        >
      </p></template
    >
    <p
      v-else
      class="cf-notice"
    >
      Email sign-in is not available on this deployment yet.
    </p></CloudAuthLayout
  >
</template>
