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
    size="sm"
    :ui="{
      root: 'w-full',
      fieldset: 'grid grid-cols-2 gap-3',
      item: 'relative min-w-0 p-3',
      container: 'absolute bottom-3.5 left-3',
      wrapper: 'w-full min-w-0',
      label: 'block w-full',
    }"
  >
    <template #label="{ item }">
      <span class="flex flex-col gap-3">
        <span
          aria-hidden="true"
          class="flex h-32 flex-col gap-2 overflow-hidden rounded border border-default bg-default p-2"
        >
          <span
            v-if="item.value === 'fixed'"
            class="flex items-center gap-2 border-b border-default pb-2"
          >
            <USkeleton
              as="span"
              class="size-5 shrink-0 animate-none rounded-full"
            />
            <span class="flex flex-1 flex-col gap-1">
              <USkeleton
                as="span"
                class="h-1.5 w-1/2 animate-none"
              />
              <USkeleton
                as="span"
                class="h-1 w-1/3 animate-none"
              />
            </span>
            <USkeleton
              as="span"
              class="h-2 w-5 animate-none"
            />
          </span>
          <span class="grid flex-1 grid-cols-3 items-start gap-1.5">
            <span class="flex flex-col gap-1.5">
              <span
                v-if="item.value === 'embedded'"
                class="flex h-16 flex-col items-center justify-center gap-1.5 rounded bg-elevated/50"
              >
                <USkeleton
                  as="span"
                  class="size-5 animate-none rounded-full"
                />
                <USkeleton
                  as="span"
                  class="h-1.5 w-3/4 animate-none"
                />
                <USkeleton
                  as="span"
                  class="h-1 w-1/2 animate-none"
                />
              </span>
              <USkeleton
                as="span"
                class="h-11 w-full animate-none rounded-sm"
              />
              <USkeleton
                as="span"
                class="h-12 w-full animate-none rounded-sm"
              />
            </span>
            <span class="flex flex-col gap-1.5">
              <USkeleton
                as="span"
                class="h-12 w-full animate-none rounded-sm"
              />
              <USkeleton
                as="span"
                class="h-16 w-full animate-none rounded-sm"
              />
            </span>
            <span class="flex flex-col gap-1.5">
              <USkeleton
                as="span"
                class="h-16 w-full animate-none rounded-sm"
              />
              <USkeleton
                as="span"
                class="h-11 w-full animate-none rounded-sm"
              />
            </span>
          </span>
        </span>
        <span class="pl-6">{{ item.label }}</span>
      </span>
    </template>
  </URadioGroup>
</template>
