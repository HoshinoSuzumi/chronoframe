<script setup lang="ts">
defineOptions({ inheritAttrs: false })
const emit = defineEmits<{ input: [event: Event] }>()
// Existing validation callbacks must observe the new model, as with native v-model.
function onInput(event: Event) {
  void nextTick(() => emit('input', event))
}
withDefaults(defineProps<{ value?: string | number | null }>(), {
  value: undefined,
})
const model = defineModel<string | number | null>()
</script>
<template>
  <UTextarea
    v-bind="$attrs"
    :model-value="value !== undefined ? value : model"
    class="cf-input w-full"
    @update:model-value="model = $event"
    @input="onInput"
  />
</template>
