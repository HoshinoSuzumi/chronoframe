<script setup lang="ts">
defineProps<{
  count: number
  total: number
  rangeTip?: boolean
  teleport?: boolean
}>()
</script>
<template>
  <Teleport
    to="body"
    :disabled="!teleport"
  >
    <Transition
      enter-active-class="transition-all duration-300 ease-out motion-reduce:transition-none"
      enter-from-class="translate-y-8 opacity-0 scale-95"
      enter-to-class="translate-y-0 opacity-100 scale-100"
      leave-active-class="transition-all duration-200 ease-in motion-reduce:transition-none"
      leave-from-class="translate-y-0 opacity-100 scale-100"
      leave-to-class="translate-y-8 opacity-0 scale-95"
    >
      <div
        v-if="count > 0"
        class="console-selection-toolbar fixed bottom-8 left-1/2 -translate-x-1/2 z-60 w-max flex flex-col items-center gap-2"
        role="toolbar"
        :aria-label="
          $t('dashboard.photos.selection.selected', { count, total })
        "
      >
        <p
          v-if="rangeTip"
          class="hidden items-center gap-1.5 max-w-[calc(100vw-2rem)] px-3 py-1 rounded-full bg-white/80 dark:bg-neutral-900/80 backdrop-blur-xl border border-neutral-200/80 dark:border-neutral-800/80 text-xs text-neutral-500 dark:text-neutral-400 pointer-fine:flex"
        >
          <UIcon
            name="i-tabler-info-circle"
            class="size-3.5 shrink-0"
          />
          {{ $t('ui.action.select.rangeTip') }}
        </p>
        <div
          class="max-w-[calc(100vw-1rem)] overflow-x-auto px-2 py-1.5 bg-white/90 dark:bg-neutral-900/90 backdrop-blur-xl shadow-xl rounded-full border border-neutral-200/80 dark:border-neutral-800/80 flex items-center gap-3 sm:gap-6 shadow-black/5 dark:shadow-black/20"
        >
          <div
            class="pl-4 pr-1 border-r border-neutral-200 dark:border-neutral-800 min-w-max"
          >
            <p
              class="text-sm font-medium tracking-wide text-neutral-700 dark:text-neutral-200"
            >
              {{ $t('dashboard.photos.selection.selected', { count, total }) }}
            </p>
          </div>
          <div class="flex items-center gap-1 sm:gap-1.5 pr-2"><slot /></div>
        </div>
      </div>
    </Transition>
  </Teleport>
</template>
