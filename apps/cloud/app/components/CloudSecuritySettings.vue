<script setup lang="ts">
const { t } = useI18n()

import { accountError } from '../utils/account-error'
import { KeyRound, Fingerprint } from 'lucide-vue-next'

import type { AccountSecurity } from '@chronoframe/contracts/account-security'
const { data: security, refresh } =
  await useFetch<AccountSecurity>('/api/auth/security')
const passkeyCount = computed(() => security.value?.passkeys.length ?? 0)
const password = ref(''),
  newPassword = ref(''),
  passkeyName = ref('')
const busy = ref(false),
  error = ref(''),
  notice = ref('')
const passwordOpen = ref(false)
const passkeysOpen = ref(false)
const toast = useToast()
watch(error, (text) => text && toast.add({ title: text, color: 'error' }), {
  flush: 'sync',
})
watch(notice, (text) => text && toast.add({ title: text, color: 'success' }), {
  flush: 'sync',
})
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
/** Expand password management without retaining an earlier password draft. */
function togglePassword() {
  passwordOpen.value = !passwordOpen.value
  password.value = ''
  newPassword.value = ''
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
    passwordOpen.value = false
    notice.value = t(
      'cloud.messages.passwordUpdatedOtherSessionsHaveBeenSignedOut',
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
          {{ $t('cloud.security.signInMethods') }}
        </h2>
        <p class="cf-page-description">
          {{ $t('cloud.security.signInHelp') }}
        </p>
      </div>
    </div>
    <CfCard class="cf-signin-methods">
      <div class="cf-signin-method-row">
        <KeyRound
          :size="20"
          aria-hidden="true"
        />
        <div>
          <h3>{{ $t('cloud.messages.password') }}</h3>
          <p>
            {{
              $t(
                security?.hasPassword
                  ? 'cloud.security.configured'
                  : 'cloud.security.notConfigured',
              )
            }}
          </p>
        </div>
        <CfButton
          variant="outline"
          size="sm"
          :disabled="busy"
          :aria-expanded="passwordOpen"
          aria-controls="password-settings"
          @click="togglePassword"
        >
          {{
            $t(
              passwordOpen
                ? 'cloud.messages.cancel'
                : security?.hasPassword
                  ? 'cloud.security.changePassword'
                  : 'cloud.security.configure',
            )
          }}
        </CfButton>
      </div>
      <div
        v-if="passwordOpen"
        id="password-settings"
        class="cf-signin-method-editor"
      >
        <form
          v-if="security?.hasPassword"
          @submit.prevent="changePassword"
        >
          <label for="current-password">{{
            $t('cloud.messages.currentPassword')
          }}</label
          ><CfInput
            id="current-password"
            v-model="password"
            type="password"
            autocomplete="current-password"
            :disabled="busy"
            required
          /><label for="new-password">{{
            $t('cloud.messages.newPassword')
          }}</label
          ><CfInput
            id="new-password"
            v-model="newPassword"
            type="password"
            autocomplete="new-password"
            minlength="12"
            maxlength="128"
            :disabled="busy"
            required
          /><CfButton
            type="submit"
            :loading="busy"
            >{{ $t('cloud.messages.updatePassword') }}</CfButton
          >
        </form>
        <i18n-t
          v-else
          keypath="cloud.ui.passwordSetupGuidance"
          tag="p"
          scope="global"
        >
          <template #link
            ><NuxtLink
              class="cf-text-link"
              to="/forgot-password"
              >{{
                $t('cloud.messages.emailYourselfALinkToSetAPassword')
              }}</NuxtLink
            ></template
          >
        </i18n-t>
      </div>
      <div class="cf-signin-method-row">
        <Fingerprint
          :size="20"
          aria-hidden="true"
        />
        <div>
          <h3>{{ $t('cloud.messages.passkeys') }}</h3>
          <p>
            {{
              $t(
                'cloud.security.passkeyCount',
                { count: passkeyCount },
                passkeyCount,
              )
            }}
          </p>
        </div>
        <CfButton
          variant="outline"
          size="sm"
          :disabled="busy"
          :aria-expanded="passkeysOpen"
          aria-controls="passkey-settings"
          @click="passkeysOpen = !passkeysOpen"
        >
          {{
            $t(passkeysOpen ? 'cloud.messages.cancel' : 'cloud.security.manage')
          }}
        </CfButton>
      </div>
      <div
        v-if="passkeysOpen"
        id="passkey-settings"
        class="cf-signin-method-editor"
      >
        <form @submit.prevent="addPasskey">
          <label for="passkey-name">{{
            $t('cloud.messages.passkeyName')
          }}</label
          ><CfInput
            id="passkey-name"
            v-model="passkeyName"
            maxlength="80"
            autocomplete="off"
            :placeholder="$t('cloud.messages.forExampleMyLaptop')"
            :disabled="busy"
          /><CfButton
            type="submit"
            :loading="busy"
            >{{ $t('cloud.messages.createPasskey') }}</CfButton
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
            ><CfButton
              variant="destructive"
              size="sm"
              :disabled="busy"
              :aria-label="
                $t('cloud.ui.removePasskey', {
                  name: key.name || $t('cloud.messages.passkey'),
                })
              "
              @click="deletePasskey(key.id)"
              >{{ $t('cloud.messages.remove') }}</CfButton
            >
          </li>
        </ul>
        <p
          v-else
          class="cf-auth-hint"
        >
          {{ $t('cloud.messages.noPasskeysYet') }}
        </p>
      </div>
    </CfCard>
    <CloudAccountConnections />
    <CloudTwoFactorSettings
      :security="security ?? null"
      :refresh="refresh"
    />
  </section>
</template>

<style scoped>
.cf-signin-methods {
  overflow: hidden;
  margin-block: 16px;
}
.cf-signin-method-row {
  display: flex;
  align-items: center;
  gap: 16px;
  padding: 18px;
}
.cf-signin-method-row + .cf-signin-method-row,
.cf-signin-method-editor + .cf-signin-method-row {
  border-top: 1px solid var(--border);
}
.cf-signin-method-row > svg {
  color: var(--muted-foreground);
  flex-shrink: 0;
}
.cf-signin-method-row > div {
  flex: 1;
  min-width: 0;
}
.cf-signin-method-row h3 {
  font-size: 14px;
  font-weight: 600;
}
.cf-signin-method-row p {
  font-size: 13px;
  color: var(--muted-foreground);
  margin-top: 4px;
}
.cf-signin-method-editor {
  border-top: 1px solid var(--border);
  padding: 18px;
}
.cf-signin-method-editor form {
  display: grid;
  gap: 10px;
  max-width: 440px;
}
.cf-signin-method-editor form > button {
  justify-self: start;
}
.cf-signin-method-editor > p {
  font-size: 13px;
  color: var(--muted-foreground);
}
@media (max-width: 600px) {
  .cf-signin-method-row {
    gap: 12px;
    padding: 16px;
  }
  .cf-signin-method-row button {
    max-width: 45%;
    white-space: normal;
  }
}
</style>
