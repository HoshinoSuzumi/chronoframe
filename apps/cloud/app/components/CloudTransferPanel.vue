<script setup lang="ts">
import { useCloudUploads } from '../composables/useCloudUploads'
const uploads = useCloudUploads()
const { uploadingFiles, remove, clearCompleted, clearAll, tracked, busy } =
  uploads
const { t } = useI18n()
async function jobAction(fileId: string, operation: 'retry' | 'delete') {
  const item = tracked.get(fileId)
  if (!item?.context.admin || !item.job || busy.value) return
  if (
    operation === 'delete' &&
    !window.confirm(
      t('cloud.messages.deleteThisPhotographAndItsManagedOriginalThumbnailAnd'),
    )
  )
    return
  busy.value = true
  try {
    await uploads.api(
      item.context,
      operation === 'retry'
        ? `/jobs/${item.jobId}/retry`
        : `/photos/${item.job.photo_id}/delete`,
      {},
    )
    if (operation === 'delete') remove(fileId)
    else {
      uploads.trackJobs(
        item.context,
        [{ ...item.job, state: 'queued', error_code: null }],
        { partial: true },
      )
    }
    uploads.revision.value++
  } catch (error) {
    const entry = uploadingFiles.value.get(fileId)
    if (entry)
      entry.error =
        error instanceof Error
          ? error.message
          : t('cloud.messages.uploadFailed')
    uploads.notify()
  } finally {
    busy.value = false
  }
}
</script>
<template>
  <ClientOnly>
    <Teleport to="body">
      <UploadQueuePanel
        :uploading-files="uploadingFiles"
        :show-queue-link="false"
        @remove-file="remove"
        @clear-completed="clearCompleted"
        @clear-all="clearAll"
      >
        <template #file-details="{ fileId }">
          <NuxtLink
            v-if="tracked.get(fileId)"
            :to="`/sites/${tracked.get(fileId)!.context.siteId}/photos`"
            class="text-xs text-muted underline"
            >{{ tracked.get(fileId)!.context.name }}</NuxtLink
          >
        </template>
        <template #file-actions="{ fileId }">
          <template
            v-if="
              tracked.get(fileId)?.context.admin &&
              tracked.get(fileId)?.job?.state === 'failed'
            "
          >
            <UButton
              v-if="tracked.get(fileId)!.job!.attempts <= 6"
              size="xs"
              color="neutral"
              variant="soft"
              :disabled="busy"
              @click="jobAction(fileId, 'retry')"
              >{{ t('cloud.messages.retry') }}</UButton
            >
            <UButton
              size="xs"
              color="error"
              variant="soft"
              :disabled="busy"
              @click="jobAction(fileId, 'delete')"
              >{{ t('cloud.messages.remove') }}</UButton
            >
          </template>
        </template>
      </UploadQueuePanel>
    </Teleport>
  </ClientOnly>
</template>
