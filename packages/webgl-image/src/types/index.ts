export interface WebGLImageViewerProps {
  /** Image src */
  src: string
  /** CSS class name */
  class?: string
  /** Component width */
  width?: number
  /** Component height */
  height?: number
  /** Initial scale */
  initialScale?: number
  /** Minimum scale */
  minScale?: number
  /** Maximum scale */
  maxScale?: number
  /** Center on init */
  centerOnInit?: boolean
  /** Debug mode */
  debug?: boolean
  /** Limit to bounds */
  limitToBounds?: boolean
  /** Smooth processing */
  smooth?: boolean
  /** Wheel configuration */
  wheel?: {
    step: number
    wheelDisabled?: boolean
    touchPadDisabled?: boolean
  }
  /** Pinch to zoom configuration */
  pinch?: {
    step: number
    disabled?: boolean
  }
  /** Double click configuration */
  doubleClick?: {
    step: number
    disabled?: boolean
    mode: 'toggle' | 'zoom'
    animationTime: number
  }
  /** Panning configuration */
  panning?: {
    disabled?: boolean
    velocityDisabled?: boolean
  }
  /** Alignment animation configuration */
  alignmentAnimation?: {
    duration: number
    easing: (t: number) => number
  }
  /** Velocity animation configuration */
  velocityAnimation?: {
    duration: number
    easing: (t: number) => number
  }
  /** Tile rendering configuration */
  tile?: {
    /** Enable tile rendering */
    enabled?: boolean
    /** Tile size in pixels */
    size?: number
  }
}

export interface WebGLImageViewerEmits {
  zoomChange: [originalScale: number, relativeScale: number]
  imageCopied: []
  loadingStateChange: [
    isLoading: boolean,
    state?: LoadingState,
    quality?: 'high' | 'medium' | 'low' | 'unknown',
  ]
}

export interface WebGLImageViewerRef {
  zoomIn: (animate?: boolean) => void
  zoomOut: (animate?: boolean) => void
  resetView: () => void
  getScale: () => number
  getRelativeScale: () => number
  copyToClipboard: () => Promise<void>
}

export interface Point {
  x: number
  y: number
}

export interface Transform {
  scale: number
  translateX: number
  translateY: number
}

export interface Animation {
  startTime: number
  duration: number
  startTransform: Transform
  targetTransform: Transform
  easing: (t: number) => number
}

export interface Bounds {
  left: number
  top: number
  right: number
  bottom: number
}

export interface DebugInfo {
  scale: number
  relativeScale: number
  translateX: number
  translateY: number
  canvasWidth: number
  canvasHeight: number
  imageWidth: number
  imageHeight: number
  devicePixelRatio: number
  maxTextureSize: number
  isLoading: boolean
  loadingState: LoadingState
  currentQuality: 'high' | 'medium' | 'low' | 'unknown'
  imageSrc: string
}

export interface TouchState {
  touches: Touch[]
  lastDistance: number
  lastCenter: Point
}

export enum LoadingState {
  IDLE = 'idle',
  IMAGE_LOADING = 'image-loading',
  TEXTURE_LOADING = 'texture-loading',
  TILE_LOADING = 'tile-loading',
  COMPLETE = 'complete',
  ERROR = 'error',
}

export interface EngineConfig {
  minScale: number
  maxScale: number
  wheelStep: number
  pinchStep: number
  doubleClickStep: number
  doubleClickMode: 'toggle' | 'zoom'
  animationTime: number
  wheelDisabled: boolean
  touchPadDisabled: boolean
  pinchDisabled: boolean
  doubleClickDisabled: boolean
  panningDisabled: boolean
  velocityDisabled: boolean
  centerOnInit: boolean
  debug: boolean
  limitToBounds?: boolean
  smooth?: boolean
  tileEnabled: boolean
  tileSize: number
  alignmentAnimation?: {
    duration: number
    easing: (t: number) => number
  }
  velocityAnimation?: {
    duration: number
    easing: (t: number) => number
  }
  onZoomChange?: (originalScale: number, relativeScale: number) => void
  onImageCopied?: () => void
  onLoadingStateChange?: (
    isLoading: boolean,
    state?: LoadingState,
    quality?: 'high' | 'medium' | 'low' | 'unknown',
  ) => void
  onTransformChange?: (transform: Transform) => void
}
