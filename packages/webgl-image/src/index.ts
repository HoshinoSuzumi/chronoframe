// 主要组件导出
export { default as WebGLImageViewer } from './components/WebGLImageViewer.vue'
export { default as DebugInfoComponent } from './components/DebugInfo.vue'

// 引擎类导出
export { WebGLImageViewerEngine } from './core/WebGLImageViewerEngine'

// 类型导出
export type {
  WebGLImageViewerProps,
  WebGLImageViewerEmits,
  WebGLImageViewerRef,
  Point,
  Transform,
  Animation,
  Bounds,
  DebugInfo,
  DebugInfoLabels,
  TouchState,
  EngineConfig,
} from './types'

export { LoadingState } from './types'

// 常量导出
export {
  DEFAULT_CONFIG,
  RENDER_CONFIG,
  EASING,
  EVENT_CONFIG,
  SHADER_NAMES,
} from './constants'

// 工具函数导出
export {
  clamp,
  isMobile,
  isTouchDevice,
  getDevicePixelRatio,
  getDistance,
  getCenter,
  getTouchPoints,
  debounce,
  throttle,
  createTransformMatrix,
  checkWebGLSupport,
  getMaxTextureSize,
  loadImage,
} from './core/utils'

// 着色器相关导出
export {
  VERTEX_SHADER_SOURCE,
  FRAGMENT_SHADER_SOURCE,
  createShader,
  createShaderProgram,
  createProgram,
} from './shaders'
