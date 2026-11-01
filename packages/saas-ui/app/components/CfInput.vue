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
const input = useTemplateRef<{ inputRef: HTMLInputElement }>('input')
defineExpose({
  focus: () => input.value?.inputRef?.focus(),
  setCustomValidity: (message: string) =>
    input.value?.inputRef?.setCustomValidity(message),
  inputRef: computed(() => input.value?.inputRef),
})
</script>
<template>
  <UInput
    ref="input"
    v-bind="$attrs"
    :model-value="value !== undefined ? value : model"
    class="cf-input"
    @update:model-value="model = $event"
    @input="onInput"
  />
</template>
