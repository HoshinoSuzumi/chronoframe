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

export class WebGLImageViewerEngine {
  private canvas: HTMLCanvasElement
  private gl: WebGLRenderingContext
  private config: EngineConfig
  private image: HTMLImageElement | null = null
  private texture: WebGLTexture | null = null
  private program: WebGLProgram | null = null

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

  // 事件监听器
  private throttledRender: () => void
  private resizeObserver: ResizeObserver | null = null

  // 绑定的事件处理器（用于正确添加/移除全局事件监听器）
  private boundHandleMouseUp: () => void
  private boundHandleMouseMove: (event: MouseEvent) => void
  private boundHandleMouseLeave: () => void

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
    this.boundHandleMouseUp = this.handleMouseUp.bind(this)
    this.boundHandleMouseMove = this.handleMouseMove.bind(this)
    this.boundHandleMouseLeave = this.handleMouseLeave.bind(this)

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
          this.handleWorkerImageLoaded(payload)
          break
        case 'load-error':
          this.handleWorkerImageLoadError(payload)
          break
      }
    }

    this.worker.onerror = (error) => {
      console.error('Worker error:', error)
    }
  }

  private handleWorkerImageLoaded(payload: any) {
    this.emitLoadingStateChange(true, LoadingState.TEXTURE_LOADING)
    const { imageBitmap } = payload

    try {
      this.image = imageBitmap
      this.createTexture(imageBitmap)
      // imageBitmap.close()
      this.updatePositionBuffer()

      if (this.config.centerOnInit) {
        this.centerImage()
      }

      this.currentQuality = 'high'

      this.emitLoadingStateChange(
        false,
        LoadingState.COMPLETE,
        this.currentQuality,
      )
      this.render()
      if (this.imageLoadingResolve) this.imageLoadingResolve()
    } catch (err) {
      console.error('Failed to create texture from ImageBitmap:', err)
      this.emitLoadingStateChange(false, LoadingState.ERROR)
      if (this.imageLoadingReject) this.imageLoadingReject(err as Error)
    }
  }

  private handleWorkerImageLoadError(error: any) {
    console.error('Image load error from worker:', error)
    this.emitLoadingStateChange(false, LoadingState.ERROR)
    if (this.imageLoadingReject) this.imageLoadingReject(error as Error)
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
    this.canvas.addEventListener('mousedown', this.handleMouseDown.bind(this))
    this.canvas.addEventListener('mouseleave', this.boundHandleMouseLeave)
    this.canvas.addEventListener('wheel', this.handleWheel.bind(this), {
      passive: false,
    })
    this.canvas.addEventListener('click', this.handleClick.bind(this))

    // 触摸事件
    this.canvas.addEventListener(
      'touchstart',
      this.handleTouchStart.bind(this),
      { passive: false },
    )
    this.canvas.addEventListener('touchmove', this.handleTouchMove.bind(this), {
      passive: false,
    })
    this.canvas.addEventListener('touchend', this.handleTouchEnd.bind(this), {
      passive: false,
    })

    // WebGL 上下文丢失事件
    this.canvas.addEventListener(
      'webglcontextlost',
      this.handleContextLost.bind(this),
      false,
    )
    this.canvas.addEventListener(
      'webglcontextrestored',
      this.handleContextRestored.bind(this),
      false,
    )

    // 防止上下文菜单
    this.canvas.addEventListener('contextmenu', (e) => e.preventDefault())
  }

  private setupResizeObserver(): void {
    this.resizeObserver = new ResizeObserver(() => {
      this.resize()
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
    this.emitLoadingStateChange(true, LoadingState.IMAGE_LOADING)

    return new Promise((resolve, reject) => {
      this.imageLoadingResolve = resolve
      this.imageLoadingReject = reject
      if (this.worker) {
        try {
          const absolute = new URL(src, self.location?.origin || 'http://localhost')
          this.worker.postMessage({ type: 'load', payload: { src: absolute.toString() } })
        } catch {
          this.worker.postMessage({ type: 'load', payload: { src } })
        }
      } else {
        reject(new Error('No worker available'))
      }
    })
  }

  private createTexture(
    imageSource: HTMLCanvasElement | HTMLImageElement | ImageBitmap,
  ): WebGLTexture | null {
    const { gl } = this

    // 清理旧纹理
    if (this.texture) {
      gl.deleteTexture(this.texture)
    }

    // 获取最大纹理尺寸并判断是否需要缩放
    const maxTextureSize = getMaxTextureSize(gl)
    const srcWidth =
      (imageSource as HTMLCanvasElement).width ??
      (imageSource as HTMLImageElement).width ??
      (imageSource as ImageBitmap).width
    const srcHeight =
      (imageSource as HTMLCanvasElement).height ??
      (imageSource as HTMLImageElement).height ??
      (imageSource as ImageBitmap).height

    let finalSource: HTMLCanvasElement | HTMLImageElement | ImageBitmap =
      imageSource

    // 如果超出最大纹理尺寸，使用离屏 canvas 等比缩放
    if (
      typeof srcWidth === 'number' &&
      typeof srcHeight === 'number' &&
      (srcWidth > maxTextureSize || srcHeight > maxTextureSize)
    ) {
      const scale = Math.min(
        maxTextureSize / srcWidth,
        maxTextureSize / srcHeight,
      )

      const targetWidth = Math.max(1, Math.floor(srcWidth * scale))
      const targetHeight = Math.max(1, Math.floor(srcHeight * scale))

      const offscreen = document.createElement('canvas')
      offscreen.width = targetWidth
      offscreen.height = targetHeight
      const ctx = offscreen.getContext('2d')
      if (ctx) {
        ctx.imageSmoothingEnabled = true
        
        ctx.imageSmoothingQuality = 'high'
        ctx.drawImage(imageSource as any, 0, 0, targetWidth, targetHeight)
        finalSource = offscreen
      } else {
        finalSource = imageSource
      }
    }

    this.texture = gl.createTexture()
    gl.bindTexture(gl.TEXTURE_2D, this.texture)

    // 设置纹理参数
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE)
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE)
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR)
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR)

    // 上传图像数据（使用可能缩放后的来源）
    gl.texImage2D(
      gl.TEXTURE_2D,
      0,
      gl.RGBA,
      gl.RGBA,
      gl.UNSIGNED_BYTE,
      finalSource,
    )

    // 更新内部 image 引用为最终用于渲染的尺寸
    this.image = finalSource as any
    this.updatePositionBuffer()

    return this.texture
  }

  private resize(): void {
    const rect = this.canvas.getBoundingClientRect()
    const dpr = window.devicePixelRatio || 1

    // 检查画布尺寸是否有效
    if (rect.width <= 0 || rect.height <= 0) {
      return
    }

    this.canvas.width = rect.width * dpr
    this.canvas.height = rect.height * dpr

    this.gl.viewport(0, 0, this.canvas.width, this.canvas.height)

    // 只有在图像已加载时才渲染
    if (this.image && this.texture) {
      this.throttledRender()
    }
  }

  private centerImage(): void {
    if (!this.image || this.image.width <= 0 || this.image.height <= 0) return

    const canvasAspect = this.canvas.width / this.canvas.height
    const imageAspect = this.image.width / this.image.height

    // 避免除零错误
    if (this.canvas.width <= 0 || this.canvas.height <= 0) return

    // 计算适合屏幕的初始缩放值
    let initialScale: number
    if (imageAspect > canvasAspect) {
      initialScale = this.canvas.width / this.image.width
    } else {
      initialScale = this.canvas.height / this.image.height
    }

    // 设置初始缩放（这是相对缩放的基准）
    this.initialScale = initialScale

    // 基于相对缩放限制计算实际缩放值
    // 如果用户设置的相对缩放限制允许，我们使用初始缩放值
    // 否则使用限制后的值
    const actualScale = this.clampScale(initialScale)

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
    if (!this.program || !this.texture) return

    const { gl } = this

    try {
      // 检查 WebGL 上下文是否仍然有效
      if (gl.isContextLost()) {
        console.warn('WebGL context is lost, skipping render')
        return
      }

      // 更新动画
      this.updateAnimation()

      // 清除画布
      gl.clear(gl.COLOR_BUFFER_BIT)

      // 使用着色器程序
      gl.useProgram(this.program)

      // 设置统一变量
      gl.uniform2f(
        this.resolutionLocation,
        this.canvas.width,
        this.canvas.height,
      )
      gl.uniform1i(this.imageLocation, 0)

      // 设置变换矩阵
      const matrix = createTransformMatrix(
        this.transform.scale,
        this.transform.translateX,
        this.transform.translateY,
      )
      gl.uniformMatrix3fv(this.matrixLocation, false, matrix)

      // 绑定纹理
      gl.activeTexture(gl.TEXTURE0)
      gl.bindTexture(gl.TEXTURE_2D, this.texture)

      // 设置位置属性
      gl.bindBuffer(gl.ARRAY_BUFFER, this.positionBuffer)
      gl.enableVertexAttribArray(this.positionLocation)
      gl.vertexAttribPointer(this.positionLocation, 2, gl.FLOAT, false, 0, 0)

      // 设置纹理坐标属性
      gl.bindBuffer(gl.ARRAY_BUFFER, this.texCoordBuffer)
      gl.enableVertexAttribArray(this.texCoordLocation)
      gl.vertexAttribPointer(this.texCoordLocation, 2, gl.FLOAT, false, 0, 0)

      // 绘制
      gl.drawArrays(gl.TRIANGLES, 0, 6)

      // 检查 WebGL 错误
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
        this.createTexture(this.image)
        this.updatePositionBuffer()
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

    const canvasAspect = this.canvas.width / this.canvas.height
    const imageAspect = this.image.width / this.image.height

    // 避免除零错误
    if (this.canvas.width <= 0 || this.canvas.height <= 0) {
      return { ...this.transform }
    }

    // 计算适合屏幕的初始缩放值
    let initialScale: number
    if (imageAspect > canvasAspect) {
      initialScale = this.canvas.width / this.image.width
    } else {
      initialScale = this.canvas.height / this.image.height
    }

    // 设置初始缩放（这是相对缩放的基准）
    this.initialScale = initialScale

    // 基于相对缩放限制计算实际缩放值
    const actualScale = this.clampScale(initialScale)

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
      imageSrc: this.image.src || '',
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
      ctx.drawImage(this.image, 0, 0)

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
    this.canvas.removeEventListener(
      'mousedown',
      this.handleMouseDown.bind(this),
    )
    this.canvas.removeEventListener('mouseleave', this.boundHandleMouseLeave)
    this.canvas.removeEventListener('wheel', this.handleWheel.bind(this))
    this.canvas.removeEventListener('click', this.handleClick.bind(this))
    this.canvas.removeEventListener(
      'touchstart',
      this.handleTouchStart.bind(this),
    )
    this.canvas.removeEventListener(
      'touchmove',
      this.handleTouchMove.bind(this),
    )
    this.canvas.removeEventListener('touchend', this.handleTouchEnd.bind(this))
    this.canvas.removeEventListener(
      'webglcontextlost',
      this.handleContextLost.bind(this),
    )
    this.canvas.removeEventListener(
      'webglcontextrestored',
      this.handleContextRestored.bind(this),
    )
    this.canvas.removeEventListener('contextmenu', (e) => e.preventDefault())

    // 清理全局事件监听器（防止内存泄露）
    document.removeEventListener('mouseup', this.boundHandleMouseUp)
    document.removeEventListener('mousemove', this.boundHandleMouseMove)

    // 清理观察器
    if (this.resizeObserver) {
      this.resizeObserver.disconnect()
      this.resizeObserver = null
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
