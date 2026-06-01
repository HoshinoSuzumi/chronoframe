/**
 * Pure helpers for converting between:
 *  - exiftool date string  "YYYY:MM:DD HH:MM:SS"
 *  - <input type=datetime-local> wall-clock value "YYYY-MM-DDTHH:mm:ss"
 *  - ISO instant string     "YYYY-MM-DDTHH:mm:ss.sssZ"
 *  - UTC offset string      "+02:00" / "-05:30"
 */

/** "+02:00" -> 120, "-05:30" -> -330, ""/null/invalid -> 0. */
export const parseUtcOffsetMinutes = (
  offset: string | null | undefined,
): number => {
  const m = /^([+-])(\d{2}):(\d{2})$/.exec((offset ?? '').trim())
  if (!m) return 0
  const sign = m[1] === '-' ? -1 : 1
  return sign * (Number.parseInt(m[2], 10) * 60 + Number.parseInt(m[3], 10))
}

/** "YYYY-MM-DDTHH:mm[:ss]" -> exiftool "YYYY:MM:DD HH:MM:SS". */
export const wallClockToExifDate = (wallClock: string): string => {
  const [datePart, timePartRaw = '00:00:00'] = wallClock.trim().split('T')
  const timePart =
    timePartRaw.length === 5 ? `${timePartRaw}:00` : timePartRaw.slice(0, 8)
  return `${datePart.replace(/-/g, ':')} ${timePart}`
}

/** exiftool "YYYY:MM:DD HH:MM:SS" + offset -> ISO instant string. */
export const exifDateAndOffsetToIsoInstant = (
  exifDate: string,
  offset: string | null | undefined,
): string => {
  const [datePart, timePart = '00:00:00'] = exifDate.trim().split(' ')
  const isoLocal = `${datePart.replace(/:/g, '-')}T${timePart}`
  const zone = /^[+-]\d{2}:\d{2}$/.test((offset ?? '').trim())
    ? (offset as string).trim()
    : 'Z'
  const instant = new Date(`${isoLocal}${zone}`)
  if (Number.isNaN(instant.getTime())) return ''
  return instant.toISOString()
}

/** ISO instant + offset -> wall-clock "YYYY-MM-DDTHH:mm:ss" for datetime-local. */
export const isoInstantToWallClock = (
  iso: string,
  offset: string | null | undefined,
): string => {
  const base = new Date(iso)
  if (Number.isNaN(base.getTime())) return ''
  const shifted = new Date(
    base.getTime() + parseUtcOffsetMinutes(offset) * 60_000,
  )
  return shifted.toISOString().slice(0, 19)
}
