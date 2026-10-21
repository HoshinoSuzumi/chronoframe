<script setup lang="ts">
import { motion } from 'motion-v'

interface Props {
  iconName: string
  triggerCount: number
}

const props = defineProps<Props>()

// 生成礼花粒子的配置
interface Particle {
  id: number
  angle: number
  distance: number
  delay: number
  duration: number
  rotation: number
  scale: number
}

const particles = computed<Particle[]>(() => {
  if (props.triggerCount === 0) return []

  const count = 18 // 礼花数量
  const result: Particle[] = []

  for (let i = 0; i < count; i++) {
    const angle = (360 / count) * i
    const distance = 80 + Math.random() * 40 // 随机距离 80-120px
    const delay = Math.random() * 0.15 // 随机延迟，增加到 0.15
    const duration = 1.2 + Math.random() * 0.4 // 随机持续时间，增加到 1.2-1.6 秒
    const rotation = Math.random() * 360 - 180 // 减少旋转幅度到 -180~180 度
    const scale = 0.7 + Math.random() * 0.3 // 随机缩放 0.7-1.0

    result.push({
      id: props.triggerCount * 100 + i,
      angle,
      distance,
      delay,
      duration,
      rotation,
      scale,
    })
  }

  return result
})

// 计算粒子的最终位置
const getParticlePosition = (angle: number, distance: number) => {
  const radian = (angle * Math.PI) / 180
  return {
    x: Math.cos(radian) * distance,
    y: Math.sin(radian) * distance,
  }
}
</script>

<template>
  <div
    class="absolute inset-0 pointer-events-none overflow-visible flex items-center justify-center z-9999"
  >
    <motion.div
      v-for="particle in particles"
      :key="particle.id"
      :initial="{
        x: 0,
        y: 0,
        scale: 0,
        opacity: 1,
        rotate: 0,
      }"
      :animate="{
        x: getParticlePosition(particle.angle, particle.distance).x,
        y: getParticlePosition(particle.angle, particle.distance).y,
        scale: [0, particle.scale * 1.1, particle.scale, 0],
        opacity: [0, 1, 1, 0],
        rotate: particle.rotation,
        transition: {
          duration: particle.duration,
          delay: particle.delay,
          ease: [0.25, 0.46, 0.45, 0.94],
        },
      }"
      class="absolute z-9999"
      style="transform-origin: center"
    >
      <Icon
        :name="iconName"
        class="text-[24px]"
        mode="svg"
      />
    </motion.div>
  </div>
</template>
