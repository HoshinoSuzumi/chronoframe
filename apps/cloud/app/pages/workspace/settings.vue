<script setup lang="ts">
import type { WorkspaceSettings } from '@chronoframe/contracts/workspace-settings'
import { parseWorkspaceSettingsUpdate } from '@chronoframe/contracts/workspace-settings'

definePageMeta({ layout: 'portal' })
const { t } = useI18n()
const identity = usePortalIdentity()
const billing = useWorkspaceBilling()
await billing.ready
const fetcher = useRequestFetch()
const request = useAsyncData(
  () => `workspace-settings-${identity.value?.id}-${billing.selected.value}`,
  async () => {
    const workspaceId = billing.selected.value
    const accountId = identity.value?.id
    if (!workspaceId || !accountId) return null
    const result = await fetcher<{ workspace: WorkspaceSettings }>(
      `/api/workspaces/${workspaceId}/settings`,
      { timeout: 15000 },
    )
    return { workspaceId, accountId, workspace: result.workspace }
  },
)
await request
const workspace = computed(() => {
  const loaded = request.data.value
  return loaded?.workspaceId === billing.selected.value &&
    loaded.accountId === identity.value?.id
    ? loaded.workspace
    : null
})
const name = ref(''),
  busy = ref(false),
  error = ref(''),
  notice = ref(''),
  conflict = ref(false)
let generation = 0
watch([() => billing.selected.value, () => identity.value?.id], () => {
  generation++
  name.value = ''
  busy.value = false
  error.value = ''
  notice.value = ''
  conflict.value = false
})
watch(
  workspace,
  (value) => {
    name.value = value?.name ?? ''
  },
  { immediate: true },
)
const dirty = computed(
  () => !!workspace.value && name.value.trim() !== workspace.value.name,
)
const valid = computed(() => {
  try {
    parseWorkspaceSettingsUpdate({
      name: name.value,
      revision: workspace.value?.revision,
    })
    return true
  } catch {
    return false
  }
})
function reset() {
  name.value = workspace.value?.name ?? ''
  notice.value = ''
  if (!conflict.value) error.value = ''
}
async function reload() {
  await request.refresh()
  if (!request.error.value && workspace.value) {
    conflict.value = false
    error.value = ''
    notice.value = ''
  }
}
async function save() {
  if (
    busy.value ||
    conflict.value ||
    !workspace.value?.canEdit ||
    !valid.value ||
    !dirty.value
  )
    return
  const workspaceId = workspace.value.id,
    accountId = identity.value?.id
  const attempt = ++generation
  const current = () =>
    attempt === generation &&
    workspaceId === billing.selected.value &&
    accountId === identity.value?.id
  const body = parseWorkspaceSettingsUpdate({
    name: name.value,
    revision: workspace.value.revision,
  })
  busy.value = true
  error.value = ''
  notice.value = ''
  try {
    const result = await $fetch<{ workspace: WorkspaceSettings }>(
      `/api/workspaces/${workspaceId}/settings`,
      { method: 'PATCH', body, timeout: 20000 },
    )
    if (!current()) return
    request.data.value = { workspaceId, accountId, workspace: result.workspace }
    notice.value = t('cloud.workspaceSettings.saved')
    // Share the accepted name with the workspace overview.
    await refreshNuxtData((key) => key === `workspace-billing-${accountId}`)
  } catch (cause) {
    if (!current()) return
    const status =
      (cause as { statusCode?: number; status?: number }).statusCode ??
      (cause as { status?: number }).status
    conflict.value = status === 409
    error.value = t(
      status === 409
        ? 'cloud.workspaceSettings.conflict'
        : status === 403 || status === 404
          ? 'cloud.workspaceSettings.unavailable'
          : 'cloud.workspaceSettings.saveFailed',
    )
  } finally {
    if (current()) busy.value = false
  }
}
useSeoMeta({
  title: () => `${t('cloud.workspaceSettings.title')} — ChronoFrame Cloud`,
  robots: 'noindex',
})
</script>
<template>
  <div class="cloud-workspace-settings">
    <CfPageHeader
      :title="t('cloud.workspaceSettings.title')"
      :description="t('cloud.workspaceSettings.description')"
    />
    <CfAlert
      v-if="request.error.value || billing.error.value"
      tone="error"
    >
      {{ t('cloud.workspaceSettings.loadFailed') }}
      <template #actions
        ><CfButton
          size="sm"
          variant="secondary"
          @click="billing.error.value ? billing.refresh() : reload()"
          >{{ t('cloud.messages.retry') }}</CfButton
        ></template
      >
    </CfAlert>
    <section
      v-else-if="workspace"
      aria-labelledby="workspace-general-heading"
    >
      <CfCard class="cloud-workspace-settings-card">
        <div class="cloud-workspace-settings-intro">
          <h2 id="workspace-general-heading">
            {{ t('cloud.workspaceSettings.general') }}
          </h2>
          <p>{{ t('cloud.workspaceSettings.generalHelp') }}</p>
        </div>
        <form
          class="cloud-workspace-settings-form"
          @submit.prevent="save"
        >
          <UFormField
            :label="t('cloud.workspaceSettings.name')"
            name="workspaceName"
            :help="t('cloud.workspaceSettings.nameHelp')"
            :error="
              dirty && !valid
                ? t('cloud.workspaceSettings.invalidName')
                : undefined
            "
          >
            <CfInput
              v-model="name"
              required
              maxlength="80"
              autocomplete="off"
              :disabled="busy || !workspace.canEdit"
            />
          </UFormField>
          <p
            v-if="!workspace.canEdit"
            class="cf-field-hint"
          >
            {{ t('cloud.workspaceSettings.readOnly') }}
          </p>
          <CfAlert
            v-if="error"
            tone="error"
            role="alert"
          >
            {{ error }}
            <template
              v-if="conflict"
              #actions
              ><CfButton
                size="sm"
                variant="secondary"
                @click="reload"
                >{{ t('cloud.workspaceSettings.reload') }}</CfButton
              ></template
            >
          </CfAlert>
          <p
            v-if="notice"
            role="status"
            class="cloud-workspace-settings-notice"
          >
            {{ notice }}
          </p>
          <div
            v-if="workspace.canEdit"
            class="cloud-workspace-settings-actions"
          >
            <CfButton
              type="submit"
              :loading="busy"
              :disabled="busy || !dirty || !valid || conflict"
              >{{ t('cloud.messages.saveChanges') }}</CfButton
            >
            <CfButton
              v-if="dirty"
              variant="secondary"
              :disabled="busy"
              @click="reset"
              >{{ t('cloud.workspaceSettings.cancel') }}</CfButton
            >
          </div>
        </form>
      </CfCard>
    </section>
    <CfSkeleton
      v-else-if="
        request.status.value === 'pending' || billing.status.value === 'pending'
      "
      class="h-52 w-full"
    />
    <CfAlert
      v-else
      tone="info"
      >{{ t('cloud.workspaceSettings.noWorkspace') }}</CfAlert
    >
  </div>
</template>
<style scoped>
.cloud-workspace-settings {
  display: grid;
  gap: 28px;
  max-width: 980px;
  margin-inline: auto;
}
.cloud-workspace-settings-card {
  display: grid;
  grid-template-columns: 220px minmax(0, 1fr);
  gap: 32px;
  padding: 24px;
}
.cloud-workspace-settings-intro h2 {
  margin: 0 0 6px;
  font-size: 14px;
  font-weight: 600;
}
.cloud-workspace-settings-intro p {
  margin: 0;
  color: var(--muted-foreground);
  font-size: 12px;
  line-height: 1.7;
}
.cloud-workspace-settings-form {
  display: grid;
  gap: 20px;
  min-width: 0;
}
.cloud-workspace-settings-form :deep(input) {
  width: 100%;
}
.cloud-workspace-settings-actions {
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
}
.cloud-workspace-settings-notice {
  color: var(--success);
  font-size: 13px;
  margin: 0;
}
@media (max-width: 760px) {
  .cloud-workspace-settings-card {
    grid-template-columns: minmax(0, 1fr);
    gap: 24px;
    padding: 20px;
  }
}
</style>
