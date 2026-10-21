<script setup lang="ts">
import {
  tourIds,
  type TourStatus,
} from '@chronoframe/gallery/shared/types/tours'

defineProps<{ debug?: boolean }>()
const { records, ready, busy, update } = useTours()
const { user } = useUserSession()
const statuses = computed(() =>
  (['pending', 'completed', 'skipped'] as const).map((value) => ({
    label: $t(`tours.status.${value}`),
    value,
  })),
)
</script>
<template>
  <details
    v-if="debug && user?.isAdmin"
    class="group rounded-md border border-default text-xs"
  >
    <summary
      class="flex cursor-pointer list-none items-center justify-between gap-2 px-3 py-2 font-medium select-none [&::-webkit-details-marker]:hidden"
    >
      <span>{{ $t('tours.debugTitle') }}</span>
      <Icon
        name="tabler:chevron-down"
        class="size-3.5 shrink-0 text-muted transition-transform group-open:rotate-180"
      />
    </summary>
    <div class="space-y-2 border-t border-default px-3 py-2">
      <div
        v-for="id in tourIds"
        :key="id"
        class="flex min-w-0 items-center justify-between gap-3"
      >
        <span class="min-w-0 truncate text-muted">{{
          $t(`tours.${id}.title`)
        }}</span>
        <USelect
          :model-value="records[id]"
          :items="statuses"
          :aria-label="$t(`tours.${id}.title`)"
          :disabled="busy || !ready"
          :ui="{ content: 'z-[10010]' }"
          size="xs"
          class="w-24 shrink-0"
          @update:model-value="update(id, $event as TourStatus)"
        />
      </div>
      <div class="border-t border-default pt-2">
        <UButton
          :loading="busy"
          :disabled="!ready"
          icon="tabler:refresh"
          size="xs"
          color="neutral"
          variant="soft"
          @click="update()"
          >{{ $t('tours.reset') }}</UButton
        >
      </div>
    </div>
  </details>
  <section
    v-else-if="user?.isAdmin"
    class="space-y-3 rounded-md border border-default p-5"
    data-tour="reset"
  >
    <h3 class="font-semibold">{{ $t('tours.controlsTitle') }}</h3>
    <p class="text-sm text-muted">{{ $t('tours.resetHelp') }}</p>
    <UButton
      :loading="busy"
      :disabled="!ready"
      icon="tabler:refresh"
      @click="update(undefined, 'pending', { redirectTo: '/dashboard' })"
      >{{ $t('tours.reset') }}</UButton
    >
  </section>
</template>
