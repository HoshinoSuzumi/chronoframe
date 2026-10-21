export interface HistogramData {
  red: number[]
  green: number[]
  blue: number[]
  gray: number[]
}

export interface HistogramDataCompressed {
  red: number[]
  green: number[]
  blue: number[]
  gray: number[]
}

const compressHistogramBin = (data: number[]): number[] => {
  const compressed: number[] = zeroArray(128)
  for (let i = 0; i < data.length; i++) {
    compressed[Math.floor(i / 2)]! += data[i] ?? 0
  }
  return compressed
}

export const calculateHistogramCompressed = (
  imageData: ImageData,
): HistogramDataCompressed => {
  const histogram: HistogramData = {
    red: zeroArray(256),
    green: zeroArray(256),
    blue: zeroArray(256),
    gray: zeroArray(256),
  }

  const { data } = imageData
  for (let i = 0; i < data.length; i += 4) {
    const r = data[i]!
    const g = data[i + 1]!
    const b = data[i + 2]!
    // const a = data[i + 3]
    const gray = Math.round(0.299 * r + 0.587 * g + 0.114 * b)

    histogram.red[r]!++
    histogram.green[g]!++
    histogram.blue[b]!++
    histogram.gray[gray]!++
  }

  return {
    red: compressHistogramBin(histogram.red),
    green: compressHistogramBin(histogram.green),
    blue: compressHistogramBin(histogram.blue),
    gray: compressHistogramBin(histogram.gray),
  }
}

// ease-out cubic
const easeOutCubic = (t: number): number => {
  return 1 - Math.pow(1 - t, 3)
}

// 存储每个canvas的动画状态
const canvasAnimationStates = new WeakMap<
  HTMLCanvasElement,
  {
    animationId: number | null
    isAnimating: boolean
  }
>()

export const drawHistogramToCanvas = (
  canvas: HTMLCanvasElement,
  histogram: HistogramDataCompressed,
  options: {
    padding: number
    colors: {
      background: string
      border: string
      grid: string
      red: string
      green: string
      blue: string
      gray: string
    }
  } = {
    padding: 0,
    colors: {
      background: 'rgba(36, 36, 38, .65)',
      border: 'rgba(255, 255, 255, .1)',
      grid: 'rgba(255, 255, 255, .3)',
      red: 'rgba(255, 98, 89, 1)',
      green: 'rgba(46, 209, 87, 1)',
      blue: 'rgba(59, 154, 255, 1)',
      gray: 'rgba(255, 255, 255, 1)',
    },
  },
) => {
  const ctx = canvas.getContext('2d')
  if (!ctx) {
    console.error('Failed to get canvas context')
    return
  }

  // 获取或创建动画状态
  let animationState = canvasAnimationStates.get(canvas)
  if (!animationState) {
    animationState = { animationId: null, isAnimating: false }
    canvasAnimationStates.set(canvas, animationState)
  }

  // 如果正在动画中，先停止
  if (animationState.isAnimating && animationState.animationId) {
    clearTimeout(animationState.animationId)
  }

  const canvasRect = canvas.getBoundingClientRect()
  const { width, height } = canvasRect
  const dpr = window.devicePixelRatio || 1
  canvas.width = width * dpr
  canvas.height = height * dpr
  ctx.scale(dpr, dpr)
  canvas.style.width = `${width}px`
  canvas.style.height = `${height}px`

  const maxCount = Math.max(
    ...histogram.red,
    ...histogram.green,
    ...histogram.blue,
    ...histogram.gray,
  )

  if (maxCount === 0) return

  const logicalWidth = width
  const logicalHeight = height
  const chartWidth = logicalWidth - options.padding * 2
  const chartHeight = logicalHeight - options.padding * 2

  const drawBars = (
    data: number[],
    color: string,
    opacity: number = 1,
    progress: number = 1,
  ) => {
    const barWidth = chartWidth / data.length
    for (let i = 0; i < data.length; i++) {
      const fullBarHeight = ((data[i] ?? 0) / maxCount) * chartHeight
      const barHeight = fullBarHeight * progress // Apply animation progress

      // Gradient from bar's top to bottom
      const gradient = ctx.createLinearGradient(
        0,
        options.padding + chartHeight - barHeight,
        0,
        options.padding + chartHeight,
      )

      gradient.addColorStop(0, color.replace(/[\d.]+\)$/, `${opacity})`))
      gradient.addColorStop(1, color.replace(/[\d.]+\)$/, `${opacity * 0.3})`))

      ctx.fillStyle = gradient
      ctx.globalAlpha = opacity

      const x = options.padding + i * barWidth
      const y = options.padding + chartHeight - barHeight
      const w = barWidth * 0.8
      const h = barHeight
      const radius = Math.min(w / 2, 2)

      ctx.beginPath()
      ctx.roundRect(x, y, w, h, [radius, radius, 0, 0])
      ctx.fill()
    }
    ctx.globalAlpha = 1
  }

  const renderFrame = (progress: number) => {
    ctx.clearRect(0, 0, logicalWidth, logicalHeight)

    // 绘制背景
    ctx.fillStyle = options.colors.background
    ctx.fillRect(0, 0, logicalWidth, logicalHeight)

    // 绘制网格
    ctx.lineWidth = 0.2
    ctx.strokeStyle = options.colors.grid
    for (let i = 1; i <= 3; i++) {
      ctx.beginPath()
      ctx.moveTo(options.padding, options.padding + (chartHeight / 4) * i)
      ctx.lineTo(
        logicalWidth - options.padding,
        options.padding + (chartHeight / 4) * i,
      )
      ctx.stroke()
    }

    // 绘制bars
    drawBars(histogram.gray, options.colors.gray, 0.4, progress)
    ctx.globalCompositeOperation = 'screen'
    drawBars(histogram.red, options.colors.red, 0.8, progress)
    drawBars(histogram.green, options.colors.green, 0.8, progress)
    drawBars(histogram.blue, options.colors.blue, 0.8, progress)
    ctx.globalCompositeOperation = 'source-over'

    // 绘制边框
    ctx.strokeStyle = options.colors.border
    ctx.lineWidth = 1
    ctx.strokeRect(
      options.padding - 0.5,
      options.padding - 0.5,
      chartWidth + 1,
      chartHeight + 1,
    )
  }

  // 开始动画
  animationState.isAnimating = true
  const startTime = Date.now()
  const duration = 600

  const animate = () => {
    const elapsed = Date.now() - startTime
    const rawProgress = Math.min(elapsed / duration, 1)

    const easedProgress = easeOutCubic(rawProgress)

    renderFrame(easedProgress)

    if (rawProgress < 1) {
      animationState.animationId = window.setTimeout(animate, 16) // ~60fps
    } else {
      animationState.isAnimating = false
      animationState.animationId = null
    }
  }

  renderFrame(0)
  animate()
}
