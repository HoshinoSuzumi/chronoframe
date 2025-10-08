<script lang="ts" setup>
import { z } from 'zod'
import type { ButtonProps, FormSubmitEvent } from '@nuxt/ui'
import { twMerge } from 'tailwind-merge'
import TanmantangIcon from '../icon/TanmantangIcon.vue';

defineProps<{
  icon?: string
  title?: string
  subtitle?: string
  providers?: Array<ButtonProps | false | undefined>
  class?: string
  loading?: boolean
}>()

const emit = defineEmits<{
  submit: [event: FormSubmitEvent<Schema>]
}>()

const schema = z.object({
  email: z.email($t('auth.form.errors.invalidEmail')),
  password: z.string().min(6, $t('auth.form.errors.invalidPassword')),
})

type Schema = z.output<typeof schema>

const state = reactive<Partial<Schema>>({
  email: undefined,
  password: '',
})

const onSubmit = async (event: FormSubmitEvent<Schema>) => {
  emit('submit', event)
}
</script>

<template>
  <div :class="twMerge('w-full space-y-6 max-w-sm', $props.class)">
    <UButton
      type="button"
      variant="link"
      color="neutral"
      icon="tabler:arrow-left"
      size="xs"
      to="/"
    >
      {{ $t('auth.form.action.backToHome') }}
    </UButton>
    <!-- Header -->
    <div class="flex flex-col items-center">
      <!-- Icon -->
      <div
        v-if="icon"
        class="mb-2"
      >
        <Icon
          :name="icon"
          class="size-8 inline-block shrink-0"
        />
      </div>
      <!-- TanmantangSVG -->
      <div v-if="TanmantangIcon" class="mb-2">
        <TanmantangIcon class="size-24 inline-block shrink-0" />
      </div>
      <!-- Title -->
      <div
        v-if="title"
        class="text-2xl font-medium text-highlighted text-pretty"
      >
        {{ title }}
      </div>
      <!-- Subtitle -->
      <div
        v-if="subtitle"
        class="mt-1 text-sm text-muted text-pretty"
      >
        {{ subtitle }}
      </div>
    </div>
    <div class="flex flex-col gap-4">
      <div
        v-if="providers && providers.filter((item) => !!item).length > 0"
        :class="providers.length > 3 ? 'space-y-2' : 'flex items-center gap-2'"
      >
        <UButton
          v-for="provider in providers.filter((item) => !!item)"
          :key="provider.icon"
          v-bind="provider"
          :loading="loading"
        />
      </div>
      <USeparator
        v-if="providers && providers.filter((item) => !!item).length > 0"
        :label="$t('auth.form.action.or')"
      />
      <UForm
        class="space-y-4"
        :schema="schema"
        :state="state"
        :disabled="loading"
        @submit="onSubmit"
      >
        <UFormField
          :label="$t('auth.form.labels.email')"
          name="email"
        >
          <UInput
            v-model="state.email"
            :autofocus="false"
            class="w-full"
          />
        </UFormField>

        <UFormField
          :label="$t('auth.form.labels.password')"
          name="password"
        >
          <UInput
            v-model="state.password"
            :autofocus="false"
            type="password"
            class="w-full"
          />
        </UFormField>

        <div class="flex flex-col gap-2">
          <UButton
            type="submit"
            variant="soft"
            color="info"
            trailing-icon="tabler:login-2"
            block
            :loading="loading"
          >
            {{ $t('auth.form.action.continue') }}
          </UButton>
        </div>
      </UForm>
    </div>
  </div>
</template>

<style scoped></style>
