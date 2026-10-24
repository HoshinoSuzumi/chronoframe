<script setup lang="ts">
import { accountError } from '../utils/account-error'
useSeoMeta({
  title: 'Create an account — ChronoFrame Cloud',
  robots: 'noindex',
})
const { data: status } = await useFetch('/api/auth/status')
const email = ref(''),
  password = ref(''),
  code = ref(''),
  sent = ref(false),
  busy = ref(false),
  error = ref('')
const codeInput = ref<{ $el: HTMLInputElement }>()
async function submit() {
  busy.value = true
  error.value = ''
  try {
    if (!sent.value) {
      await $fetch('/api/auth/sign-up/email', {
        method: 'POST',
        body: {
          email: email.value,
          password: password.value,
          name: email.value,
        },
      })
      password.value = ''
      sent.value = true
    } else {
      await $fetch('/api/auth/email-otp/verify-email', {
        method: 'POST',
        body: { email: email.value, otp: code.value },
      })
      await navigateTo('/sites', { external: true })
    }
  } catch (cause) {
    error.value = accountError(cause)
  } finally {
    busy.value = false
    if (sent.value) {
      await nextTick()
      codeInput.value?.$el?.focus()
    }
  }
}
async function resend() {
  busy.value = true
  error.value = ''
  try {
    await $fetch('/api/auth/email-otp/send-verification-otp', {
      method: 'POST',
      body: { email: email.value, type: 'email-verification' },
    })
    sent.value = true
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
    <h1>{{ sent ? 'Make it yours.' : 'A home for your photographs.' }}</h1>
    <template v-if="status?.enabled"
      ><p>
        {{
          sent
            ? 'Verify your email to finish creating your account.'
            : 'Create your account and find your own perspective.'
        }}
      </p>
      <form
        @submit.prevent="submit"
        :aria-busy="busy"
      >
        <label for="email">Email address</label
        ><CloudInput
          id="email"
          v-model="email"
          type="email"
          autocomplete="email"
          :disabled="busy || sent"
          required
        /><template v-if="!sent"
          ><label for="password">Password</label
          ><CloudInput
            id="password"
            v-model="password"
            type="password"
            autocomplete="new-password"
            minlength="12"
            maxlength="128"
            :disabled="busy"
            required
          />
          <p class="cf-auth-hint">
            Use at least 12 characters. A unique passphrase works well.
          </p></template
        ><template v-else
          ><label for="code">Email verification code</label
          ><CloudInput
            id="code"
            ref="codeInput"
            v-model="code"
            inputmode="numeric"
            autocomplete="one-time-code"
            pattern="[0-9]{6}"
            maxlength="6"
            :disabled="busy"
            required
        /></template>
        <p
          v-if="error"
          class="cf-error-message"
          role="alert"
        >
          {{ error }}
        </p>
        <CloudButton
          type="submit"
          :loading="busy"
          >{{
            sent ? 'Verify email and continue' : 'Create account'
          }}</CloudButton
        ><CloudButton
          variant="ghost"
          :disabled="busy || !email"
          @click="resend"
          >{{
            sent ? 'Send a new code' : 'Already started? Resend verification'
          }}</CloudButton
        >
      </form>
      <p class="cf-auth-hint">
        Already have an account?
        <NuxtLink
          to="/signin"
          class="cf-text-link"
          >Log in</NuxtLink
        >
      </p></template
    >
    <p
      v-else
      class="cf-notice"
    >
      Registration is not available on this deployment yet.
    </p></CloudAuthLayout
  >
</template>
