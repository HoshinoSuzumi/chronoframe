/**
 * Pure helpers for converting between:
 *  - exiftool date string  "YYYY:MM:DD HH:MM:SS"
 *  - <input type=datetime-local> wall-clock value "YYYY-MM-DDTHH:mm:ss"
 *  - stored DateTimeOriginal string (as produced by the extractor, luxon ISO:
 *    "YYYY-MM-DDTHH:mm:ss+02:00", "YYYY-MM-DDTHH:mm:ss" or "...Z")
 *  - UTC offset string      "+02:00" / "-05:30"
 */

const EXIF_DATE_RE = /^(\d{4}):(\d{2}):(\d{2}) (\d{2}):(\d{2}):(\d{2})$/
const UTC_OFFSET_RE = /^([+-])(\d{2}):(\d{2})$/
const WALL_CLOCK_RE = /^(\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2})/

/** True for "+HH:MM" with a real-world range (-12:00 .. +14:00). */
export const isValidUtcOffset = (offset: string): boolean => {
  const m = UTC_OFFSET_RE.exec(offset.trim())
  if (!m) return false
  const hours = Number.parseInt(m[2]!, 10)
  const minutes = Number.parseInt(m[3]!, 10)
  if (minutes > 59) return false
  return m[1] === '-' ? hours <= 12 : hours <= 14
}

/** "+02:00" -> 120, "-05:30" -> -330, ""/null/invalid -> 0. */
export const parseUtcOffsetMinutes = (
  offset: string | null | undefined,
): number => {
  const trimmed = (offset ?? '').trim()
  if (!isValidUtcOffset(trimmed)) return 0
  const m = UTC_OFFSET_RE.exec(trimmed)!
  const sign = m[1] === '-' ? -1 : 1
  return sign * (Number.parseInt(m[2]!, 10) * 60 + Number.parseInt(m[3]!, 10))
}

/**
 * True for "YYYY:MM:DD HH:MM:SS" that denotes a real calendar date/time
 * (rejects month 13, Feb 30, hour 25, ...).
 */
export const isValidExifDate = (exifDate: string): boolean => {
  const m = EXIF_DATE_RE.exec(exifDate.trim())
  if (!m) return false
  const [year, month, day, hour, minute, second] = m
    .slice(1)
    .map((part) => Number.parseInt(part!, 10)) as [
    number,
    number,
    number,
    number,
    number,
    number,
  ]
  const probe = new Date(Date.UTC(year, month - 1, day, hour, minute, second))
  return (
    probe.getUTCFullYear() === year &&
    probe.getUTCMonth() === month - 1 &&
    probe.getUTCDate() === day &&
    probe.getUTCHours() === hour &&
    probe.getUTCMinutes() === minute &&
    probe.getUTCSeconds() === second
  )
}

/** "YYYY-MM-DDTHH:mm[:ss]" -> exiftool "YYYY:MM:DD HH:MM:SS". */
export const wallClockToExifDate = (wallClock: string): string => {
  const [datePart, timePartRaw = '00:00:00'] = wallClock.trim().split('T')
  const timePart =
    timePartRaw.length === 5 ? `${timePartRaw}:00` : timePartRaw.slice(0, 8)
  return `${datePart!.replace(/-/g, ':')} ${timePart}`
}

/**
 * Stored DateTimeOriginal + offset -> wall-clock "YYYY-MM-DDTHH:mm:ss" for
 * datetime-local. The wall clock is what the camera recorded, so it is taken
 * lexically from the stored string; only a true UTC instant ("...Z") needs
 * shifting by the photo's offset.
 */
export const storedDateToWallClock = (
  stored: string,
  offset: string | null | undefined,
): string => {
  const trimmed = stored.trim()
  const lexical = WALL_CLOCK_RE.exec(trimmed)
  if (lexical && !/[zZ]$/.test(trimmed)) return lexical[1]!

  const base = new Date(trimmed)
  if (Number.isNaN(base.getTime())) return ''
  const shifted = new Date(
    base.getTime() + parseUtcOffsetMinutes(offset) * 60_000,
  )
  return shifted.toISOString().slice(0, 19)
}
