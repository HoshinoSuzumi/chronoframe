import type { PlatformD1 } from './index.ts'
import { allRows, SubscriptionError } from './subscriptions.ts'

const enc = new TextEncoder()
async function providerKey(secret: string) {
  if (secret.length < 32)
    throw new SubscriptionError(503, 'payment_encryption_unavailable')
  const material = await crypto.subtle.importKey(
    'raw',
    enc.encode(secret),
    'HKDF',
    false,
    ['deriveKey'],
  )
  return crypto.subtle.deriveKey(
    {
      name: 'HKDF',
      hash: 'SHA-256',
      salt: enc.encode('chronoframe-payments-v1'),
      info: enc.encode('provider-credentials-v1'),
    },
    material,
    { name: 'AES-GCM', length: 256 },
    false,
    ['encrypt', 'decrypt'],
  )
}
export async function sealProviderCredentials(
  secret: string,
  id: string,
  environment: string,
  credentials: Record<string, string>,
) {
  const nonce = crypto.getRandomValues(new Uint8Array(12))
  const body = await crypto.subtle.encrypt(
    {
      name: 'AES-GCM',
      iv: nonce,
      additionalData: enc.encode(`${id}:${environment}`),
    },
    await providerKey(secret),
    enc.encode(JSON.stringify(credentials)),
  )
  return JSON.stringify([
    btoa(String.fromCharCode(...nonce)),
    btoa(String.fromCharCode(...new Uint8Array(body))),
  ])
}
export async function openProviderCredentials(
  secret: string,
  id: string,
  environment: string,
  envelope: string,
) {
  const [nonce, body] = JSON.parse(envelope)
  const plain = await crypto.subtle.decrypt(
    {
      name: 'AES-GCM',
      iv: Uint8Array.from(atob(nonce), (c) => c.charCodeAt(0)),
      additionalData: enc.encode(`${id}:${environment}`),
    },
    await providerKey(secret),
    Uint8Array.from(atob(body), (c) => c.charCodeAt(0)),
  )
  return JSON.parse(new TextDecoder().decode(plain)) as Record<string, string>
}
export async function paymentProviders(db: PlatformD1) {
  const rows = await allRows<any>(
    db.prepare(
      'SELECT id,name,provider,environment,revision,credentials_ciphertext IS NOT NULL AS configured FROM platform_payment_providers ORDER BY id',
    ),
  )
  return rows.map((row) => ({
    ...row,
    configured: !!row.configured,
    available: row.provider === 'dodo' && !!row.configured,
    status:
      row.id === 'creem'
        ? 'retired'
        : row.provider === 'dodo'
          ? row.configured
            ? 'ready'
            : 'not_configured'
          : 'not_integrated',
  }))
}
/** Configurations can be prepared before an adapter exists. No unknown provider may execute payments. */
export async function savePaymentProvider(
  db: PlatformD1,
  secret: string,
  actorId: number,
  input: any,
) {
  if (
    !input ||
    typeof input.id !== 'string' ||
    !/^[a-z][a-z0-9_-]{0,63}$/.test(input.id) ||
    typeof input.name !== 'string' ||
    !input.name.trim() ||
    input.name.length > 100 ||
    !['test', 'live'].includes(input.environment) ||
    !Number.isSafeInteger(input.revision) ||
    input.revision < 0 ||
    typeof input.reason !== 'string' ||
    input.reason.trim().length < 5 ||
    input.reason.length > 500
  )
    throw new SubscriptionError(400, 'payment_provider_invalid')
  if (input.id === 'creem')
    throw new SubscriptionError(410, 'payment_provider_retired')
  if (
    input.provider !== undefined &&
    !['dodo', 'custom'].includes(input.provider)
  )
    throw new SubscriptionError(400, 'payment_provider_invalid')
  const prior = await db
    .prepare('SELECT * FROM platform_payment_providers WHERE id=?')
    .bind(input.id)
    .first<any>()
  if ((prior?.revision ?? 0) !== input.revision)
    throw new SubscriptionError(409, 'payment_revision_conflict')
  const provider = input.provider ?? prior?.provider ?? 'custom'
  if (prior && provider !== prior.provider)
    throw new SubscriptionError(400, 'payment_provider_invalid')
  if (
    prior?.credentials_ciphertext &&
    prior.environment !== input.environment &&
    provider === 'dodo'
  )
    throw new SubscriptionError(400, 'payment_environment_invalid')
  let envelope = prior?.credentials_ciphertext ?? null
  if (input.credentials !== undefined) {
    if (
      !input.credentials ||
      Array.isArray(input.credentials) ||
      typeof input.credentials !== 'object' ||
      Object.keys(input.credentials).length > 30 ||
      Object.entries(input.credentials).some(
        ([k, v]) =>
          !/^[a-zA-Z][a-zA-Z0-9_]{0,63}$/.test(k) ||
          typeof v !== 'string' ||
          v.length > 4096,
      ) ||
      JSON.stringify(input.credentials).length > 12000
    )
      throw new SubscriptionError(400, 'payment_credentials_invalid')
    let credentials = input.credentials
    if (provider === 'dodo') {
      const saved = envelope
        ? await openProviderCredentials(
            secret,
            input.id,
            input.environment,
            envelope,
          )
        : {}
      credentials = {
        ...saved,
        ...Object.fromEntries(
          Object.entries(input.credentials).filter(
            ([, value]) => typeof value === 'string' && value.trim(),
          ),
        ),
      }
      if (
        Object.keys(credentials).some(
          (key) => !['apiKey', 'webhookSecret'].includes(key),
        ) ||
        typeof credentials.apiKey !== 'string' ||
        !credentials.apiKey.trim() ||
        typeof credentials.webhookSecret !== 'string' ||
        !/^whsec_[A-Za-z0-9+/=_-]{16,}$/.test(credentials.webhookSecret)
      )
        throw new SubscriptionError(400, 'payment_credentials_invalid')
    }
    envelope = await sealProviderCredentials(
      secret,
      input.id,
      input.environment,
      credentials,
    )
  } else if (prior && prior.environment !== input.environment && envelope) {
    // Preserve credentials while rebinding the authenticated environment context.
    envelope = await sealProviderCredentials(
      secret,
      input.id,
      input.environment,
      await openProviderCredentials(
        secret,
        input.id,
        prior.environment,
        envelope,
      ),
    )
  }
  const auditId = crypto.randomUUID(),
    now = Date.now()
  const results = await db.batch([
    db
      .prepare(
        "INSERT INTO platform_admin_audit(id,actor_id,action,target,reason,after_json,created_at) SELECT ?,?,'payment-provider',?,?,?,? WHERE COALESCE((SELECT revision FROM platform_payment_providers WHERE id=?),0)=?",
      )
      .bind(
        auditId,
        actorId,
        input.id,
        input.reason.trim(),
        JSON.stringify({
          name: input.name.trim(),
          provider,
          environment: input.environment,
          configured: !!envelope,
        }),
        now,
        input.id,
        input.revision,
      ),
    db
      .prepare(
        'INSERT INTO platform_payment_providers(id,name,environment,credentials_ciphertext,updated_at,provider) SELECT ?,?,?,?,?,? WHERE EXISTS(SELECT 1 FROM platform_admin_audit WHERE id=?) ON CONFLICT(id) DO UPDATE SET name=excluded.name,environment=excluded.environment,credentials_ciphertext=excluded.credentials_ciphertext,updated_at=excluded.updated_at,revision=platform_payment_providers.revision+1',
      )
      .bind(
        input.id,
        input.name.trim(),
        input.environment,
        envelope,
        now,
        provider,
        auditId,
      ),
  ])
  if (!results[0]?.meta.changes)
    throw new SubscriptionError(409, 'payment_revision_conflict')
  return { ok: true }
}
export async function selectPaymentProvider(
  db: PlatformD1,
  actorId: number,
  input: any,
) {
  if (
    !input ||
    !Number.isSafeInteger(input.revision) ||
    typeof input.reason !== 'string' ||
    input.reason.trim().length < 5 ||
    input.reason.length > 500 ||
    (input.id !== null &&
      (typeof input.id !== 'string' ||
        !/^[a-z][a-z0-9_-]{0,63}$/.test(input.id)))
  )
    throw new SubscriptionError(400, 'payment_provider_invalid')
  if (
    input.id !== null &&
    !(await db
      .prepare('SELECT id FROM platform_payment_providers WHERE id=?')
      .bind(input.id)
      .first())
  )
    throw new SubscriptionError(400, 'payment_provider_invalid')
  const id = crypto.randomUUID(),
    now = Date.now()
  const results = await db.batch([
    db
      .prepare(
        "INSERT INTO platform_admin_audit(id,actor_id,action,target,reason,after_json,created_at) SELECT ?,?,'payment-provider-select','platform',?,?,? WHERE EXISTS(SELECT 1 FROM platform_payment_settings WHERE id=1 AND revision=?)",
      )
      .bind(
        id,
        actorId,
        input.reason.trim(),
        JSON.stringify({ currentProvider: input.id }),
        now,
        input.revision,
      ),
    db
      .prepare(
        'UPDATE platform_payment_settings SET current_provider=?,revision=revision+1,updated_at=? WHERE id=1 AND revision=? AND EXISTS(SELECT 1 FROM platform_admin_audit WHERE id=?)',
      )
      .bind(input.id, now, input.revision, id),
  ])
  if (!results[0]?.meta.changes)
    throw new SubscriptionError(409, 'payment_revision_conflict')
  return { ok: true }
}
