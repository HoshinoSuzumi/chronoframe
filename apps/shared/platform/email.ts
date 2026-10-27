import type { EmailCodeSender } from '../../../packages/core/src/email-auth'

/** Cloudflare Email Sending structured-message binding; no REST credentials. */
export interface PlatformEmailBinding {
  send(message: {
    from: string
    to: string
    subject: string
    text: string
    html?: string
  }): Promise<{ messageId: string }>
}

export function platformEmailReady(
  binding: unknown,
  from: string,
): binding is PlatformEmailBinding {
  return (
    !!binding &&
    typeof (binding as PlatformEmailBinding).send === 'function' &&
    /^[a-zA-Z0-9.!#$%&'*+/=?^_`{|}~-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}$/.test(from)
  )
}

export function createCloudflareEmailSender(
  binding: PlatformEmailBinding,
  from: string,
): EmailCodeSender {
  return {
    async send({ email, code, expiresInMinutes }) {
      const result = await binding.send({
        from,
        to: email,
        subject: 'Your ChronoFrame sign-in code',
        text: `Your ChronoFrame sign-in code is ${code}. It expires in ${expiresInMinutes} minutes. If you did not request this code, you can ignore this email.`,
      })
      if (!result?.messageId) throw new Error('Email delivery failed')
    },
  }
}
