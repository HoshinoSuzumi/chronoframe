import path from 'node:path'
/** Identify potential Live Photo companions by MOV extension and the 12 MiB size limit. */
export const isLivePhotoVideo = (
  fileName: string,
  fileSize: number,
): boolean => {
  const extName = path.extname(fileName).toLowerCase()

  // 检查是否为 MOV 格式
  if (extName !== '.mov') {
    return false
  }

  const maxLivePhotoSize = 12 * 1024 * 1024 // 12MB
  return fileSize <= maxLivePhotoSize
}
