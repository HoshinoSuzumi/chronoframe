<script setup lang="ts">
import { motion, AnimatePresence } from 'motion-v'
import { REACTION_DEFINITIONS } from './reaction-definitions'

interface Reaction {
  id: string
  iconName: string
  label: string
  count?: number
}

interface Props {
  isOpen: boolean
  triggerEl?: HTMLElement | null
  selectedReaction?: string | null
  reactionCounts?: Record<string, number>
}

const props = defineProps<Props>()
const emit = defineEmits<{
  select: [id: string, iconName: string]
  close: []
}>()

// 用于检测点击外部
const pickerRef = ref<HTMLElement | null>(null)

// 点击外部时关闭
onClickOutside(
  pickerRef,
  () => {
    if (props.isOpen) {
      emit('close')
    }
  },
  {
    ignore: computed(() => (props.triggerEl ? [props.triggerEl] : [])),
  },
)

// 可用的表态选项
const reactions = computed<Reaction[]>(() =>
  REACTION_DEFINITIONS.map((reaction) => ({
    id: reaction.id,
    iconName: reaction.iconName,
    label: $t(reaction.labelKey),
    count: props.reactionCounts?.[reaction.id] || 0,
  })),
)

// 格式化数量显示
const formatCount = (count?: number): string => {
  if (!count || count === 0) return ''
  if (count >= 1000) {
    return `${(count / 1000).toFixed(1)}k`
  }
  return count.toString()
}

const handleSelect = (id: string) => {
  const reaction = reactions.value.find((r) => r.id === id)
  if (reaction) {
    emit('select', id, reaction.iconName)
  }
}
</script>

<template>
  <AnimatePresence>
    <motion.div
      v-if="isOpen"
      ref="pickerRef"
      :initial="{ opacity: 0, scale: 0.9, y: 10 }"
      :animate="{ opacity: 1, scale: 1, y: 0 }"
      :exit="{ opacity: 0, scale: 0.9, y: 10 }"
      :transition="{
        type: 'spring',
        stiffness: 400,
        damping: 25,
        mass: 0.8,
      }"
      class="absolute bottom-full right-0 mb-2 z-30"
      @click.stop
    >
      <div
        class="bg-white/95 dark:bg-neutral-800/90 backdrop-blur-xl rounded-2xl border border-neutral-300/60 dark:border-white/10 shadow-2xl shadow-black/10 dark:shadow-black/30 p-3"
      >
        <!-- 表态网格 -->
        <div class="grid grid-cols-4 gap-2 min-w-55">
          <motion.button
            v-for="reaction in reactions"
            :key="reaction.id"
            type="button"
            :initial="{ scale: 0, opacity: 0 }"
            :animate="{
              scale: 1,
              opacity: 1,
              transition: {
                type: 'spring',
                stiffness: 500,
                damping: 20,
                delay: reactions.indexOf(reaction) * 0.03,
              },
            }"
            :while-hover="{
              scale: 1.2,
              transition: {
                type: 'spring',
                stiffness: 500,
                damping: 20,
              },
            }"
            :while-tap="{
              scale: 0.9,
              transition: {
                type: 'spring',
                stiffness: 500,
                damping: 20,
              },
            }"
            :class="[
              'relative aspect-square w-full min-w-12 rounded-xl flex items-center justify-center transition-colors cursor-pointer shrink-0 group/reaction',
              'hover:bg-neutral-100/80 dark:hover:bg-white/10',
              'active:bg-neutral-200/80 dark:active:bg-white/20',
              selectedReaction === reaction.id
                ? 'bg-blue-100 dark:bg-blue-500/20 ring-2 ring-blue-500/50'
                : 'bg-transparent',
            ]"
            :title="reaction.label"
            @click="handleSelect(reaction.id)"
          >
            <Icon
              :name="reaction.iconName"
              class="text-[28px] select-none"
              mode="svg"
            />

            <!-- 表情 label：移动端常显，桌面端悬浮显示 -->
            <span
              class="absolute left-1/2 -bottom-1.5 -translate-x-1/2 pointer-events-none select-none whitespace-nowrap text-xs sm:text-[10px] font-medium leading-none text-neutral-600/70 md:text-neutral-500/85 dark:text-neutral-400/80 opacity-100 transition-opacity duration-200 md:opacity-0 md:group-hover/reaction:opacity-100"
            >
              {{ reaction.label }}
            </span>

            <!-- 数量徽章 - 右上角 -->
            <motion.span
              v-if="reaction.count !== undefined && reaction.count > 0"
              :initial="{ scale: 0, opacity: 0 }"
              :animate="{ scale: 1, opacity: 1 }"
              :class="[
                'absolute -top-1 -right-1 min-w-4.5 h-4.5 px-1',
                'flex items-center justify-center',
                'text-[9px] font-bold leading-none',
                'rounded-full',
                'shadow-sm',
                selectedReaction === reaction.id
                  ? 'bg-blue-500 text-white'
                  : 'bg-linear-to-br from-neutral-100 to-neutral-200 dark:from-neutral-700 dark:to-neutral-600 text-neutral-700 dark:text-neutral-100',
                'border border-white/50 dark:border-neutral-800/50',
                'group-hover:scale-110 transition-transform duration-150',
              ]"
            >
              {{ formatCount(reaction.count) }}
            </motion.span>
          </motion.button>
        </div>
      </div>
    </motion.div>
  </AnimatePresence>
</template>
