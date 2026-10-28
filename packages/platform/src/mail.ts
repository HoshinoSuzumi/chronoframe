import type { PlatformD1 } from './index.ts'
export const MAIL_KINDS = [
  'verification',
  'password-reset',
  'second-factor',
  'deletion-warning',
  'account-deleted',
] as const
export type MailKind = (typeof MAIL_KINDS)[number]
export type MailTemplate = {
  senderName: string
  from: string
  subject: string
  heading: string
  body: string
  button: string
  footer: string
  accent: string
}
const content: Record<MailKind, [string, string, string, string]> = {
  verification: [
    'Your ChronoFrame Cloud verification code',
    'Your verification code',
    'Your code to {{purpose}} is {{code}}. It expires in {{minutes}} minutes. Never share this code.',
    '',
  ],
  'password-reset': [
    'Reset your ChronoFrame Cloud password',
    'Set a new password',
    'Use the button below to set a new password. This link expires in {{minutes}} minutes and can only be used once. If you did not request it, ignore this email.',
    'Reset password',
  ],
  'second-factor': [
    'Complete your ChronoFrame Cloud sign-in',
    'Confirm it is you',
    'Your second-step verification code is {{code}}. It expires in {{minutes}} minutes. Never share this code.',
    '',
  ],
  'deletion-warning': [
    'Your ChronoFrame Cloud account is scheduled for deletion',
    'Keep your account',
    '{{reason}} Your account will be marked as deleted and sign-in disabled on {{deletionAt}}. Permanent cleanup of all owned workspaces, sites, domains and files will begin on {{purgeAt}}. {{action}} Contact support@chronoframe.art if you need help.',
    'Open ChronoFrame Cloud',
  ],
  'account-deleted': [
    'Your ChronoFrame Cloud account has been deleted',
    'Your account has been marked as deleted',
    '{{reason}} Sign-in is now disabled. After the {{retentionDays}}-day recovery period, permanent cleanup of all owned workspaces, sites, domains and files will begin on {{purgeAt}}. Until then, contact support@chronoframe.art to request restoration.',
    'Contact support',
  ],
}
export function defaultMailTemplate(
  kind: MailKind,
  fallback?: string,
): MailTemplate {
  const c = content[kind]
  return {
    senderName: 'ChronoFrame Cloud',
    from:
      fallback ||
      `${kind === 'verification' || kind === 'second-factor' ? 'verify' : kind === 'password-reset' ? 'security' : 'accounts'}@noreply.chronoframe.art`,
    subject: c[0],
    heading: c[1],
    body: c[2],
    button: c[3],
    footer:
      'ChronoFrame Cloud · Your photography. Your perspective.\nNeed help? support@chronoframe.art',
    accent: '#354d38',
  }
}
const placeholders = new Set([
  'name',
  'code',
  'purpose',
  'minutes',
  'deletionAt',
  'purgeAt',
  'reason',
  'action',
  'retentionDays',
])
export function validateMailTemplate(value: unknown): MailTemplate {
  const t = value as MailTemplate
  if (!t || typeof t !== 'object') throw new Error('Invalid mail template')
  for (const [k, max] of [
    ['senderName', 80],
    ['from', 254],
    ['subject', 200],
    ['heading', 200],
    ['body', 6000],
    ['button', 80],
    ['footer', 1000],
    ['accent', 7],
  ] as const) {
    if (
      typeof t[k] !== 'string' ||
      t[k].length > max ||
      (!t[k].trim() && !['button', 'footer'].includes(k))
    )
      throw new Error('Invalid mail template')
    if (['from', 'senderName', 'subject'].includes(k) && /[\r\n<>]/.test(t[k]))
      throw new Error('Invalid mail header')
    for (const p of t[k].matchAll(/{{\s*([^{}]+?)\s*}}/g))
      if (!placeholders.has(p[1]!)) throw new Error('Unknown template variable')
  }
  if (/[,:;"\\]/.test(t.senderName)) throw new Error('Invalid sender name')
  if (
    !/^[a-zA-Z0-9.!#$%&'*+/=?^_`{|}~-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}$/.test(
      t.from,
    ) ||
    !/^#[0-9a-f]{6}$/i.test(t.accent)
  )
    throw new Error('Invalid mail sender or color')
  return Object.fromEntries(
    Object.keys(defaultMailTemplate('verification')).map((k) => [
      k,
      t[k as keyof MailTemplate],
    ]),
  ) as MailTemplate
}
export function validateMailContent(kind: MailKind, value: unknown) {
  const t = validateMailTemplate(value)
  const required =
    kind === 'verification' || kind === 'second-factor'
      ? ['code', 'minutes']
      : kind === 'deletion-warning'
        ? ['reason', 'deletionAt', 'purgeAt', 'action']
        : kind === 'account-deleted'
          ? ['reason', 'purgeAt', 'retentionDays']
          : []
  for (const name of required)
    if (!new RegExp('\\{\\{\\s*' + name + '\\s*\\}\\}').test(t.body))
      throw new Error('Required mail variable missing: ' + name)
  if (kind === 'password-reset' && !t.button.trim())
    throw new Error('Password reset button required')
  if (kind === 'account-deleted' && !t.body.includes('support@chronoframe.art'))
    throw new Error('Recovery contact required')
  return t
}
export async function mailTemplate(
  db: PlatformD1,
  kind: MailKind,
  fallback?: string,
) {
  const row = await db
    .prepare(
      'SELECT config_json,revision FROM platform_mail_templates WHERE kind=?',
    )
    .bind(kind)
    .first<{ config_json: string; revision: number }>()
  return {
    template: row
      ? validateMailContent(kind, JSON.parse(row.config_json))
      : defaultMailTemplate(kind, fallback),
    revision: row?.revision ?? 0,
  }
}
const escape = (s: string) =>
  s.replace(
    /[&<>"']/g,
    (c) =>
      ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[
        c
      ]!,
  )
export function renderMail(
  template: MailTemplate,
  variables: Record<string, string>,
  url?: string,
  allowLocalLinks = false,
) {
  const t = validateMailTemplate(template),
    fill = (s: string) =>
      s.replace(/{{\s*([^{}]+?)\s*}}/g, (_, k) => variables[k] ?? '')
  const localLink =
    url &&
    allowLocalLinks &&
    (() => {
      try {
        const parsed = new URL(url)
        return (
          parsed.protocol === 'http:' &&
          parsed.hostname === 'localhost' &&
          !parsed.username &&
          !parsed.password
        )
      } catch {
        return false
      }
    })()
  if (
    url &&
    !localLink &&
    !/^(https:\/\/|mailto:support@chronoframe\.art$)/.test(url)
  )
    throw new Error('Unsafe mail link')
  const subject = fill(t.subject).replace(/[\r\n]/g, ' '),
    heading = fill(t.heading),
    body = fill(t.body),
    footer = fill(t.footer),
    button = fill(t.button)
  const text = [heading, body, url && button ? `${button}: ${url}` : '', footer]
    .filter(Boolean)
    .join('\n\n')
  const html = `<!doctype html><html><body style="margin:0;background:#f5f5f0;color:#242b24;font:16px/1.65 Arial,sans-serif"><div style="max-width:560px;margin:36px auto;padding:32px;background:#fff;border:1px solid #dedfd5;border-radius:14px"><div style="font-weight:700;font-size:18px;color:${t.accent}">ChronoFrame Cloud</div><h1 style="font-size:26px;line-height:1.3;margin:32px 0 20px">${escape(heading)}</h1><div style="white-space:pre-line">${escape(body)}</div>${url && button ? `<p style="margin:28px 0"><a href="${escape(url)}" style="display:inline-block;padding:12px 20px;background:${t.accent};color:white;text-decoration:none;border-radius:8px">${escape(button)}</a></p>` : ''}<hr style="border:0;border-top:1px solid #e5e5dd;margin:32px 0 20px"><div style="font-size:12px;color:#73796c;white-space:pre-line">${escape(footer)}</div></div></body></html>`
  return { from: `${t.senderName} <${t.from}>`, subject, text, html }
}
export interface MailBinding {
  send(message: {
    from: string
    to: string
    subject: string
    text: string
    html?: string
  }): Promise<{ messageId: string }>
}
export async function sendMail(
  db: PlatformD1,
  binding: MailBinding,
  kind: MailKind,
  to: string,
  variables: Record<string, string>,
  url?: string,
  fallback?: string,
  allowLocalLinks = false,
) {
  if (!binding?.send) throw new Error('Email service unavailable')
  const { template } = await mailTemplate(db, kind, fallback)
  const result = await binding.send({
    ...renderMail(template, variables, url, allowLocalLinks),
    to,
  })
  if (!result?.messageId) throw new Error('Email delivery failed')
  return result
}
