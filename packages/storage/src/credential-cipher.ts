export interface CloudStorageSecret {
  accessKeyId: string
  secretAccessKey: string
}
const encoder = new TextEncoder()
function encode(value: Uint8Array) {
  return btoa(String.fromCharCode(...value))
}
function decode(value: string) {
  return Uint8Array.from(atob(value), (c) => c.charCodeAt(0))
}
/** AES-GCM authenticates tenant, connection and immutable credential revision.
 * HKDF separates the encryption key from platform session/authentication keys.
 */
export async function createStorageCipher(secret: string) {
  if (secret.length < 32) throw new Error('Storage encryption unavailable')
  const material = await crypto.subtle.importKey(
    'raw',
    encoder.encode(secret),
    'HKDF',
    false,
    ['deriveKey'],
  )
  const key = await crypto.subtle.deriveKey(
    {
      name: 'HKDF',
      hash: 'SHA-256',
      salt: encoder.encode('chronoframe-storage-v1'),
      info: encoder.encode('credential-encryption'),
    },
    material,
    { name: 'AES-GCM', length: 256 },
    false,
    ['encrypt', 'decrypt'],
  )
  return {
    async seal(value: CloudStorageSecret, context: string) {
      const nonce = crypto.getRandomValues(new Uint8Array(12))
      const cipher = await crypto.subtle.encrypt(
        { name: 'AES-GCM', iv: nonce, additionalData: encoder.encode(context) },
        key,
        encoder.encode(JSON.stringify(value)),
      )
      return 'v1.' + encode(nonce) + '.' + encode(new Uint8Array(cipher))
    },
    async open(envelope: string, context: string): Promise<CloudStorageSecret> {
      const [version, iv, body, ...extra] = envelope.split('.')
      if (
        version !== 'v1' ||
        !iv ||
        !body ||
        extra.length ||
        envelope.length > 4096
      )
        throw new Error('Invalid credential envelope')
      const plain = await crypto.subtle.decrypt(
        {
          name: 'AES-GCM',
          iv: decode(iv),
          additionalData: encoder.encode(context),
        },
        key,
        decode(body),
      )
      return JSON.parse(new TextDecoder().decode(plain))
    },
  }
}
