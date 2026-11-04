<script lang="ts" setup>
import { thumbHashToRGBA } from 'thumbhash'

const props = defineProps<{
  photos: Photo[]
}>()

// Must match the dot grid drawn by the footer pattern.
const CELL = 18
const RADIUS = 140
const LEVELS = 4
const TRAIL_MS = 700
const SWITCH_MS = 5000
const FADE_MS = 1600
const LIT_THRESHOLD = 0.02

const canvasRef = ref<HTMLCanvasElement>()
const reducedMotion = usePreferredReducedMotion()
const colorMode = useColorMode()
const isDark = computed(() => colorMode.value === 'dark')
const isActive = computed(() => reducedMotion.value !== 'reduce')

let ctx: CanvasRenderingContext2D | null = null
let cols = 0
let rows = 0
let cssWidth = 0
let cssHeight = 0
let dpr = 1
let heat = new Float32Array(0)
let from = new Uint8ClampedArray(0)
let to = new Uint8ClampedArray(0)
let fromHash = ''
let toHash = ''
let mix = 1
let raf = 0
let lastFrame = 0
let lastStamp: { x: number; y: number } | null = null
let timer: ReturnType<typeof setInterval> | undefined
let visible = false
let queue: string[] = []

const candidateHashes = () => [
  ...new Set(
    props.photos
      .map((photo) => photo.thumbnailHash)
      .filter((hash): hash is string => Boolean(hash)),
  ),
]

const nextHash = () => {
  if (queue.length === 0) {
    const hashes = candidateHashes()
    for (let i = hashes.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1))
      ;[hashes[i], hashes[j]] = [hashes[j]!, hashes[i]!]
    }
    queue = hashes
  }
  return queue.pop() ?? ''
}

// Dark photos would vanish against a dark page, so lift dots to a readable brightness.
const lift = (palette: Uint8ClampedArray) => {
  for (let i = 0; i < palette.length; i += 4) {
    const peak = Math.max(palette[i]!, palette[i + 1]!, palette[i + 2]!, 32)
    const gain = Math.min(4, Math.max(1, 210 / peak))
    palette[i] *= gain
    palette[i + 1] *= gain
    palette[i + 2] *= gain
  }
}

// Decode the thumbhash and cover-fit it onto the dot grid, one pixel per dot.
const buildPalette = (hash: string) => {
  const palette = new Uint8ClampedArray(cols * rows * 4)
  if (!hash || cols === 0 || rows === 0) return palette

  try {
    const { w, h, rgba } = thumbHashToRGBA(decompressUint8Array(hash))
    const source = document.createElement('canvas')
    source.width = w
    source.height = h
    source
      .getContext('2d')!
      .putImageData(new ImageData(new Uint8ClampedArray(rgba), w, h), 0, 0)

    const target = document.createElement('canvas')
    target.width = cols
    target.height = rows
    const targetCtx = target.getContext('2d', { willReadFrequently: true })!
    targetCtx.imageSmoothingQuality = 'high'
    const scale = Math.max(cols / w, rows / h)
    const dw = w * scale
    const dh = h * scale
    targetCtx.drawImage(source, (cols - dw) / 2, (rows - dh) / 2, dw, dh)
    palette.set(targetCtx.getImageData(0, 0, cols, rows).data)
    if (isDark.value) lift(palette)
  } catch (error) {
    console.warn('[MasonryFooterGlow] Failed to decode thumbhash', error)
  }
  return palette
}

const rebuildPalettes = () => {
  from = buildPalette(fromHash)
  to = fromHash === toHash ? from : buildPalette(toHash)
}

const draw = () => {
  if (!ctx) return 0
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0)
  ctx.clearRect(0, 0, cssWidth, cssHeight)
  const eased = mix * mix * (3 - 2 * mix)
  let lit = 0

  for (let i = 0; i < heat.length; i++) {
    const h = heat[i]!
    if (h <= 0) continue
    lit++
    const o = i * 4
    const r = from[o]! + (to[o]! - from[o]!) * eased
    const g = from[o + 1]! + (to[o + 1]! - from[o + 1]!) * eased
    const b = from[o + 2]! + (to[o + 2]! - from[o + 2]!) * eased
    const x = (i % cols) * CELL + CELL / 2
    const y = Math.floor(i / cols) * CELL + CELL / 2
    ctx.fillStyle = `rgba(${r | 0},${g | 0},${b | 0},${Math.min(1, h * 1.15)})`
    ctx.beginPath()
    ctx.arc(x, y, 1 + h * 1.4, 0, Math.PI * 2)
    ctx.fill()
  }
  return lit
}

const frame = (now: number) => {
  const dt = Math.min(now - lastFrame, 64)
  lastFrame = now
  const decay = Math.exp(-dt / TRAIL_MS)
  for (let i = 0; i < heat.length; i++) {
    const next = heat[i]! * decay
    heat[i] = next < LIT_THRESHOLD ? 0 : next
  }
  if (mix < 1) mix = Math.min(1, mix + dt / FADE_MS)

  const lit = draw()
  raf = lit > 0 || mix < 1 ? requestAnimationFrame(frame) : 0
}

const ensureLoop = () => {
  if (raf) return
  lastFrame = performance.now()
  raf = requestAnimationFrame(frame)
}

const stamp = (x: number, y: number) => {
  const minCol = Math.max(0, Math.floor((x - RADIUS) / CELL))
  const maxCol = Math.min(cols - 1, Math.ceil((x + RADIUS) / CELL))
  const minRow = Math.max(0, Math.floor((y - RADIUS) / CELL))
  const maxRow = Math.min(rows - 1, Math.ceil((y + RADIUS) / CELL))

  for (let row = minRow; row <= maxRow; row++) {
    for (let col = minCol; col <= maxCol; col++) {
      const d = Math.hypot((col + 0.5) * CELL - x, (row + 0.5) * CELL - y)
      if (d >= RADIUS) continue
      // Quantised falloff gives the glow distinct layers.
      const level = Math.ceil((1 - d / RADIUS) * LEVELS) / LEVELS
      const idx = row * cols + col
      if (level > heat[idx]!) heat[idx] = level
    }
  }
}

const onPointerMove = (event: PointerEvent) => {
  const canvas = canvasRef.value
  if (!canvas || !visible || !isActive.value || event.pointerType === 'touch')
    return

  const rect = canvas.getBoundingClientRect()
  const x = event.clientX - rect.left
  const y = event.clientY - rect.top
  if (
    x < -RADIUS ||
    y < -RADIUS ||
    x > rect.width + RADIUS ||
    y > rect.height + RADIUS
  ) {
    lastStamp = null
    return
  }

  // Interpolate so fast pointer movement leaves a continuous trail.
  const start = lastStamp ?? { x, y }
  const distance = Math.hypot(x - start.x, y - start.y)
  const steps = Math.max(1, Math.ceil(distance / (RADIUS / 4)))
  for (let step = 1; step <= steps; step++) {
    stamp(
      start.x + ((x - start.x) * step) / steps,
      start.y + ((y - start.y) * step) / steps,
    )
  }
  lastStamp = { x, y }
  ensureLoop()
}

const resetPointer = () => {
  lastStamp = null
}

const switchPhoto = () => {
  if (!visible || !isActive.value || document.hidden) return
  let hash = nextHash()
  if (hash === toHash) hash = nextHash()
  if (!hash || hash === toHash) return

  fromHash = toHash
  toHash = hash
  rebuildPalettes()
  mix = 0
  ensureLoop()
}

const initPalette = () => {
  if (toHash) return
  const hash = nextHash()
  if (!hash) return
  fromHash = toHash = hash
  rebuildPalettes()
}

const resize = () => {
  const canvas = canvasRef.value
  if (!canvas) return
  const rect = canvas.getBoundingClientRect()
  cssWidth = rect.width
  cssHeight = rect.height
  dpr = window.devicePixelRatio || 1
  canvas.width = Math.round(cssWidth * dpr)
  canvas.height = Math.round(cssHeight * dpr)
  ctx = canvas.getContext('2d')
  cols = Math.ceil(cssWidth / CELL)
  rows = Math.ceil(cssHeight / CELL)
  heat = new Float32Array(cols * rows)
  rebuildPalettes()
}

useResizeObserver(canvasRef, resize)
useIntersectionObserver(canvasRef, ([entry]) => {
  visible = entry?.isIntersecting ?? false
  if (!visible) lastStamp = null
})

watch(isDark, () => {
  rebuildPalettes()
  ensureLoop()
})

watch(isActive, (active) => {
  if (active) return
  cancelAnimationFrame(raf)
  raf = 0
  heat.fill(0)
  mix = 1
  draw()
})

watch(
  () => props.photos,
  () => {
    queue = []
    if (toHash && !candidateHashes().includes(toHash)) {
      fromHash = toHash = ''
      rebuildPalettes()
    }
    initPalette()
  },
)

onMounted(() => {
  resize()
  initPalette()
  window.addEventListener('pointermove', onPointerMove, { passive: true })
  document.addEventListener('pointerleave', resetPointer)
  timer = setInterval(switchPhoto, SWITCH_MS)
})

onBeforeUnmount(() => {
  window.removeEventListener('pointermove', onPointerMove)
  document.removeEventListener('pointerleave', resetPointer)
  clearInterval(timer)
  cancelAnimationFrame(raf)
})
</script>

<template>
  <canvas
    ref="canvasRef"
    class="masonry-footer-glow"
    aria-hidden="true"
  />
</template>

<style scoped>
/* Same box and fade as the footer dot pattern so the dots line up. */
.masonry-footer-glow {
  position: absolute;
  inset: -22rem 0 0;
  z-index: -1;
  width: 100%;
  height: calc(100% + 22rem);
  pointer-events: none;
  mask-image: linear-gradient(to bottom, transparent, #000 70%);
}
</style>
