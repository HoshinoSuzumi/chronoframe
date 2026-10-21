import { logger } from '../../utils/logger'
import {
  calculateHistogram as histogram,
  calculateHistogramFromBuffer as histogramFromBuffer,
} from '@chronoframe/media/histogram'
export type { HistogramData } from '@chronoframe/media/histogram'
export const calculateHistogram = (image: Parameters<typeof histogram>[0]) =>
  histogram(image, logger.image)
export const calculateHistogramFromBuffer = (buffer: Buffer) =>
  histogramFromBuffer(buffer, logger.image)
