<script setup lang="ts">
const { t } = useI18n()

import { accountError } from '../utils/account-error'
useSeoMeta({
  title: t('cloud.messages.createAnAccountChronoframeCloud'),
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
      await navigateTo('/workspace', { external: true })
    }
  } catch (cause) {
    error.value = accountError(cause, t)
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
    error.value = accountError(cause, t)
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
        sent
          ? $t('cloud.messages.makeItYours')
          : $t('cloud.messages.aHomeForYourPhotographs')
      }}
    </h1>
    <template v-if="status?.enabled"
      ><p>
        {{
          sent
            ? $t('cloud.messages.verifyYourEmailToFinishCreatingYourAccount')
            : $t('cloud.messages.createYourAccountAndFindYourOwnPerspective')
        }}
      </p>
      <form
        @submit.prevent="submit"
        :aria-busy="busy"
      >
        <label for="email">{{ $t('cloud.messages.emailAddress') }}</label
        ><CloudInput
          id="email"
          v-model="email"
          type="email"
          autocomplete="email"
          :disabled="busy || sent"
          required
        /><template v-if="!sent"
          ><label for="password">{{ $t('cloud.messages.password') }}</label
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
            {{
              $t('cloud.messages.useAtLeast12CharactersAUniquePassphraseWorks')
            }}
          </p></template
        ><template v-else
          ><label for="code">{{
            $t('cloud.messages.emailVerificationCode')
          }}</label
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
            sent
              ? $t('cloud.messages.verifyEmailAndContinue')
              : $t('cloud.messages.createAccount')
          }}</CloudButton
        ><CloudButton
          variant="ghost"
          :disabled="busy || !email"
          @click="resend"
          >{{
            sent
              ? $t('cloud.messages.sendANewCode')
              : $t('cloud.messages.alreadyStartedResendVerification')
          }}</CloudButton
        >
      </form>
      <p class="cf-auth-hint">
        {{ $t('cloud.messages.alreadyHaveAnAccount')
        }}<NuxtLink
          to="/signin"
          class="cf-text-link"
          >{{ $t('cloud.messages.logIn') }}</NuxtLink
        >
      </p></template
    >
    <p
      v-else
      class="cf-notice"
    >
      {{ $t('cloud.messages.registrationIsNotAvailableOnThisDeploymentYet') }}
    </p></CloudAuthLayout
  >
</template>
