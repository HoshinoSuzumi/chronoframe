<script setup lang="ts">
import type { DebugInfo, DebugInfoLabels } from '../types'
import { DEFAULT_DEBUG_LABELS } from '../debug-labels'

interface DebugInfoProps {
  debugInfo: DebugInfo
  labels?: DebugInfoLabels
}

withDefaults(defineProps<DebugInfoProps>(), {
  labels: () => DEFAULT_DEBUG_LABELS,
})

const getShortImageSrc = (src: string): string => {
  if (src.length <= 30) return src
  return src.slice(0, 27) + '...'
}
</script>

<template>
  <div class="webgl-debug-info">
    <div class="debug-section">
      <h4>{{ labels.zoomInfo }}</h4>
      <div>{{ labels.scale }}: {{ debugInfo.scale.toFixed(3) }}</div>
      <div>
        {{ labels.relativeScale }}: {{ debugInfo.relativeScale.toFixed(3) }}
      </div>
    </div>

    <div class="debug-section">
      <h4>{{ labels.positionInfo }}</h4>
      <div>{{ labels.translateX }}: {{ debugInfo.translateX.toFixed(2) }}</div>
      <div>{{ labels.translateY }}: {{ debugInfo.translateY.toFixed(2) }}</div>
    </div>

    <div class="debug-section">
      <h4>{{ labels.canvasInfo }}</h4>
      <div>{{ labels.width }}: {{ debugInfo.canvasWidth }}</div>
      <div>{{ labels.height }}: {{ debugInfo.canvasHeight }}</div>
      <div>{{ labels.devicePixelRatio }}: {{ debugInfo.devicePixelRatio }}</div>
    </div>

    <div class="debug-section">
      <h4>{{ labels.imageInfo }}</h4>
      <div>{{ labels.originalWidth }}: {{ debugInfo.imageWidth }}</div>
      <div>{{ labels.originalHeight }}: {{ debugInfo.imageHeight }}</div>
    </div>

    <div class="debug-section">
      <h4>{{ labels.tileInfo }}</h4>
      <div>
        {{ labels.tileEnabled }}:
        {{ debugInfo.tileEnabled ? labels.yes : labels.no }}
      </div>
      <div>
        {{ labels.useTiles }}: {{ debugInfo.useTiles ? labels.yes : labels.no }}
      </div>
      <div>{{ labels.totalTiles }}: {{ debugInfo.totalTiles }}</div>
      <div>{{ labels.visibleTiles }}: {{ debugInfo.visibleTiles }}</div>
      <div>{{ labels.tileSize }}: {{ debugInfo.tileSize }}</div>
    </div>

    <div class="debug-section">
      <h4>{{ labels.webglInfo }}</h4>
      <div>{{ labels.maxTextureSize }}: {{ debugInfo.maxTextureSize }}</div>
    </div>

    <div class="debug-section">
      <h4>{{ labels.loadingInfo }}</h4>
      <div>
        {{ labels.isLoading }}:
        {{ debugInfo.isLoading ? labels.yes : labels.no }}
      </div>
      <div>
        {{ labels.loadingState }}:
        {{
          labels.loadingStates[debugInfo.loadingState] || debugInfo.loadingState
        }}
      </div>
      <div>
        {{ labels.currentQuality }}:
        {{
          labels.qualities[debugInfo.currentQuality] || debugInfo.currentQuality
        }}
      </div>
      <div
        v-if="debugInfo.imageSrc"
        class="image-src"
      >
        {{ labels.imageSrc }}: {{ getShortImageSrc(debugInfo.imageSrc) }}
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
