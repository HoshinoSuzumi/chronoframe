export type CloudLocale = 'en' | 'zh-Hans'

/** Negotiate supported languages in browser preference order, ignoring disabled ranges. */
export function resolveCloudLocale(acceptLanguage: string): CloudLocale {
  const preferences = acceptLanguage
    .split(',')
    .map((part, index) => {
      const [range = '', ...parameters] = part.trim().split(';')
      const quality = parameters.find((value) =>
        value.trim().toLowerCase().startsWith('q='),
      )
      const weight = quality === undefined ? 1 : Number(quality.trim().slice(2))
      return { range: range.toLowerCase(), weight, index }
    })
    .filter(
      ({ weight }) => Number.isFinite(weight) && weight > 0 && weight <= 1,
    )
    .sort((a, b) => b.weight - a.weight || a.index - b.index)
  for (const { range } of preferences) {
    if (/^zh(?:-|$)/.test(range)) return 'zh-Hans'
    if (/^en(?:-|$)/.test(range)) return 'en'
  }
  return 'en'
}
