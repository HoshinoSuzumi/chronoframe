const MAX_WATERFALL_PHOTOS = 30

function seededRandom(seed: number) {
  let state = seed

  return () => {
    state = (state + 0x6d2b79f5) | 0
    let value = Math.imul(state ^ (state >>> 15), 1 | state)
    value ^= value + Math.imul(value ^ (value >>> 7), 61 | value)
    return ((value ^ (value >>> 14)) >>> 0) / 0x1_0000_0000
  }
}

export function sampleWaterfallPhotos<T>(
  photos: readonly T[],
  seed: number,
): T[] {
  const shuffled = [...photos]
  const count = Math.min(MAX_WATERFALL_PHOTOS, shuffled.length)
  const random = seededRandom(seed)

  // A partial Fisher-Yates shuffle samples without replacement.
  for (let index = 0; index < count; index++) {
    const randomIndex = index + Math.floor(random() * (shuffled.length - index))
    ;[shuffled[index], shuffled[randomIndex]] = [
      shuffled[randomIndex]!,
      shuffled[index]!,
    ]
  }

  return shuffled.slice(0, count)
}
