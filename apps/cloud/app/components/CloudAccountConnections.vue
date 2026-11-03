<script setup lang="ts">
import { SOCIAL_LOGIN_PROVIDERS } from '@chronoframe/contracts/social-login'
import { accountError } from '../utils/account-error'
const { t } = useI18n()
const route = useRoute()
const identity = usePortalIdentity()
type Provider = { id: string; name: string; icon: string }
type Connection = { id: string; provider: string; canUnlink: boolean }
const {
  data,
  error: loadError,
  refresh,
} = await useFetch<{ providers: Provider[]; accounts: Connection[] }>(
  '/api/account/connections',
  { key: `account-connections-${identity.value?.id}` },
)
const busy = ref(''),
  error = ref(
    route.query.connection === 'failed' ? t('cloud.connections.failed') : '',
  ),
  notice = ref(
    route.query.connection === 'updated'
      ? t('cloud.connections.linkedNotice')
      : '',
  )
const toast = useToast()
watch(error, (text) => text && toast.add({ title: text, color: 'error' }), {
  flush: 'sync',
})
watch(notice, (text) => text && toast.add({ title: text, color: 'success' }), {
  flush: 'sync',
})
onMounted(() => {
  if (error.value) toast.add({ title: error.value, color: 'error' })
  if (notice.value) toast.add({ title: notice.value, color: 'success' })
})
const removing = ref<{ account: Connection; name: string } | null>(null)
type ConnectionRow = {
  provider: Provider
  account: Connection | null
  enabled: boolean
}
const rows = computed(() => {
  const linked = data.value?.accounts ?? []
  const enabled = data.value?.providers ?? []
  const providers = [
    ...enabled,
    ...[...new Set(linked.map((a) => a.provider))]
      .filter((id) => !enabled.some((p) => p.id === id))
      .map((id) => ({
        id,
        name:
          id === 'microsoft'
            ? 'Microsoft'
            : (SOCIAL_LOGIN_PROVIDERS.find((p) => p.id === id)?.name ?? id),
        icon:
          SOCIAL_LOGIN_PROVIDERS.find((p) => p.id === id)?.icon ??
          'i-lucide-link',
      })),
  ]
  return providers.flatMap<ConnectionRow>((provider) => {
    const accounts = linked.filter((a) => a.provider === provider.id)
    return accounts.length
      ? accounts.map((account) => ({
          provider,
          account,
          enabled: enabled.some((p) => p.id === provider.id),
        }))
      : [{ provider, account: null, enabled: true }]
  })
})
onMounted(() => {
  if (!route.query.connection) return
  const { connection, error, error_description, ...query } = route.query
  void navigateTo(
    { path: route.path, query, hash: route.hash },
    { replace: true },
  )
})
async function link(provider: Provider) {
  if (busy.value) return
  busy.value = provider.id
  error.value = ''
  notice.value = ''
  try {
    const result = await $fetch<{ url: string }>('/api/auth/link-social', {
      method: 'POST',
      body: {
        provider: provider.id,
        callbackURL: new URL(
          '/account?connection=updated',
          useRequestURL().origin,
        ).toString(),
      },
    })
    await navigateTo(result.url, { external: true })
  } catch (cause) {
    error.value = accountError(cause, t)
  } finally {
    busy.value = ''
  }
}
async function unlink() {
  if (!removing.value || busy.value) return
  busy.value = removing.value.account.id
  error.value = ''
  notice.value = ''
  try {
    await $fetch('/api/account/connections', {
      method: 'DELETE',
      body: { id: removing.value.account.id },
    })
    removing.value = null
    await refresh()
    notice.value = t('cloud.connections.unlinkedNotice')
  } catch (cause) {
    const code = (cause as { data?: { data?: { code?: string } } }).data?.data
      ?.code
    error.value =
      code === 'SESSION_IS_NOT_FRESH'
        ? t('cloud.messages.pleaseSignOutAndSignInAgainBeforeChanging')
        : code === 'LOGIN_METHOD_REQUIRED'
          ? t('cloud.connections.keepMethod')
          : accountError(cause, t)
    removing.value = null
  } finally {
    busy.value = ''
  }
}
</script>
<template>
  <CfCard class="cf-security-card">
    <div class="cf-settings-intro">
      <div>
        <h2>{{ $t('cloud.connections.title') }}</h2>
        <p>{{ $t('cloud.connections.help') }}</p>
      </div>
    </div>
    <div class="cf-settings-body cf-connections-body">
      <p
        v-if="loadError"
        class="cf-error-message"
        role="alert"
      >
        {{ $t('cloud.connections.loadFailed') }}
      </p>
      <div
        v-for="row in rows"
        :key="row.account?.id ?? row.provider.id"
        class="cf-connection-row"
      >
        <div class="flex items-center gap-3">
          <UIcon
            :name="row.provider.icon"
            class="size-5 shrink-0"
            aria-hidden="true"
          />
          <div>
            <h3>{{ row.provider.name }}</h3>
            <p class="cf-field-hint">
              {{
                row.account
                  ? row.enabled
                    ? $t('cloud.connections.linked')
                    : $t('cloud.connections.disabled')
                  : $t('cloud.connections.notLinked')
              }}
            </p>
          </div>
        </div>
        <CfButton
          v-if="!row.account"
          variant="outline"
          :disabled="!!busy"
          :loading="busy === row.provider.id"
          :aria-label="
            $t('cloud.connections.linkProvider', {
              provider: row.provider.name,
            })
          "
          @click="link(row.provider)"
          >{{ $t('cloud.connections.link') }}</CfButton
        >
        <CfButton
          v-else
          variant="outline"
          :disabled="!!busy || !row.account.canUnlink"
          :aria-label="
            $t('cloud.connections.unlinkProvider', {
              provider: row.provider.name,
            })
          "
          @click="removing = { account: row.account, name: row.provider.name }"
          >{{ $t('cloud.connections.unlink') }}</CfButton
        >
      </div>
      <p
        v-if="rows.some((row) => row.account && !row.account.canUnlink)"
        class="cf-field-hint"
      >
        {{ $t('cloud.connections.keepMethod') }}
      </p>
      <p
        v-if="data && !rows.length"
        class="cf-field-hint"
      >
        {{ $t('cloud.connections.empty') }}
      </p>
    </div>
    <UModal
      :open="!!removing"
      :title="
        $t('cloud.connections.confirmTitle', { provider: removing?.name })
      "
      :description="$t('cloud.connections.confirmHelp')"
      @update:open="
        (value) => {
          if (!value && !busy) removing = null
        }
      "
    >
      <template #footer
        ><div class="flex justify-end gap-2">
          <CfButton
            variant="outline"
            :disabled="!!busy"
            @click="removing = null"
            >{{ $t('cloud.messages.cancel') }}</CfButton
          ><CfButton
            variant="destructive"
            :loading="!!busy"
            @click="unlink"
            >{{ $t('cloud.connections.unlink') }}</CfButton
          >
        </div></template
      >
    </UModal>
  </CfCard>
</template>
<style scoped>
.cf-connections-body {
  display: grid;
  gap: 16px;
}
.cf-connection-row {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 16px;
  padding-block: 12px;
  border-bottom: 1px solid var(--border);
}
.cf-connection-row h3 {
  font-size: 14px;
  font-weight: 600;
}
</style>
