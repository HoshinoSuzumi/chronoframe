<script setup lang="ts">
definePageMeta({
  layout: 'onboarding',
})
</script>

<template>
  <WizardStep
    title="欢迎使用 ChronoFrame"
    description="跟随向导，在几分钟内设置好您的画廊。"
  >
    <div class="space-y-6">
      <div class="text-neutral-300 text-base leading-relaxed">
        <p>
          ChronoFrame
          是一款多功能个人画廊应用程序。在您开始上传照片之前，我们需要先配置一些内容：
        </p>
      </div>

      <div class="grid grid-cols-1 sm:grid-cols-2 gap-4">
        <div
          class="p-4 rounded-xl bg-white/5 border border-white/10 flex items-start gap-4"
        >
          <div
            class="size-12 flex items-center justify-center rounded-lg bg-primary-500/20 text-primary-400"
          >
            <UIcon
              name="tabler:user"
              class="size-6"
            />
          </div>
          <div>
            <h3 class="font-medium text-white">管理员账户</h3>
            <p class="text-sm text-neutral-400 mt-1">用于登录管理后台</p>
          </div>
        </div>

        <div
          class="p-4 rounded-xl bg-white/5 border border-white/10 flex items-start gap-4"
        >
          <div
            class="size-12 flex items-center justify-center rounded-lg bg-purple-500/20 text-purple-400"
          >
            <UIcon
              name="tabler:device-laptop"
              class="size-6"
            />
          </div>
          <div>
            <h3 class="font-medium text-white">站点信息</h3>
            <p class="text-sm text-neutral-400 mt-1">个性化您的画廊</p>
          </div>
        </div>

        <div
          class="p-4 rounded-xl bg-white/5 border border-white/10 flex items-start gap-4"
        >
          <div
            class="size-12 flex items-center justify-center rounded-lg bg-blue-500/20 text-blue-400"
          >
            <UIcon
              name="tabler:server"
              class="size-6"
            />
          </div>
          <div>
            <h3 class="font-medium text-white">存储</h3>
            <p class="text-sm text-neutral-400 mt-1">
              将您的照片存储在本地或云端
            </p>
          </div>
        </div>

        <div
          class="p-4 rounded-xl bg-white/5 border border-white/10 flex items-start gap-4"
        >
          <div
            class="size-12 flex items-center justify-center rounded-lg bg-green-500/20 text-green-400"
          >
            <UIcon
              name="tabler:map"
              class="size-6"
            />
          </div>
          <div>
            <h3 class="font-medium text-white">地图服务</h3>
            <p class="text-sm text-neutral-400 mt-1">
              位置可视化、照片拍摄地标记
            </p>
          </div>
        </div>
      </div>
    </div>

    <template #actions>
      <div class="w-full flex justify-between items-center">
        <p class="text-xs text-neutral-500 font-medium">
          ChronoFrame 不会收集您的任何数据。
        </p>
        <WizardButton
          to="/onboarding/admin"
          color="primary"
          size="lg"
          trailing-icon="tabler:arrow-right"
        >
          开始吧
        </WizardButton>
      </div>
    </template>
  </WizardStep>
</template>
