import sharp from 'sharp'

export interface HistogramData {
  r: number[]
  g: number[]
  b: number[]
  gray: number[]
}

/**
 * 使用现有的 Sharp 实例计算图片的直方图数据
 * @param sharpInst Sharp 实例
 * @returns 直方图数据，包含 RGB 和灰度通道的 256 个值
 */
export const calculateHistogram = async (
  sharpInst: sharp.Sharp,
): Promise<HistogramData> => {
  try {
    // 获取原始像素数据，确保是 RGB 格式
    const { data, info } = await sharpInst
      .clone() // 克隆 Sharp 实例以避免影响原实例
      .removeAlpha() // 移除 alpha 通道
      .raw()
      .toBuffer({ resolveWithObject: true })

    const { width, height, channels } = info
    const totalPixels = width * height
    // 初始化直方图数组（256个bin，对应0-255的像素值）
    const histogramR = zeroArray(256)
    const histogramG = zeroArray(256)
    const histogramB = zeroArray(256)
    const histogramGray = zeroArray(256)

    // 遍历像素数据计算直方图
    for (let i = 0; i < data.length; i += channels) {
      const r = data[i]
      const g = data[i + 1]
      const b = data[i + 2]

      // 累计 RGB 通道直方图
      histogramR[r]++
      histogramG[g]++
      histogramB[b]++

      // 计算灰度值（使用 ITU-R BT.709 标准）
      const gray = Math.round(0.299 * r + 0.587 * g + 0.114 * b)
      histogramGray[gray]++
    }

    // 归一化直方图（转换为百分比）
    const normalizeHistogram = (hist: number[]) => {
      return hist.map((count) => count / totalPixels)
    }

    return {
      r: normalizeHistogram(histogramR),
      g: normalizeHistogram(histogramG),
      b: normalizeHistogram(histogramB),
      gray: normalizeHistogram(histogramGray),
    }
  } catch (error) {
    logger.image.error('Failed to calculate histogram', error)
    throw error
  }
}

/**
 * 使用图片缓冲区计算直方图数据
 * @param buffer 图片缓冲区
 * @returns 直方图数据
 */
export const calculateHistogramFromBuffer = async (
  buffer: Buffer,
): Promise<HistogramData> => {
  const sharpInst = sharp(buffer)
  return calculateHistogram(sharpInst)
}
