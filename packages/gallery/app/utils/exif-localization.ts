import type localeFile from '#gallery-i18n/locales/en.json'

export type ExifCategory = keyof typeof localeFile.exif.values

export function toCamelCaseKey(label: string): string {
  return (
    label
      // 去掉非字母数字的符号（保留空格用于分词）
      .replace(/[^a-zA-Z0-9 ]+/g, ' ')
      // 分割单词
      .trim()
      .split(/\s+/)
      // 转换为 camelCase
      .map((word, index) => {
        const lower = word.toLowerCase()
        return index === 0
          ? lower
          : lower.charAt(0).toUpperCase() + lower.slice(1)
      })
      .join('')
  )
}

/**
 * 本地化 EXIF 字段值
 * @param category EXIF 字段名
 * @param value 原始值
 * @param $t 翻译函数
 * @returns 本地化后的值或原始值
 */
export function translateExifValue(
  category: ExifCategory,
  value: string | number | undefined,
  $t: (key: string) => string,
): string {
  if (!value) return ''

  const stringValue = String(value)
  const camelCaseKey = toCamelCaseKey(stringValue)
  const translationKey = `exif.values.${category}.${camelCaseKey}`

  return $t(translationKey)
}
