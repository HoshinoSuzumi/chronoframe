import type {
  EngineConfig,
  Transform,
  Animation,
  DebugInfo,
  Point,
  TouchState,
} from '../types'
import { LoadingState } from '../types'
import {
  DEFAULT_CONFIG,
  RENDER_CONFIG,
  EASING,
  EVENT_CONFIG,
} from '../constants'
import {
  clamp,
  getDistance,
  getCenter,
  getTouchPoints,
  throttle,
  createTransformMatrix,
  getMaxTextureSize,
} from './utils'
import { createProgram } from '../shaders'
import ImageDecoderWorkerRaw from '../workers/image-decoder.worker?raw'

interface Tile {
  x: number
  y: number
  width: number
  height: number
  texture: WebGLTexture | null
}

const TILE_DEBUG_BORDER_PX = 2.4
const TILE_DEBUG_BORDER_COLOR: [number, number, number, number] = [
  0.4, 0.7, 0.9, 0.25,
]

export class WebGLImageViewerEngine {
  private canvas: HTMLCanvasElement
  private gl: WebGLRenderingContext
  private config: EngineConfig
  private image: HTMLImageElement | HTMLCanvasElement | ImageBitmap | null =
    null
  private texture: WebGLTexture | null = null
  private program: WebGLProgram | null = null
  private tiles: Tile[] = []
  private useTiles = false

  // Web Workers
  private worker: Worker | null = null
  private imageLoadingResolve: (() => void) | null = null
  private imageLoadingReject: ((error: Error) => void) | null = null

  // 变换状态
  private transform: Transform = { scale: 1, translateX: 0, translateY: 0 }
  private initialScale = 1

  // 动画状态
  private animation: Animation | null = null
  private animationId: number | null = null

  // 交互状态
  private isDragging = false
  private lastMousePos: Point | null = null
  private touchState: TouchState | null = null
  private lastClickTime = 0
  private lastTouchTime = 0
  private lastTouchPosition: Point | null = null
  private hasMoved = false

  // WebGL 对象
  private positionBuffer: WebGLBuffer | null = null
  private texCoordBuffer: WebGLBuffer | null = null
  private positionLocation = -1
  private texCoordLocation = -1
  private matrixLocation: WebGLUniformLocation | null = null
  private resolutionLocation: WebGLUniformLocation | null = null
  private imageLocation: WebGLUniformLocation | null = null
  private tileDebugLocation: WebGLUniformLocation | null = null
  private tileBorderColorLocation: WebGLUniformLocation | null = null
  private tileBorderWidthLocation: WebGLUniformLocation | null = null

  // 事件监听器
  private throttledRender: () => void
  private resizeObserver: ResizeObserver | null = null
  private resizeAnimationFrameId: number | null = null

  // 绑定的事件处理器（用于正确添加/移除全局事件监听器）
  private boundHandleMouseDown: (event: MouseEvent) => void
  private boundHandleMouseUp: () => void
  private boundHandleMouseMove: (event: MouseEvent) => void
  private boundHandleMouseLeave: () => void
  private boundHandleWheel: (event: WheelEvent) => void
  private boundHandleClick: (event: MouseEvent) => void
  private boundHandleTouchStart: (event: TouchEvent) => void
  private boundHandleTouchMove: (event: TouchEvent) => void
  private boundHandleTouchEnd: (event: TouchEvent) => void
  private boundHandleContextLost: (event: Event) => void
  private boundHandleContextRestored: () => void
  private boundHandleContextMenu: (event: MouseEvent) => void

  // 回调函数
  private onZoomChange?: (originalScale: number, relativeScale: number) => void
  private onImageCopied?: () => void
  private onLoadingStateChange?: (
    isLoading: boolean,
    state?: LoadingState,
    quality?: 'high' | 'medium' | 'low' | 'unknown',
  ) => void
  private onTransformChange?: (transform: Transform) => void

  // 质量管理
  private currentQuality: 'high' | 'medium' | 'low' | 'unknown' = 'unknown'
  private isLoadingTexture = false
  private currentLoadingState: LoadingState = LoadingState.IDLE
  private lastRequestedSrc: string | null = null

  constructor(canvas: HTMLCanvasElement, config: Partial<EngineConfig> = {}) {
    this.canvas = canvas
    this.config = { ...DEFAULT_CONFIG, ...config }

    // 初始化 WebGL 上下文
    const gl = canvas.getContext('webgl', {
      alpha: true,
      antialias: true,
      depth: false,
      stencil: false,
      preserveDrawingBuffer: false,
    })

    if (!gl) {
      throw new Error('WebGL not supported')
    }

    this.gl = gl
    this.throttledRender = throttle(
      () => this.render(),
      RENDER_CONFIG.THROTTLE_MS,
    )

    // 绑定事件处理器
    this.boundHandleMouseDown = this.handleMouseDown.bind(this)
    this.boundHandleMouseUp = this.handleMouseUp.bind(this)
    this.boundHandleMouseMove = this.handleMouseMove.bind(this)
    this.boundHandleMouseLeave = this.handleMouseLeave.bind(this)
    this.boundHandleWheel = this.handleWheel.bind(this)
    this.boundHandleClick = this.handleClick.bind(this)
    this.boundHandleTouchStart = this.handleTouchStart.bind(this)
    this.boundHandleTouchMove = this.handleTouchMove.bind(this)
    this.boundHandleTouchEnd = this.handleTouchEnd.bind(this)
    this.boundHandleContextLost = this.handleContextLost.bind(this)
    this.boundHandleContextRestored = this.handleContextRestored.bind(this)
    this.boundHandleContextMenu = (event: MouseEvent) => event.preventDefault()

    this.init()
  }

  private init(): void {
    this.setupWebGL()
    this.setupWorker()
    this.setupEventListeners()
    this.setupResizeObserver()
    this.resize()
  }

  private setupWebGL(): void {
    const { gl } = this

    // 创建着色器程序
    this.program = createProgram(gl)
    if (!this.program) {
      throw new Error('Failed to create shader program')
    }

    gl.useProgram(this.program)

    // 获取属性和统一变量位置
    this.positionLocation = gl.getAttribLocation(this.program, 'a_position')
    this.texCoordLocation = gl.getAttribLocation(this.program, 'a_texCoord')
    this.matrixLocation = gl.getUniformLocation(this.program, 'u_matrix')
    this.resolutionLocation = gl.getUniformLocation(
      this.program,
      'u_resolution',
    )
    this.imageLocation = gl.getUniformLocation(this.program, 'u_image')
    this.tileDebugLocation = gl.getUniformLocation(this.program, 'u_debugTiles')
    this.tileBorderColorLocation = gl.getUniformLocation(
      this.program,
      'u_tileBorderColor',
    )
    this.tileBorderWidthLocation = gl.getUniformLocation(
      this.program,
      'u_tileBorderWidth',
    )

    // 创建缓冲区
    this.createBuffers()

    // 设置 WebGL 状态
    gl.enable(gl.BLEND)
    gl.blendFunc(gl.SRC_ALPHA, gl.ONE_MINUS_SRC_ALPHA)
    gl.clearColor(0, 0, 0, 0)
  }

  private setupWorker() {
    if (typeof Worker === 'undefined') {
      console.warn('Web Workers not supported, falling back to main thread')
      return
    }

    this.worker = new Worker(
      URL.createObjectURL(new Blob([ImageDecoderWorkerRaw])),
      {
        name: 'image-decoder-worker',
      },
    )

    this.worker.onmessage = (event: MessageEvent) => {
      const { type, payload } = event.data
      switch (type) {
        case 'loaded':
          void this.handleWorkerImageLoaded(payload)
          break
        case 'load-error':
          void this.handleWorkerImageLoadError(payload)
          break
      }
    }

    this.worker.onerror = (error) => {
      console.error('Worker error:', error)
      void this.handleWorkerImageLoadError(error)
    }
  }

  private async handleWorkerImageLoaded(payload: any) {
    const { imageBitmap } = payload

    try {
      const rendered = this.applyDecodedImage(imageBitmap)
      if (!rendered) {
        await this.renderWithMainThreadFallback(
          new Error('Failed to render worker ImageBitmap'),
        )
      }

      this.resolvePendingImageLoad()
    } catch (err) {
      console.error('Failed to render worker image:', err)
      this.rejectPendingImageLoad(err)
    }
  }

  private async handleWorkerImageLoadError(error: any) {
    console.error('Image load error from worker:', error)

    try {
      await this.renderWithMainThreadFallback(error)
      this.resolvePendingImageLoad()
    } catch (fallbackError) {
      this.rejectPendingImageLoad(fallbackError)
    }
  }

  private applyDecodedImage(
    imageSource: HTMLCanvasElement | HTMLImageElement | ImageBitmap,
  ): boolean {
    const originalDimensions = this.getSourceDimensions(imageSource)
    if (!originalDimensions) {
      return false
    }

    this.image = imageSource

    const shouldUseTiles = this.shouldUseTiles(imageSource)
    let usingTiles = false

    if (shouldUseTiles) {
      this.emitLoadingStateChange(true, LoadingState.TILE_LOADING)
      usingTiles = this.createTiles(imageSource)
    }

    if (!usingTiles) {
      this.emitLoadingStateChange(true, LoadingState.TEXTURE_LOADING)
      const texture = this.createTexture(imageSource)
      if (!texture) {
        return false
      }
    } else {
      this.updatePositionBuffer()
    }

    this.useTiles = usingTiles

    if (this.config.centerOnInit) {
      this.centerImage()
    }

    const finalWidth = this.image?.width ?? originalDimensions.width
    const finalHeight = this.image?.height ?? originalDimensions.height
    const widthRatio = finalWidth / originalDimensions.width
    const heightRatio = finalHeight / originalDimensions.height
    const minRatio = Math.min(widthRatio, heightRatio)

    if (minRatio < 0.6) {
      this.currentQuality = 'low'
    } else if (minRatio < 0.9) {
      this.currentQuality = 'medium'
    } else {
      this.currentQuality = 'high'
    }

    this.emitLoadingStateChange(false, LoadingState.COMPLETE, this.currentQuality)
    this.render()

    return true
  }

  private async decodeImageOnMainThread(src: string): Promise<HTMLImageElement> {
    return await new Promise((resolve, reject) => {
      const image = new Image()
      image.crossOrigin = 'anonymous'
      image.decoding = 'async'
      image.onload = () => resolve(image)
      image.onerror = () => {
        reject(new Error('Failed to decode image on main thread'))
      }
      image.src = src
    })
  }

  private async renderWithMainThreadFallback(reason: unknown): Promise<void> {
    const src = this.lastRequestedSrc
    if (!src) {
      if (reason instanceof Error) {
        throw reason
      }
      throw new Error('No image source available for fallback decode')
    }

    console.warn('Falling back to main-thread decode/render.', reason)
    this.emitLoadingStateChange(true, LoadingState.IMAGE_LOADING)

    const image = await this.decodeImageOnMainThread(src)
    const rendered = this.applyDecodedImage(image)

    if (!rendered) {
      throw new Error('Main-thread decode succeeded but rendering still failed')
    }
  }

  private resolvePendingImageLoad(): void {
    const resolve = this.imageLoadingResolve
    this.imageLoadingResolve = null
    this.imageLoadingReject = null
    resolve?.()
  }

  private rejectPendingImageLoad(error: unknown): void {
    const reject = this.imageLoadingReject
    this.imageLoadingResolve = null
    this.imageLoadingReject = null

    const normalizedError =
      error instanceof Error
        ? error
        : new Error(typeof error === 'string' ? error : 'Unknown image load error')

    this.emitLoadingStateChange(false, LoadingState.ERROR)
    reject?.(normalizedError)
  }

  private createBuffers(): void {
    const { gl } = this

    // 位置缓冲区 (矩形)
    this.positionBuffer = gl.createBuffer()
    gl.bindBuffer(gl.ARRAY_BUFFER, this.positionBuffer)

    // 纹理坐标缓冲区
    this.texCoordBuffer = gl.createBuffer()
    gl.bindBuffer(gl.ARRAY_BUFFER, this.texCoordBuffer)
    const texCoords = new Float32Array([0, 0, 1, 0, 0, 1, 0, 1, 1, 0, 1, 1])
    gl.bufferData(gl.ARRAY_BUFFER, texCoords, gl.STATIC_DRAW)
  }

  private updatePositionBuffer(): void {
    if (!this.image || !this.positionBuffer) return

    const { gl } = this
    const { width, height } = this.image

    gl.bindBuffer(gl.ARRAY_BUFFER, this.positionBuffer)
    const positions = new Float32Array([
      0,
      0,
      width,
      0,
      0,
      height,
      0,
      height,
      width,
      0,
      width,
      height,
    ])
    gl.bufferData(gl.ARRAY_BUFFER, positions, gl.STATIC_DRAW)
  }

  private setupEventListeners(): void {
    // 鼠标事件
    this.canvas.addEventListener('mousedown', this.boundHandleMouseDown)
    this.canvas.addEventListener('mouseleave', this.boundHandleMouseLeave)
    this.canvas.addEventListener('wheel', this.boundHandleWheel, {
      passive: false,
    })
    this.canvas.addEventListener('click', this.boundHandleClick)

    // 触摸事件
    this.canvas.addEventListener('touchstart', this.boundHandleTouchStart, {
      passive: false,
    })
    this.canvas.addEventListener('touchmove', this.boundHandleTouchMove, {
      passive: false,
    })
    this.canvas.addEventListener('touchend', this.boundHandleTouchEnd, {
      passive: false,
    })

    // WebGL 上下文丢失事件
    this.canvas.addEventListener(
      'webglcontextlost',
      this.boundHandleContextLost,
      false,
    )
    this.canvas.addEventListener(
      'webglcontextrestored',
      this.boundHandleContextRestored,
      false,
    )

    // 防止上下文菜单
    this.canvas.addEventListener('contextmenu', this.boundHandleContextMenu)
  }

  private setupResizeObserver(): void {
    this.resizeObserver = new ResizeObserver(() => {
      if (this.resizeAnimationFrameId) {
        cancelAnimationFrame(this.resizeAnimationFrameId)
      }
      this.resizeAnimationFrameId = requestAnimationFrame(() => {
        this.resizeAnimationFrameId = null
        this.resize()
      })
    })
    this.resizeObserver.observe(this.canvas)
  }

  private emitLoadingStateChange(
    isLoading: boolean,
    state?: LoadingState,
    quality?: 'high' | 'medium' | 'low' | 'unknown',
  ): void {
    this.isLoadingTexture = isLoading
    if (state) {
      this.currentLoadingState = state
    }
    this.onLoadingStateChange?.(isLoading, state, quality)
  }

  public async loadImage(src: string): Promise<void> {
    console.log('Post load image:', src)
    this.lastRequestedSrc = src
    this.emitLoadingStateChange(true, LoadingState.IMAGE_LOADING)

    return new Promise((resolve, reject) => {
      this.imageLoadingResolve = resolve
      this.imageLoadingReject = reject
      if (this.worker) {
        try {
          const absolute = new URL(
            src,
            self.location?.origin || 'http://localhost',
          )
          this.worker.postMessage({
            type: 'load',
            payload: { src: absolute.toString() },
          })
        } catch (error) {
          console.warn('Worker postMessage failed, using main-thread fallback.', error)
          void this.renderWithMainThreadFallback(error)
            .then(() => this.resolvePendingImageLoad())
            .catch((fallbackError) => this.rejectPendingImageLoad(fallbackError))
        }
      } else {
        void this.renderWithMainThreadFallback(new Error('No worker available'))
          .then(() => this.resolvePendingImageLoad())
          .catch((error) => this.rejectPendingImageLoad(error))
      }
    })
  }

  private createTexture(
    imageSource: HTMLCanvasElement | HTMLImageElement | ImageBitmap,
  ): WebGLTexture | null {
    const { gl } = this

    // 清理瓦片数据
    this.cleanupTiles()
    this.useTiles = false

    // 清理旧纹理
    if (this.texture) {
      gl.deleteTexture(this.texture)
    }

    const dimensions = this.getSourceDimensions(imageSource)
    if (!dimensions) {
      return null
    }

    // 获取最大纹理尺寸并判断是否需要缩放
    const maxTextureSize = getMaxTextureSize(gl)
    const maxTexturePixels = this.getTextureUploadPixelBudget(maxTextureSize)
    const sourcePixels = dimensions.width * dimensions.height

    let targetWidth = dimensions.width
    let targetHeight = dimensions.height

    if (
      sourcePixels > maxTexturePixels ||
      dimensions.width > maxTextureSize ||
      dimensions.height > maxTextureSize
    ) {
      const pixelScale = Math.min(1, Math.sqrt(maxTexturePixels / sourcePixels))
      const sizeScale = Math.min(
        pixelScale,
        maxTextureSize / dimensions.width,
        maxTextureSize / dimensions.height,
      )
      targetWidth = Math.max(1, Math.floor(dimensions.width * sizeScale))
      targetHeight = Math.max(1, Math.floor(dimensions.height * sizeScale))
    }

    let finalSource: HTMLCanvasElement | HTMLImageElement | ImageBitmap =
      imageSource
    if (
      targetWidth !== dimensions.width ||
      targetHeight !== dimensions.height
    ) {
      const resizedSource = this.resizeImageSource(
        imageSource,
        targetWidth,
        targetHeight,
      )
      if (resizedSource) {
        finalSource = resizedSource
      }
    }

    let uploadSuccess = false
    let attempt = 0

    while (attempt < RENDER_CONFIG.TEXTURE_RETRY_LIMIT) {
      this.texture = gl.createTexture()
      if (!this.texture) {
        break
      }

      gl.bindTexture(gl.TEXTURE_2D, this.texture)

      // 设置纹理参数
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE)
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE)
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR)
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR)

      let uploadError: unknown = null
      try {
        gl.texImage2D(
          gl.TEXTURE_2D,
          0,
          gl.RGBA,
          gl.RGBA,
          gl.UNSIGNED_BYTE,
          finalSource,
        )
      } catch (error) {
        uploadError = error
      }

      const glError = gl.getError()
      if (!uploadError && glError === gl.NO_ERROR) {
        uploadSuccess = true
        break
      }

      if (uploadError) {
        console.warn('Texture upload error, retrying with smaller source.', {
          attempt: attempt + 1,
          error: uploadError,
        })
      } else {
        console.warn('Texture upload failed, retrying with smaller source.', {
          attempt: attempt + 1,
          glError,
        })
      }

      if (this.texture) {
        gl.deleteTexture(this.texture)
        this.texture = null
      }

      const currentDimensions = this.getSourceDimensions(finalSource)
      if (!currentDimensions) {
        break
      }

      const retryWidth = Math.max(
        1,
        Math.floor(
          currentDimensions.width * RENDER_CONFIG.TEXTURE_RETRY_SCALE_FACTOR,
        ),
      )
      const retryHeight = Math.max(
        1,
        Math.floor(
          currentDimensions.height * RENDER_CONFIG.TEXTURE_RETRY_SCALE_FACTOR,
        ),
      )

      if (
        retryWidth >= currentDimensions.width &&
        retryHeight >= currentDimensions.height
      ) {
        break
      }

      const resizedSource = this.resizeImageSource(
        finalSource,
        retryWidth,
        retryHeight,
      )
      if (!resizedSource) {
        break
      }

      finalSource = resizedSource
      attempt += 1
    }

    gl.bindTexture(gl.TEXTURE_2D, null)

    if (!uploadSuccess || !this.texture) {
      this.texture = null
      return null
    }

    // 更新内部 image 引用为最终用于渲染的尺寸
    this.image = finalSource as any
    this.updatePositionBuffer()

    return this.texture
  }

  private getSourceDimensions(source: {
    width: number
    height: number
  }): { width: number; height: number } | null {
    const { width, height } = source
    if (!isFinite(width) || !isFinite(height) || width <= 0 || height <= 0) {
      return null
    }
    return { width, height }
  }

  private getTextureUploadPixelBudget(maxTextureSize: number): number {
    const maxTexturePixels = Math.max(1, maxTextureSize * maxTextureSize)
    return Math.min(RENDER_CONFIG.MAX_TEXTURE_UPLOAD_PIXELS, maxTexturePixels)
  }

  private resizeImageSource(
    source: CanvasImageSource,
    targetWidth: number,
    targetHeight: number,
  ): HTMLCanvasElement | null {
    const offscreen = document.createElement('canvas')
    offscreen.width = targetWidth
    offscreen.height = targetHeight
    const ctx = offscreen.getContext('2d')
    if (!ctx) {
      return null
    }

    ctx.imageSmoothingEnabled = true
    ctx.imageSmoothingQuality = 'high'
    ctx.clearRect(0, 0, targetWidth, targetHeight)
    ctx.drawImage(source, 0, 0, targetWidth, targetHeight)

    return offscreen
  }

  private cleanupTiles(): void {
    if (!this.tiles.length) return

    const { gl } = this
    for (const tile of this.tiles) {
      if (tile.texture) {
        gl.deleteTexture(tile.texture)
      }
    }

    this.tiles = []
  }

  private shouldUseTiles(
    source: { width: number; height: number } | null,
  ): boolean {
    if (!source) return false

    if (!this.config.tileEnabled) return false

    const sourcePixels = source.width * source.height
    if (sourcePixels > RENDER_CONFIG.MAX_TILE_TOTAL_PIXELS) {
      return false
    }

    const maxTextureSize = getMaxTextureSize(this.gl)
    if (source.width > maxTextureSize || source.height > maxTextureSize) {
      return true
    }

    return (
      source.width > this.config.tileSize ||
      source.height > this.config.tileSize
    )
  }

  private createTiles(
    imageSource: HTMLCanvasElement | HTMLImageElement | ImageBitmap,
  ): boolean {
    const { gl } = this

    // 清理旧资源
    if (this.texture) {
      gl.deleteTexture(this.texture)
      this.texture = null
    }
    this.cleanupTiles()

    const maxTextureSize = getMaxTextureSize(gl)
    const baseTileSize = Math.max(
      1,
      Math.min(this.config.tileSize, maxTextureSize),
    )

    const width =
      (imageSource as HTMLCanvasElement).width ??
      (imageSource as HTMLImageElement).width ??
      (imageSource as ImageBitmap).width
    const height =
      (imageSource as HTMLCanvasElement).height ??
      (imageSource as HTMLImageElement).height ??
      (imageSource as ImageBitmap).height

    if (!width || !height) {
      return false
    }

    if (width * height > RENDER_CONFIG.MAX_TILE_TOTAL_PIXELS) {
      return false
    }

    const columns = Math.ceil(width / baseTileSize)
    const rows = Math.ceil(height / baseTileSize)
    const offscreen = document.createElement('canvas')
    const tiles: Tile[] = []
    const disposeTiles = () => {
      for (const tile of tiles) {
        if (tile.texture) {
          gl.deleteTexture(tile.texture)
        }
      }
    }

    try {
      for (let row = 0; row < rows; row++) {
        for (let col = 0; col < columns; col++) {
          const startX = col * baseTileSize
          const startY = row * baseTileSize
          const tileWidth = Math.min(baseTileSize, width - startX)
          const tileHeight = Math.min(baseTileSize, height - startY)

          if (tileWidth <= 0 || tileHeight <= 0) continue

          offscreen.width = tileWidth
          offscreen.height = tileHeight
          const ctx = offscreen.getContext('2d')
          if (!ctx) {
            console.warn(
              'Failed to acquire 2D context for tile rendering, falling back to single texture.',
            )
            disposeTiles()
            this.cleanupTiles()
            return false
          }

          ctx.clearRect(0, 0, tileWidth, tileHeight)
          ctx.drawImage(
            imageSource as CanvasImageSource,
            startX,
            startY,
            tileWidth,
            tileHeight,
            0,
            0,
            tileWidth,
            tileHeight,
          )

          const texture = gl.createTexture()
          if (!texture) {
            console.warn(
              'Failed to create tile texture, falling back to single texture rendering.',
            )
            disposeTiles()
            this.cleanupTiles()
            return false
          }

          gl.bindTexture(gl.TEXTURE_2D, texture)
          gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE)
          gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE)
          gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR)
          gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR)
          gl.texImage2D(
            gl.TEXTURE_2D,
            0,
            gl.RGBA,
            gl.RGBA,
            gl.UNSIGNED_BYTE,
            offscreen,
          )

          tiles.push({
            x: startX,
            y: startY,
            width: tileWidth,
            height: tileHeight,
            texture,
          })
        }
      }
    } catch (error) {
      console.warn(
        'Failed to create tiles, falling back to single texture.',
        error,
      )
      disposeTiles()
      this.cleanupTiles()
      return false
    } finally {
      gl.bindTexture(gl.TEXTURE_2D, null)
    }

    this.tiles = tiles
    this.useTiles = this.tiles.length > 0

    return this.useTiles
  }

  private getVisibleTiles(): Tile[] {
    if (!this.useTiles || !this.tiles.length) {
      return []
    }

    const scale = this.transform.scale
    if (!isFinite(scale) || scale <= 0) {
      return this.tiles
    }

    const viewLeft = -this.transform.translateX / scale
    const viewTop = -this.transform.translateY / scale
    const viewRight = (this.canvas.width - this.transform.translateX) / scale
    const viewBottom = (this.canvas.height - this.transform.translateY) / scale

    return this.tiles.filter((tile) => {
      const tileRight = tile.x + tile.width
      const tileBottom = tile.y + tile.height
      return (
        tileRight >= viewLeft &&
        tile.x <= viewRight &&
        tileBottom >= viewTop &&
        tile.y <= viewBottom
      )
    })
  }

  public resize(): void {
    const rect = this.canvas.getBoundingClientRect()
    const dpr = window.devicePixelRatio || 1
    const prevCanvasWidth = this.canvas.width
    const prevCanvasHeight = this.canvas.height
    const nextCanvasWidth = Math.max(1, Math.round(rect.width * dpr))
    const nextCanvasHeight = Math.max(1, Math.round(rect.height * dpr))

    // 检查画布尺寸是否有效
    if (rect.width <= 0 || rect.height <= 0) {
      return
    }

    if (
      nextCanvasWidth === prevCanvasWidth &&
      nextCanvasHeight === prevCanvasHeight
    ) {
      return
    }

    this.canvas.width = nextCanvasWidth
    this.canvas.height = nextCanvasHeight

    this.gl.viewport(0, 0, this.canvas.width, this.canvas.height)

    if (this.image) {
      const prevScale = this.transform.scale
      const prevTranslateX = this.transform.translateX
      const prevTranslateY = this.transform.translateY
      const oldInitialScale = this.initialScale

      if (
        prevCanvasWidth > 0 &&
        prevCanvasHeight > 0 &&
        isFinite(prevScale) &&
        prevScale > 0
      ) {
        const viewportCenterImageX =
          (prevCanvasWidth / 2 - this.transform.translateX) / prevScale
        const viewportCenterImageY =
          (prevCanvasHeight / 2 - this.transform.translateY) / prevScale

        const newInitialScale = this.getFitScale()
        const relativeZoomLevel =
          oldInitialScale > 0 ? prevScale / oldInitialScale : 1
        const nextScale = this.clampScale(newInitialScale * relativeZoomLevel)

        this.initialScale = newInitialScale
        this.transform.scale = nextScale
        this.transform.translateX =
          this.canvas.width / 2 - viewportCenterImageX * nextScale
        this.transform.translateY =
          this.canvas.height / 2 - viewportCenterImageY * nextScale
      }

      this.constrainToBounds()

      if (prevScale !== this.transform.scale) {
        this.emitZoomChange()
      }

      if (
        prevScale !== this.transform.scale ||
        prevTranslateX !== this.transform.translateX ||
        prevTranslateY !== this.transform.translateY
      ) {
        this.emitTransformChange()
      }
    }

    // 只有在图像已加载时才渲染
    if (this.image && (this.texture || this.useTiles)) {
      this.throttledRender()
    }
  }

  private centerImage(): void {
    if (!this.image || this.image.width <= 0 || this.image.height <= 0) return

    // 避免除零错误
    if (this.canvas.width <= 0 || this.canvas.height <= 0) return

    // 设置初始缩放（这是相对缩放的基准）
    this.initialScale = this.getFitScale()

    // 基于相对缩放限制计算实际缩放值
    // 如果用户设置的相对缩放限制允许，我们使用初始缩放值
    // 否则使用限制后的值
    const actualScale = this.clampScale(this.initialScale)

    const scaledWidth = this.image.width * actualScale
    const scaledHeight = this.image.height * actualScale

    this.transform = {
      scale: actualScale,
      translateX: (this.canvas.width - scaledWidth) / 2,
      translateY: (this.canvas.height - scaledHeight) / 2,
    }

    this.emitZoomChange()
    this.emitTransformChange()
  }

  private constrainToBounds(): void {
    if (!this.config.limitToBounds || !this.image) return

    const scaledWidth = this.image.width * this.transform.scale
    const scaledHeight = this.image.height * this.transform.scale

    // 如果图像小于画布，居中显示
    if (scaledWidth <= this.canvas.width) {
      this.transform.translateX = (this.canvas.width - scaledWidth) / 2
    } else {
      // 限制水平边界
      const maxTranslateX = 0
      const minTranslateX = this.canvas.width - scaledWidth
      this.transform.translateX = clamp(
        this.transform.translateX,
        minTranslateX,
        maxTranslateX,
      )
    }

    if (scaledHeight <= this.canvas.height) {
      this.transform.translateY = (this.canvas.height - scaledHeight) / 2
    } else {
      // 限制垂直边界
      const maxTranslateY = 0
      const minTranslateY = this.canvas.height - scaledHeight
      this.transform.translateY = clamp(
        this.transform.translateY,
        minTranslateY,
        maxTranslateY,
      )
    }
  }

  /**
   * 获取基于相对缩放的绝对最小缩放值
   */
  private getAbsoluteMinScale(): number {
    return this.initialScale * this.config.minScale
  }

  /**
   * 获取基于相对缩放的绝对最大缩放值
   */
  private getAbsoluteMaxScale(): number {
    return this.initialScale * this.config.maxScale
  }

  /**
   * 基于相对缩放限制来约束绝对缩放值
   */
  private clampScale(scale: number): number {
    return clamp(scale, this.getAbsoluteMinScale(), this.getAbsoluteMaxScale())
  }

  private render(): void {
    if (!this.program) return
    if (!this.texture && !this.useTiles) return
    if (this.useTiles && !this.tiles.length) return

    const { gl } = this

    try {
      if (gl.isContextLost()) {
        console.warn('WebGL context is lost, skipping render')
        return
      }

      this.updateAnimation()

      gl.clear(gl.COLOR_BUFFER_BIT)
      gl.useProgram(this.program)

      gl.uniform2f(
        this.resolutionLocation,
        this.canvas.width,
        this.canvas.height,
      )
      gl.uniform1i(this.imageLocation, 0)

      const matrix = createTransformMatrix(
        this.transform.scale,
        this.transform.translateX,
        this.transform.translateY,
      )
      gl.uniformMatrix3fv(this.matrixLocation, false, matrix)

      if (!this.positionBuffer || !this.texCoordBuffer) {
        return
      }

      const showDebugBorder =
        !!this.config.debug && (!!this.texture || this.useTiles)

      if (this.tileDebugLocation) {
        gl.uniform1i(this.tileDebugLocation, showDebugBorder ? 1 : 0)
      }

      if (this.tileBorderColorLocation) {
        const [r, g, b, a] = TILE_DEBUG_BORDER_COLOR
        gl.uniform4f(this.tileBorderColorLocation, r, g, b, a)
      }

      if (!showDebugBorder && this.tileBorderWidthLocation) {
        gl.uniform2f(this.tileBorderWidthLocation, 0, 0)
      }

      const borderWidthLocation = this.tileBorderWidthLocation

      // 设置纹理坐标属性（瓦片和整体纹理共用）
      gl.bindBuffer(gl.ARRAY_BUFFER, this.texCoordBuffer)
      gl.enableVertexAttribArray(this.texCoordLocation)
      gl.vertexAttribPointer(this.texCoordLocation, 2, gl.FLOAT, false, 0, 0)

      // 设置位置属性缓冲
      gl.bindBuffer(gl.ARRAY_BUFFER, this.positionBuffer)
      gl.enableVertexAttribArray(this.positionLocation)
      gl.vertexAttribPointer(this.positionLocation, 2, gl.FLOAT, false, 0, 0)

      gl.activeTexture(gl.TEXTURE0)

      if (this.useTiles) {
        const visibleTiles = this.getVisibleTiles()
        for (const tile of visibleTiles) {
          if (!tile.texture) continue

          if (showDebugBorder && borderWidthLocation) {
            const tileWidth = Math.max(tile.width, 1)
            const tileHeight = Math.max(tile.height, 1)
            gl.uniform2f(
              borderWidthLocation,
              TILE_DEBUG_BORDER_PX / tileWidth,
              TILE_DEBUG_BORDER_PX / tileHeight,
            )
          }

          const positions = new Float32Array([
            tile.x,
            tile.y,
            tile.x + tile.width,
            tile.y,
            tile.x,
            tile.y + tile.height,
            tile.x,
            tile.y + tile.height,
            tile.x + tile.width,
            tile.y,
            tile.x + tile.width,
            tile.y + tile.height,
          ])

          gl.bindBuffer(gl.ARRAY_BUFFER, this.positionBuffer)
          gl.bufferData(gl.ARRAY_BUFFER, positions, gl.DYNAMIC_DRAW)
          gl.bindTexture(gl.TEXTURE_2D, tile.texture)
          gl.drawArrays(gl.TRIANGLES, 0, 6)
        }
      } else {
        if (showDebugBorder && borderWidthLocation && this.image) {
          const imageWidth = Math.max(this.image.width, 1)
          const imageHeight = Math.max(this.image.height, 1)
          gl.uniform2f(
            borderWidthLocation,
            TILE_DEBUG_BORDER_PX / imageWidth,
            TILE_DEBUG_BORDER_PX / imageHeight,
          )
        }

        gl.bindTexture(gl.TEXTURE_2D, this.texture)
        gl.drawArrays(gl.TRIANGLES, 0, 6)
      }

      const error = gl.getError()
      if (error !== gl.NO_ERROR) {
        console.error('WebGL rendering error:', error)
      }
    } catch (error) {
      console.error('Error during rendering:', error)
    }
  }

  private updateAnimation(): void {
    if (!this.animation) return

    const now = Date.now()
    const elapsed = now - this.animation.startTime
    const progress = Math.min(elapsed / this.animation.duration, 1)

    if (progress >= 1) {
      // 动画完成
      this.transform = { ...this.animation.targetTransform }
      this.animation = null
      if (this.animationId) {
        cancelAnimationFrame(this.animationId)
        this.animationId = null
      }
      this.emitZoomChange()
      this.emitTransformChange()
      return
    }

    // 计算当前变换
    const t = this.animation.easing(progress)
    const { startTransform, targetTransform } = this.animation

    this.transform = {
      scale:
        startTransform.scale +
        (targetTransform.scale - startTransform.scale) * t,
      translateX:
        startTransform.translateX +
        (targetTransform.translateX - startTransform.translateX) * t,
      translateY:
        startTransform.translateY +
        (targetTransform.translateY - startTransform.translateY) * t,
    }

    // 通知变换变化
    this.emitTransformChange()

    // 继续动画 - 直接请求下一帧，不使用节流
    this.animationId = requestAnimationFrame(() => this.render())
  }

  private animateTo(
    targetTransform: Transform,
    duration = this.config.animationTime,
  ): void {
    // 取消当前动画（如果有的话）
    if (this.animationId) {
      cancelAnimationFrame(this.animationId)
      this.animationId = null
    }

    this.animation = {
      startTime: Date.now(),
      duration,
      startTransform: { ...this.transform },
      targetTransform,
      easing: EASING.easeOutQuart,
    }

    // 启动动画
    this.render()
  }

  // 事件处理器
  private handleMouseDown(event: MouseEvent): void {
    if (this.config.panningDisabled) return

    this.isDragging = true
    this.lastMousePos = { x: event.clientX, y: event.clientY }
    this.canvas.style.cursor = 'grabbing'

    // 添加全局事件监听器以处理鼠标移出画布的情况
    document.addEventListener('mouseup', this.boundHandleMouseUp)
    document.addEventListener('mousemove', this.boundHandleMouseMove)

    event.preventDefault()
  }

  private handleMouseMove(event: MouseEvent): void {
    if (!this.isDragging || !this.lastMousePos || this.config.panningDisabled)
      return

    const dpr = window.devicePixelRatio || 1
    const deltaX = (event.clientX - this.lastMousePos.x) * dpr
    const deltaY = (event.clientY - this.lastMousePos.y) * dpr

    this.transform.translateX += deltaX
    this.transform.translateY += deltaY

    // 应用边界限制
    this.constrainToBounds()

    this.lastMousePos = { x: event.clientX, y: event.clientY }

    // 通知变换变化
    this.emitTransformChange()

    this.throttledRender()
    event.preventDefault()
  }

  private handleMouseUp(): void {
    this.isDragging = false
    this.lastMousePos = null
    this.canvas.style.cursor = 'grab'

    // 移除全局事件监听器
    document.removeEventListener('mouseup', this.boundHandleMouseUp)
    document.removeEventListener('mousemove', this.boundHandleMouseMove)
  }

  private handleMouseLeave(): void {
    // 当鼠标离开画布时，停止拖拽操作
    if (this.isDragging) {
      this.isDragging = false
      this.lastMousePos = null
      this.canvas.style.cursor = 'grab'

      // 移除全局事件监听器
      document.removeEventListener('mouseup', this.boundHandleMouseUp)
      document.removeEventListener('mousemove', this.boundHandleMouseMove)
    }
  }

  private handleWheel(event: WheelEvent): void {
    if (this.config.wheelDisabled) return

    event.preventDefault()

    const rect = this.canvas.getBoundingClientRect()
    const dpr = window.devicePixelRatio || 1
    const centerX = (event.clientX - rect.left) * dpr
    const centerY = (event.clientY - rect.top) * dpr

    const scaleFactor =
      event.deltaY < 0 ? 1 + this.config.wheelStep : 1 - this.config.wheelStep
    this.zoomAtPoint(centerX, centerY, scaleFactor)
  }

  private handleClick(event: MouseEvent): void {
    if (this.config.doubleClickDisabled) return

    const now = Date.now()
    if (now - this.lastClickTime < EVENT_CONFIG.DOUBLE_CLICK_DELAY) {
      // 双击
      const rect = this.canvas.getBoundingClientRect()
      const dpr = window.devicePixelRatio || 1
      const centerX = (event.clientX - rect.left) * dpr
      const centerY = (event.clientY - rect.top) * dpr

      if (this.config.doubleClickMode === 'toggle') {
        const isZoomedIn = this.transform.scale > this.initialScale * 1.1
        if (isZoomedIn) {
          this.resetView()
        } else {
          this.zoomAtPoint(centerX, centerY, this.config.doubleClickStep, true)
        }
      } else {
        this.zoomAtPoint(centerX, centerY, this.config.doubleClickStep, true)
      }
    }

    this.lastClickTime = now
  }

  private handleTouchStart(event: TouchEvent): void {
    event.preventDefault()

    const touches = getTouchPoints(event.touches)

    if (touches.length === 1 && touches[0]) {
      // 单指操作
      this.hasMoved = false // 重置移动标志

      if (!this.config.panningDisabled) {
        this.isDragging = true
        this.lastMousePos = touches[0]
      }
    } else if (touches.length === 2 && touches[0] && touches[1]) {
      // 双指缩放
      if (!this.config.pinchDisabled) {
        const distance = getDistance(touches[0], touches[1])
        const center = getCenter(touches)

        this.touchState = {
          touches: Array.from(event.touches),
          lastDistance: distance,
          lastCenter: center,
        }
      }
    }
  }

  private handleTouchMove(event: TouchEvent): void {
    event.preventDefault()

    const touches = getTouchPoints(event.touches)

    if (
      touches.length === 1 &&
      this.isDragging &&
      this.lastMousePos &&
      touches[0]
    ) {
      // 单指拖拽
      const dpr = window.devicePixelRatio || 1
      const deltaX = (touches[0].x - this.lastMousePos.x) * dpr
      const deltaY = (touches[0].y - this.lastMousePos.y) * dpr

      // 设置移动标志（检测是否超过最小移动距离）
      if (Math.abs(deltaX) > 5 * dpr || Math.abs(deltaY) > 5 * dpr) {
        this.hasMoved = true
      }

      this.transform.translateX += deltaX
      this.transform.translateY += deltaY

      // 应用边界限制
      this.constrainToBounds()

      this.lastMousePos = touches[0]

      // 通知变换变化
      this.emitTransformChange()

      this.throttledRender()
    } else if (
      touches.length === 2 &&
      this.touchState &&
      touches[0] &&
      touches[1]
    ) {
      // 双指缩放
      if (this.config.pinchDisabled) return

      const distance = getDistance(touches[0], touches[1])
      const center = getCenter(touches)

      const scaleFactor = distance / this.touchState.lastDistance
      const rect = this.canvas.getBoundingClientRect()
      const dpr = window.devicePixelRatio || 1

      // 转换为画布坐标系（考虑设备像素比）
      const canvasX = (center.x - rect.left) * dpr
      const canvasY = (center.y - rect.top) * dpr

      this.zoomAtPoint(canvasX, canvasY, scaleFactor)

      this.touchState.lastDistance = distance
      this.touchState.lastCenter = center
    }
  }

  private handleTouchEnd(event: TouchEvent): void {
    const now = Date.now()

    // 只有在单指触摸且没有移动的情况下才处理双击
    if (
      event.touches.length === 0 &&
      this.lastMousePos &&
      !this.hasMoved &&
      !this.config.doubleClickDisabled
    ) {
      const currentTouchPosition = this.lastMousePos

      // 检查是否为双击
      if (
        this.lastTouchTime > 0 &&
        now - this.lastTouchTime < EVENT_CONFIG.DOUBLE_CLICK_DELAY &&
        this.lastTouchPosition &&
        this.isNearPosition(currentTouchPosition, this.lastTouchPosition, 50)
      ) {
        // 双击逻辑
        const rect = this.canvas.getBoundingClientRect()
        const dpr = window.devicePixelRatio || 1

        // 转换为画布坐标系（考虑设备像素比）
        const centerX = (currentTouchPosition.x - rect.left) * dpr
        const centerY = (currentTouchPosition.y - rect.top) * dpr

        if (this.config.doubleClickMode === 'toggle') {
          const isZoomedIn = this.transform.scale > this.initialScale * 1.1
          if (isZoomedIn) {
            this.resetView()
          } else {
            this.zoomAtPoint(
              centerX,
              centerY,
              this.config.doubleClickStep,
              true,
            )
          }
        } else {
          this.zoomAtPoint(centerX, centerY, this.config.doubleClickStep, true)
        }

        // 重置双击状态，防止连续触发
        this.lastTouchTime = 0
        this.lastTouchPosition = null
      } else {
        // 记录这次触摸，为下次双击检测做准备
        this.lastTouchTime = now
        this.lastTouchPosition = currentTouchPosition
      }
    } else {
      // 如果有移动或多指触摸，重置双击状态
      this.lastTouchTime = 0
      this.lastTouchPosition = null
    }

    // 清理拖拽状态
    this.isDragging = false
    this.lastMousePos = null
    this.touchState = null
    this.hasMoved = false
  }

  private isNearPosition(pos1: Point, pos2: Point, threshold: number): boolean {
    const distance = Math.sqrt(
      Math.pow(pos1.x - pos2.x, 2) + Math.pow(pos1.y - pos2.y, 2),
    )
    return distance <= threshold
  }

  // WebGL 上下文事件处理
  private handleContextLost(event: Event): void {
    event.preventDefault()
    console.warn('WebGL context lost')

    // 停止所有动画
    if (this.animationId) {
      cancelAnimationFrame(this.animationId)
      this.animationId = null
    }

    // 清理状态
    this.animation = null
    this.isDragging = false
    this.lastMousePos = null
    this.touchState = null
  }

  private handleContextRestored(): void {
    console.log('WebGL context restored')

    try {
      // 重新初始化 WebGL
      this.setupWebGL()

      // 如果有图像，重新加载
      if (this.image) {
        let usingTiles = this.useTiles

        if (usingTiles) {
          const recreated = this.createTiles(this.image)
          if (!recreated) {
            const texture = this.createTexture(this.image)
            if (!texture) {
              throw new Error('Failed to recreate texture after context restore')
            }
            usingTiles = false
          }
        } else {
          const texture = this.createTexture(this.image)
          if (!texture) {
            throw new Error('Failed to recreate texture after context restore')
          }
        }

        this.useTiles = usingTiles && this.tiles.length > 0

        if (this.useTiles) {
          this.updatePositionBuffer()
        }
        this.render()
      }
    } catch (error) {
      console.error('Failed to restore WebGL context:', error)
    }
  }

  // 公共方法
  public zoomIn(animate = false): void {
    const rect = this.canvas.getBoundingClientRect()
    const dpr = window.devicePixelRatio || 1
    const centerX = (rect.width / 2) * dpr
    const centerY = (rect.height / 2) * dpr

    this.zoomAtPoint(centerX, centerY, 1 + this.config.wheelStep, animate)
  }

  public zoomOut(animate = false): void {
    const rect = this.canvas.getBoundingClientRect()
    const dpr = window.devicePixelRatio || 1
    const centerX = (rect.width / 2) * dpr
    const centerY = (rect.height / 2) * dpr

    this.zoomAtPoint(centerX, centerY, 1 - this.config.wheelStep, animate)
  }

  public resetView(): void {
    if (!this.image) return

    // 计算目标变换（重置状态），但不直接应用到当前变换
    const targetTransform = this.calculateCenterTransform()

    // 使用动画过渡到目标状态
    this.animateTo(targetTransform)
  }

  private calculateCenterTransform(): Transform {
    if (!this.image || this.image.width <= 0 || this.image.height <= 0) {
      return { ...this.transform }
    }

    // 避免除零错误
    if (this.canvas.width <= 0 || this.canvas.height <= 0) {
      return { ...this.transform }
    }

    // 设置初始缩放（这是相对缩放的基准）
    this.initialScale = this.getFitScale()

    // 基于相对缩放限制计算实际缩放值
    const actualScale = this.clampScale(this.initialScale)

    const scaledWidth = this.image.width * actualScale
    const scaledHeight = this.image.height * actualScale

    return {
      scale: actualScale,
      translateX: (this.canvas.width - scaledWidth) / 2,
      translateY: (this.canvas.height - scaledHeight) / 2,
    }
  }

  public getScale(): number {
    return this.transform.scale
  }

  private getFitScale(): number {
    if (
      !this.image ||
      this.image.width <= 0 ||
      this.image.height <= 0 ||
      this.canvas.width <= 0 ||
      this.canvas.height <= 0
    ) {
      return this.initialScale
    }

    const canvasAspect = this.canvas.width / this.canvas.height
    const imageAspect = this.image.width / this.image.height

    if (!isFinite(canvasAspect) || !isFinite(imageAspect)) {
      return this.initialScale
    }

    return imageAspect > canvasAspect
      ? this.canvas.width / this.image.width
      : this.canvas.height / this.image.height
  }

  public getRelativeScale(): number {
    return this.transform.scale / this.initialScale
  }

  private zoomAtPoint(
    x: number,
    y: number,
    scaleFactor: number,
    animate = false,
  ): void {
    // 检查输入参数的有效性
    if (!isFinite(scaleFactor) || scaleFactor <= 0) return
    if (!isFinite(x) || !isFinite(y)) return

    // 使用相对缩放约束来限制新的缩放值
    const newScale = this.clampScale(this.transform.scale * scaleFactor)

    // 检查新缩放值是否有效且有意义的变化
    if (newScale === this.transform.scale || !isFinite(newScale)) return

    // 计算缩放中心点相对于图像的位置
    const imageX = (x - this.transform.translateX) / this.transform.scale
    const imageY = (y - this.transform.translateY) / this.transform.scale

    // 计算新的平移量
    const newTranslateX = x - imageX * newScale
    const newTranslateY = y - imageY * newScale

    // 检查平移值的有效性
    if (!isFinite(newTranslateX) || !isFinite(newTranslateY)) return

    const targetTransform: Transform = {
      scale: newScale,
      translateX: newTranslateX,
      translateY: newTranslateY,
    }

    // 应用边界限制到目标变换
    const oldTransform = this.transform
    this.transform = targetTransform
    this.constrainToBounds()
    const constrainedTransform = { ...this.transform }
    this.transform = oldTransform

    if (animate) {
      this.animateTo(constrainedTransform)
    } else {
      this.transform = constrainedTransform
      this.throttledRender()
      this.emitZoomChange()
      this.emitTransformChange()
    }
  }

  private emitZoomChange(): void {
    if (this.onZoomChange) {
      const relativeScale = this.transform.scale / this.initialScale
      this.onZoomChange(this.transform.scale, relativeScale)
    }
  }

  private emitTransformChange(): void {
    // 通知变换变化（用于调试信息更新等）
    if (this.onTransformChange) {
      this.onTransformChange({ ...this.transform })
    }
  }

  public getDebugInfo(): DebugInfo | null {
    if (!this.image) return null

    const visibleTiles = this.useTiles ? this.getVisibleTiles() : []
    const imageSrc =
      'src' in this.image && typeof this.image.src === 'string'
        ? this.image.src
        : ''

    return {
      scale: this.transform.scale,
      relativeScale: this.transform.scale / this.initialScale,
      translateX: this.transform.translateX,
      translateY: this.transform.translateY,
      canvasWidth: this.canvas.width,
      canvasHeight: this.canvas.height,
      imageWidth: this.image.width,
      imageHeight: this.image.height,
      devicePixelRatio: window.devicePixelRatio || 1,
      maxTextureSize: getMaxTextureSize(this.gl),
      isLoading: this.isLoadingTexture,
      loadingState: this.currentLoadingState,
      currentQuality: this.currentQuality,
      imageSrc,
      tileEnabled: this.config.tileEnabled,
      useTiles: this.useTiles,
      totalTiles: this.tiles.length,
      visibleTiles: visibleTiles.length,
      tileSize: this.config.tileSize,
    }
  }

  public setCallbacks(callbacks: {
    onZoomChange?: (originalScale: number, relativeScale: number) => void
    onImageCopied?: () => void
    onLoadingStateChange?: (
      isLoading: boolean,
      state?: LoadingState,
      quality?: 'high' | 'medium' | 'low' | 'unknown',
    ) => void
    onTransformChange?: (transform: Transform) => void
  }): void {
    this.onZoomChange = callbacks.onZoomChange
    this.onImageCopied = callbacks.onImageCopied
    this.onLoadingStateChange = callbacks.onLoadingStateChange
    this.onTransformChange = callbacks.onTransformChange
  }

  public async copyOriginalImageToClipboard(): Promise<void> {
    if (!this.image) {
      throw new Error('No image loaded')
    }

    try {
      // 创建一个画布来复制图像
      const canvas = document.createElement('canvas')
      const ctx = canvas.getContext('2d')
      if (!ctx) {
        throw new Error('Failed to get 2D context')
      }

      canvas.width = this.image.width
      canvas.height = this.image.height
      ctx.drawImage(this.image as CanvasImageSource, 0, 0)

      // 转换为 blob
      const blob = await new Promise<Blob | null>((resolve) => {
        canvas.toBlob(resolve, 'image/png')
      })

      if (!blob) {
        throw new Error('Failed to create blob')
      }

      // 复制到剪贴板
      await navigator.clipboard.write([
        new ClipboardItem({ 'image/png': blob }),
      ])

      this.onImageCopied?.()
    } catch (error) {
      console.error('Failed to copy image to clipboard:', error)
      throw error
    }
  }

  public destroy(): void {
    // 清理动画
    if (this.animationId) {
      cancelAnimationFrame(this.animationId)
      this.animationId = null
    }

    // 清理 WebGL 资源
    const { gl } = this
    if (this.texture) {
      gl.deleteTexture(this.texture)
      this.texture = null
    }
    this.cleanupTiles()
    this.useTiles = false
    if (this.positionBuffer) {
      gl.deleteBuffer(this.positionBuffer)
      this.positionBuffer = null
    }
    if (this.texCoordBuffer) {
      gl.deleteBuffer(this.texCoordBuffer)
      this.texCoordBuffer = null
    }
    if (this.program) {
      gl.deleteProgram(this.program)
      this.program = null
    }

    // 清理事件监听器
    this.canvas.removeEventListener('mousedown', this.boundHandleMouseDown)
    this.canvas.removeEventListener('mouseleave', this.boundHandleMouseLeave)
    this.canvas.removeEventListener('wheel', this.boundHandleWheel)
    this.canvas.removeEventListener('click', this.boundHandleClick)
    this.canvas.removeEventListener('touchstart', this.boundHandleTouchStart)
    this.canvas.removeEventListener('touchmove', this.boundHandleTouchMove)
    this.canvas.removeEventListener('touchend', this.boundHandleTouchEnd)
    this.canvas.removeEventListener(
      'webglcontextlost',
      this.boundHandleContextLost,
    )
    this.canvas.removeEventListener(
      'webglcontextrestored',
      this.boundHandleContextRestored,
    )
    this.canvas.removeEventListener('contextmenu', this.boundHandleContextMenu)

    // 清理全局事件监听器（防止内存泄露）
    document.removeEventListener('mouseup', this.boundHandleMouseUp)
    document.removeEventListener('mousemove', this.boundHandleMouseMove)

    // 清理观察器
    if (this.resizeObserver) {
      this.resizeObserver.disconnect()
      this.resizeObserver = null
    }
    if (this.resizeAnimationFrameId) {
      cancelAnimationFrame(this.resizeAnimationFrameId)
      this.resizeAnimationFrameId = null
    }

    // 重置状态
    this.animation = null
    this.isDragging = false
    this.lastMousePos = null
    this.touchState = null
    this.lastTouchTime = 0
    this.lastTouchPosition = null
    this.hasMoved = false
    this.image = null

    // 清理回调
    this.onZoomChange = undefined
    this.onImageCopied = undefined

    // 终止 worker
    if (this.worker) {
      this.worker.terminate()
      this.worker = null
    }
  }
}
