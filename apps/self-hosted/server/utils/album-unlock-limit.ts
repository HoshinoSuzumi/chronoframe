import { isIP } from 'node:net'
import { createError } from 'h3'

const UNLOCK_WINDOW_MS = 60_000
const UNLOCK_CLIENT_MAX_ATTEMPTS = 8
const UNLOCK_ALBUM_MAX_ATTEMPTS = 32
const UNLOCK_MAX_CLIENT_ENTRIES = 5_000

type AttemptWindow = { count: number; resetAt: number }
type WindowState = 'new' | 'open' | 'blocked'

const clientAttempts = new Map<string, AttemptWindow>()
const albumAttempts = new Map<number, AttemptWindow>()

export function albumUnlockClientKey(ip: string): string {
  const trimmed = ip.trim()
  if (!trimmed || trimmed.toLowerCase() === 'unknown') return 'unknown'

  let normalized = trimmed.toLowerCase()
  if (normalized.startsWith('[') && normalized.includes(']')) {
    normalized = normalized.slice(1, normalized.indexOf(']'))
  }
  const zoneAt = normalized.indexOf('%')
  if (zoneAt !== -1) normalized = normalized.slice(0, zoneAt)
  if (!normalized) return 'unknown'

  const groups = expandIpv6(normalized)
  if (groups && isIpv4Mapped(groups)) {
    return `4:${formatIpv4(groups[6] ?? 0, groups[7] ?? 0)}`
  }
  if (isIP(normalized) === 4) return `4:${normalized}`
  if (groups) return `6:${formatPrefix64(groups)}`
  return `u:${normalized}`
}

function isIpv4Mapped(groups: number[]): boolean {
  return (
    groups[0] === 0 &&
    groups[1] === 0 &&
    groups[2] === 0 &&
    groups[3] === 0 &&
    groups[4] === 0 &&
    groups[5] === 0xffff
  )
}

function formatIpv4(hi: number, lo: number): string {
  return `${(hi >> 8) & 0xff}.${hi & 0xff}.${(lo >> 8) & 0xff}.${lo & 0xff}`
}

function formatPrefix64(groups: number[]): string {
  return `${groups
    .slice(0, 4)
    .map((group) => group.toString(16))
    .join(':')}::`
}

function expandIpv6(address: string): number[] | null {
  const pure = address.includes('.') ? embedIpv4(address) : address
  if (!pure || isIP(pure) !== 6) return null
  return expandGroups(pure, 8)
}

function embedIpv4(address: string): string | null {
  const lastColon = address.lastIndexOf(':')
  if (lastColon === -1) return null
  const v4 = address.slice(lastColon + 1)
  if (isIP(v4) !== 4) return null
  const octets = v4.split('.').map((part) => Number(part))
  if (
    octets.length !== 4 ||
    octets.some((octet) => !Number.isInteger(octet) || octet < 0 || octet > 255)
  ) {
    return null
  }
  const hi = ((octets[0] ?? 0) << 8) | (octets[1] ?? 0)
  const lo = ((octets[2] ?? 0) << 8) | (octets[3] ?? 0)
  return `${address.slice(0, lastColon)}:${hi.toString(16)}:${lo.toString(16)}`
}

function expandGroups(address: string, expected: number): number[] | null {
  const pieces = address.split('::')
  if (pieces.length > 2) return null
  const parseSide = (side: string): number[] | null => {
    if (!side) return []
    const parts = side.split(':')
    if (parts.some((part) => !/^[0-9a-f]{1,4}$/.test(part))) return null
    return parts.map((part) => Number.parseInt(part, 16))
  }
  const left = parseSide(pieces[0] ?? '')
  if (!left) return null
  if (pieces.length === 1) return left.length === expected ? left : null
  const right = parseSide(pieces[1] ?? '')
  if (!right) return null
  const missing = expected - left.length - right.length
  if (missing < 1) return null
  return [...left, ...Array<number>(missing).fill(0), ...right]
}

function pruneWindows<K>(map: Map<K, AttemptWindow>, now: number) {
  for (const [key, attempt] of map) {
    if (attempt.resetAt <= now) map.delete(key)
  }
}

function windowState(
  attempt: AttemptWindow | undefined,
  now: number,
  max: number,
): WindowState {
  if (!attempt || attempt.resetAt <= now) return 'new'
  if (attempt.count >= max) return 'blocked'
  return 'open'
}

function rejectUnlockAttempt(): never {
  throw createError({
    statusCode: 429,
    statusMessage: 'Too many unlock attempts',
  })
}

function commitClient(
  key: string,
  state: Exclude<WindowState, 'blocked'>,
  now: number,
) {
  if (state === 'new') {
    if (
      clientAttempts.size >= UNLOCK_MAX_CLIENT_ENTRIES &&
      !clientAttempts.has(key)
    ) {
      const oldest = clientAttempts.keys().next().value
      if (oldest !== undefined) clientAttempts.delete(oldest)
    }
    clientAttempts.set(key, { count: 1, resetAt: now + UNLOCK_WINDOW_MS })
    return
  }
  const attempt = clientAttempts.get(key)
  if (attempt) attempt.count += 1
}

function commitAlbum(
  albumId: number,
  state: Exclude<WindowState, 'blocked'>,
  now: number,
) {
  if (state === 'new') {
    albumAttempts.set(albumId, { count: 1, resetAt: now + UNLOCK_WINDOW_MS })
    return
  }
  const attempt = albumAttempts.get(albumId)
  if (attempt) attempt.count += 1
}

export function assertAlbumUnlockRateLimit(
  albumId: number,
  ip: string,
  now = Date.now(),
) {
  pruneWindows(clientAttempts, now)
  pruneWindows(albumAttempts, now)
  const clientKey = `${albumId}:${albumUnlockClientKey(ip)}`
  const client = windowState(
    clientAttempts.get(clientKey),
    now,
    UNLOCK_CLIENT_MAX_ATTEMPTS,
  )
  if (client === 'blocked') rejectUnlockAttempt()
  const album = windowState(
    albumAttempts.get(albumId),
    now,
    UNLOCK_ALBUM_MAX_ATTEMPTS,
  )
  if (album === 'blocked') rejectUnlockAttempt()
  commitClient(clientKey, client, now)
  commitAlbum(albumId, album, now)
}

export function clearAlbumUnlockClient(albumId: number, ip: string) {
  clientAttempts.delete(`${albumId}:${albumUnlockClientKey(ip)}`)
}
