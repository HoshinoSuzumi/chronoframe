export const DEFAULT_CONFIG = {
  minScale: 0.1,
  maxScale: 10,
  wheelStep: 0.1,
  pinchStep: 0.5,
  doubleClickStep: 2,
  doubleClickMode: 'toggle' as const,
  animationTime: 200,
  wheelDisabled: false,
  touchPadDisabled: false,
  pinchDisabled: false,
  doubleClickDisabled: false,
  panningDisabled: false,
  velocityDisabled: true,
  centerOnInit: true,
  debug: false,
  limitToBounds: true,
  smooth: true,
  tileEnabled: true,
  tileSize: 1024,
  alignmentAnimation: {
    duration: 300,
    easing: (t: number) => 1 - Math.pow(1 - t, 4), // easeOutQuart
  },
  velocityAnimation: {
    duration: 400,
    easing: (t: number) => 1 - Math.pow(1 - t, 3), // easeOutCubic
  },
}

export const RENDER_CONFIG = {
  /** 渲染节流间隔 (60fps) */
  THROTTLE_MS: 16,
  /** 动画结束阈值 */
  ANIMATION_THRESHOLD: 0.001,
  /** 最大纹理尺寸回退值 */
  MAX_TEXTURE_SIZE_FALLBACK: 4096,
}

export const EASING = {
  /** 四次方缓出函数 */
  easeOutQuart: (t: number): number => 1 - Math.pow(1 - t, 4),
}

export const EVENT_CONFIG = {
  /** 双击检测时间间隔 */
  DOUBLE_CLICK_DELAY: 300,
  /** 触摸结束后的延迟 */
  TOUCH_END_DELAY: 100,
}

export const SHADER_NAMES = {
  VERTEX: 'vertex',
  FRAGMENT: 'fragment',
} as const
