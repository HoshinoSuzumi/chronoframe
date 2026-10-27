import type { PlatformD1 } from './index.ts'
import { allRows, SubscriptionError } from './subscriptions.ts'
const enc = new TextEncoder()
function fail(code: string, status = 400): never {
  throw new SubscriptionError(status, code)
}
function base64(bytes: Uint8Array) {
  let value = ''
  for (let i = 0; i < bytes.length; i += 8192)
    value += String.fromCharCode(...bytes.subarray(i, i + 8192))
  return btoa(value)
}
const bytes = (value: string) =>
  Uint8Array.from(atob(value), (v) => v.charCodeAt(0))
async function payloadKey(root: string, eventId: string) {
  if (root.length < 32) fail('payment_encryption_unavailable', 503)
  const material = await crypto.subtle.importKey(
    'raw',
    enc.encode(root),
    'HKDF',
    false,
    ['deriveKey'],
  )
  return crypto.subtle.deriveKey(
    {
      name: 'HKDF',
      hash: 'SHA-256',
      salt: enc.encode('chronoframe-payment-payloads-v1'),
      info: enc.encode(eventId),
    },
    material,
    { name: 'AES-GCM', length: 256 },
    false,
    ['encrypt', 'decrypt'],
  )
}
export async function sealPaymentEventPayload(
  root: string,
  eventId: string,
  body: Uint8Array,
) {
  if (body.length > 65536) fail('payment_payload_too_large', 413)
  const nonce = crypto.getRandomValues(new Uint8Array(12))
  const ciphertext = await crypto.subtle.encrypt(
    { name: 'AES-GCM', iv: nonce, additionalData: enc.encode(eventId) },
    await payloadKey(root, eventId),
    Uint8Array.from(body),
  )
  return JSON.stringify([base64(nonce), base64(new Uint8Array(ciphertext))])
}
export async function paymentEventPayload(
  db: PlatformD1,
  root: string,
  eventId: string,
  now = Date.now(),
) {
  if (!/^[a-zA-Z0-9_-]{1,512}$/.test(eventId)) fail('payment_event_invalid')
  const row = await db
    .prepare(
      'SELECT p.ciphertext,p.received_at FROM platform_payment_event_payloads p CROSS JOIN platform_payment_settings s WHERE p.event_id=? AND s.id=1 AND p.received_at>=? - s.payload_retention_days*86400000',
    )
    .bind(eventId, now)
    .first<any>()
  if (!row) return { available: false, payload: null }
  try {
    const [nonce, ciphertext] = JSON.parse(row.ciphertext)
    const plain = await crypto.subtle.decrypt(
      {
        name: 'AES-GCM',
        iv: bytes(nonce),
        additionalData: enc.encode(eventId),
      },
      await payloadKey(root, eventId),
      bytes(ciphertext),
    )
    return {
      available: true,
      receivedAt: row.received_at,
      payload: JSON.parse(new TextDecoder().decode(plain)),
    }
  } catch {
    return fail('payment_payload_unavailable', 503)
  }
}
export async function paymentEventPage(db: PlatformD1, cursor?: string) {
  let at = Number.MAX_SAFE_INTEGER,
    id = '~'
  if (cursor && cursor.length > 1024) fail('payment_cursor_invalid')
  if (cursor) {
    try {
      const value = JSON.parse(atob(cursor))
      if (
        !Number.isSafeInteger(value.at) ||
        value.at < 1 ||
        typeof value.id !== 'string' ||
        !/^[a-zA-Z0-9_-]{1,512}$/.test(value.id)
      )
        throw 0
      at = value.at
      id = value.id
    } catch {
      return fail('payment_cursor_invalid')
    }
  }
  const rows = await allRows<any>(
    db
      .prepare(
        'SELECT id,type,state,attempts,error,available_at,created_at FROM platform_payment_events WHERE created_at<? OR (created_at=? AND id<?) ORDER BY created_at DESC,id DESC LIMIT 26',
      )
      .bind(at, at, id),
  )
  const events = rows.slice(0, 25),
    last = events[events.length - 1]
  return {
    events,
    nextCursor:
      rows.length > 25
        ? btoa(JSON.stringify({ at: last.created_at, id: last.id }))
        : null,
  }
}
export async function expirePaymentEventPayloads(
  db: PlatformD1,
  now = Date.now(),
) {
  const settings = await db
    .prepare(
      'SELECT payload_retention_days FROM platform_payment_settings WHERE id=1',
    )
    .first<any>()
  await db
    .prepare('DELETE FROM platform_payment_event_payloads WHERE received_at<?')
    .bind(now - Number(settings?.payload_retention_days ?? 30) * 86400000)
    .run()
}
