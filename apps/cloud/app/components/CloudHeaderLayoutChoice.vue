<script setup lang="ts">
defineProps<{ disabled?: boolean }>()
const model = defineModel<'embedded' | 'fixed'>({ required: true })
const { t } = useI18n()
const items = computed(() =>
  (['embedded', 'fixed'] as const).map((value) => ({
    value,
    label: t('cloud.presentation.' + value),
  })),
)
</script>
<template>
  <URadioGroup
    v-model="model"
    :disabled="disabled"
    :aria-label="t('cloud.presentation.layout')"
    :items="items"
    orientation="horizontal"
    variant="card"
    indicator="hidden"
    :ui="{
      root: 'w-full',
      fieldset: 'grid grid-cols-2 gap-3',
      item: 'relative min-w-0 overflow-hidden p-0',
      wrapper: 'w-full min-w-0',
      label: 'block w-full',
    }"
  >
    <template #label="{ item }">
      <span class="sr-only">{{ item.label }}</span>
      <span
        aria-hidden="true"
        class="flex aspect-video w-full flex-col gap-[6%] overflow-hidden p-[6%]"
      >
        <span
          v-if="item.value === 'fixed'"
          class="flex h-1/4 shrink-0 items-center gap-[6%] rounded-sm bg-[var(--input)] p-[2%]"
        >
          <USkeleton
            as="span"
            class="aspect-square h-full shrink-0 animate-none rounded-full"
          />
          <span class="flex h-full flex-1 flex-col justify-center gap-[20%]">
            <USkeleton
              as="span"
              class="h-1/4 w-1/2 animate-none"
            />
            <USkeleton
              as="span"
              class="h-1/5 w-1/3 animate-none"
            />
          </span>
          <USkeleton
            as="span"
            class="h-1/3 w-1/6 animate-none"
          />
        </span>
        <span class="grid min-h-0 flex-1 grid-cols-3 gap-[5%]">
          <span class="flex min-h-0 flex-col gap-[8%]">
            <span
              v-if="item.value === 'embedded'"
              class="flex h-3/5 shrink-0 flex-col items-center justify-center gap-[10%] rounded-sm bg-[var(--input)] p-[6%]"
            >
              <USkeleton
                as="span"
                class="aspect-square h-1/2 animate-none rounded-full"
              />
              <USkeleton
                as="span"
                class="h-[10%] w-3/4 animate-none"
              />
              <USkeleton
                as="span"
                class="h-[8%] w-1/2 animate-none"
              />
            </span>
            <USkeleton
              as="span"
              class="min-h-0 flex-1 animate-none rounded-sm"
            />
            <USkeleton
              v-if="item.value === 'fixed'"
              as="span"
              class="h-2/5 animate-none rounded-sm"
            />
          </span>
          <span class="flex min-h-0 flex-col gap-[8%]">
            <USkeleton
              as="span"
              class="h-2/5 animate-none rounded-sm"
            />
            <USkeleton
              as="span"
              class="min-h-0 flex-1 animate-none rounded-sm"
            />
          </span>
          <span class="flex min-h-0 flex-col gap-[8%]">
            <USkeleton
              as="span"
              class="h-3/5 animate-none rounded-sm"
            />
            <USkeleton
              as="span"
              class="min-h-0 flex-1 animate-none rounded-sm"
            />
          </span>
        </span>
      </span>
    </template>
  </URadioGroup>
</template>
