<script lang="ts" setup>
import TablerStar from '#gallery/components/icon/TablerStar.vue'
import TablerStarFilled from '#gallery/components/icon/TablerStarFilled.vue'
import TablerStarHalfFilled from '#gallery/components/icon/TablerStarHalfFilled.vue'

interface Props {
  modelValue: number
  allowHalf?: boolean
  allowClear?: boolean
  size?: 'xs' | 'sm' | 'md' | 'lg' | 'xl'
  readonly?: boolean
}

const props = withDefaults(defineProps<Props>(), {
  allowHalf: true,
  allowClear: true,
  size: 'md',
  readonly: false,
})

const emit = defineEmits<{
  'update:modelValue': [value: number]
}>()

const sizeClasses = {
  xs: 'text-sm',
  sm: 'text-base',
  md: 'text-lg',
  lg: 'text-xl',
  xl: 'text-2xl',
}

const handleClick = (index: number, isHalf: boolean = false) => {
  if (props.readonly) return
  let newValue = index + (isHalf ? 0.5 : 1)
  if (props.allowClear && props.modelValue === newValue) {
    newValue = 0
  }
  emit('update:modelValue', newValue)
}

const getStarType = (index: number) => {
  const value = props.modelValue
  if (value >= index + 1) {
    return 'filled'
  } else if (props.allowHalf && value >= index + 0.5) {
    return 'half'
  } else {
    return 'empty'
  }
}
</script>

<template>
  <div
    class="rating flex items-center gap-1"
    :class="[sizeClasses[props.size], { 'cursor-pointer': !props.readonly }]"
  >
    <template v-if="!props.allowHalf">
      <div
        v-for="i in 5"
        :key="`no-half-${i}`"
        class="star relative"
        :class="{ readonly: props.readonly }"
        @click="handleClick(i - 1)"
      >
        <TablerStar
          v-if="getStarType(i - 1) === 'empty'"
          class="text-neutral-500 dark:text-neutral-300"
        />
        <TablerStarFilled
          v-else-if="getStarType(i - 1) === 'filled'"
          class="text-yellow-400"
        />
        <TablerStarHalfFilled
          v-else
          class="text-yellow-400"
        />
      </div>
    </template>
    <template v-else>
      <div
        v-for="i in 5"
        :key="`half-${i}`"
        class="star relative"
        :class="{ readonly: props.readonly }"
      >
        <TablerStar
          v-if="getStarType(i - 1) === 'empty'"
          class="text-neutral-500 dark:text-neutral-300"
        />
        <TablerStarFilled
          v-else-if="getStarType(i - 1) === 'filled'"
          class="text-yellow-400"
        />
        <TablerStarHalfFilled
          v-else
          class="text-yellow-400"
        />
        <div class="absolute inset-0 flex">
          <div
            class="w-1/2"
            @click.stop="handleClick(i - 1, true)"
          ></div>
          <div
            class="w-1/2"
            @click.stop="handleClick(i - 1)"
          ></div>
        </div>
      </div>
    </template>
  </div>
</template>

<style scoped>
.star {
  transition: transform 0.2s;
}
.star:hover {
  transform: scale(1.1);
}
.star.readonly:hover {
  transform: none;
}
</style>
