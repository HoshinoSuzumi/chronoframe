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
    class="cf-header-layout-choice"
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
          class="flex h-1/4 shrink-0 items-center gap-[6%] cf-layout-identity rounded-sm p-[2%]"
        >
          <USkeleton
            as="span"
            class="cf-layout-skeleton aspect-square h-full shrink-0 animate-none rounded-full"
          />
          <span class="flex h-full flex-1 flex-col justify-center gap-[20%]">
            <USkeleton
              as="span"
              class="cf-layout-skeleton h-1/4 w-1/2 animate-none"
            />
            <USkeleton
              as="span"
              class="cf-layout-skeleton h-1/5 w-1/3 animate-none"
            />
          </span>
          <USkeleton
            as="span"
            class="cf-layout-skeleton h-1/3 w-1/6 animate-none"
          />
        </span>
        <span class="grid min-h-0 flex-1 grid-cols-3 gap-[5%]">
          <span class="flex min-h-0 flex-col gap-[8%]">
            <span
              v-if="item.value === 'embedded'"
              class="flex h-3/5 shrink-0 flex-col items-center justify-center gap-[10%] cf-layout-identity rounded-sm p-[6%]"
            >
              <USkeleton
                as="span"
                class="cf-layout-skeleton aspect-square h-1/2 animate-none rounded-full"
              />
              <USkeleton
                as="span"
                class="cf-layout-skeleton h-[10%] w-3/4 animate-none"
              />
              <USkeleton
                as="span"
                class="cf-layout-skeleton h-[8%] w-1/2 animate-none"
              />
            </span>
            <USkeleton
              as="span"
              class="cf-layout-skeleton min-h-0 flex-1 animate-none rounded-sm"
            />
            <USkeleton
              v-if="item.value === 'fixed'"
              as="span"
              class="cf-layout-skeleton h-2/5 animate-none rounded-sm"
            />
          </span>
          <span class="flex min-h-0 flex-col gap-[8%]">
            <USkeleton
              as="span"
              class="cf-layout-skeleton h-2/5 animate-none rounded-sm"
            />
            <USkeleton
              as="span"
              class="cf-layout-skeleton min-h-0 flex-1 animate-none rounded-sm"
            />
          </span>
          <span class="flex min-h-0 flex-col gap-[8%]">
            <USkeleton
              as="span"
              class="cf-layout-skeleton h-3/5 animate-none rounded-sm"
            />
            <USkeleton
              as="span"
              class="cf-layout-skeleton min-h-0 flex-1 animate-none rounded-sm"
            />
          </span>
        </span>
      </span>
    </template>
  </URadioGroup>
</template>

<style>
.cf-header-layout-choice {
  --layout-photo: var(--secondary);
  --layout-header: var(--input);
  --layout-detail: #f4f5f7;
}
.cf-header-layout-choice .cf-layout-skeleton {
  background-color: var(--layout-photo);
}
.cf-header-layout-choice .cf-layout-identity {
  background-color: var(--layout-header);
  --layout-photo: var(--layout-detail);
}
.cf-header-layout-choice [data-slot='item']:has([data-state='checked']) {
  border-color: #416f9f;
  background-color: #edf4fc;
  box-shadow: inset 0 0 0 1px #416f9f;
  --layout-photo: #9bb5d4;
  --layout-header: #5f7fa6;
  --layout-detail: #edf3fb;
}
.dark .cf-header-layout-choice {
  --layout-detail: #c4c8d0;
}
.dark .cf-header-layout-choice [data-slot='item']:has([data-state='checked']) {
  border-color: #8bb5e8;
  background-color: #1f3045;
  box-shadow: inset 0 0 0 1px #8bb5e8;
  --layout-photo: #57769b;
  --layout-header: #8babd1;
  --layout-detail: #22364f;
}
</style>
