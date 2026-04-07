<script setup lang="ts">
import { motion } from 'motion-v'

const route = useRoute()

const steps = [
  { label: '欢迎', route: 'onboarding' },
  { label: '管理员账户', route: 'onboarding-admin' },
  { label: '站点信息', route: 'onboarding-site' },
  { label: '存储配置', route: 'onboarding-storage' },
  { label: '地图服务', route: 'onboarding-map' },
  { label: '完成', route: 'onboarding-complete' },
]

const currentStepIndex = computed(() => {
  return steps.findIndex((s) => s.route === route.name)
})
</script>

<template>
  <div
    class="min-h-screen flex items-center justify-center bg-neutral-950 text-white relative overflow-hidden selection:bg-primary-500/30"
  >
    <!-- Background Elements -->
    <div class="absolute inset-0 pointer-events-none">
      <!-- Noise Texture -->
      <div
        class="absolute inset-0 bg-[url('~/assets/images/noise.svg')] mix-blend-overlay"
      ></div>

      <!-- Spotlights -->
      <motion.div
        class="absolute -top-[20%] -left-[10%] w-[50vw] h-[50vw] bg-primary-500/20 rounded-full blur-[120px]"
        :animate="{
          x: [0, 50, 0],
          y: [0, 30, 0],
          scale: [1, 1.1, 1],
        }"
        :transition="{
          duration: 20,
          repeat: Infinity,
          repeatType: 'reverse',
          ease: 'easeInOut',
        }"
      />
      <motion.div
        class="absolute top-[40%] -right-[10%] w-[40vw] h-[40vw] bg-purple-500/10 rounded-full blur-[100px]"
        :animate="{
          x: [0, -30, 0],
          y: [0, 50, 0],
          scale: [1, 1.2, 1],
        }"
        :transition="{
          duration: 15,
          repeat: Infinity,
          repeatType: 'reverse',
          ease: 'easeInOut',
          delay: 2,
        }"
      />
      <motion.div
        class="absolute -bottom-[20%] left-[20%] w-[45vw] h-[45vw] bg-blue-500/10 rounded-full blur-[120px]"
        :animate="{
          x: [0, 40, 0],
          y: [0, -40, 0],
        }"
        :transition="{
          duration: 18,
          repeat: Infinity,
          repeatType: 'reverse',
          ease: 'easeInOut',
          delay: 5,
        }"
      />
    </div>

    <!-- Main Container -->
    <motion.div
      class="relative z-10 w-full max-w-6xl h-[80vh] max-h-225 mx-4 lg:mx-8 flex rounded-3xl overflow-hidden border border-white/10 bg-neutral-900/40 backdrop-blur-2xl shadow-2xl shadow-black/50"
      :initial="{ opacity: 0, scale: 0.95, y: 20 }"
      :animate="{ opacity: 1, scale: 1, y: 0 }"
      :transition="{ duration: 0.8, ease: [0.16, 1, 0.3, 1] }"
    >
      <!-- Left Panel: Sidebar -->
      <div
        class="hidden lg:flex w-80 flex-col gap-6 p-8 border-r border-white/5 bg-white/3 relative"
      >
        <!-- Logo -->
        <div class="flex items-center gap-3">
          <img
            src="/favicon-96x96.png"
            alt="ChronoFrame Logo"
            class="size-14 object-contain"
          />
          <span
            class="text-2xl font-bold tracking-tight bg-clip-text text-transparent bg-linear-to-r from-white to-white/60"
          >
            ChronoFrame
          </span>
        </div>

        <!-- Steps -->
        <div class="flex-1">
          <div class="space-y-1 relative">
            <!-- Connecting Line -->
            <div
              class="absolute left-6.75 top-4 bottom-4 w-0.5 bg-white/5 rounded-full"
            >
              <!-- Active Line Wrapper -->
              <div
                class="absolute top-0 left-0 w-full overflow-hidden transition-[height] duration-500 ease-in-out"
                :style="{
                  height: `${Math.min(((currentStepIndex + 1) / (steps.length - 1)) * 100, 100)}%`,
                }"
              >
                <!-- Gradient Color -->
                <div
                  class="absolute inset-0"
                  :style="{
                    background: `linear-gradient(to bottom, var(--color-primary-500) ${
                      (currentStepIndex / (currentStepIndex + 1)) * 100
                    }%, transparent)`,
                  }"
                ></div>

                <!-- Flowing Light -->
                <motion.div
                  class="absolute left-0 w-full h-20 bg-linear-to-b from-transparent via-white/60 to-transparent opacity-70"
                  :animate="{ top: ['-100%', '100%'] }"
                  :transition="{
                    duration: 1.6,
                    repeat: Infinity,
                    ease: 'linear',
                    repeatDelay: 0.5,
                  }"
                />
              </div>
            </div>

            <div
              v-for="(step, index) in steps"
              :key="step.route"
              class="relative flex items-center gap-4 py-3 pl-2 group"
            >
              <!-- Active Indicator Background -->
              <motion.div
                v-if="index === currentStepIndex"
                layout-id="activeStep"
                class="absolute inset-0 bg-white/5 rounded-xl -z-10"
                :transition="{ type: 'spring', stiffness: 300, damping: 30 }"
              />

              <!-- Step Circle -->
              <div
                class="relative z-10 size-10 rounded-full flex items-center justify-center text-sm font-medium transition-all duration-500 border-2"
                :class="[
                  index < currentStepIndex
                    ? 'bg-primary-500 border-primary-500 text-white shadow-lg shadow-primary-500/20'
                    : index === currentStepIndex
                      ? 'bg-neutral-900 border-primary-500 text-primary-400 shadow-lg shadow-primary-500/10'
                      : 'bg-neutral-900 border-white/10 text-neutral-500 group-hover:border-white/20',
                ]"
              >
                <UIcon
                  v-if="index < currentStepIndex"
                  name="tabler:check"
                  class="w-5 h-5"
                />
                <span v-else>{{ index + 1 }}</span>
              </div>

              <!-- Label -->
              <div class="flex flex-col">
                <span
                  class="text-sm font-medium transition-colors duration-300"
                  :class="[
                    index <= currentStepIndex
                      ? 'text-white'
                      : 'text-neutral-500 group-hover:text-neutral-400',
                  ]"
                >
                  {{ step.label }}
                </span>
                <span
                  v-if="index === currentStepIndex"
                  class="text-xs text-primary-400/80 font-medium"
                >
                  当前进行
                </span>
              </div>
            </div>
          </div>
        </div>

        <!-- Footer -->
        <div class="text-xs text-neutral-500 font-medium">
          v{{ $config.public.VERSION }}
        </div>
      </div>

      <!-- Right Panel: Content -->
      <div
        class="flex-1 flex flex-col relative overflow-hidden bg-neutral-900/20"
      >
        <!-- Top Bar (Mobile only) -->
        <div
          class="lg:hidden flex items-center justify-between p-6 border-b border-white/5 bg-neutral-900/50 backdrop-blur-md z-20"
        >
          <div class="flex items-center gap-3">
            <img
              src="/favicon-96x96.png"
              alt="ChronoFrame Logo"
              class="size-8 object-contain"
            />
            <span class="font-bold">ChronoFrame</span>
          </div>
          <div class="text-sm text-neutral-400">
            Step {{ currentStepIndex + 1 }}/{{ steps.length }}
          </div>
        </div>

        <!-- Content Area -->
        <div class="flex-1 flex flex-col overflow-hidden">
          <slot />
        </div>
      </div>
    </motion.div>
  </div>
</template>
