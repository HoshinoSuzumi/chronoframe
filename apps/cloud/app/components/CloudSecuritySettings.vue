<script setup lang="ts">
const { t } = useI18n()

import { accountError } from '../utils/account-error'

const { data: security, refresh } = await useFetch<{
  email: string
  hasPassword: boolean
  twoFactorEnabled: boolean
  hasAuthenticator: boolean
  passkeys: { id: number; name: string | null; createdAt: string }[]
}>('/api/auth/security')
const password = ref(''),
  newPassword = ref(''),
  code = ref(''),
  passkeyName = ref('')
const busy = ref(false),
  error = ref(''),
  notice = ref(''),
  qr = ref(''),
  totpURI = ref(''),
  backupCodes = ref<string[]>([])
async function run(action: () => Promise<void>) {
  if (busy.value) return
  busy.value = true
  error.value = ''
  notice.value = ''
  try {
    await action()
    await refresh()
  } catch (cause) {
    error.value = accountError(cause, t)
  } finally {
    busy.value = false
  }
}
async function changePassword() {
  await run(async () => {
    await $fetch('/api/auth/change-password', {
      method: 'POST',
      body: {
        currentPassword: password.value,
        newPassword: newPassword.value,
        revokeOtherSessions: true,
      },
    })
    newPassword.value = ''
    password.value = ''
    notice.value = t(
      'cloud.messages.passwordUpdatedOtherSessionsHaveBeenSignedOut',
    )
  })
}
async function enable(method: 'otp' | 'totp') {
  await run(async () => {
    const result = await $fetch<{ totpURI?: string; backupCodes?: string[] }>(
      '/api/auth/two-factor/enable',
      { method: 'POST', body: { password: password.value, method } },
    )
    password.value = ''
    if (result.totpURI) {
      totpURI.value = result.totpURI
      backupCodes.value = result.backupCodes ?? []
      const QRCode = await import('qrcode')
      qr.value = await QRCode.toDataURL(result.totpURI, {
        width: 240,
        margin: 2,
      })
      notice.value = t('cloud.messages.scanTheQrCodeSaveYourRecoveryCodesAnd')
    } else
      notice.value = t('cloud.messages.emailSecondStepVerificationIsEnabled')
  })
}
async function confirmAuthenticator() {
  await run(async () => {
    await $fetch('/api/auth/two-factor/verify-totp', {
      method: 'POST',
      body: { code: code.value },
    })
    code.value = ''
    qr.value = ''
    totpURI.value = ''
    notice.value = t(
      'cloud.messages.authenticatorVerifiedAndEnabledKeepYourRecoveryCodesSomewhere',
    )
  })
}
async function disable() {
  await run(async () => {
    await $fetch('/api/auth/two-factor/disable', {
      method: 'POST',
      body: { password: password.value },
    })
    password.value = ''
    backupCodes.value = []
    qr.value = ''
    totpURI.value = ''
    notice.value = t('cloud.messages.twoStepVerificationHasBeenDisabled')
  })
}
async function regenerate() {
  await run(async () => {
    const result = await $fetch<{ backupCodes: string[] }>(
      '/api/auth/two-factor/generate-backup-codes',
      { method: 'POST', body: { password: password.value } },
    )
    backupCodes.value = result.backupCodes
    password.value = ''
    notice.value = t(
      'cloud.messages.newRecoveryCodesGeneratedYourPreviousCodesNoLonger',
    )
  })
}
async function addPasskey() {
  await run(async () => {
    const result = await useCloudAccount().passkey.addPasskey({
      name: passkeyName.value.trim() || t('cloud.messages.myPasskey'),
    })
    if (result.error) throw result.error
    passkeyName.value = ''
    notice.value = t(
      'cloud.messages.passkeyCreatedItsPrivateKeyStaysOnYourDevice',
    )
  })
}
async function deletePasskey(id: number) {
  await run(async () => {
    await $fetch('/api/auth/passkey/delete-passkey', {
      method: 'POST',
      body: { id: String(id) },
    })
    notice.value = t('cloud.messages.passkeyRemoved')
  })
}
</script>
<template>
  <section
    id="security"
    aria-labelledby="security-heading"
  >
    <div class="cf-page-heading">
      <div>
        <h2
          id="security-heading"
          class="cf-page-title"
        >
          {{ $t('cloud.messages.security') }}
        </h2>
        <p class="cf-page-description">
          {{ $t('cloud.ui.securityFor', { email: security?.email || '' }) }}.
        </p>
      </div>
    </div>
    <p
      v-if="error"
      class="cf-error-message"
      role="alert"
    >
      {{ error }}
    </p>
    <p
      v-if="notice"
      class="cf-notice"
      role="status"
    >
      {{ notice }}
    </p>
    <CloudCard class="cf-security-card"
      ><div class="cf-settings-intro">
        <h2>{{ $t('cloud.messages.password') }}</h2>
        <p>
          {{ $t('cloud.messages.useAUniquePasswordWithAtLeast12Characters') }}
        </p>
      </div>
      <div class="cf-settings-body">
        <form
          v-if="security?.hasPassword"
          @submit.prevent="changePassword"
        >
          <label for="current-password">{{
            $t('cloud.messages.currentPassword')
          }}</label
          ><CloudInput
            id="current-password"
            v-model="password"
            type="password"
            autocomplete="current-password"
            :disabled="busy"
            required
          /><label for="new-password">{{
            $t('cloud.messages.newPassword')
          }}</label
          ><CloudInput
            id="new-password"
            v-model="newPassword"
            type="password"
            autocomplete="new-password"
            minlength="12"
            maxlength="128"
            :disabled="busy"
            required
          /><CloudButton
            type="submit"
            :loading="busy"
            >{{ $t('cloud.messages.updatePassword') }}</CloudButton
          >
        </form>
        <p v-else>
          {{ $t('cloud.messages.youSignedInWithAnEmailCode')
          }}<NuxtLink
            class="cf-text-link"
            to="/forgot-password"
            >{{
              $t('cloud.messages.emailYourselfALinkToSetAPassword')
            }}</NuxtLink
          >{{ $t('cloud.messages.beforeEnablingTwoStepVerification') }}
        </p>
      </div></CloudCard
    >
    <CloudCard class="cf-security-card"
      ><div class="cf-settings-intro">
        <div>
          <h2>{{ $t('cloud.messages.twoStepVerification') }}</h2>
          <p>
            {{
              $t(
                'cloud.messages.addACodeAfterPasswordSignInConnectedAuthenticators',
              )
            }}
          </p>
        </div>
        <CloudBadge
          :tone="security?.twoFactorEnabled ? 'success' : 'neutral'"
          >{{
            security?.twoFactorEnabled
              ? $t('cloud.messages.enabled')
              : $t('cloud.messages.off')
          }}</CloudBadge
        >
      </div>
      <div class="cf-settings-body">
        <template v-if="security?.hasPassword"
          ><label for="security-password">{{
            $t('cloud.messages.confirmYourPasswordToChangeSecuritySettings')
          }}</label
          ><CloudInput
            id="security-password"
            v-model="password"
            type="password"
            autocomplete="current-password"
            :disabled="busy"
          />
          <div class="cf-security-actions">
            <CloudButton
              v-if="!security.twoFactorEnabled"
              :disabled="busy || !password"
              @click="enable('otp')"
              >{{ $t('cloud.messages.enableEmailVerification') }}</CloudButton
            ><CloudButton
              v-if="!security.hasAuthenticator"
              variant="secondary"
              :disabled="busy || !password"
              @click="enable('totp')"
              >{{ $t('cloud.messages.setUpAuthenticator') }}</CloudButton
            ><CloudButton
              v-if="security.twoFactorEnabled"
              variant="destructive"
              :disabled="busy || !password"
              @click="disable"
              >{{
                $t('cloud.messages.disableTwoStepVerification')
              }}</CloudButton
            >
          </div>
          <div
            v-if="totpURI"
            class="cf-totp-setup"
          >
            <img
              v-if="qr"
              :src="qr"
              width="240"
              height="240"
              :alt="
                $t(
                  'cloud.messages.scanThisPrivateQrCodeWithYourAuthenticatorApp',
                )
              "
            />
            <details>
              <summary>{{ $t('cloud.messages.cannotScanTheQrCode') }}</summary>
              <p class="cf-secret-value">{{ totpURI }}</p>
            </details>
            <form @submit.prevent="confirmAuthenticator">
              <label for="totp-code">{{
                $t('cloud.messages.authenticatorCode')
              }}</label
              ><CloudInput
                id="totp-code"
                v-model="code"
                inputmode="numeric"
                autocomplete="one-time-code"
                pattern="[0-9]{6}"
                maxlength="6"
                required
                :disabled="busy"
              /><CloudButton
                type="submit"
                :loading="busy"
                >{{ $t('cloud.messages.verifyAndEnable') }}</CloudButton
              >
            </form>
          </div>
          <div v-if="security.hasAuthenticator">
            <p>
              {{
                $t(
                  'cloud.messages.authenticatorConnectedRecoveryCodesAreSingleUseGeneratingNew',
                )
              }}
            </p>
            <CloudButton
              variant="secondary"
              :disabled="busy || !password"
              @click="regenerate"
              >{{ $t('cloud.messages.replaceRecoveryCodes') }}</CloudButton
            >
          </div>
          <div
            v-if="backupCodes.length"
            class="cf-notice"
          >
            <strong>{{
              $t('cloud.messages.saveTheseRecoveryCodesPrivately')
            }}</strong>
            <p>
              {{
                $t('cloud.messages.theseAreOnlyShownHereKeepThemOutsideThis')
              }}
            </p>
            <ul class="cf-recovery-codes">
              <li
                v-for="item in backupCodes"
                :key="item"
              >
                <code>{{ item }}</code>
              </li>
            </ul>
            <CloudButton
              variant="secondary"
              @click="backupCodes = []"
              >{{ $t('cloud.messages.iHaveSavedMyCodes') }}</CloudButton
            >
          </div></template
        >
      </div></CloudCard
    >
    <CloudCard class="cf-security-card"
      ><div class="cf-settings-intro">
        <h2>{{ $t('cloud.messages.passkeys') }}</h2>
        <p>
          {{
            $t('cloud.messages.useYourDeviceLockFingerprintOrSecurityKeyYour')
          }}
        </p>
      </div>
      <div class="cf-settings-body">
        <form @submit.prevent="addPasskey">
          <label for="passkey-name">{{
            $t('cloud.messages.passkeyName')
          }}</label
          ><CloudInput
            id="passkey-name"
            v-model="passkeyName"
            maxlength="80"
            autocomplete="off"
            :placeholder="$t('cloud.messages.forExampleMyLaptop')"
            :disabled="busy"
          /><CloudButton
            type="submit"
            :loading="busy"
            >{{ $t('cloud.messages.createPasskey') }}</CloudButton
          >
        </form>
        <ul
          v-if="security?.passkeys.length"
          class="cf-passkey-list"
        >
          <li
            v-for="key in security.passkeys"
            :key="key.id"
          >
            <span>{{ key.name || $t('cloud.messages.passkey') }}</span
            ><CloudButton
              variant="destructive"
              size="sm"
              :disabled="busy"
              :aria-label="
                $t('cloud.ui.removePasskey', {
                  name: key.name || $t('cloud.messages.passkey'),
                })
              "
              @click="deletePasskey(key.id)"
              >{{ $t('cloud.messages.remove') }}</CloudButton
            >
          </li>
        </ul>
        <p
          v-else
          class="cf-auth-hint"
        >
          {{ $t('cloud.messages.noPasskeysYet') }}
        </p>
      </div></CloudCard
    >
  </section>
</template>
