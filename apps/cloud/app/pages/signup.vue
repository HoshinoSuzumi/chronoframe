<script setup lang="ts">
const { t } = useI18n()
const { destination, authLink } = useCloudAuthDestination()

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
const codeInput = ref<{ focus(): void }>()
const emailInput = ref<{ inputRef: HTMLInputElement }>()
const codeStatus = ref<'idle' | 'error' | 'success'>('idle')
const { remaining, start: startCooldown } = useCloudCodeCooldown()
function editCode() {
  error.value = ''
  codeStatus.value = 'idle'
}
async function submit() {
  if (busy.value || (sent.value && !/^[0-9]{6}$/.test(code.value))) return
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
      startCooldown()
    } else {
      await $fetch('/api/auth/email-otp/verify-email', {
        method: 'POST',
        body: { email: email.value, otp: code.value },
      })
      codeStatus.value = 'success'
      await new Promise((resolve) => setTimeout(resolve, 250))
      await navigateTo(destination.value, { external: true })
    }
  } catch (cause) {
    if (sent.value) codeStatus.value = 'error'
    error.value = accountError(cause, t)
  } finally {
    busy.value = false
    if (sent.value) {
      await nextTick()
      codeInput.value?.focus()
    }
  }
}
async function resend() {
  if (
    busy.value ||
    remaining.value ||
    !emailInput.value?.inputRef.reportValidity()
  )
    return
  code.value = ''
  editCode()
  busy.value = true
  error.value = ''
  try {
    await $fetch('/api/auth/email-otp/send-verification-otp', {
      method: 'POST',
      body: { email: email.value, type: 'email-verification' },
    })
    sent.value = true
    startCooldown()
    await nextTick()
    codeInput.value?.focus()
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
        sent
          ? $t('cloud.messages.makeItYours')
          : $t('cloud.messages.aHomeForYourPhotographs')
      }}
    </h1>
    <template
      v-if="
        status?.enabled && (status.emailEnabled || status.providers?.length)
      "
      ><p>
        {{
          sent
            ? $t('cloud.messages.verifyYourEmailToFinishCreatingYourAccount')
            : $t('cloud.messages.createYourAccountAndFindYourOwnPerspective')
        }}
      </p>
      <form
        v-if="status.emailEnabled"
        @submit.prevent="submit"
        :aria-busy="busy"
      >
        <label for="email">{{ $t('cloud.messages.emailAddress') }}</label
        ><CfInput
          id="email"
          ref="emailInput"
          v-model="email"
          type="email"
          autocomplete="email"
          :disabled="busy || sent"
          required
        /><template v-if="!sent"
          ><label for="password">{{ $t('cloud.messages.password') }}</label
          ><CloudPasswordInput
            id="password"
            v-model="password"
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
          ><CfCodeSlots
            id="code"
            ref="codeInput"
            v-model="code"
            :aria-label="$t('cloud.messages.emailVerificationCode')"
            :status="codeStatus"
            autofocus
            @edit="editCode"
            @complete="submit"
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
        <CfButton
          type="submit"
          :disabled="sent && code.length !== 6"
          :loading="busy"
          >{{
            sent
              ? $t('cloud.messages.verifyEmailAndContinue')
              : $t('cloud.messages.createAccount')
          }}</CfButton
        ><CfButton
          variant="ghost"
          :disabled="busy || !email || remaining > 0"
          @click="resend"
          >{{
            remaining > 0
              ? $t('cloud.auth.resendIn', { seconds: remaining })
              : sent
                ? $t('cloud.messages.sendANewCode')
                : $t('cloud.messages.alreadyStartedResendVerification')
          }}</CfButton
        >
      </form>
      <div
        v-if="!sent && status.providers?.length"
        class="cf-auth-alternatives"
      >
        <USeparator
          v-if="status.emailEnabled"
          :label="$t('cloud.account.orContinueWith')"
        />
        <CloudSocialLogin
          v-model:busy="busy"
          :providers="status.providers"
        />
      </div>
      <p class="cf-auth-footer">
        {{ $t('cloud.messages.alreadyHaveAnAccount')
        }}<NuxtLink
          :to="authLink('/signin')"
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
