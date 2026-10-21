import { translateExifValue } from '#gallery/utils/exif-localization'

/**
 * EXIF 本地化的 Composable
 * 提供在组件中使用的便捷方法
 */
export function useExifLocalization() {
  const { $i18n } = useNuxtApp()

  /**
   * 本地化 EXIF 字段值
   * @param category EXIF 字段名
   * @param value 原始值
   * @returns 本地化后的值
   */
  const localizeExif = (
    category: ExifCategory,
    value: string | number | undefined,
  ): string => {
    return translateExifValue(category, value, $i18n.t)
  }

  return {
    localizeExif,
  }
}
