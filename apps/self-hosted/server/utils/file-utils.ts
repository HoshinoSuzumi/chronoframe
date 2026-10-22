import crypto from 'crypto'
import path from 'path'

/**
 * 清理文件名，移除或替换特殊字符
 * @param fileName 原始文件名
 * @param options 清理选项
 * @returns 清理后的文件名
 */
export const sanitizeFileName = (
  fileName: string,
  options: {
    maxLength?: number
    fallbackPrefix?: string
    minLength?: number
  } = {},
): string => {
  const { maxLength = 50, fallbackPrefix = 'file', minLength = 3 } = options

  // 清理文件名：保留字母、数字、连字符、下划线、点号
  const cleanedName = fileName
    .replace(/[^\w\-_.]/g, '_') // 将非字母数字字符替换为下划线
    .replace(/_{2,}/g, '_') // 将多个连续下划线替换为单个下划线
    .replace(/^_+|_+$/g, '') // 移除开头和结尾的下划线

  // 如果清理后的名称太短或为空，使用后备方案
  if (cleanedName.length < minLength) {
    const hash = crypto.createHash('md5').update(fileName).digest('hex')
    return `${fallbackPrefix}_${hash.substring(0, 8)}`
  }

  // 如果清理后的名称太长，截断并添加哈希后缀以避免冲突
  if (cleanedName.length > maxLength) {
    const hash = crypto.createHash('md5').update(fileName).digest('hex')
    const truncateLength = maxLength - 9 // 为哈希和下划线预留空间
    return `${cleanedName.substring(0, truncateLength)}_${hash.substring(0, 8)}`
  }

  return cleanedName
}

/**
 * 生成安全的照片ID
 * @param s3key 存储键
 * @returns 安全的照片ID
 */
export const generateSafePhotoId = (s3key: string): string => {
  const baseName = path.basename(s3key, path.extname(s3key))
  return sanitizeFileName(baseName, {
    maxLength: 32,
    fallbackPrefix: 'photo',
    minLength: 3,
  })
}

/**
 * 生成安全的文件键
 * @param s3key 原始存储键
 * @param newExtension 新的文件扩展名（包含点号，如 '.jpeg'）
 * @returns 安全的文件键
 */
export const generateSafeFileKey = (
  s3key: string,
  newExtension: string,
): string => {
  const baseName = path.basename(s3key, path.extname(s3key))
  const dirName = path.dirname(s3key)
  const safeName = sanitizeFileName(baseName, {
    maxLength: 100,
    fallbackPrefix: 'file',
    minLength: 1,
  })

  // 如果原路径有目录结构，保持目录结构
  if (dirName === '.' || dirName === '') {
    return `${safeName}${newExtension}`
  }

  return `${dirName}/${safeName}${newExtension}`
}
