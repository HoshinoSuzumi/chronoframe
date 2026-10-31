<script setup lang="ts">
const {
  jobs,
  photos,
  uploading,
  progress,
  currentFile,
  uploadSession,
  cancel,
  admin,
  busy,
  action,
  api,
  base,
} = useCloudSiteMedia()
const { t } = useI18n()
const collapsed = ref(false)
type Job = (typeof jobs.value)[number]
const tracked = ref<Record<string, Job>>({})
const dismissed = new Set<string>()
const active = (job: Job) =>
  ['queued', 'running', 'retry_wait'].includes(job.state)
watch(
  jobs,
  (items) => {
    const next = { ...tracked.value }
    for (const job of items) {
      if (active(job)) dismissed.delete(job.id)
      if (
        next[job.id] ||
        (!dismissed.has(job.id) && (active(job) || job.state === 'failed'))
      )
        next[job.id] = job
    }
    tracked.value = next
  },
  { immediate: true },
)
const processingJobs = computed(() => Object.values(tracked.value))
const processingActive = computed(
  () => processingJobs.value.filter(active).length,
)
const processingCompleted = computed(
  () => processingJobs.value.filter((job) => job.state === 'succeeded').length,
)
const hasActive = computed(() => uploading.value || processingActive.value > 0)
const visible = computed(
  () => uploadSession.total > 0 || processingJobs.value.length > 0,
)
const panelId = useId()
watch(uploading, (value) => {
  if (value) collapsed.value = false
})
function dismiss() {
  if (hasActive.value) return
  for (const job of processingJobs.value) dismissed.add(job.id)
  tracked.value = {}
  uploadSession.total = 0
  uploadSession.message = ''
}
function photoName(job: Job) {
  return (
    job.file_name ||
    photos.value.find((p) => p.id === job.photo_id)?.title ||
    t('cloud.messages.untitledPhotograph')
  )
}
</script>
<template>
  <ClientOnly>
    <Teleport to="body">
      <section
        v-if="visible"
        class="cloud-transfer-panel"
        :aria-label="t('cloud.transfer.title')"
      >
        <header class="flex items-center gap-2 border-b border-default p-4">
          <button
            class="flex min-w-0 flex-1 items-center gap-3 text-left"
            type="button"
            :aria-expanded="!collapsed"
            :aria-controls="panelId"
            @click="collapsed = !collapsed"
          >
            <UIcon
              :name="
                hasActive ? 'i-lucide-loader-circle' : 'i-lucide-list-checks'
              "
              class="size-5 shrink-0"
              :class="{ 'animate-spin': hasActive }"
            />
            <strong class="flex-1 text-sm">{{
              t('cloud.transfer.title')
            }}</strong>
            <UIcon
              :name="
                collapsed ? 'i-lucide-chevron-up' : 'i-lucide-chevron-down'
              "
              class="size-4 shrink-0"
            />
          </button>
          <UButton
            v-if="!hasActive"
            icon="i-lucide-x"
            color="neutral"
            variant="ghost"
            size="sm"
            :aria-label="t('cloud.transfer.dismiss')"
            @click="dismiss"
          />
        </header>
        <div
          v-show="!collapsed"
          :id="panelId"
          class="cloud-transfer-body divide-y divide-default"
        >
          <div
            v-if="uploadSession.total"
            class="space-y-3 p-4"
          >
            <div class="flex items-center justify-between gap-3 text-sm">
              <strong>{{ t('cloud.transfer.upload') }}</strong>
              <span class="text-muted">{{
                t('cloud.transfer.count', {
                  completed: uploadSession.completed,
                  total: uploadSession.total,
                })
              }}</span>
            </div>
            <template v-if="uploading">
              <p
                class="truncate text-sm"
                :title="currentFile"
              >
                {{ currentFile }}
              </p>
              <UProgress :model-value="progress || undefined" />
              <p
                class="text-xs text-muted"
                role="status"
              >
                {{
                  progress === 100
                    ? t('cloud.transfer.verifying')
                    : t(
                        uploadSession.storage === 'platform'
                          ? 'cloud.ui.uploadProgressPlatform'
                          : 'cloud.ui.uploadProgress',
                        { progress },
                      )
                }}
              </p>
              <CfButton
                size="sm"
                variant="secondary"
                @click="cancel"
                >{{ t('cloud.messages.cancelUpload') }}</CfButton
              >
            </template>
            <p
              v-else
              class="text-sm"
              :class="uploadSession.failed ? 'text-error' : 'text-muted'"
              :role="uploadSession.failed ? 'alert' : 'status'"
            >
              {{ uploadSession.message }}
            </p>
          </div>
          <div
            v-if="processingJobs.length"
            class="space-y-3 p-4"
          >
            <div class="flex items-center justify-between gap-3 text-sm">
              <strong>{{ t('cloud.messages.processingQueue') }}</strong>
              <span class="text-muted">{{
                t('cloud.transfer.count', {
                  completed: processingCompleted,
                  total: processingJobs.length,
                })
              }}</span>
            </div>
            <UProgress v-if="processingActive" />
            <ul class="space-y-3">
              <li
                v-for="job in processingJobs"
                :key="job.id"
                class="flex items-start gap-3"
              >
                <UIcon
                  :name="
                    job.state === 'failed'
                      ? 'i-lucide-circle-alert'
                      : job.state === 'succeeded'
                        ? 'i-lucide-circle-check'
                        : 'i-lucide-loader-circle'
                  "
                  class="mt-0.5 size-4 shrink-0"
                  :class="{
                    'animate-spin': job.state === 'running',
                    'text-error': job.state === 'failed',
                  }"
                />
                <div class="min-w-0 flex-1 space-y-1">
                  <p
                    class="truncate text-sm"
                    :title="photoName(job)"
                  >
                    {{ photoName(job) }}
                  </p>
                  <p class="text-xs text-muted">
                    {{
                      t(
                        [
                          'queued',
                          'running',
                          'retry_wait',
                          'failed',
                          'cancelled',
                          'succeeded',
                        ].includes(job.state)
                          ? 'cloud.ui.' + job.state
                          : 'cloud.ui.unknownJob',
                      )
                    }}
                    · {{ t('cloud.ui.attemptCount', { count: job.attempts }) }}
                  </p>
                  <p
                    v-if="job.error_code"
                    class="text-xs text-error"
                  >
                    {{
                      t('cloud.ui.processingFailure', { code: job.error_code })
                    }}
                  </p>
                </div>
                <CfButton
                  v-if="admin && job.state === 'failed'"
                  variant="secondary"
                  size="sm"
                  :disabled="busy"
                  @click="
                    action(
                      () =>
                        api(base + '/jobs/' + job.id + '/retry', {
                          method: 'POST',
                          body: {},
                        }),
                      t('cloud.messages.jobQueuedAgain'),
                    )
                  "
                  >{{ t('cloud.messages.retry') }}</CfButton
                >
              </li>
            </ul>
          </div>
        </div>
      </section>
    </Teleport>
  </ClientOnly>
</template>
<style scoped>
.cloud-transfer-panel {
  position: fixed;
  z-index: 40;
  right: 24px;
  bottom: max(24px, env(safe-area-inset-bottom));
  width: min(420px, calc(100vw - 32px));
  overflow: hidden;
  border: 1px solid var(--ui-border);
  border-radius: 12px;
  background: var(--ui-bg);
  color: var(--ui-text);
  box-shadow: 0 12px 36px #0003;
}
.cloud-transfer-body {
  max-height: min(65dvh, 560px);
  overflow-y: auto;
}
@media (max-width: 640px) {
  .cloud-transfer-panel {
    right: 16px;
    bottom: max(16px, env(safe-area-inset-bottom));
  }
}
</style>
