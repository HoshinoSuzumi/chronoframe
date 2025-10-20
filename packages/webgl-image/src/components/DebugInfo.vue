<script setup lang="ts">
import type { DebugInfo, LoadingState } from '../types'

interface DebugInfoProps {
  debugInfo: DebugInfo
}

defineProps<DebugInfoProps>()

// 工具函数
const getLoadingStateText = (state: LoadingState): string => {
  const stateMap = {
    idle: '空闲',
    'image-loading': '图片加载中',
    'texture-loading': '纹理加载中',
    'tile-loading': '瓦片加载中',
    complete: '加载完成',
    error: '加载错误',
  }
  return stateMap[state as keyof typeof stateMap] || state
}

const getQualityText = (
  quality: 'high' | 'medium' | 'low' | 'unknown',
): string => {
  const qualityMap = {
    high: '高',
    medium: '中',
    low: '低',
    unknown: '未知',
  }
  return qualityMap[quality] || quality
}

const getShortImageSrc = (src: string): string => {
  if (src.length <= 30) return src
  return src.slice(0, 27) + '...'
}
</script>

<template>
  <div class="webgl-debug-info">
    <div class="debug-section">
      <h4>缩放信息</h4>
      <div>缩放比例: {{ debugInfo.scale.toFixed(3) }}</div>
      <div>相对比例: {{ debugInfo.relativeScale.toFixed(3) }}</div>
    </div>

    <div class="debug-section">
      <h4>位置信息</h4>
      <div>X轴平移: {{ debugInfo.translateX.toFixed(2) }}</div>
      <div>Y轴平移: {{ debugInfo.translateY.toFixed(2) }}</div>
    </div>

    <div class="debug-section">
      <h4>Canvas信息</h4>
      <div>宽度: {{ debugInfo.canvasWidth }}</div>
      <div>高度: {{ debugInfo.canvasHeight }}</div>
      <div>设备像素比: {{ debugInfo.devicePixelRatio }}</div>
    </div>

    <div class="debug-section">
      <h4>图像信息</h4>
      <div>原始宽度: {{ debugInfo.imageWidth }}</div>
      <div>原始高度: {{ debugInfo.imageHeight }}</div>
    </div>

    <div class="debug-section">
      <h4>瓦片信息</h4>
      <div>启用瓦片: {{ debugInfo.tileEnabled ? '是' : '否' }}</div>
      <div>使用瓦片渲染: {{ debugInfo.useTiles ? '是' : '否' }}</div>
      <div>总瓦片数: {{ debugInfo.totalTiles }}</div>
      <div>可见瓦片数: {{ debugInfo.visibleTiles }}</div>
      <div>配置瓦片尺寸: {{ debugInfo.tileSize }}</div>
    </div>

    <div class="debug-section">
      <h4>WebGL信息</h4>
      <div>最大纹理尺寸: {{ debugInfo.maxTextureSize }}</div>
    </div>

    <div class="debug-section">
      <h4>加载状态</h4>
      <div>正在加载: {{ debugInfo.isLoading ? '是' : '否' }}</div>
      <div>加载状态: {{ getLoadingStateText(debugInfo.loadingState) }}</div>
      <div>当前质量: {{ getQualityText(debugInfo.currentQuality) }}</div>
      <div
        v-if="debugInfo.imageSrc"
        class="image-src"
      >
        图片源: {{ getShortImageSrc(debugInfo.imageSrc) }}
      </div>
    </div>
  </div>
</template>

<style scoped>
.webgl-debug-info {
  position: absolute;
  top: 10px;
  left: 10px;
  background: rgba(0, 0, 0, 0.8);
  color: white;
  padding: 12px;
  border-radius: 6px;
  font-family: 'Courier New', monospace;
  font-size: 12px;
  line-height: 1.4;
  z-index: 1000;
  max-width: 250px;
  pointer-events: none;
}

.debug-section {
  margin-bottom: 12px;
}

.debug-section:last-child {
  margin-bottom: 0;
}

.debug-section h4 {
  margin: 0 0 6px 0;
  font-size: 13px;
  font-weight: bold;
  color: #00ff88;
}

.debug-section div {
  margin: 2px 0;
  color: #e0e0e0;
}

.image-src {
  word-break: break-all;
  font-size: 10px !important;
  opacity: 0.8;
}
</style>
