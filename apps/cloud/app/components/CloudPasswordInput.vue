<script setup lang="ts">
import { Eye, EyeOff } from 'lucide-vue-next'
defineOptions({ inheritAttrs: false })
const model = defineModel<string>({ default: '' })
const visible = ref(false)
</script>
<template>
  <div class="cf-auth-password">
    <CfInput
      v-bind="$attrs"
      v-model="model"
      :type="visible ? 'text' : 'password'"
    />
    <CfButton
      variant="ghost"
      size="icon"
      type="button"
      :aria-label="
        $t(visible ? 'cloud.auth.hidePassword' : 'cloud.auth.showPassword')
      "
      :aria-pressed="visible"
      :disabled="!!$attrs.disabled"
      @click="visible = !visible"
    >
      <component
        :is="visible ? EyeOff : Eye"
        :size="17"
        aria-hidden="true"
      />
    </CfButton>
  </div>
</template>
